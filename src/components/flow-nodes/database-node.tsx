"use client";

import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";

export function DatabaseNode({ data }: NodeProps) {
  return (
    <BaseNode
      label={data.label as string}
      className="rounded-xl border-2 border-green-600 bg-green-50 text-green-900 dark:border-green-400 dark:bg-green-950 dark:text-green-100"
    >
      <div className="flex items-center gap-1.5">
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <ellipse cx="8" cy="3.5" rx="6" ry="2.5" />
          <path d="M2 3.5v9c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5v-9c0 1.38-2.69 2.5-6 2.5S2 4.88 2 3.5z" />
        </svg>
        <span className="select-none">{data.label as string}</span>
      </div>
    </BaseNode>
  );
}
