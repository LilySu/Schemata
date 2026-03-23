import { toPng } from "html-to-image";

export async function exportFlowAsPng(): Promise<void> {
  const element = document.querySelector(".react-flow") as HTMLElement | null;
  if (!element) return;

  const dataUrl = await toPng(element, {
    backgroundColor: "#ffffff",
    quality: 1.0,
    pixelRatio: 2,
  });

  const anchor = document.createElement("a");
  anchor.download = "diagram.png";
  anchor.href = dataUrl;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
