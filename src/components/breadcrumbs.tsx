"use client";

import type { DrillDownLevel } from "~/features/diagram/types";

interface BreadcrumbsProps {
  stack: DrillDownLevel[];
  onNavigate: (index: number) => void;
  repoName?: string;
}

export function Breadcrumbs({ stack, onNavigate, repoName }: BreadcrumbsProps) {
  if (stack.length <= 1) return null;

  // For deep nesting, truncate middle segments
  const maxVisible = 5;
  let items = stack.map((level, index) => ({
    label: index === 0 ? repoName ?? "Root" : level.label,
    index,
  }));

  let truncated = false;
  if (items.length > maxVisible) {
    const first = items.slice(0, 2);
    const last = items.slice(-2);
    items = [...first, { label: "...", index: -1 }, ...last];
    truncated = true;
  }

  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={item.index === -1 ? `truncated-${i}` : item.index} className="flex items-center gap-1">
          {i > 0 && (
            <span className="text-neutral-400 dark:text-neutral-500">/</span>
          )}
          {item.index === -1 ? (
            <span className="text-neutral-400 dark:text-neutral-500">...</span>
          ) : item.index === stack.length - 1 ? (
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {item.label}
            </span>
          ) : (
            <button
              onClick={() => onNavigate(item.index)}
              className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
            >
              {item.label}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
