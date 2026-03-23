import type { GraphItem } from "~/features/diagram/graph-types";

export type DiagramStreamStatus =
  | "idle"
  | "started"
  | "analyzing"
  | "explanation_sent"
  | "explanation"
  | "explanation_chunk"
  | "mapping_sent"
  | "mapping"
  | "mapping_chunk"
  | "diagram_sent"
  | "diagram"
  | "diagram_chunk"
  | "diagram_item"
  | "complete"
  | "error";

export interface DiagramStreamState {
  status: DiagramStreamStatus;
  message?: string;
  explanation?: string;
  mapping?: string;
  diagram?: string;
  error?: string;
  errorCode?: string;
  parserError?: string;
}

export interface DiagramStreamMessage {
  status: DiagramStreamStatus;
  message?: string;
  chunk?: string;
  explanation?: string;
  mapping?: string;
  diagram?: string;
  error?: string;
  error_code?: string;
  parser_error?: string;
  is_leaf?: boolean;
  item?: GraphItem;
}

export interface DiagramCostResponse {
  cost?: string;
  error?: string;
  error_code?: string;
  ok?: boolean;
}

export interface StreamGenerationParams {
  username: string;
  repo: string;
  apiKey?: string;
  githubPat?: string;
  scopePath?: string;
  parentExplanation?: string;
}

export interface DrillDownLevel {
  path: string;
  label: string;
  diagram: string;
  explanation: string;
  isLeaf?: boolean;
}
