export type GraphNodeType =
  | "service"
  | "api"
  | "database"
  | "external"
  | "config"
  | "file"
  | "function";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  group?: string | null;
  path?: string | null;
  /** Set by processNodePaths — full GitHub URL for files or tree URL for dirs */
  clickUrl?: string;
  /** Set by processNodePaths — "drilldown" if this node should trigger drill-down */
  clickAction?: "drilldown";
  /** Set by processNodePaths — the path to drill into */
  clickPath?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface GraphGroup {
  id: string;
  label: string;
  style?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups?: GraphGroup[];
}

/** Discriminated union for JSONL streaming items */
export type GraphItem =
  | (GraphNode & { kind: "node" })
  | (GraphEdge & { kind: "edge" })
  | (GraphGroup & { kind: "group" });
