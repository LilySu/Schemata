import { useState, useEffect, useCallback } from "react";

import {
  cacheDiagramAndExplanation,
  cacheSubDiagram,
  deleteCachedDiagram,
  getCachedDiagram,
  getCachedSubDiagram,
} from "~/app/_actions/cache";
import { getLastGeneratedDate } from "~/app/_actions/repo";
import { getGenerationCost } from "~/features/diagram/api";
import type { GraphData } from "~/features/diagram/graph-types";
import { type DiagramStreamState } from "~/features/diagram/types";
import { useDiagramStream } from "~/hooks/diagram/useDiagramStream";
import { useDiagramExport } from "~/hooks/diagram/useDiagramExport";
import { useDrillDown } from "~/hooks/diagram/useDrillDown";
import { isExampleRepo } from "~/lib/exampleRepos";

export function useDiagram(username: string, repo: string) {
  const [diagram, setDiagram] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<Date | undefined>();
  const [cost, setCost] = useState<string>("");
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [hasUsedFreeGeneration, setHasUsedFreeGeneration] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      return localStorage.getItem("has_used_free_generation") === "true";
    },
  );

  const drillDown = useDrillDown();

  const onStreamComplete = useCallback(
    async ({
      diagram: nextDiagram,
      explanation,
      isLeaf,
    }: {
      diagram: string;
      explanation: string;
      isLeaf?: boolean;
    }) => {
      console.log("[useDiagram] onStreamComplete called, diagram length:", nextDiagram?.length, "valid JSON:", (() => { try { JSON.parse(nextDiagram); return true; } catch { return false; } })());
      const hasApiKey = !!localStorage.getItem("openai_key");
      await cacheDiagramAndExplanation(
        username,
        repo,
        nextDiagram,
        explanation || "No explanation provided",
        hasApiKey,
      );

      setDiagram(nextDiagram);
      drillDown.reset(nextDiagram, explanation || "");
      const date = await getLastGeneratedDate(username, repo);
      setLastGenerated(date ?? undefined);
      if (!hasUsedFreeGeneration) {
        localStorage.setItem("has_used_free_generation", "true");
        setHasUsedFreeGeneration(true);
      }
      setLoading(false);

      // Background prefetch: pre-generate sub-diagrams for all drill-downable nodes
      prefetchDrillDownPaths(
        username,
        repo,
        nextDiagram,
        explanation || "",
      );
    },
    [drillDown, hasUsedFreeGeneration, repo, username],
  );

  const onStreamError = useCallback((message: string) => {
    setError(message);
    setLoading(false);
    setDrillDownLoading(false);
  }, []);

  const { state, runGeneration } = useDiagramStream({
    username,
    repo,
    onComplete: onStreamComplete,
    onError: onStreamError,
  });

  // Fetch a drill-down diagram on demand (used when prefetch cache miss)
  const fetchDrillDown = useCallback(
    async (
      path: string,
      parentExplanation: string,
    ): Promise<{
      diagram: string;
      explanation: string;
      isLeaf: boolean;
    } | null> => {
      const { parseSSEStreamBuffer } = await import(
        "~/features/diagram/sse"
      );

      const response = await fetch(
        `${getGenerateBasePathForDrillDown()}/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            repo,
            api_key: localStorage.getItem("openai_key") ?? undefined,
            github_pat:
              localStorage.getItem("github_pat") ?? undefined,
            scope_path: path,
            parent_explanation: parentExplanation,
          }),
        },
      );

      if (!response.ok) return null;

      const reader = response.body?.getReader();
      if (!reader) return null;

      let streamBuffer = "";
      let drillDiagram = "";
      let drillExplanation = "";
      let drillIsLeaf = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamBuffer += new TextDecoder().decode(value);
          const { messages, remainder } =
            parseSSEStreamBuffer(streamBuffer);
          streamBuffer = remainder;
          for (const msg of messages) {
            if (msg.status === "complete") {
              drillDiagram = msg.diagram ?? drillDiagram;
              drillExplanation = msg.explanation ?? drillExplanation;
              drillIsLeaf = msg.is_leaf ?? false;
            } else if (msg.status === "error" && msg.error) {
              return null;
            }
          }
        }
        const { messages } = parseSSEStreamBuffer(
          `${streamBuffer}\n\n`,
        );
        for (const msg of messages) {
          if (msg.status === "complete") {
            drillDiagram = msg.diagram ?? drillDiagram;
            drillExplanation = msg.explanation ?? drillExplanation;
            drillIsLeaf = msg.is_leaf ?? false;
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (!drillDiagram) return null;

      await cacheSubDiagram(
        username,
        repo,
        path,
        drillDiagram,
        drillExplanation,
        drillIsLeaf,
      );

      return {
        diagram: drillDiagram,
        explanation: drillExplanation,
        isLeaf: drillIsLeaf,
      };
    },
    [repo, username],
  );

  const handleNodeClick = useCallback(
    async (path: string) => {
      if (drillDownLoading) return;

      setError("");
      setDrillDownLoading(true);

      try {
        // Check cache first (may have been prefetched)
        const cached = await getCachedSubDiagram(username, repo, path);
        if (cached) {
          drillDown.pushLevel(
            path,
            cached.diagram,
            cached.explanation,
            cached.isLeaf,
          );
          setDrillDownLoading(false);
          return;
        }

        const parentExplanation =
          drillDown.currentLevel?.explanation ?? "";
        const result = await fetchDrillDown(path, parentExplanation);

        if (result) {
          drillDown.pushLevel(
            path,
            result.diagram,
            result.explanation,
            result.isLeaf,
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Drill-down generation failed.",
        );
      } finally {
        setDrillDownLoading(false);
      }
    },
    [drillDown, drillDownLoading, fetchDrillDown, repo, username],
  );

  useEffect(() => {
    if (state.status === "error") {
      setLoading(false);
    }
  }, [state.status]);

  const getDiagram = useCallback(async () => {
    console.log("[useDiagram] getDiagram() called for", username, repo);
    setLoading(true);
    setError("");
    setCost("");

    try {
      const cached = await getCachedDiagram(username, repo);
      console.log("[useDiagram] cache check:", cached ? `HIT (${cached.length} chars)` : "MISS");
      const githubPat = localStorage.getItem("github_pat");
      const apiKey = localStorage.getItem("openai_key");

      if (cached) {
        console.log("[useDiagram] using cached diagram");
        setDiagram(cached);
        const date = await getLastGeneratedDate(username, repo);
        setLastGenerated(date ?? undefined);
        setLoading(false);
        return;
      }

      console.log("[useDiagram] fetching cost estimate...");
      const costEstimate = await getGenerationCost(
        username,
        repo,
        githubPat ?? undefined,
        apiKey ?? undefined,
      );
      console.log("[useDiagram] cost result:", JSON.stringify(costEstimate));

      if (costEstimate.error) {
        console.log("[useDiagram] cost error, stopping:", costEstimate.error);
        setError(costEstimate.error);
        setLoading(false);
        return;
      }

      setCost(costEstimate.cost ?? "");
      console.log("[useDiagram] calling runGeneration...");
      await runGeneration(githubPat ?? undefined);
      console.log("[useDiagram] runGeneration returned");
    } catch (err) {
      console.error("[useDiagram] getDiagram caught error:", err);
      setError("Something went wrong. Please try again later.");
      setLoading(false);
    }
  }, [repo, runGeneration, username]);

  const handleRegenerate = useCallback(async () => {
    if (isExampleRepo(username, repo)) {
      return;
    }

    // Clear cached diagram and sub-diagrams before regenerating
    await deleteCachedDiagram(username, repo);
    setDiagram("");
    drillDown.reset("", "");

    setLoading(true);
    setError("");
    setCost("");

    const githubPat = localStorage.getItem("github_pat");
    const apiKey = localStorage.getItem("openai_key");

    try {
      const costEstimate = await getGenerationCost(
        username,
        repo,
        githubPat ?? undefined,
        apiKey ?? undefined,
      );

      if (costEstimate.error) {
        setError(costEstimate.error);
        setLoading(false);
        return;
      }

      setCost(costEstimate.cost ?? "");
      await runGeneration(githubPat ?? undefined);
    } catch {
      setError("Something went wrong. Please try again later.");
      setLoading(false);
    }
  }, [repo, runGeneration, username]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  useEffect(() => {
    void getDiagram();
  }, [username, repo]);

  const currentDiagram = drillDown.currentLevel?.diagram ?? diagram;
  const { handleCopy, handleExportImage } = useDiagramExport(currentDiagram);

  const handleApiKeySubmit = async (apiKey: string) => {
    setShowApiKeyDialog(false);
    setLoading(true);
    setError("");

    localStorage.setItem("openai_key", apiKey);

    const githubPat = localStorage.getItem("github_pat");
    try {
      await runGeneration(githubPat ?? undefined);
    } catch {
      setError("Failed to generate diagram with provided API key.");
      setLoading(false);
    }
  };

  const handleCloseApiKeyDialog = () => {
    setShowApiKeyDialog(false);
  };

  const handleOpenApiKeyDialog = () => {
    setShowApiKeyDialog(true);
  };

  return {
    diagram: currentDiagram,
    error,
    loading,
    drillDownLoading,
    lastGenerated,
    cost,
    handleCopy,
    showApiKeyDialog,
    handleApiKeySubmit,
    handleCloseApiKeyDialog,
    handleOpenApiKeyDialog,
    handleExportImage,
    handleRegenerate,
    handleNodeClick,
    drillDown,
    state: state as DiagramStreamState,
  };
}

/**
 * After a top-level diagram completes, fire a background request to
 * pre-generate sub-diagrams for all drill-downable nodes. This warms
 * the cache so clicks feel instant. Only goes one level deep.
 */
function prefetchDrillDownPaths(
  username: string,
  repo: string,
  diagramJson: string,
  parentExplanation: string,
) {
  try {
    const data = JSON.parse(diagramJson) as GraphData;
    const drillPaths = data.nodes
      .filter((n) => n.clickAction === "drilldown" && n.clickPath)
      .map((n) => n.clickPath!);

    if (drillPaths.length === 0) return;

    const basePath = getGenerateBasePathForDrillDown();
    void fetch(`${basePath}/prefetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        repo,
        paths: drillPaths,
        parent_explanation: parentExplanation,
        api_key: localStorage.getItem("openai_key") ?? undefined,
        github_pat: localStorage.getItem("github_pat") ?? undefined,
      }),
    }).catch(() => {
      // Prefetch is best-effort — silently ignore failures
    });
  } catch {
    // Invalid diagram JSON — skip prefetch
  }
}

function getGenerateBasePathForDrillDown() {
  const useLegacyBackend =
    process.env.NEXT_PUBLIC_USE_LEGACY_BACKEND?.trim() === "true";
  if (!useLegacyBackend) {
    return "/api/generate";
  }
  const legacyApiBase = process.env.NEXT_PUBLIC_API_DEV_URL?.trim();
  if (legacyApiBase) {
    return `${legacyApiBase.replace(/\/$/, "")}/generate`;
  }
  return "/api/generate";
}
