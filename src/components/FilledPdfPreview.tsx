import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { fieldDisplayState, isPdfRect, type AutofillField } from "@/lib/autofill";
import { projectPdfRect, type ProjectedRect } from "@/lib/pdf-overlay";

type PageInfo = {
  page: number;
  width: number;
  height: number;
  rotation?: number;
};

type Props = {
  pdfUrl: string;
  pages: PageInfo[];
  fields: AutofillField[];
  showBoxes: boolean;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  page: number;
  scale: number;
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

function readableValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function boxTone(field: AutofillField, selected: boolean) {
  if (selected) return "border-primary ring-2 ring-primary/40";
  const state = fieldDisplayState(field);
  if (state === "filled") return "border-success";
  if (state === "missing") return "border-destructive";
  return "border-warning";
}

type PageOverlay = { field: AutofillField; rect: ProjectedRect; thin: boolean };

function PdfPage({
  pdf,
  page,
  pageCount,
  fields,
  selectedFieldId,
  onSelectField,
  showBoxes,
  scale,
}: {
  pdf: PDFDocumentProxy;
  page: PageInfo;
  pageCount: number;
  fields: AutofillField[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  showBoxes: boolean;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<{
    width: number;
    height: number;
    overlays: PageOverlay[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    setReady(false);
    setError(null);
    setLayout(null);

    const render = async () => {
      try {
        const pdfPage = await pdf.getPage(page.page);
        if (cancelled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) throw new Error("The PDF canvas is unavailable.");

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const displayViewport = pdfPage.getViewport({ scale });
        const renderViewport = pdfPage.getViewport({ scale: scale * pixelRatio });
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);

        const pageView = isPdfRect(pdfPage.view)
          ? pdfPage.view
          : ([0, 0, page.width, page.height] as const);
        const overlays = fields.flatMap((field): PageOverlay[] => {
          if (field.page !== page.page) return [];
          const boxes =
            field.placement_status === "written" && field.write_rects?.length
              ? field.write_rects
              : field.entry_regions?.length
                ? field.entry_regions
                : [field.blank_rect];
          return boxes.flatMap((box) => {
            if (!isPdfRect(box)) return [];
            const rect = projectPdfRect(box, [...pageView], renderViewport);
            return rect
              ? [
                  {
                    field,
                    rect,
                    thin: field.placement_status !== "written" && box[3] - box[1] <= 2,
                  },
                ]
              : [];
          });
        });

        const task = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport: renderViewport,
        });
        renderTask = task;
        await task.promise;
        if (!cancelled) {
          setLayout({ width: displayViewport.width, height: displayViewport.height, overlays });
          setReady(true);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(
            renderError instanceof Error ? renderError.message : "This page could not be shown.",
          );
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, page.page, page.width, page.height, fields, scale]);

  const pageWidth = page.width > 0 ? page.width : 612;
  const pageHeight = page.height > 0 ? page.height : 792;
  return (
    <div className="mx-auto shrink-0" style={{ width: layout?.width ?? pageWidth * scale }}>
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-white shadow-xl shadow-ink/10"
        style={{ height: layout?.height ?? pageHeight * scale }}
      >
        <canvas
          ref={canvasRef}
          className={`block h-full w-full ${ready ? "" : "invisible"}`}
          aria-label={`Page ${page.page}`}
        />
        {error && (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        {!ready && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Rendering page {page.page}…
          </p>
        )}
        {ready && showBoxes && layout && (
          <div className="absolute inset-0">
            {layout.overlays.map(({ field, rect, thin }, index) => {
              const selected = selectedFieldId === field.field_id;
              const value = readableValue(field.written_value ?? field.mapped_value);
              const title = value ? `${field.label}: ${value}` : field.label;

              return (
                <div key={`${field.field_id}-${index}`} className="contents">
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute rounded-[2px] ${thin ? "border-t-2" : "border"} ${boxTone(field, selected)}`}
                    style={{
                      left: `${rect.left}%`,
                      top: `${rect.top}%`,
                      width: `${rect.width}%`,
                      height: thin ? 0 : `${rect.height}%`,
                    }}
                  />
                  <button
                    type="button"
                    title={title}
                    aria-label={title}
                    aria-pressed={selected}
                    onClick={() => onSelectField(field.field_id)}
                    className="group absolute cursor-pointer"
                    style={{
                      left: `${rect.left}%`,
                      top: thin ? `calc(${rect.top}% - 10px)` : `${rect.top}%`,
                      width: `max(${rect.width}%, 20px)`,
                      height: thin ? "20px" : `max(${rect.height}%, 20px)`,
                    }}
                  >
                    <span className="sr-only">{field.label}</span>
                    {selected && (
                      <span className="pointer-events-none absolute -top-7 left-0 z-10 max-w-[240px] truncate rounded-md bg-ink px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-lg">
                        {field.label}
                        {value ? ` · ${value}` : ""}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold text-muted-foreground">
        Page {page.page} of {pageCount}
      </p>
    </div>
  );
}

export function FilledPdfPreview({
  pdfUrl,
  pages,
  fields,
  showBoxes,
  selectedFieldId,
  onSelectField,
  page,
  scale,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    setPdf(null);
    setError(null);

    const load = async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        const task = pdfjs.getDocument({ url: pdfUrl });
        loadingTask = task;
        const document = await task.promise;
        if (!cancelled) setPdf(document);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The completed PDF could not be shown.",
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [pdfUrl]);

  const normalizedPages = useMemo(() => {
    if (pages.length > 0) return pages;
    if (!pdf) return [];
    return Array.from({ length: pdf.numPages }, (_, index) => ({
      page: index + 1,
      width: 612,
      height: 792,
      rotation: 0,
    }));
  }, [pages, pdf]);

  if (error) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-6">
        <div className="max-w-sm rounded-xl border border-destructive/30 bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-destructive" role="alert">
            {error}
          </p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-bold text-primary underline"
          >
            Open the PDF instead
          </a>
        </div>
      </div>
    );
  }

  if (!pdf) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-6 text-sm text-muted-foreground">
        Preparing PDF preview…
      </div>
    );
  }

  const pageCount = normalizedPages.length;
  const activePage = Math.min(Math.max(page, 1), pageCount);
  const activePageInfo =
    normalizedPages.find((pageInfo) => pageInfo.page === activePage) ?? normalizedPages[0];

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#F7F8FB]">
      <div className="flex min-h-full w-max min-w-full justify-center p-4">
        {activePageInfo && (
          <PdfPage
            key={activePageInfo.page}
            pdf={pdf}
            page={activePageInfo}
            pageCount={pageCount}
            fields={fields}
            selectedFieldId={selectedFieldId}
            onSelectField={onSelectField}
            showBoxes={showBoxes}
            scale={scale}
          />
        )}
      </div>
    </div>
  );
}
