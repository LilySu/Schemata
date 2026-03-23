"use client";

import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";

export function ConfigNode({ data }: NodeProps) {
  return (
    <BaseNode
      label={data.label as string}
      className="rounded-md border-2 border-yellow-500 bg-yellow-50 text-yellow-900 dark:border-yellow-400 dark:bg-yellow-950 dark:text-yellow-100"
    >
      <div className="flex items-center gap-1.5">
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M7.429 1.525a3.5 3.5 0 011.142 0l.012.003.357.093a3.5 3.5 0 01.808.467l.009.007.288.228a3.5 3.5 0 01.573.704l.005.009.17.319a3.5 3.5 0 01.274.888l.002.013.04.363a3.5 3.5 0 010 .933l-.002.013-.04.363a3.5 3.5 0 01-.274.888l-.005.009-.17.319a3.5 3.5 0 01-.573.704l-.009.007-.288.228a3.5 3.5 0 01-.808.467l-.012.003-.357.093a3.5 3.5 0 01-1.142 0l-.012-.003-.357-.093a3.5 3.5 0 01-.808-.467l-.009-.007-.288-.228a3.5 3.5 0 01-.573-.704l-.005-.009-.17-.319a3.5 3.5 0 01-.274-.888l-.002-.013-.04-.363a3.5 3.5 0 010-.933l.002-.013.04-.363a3.5 3.5 0 01.274-.888l.005-.009.17-.319a3.5 3.5 0 01.573-.704l.009-.007.288-.228a3.5 3.5 0 01.808-.467l.012-.003.357-.093zM8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM6.5 8a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z"
          />
        </svg>
        <span className="select-none">{data.label as string}</span>
      </div>
    </BaseNode>
  );
}
