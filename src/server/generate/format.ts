import type { GraphData, GraphItem } from "~/features/diagram/graph-types";

type TaggedValues = Record<string, string | undefined>;

export function toTaggedMessage(values: TaggedValues): string {
  return Object.entries(values)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `<${key}>\n${value}\n</${key}>`)
    .join("\n");
}

export function processNodePaths(
  graph: GraphData,
  username: string,
  repo: string,
  branch: string,
  fileTree?: string,
  drillDown?: boolean,
): GraphData {
  const treeLines = fileTree ? new Set(fileTree.split("\n")) : null;

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (!node.path) return node;

      let isFile = node.path.includes(".") && !node.path.endsWith("/");
      if (treeLines) {
        const hasChildren = [...treeLines].some((line) =>
          line.startsWith(node.path + "/"),
        );
        if (hasChildren) isFile = false;
      }

      if (isFile) {
        return {
          ...node,
          clickUrl: `https://github.com/${username}/${repo}/blob/${branch}/${node.path}`,
        };
      } else if (drillDown) {
        return {
          ...node,
          clickAction: "drilldown" as const,
          clickPath: node.path,
        };
      } else {
        return {
          ...node,
          clickUrl: `https://github.com/${username}/${repo}/tree/${branch}/${node.path}`,
        };
      }
    }),
  };
}

export function extractComponentMapping(response: string): string {
  const startTag = "<component_mapping>";
  const endTag = "</component_mapping>";
  const startIndex = response.indexOf(startTag);
  const endIndex = response.indexOf(endTag);

  if (startIndex === -1 || endIndex === -1) {
    return response;
  }

  return response.slice(startIndex, endIndex);
}

export function stripJsonCodeFences(text: string): string {
  return text
    .replace(/```json\s*/g, "")
    .replace(/```jsonl\s*/g, "")
    .replace(/```/g, "")
    .trim();
}

/**
 * Parse a single JSONL line into a GraphItem, or return null if unparseable.
 * Skips blank lines, array brackets, and lines that don't look like JSON objects.
 */
export function parseJsonlLine(
  line: string,
): GraphItem | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "[" || trimmed === "]" || trimmed === ",") {
    return null;
  }
  // Remove trailing comma (LLM may add commas between array elements)
  const cleaned = trimmed.replace(/,\s*$/, "");
  if (!cleaned.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "kind" in parsed &&
      ((parsed as { kind: string }).kind === "node" ||
        (parsed as { kind: string }).kind === "edge" ||
        (parsed as { kind: string }).kind === "group")
    ) {
      return parsed as GraphItem;
    }
    return null;
  } catch {
    return null;
  }
}
