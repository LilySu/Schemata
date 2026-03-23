import { z } from "zod";

import { getModel } from "~/server/generate/model-config";
import {
  parseJsonlLine,
  processNodePaths,
  stripJsonCodeFences,
  toTaggedMessage,
} from "~/server/generate/format";
import type { MetaLine } from "~/server/generate/format";
import {
  getFileContent,
  getGithubData,
  getScopedFileTree,
} from "~/server/generate/github";
import { streamCompletion } from "~/server/generate/llm";
import {
  SYSTEM_DRILLDOWN_CONCEPTUAL_PROMPT,
  SYSTEM_DRILLDOWN_DIAGRAM_PROMPT,
  SYSTEM_DRILLDOWN_FILE_PROMPT,
} from "~/server/generate/prompts";
import { getCachedSubDiagram, cacheSubDiagram } from "~/app/_actions/cache";
import type { GraphData } from "~/features/diagram/graph-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const prefetchRequestSchema = z.object({
  username: z.string().min(1),
  repo: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1).max(20),
  parent_explanation: z.string().optional(),
  api_key: z.string().min(1).optional(),
  github_pat: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const parsed = prefetchRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Invalid request payload." },
      { status: 400 },
    );
  }

  const { username, repo, paths, parent_explanation, api_key, github_pat } =
    parsed.data;

  // Run in background — return immediately
  const promise = generateSubDiagrams({
    username,
    repo,
    paths,
    parentExplanation: parent_explanation ?? "",
    apiKey: api_key,
    githubPat: github_pat,
  });

  // Don't await — let it run in the background
  // Edge runtime doesn't support waitUntil, so we use a detached promise
  void promise.catch((err) =>
    console.error("[prefetch] background error:", err),
  );

  return Response.json({ ok: true, queued: paths.length });
}

async function generateSubDiagrams({
  username,
  repo,
  paths,
  parentExplanation,
  apiKey,
  githubPat,
}: {
  username: string;
  repo: string;
  paths: string[];
  parentExplanation: string;
  apiKey?: string;
  githubPat?: string;
}) {
  const githubData = await getGithubData(username, repo, githubPat);
  const model = getModel();

  for (const scopePath of paths) {
    try {
      // Skip if already cached
      const cached = await getCachedSubDiagram(username, repo, scopePath);
      if (cached) continue;

      const result = await generateSingleSubDiagram({
        username,
        repo,
        scopePath,
        parentExplanation,
        apiKey,
        githubPat,
        model,
        githubData,
      });

      if (result) {
        await cacheSubDiagram(
          username,
          repo,
          scopePath,
          result.diagram,
          result.explanation,
          result.isLeaf,
        );
      }
    } catch (err) {
      console.error(`[prefetch] failed for ${scopePath}:`, err);
      // Continue with next path
    }
  }
}

