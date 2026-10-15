import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/template-intake")({
  head: () => ({
    meta: [
      { title: "Template Transform | Dynamic Form Fill AI" },
      {
        name: "description",
        content: "Upload a PDF template and inspect Unstructured extraction and annotations.",
      },
    ],
  }),
  component: TemplateIntakePage,
});

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(
  /\/$/,
  "",
);
const MAX_PDF_BYTES = 25 * 1024 * 1024;

type TransformElement = {
  element_id?: string;
  type?: string;
  text?: string | null;
  metadata?: { text_as_html?: string | null; page_number?: number };
};

type FieldCandidate = {
  field_id: string;
  label: string;
  value: string | boolean | null;
  field_type: "text" | "checkbox" | "unknown";
  source_element_id: string | null;
  source_element_type: string;
  location_element_id: string | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  location_granularity: "field" | "group" | "none";
  checkbox_state: "checked" | "unchecked" | "unmarked" | null;
};

type TemplateAnalysis = {
  template_id: string;
  filename: string;
  page_count: number;
  page: { width: number; height: number; unit?: string };
  transform_result: { elements?: TransformElement[]; [key: string]: unknown };
  field_candidates: FieldCandidate[];
  warnings: string[];
};

function TemplateIntakePage() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<TemplateAnalysis | null>(null);
  const [scope, setScope] = useState<"all" | "forms" | "fields">("all");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const elements = useMemo(() => analysis?.transform_result?.elements ?? [], [analysis]);
  const fieldCandidates = analysis?.field_candidates ?? [];
  const htmlElements = useMemo(
    () =>
      elements.filter(
        (element) =>
          typeof element.metadata?.text_as_html === "string" &&
          element.metadata.text_as_html.trim(),
      ),
    [elements],
  );

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    setAnalysis(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setError("Choose a PDF file.");
      return;
    }
    if (selected.size > MAX_PDF_BYTES) {
      setFile(null);
      setError("The PDF must be 25 MB or smaller.");
      return;
    }
    setFile(selected);
  };

  const analyze = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    setError("");
    setAnalysis(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/templates/analyze`, {
        method: "POST",
        body,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail =
          typeof payload === "object" && payload !== null && "detail" in payload
            ? (payload as { detail?: unknown }).detail
            : null;
        throw new Error(
          typeof detail === "string" ? detail : `Analysis failed (HTTP ${response.status}).`,
        );
      }
      setAnalysis(payload as TemplateAnalysis);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reach the PDF transform API. Check that FastAPI is running.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const previewUrl = (annotated: boolean) => {
    if (!analysis) return "";
    const path = `/api/v1/templates/${encodeURIComponent(analysis.template_id)}/preview`;
    return `${API_BASE_URL}${path}${annotated ? `?annotated=true&scope=${scope}` : ""}`;
  };
  const annotatedPdfUrl = analysis
    ? `${API_BASE_URL}/api/v1/templates/${encodeURIComponent(analysis.template_id)}/annotated.pdf?scope=${scope}`
    : "";

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex size-10 items-center justify-center rounded-full border bg-card text-muted-foreground transition hover:text-foreground"
              aria-label="Back to home"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-steel-blue">
                Template intake
              </p>
              <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
                PDF transform preview
              </h1>
            </div>
          </div>
          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            One-page PDF · Up to 25 MB
          </span>
        </header>

        <Card className="border-border/80 bg-card shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Upload size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold">Upload a template</h2>
                <p className="text-sm text-muted-foreground">
                  Unstructured returns typed elements and positions for the page.
                </p>
                {file && (
                  <p className="mt-1 truncate text-sm font-semibold text-ink">
                    {file.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({formatSize(file.size)})
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-4 text-sm font-semibold transition hover:bg-accent">
                <FileText size={16} className="mr-2" /> Choose PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={chooseFile}
                />
              </label>
              <Button onClick={analyze} disabled={!file || isAnalyzing} className="h-10 min-w-36">
                {isAnalyzing ? (
                  <>
                    <LoaderCircle size={16} className="mr-2 animate-spin" />
                    Analyzing
                  </>
                ) : (
                  "Analyze template"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {analysis && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/25 bg-success/5 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 size={18} className="text-success" /> Analysis complete{" "}
                <span className="font-normal text-muted-foreground">
                  · {elements.length} elements · {analysis.page.width.toFixed(0)} ×{" "}
                  {analysis.page.height.toFixed(0)} {analysis.page.unit ?? "points"}
                </span>
              </div>
              <a
                href={annotatedPdfUrl}
                download
                className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-semibold transition hover:bg-accent"
              >
                <Download size={15} className="mr-2" /> Download annotated PDF
              </a>
            </div>

            {analysis.warnings?.length > 0 && (
              <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
                <p className="mb-1 text-sm font-bold">Transform warnings</p>
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {analysis.warnings.map((warning, index) => (
                    <li key={`${index}-${warning}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-5 xl:grid-cols-2">
              <PreviewCard title="Original PDF" src={previewUrl(false)} />
              <Card className="overflow-hidden border-border/80 bg-card shadow-sm">
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                  <CardTitle className="text-base">Annotated preview</CardTitle>
                  <div
                    className="inline-flex rounded-lg border bg-muted/50 p-1"
                    role="group"
                    aria-label="Annotation scope"
                  >
                    <ScopeButton active={scope === "all"} onClick={() => setScope("all")}>
                      All elements
                    </ScopeButton>
                    <ScopeButton active={scope === "forms"} onClick={() => setScope("forms")}>
                      Form elements
                    </ScopeButton>
                    <ScopeButton active={scope === "fields"} onClick={() => setScope("fields")}>
                      Field boxes
                    </ScopeButton>
                  </div>
                </CardHeader>
                <CardContent className="bg-muted/30 p-3 sm:p-5">
                  <img
                    src={previewUrl(true)}
                    alt={`PDF page annotated with ${scope} elements`}
                    className="mx-auto max-h-[780px] w-auto max-w-full rounded border bg-white shadow-sm"
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/80 bg-card shadow-sm">
              <CardHeader className="border-b px-5 py-4">
                <CardTitle className="text-base">Transform result</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                <Tabs defaultValue="text">
                  <TabsList className="mb-4">
                    <TabsTrigger value="text">Element text</TabsTrigger>
                    <TabsTrigger value="fields">
                      Field candidates ({fieldCandidates.length})
                    </TabsTrigger>
                    <TabsTrigger value="json">JSON</TabsTrigger>
                    <TabsTrigger value="html">HTML fragments ({htmlElements.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="text" className="mt-0">
                    {elements.length ? (
                      <div className="space-y-3">
                        {elements.map((element, index) => (
                          <article
                            key={element.element_id ?? index}
                            className="rounded-lg border bg-background p-4"
                          >
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <span className="rounded bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                                {element.type ?? "Element"}
                              </span>
                              {element.metadata?.page_number && (
                                <span className="text-xs text-muted-foreground">
                                  Page {element.metadata.page_number}
                                </span>
                              )}
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-6">
                              {element.text || (
                                <span className="italic text-muted-foreground">
                                  No text returned for this element.
                                </span>
                              )}
                            </p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <EmptyState>No typed elements were returned.</EmptyState>
                    )}
                  </TabsContent>
                  <TabsContent value="json" className="mt-0">
                    <pre className="max-h-[640px] overflow-auto rounded-lg bg-ink p-4 text-xs leading-5 text-primary-foreground">
                      <code>{JSON.stringify(analysis.transform_result, null, 2)}</code>
                    </pre>
                  </TabsContent>
                  <TabsContent value="fields" className="mt-0">
                    {fieldCandidates.length ? (
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-4 py-3 font-bold">Field label</th>
                              <th className="px-4 py-3 font-bold">Value</th>
                              <th className="px-4 py-3 font-bold">Type / state</th>
                              <th className="px-4 py-3 font-bold">Location</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fieldCandidates.map((candidate) => (
                              <tr key={candidate.field_id} className="border-t align-top">
                                <td className="px-4 py-3 font-semibold">{candidate.label}</td>
                                <td className="px-4 py-3">
                                  {candidate.value === null || candidate.value === "" ? (
                                    <span className="italic text-muted-foreground">
                                      Blank / unset
                                    </span>
                                  ) : (
                                    String(candidate.value)
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="rounded bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                                    {candidate.field_type}
                                  </span>
                                  {candidate.checkbox_state && (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {candidate.checkbox_state} marker
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                  {candidate.location_granularity === "field" && candidate.bbox
                                    ? `Field box · x ${candidate.bbox.x.toFixed(3)}, y ${candidate.bbox.y.toFixed(3)}`
                                    : candidate.location_granularity === "group"
                                      ? "Form/Table region only"
                                      : "No coordinates returned"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState>No individual field candidates were returned.</EmptyState>
                    )}
                  </TabsContent>
                  <TabsContent value="html" className="mt-0">
                    {htmlElements.length ? (
                      <div className="space-y-4">
                        {htmlElements.map((element, index) => (
                          <section
                            key={element.element_id ?? index}
                            className="overflow-hidden rounded-lg border"
                          >
                            <div className="border-b bg-muted/40 px-4 py-2 text-xs font-bold">
                              {element.type ?? "Element"}
                              {element.metadata?.page_number
                                ? ` · Page ${element.metadata.page_number}`
                                : ""}
                            </div>
                            <iframe
                              title={`HTML fragment ${index + 1}`}
                              sandbox=""
                              srcDoc={element.metadata?.text_as_html ?? ""}
                              className="h-64 w-full bg-white"
                            />
                          </section>
                        ))}
                      </div>
                    ) : (
                      <EmptyState>No HTML fragments were returned for this PDF.</EmptyState>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

function PreviewCard({ title, src }: { title: string; src: string }) {
  return (
    <Card className="overflow-hidden border-border/80 bg-card shadow-sm">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-80 justify-center bg-muted/30 p-3 sm:p-5">
        <img
          src={src}
          alt={title}
          className="max-h-[780px] w-auto max-w-full self-start rounded border bg-white shadow-sm"
        />
      </CardContent>
    </Card>
  );
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
