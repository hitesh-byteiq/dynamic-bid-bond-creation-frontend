import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import "@/styles/pdf-annotation.css";
import { fieldDisplayState, isPdfRect, type AutofillField } from "@/lib/autofill";
import {
  compositeDateParts,
  isCheckedValue,
  widgetNameFor,
  type CompositeDateParts,
} from "@/lib/pdf-form-values";
import { projectPdfRect, type ProjectedRect } from "@/lib/pdf-overlay";

type PageInfo = {
  page: number;
  width: number;
  height: number;
  rotation?: number;
};

type Props = {
  pdfUrl: string;
  fields: AutofillField[];
  /** Live review values keyed by `field_id`. */
  values?: Record<string, string>;
  fontSizes?: Record<string, number | null> | undefined;
  onValueChange?: ((fieldId: string, value: string) => void) | undefined;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  page: number;
  scale: number;
  /** Opt-in debugging boxes. Off by default so the panel reads as a PDF viewer. */
  showHighlights?: boolean;
  /** Legacy prop kept for the older (unused) result screen. */
  showBoxes?: boolean;
  /** Legacy page metadata; real dimensions now come from pdf.js. */
  pages?: PageInfo[];
  onPageCountChange?: ((pageCount: number) => void) | undefined;
};

type PageOverlay = {
  field: AutofillField;
  rect: ProjectedRect;
  thin: boolean;
};

type WidgetBinding = {
  field: AutofillField;
  component?: keyof CompositeDateParts;
};

type FormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

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

function isCheckboxElement(element: FormElement) {
  return (
    element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")
  );
}

function readElementValue(element: FormElement) {
  if (isCheckboxElement(element)) return (element as HTMLInputElement).checked ? "true" : "false";
  return element.value;
}

function setElementValue(element: FormElement, value: string) {
  if (isCheckboxElement(element)) {
    const checked = isCheckedValue(value);
    if ((element as HTMLInputElement).checked !== checked) {
      (element as HTMLInputElement).checked = checked;
    }
    return;
  }
  if (element.value !== value) element.value = value;
}

/**
 * Font sizes are chosen in PDF points. pdf.js maps one point to `scale` CSS
 * pixels in the viewport, so scale before applying the value to the DOM.
 */
function applyWidgetFontSize(
  element: FormElement,
  fieldId: string,
  fontSizes: Record<string, number | null> | undefined,
  scale: number,
) {
  const size = fontSizes?.[fieldId];
  if (typeof size === "number" && size > 0) {
    element.style.fontSize = `${(size * scale).toFixed(2)}px`;
    element.style.lineHeight = "1.1";
  } else {
    element.style.fontSize = "";
    element.style.lineHeight = "";
  }
}

function valueForBinding(binding: WidgetBinding, values: Record<string, string>) {
  const raw = values[binding.field.field_id] ?? binding.field.mapped_value ?? "";
  if (!binding.component) return raw;
  return compositeDateParts(raw)?.[binding.component] ?? "";
}

function buildWidgetBindings(fields: AutofillField[]) {
  const bindings = new Map<string, WidgetBinding>();
  for (const field of fields) {
    const baseName = widgetNameFor(field);
    bindings.set(baseName, { field });
    if (field.field_name) bindings.set(field.field_name, { field });
    bindings.set(field.field_id, { field });

    if (field.blank_style === "composite_date") {
      for (const target of field.date_targets ?? []) {
        const component = target.component as keyof CompositeDateParts | undefined;
        if (component) bindings.set(`${baseName}__${component}`, { field, component });
      }
    }
  }
  return bindings;
}

function bindFormWidgets({
  container,
  annotations,
  fields,
  values,
  fontSizes,
  scale,
  onValueChange,
  onSelectField,
}: {
  container: HTMLDivElement;
  annotations: Array<Record<string, unknown>>;
  fields: AutofillField[];
  values: Record<string, string>;
  fontSizes: Record<string, number | null> | undefined;
  scale: number;
  onValueChange?: ((fieldId: string, value: string) => void) | undefined;
  onSelectField: (fieldId: string) => void;
}) {
  const bindings = buildWidgetBindings(fields);
  const bound = new Map<FormElement, WidgetBinding>();
  const sections = container.querySelectorAll<HTMLElement>("section[data-annotation-id]");

  for (const section of sections) {
    const annotationId = section.getAttribute("data-annotation-id");
    const annotation = annotations.find((item) => String(item["id"]) === annotationId);
    const fieldName = typeof annotation?.["fieldName"] === "string" ? annotation["fieldName"] : "";
    const binding = bindings.get(fieldName);
    if (!binding) continue;
    const element = section.querySelector<FormElement>("input, textarea, select");
    if (!element) continue;

    element.dataset["fieldId"] = binding.field.field_id;
    setElementValue(element, valueForBinding(binding, values));
    applyWidgetFontSize(element, binding.field.field_id, fontSizes, scale);
    bound.set(element, binding);

    const handleChange = () => {
      if (binding.component) return; // composite widgets are edited through the card
      onValueChange?.(binding.field.field_id, readElementValue(element));
    };
    element.addEventListener("input", handleChange);
    element.addEventListener("change", handleChange);
    element.addEventListener("focus", () => onSelectField(binding.field.field_id));
  }

  return bound;
}

