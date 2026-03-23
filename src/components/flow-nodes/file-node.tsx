"use client";

import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";

export function FileNode({ data }: NodeProps) {
  return (
    <BaseNode
      label={data.label as string}
      className="rounded-md border-2 border-gray-400 bg-gray-50 text-gray-800 dark:border-gray-500 dark:bg-gray-900 dark:text-gray-200"
    >
      <div className="flex items-center gap-1.5">
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M3.5 1A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5v-8L9.5 1h-6zM10 2l3.5 4H10V2z" />
        </svg>
        <span className="select-none">{data.label as string}</span>
      </div>
    </BaseNode>
  );
}
