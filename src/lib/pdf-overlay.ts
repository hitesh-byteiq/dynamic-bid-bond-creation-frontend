import type { PdfRect } from "@/lib/autofill";

type PdfViewport = {
  width: number;
  height: number;
  convertToViewportPoint: (x: number, y: number) => number[];
};

export type ProjectedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Convert top-left PDF points to the exact viewport used to render the canvas. */
export function projectPdfRect(
  rect: PdfRect,
  pageView: PdfRect,
  viewport: PdfViewport,
): ProjectedRect | null {
  const [viewX0, , , viewY1] = pageView;
  const [x0, y0, x1, y1] = rect;
  const p0 = viewport.convertToViewportPoint(viewX0 + x0, viewY1 - y1);
  const p1 = viewport.convertToViewportPoint(viewX0 + x1, viewY1 - y0);
  if (
    p0.length < 2 ||
    p1.length < 2 ||
    ![p0[0], p0[1], p1[0], p1[1]].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return null;
  const left = Math.min(p0[0]!, p1[0]!);
  const top = Math.min(p0[1]!, p1[1]!);
  return {
    left: (left / viewport.width) * 100,
    top: (top / viewport.height) * 100,
    width: (Math.abs(p1[0]! - p0[0]!) / viewport.width) * 100,
    height: (Math.abs(p1[1]! - p0[1]!) / viewport.height) * 100,
  };
}