function PdfPage({
  pdf,
  page,
  pageCount,
  fields,
  values,
  fontSizes,
  onValueChange,
  selectedFieldId,
  onSelectField,
  showHighlights,
  scale,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  pageCount: number;
  fields: AutofillField[];
  values: Record<string, string>;
  fontSizes?: Record<string, number | null> | undefined;
  onValueChange?: ((fieldId: string, value: string) => void) | undefined;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  showHighlights: boolean;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationRef = useRef<HTMLDivElement>(null);
  const widgetBindingsRef = useRef<Map<FormElement, WidgetBinding>>(new Map());
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const fontSizesRef = useRef(fontSizes);
  fontSizesRef.current = fontSizes;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [widgetFieldIds, setWidgetFieldIds] = useState<Set<string>>(() => new Set());
  const [layout, setLayout] = useState<{
    width: number;
    height: number;
    overlays: PageOverlay[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let annotationLayer: { destroy: () => void } | null = null;
    setReady(false);
    setError(null);
    setLayout(null);
    setWidgetFieldIds(new Set());
    widgetBindingsRef.current = new Map();

    const render = async () => {
      try {
        const pdfjs = await loadPdfJs();
        const pdfPage = await pdf.getPage(page);
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
          : ([0, 0, displayViewport.width, displayViewport.height] as const);

        const overlays = fields.flatMap((field): PageOverlay[] => {
          if (field.page !== page) return [];
          const boxes =
            field.placement_status === "written" && field.write_rects?.length
              ? field.write_rects
              : field.entry_regions?.length
                ? field.entry_regions
                : [field.blank_rect];
          return boxes.flatMap((box) => {
            if (!isPdfRect(box)) return [];
            const rect = projectPdfRect(box, [...pageView], renderViewport);
            if (!rect) return [];
            return [
              {
                field,
                rect,
                thin: field.placement_status !== "written" && box[3] - box[1] <= 2,
              },
            ];
          });
        });

        const task = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport: renderViewport,
          // Forms are drawn by the AnnotationLayer as HTML, not baked into the raster.
          annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
        });
        renderTask = task;
        await task.promise;
        if (cancelled) return;

        // Render real AcroForm widgets (the browser PDF viewer experience)
        // instead of only painting the page raster.
        let widgetIds = new Set<string>();
        const annotationDiv = annotationRef.current;
        if (annotationDiv) {
          annotationDiv.replaceChildren();
          try {
            const annotations = (await pdfPage.getAnnotations({
              intent: "display",
            })) as Array<Record<string, unknown>>;
            if (cancelled) return;

            const Layer = pdfjs.AnnotationLayer as unknown as new (params: {
              div: HTMLDivElement;
              page: PDFPageProxy;
              viewport: ReturnType<PDFPageProxy["getViewport"]>;
              linkService: unknown;
            }) => {
              render: (params: Record<string, unknown>) => Promise<void>;
              destroy: () => void;
            };

            const layer = new Layer({
              div: annotationDiv,
              page: pdfPage,
              viewport: displayViewport,
              linkService: createLinkServiceStub(),
            });
            annotationLayer = layer;
            await layer.render({
              viewport: displayViewport,
              div: annotationDiv,
              annotations,
              page: pdfPage,
              linkService: createLinkServiceStub(),
              renderForms: true,
            });
            if (cancelled) return;

            widgetBindingsRef.current = bindFormWidgets({
              container: annotationDiv,
              annotations,
              fields,
              values: valuesRef.current,
              fontSizes: fontSizesRef.current,
              scale,
              onValueChange,
              onSelectField,
            });
            widgetIds = new Set(
              [...widgetBindingsRef.current.values()].map((binding) => binding.field.field_id),
            );
          } catch (annotationError) {
            // A PDF without form widgets (or with unsupported XFA) is still usable.
            console.warn("PDF form widgets could not be rendered.", annotationError);
          }
        }

        setLayout({ width: displayViewport.width, height: displayViewport.height, overlays });
        setWidgetFieldIds(widgetIds);
        setReady(true);
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
      annotationLayer?.destroy();
    };
  }, [pdf, page, scale, fields, onValueChange, onSelectField]);

  // Keep already-rendered widgets in sync with card edits without reloading the PDF.
  useEffect(() => {
    for (const [element, binding] of widgetBindingsRef.current) {
      setElementValue(element, valueForBinding(binding, values));
    }
  }, [values]);

  // Apply user-selected font sizes to rendered AcroForm widget inputs.
  // `ready`/`scale` are included because a zoom or re-render recreates the
  // widgets, which drops any inline styles applied previously.
  useEffect(() => {
    for (const [element, binding] of widgetBindingsRef.current) {
      applyWidgetFontSize(element, binding.field.field_id, fontSizes, scale);
    }
  }, [fontSizes, scale, ready]);

  const pageWidth = layout?.width ?? 612;
  const pageHeight = layout?.height ?? 792;
  const scaleVars = {
    "--scale-factor": String(scale),
    "--total-scale-factor": String(scale),
    "--scale-round-x": "1px",
    "--scale-round-y": "1px",
  } as CSSProperties;

  return (
    <div className="mx-auto shrink-0" style={{ width: pageWidth }}>
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-white shadow-xl shadow-ink/10"
        style={{ height: pageHeight, ...scaleVars }}
      >
        <canvas
          ref={canvasRef}
          className={`block h-full w-full ${ready ? "" : "invisible"}`}
          aria-label={`Page ${page}`}
        />
        <div ref={annotationRef} className="annotationLayer" />
        {error && (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        {!ready && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Rendering page {page}…
          </p>
        )}
        {ready && layout && (
          <div className="pointer-events-none absolute inset-0">
            {layout.overlays.map(({ field, rect, thin }, index) => {
              const selected = selectedFieldId === field.field_id;
              const hasWidget = widgetFieldIds.has(field.field_id);
              const value = readableValue(values[field.field_id] ?? field.mapped_value);
              const checkbox = field.field_type.toLowerCase().includes("checkbox");
              const title = value ? `${field.label}: ${value}` : field.label;
              const pxHeight = (layout.height * rect.height) / 100;
              const userFontSize = fontSizes?.[field.field_id];
              // The fallback is already in CSS pixels; the user value is in
              // PDF points, which pdf.js maps to pixels via `scale`.
              const fontSize =
                typeof userFontSize === "number" && userFontSize > 0
                  ? userFontSize * scale
                  : Math.max(7, Math.min(20, pxHeight * 0.62 || 11));

              return (
                <div key={`${field.field_id}-${index}`} className="contents">
                  {(showHighlights || selected) && (
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
                  )}
                  {!hasWidget && value !== "" && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute flex items-center overflow-hidden whitespace-nowrap font-medium text-ink"
                      style={{
                        left: `${rect.left}%`,
                        top: `${rect.top}%`,
                        width: `max(${rect.width}%, 20px)`,
                        height: thin ? "auto" : `${rect.height}%`,
                        fontSize,
                        lineHeight: 1,
                        paddingLeft: 1,
                      }}
                    >
                      {checkbox ? (isCheckedValue(value) ? "✓" : "") : value}
                    </span>
                  )}
                  {!hasWidget && (
                    <button
                      type="button"
                      title={title}
                      aria-label={title}
                      aria-pressed={selected}
                      onClick={() => onSelectField(field.field_id)}
                      className="pointer-events-auto group absolute cursor-pointer"
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold text-muted-foreground">
        Page {page} of {pageCount}
      </p>
    </div>
  );
}

function createLinkServiceStub() {
  return {
    getDestinationHash: () => "",
    getAnchorUrl: () => "#",
    navigateTo: () => undefined,
    addLinkAttributes: (link: HTMLAnchorElement) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer nofollow";
    },
    externalLinkTarget: 0,
    externalLinkRel: "noopener noreferrer nofollow",
    externalLinkEnabled: false,
    isInPresentationMode: false,
  };
}

export function FilledPdfPreview({
  pdfUrl,
  fields,
  values = {},
  fontSizes,
  onValueChange,
  selectedFieldId,
  onSelectField,
  page,
  scale,
  showHighlights,
  showBoxes,
  onPageCountChange,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const highlights = showHighlights ?? showBoxes ?? false;

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

  useEffect(() => {
    if (pdf) onPageCountChange?.(pdf.numPages);
  }, [pdf, onPageCountChange]);

  const pageCount = useMemo(() => (pdf ? pdf.numPages : 0), [pdf]);

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

  const activePage = Math.min(Math.max(page, 1), Math.max(pageCount, 1));

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#F7F8FB]">
      <div className="flex min-h-full w-max min-w-full justify-center p-4">
        <PdfPage
          key={activePage}
          pdf={pdf}
          page={activePage}
          pageCount={pageCount}
          fields={fields}
          values={values}
          fontSizes={fontSizes}
          onValueChange={onValueChange}
          selectedFieldId={selectedFieldId}
          onSelectField={onSelectField}
          showHighlights={highlights}
          scale={scale}
        />
      </div>
    </div>
  );
}