async function generateSingleSubDiagram({
  username,
  repo,
  scopePath,
  parentExplanation,
  apiKey,
  githubPat,
  model,
  githubData,
}: {
  username: string;
  repo: string;
  scopePath: string;
  parentExplanation: string;
  apiKey?: string;
  githubPat?: string;
  model: string;
  githubData: { defaultBranch: string; fileTree: string; readme: string };
}): Promise<{
  diagram: string;
  explanation: string;
  isLeaf: boolean;
} | null> {
  const lastSegment = scopePath.split("/").pop() ?? scopePath;
  const isFile = lastSegment.includes(".") && !scopePath.endsWith("/");

  if (isFile) {
    // File-level: 2-stage (explanation + diagram) — kept as-is
    let fileContent = await getFileContent(
      username,
      repo,
      scopePath,
      githubData.defaultBranch,
      githubPat,
    );
    const lines = fileContent.split("\n");
    if (lines.length > 3000) {
      fileContent = lines.slice(0, 3000).join("\n") + "\n... (truncated)";
    }

    let explanationResponse = "";
    for await (const chunk of streamCompletion({
      model,
      systemPrompt: SYSTEM_DRILLDOWN_FILE_PROMPT,
      userPrompt: toTaggedMessage({
        parent_context: parentExplanation,
        scope_path: scopePath,
        file_content: fileContent,
      }),
      apiKey,
      reasoningEffort: "medium",
    })) {
      explanationResponse += chunk;
    }

    let explanation = explanationResponse;
    const expStart = explanationResponse.indexOf("<explanation>");
    const expEnd = explanationResponse.indexOf("</explanation>");
    if (expStart !== -1 && expEnd !== -1) {
      explanation = explanationResponse.slice(expStart, expEnd + "</explanation>".length);
    }

    const graphData: GraphData = { nodes: [], edges: [], groups: [] };
    let lineBuffer = "";

    for await (const chunk of streamCompletion({
      model,
      systemPrompt: SYSTEM_DRILLDOWN_DIAGRAM_PROMPT,
      userPrompt: toTaggedMessage({ explanation }),
      apiKey,
      reasoningEffort: "low",
    })) {
      lineBuffer += chunk;
      let newlineIdx: number;
      while ((newlineIdx = lineBuffer.indexOf("\n")) !== -1) {
        const line = lineBuffer.slice(0, newlineIdx);
        lineBuffer = lineBuffer.slice(newlineIdx + 1);
        const cleaned = stripJsonCodeFences(line);
        const item = parseJsonlLine(cleaned);
        if (item && item.kind !== "meta") {
          if (item.kind === "node") graphData.nodes.push(item);
          else if (item.kind === "edge") graphData.edges.push(item);
          else if (item.kind === "group") graphData.groups!.push(item);
        }
      }
    }
    if (lineBuffer.trim()) {
      const cleaned = stripJsonCodeFences(lineBuffer);
      const item = parseJsonlLine(cleaned);
      if (item && item.kind !== "meta") {
        if (item.kind === "node") graphData.nodes.push(item);
        else if (item.kind === "edge") graphData.edges.push(item);
        else if (item.kind === "group") graphData.groups!.push(item);
      }
    }

    if (graphData.nodes.length === 0) return null;

    const processedGraph = processNodePaths(graphData, username, repo, githubData.defaultBranch, githubData.fileTree, true);
    return { diagram: JSON.stringify(processedGraph), explanation, isLeaf: true };
  } else {
    // Directory: single conceptual LLM call
    const scopedTree = getScopedFileTree(githubData.fileTree, scopePath);
    const scopedLines = scopedTree.split("\n").filter((l) => l.trim());
    if (scopedLines.length < 3) return null;

    const entryPointNames = [
      "index.ts", "index.tsx", "index.js", "main.py", "__init__.py",
      "mod.rs", "lib.rs", "main.go", "main.ts", "app.ts", "app.py",
    ];
    const fileContentsParts: string[] = [];
    for (const line of scopedLines.slice(0, 50)) {
      const filename = line.split("/").pop() ?? line;
      if (entryPointNames.includes(filename) && fileContentsParts.length < 5) {
        try {
          const content = await getFileContent(username, repo, line, githubData.defaultBranch, githubPat);
          fileContentsParts.push(`--- ${line} ---\n${content}`);
        } catch {
          // skip
        }
      }
    }

    const userData: Record<string, string> = {
      parent_context: parentExplanation,
      scope_path: scopePath,
      sub_tree: scopedTree,
    };
    if (fileContentsParts.length > 0) {
      userData.file_contents = fileContentsParts.join("\n\n");
    }

    const graphData: GraphData = { nodes: [], edges: [], groups: [] };
    let lineBuffer = "";
    let isLeaf = false;

    for await (const chunk of streamCompletion({
      model,
      systemPrompt: SYSTEM_DRILLDOWN_CONCEPTUAL_PROMPT,
      userPrompt: toTaggedMessage(userData),
      apiKey,
      reasoningEffort: "medium",
    })) {
      lineBuffer += chunk;
      let newlineIdx: number;
      while ((newlineIdx = lineBuffer.indexOf("\n")) !== -1) {
        const line = lineBuffer.slice(0, newlineIdx);
        lineBuffer = lineBuffer.slice(newlineIdx + 1);
        const cleaned = stripJsonCodeFences(line);
        const item = parseJsonlLine(cleaned);
        if (item) {
          if (item.kind === "meta") {
            if ((item as MetaLine).is_leaf) isLeaf = true;
          } else {
            if (item.kind === "node") graphData.nodes.push(item);
            else if (item.kind === "edge") graphData.edges.push(item);
            else if (item.kind === "group") graphData.groups!.push(item);
          }
        }
      }
    }
    if (lineBuffer.trim()) {
      const cleaned = stripJsonCodeFences(lineBuffer);
      const item = parseJsonlLine(cleaned);
      if (item) {
        if (item.kind === "meta") {
          if ((item as MetaLine).is_leaf) isLeaf = true;
        } else {
          if (item.kind === "node") graphData.nodes.push(item);
          else if (item.kind === "edge") graphData.edges.push(item);
          else if (item.kind === "group") graphData.groups!.push(item);
        }
      }
    }

    if (graphData.nodes.length === 0) return null;

    const processedGraph = processNodePaths(graphData, username, repo, githubData.defaultBranch, githubData.fileTree, true);
    return { diagram: JSON.stringify(processedGraph), explanation: parentExplanation, isLeaf };
  }
}
