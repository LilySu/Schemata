"use client";

import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";

export function ServiceNode({ data }: NodeProps) {
  return (
    <BaseNode
      label={data.label as string}
      className="rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100"
    />
  );
}
