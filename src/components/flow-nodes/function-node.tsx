"use client";

import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";

export function FunctionNode({ data }: NodeProps) {
  return (
    <BaseNode
      label={data.label as string}
      className="rounded-md border-2 border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-100"
    />
  );
}
