import { useEffect, useRef, useState } from "react";
import type { BondPdfResult } from "@/lib/bond-pdf";
import {
  displayBondValue,
  initialBondValues,
  isBondFieldMapped,
  type BondTemplate,
  type BondValues,
} from "@/lib/bond-templates";

type Props = {
  template: BondTemplate;
  values: BondValues;
  page: number;
  zoom: number;
  selected: string | null;
  onSelectField: (id: string) => void;
};

let pdfJsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfJs() {
  pdfJsPromise ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ])
    .then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })
    .catch((error: unknown) => {
      pdfJsPromise = null;
      throw error;
    });
  return pdfJsPromise;
}

export function BondPdfPreview({ template, values, page, zoom, selected, onSelectField }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [availableSize, setAvailableSize] = useState({ width: 0, height: 0 });
  const [result, setResult] = useState<{ key: string; pdf: BondPdfResult } | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderReady, setRenderReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [overflowField, setOverflowField] = useState<string | null>(null);
  const key = template.id;
  const pdf = result?.key === key ? result.pdf : null;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      const width = Math.max(bounds.width - 34, 0);
      const height = Math.max(bounds.height - 34, 0);
      setAvailableSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      setBuildError(null);
      try {
        const { buildBondPdf } = await import("@/lib/bond-pdf");
        const next = await buildBondPdf(template, initialBondValues(template), {
          preview: true,
          backgroundOnly: true,
        });
        if (!cancelled) setResult({ key, pdf: next });
      } catch (error) {
        if (!cancelled)
          setBuildError(error instanceof Error ? error.message : "The preview could not be built.");
      }
    };
    void build();
    return () => {
      cancelled = true;
    };
  }, [key, template, retry]);

  const [pageWidth, pageHeight] = pdf?.pageSize ?? [612, 792];
  const fitScale =
    availableSize.width > 0 && availableSize.height > 0
      ? Math.min(availableSize.width / pageWidth, availableSize.height / pageHeight)
      : 1;
  const scale = fitScale * (zoom / 100);
  const displayWidth = pageWidth * scale;
  const displayHeight = pageHeight * scale;

  useEffect(() => {
    if (!pdf || !availableSize.width || !availableSize.height || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    setRenderReady(false);
    setRenderError(null);

    const render = async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        const task = pdfjs.getDocument({ data: pdf.bytes.slice() });
        loadingTask = task;
        const document = await task.promise;
        if (cancelled) return;
        const pdfPage = await document.getPage(page);
        if (cancelled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) throw new Error("The preview canvas is unavailable.");
        const pixelScale = scale * window.devicePixelRatio;
        const viewport = pdfPage.getViewport({ scale: pixelScale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        const taskToRender = pdfPage.render({ canvas, canvasContext: context, viewport });
        renderTask = taskToRender;
        await taskToRender.promise;
        if (!cancelled) setRenderReady(true);
      } catch (error) {
        if (!cancelled)
          setRenderError(
            error instanceof Error ? error.message : "The preview could not be shown.",
          );
      }
    };
    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [pdf, page, availableSize.width, availableSize.height, scale, displayWidth, displayHeight]);

  const error = buildError ?? renderError;
  const fieldAreas = pdf?.fieldAreas.filter((area) => area.page === page) ?? [];

  useEffect(() => {
    if (!renderReady) return;
    const frame = window.requestAnimationFrame(() => {
      const nodes = scrollRef.current?.querySelectorAll<HTMLElement>("[data-bond-value]");
      const overflowing = [...(nodes ?? [])].find(
        (node) => node.scrollHeight > node.clientHeight + 2,
      );
      setOverflowField(overflowing?.dataset["fieldLabel"] ?? null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [values, page, renderReady, scale]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-[#F7F8FB]">
      <div className="flex min-h-full w-max min-w-full justify-center p-4">
        {error ? (
          <div className="my-auto max-w-sm rounded-xl border border-destructive/30 bg-white p-5 text-center shadow-sm">
            <p className="text-sm font-semibold text-destructive" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="mt-3 text-sm font-bold text-primary underline"
              onClick={() => setRetry((current) => current + 1)}
            >
              Retry preview
            </button>
          </div>
        ) : pdf && availableSize.width && availableSize.height ? (
          <div
            className="relative shrink-0 border border-border bg-white shadow-xl shadow-ink/10"
            style={{ width: displayWidth, height: displayHeight }}
          >
            <canvas ref={canvasRef} className={renderReady ? "block" : "invisible block"} />
            {renderReady &&
              fieldAreas.map((area) => {
                const field = template.fields.find((entry) => entry.id === area.id);
                if (!field) return null;
                const value = displayBondValue(field, values);
                const isSelected = selected === area.id;
                const isMissing = field.required && !isBondFieldMapped(field, values);
                return (
                  <div key={area.id}>
                    {area.kind === "checkbox" ? (
                      values[area.id] === true && (
                        <svg
                          aria-hidden="true"
                          className="pointer-events-none absolute text-ink"
                          style={{
                            left: area.valueX * scale,
                            top: area.valueTop * scale,
                            width: 11 * scale,
                            height: 11 * scale,
                          }}
                          viewBox="0 0 11 11"
                        >
                          <path
                            d="M2 5 L4.5 8 L9 2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                        </svg>
                      )
                    ) : (
                      <div
                        data-bond-value=""
                        data-field-label={field.label}
                        aria-hidden="true"
                        className="pointer-events-none absolute overflow-hidden whitespace-normal break-words text-ink"
                        style={{
                          left: area.valueX * scale,
                          top: area.valueTop * scale,
                          width: area.valueWidth * scale,
                          height: area.valueHeight * scale,
                          fontFamily: "BondDejaVu, sans-serif",
                          fontSize: 9 * scale,
                          lineHeight: `${12 * scale}px`,
                        }}
                      >
                        {value}
                      </div>
                    )}
                    <button
                      key={area.id}
                      type="button"
                      aria-label={`Review ${field.label}`}
                      aria-pressed={isSelected}
                      aria-invalid={isMissing}
                      onClick={() => onSelectField(area.id)}
                      className="group absolute bg-transparent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                      style={{
                        left: area.x * scale,
                        top: (pageHeight - area.y - area.height) * scale,
                        width: area.width * scale,
                        height: area.height * scale,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute rounded-[2px] border transition-colors ${
                          isMissing
                            ? isSelected
                              ? "border-destructive bg-destructive/[0.09]"
                              : "border-destructive/80 bg-destructive/[0.06] group-hover:border-destructive"
                            : isSelected
                              ? "border-primary/70 bg-primary/[0.035]"
                              : "border-transparent group-hover:border-primary/45 group-hover:bg-primary/[0.025] group-focus-visible:border-primary"
                        }`}
                        style={{
                          left: (area.valueX - area.x) * scale,
                          top: (area.valueTop - 2 - (pageHeight - area.y - area.height)) * scale,
                          width:
                            (area.kind === "checkbox" ? area.width - 5 : area.valueWidth) * scale,
                          height: (area.kind === "checkbox" ? 15 : area.valueHeight + 6) * scale,
                        }}
                      />
                    </button>
                  </div>
                );
              })}
            {!renderReady && (
              <div
                className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
                role="status"
              >
                Rendering page…
              </div>
            )}
          </div>
        ) : (
          <div className="my-auto text-sm text-muted-foreground" role="status">
            Preparing preview…
          </div>
        )}
      </div>
      {overflowField && (
        <p
          className="sticky bottom-2 mx-4 rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-white"
          role="alert"
        >
          {overflowField} is too long for its space. Shorten the value before downloading.
        </p>
      )}
    </div>
  );
}
