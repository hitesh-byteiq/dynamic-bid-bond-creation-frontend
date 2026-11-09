import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCheck2,
  FileText,
  House,
  Info,
  Keyboard,
  Loader2,
  Minus,
  Plus,
  ZoomIn,
  ZoomOut,
  Save,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { FilledPdfPreview } from "@/components/FilledPdfPreview";
import {
  flattenPdf,
  runWorkflow,
  toReviewFields,
  type PdfType,
  type WorkflowEvent,
  type WorkflowResponse,
} from "@/lib/workflow-api";
import { useFieldValues } from "@/lib/use-field-values";
import { buildAcroFormPdf } from "@/lib/pdf-form-values";
import {
  addSchemaField,
  availableCandidates,
  removeSchemaField,
  schemaCandidates,
  type SchemaDraft,
} from "@/lib/schema-review";
import {
  needsDecision,
  needsPlacementEdit,
  reviewDecision,
  reviewFieldStatus,
  type ReviewEdit,
  type ReviewStatus,
} from "@/lib/review";
import {
  type AutofillFailure,
  type AutofillField,
  type AutofillResponse,
  type FieldDecision,
  type SchemaReviewResponse,
} from "@/lib/autofill";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_RAW_TEXT_CHARS = 100_000;
function createPdfBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  if (!binary.startsWith("%PDF")) throw new Error("The response is not a PDF.");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function readableValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function AutofillFlow() {
  const [stage, setStage] = useState<"landing" | "source" | "result">("landing");
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [liveEvents, setLiveEvents] = useState<WorkflowEvent[]>([]);
  const [inputError, setInputError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [busy, setBusy] = useState(false);
  const [responseViewerOpen, setResponseViewerOpen] = useState(false);
  const [apiResponse, setApiResponse] = useState<unknown>(null);
  const [hasApiResponse, setHasApiResponse] = useState(false);
  const [result, setResult] = useState<WorkflowResponse | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const responseJson = useMemo(() => {
    if (!responseViewerOpen || !hasApiResponse) return "";
    return typeof apiResponse === "string"
      ? apiResponse
      : JSON.stringify(apiResponse, null, 2) || "No response body was returned.";
  }, [apiResponse, hasApiResponse, responseViewerOpen]);

  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const chooseFile = (selected: File | null) => {
    setInputError("");
    setRequestError("");
    setApiResponse(null);
    setHasApiResponse(false);
    setResult(null);
    setPdfUrl(null);
    setLiveEvents([]);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setInputError("Choose a PDF file.");
      return;
    }
    if (selected.size > MAX_PDF_BYTES) {
      setFile(null);
      setInputError("The PDF must be 20 MiB or smaller.");
      return;
    }
    setFile(selected);
  };

  const validateInput = () => {
    if (!file) return "Choose a PDF form to continue.";
    if (file.size === 0) return "The selected PDF is empty. Choose another file.";
    if (file.size > MAX_PDF_BYTES) return "The PDF must be 20 MiB or smaller.";
    if (!rawText.trim()) return "Add the business information you want to use.";
    if (rawText.length > MAX_RAW_TEXT_CHARS) {
      return "Business information must be 100,000 characters or fewer.";
    }
    return "";
  };

  const runAutofill = async () => {
    if (!file) return;
    setBusy(true);
    setRequestError("");
    setApiResponse(null);
    setHasApiResponse(false);
    setResult(null);
    setPdfUrl(null);

    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("source_text", rawText);
    if (instructions.trim()) formData.append("instructions", instructions.trim());

    try {
      const payload = await runWorkflow(formData, (event) => {
        setLiveEvents((events) => [...events.slice(-19), event]);
        setApiResponse({ event: event.event, ...event.data });
        setHasApiResponse(true);
      });
      setApiResponse(payload);
      setHasApiResponse(true);
      if (payload.status === "failed") {
        setRequestError(payload.error || "The workflow failed. Review the trace and try again.");
      }
      if (payload.pdf_base64) {
        const outputBlob = createPdfBlob(payload.pdf_base64, "application/pdf");
        setPdfUrl(URL.createObjectURL(outputBlob));
      }
      setResult(payload);
      setStage("result");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow request failed.";
      setRequestError(`${message} Edit the source information and retry.`);
    } finally {
      setBusy(false);
    }
  };

  const handleSourceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationMessage = validateInput();
    if (validationMessage) {
      setInputError(validationMessage);
      return;
    }
    setInputError("");
    setRequestError("");
    void runAutofill();
  };

  const startNewDocument = () => {
    setResult(null);
    setPdfUrl(null);
    setApiResponse(null);
    setHasApiResponse(false);
    setRequestError("");
    setInputError("");
    setFile(null);
    setRawText("");
    setInstructions("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setStage("source");
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {stage === "landing" ? (
        <LandingPage onStart={() => setStage("source")} />
      ) : (
        <div className="flex h-screen flex-col">
          <AppHeader
            activeStepIndex={stage === "source" ? 1 : result?.status === "completed" ? 4 : 3}
            onHome={() => setStage("landing")}
          />
          <div className="flex-1 min-h-0 overflow-hidden">
            {stage === "source" ? (
              <SourceScreen
                busy={busy}
                file={file}
                fileInputRef={fileInputRef}
                inputError={inputError}
                onFileChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                onRawTextChange={setRawText}
                instructions={instructions}
                onInstructionsChange={setInstructions}
                liveEvents={liveEvents}
                onSubmit={handleSourceSubmit}
                rawText={rawText}
                requestError={requestError}
                hasApiResponse={hasApiResponse}
                onViewResponse={() => setResponseViewerOpen(true)}
              />
            ) : result ? (
              <WorkflowResultScreen
                result={result}
                pdfUrl={pdfUrl}
                pdfBase64={result.pdf_base64}
                file={file}
                sourceText={rawText}
                instructions={instructions}
                onEditSource={() => setStage("source")}
              />
            ) : null}
          </div>
        </div>
      )}

      <Dialog open={responseViewerOpen} onOpenChange={setResponseViewerOpen}>
        <DialogContent className="flex max-h-[92vh] max-w-[min(96vw,900px)] flex-col rounded-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Braces size={19} /> Complete API response
            </DialogTitle>
            <DialogDescription>
              Full response body returned by the autofill API, including the encoded PDF.
            </DialogDescription>
          </DialogHeader>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-ink p-4 text-xs leading-5 text-primary-foreground">
            {responseJson || "No response body was returned."}
          </pre>
        </DialogContent>
      </Dialog>
    </main>
  );
}

const workflowSteps = [
  { id: "choose", label: "Choose Bond Form" },
  { id: "source", label: "Review Source Data" },
  { id: "extract", label: "Extract & Map" },
  { id: "review", label: "Review & Edit" },
  { id: "fill", label: "Fill Template" },
  { id: "store", label: "Store" },
] as const;

