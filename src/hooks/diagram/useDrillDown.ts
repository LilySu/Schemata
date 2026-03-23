import { useState, useCallback } from "react";

import type { DrillDownLevel } from "~/features/diagram/types";

export function useDrillDown() {
  const [stack, setStack] = useState<DrillDownLevel[]>([]);

  const currentLevel = stack.length > 0 ? stack[stack.length - 1]! : null;
  const currentDepth = stack.length;
  const isSubDiagram = stack.length > 1;

  const pushLevel = useCallback(
    (
      path: string,
      diagram: string,
      explanation: string,
      isLeaf?: boolean,
    ) => {
      const label = path === "" ? "Root" : path.split("/").pop() ?? path;
      setStack((prev) => [
        ...prev,
        { path, label, diagram, explanation, isLeaf },
      ]);
    },
    [],
  );

  const popToLevel = useCallback((index: number) => {
    setStack((prev) => prev.slice(0, index + 1));
  }, []);

  const reset = useCallback((rootDiagram: string, rootExplanation: string) => {
    setStack([
      {
        path: "",
        label: "Root",
        diagram: rootDiagram,
        explanation: rootExplanation,
      },
    ]);
  }, []);

  return {
    stack,
    currentLevel,
    currentDepth,
    isSubDiagram,
    pushLevel,
    popToLevel,
    reset,
  };
}
