import { useCallback } from "react";

import { exportFlowAsPng } from "~/features/diagram/export";

export function useDiagramExport(diagram: string) {
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(diagram);
  }, [diagram]);

  const handleExportImage = useCallback(async () => {
    await exportFlowAsPng();
  }, []);

  return {
    handleCopy,
    handleExportImage,
  };
}