function AppHeader({ activeStepIndex, onHome }: { activeStepIndex: number; onHome: () => void }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-2 shadow-sm sm:px-5 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <LogoMark />
        <div className="min-w-0">
          <span className="whitespace-nowrap font-display text-sm font-bold text-ink sm:text-lg">
            Dynamic Form Fill AI
          </span>
          <p className="hidden text-xs font-semibold text-muted-foreground sm:block">
            AI document and form autofill
          </p>
        </div>
      </div>
      <div className="hidden items-center gap-2 text-xs font-semibold text-muted-foreground xl:flex">
        {workflowSteps.map((step, index) => (
          <WorkflowPill
            key={step.id}
            label={step.label}
            complete={index < activeStepIndex}
            active={index === activeStepIndex}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          aria-label="Home"
          onClick={onHome}
        >
          <House size={15} />
          <span className="hidden sm:inline">Home</span>
        </Button>
        <button
          aria-label="User menu"
          className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          type="button"
        >
          JD
        </button>
      </div>
    </header>
  );
}

function WorkflowPill({
  label,
  complete,
  active,
}: {
  label: string;
  complete: boolean;
  active: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1.5 ${
        complete
          ? "bg-accent text-success"
          : active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {complete && <Check size={13} className="mr-1 inline" />}
      {label}
    </span>
  );
}

function AnalysisLoadingCard({
  label = "Processing your PDF and source information…",
  stageLabel = "Preparing workflow",
  progress = 8,
}: {
  label?: string;
  stageLabel?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-cream/25 px-4 py-3" aria-busy="true">
      <div className="flex items-start justify-between gap-3">
        <p
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-primary" />
          {label}
        </p>
        <span className="shrink-0 text-sm font-bold text-primary">{progress}%</span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-cream"
        role="progressbar"
        aria-label="Autofill progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{stageLabel}</span>
        <span>Keep this page open</span>
      </p>
    </div>
  );
}

function loadingProgress(events: WorkflowEvent[]) {
  const latestStart = [...events].reverse().find((event) => event.event === "tool_started");
  const tool = String(latestStart?.data["tool"] ?? "");
  const label = String(latestStart?.data["label"] ?? "Preparing the workflow…");
  const stages: Record<string, { progress: number; stage: string }> = {
    s1_detect_fields: { progress: 25, stage: "Stage 1 of 4 · Detect fields" },
    s2_build_schema: { progress: 50, stage: "Stage 2 of 4 · Build schema" },
    s3_map_values: { progress: 70, stage: "Stage 3 of 4 · Map values" },
    guardian_validate: { progress: 78, stage: "Stage 3 of 4 · Validate values" },
    repair_mapping: { progress: 70, stage: "Stage 3 of 4 · Repair mapping" },
    s4_fill_pdf: { progress: 90, stage: "Stage 4 of 4 · Fill PDF" },
    post_fill_check: { progress: 96, stage: "Stage 4 of 4 · Verify PDF" },
  };
  return { ...(stages[tool] ?? { progress: 8, stage: "Preparing workflow" }), label };
}

function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <section className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,oklch(0.99_0.025_91.74),oklch(0.9584_0.0446_91.74)_42%,oklch(0.88_0.04_265)_100%)] p-3 text-ink lg:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1500px] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-2xl shadow-ink/15 backdrop-blur lg:min-h-[calc(100vh-2.5rem)]">
        <nav className="flex items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <LogoMark />
            <span className="hidden font-display text-base font-bold sm:inline">
              Dynamic Form Fill AI
            </span>
          </div>
          <Button className="h-9 rounded-full bg-primary px-5 text-xs" onClick={onStart}>
            Start autofill
          </Button>
        </nav>
        <div className="flex flex-1 flex-col items-center px-5 pb-6 pt-8 text-center lg:px-8 lg:pt-12">
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-full bg-steel-blue px-4 py-2 text-xs font-bold text-primary-foreground shadow-lg shadow-steel-blue/25 transition-colors hover:bg-deep-blue"
          >
            Upload, map, and review <ArrowRight size={14} />
          </button>
          <h1 className="mt-6 max-w-4xl font-display text-5xl font-bold leading-[0.98] tracking-normal text-ink sm:text-6xl lg:text-7xl">
            Turn documents into completed forms
          </h1>
          <p className="mt-5 max-w-2xl text-sm font-medium leading-6 text-steel-blue sm:text-base">
            Upload a bond form, provide its business information, review mapped fields, and download
            a completed PDF.
          </p>
          <HeroProductMockup onStart={onStart} />
        </div>
      </div>
    </section>
  );
}

