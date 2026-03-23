"use client";

import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";

export function ApiNode({ data }: NodeProps) {
  return (
    <BaseNode
      label={data.label as string}
      className="rounded-full border-2 border-purple-500 bg-purple-50 px-5 text-purple-900 dark:border-purple-400 dark:bg-purple-950 dark:text-purple-100"
    />
  );
}
