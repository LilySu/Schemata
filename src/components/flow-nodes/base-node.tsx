"use client";

import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";

interface BaseNodeProps {
  label: string;
  className?: string;
  children?: ReactNode;
}

export function BaseNode({ label, className = "", children }: BaseNodeProps) {
  return (
    <div
      className={`relative px-4 py-2 text-sm font-medium shadow-sm ${className}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-none !bg-gray-400 dark:!bg-gray-500"
      />
      {children ?? <span className="select-none">{label}</span>}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-none !bg-gray-400 dark:!bg-gray-500"
      />
    </div>
  );
}