function HeroProductMockup({ onStart }: { onStart: () => void }) {
  return (
    <div className="mt-10 w-full max-w-5xl rounded-[28px] border border-ink/20 bg-ink p-3 shadow-2xl shadow-ink/25 lg:mt-12">
      <div className="rounded-[22px] bg-card p-4 text-left lg:p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">
              Illustrative autofill workspace
            </p>
            <h2 className="font-display text-xl font-bold text-foreground">Review mapped form</h2>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            Open workspace
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="rounded-2xl border border-border bg-cream/65 p-4">
            <div className="mb-3 flex items-center justify-between text-xs font-bold text-muted-foreground">
              <span>Source package</span>
              <span>Example</span>
            </div>
            <div className="space-y-3">
              <HeroMiniStep
                icon={<FileText size={15} />}
                title="City of Montebello: Proposal Guarantee"
                meta="Bid bond PDF"
              />
              <HeroMiniStep
                icon={<Keyboard size={15} />}
                title="Business information"
                meta="Form-specific source details"
              />
              <HeroMiniStep
                icon={<Brain size={15} />}
                title="Field mapping"
                meta="Mapped values ready for review"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              <div className="text-center font-serif text-[10px] font-bold tracking-[0.18em] text-ink">
                PROPOSAL GUARANTEE
              </div>
              <div className="mt-5 space-y-3">
                <HeroDocLine label="PROJECT NAME" value="LED Sign City Hall" />
                <HeroDocLine label="BIDDER" value="Westline Electric LLC" />
                <HeroDocLine label="PENAL SUM" value="$18,500.00" />
                <HeroDocLine label="BIDDER TITLE" value="Required field" missing />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-muted-foreground">Mapped fields</p>
                <span className="rounded-full bg-cream px-2 py-1 text-[10px] font-bold text-ink">
                  15 / 16
                </span>
              </div>
              <HeroField label="Bid amount" value="$185,000.00" status="Verified" />
              <HeroField label="Project" value="LED Sign City Hall" status="Verified" />
              <HeroField label="Bidder title" value="Needs input" status="Missing" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroMiniStep({
  icon,
  title,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-ink">
        {icon}
      </span>
      <div>
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
    </div>
  );
}

function HeroDocLine({
  label,
  value,
  missing = false,
}: {
  label: string;
  value: string;
  missing?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold text-muted-foreground">{label}</p>
      <div
        className={`mt-1 border-b px-1 py-1 text-[11px] font-bold ${missing ? "border-destructive bg-destructive/5 text-destructive" : "border-steel-blue/30 bg-cream/45 text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function HeroField({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "Verified" | "Missing";
}) {
  return (
    <div className="mb-2 rounded-xl border border-border p-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold">
        <span className="text-muted-foreground">{label}</span>
        <span className={status === "Missing" ? "text-destructive" : "text-success"}>{status}</span>
      </div>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SchemaReviewScreen({
  schema,
  setSchema,
  previewImages,
  trace,
  filename,
  busy,
  error,
  onBack,
  onApprove,
}: {
  schema: SchemaDraft;
  setSchema: (schema: SchemaDraft) => void;
  previewImages: string[];
  trace: SchemaReviewResponse["trace"];
  filename: string;
  busy: boolean;
  error: string;
  onBack: () => void;
  onApprove: () => void;
}) {
  const candidates = useMemo(() => schemaCandidates(trace), [trace]);
  const available = availableCandidates(schema, candidates);
  const previewPages = [...new Set(candidates.map((candidate) => candidate.page))];
  const [pageNumber, setPageNumber] = useState(previewPages[0] ?? 1);
  const [selectedAlias, setSelectedAlias] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newAlias, setNewAlias] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newManual, setNewManual] = useState(false);
  const [formError, setFormError] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<SchemaDraft | null>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const pageIndex = Math.max(0, previewPages.indexOf(pageNumber));
  const pageSize = schema.pages?.[pageNumber - 1];
  const selectedField = schema.fields.find((field) =>
    (field.aliases ?? [field.alias]).includes(selectedAlias ?? ""),
  );
  const selectedCandidate = candidates.find((candidate) => candidate.alias === selectedAlias);

  useEffect(() => {
    if (!selectedAlias) return;
    const frame = window.requestAnimationFrame(() => {
      previewScrollRef.current
        ?.querySelector<HTMLElement>(`[data-schema-alias="${selectedAlias}"]`)
        ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pageNumber, selectedAlias]);

  const selectCandidate = (alias: string, page: number) => {
    setSelectedAlias(alias);
    setPageNumber(page);
    if (!schema.fields.some((field) => (field.aliases ?? [field.alias]).includes(alias))) {
      setAdding(true);
      setNewAlias(alias);
      setFormError("");
    }
  };

  const handleAdd = () => {
    const candidate = available.find((item) => item.alias === newAlias);
    if (!candidate) {
      setFormError("Choose a highlighted location on the form.");
      return;
    }
    try {
      setSchema(addSchemaField(schema, candidate, newLabel, newDescription, newManual));
      setSelectedAlias(candidate.alias);
      setPageNumber(candidate.page);
      setAdding(false);
      setNewAlias("");
      setNewLabel("");
      setNewDescription("");
      setNewManual(false);
      setFormError("");
      setUndoSnapshot(null);
    } catch (addError) {
      setFormError(addError instanceof Error ? addError.message : "This field could not be added.");
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#F7F8FB]">
      <div className="shrink-0 border-b border-border bg-white px-4 py-4 lg:px-7">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cream text-ink">
            <FileCheck2 size={19} />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold sm:text-2xl">
              Review this template schema
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {filename} · Select a field to find it on the form. Add missing fields or remove
              incorrect ones.
            </p>
          </div>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(350px,0.9fr)]">
        <div className="flex min-h-[45vh] min-w-0 flex-col border-b border-border lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-white px-4 py-3">
            <span className="text-sm font-bold">Annotated form preview</span>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous page"
                disabled={pageIndex <= 0}
                onClick={() => setPageNumber(previewPages[pageIndex - 1] ?? pageNumber)}
              >
                <ChevronLeft size={16} />
              </Button>
              Page {pageNumber} of {previewImages.length}
              <Button
                variant="outline"
                size="icon"
                aria-label="Next page"
                disabled={pageIndex >= previewImages.length - 1}
                onClick={() => setPageNumber(previewPages[pageIndex + 1] ?? pageNumber)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
          <div ref={previewScrollRef} className="min-h-0 flex-1 overflow-auto p-4">
            {previewImages[pageIndex] && pageSize ? (
              <div className="relative mx-auto w-full max-w-[760px] border border-border bg-white shadow-lg">
                <img
                  src={`data:image/png;base64,${previewImages[pageIndex]}`}
                  alt={`Page ${pageNumber} with detected field locations`}
                  className="block w-full"
                />
                {candidates
                  .filter((candidate) => candidate.page === pageNumber)
                  .map((candidate) => {
                    const [x0, y0, x1, y1] = candidate.rect;
                    const assigned = schema.fields.some((field) =>
                      (field.aliases ?? [field.alias]).includes(candidate.alias),
                    );
                    return (
                      <button
                        key={candidate.alias}
                        data-schema-alias={candidate.alias}
                        type="button"
                        aria-label={`${assigned ? "Show" : "Add"} field at ${candidate.alias}`}
                        aria-pressed={selectedAlias === candidate.alias}
                        onClick={() => selectCandidate(candidate.alias, candidate.page)}
                        className={`absolute cursor-pointer border-2 bg-transparent transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary ${selectedAlias === candidate.alias ? "border-primary shadow-[0_0_0_3px_rgba(10,22,65,0.25)]" : "border-transparent"}`}
                        style={{
                          left: `${(x0 / pageSize.width) * 100}%`,
                          top: `${(y0 / pageSize.height) * 100}%`,
                          width: `${Math.max(((x1 - x0) / pageSize.width) * 100, 1)}%`,
                          height: `${Math.max(((y1 - y0) / pageSize.height) * 100, 1)}%`,
                        }}
                      />
                    );
                  })}
                {selectedField &&
                  selectedField.page === pageNumber &&
                  (selectedField.entry_regions?.length
                    ? selectedField.entry_regions
                    : [selectedField.entry_bbox]
                  ).map((rect, index) => (
                    <div
                      key={`selected-region-${index}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_2px_white]"
                      style={{
                        left: `${(rect[0] / pageSize.width) * 100}%`,
                        top: `${(rect[1] / pageSize.height) * 100}%`,
                        width: `${((rect[2] - rect[0]) / pageSize.width) * 100}%`,
                        height: `${((rect[3] - rect[1]) / pageSize.height) * 100}%`,
                      }}
                    />
                  ))}
              </div>
            ) : (
              <p className="rounded-xl border border-border bg-white p-4 text-sm text-muted-foreground">
                Preview unavailable for this page.
              </p>
            )}
          </div>
        </div>
        <div className="min-h-0 overflow-auto p-4 lg:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Fields on this form</h2>
              <p className="text-xs text-muted-foreground">
                {schema.fields.length} fields selected
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || available.length === 0}
              onClick={() => {
                setAdding(true);
                setNewAlias(available[0]?.alias ?? "");
                setFormError("");
              }}
            >
              <Plus size={15} /> Add field
            </Button>
          </div>
          {undoSnapshot && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-xs">
              Field removed from this draft.
              <button
                type="button"
                className="font-bold text-primary underline"
                onClick={() => {
                  setSchema(undoSnapshot);
                  setUndoSnapshot(null);
                }}
              >
                Undo
              </button>
            </div>
          )}
          {adding && (
            <div className="mb-4 rounded-xl border border-primary/30 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">Add a field</h3>
                <button type="button" aria-label="Close add field" onClick={() => setAdding(false)}>
                  <X size={16} />
                </button>
              </div>
              <label className="block text-xs font-semibold">
                Location on form
                <select
                  value={newAlias}
                  onChange={(event) => {
                    setNewAlias(event.target.value);
                    const candidate = available.find((item) => item.alias === event.target.value);
                    if (candidate) selectCandidate(candidate.alias, candidate.page);
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                >
                  <option value="">Choose a location</option>
                  {available.map((candidate) => (
                    <option key={candidate.alias} value={candidate.alias}>
                      {candidate.alias} · Page {candidate.page}
                      {candidate.nearbyWords.length
                        ? ` · ${candidate.nearbyWords.slice(0, 4).join(" ")}`
                        : candidate.acroName
                          ? ` · ${candidate.acroName}`
                          : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-xs font-semibold">
                Field name
                <input
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="e.g. Surety address"
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
              </label>
              <label className="mt-3 block text-xs font-semibold">
                What belongs here?
                <Textarea
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  placeholder="Describe the value to use from the source"
                  className="mt-1 min-h-20 text-sm"
                />
              </label>
              <label className="mt-3 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={newManual}
                  onChange={(event) => setNewManual(event.target.checked)}
                />{" "}
                Completed by hand (signature, seal, or initials)
              </label>
              {selectedCandidate &&
                !available.some((candidate) => candidate.alias === selectedCandidate.alias) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This location is already included below.
                  </p>
                )}
              {formError && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {formError}
                </p>
              )}
              <Button size="sm" className="mt-3" onClick={handleAdd} disabled={busy}>
                <Plus size={14} /> Add to form
              </Button>
            </div>
          )}
          <div className="space-y-3">
            {schema.fields.map((field) => (
              <div
                key={field.field_id}
                className={`rounded-xl border bg-white p-4 shadow-sm ${selectedField?.field_id === field.field_id ? "border-primary ring-1 ring-primary/20" : "border-border"}`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => selectCandidate(field.alias, field.page)}
                    aria-label={`Show ${field.label} on page ${field.page}`}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {field.alias} · Page {field.page}
                      {field["manual"] ? " · Manual" : ""}
                    </span>
                    <h3 className="mt-1 font-semibold">{field.label}</h3>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${field.label}`}
                    title={`Remove ${field.label}`}
                    disabled={busy}
                    className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
                    onClick={() => {
                      setUndoSnapshot(schema);
                      setSchema(removeSchemaField(schema, field.field_id));
                      if (selectedField?.field_id === field.field_id) setSelectedAlias(null);
                    }}
                  >
                    <X size={17} />
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {field.description || "No description provided."}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {field.entry_regions?.length ?? 1} writing line(s)
                  {field["date_role"] ? ` · ${String(field["date_role"])} date` : ""}
                </p>
              </div>
            ))}
            {schema.fields.length === 0 && (
              <p className="rounded-xl border border-border bg-white p-4 text-sm text-muted-foreground">
                No fields selected. Add at least one field to continue.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-border bg-white px-4 py-3 lg:px-7">
        {error && (
          <div className="mb-3">
            <InlineAlert>{error}</InlineAlert>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onBack} disabled={busy}>
            Back
          </Button>
          <Button onClick={onApprove} disabled={busy || schema.fields.length === 0}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}Approve
            schema and continue
          </Button>
        </div>
      </div>
    </section>
  );
}

function SourceScreen({
  busy,
  file,
  fileInputRef,
  inputError,
  onFileChange,
  onRawTextChange,
  instructions,
  onInstructionsChange,
  liveEvents,
  onSubmit,
  rawText,
  requestError,
  hasApiResponse,
  onViewResponse,
}: {
  busy: boolean;
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  inputError: string;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRawTextChange: (value: string) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  liveEvents: WorkflowEvent[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  rawText: string;
  requestError: string;
  hasApiResponse: boolean;
  onViewResponse: () => void;
}) {
  const currentProgress = loadingProgress(liveEvents);
  return (
    <section className="flex h-full items-center justify-center overflow-auto bg-[#F7F8FB] px-4 py-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1120px] overflow-hidden rounded-[28px] border border-border bg-white shadow-xl shadow-ink/10 lg:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]">
        <aside className="flex min-w-0 flex-col justify-between gap-8 bg-ink p-6 text-primary-foreground lg:p-8">
          <div>
            <LogoMark />
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground/60">
              Source information
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight">
              Prepare your bond form
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-primary-foreground/70">
              Upload the PDF and provide the business information that should be used to fill it.
            </p>
          </div>
          <div className="space-y-3 rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-primary-foreground/60">
              Before you continue
            </p>
            <ul className="space-y-2 text-sm leading-5 text-primary-foreground/85">
              <li className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0" /> PDF up to 20 MiB, 1–3 pages
              </li>
              <li className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0" /> Selectable text or a scan supported
                by OCR
              </li>
              <li className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0" /> Source information up to 100,000
                characters
              </li>
              <li className="flex gap-2">
                <Info size={15} className="mt-0.5 shrink-0" /> Automatic field detection currently
                covers page 1
              </li>
            </ul>
          </div>
        </aside>

        <form className="min-w-0 space-y-5 p-5 sm:p-7 lg:p-8" onSubmit={onSubmit}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Start an autofill</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your PDF and source text are sent to the autofill service.
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cream text-ink">
                  <FileText size={20} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold">Bond form PDF</h3>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {file ? `${file.name} · ${formatSize(file.size)}` : "Choose a PDF to fill"}
                  </p>
                </div>
              </div>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted">
                <Upload size={15} />
                {file ? "Change PDF" : "Choose PDF"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={busy}
                  className="sr-only"
                  onChange={onFileChange}
                />
              </label>
            </div>
            {file && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs font-semibold text-success">
                <Check size={14} /> PDF selected and ready
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-cream text-ink">
                  <FileText size={20} />
                </span>
                <div>
                  <h3 className="font-bold">Business information</h3>
                  <p className="text-sm text-muted-foreground">
                    Paste the source details for this form
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 text-xs font-semibold ${rawText.length > MAX_RAW_TEXT_CHARS ? "text-destructive" : "text-muted-foreground"}`}
              >
                {rawText.length.toLocaleString()} / 100,000
              </span>
            </div>
            <Textarea
              value={rawText}
              onChange={(event) => onRawTextChange(event.target.value)}
              disabled={busy}
              className="min-h-40 resize-y rounded-xl border-border bg-cream/20 p-3 text-sm leading-6"
              placeholder="Paste the project, bidder, obligee, bid amount, dates, and other relevant details…"
              aria-label="Business information"
            />
          </section>

          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5">
            <h3 className="font-bold">Optional instructions</h3>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">
              Add context or preferences for mapping the source information.
            </p>
            <Textarea
              value={instructions}
              onChange={(event) => onInstructionsChange(event.target.value)}
              disabled={busy}
              className="min-h-20 resize-y rounded-xl border-border bg-cream/20 p-3 text-sm leading-6"
              placeholder="For example: use the legal business name exactly as written."
              aria-label="Optional workflow instructions"
            />
          </section>

          {(inputError || requestError) && (
            <InlineAlert>
              {inputError || requestError}
              {hasApiResponse && (
                <button
                  type="button"
                  className="ml-2 inline-flex items-center gap-1 font-bold underline underline-offset-2"
                  onClick={onViewResponse}
                >
                  <Eye size={13} /> View API response
                </button>
              )}
            </InlineAlert>
          )}

          {!busy && liveEvents.length > 0 && (
            <details className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer font-semibold">Workflow trace</summary>
              <div className="mt-3 space-y-1">
                {liveEvents.map((event, index) => (
                  <div key={`${event.event}-${index}`}>
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="truncate">
                        {String(event.data["label"] ?? event.data["tool"] ?? event.event)}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {String(event.data["status"] ?? "received")}
                      </span>
                    </div>
                    {typeof event.data["error"] === "string" && event.data["error"] && (
                      <p className="text-xs text-destructive">{event.data["error"]}</p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="pt-2" aria-busy={busy}>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cream text-ink">
                <Brain size={19} />
              </span>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {busy ? "Workflow progress" : "Field mapping"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {busy ? currentProgress.stage : "Map your PDF and source information"}
                </p>
              </div>
            </div>
            {busy ? (
              <AnalysisLoadingCard
                progress={currentProgress.progress}
                stageLabel={currentProgress.stage}
                label={`Running ${currentProgress.label}…`}
              />
            ) : (
              <Button type="submit" className="h-12 w-full rounded-xl text-sm font-bold">
                <Sparkles size={17} /> Run AI parse & map <ChevronRight size={17} />
              </Button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function WorkflowResultScreen({
  result,
  pdfUrl,
  pdfBase64,
  file,
  sourceText,
  instructions,
  onEditSource,
}: {
  result: WorkflowResponse;
  pdfUrl: string | null;
  pdfBase64: string | null;
  file: File | null;
  sourceText: string;
  instructions: string;
  onEditSource: () => void;
}) {
  const fields = useMemo(() => toReviewFields(result), [result]);
  const { values, dirty, setValue } = useFieldValues(fields, result.workflow_id);
  const [selectedId, setSelectedId] = useState<string | null>(fields[0]?.field_id ?? null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(() =>
    Math.max(1, ...fields.map((field) => field.page)),
  );
  const [zoom, setZoom] = useState(defaultZoom);
  const [showHighlights, setShowHighlights] = useState(false);
  const mappedCount = fields.filter(
    (field) => (values[field.field_id] ?? field.mapped_value ?? "") !== "",
  ).length;
  const reviewCount = result.unresolved_fields.length;
  const completed = result.status === "completed" && reviewCount === 0;
  const [downloading, setDownloading] = useState<PdfType | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const triggerDownload = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadEditablePdf = async () => {
    if (!pdfBase64) {
      setDownloadError("The filled PDF is no longer available. Edit the source and rerun.");
      return;
    }
    setDownloadError("");
    setDownloading("acroform");
    try {
      const blob = await buildAcroFormPdf(pdfBase64, fields, values);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, result.pdf_filename || "filled_document.pdf");
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Could not prepare the editable PDF.",
      );
    } finally {
      setDownloading(null);
    }
  };

  const downloadNormalPdf = async () => {
    if (!pdfBase64) {
      setDownloadError("The filled PDF is no longer available. Edit the source and rerun.");
      return;
    }
    setDownloading("normal");
    setDownloadError("");
    try {
      // Build an editable PDF from the latest review values, then flatten it.
      // This avoids re-running the AI workflow and preserves edits made on the
      // result screen.
      const filledBlob = await buildAcroFormPdf(pdfBase64, fields, values);
      const flatBlob = await flattenPdf(
        filledBlob,
        result.pdf_filename || file?.name || "filled_document.pdf",
      );
      const url = URL.createObjectURL(flatBlob);
      triggerDownload(url, `normal_${result.pdf_filename || file?.name || "filled_document.pdf"}`);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Could not download the normal PDF.",
      );
    } finally {
      setDownloading(null);
    }
  };

  useEffect(() => {
    if (selectedId) {
      const selected = fields.find((field) => field.field_id === selectedId);
      if (selected) setPage(selected.page);
      document
        .getElementById(`field-card-${selectedId}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [fields, selectedId]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 lg:px-8">
        <div>
          <h1 className="font-display text-xl font-bold">
            {completed
              ? "Form ready"
              : result.status === "failed"
                ? "Workflow failed"
                : "Review results"}
          </h1>
          <p className="text-sm text-muted-foreground">{result.pdf_filename || "Uploaded PDF"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEditSource} disabled={downloading !== null}>
            <ArrowLeft size={15} /> Edit source and rerun
          </Button>
          {/* Split download button: main action downloads the normal (flattened)
              PDF; the dropdown arrow exposes both format choices. */}
          <div className="flex items-center">
            <Button
              onClick={() => void downloadNormalPdf()}
              disabled={!pdfBase64 || downloading !== null}
              className="rounded-r-none"
            >
              {downloading === "normal" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {downloading === "normal" ? "Preparing PDF…" : "Download PDF"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={!pdfBase64 || downloading !== null}
                  className="rounded-l-none border-l border-primary-foreground/20 px-2"
                >
                  <ChevronDown size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Choose PDF format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void downloadNormalPdf()}
                  disabled={!pdfBase64 || downloading !== null}
                  className="items-start gap-2 py-2"
                >
                  <FileCheck2 size={16} className="mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">Normal PDF</span>
                    <span className="text-xs text-muted-foreground">
                      {downloading === "normal"
                        ? "Preparing normal PDF…"
                        : "Values burned in, locked for sharing"}
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void downloadEditablePdf()}
                  disabled={!pdfBase64 || downloading !== null}
                  className="items-start gap-2 py-2"
                >
                  <FileText size={16} className="mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">Editable PDF</span>
                    <span className="text-xs text-muted-foreground">
                      {downloading === "acroform"
                        ? "Preparing editable PDF…"
                        : "Form fields stay fillable (AcroForm)"}
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {downloadError && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-5 py-2 text-sm text-destructive">
          {downloadError}
        </div>
      )}

      {!completed && result.status !== "failed" && (
        <div className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-950">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>
            {reviewCount > 0
              ? `${reviewCount} field${reviewCount === 1 ? " needs" : "s need"} review. Check the values before using the PDF.`
              : "The workflow completed with items that need review."}
          </span>
        </div>
      )}
      {result.status === "failed" && result.error && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive">
          {result.error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="min-h-[360px] border-b border-border lg:border-b-0 lg:border-r">
          {pdfUrl ? (
            <div className="flex h-full min-h-[360px] flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">PDF</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Previous page"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="min-w-20 text-center">
                    Page {page} of {pageCount}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Next page"
                    disabled={page >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-border px-2 py-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Zoom out"
                    disabled={zoom <= zoomLevels[0]}
                    onClick={() => setZoom((value) => zoomStep(value, -1))}
                  >
                    <ZoomOut size={15} />
                  </Button>
                  <span className="min-w-12 text-center text-xs font-semibold">{zoom}%</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Zoom in"
                    disabled={zoom >= (zoomLevels.at(-1) ?? defaultZoom)}
                    onClick={() => setZoom((value) => zoomStep(value, 1))}
                  >
                    <ZoomIn size={15} />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant={showHighlights ? "outline" : "ghost"}
                  aria-pressed={showHighlights}
                  onClick={() => setShowHighlights((value) => !value)}
                >
                  <Eye size={15} />
                  {showHighlights ? "Hide highlights" : "Show highlights"}
                </Button>
              </div>
              {dirty.size > 0 && (
                <div
                  className="border-b px-4 py-1 text-xs font-medium text-primary"
                  aria-live="polite"
                >
                  Live preview · {dirty.size} field{dirty.size === 1 ? "" : "s"} edited
                </div>
              )}
              <FilledPdfPreview
                pdfUrl={pdfUrl}
                fields={fields}
                values={values}
                onValueChange={setValue}
                selectedFieldId={selectedId}
                onSelectField={setSelectedId}
                page={page}
                scale={zoom / 100}
                showHighlights={showHighlights}
                onPageCountChange={setPageCount}
              />
            </div>
          ) : (
            <div className="flex h-full min-h-[360px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
              No PDF was produced. Review the tool trace, edit the source information, and rerun.
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto p-4 lg:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Mapped fields</h2>
            <span className="text-xs text-muted-foreground">
              {mappedCount} / {fields.length} mapped
            </span>
          </div>
          <div className="space-y-2">
            {fields.map((field) => {
              const currentValue = values[field.field_id] ?? field.mapped_value ?? "";
              return (
                <div
                  key={field.field_id}
                  id={`field-card-${field.field_id}`}
                  onClick={() => {
                    setSelectedId(field.field_id);
                    setPage(field.page);
                  }}
                  className={`w-full rounded-xl border p-3 text-left ${selectedId === field.field_id ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{field.label}</span>
                    <span
                      className={`shrink-0 text-xs font-semibold ${field.status === "filled" ? "text-success" : "text-amber-700"}`}
                    >
                      {currentValue
                        ? field.status === "filled"
                          ? "Filled · editable"
                          : "Needs review · editable"
                        : field.status === "filled"
                          ? "Filled · editable"
                          : field.mapped_value
                            ? "Needs review"
                            : "Unmapped"}
                    </span>
                  </div>
                  <label
                    className="mt-2 block text-xs font-medium text-muted-foreground"
                    htmlFor={`edit-${field.field_id}`}
                  >
                    Value
                  </label>
                  <input
                    id={`edit-${field.field_id}`}
                    value={currentValue}
                    disabled={field.field_type.toLowerCase().includes("signature")}
                    onFocus={() => {
                      setSelectedId(field.field_id);
                      setPage(field.page);
                    }}
                    onChange={(event) => setValue(field.field_id, event.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-muted"
                    placeholder="Enter a value"
                  />
                  {field.source_quote && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Evidence: {field.source_quote}
                    </p>
                  )}
                  {field.reason && (
                    <p className="mt-2 text-xs text-amber-800">Review: {field.reason}</p>
                  )}
                </div>
              );
            })}
            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">No field results were returned.</p>
            )}
          </div>
          <details
            className="mt-5 rounded-xl border border-border p-3"
            open={result.status === "failed"}
          >
            <summary className="cursor-pointer font-semibold">Agent and tool trace</summary>
            <div className="mt-3 space-y-2">
              {result.tool_calls.map((call, index) => (
                <div
                  key={`${String(call["tool"])}-${index}`}
                  className="rounded-lg bg-muted/50 p-3 text-sm"
                >
                  <div className="flex justify-between gap-2 font-semibold">
                    <span>{String(call["label"] ?? call["tool"] ?? "Workflow step")}</span>
                    <span>{String(call["status"] ?? "unknown")}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {String(call["error"] || call["output_summary"] || "")}
                  </p>
                </div>
              ))}
              {result.tool_calls.length === 0 && (
                <p className="text-sm text-muted-foreground">No tool events were recorded.</p>
              )}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

type ReviewFilter = "all" | ReviewStatus;

const zoomLevels = [75, 100, 125, 150, 175, 200] as const;
const defaultZoom = 150;

function zoomStep(current: number, direction: -1 | 1) {
  const nextIndex = zoomLevels.findIndex((level) => level >= current);
  const index = nextIndex === -1 ? zoomLevels.length - 1 : nextIndex;
  return zoomLevels[Math.min(zoomLevels.length - 1, Math.max(0, index + direction))] ?? defaultZoom;
}

function ResultScreen({
  result,
  pdfUrl,
  error,
  onEditSource,
  finalizing,
  onFinalize,
}: {
  result: AutofillResponse;
  pdfUrl: string;
  error: string;
  onEditSource: () => void;
  finalizing: boolean;
  onFinalize: (decisions: FieldDecision[]) => void;
}) {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);
  const [reviewEdits, setReviewEdits] = useState<Record<string, ReviewEdit>>({});
  const [mobileTab, setMobileTab] = useState<"pdf" | "fields">("fields");
  const [fieldFilter, setFieldFilter] = useState<ReviewFilter>(() =>
    result.fields.some((field) => reviewFieldStatus(field) === "fix")
      ? "fix"
      : result.fields.some((field) => field.mapping_status === "review")
        ? "review"
        : "all",
  );
  const [pdfPage, setPdfPage] = useState(1);
  const [zoom, setZoom] = useState(defaultZoom);
  const [draftSaved, setDraftSaved] = useState(false);
  const reviewListRef = useRef<HTMLDivElement>(null);
  const fieldCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const reviewFields = result.fields.filter(needsDecision);
  const proposedDecisions = reviewFields.map((field) =>
    reviewDecision(
      field,
      reviewEdits[field.field_id],
      approvedIds.includes(field.field_id),
      rejectedIds.includes(field.field_id),
    ),
  );
  const pendingFields = reviewFields.filter((_, index) => proposedDecisions[index] === null);
  const decisions = proposedDecisions.filter(
    (decision): decision is FieldDecision => decision !== null,
  );

  const mappedCount = result.fields.filter((field) => field.mapping_status !== "missing").length;
  const missingCount = result.fields.filter(
    (field) => reviewFieldStatus(field) === "missing",
  ).length;
  const reviewCount = result.fields.filter((field) => reviewFieldStatus(field) === "review").length;
  const fixCount = result.fields.filter((field) => reviewFieldStatus(field) === "fix").length;
  const manualCount = result.fields.filter((field) => reviewFieldStatus(field) === "manual").length;
  const verifiedCount = result.fields.filter(
    (field) => reviewFieldStatus(field) === "verified",
  ).length;

  useEffect(() => {
    if (!result.requires_approval) setFieldFilter("all");
  }, [result.requires_approval]);

  const chooseFilter = (nextFilter: ReviewFilter) => {
    setFieldFilter(nextFilter);
    reviewListRef.current?.scrollTo({ top: 0 });
  };

  const selectPage = (nextPage: number) => {
    setPdfPage(nextPage);
    setSelectedFieldId(result.fields.find((field) => field.page === nextPage)?.field_id ?? null);
    reviewListRef.current?.scrollTo({ top: 0 });
  };

  const selectField = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    const field = result.fields.find((item) => item.field_id === fieldId);
    if (field) setPdfPage(field.page);
  };

  const selectDocumentField = (fieldId: string) => {
    setFieldFilter("all");
    selectField(fieldId);
    window.requestAnimationFrame(() => {
      fieldCardRefs.current[fieldId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const adjustZoom = (delta: number) => {
    setZoom((current) => {
      const currentIndex = zoomLevels.findIndex((level) => level === current);
      const safeIndex = currentIndex === -1 ? zoomLevels.indexOf(defaultZoom) : currentIndex;
      const nextIndex = Math.min(
        zoomLevels.length - 1,
        Math.max(0, safeIndex + (delta > 0 ? 1 : -1)),
      );
      return zoomLevels[nextIndex] ?? current;
    });
  };

  const saveDraft = () => {
    setDraftSaved(true);
    window.setTimeout(() => setDraftSaved(false), 1600);
  };

  const canZoomOut = zoom > zoomLevels[0];
  const canZoomIn = zoom < (zoomLevels.at(-1) ?? defaultZoom);

  const filterOptions: {
    id: ReviewFilter;
    label: string;
    count: number;
    activeClass: string;
  }[] = [
    {
      id: "all",
      label: "All fields",
      count: result.fields.length,
      activeClass: "border-primary bg-primary text-primary-foreground",
    },
    {
      id: "verified",
      label: "Verified",
      count: verifiedCount,
      activeClass: "border-success/40 bg-success/10 text-success",
    },
    {
      id: "review",
      label: "Approve",
      count: reviewCount,
      activeClass: "border-warning/40 bg-warning/10 text-warning",
    },
    {
      id: "fix",
      label: "Needs edit",
      count: fixCount,
      activeClass: "border-warning/40 bg-warning/10 text-warning",
    },
    {
      id: "missing",
      label: "Missing",
      count: missingCount,
      activeClass: "border-destructive/40 bg-destructive/10 text-destructive",
    },
    {
      id: "manual",
      label: "Manual",
      count: manualCount,
      activeClass: "border-steel-blue/40 bg-cream text-steel-blue",
    },
  ];

  const visiblePages =
    fieldFilter === "all"
      ? [pdfPage]
      : Array.from(new Set(result.fields.map((field) => field.page))).sort((a, b) => a - b);

  const visibleSections = visiblePages
    .map((pageNumber) => ({
      heading: `Page ${pageNumber}`,
      pageNumber,
      fields: result.fields
        .filter((field) => field.page === pageNumber)
        .filter((field) => fieldFilter === "all" || reviewFieldStatus(field) === fieldFilter),
    }))
    .filter((section) => section.fields.length > 0);

  const firstPending = pendingFields[0];
  const validationError = firstPending
    ? needsPlacementEdit(firstPending)
      ? `Edit ${firstPending.label} to a shorter, source-supported value and confirm it.`
      : `Review ${firstPending.label}: confirm a value, or mark it missing.`
    : missingCount > 0
      ? `${missingCount} field${missingCount === 1 ? "" : "s"} will remain blank.`
      : manualCount > 0
        ? `${manualCount} field${manualCount === 1 ? "" : "s"} require manual completion after download.`
        : result.requires_approval
          ? "Ready to generate. The PDF will be checked again before download."
          : null;
  const allRequiredComplete =
    !error &&
    !result.requires_approval &&
    pendingFields.length === 0 &&
    missingCount === 0 &&
    manualCount === 0;

  const pdfPanel = (
    <section className="flex h-full min-h-[560px] min-w-0 flex-col border-b border-border bg-white lg:min-h-0 lg:border-b-0 lg:border-r">
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-border bg-white px-4">
        <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
          <span className="truncate text-xs font-bold uppercase text-steel-blue">
            {result.filename}
          </span>
          <span className="hidden whitespace-nowrap text-xs text-muted-foreground xl:inline">
            {result.fields.length} fields
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1" aria-label="PDF page navigation">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => selectPage(Math.max(1, pdfPage - 1))}
            disabled={pdfPage === 1}
            aria-label="Previous page"
            className="size-7 rounded-full"
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-16 text-center text-xs font-bold text-foreground">
            Page {pdfPage} of {result.pages.length}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => selectPage(Math.min(result.pages.length, pdfPage + 1))}
            disabled={pdfPage === result.pages.length}
            aria-label="Next page"
            className="size-7 rounded-full"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="flex shrink-0 items-center rounded-full border border-border bg-white p-1 shadow-sm">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom out"
            onClick={() => adjustZoom(-25)}
            disabled={!canZoomOut}
            className="size-7 rounded-full"
          >
            <Minus size={14} />
          </Button>
          <span className="w-14 text-center text-xs font-bold text-foreground">{zoom}%</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom in"
            onClick={() => adjustZoom(25)}
            disabled={!canZoomIn}
            className="size-7 rounded-full"
          >
            <Plus size={14} />
          </Button>
        </div>
      </div>
      <FilledPdfPreview
        pdfUrl={pdfUrl}
        pages={result.pages}
        fields={result.fields}
        showBoxes={true}
        selectedFieldId={selectedFieldId}
        onSelectField={selectDocumentField}
        page={pdfPage}
        scale={zoom / 100}
      />
    </section>
  );

  const fieldsPanel = (
    <section className="flex h-full min-h-[620px] min-w-0 flex-col bg-white lg:min-h-0">
      <div className="border-b border-border bg-white px-4 py-3 lg:px-5">
        <div className="mx-auto max-w-[920px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-foreground">Review & approve</h2>
            <span className="shrink-0 rounded-full border border-border bg-white px-3 py-1 text-xs font-bold text-steel-blue shadow-sm">
              {mappedCount} / {result.fields.length} mapped
            </span>
          </div>
          <div className="mt-3 flex items-center gap-4 overflow-x-auto pb-1">
            <div
              className="flex shrink-0 items-center gap-2 whitespace-nowrap"
              aria-label="Filter review fields"
            >
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => chooseFilter(option.id)}
                  aria-pressed={fieldFilter === option.id}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    fieldFilter === option.id
                      ? option.activeClass
                      : "border-border bg-white text-ink hover:border-steel-blue/40"
                  }`}
                >
                  <strong className="font-display text-sm">{option.count}</strong>
                  {option.label}
                </button>
              ))}
            </div>
            <div
              className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap"
              aria-label="Review page fields"
            >
              {result.pages.map((pageInfo) => (
                <button
                  key={pageInfo.page}
                  type="button"
                  onClick={() => selectPage(pageInfo.page)}
                  aria-current={
                    fieldFilter === "all" && pdfPage === pageInfo.page ? "page" : undefined
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    fieldFilter === "all" && pdfPage === pageInfo.page
                      ? "bg-primary text-primary-foreground"
                      : "bg-cream text-ink hover:bg-cream/70"
                  }`}
                >
                  Page {pageInfo.page} ·{" "}
                  {result.fields.filter((field) => field.page === pageInfo.page).length}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={reviewListRef}
        className="min-h-0 flex-1 overflow-auto bg-[#F7F8FB] px-4 py-3 lg:px-5"
      >
        <div className="mx-auto max-w-[920px] space-y-5">
          {visibleSections.length > 0 ? (
            visibleSections.map((section) => (
              <section key={`${section.pageNumber}-${section.heading}`}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-steel-blue">
                  {section.heading}
                </h3>
                <div className="space-y-2.5">
                  {section.fields.map((field) => {
                    const status = reviewFieldStatus(field);
                    const isActive = selectedFieldId === field.field_id;
                    const isMissing = status === "missing";
                    const reviewValue =
                      reviewEdits[field.field_id]?.value ?? field.mapped_value ?? "";
                    const reviewQuote =
                      reviewEdits[field.field_id]?.quote ?? field.source_quote ?? "";
                    const rejected = rejectedIds.includes(field.field_id);
                    const isReviewApproval =
                      needsDecision(field) && Boolean(reviewValue.trim()) && !rejected;
                    return (
                      <div
                        key={field.field_id}
                        ref={(node) => {
                          fieldCardRefs.current[field.field_id] = node;
                        }}
                        className={`block cursor-pointer rounded-xl border p-3 shadow-sm transition-all ${
                          isActive
                            ? "border-ink bg-cream/35 shadow-md shadow-ink/8"
                            : isMissing
                              ? "border-destructive/30 bg-white hover:border-destructive/45"
                              : "border-border bg-white hover:border-steel-blue/40"
                        }`}
                        onClick={() => selectField(field.field_id)}
                      >
                        <span className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold text-steel-blue">
                          <span>{field.label}</span>
                          <FieldStatus status={status} />
                        </span>
                        <textarea
                          rows={status === "fix" ? 2 : 1}
                          value={reviewValue}
                          disabled={
                            status === "manual" ||
                            status === "missing" ||
                            status === "verified" ||
                            rejected
                          }
                          onChange={(event) => {
                            setReviewEdits((current) => ({
                              ...current,
                              [field.field_id]: { value: event.target.value, quote: reviewQuote },
                            }));
                            setApprovedIds((current) =>
                              current.filter((id) => id !== field.field_id),
                            );
                          }}
                          placeholder={isMissing ? "No mapped value" : undefined}
                          className="min-h-8 w-full resize-y border-0 bg-transparent text-sm font-bold text-foreground outline-none placeholder:text-destructive disabled:cursor-default"
                        />
                        <span className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] font-medium text-muted-foreground">
                          <span>Source: {field.source_quote || "Business information"}</span>
                          <span>Confidence: {isMissing ? "0%" : "N/A"}</span>
                        </span>
                        {status === "fix" && (
                          <p className="mt-2 text-xs font-semibold text-warning" role="note">
                            {field.reason || "This value could not be placed or verified."} Enter a
                            shorter value supported by the source, then confirm it.
                          </p>
                        )}
                        {status === "manual" && (
                          <p className="mt-2 text-xs font-semibold text-steel-blue">
                            Complete this field by hand after downloading the PDF.
                          </p>
                        )}
                        {status === "missing" && (
                          <p className="mt-2 text-xs font-semibold text-destructive">
                            No supported value was found. Add it to the source information and run
                            mapping again.
                          </p>
                        )}
                        {needsDecision(field) && !field.source_quote && !rejected && (
                          <input
                            type="text"
                            value={reviewQuote}
                            onChange={(event) => {
                              setReviewEdits((current) => ({
                                ...current,
                                [field.field_id]: { value: reviewValue, quote: event.target.value },
                              }));
                              setApprovedIds((current) =>
                                current.filter((id) => id !== field.field_id),
                              );
                            }}
                            placeholder="Paste an exact supporting quote from the source"
                            aria-label={`Source quote for ${field.label}`}
                            className="mt-2 h-8 w-full rounded-md border border-border bg-white px-2 text-xs"
                          />
                        )}
                        {isReviewApproval && (
                          <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-border pt-2 text-xs font-semibold text-steel-blue">
                            <input
                              type="checkbox"
                              checked={approvedIds.includes(field.field_id)}
                              onChange={(event) =>
                                setApprovedIds((current) =>
                                  event.target.checked
                                    ? [...new Set([...current, field.field_id])]
                                    : current.filter((id) => id !== field.field_id),
                                )
                              }
                              className="size-4 accent-primary"
                            />
                            I reviewed and approve this value
                          </label>
                        )}
                        {field.mapping_status === "review" && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRejectedIds((current) =>
                                rejected
                                  ? current.filter((id) => id !== field.field_id)
                                  : [...current, field.field_id],
                              );
                              setApprovedIds((current) =>
                                current.filter((id) => id !== field.field_id),
                              );
                            }}
                            className="mt-2 text-xs font-semibold text-steel-blue underline underline-offset-2"
                          >
                            {rejected ? "Undo mark missing" : "Mark missing and leave blank"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="rounded-xl border border-border bg-white p-6 text-center">
              <p className="text-sm font-semibold text-foreground">
                No {fieldFilter} fields to show.
              </p>
              <button
                type="button"
                className="mt-2 text-sm font-bold text-primary underline"
                onClick={() => chooseFilter("all")}
              >
                Show all fields
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-white px-4 py-2 shadow-[0_-10px_24px_oklch(0.1696_0.0914_265.04/0.05)] lg:px-5">
        <div className="mx-auto max-w-[920px]">
          {finalizing && (
            <div className="mb-2">
              <AnalysisLoadingCard
                label="Generating and verifying the final PDF…"
                stageLabel="Stage 4 of 4 · Fill and verify PDF"
                progress={90}
              />
            </div>
          )}
          {error && (
            <div className="mb-2" role="alert">
              <InlineAlert>Last attempt: {error}</InlineAlert>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className={`flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                allRequiredComplete ? "bg-success/10 text-success" : "bg-cream/80 text-ink"
              }`}
            >
              {allRequiredComplete ? (
                <Check size={15} className="shrink-0" />
              ) : (
                <AlertTriangle size={15} className="shrink-0" />
              )}
              <span>{validationError ?? "All required fields are complete."}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" className="h-10 rounded-xl" onClick={saveDraft}>
                {draftSaved ? <Check size={15} /> : <Save size={15} />}
                {draftSaved ? "Draft saved" : "Save draft"}
              </Button>
              {result.requires_approval ? (
                <Button
                  className="h-10 rounded-xl bg-primary px-5 font-bold text-primary-foreground hover:bg-deep-blue"
                  onClick={() => onFinalize(decisions)}
                  disabled={finalizing || pendingFields.length > 0}
                >
                  {finalizing ? "Generating PDF…" : "Approve & generate"} <ChevronRight size={16} />
                </Button>
              ) : (
                <Button asChild className="h-10 rounded-xl px-5 font-bold">
                  <a href={pdfUrl} download={result.output_filename}>
                    <Download size={16} /> Download PDF
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex min-h-[68px] items-center justify-between gap-4 border-b border-border bg-white px-5 py-2.5 lg:px-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <h1 className="font-display text-xl font-bold leading-6 text-foreground">
              Review mapped form
            </h1>
            <span className="hidden shrink-0 text-xs font-semibold text-success sm:inline">
              Fields mapped
            </span>
          </div>
          <p className="truncate text-sm font-medium text-steel-blue" title={result.filename}>
            {result.filename}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={onEditSource}>
          <ArrowLeft size={15} />
          Source
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 overflow-auto bg-white lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <div className="hidden min-h-0 lg:block lg:h-full">{pdfPanel}</div>

        <div className="flex h-full min-h-0 flex-col lg:hidden">
          <div className="flex border-b border-border bg-white px-4 pt-2">
            <button
              type="button"
              onClick={() => setMobileTab("fields")}
              className={`relative px-4 py-2 text-xs font-bold transition ${
                mobileTab === "fields" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              Fields
              {mobileTab === "fields" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-primary" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("pdf")}
              className={`relative px-4 py-2 text-xs font-bold transition ${
                mobileTab === "pdf" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              PDF Preview
              {mobileTab === "pdf" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-primary" />
              )}
            </button>
          </div>
          {mobileTab === "pdf" ? pdfPanel : fieldsPanel}
        </div>

        <div className="hidden h-full min-h-0 flex-col lg:flex">{fieldsPanel}</div>
      </div>
    </section>
  );
}

function FieldStatus({ status }: { status: ReviewStatus }) {
  if (status === "missing") {
    return (
      <span className="text-primary">
        <AlertTriangle size={13} className="mr-1 inline" />
        Missing
      </span>
    );
  }
  if (status === "review") {
    return (
      <span className="text-warning">
        <AlertTriangle size={13} className="mr-1 inline" />
        Review
      </span>
    );
  }
  if (status === "fix") {
    return (
      <span className="text-warning">
        <AlertTriangle size={13} className="mr-1 inline" />
        Needs edit
      </span>
    );
  }
  if (status === "manual") {
    return (
      <span className="text-steel-blue">
        <Info size={13} className="mr-1 inline" />
        Manual
      </span>
    );
  }
  return (
    <span className="text-success">
      <Check size={13} className="mr-1 inline" />
      Verified
    </span>
  );
}

function InlineAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm font-medium leading-5 text-destructive"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function LogoMark() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-ink/15">
      <FileCheck2 size={20} />
    </span>
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
