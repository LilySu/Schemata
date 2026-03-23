"use client";

import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";

export function ExternalNode({ data }: NodeProps) {
  return (
    <BaseNode
      label={data.label as string}
      className="rounded-lg border-2 border-dashed border-orange-500 bg-orange-50 text-orange-900 dark:border-orange-400 dark:bg-orange-950 dark:text-orange-100"
    />
  );
}
