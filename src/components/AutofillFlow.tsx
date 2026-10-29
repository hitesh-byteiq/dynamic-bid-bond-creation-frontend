import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  Braces,
  Check,
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
import { Textarea } from "@/components/ui/textarea";
import { FilledPdfPreview } from "@/components/FilledPdfPreview";
import { RunTraceDialog } from "@/components/AutofillTraceDialogs";
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
  isAutofillFailure,
  isAutofillResponse,
  isFinalizeResponse,
  isSchemaReviewResponse,
  type AutofillFailure,
  type AutofillField,
  type AutofillResponse,
  type FieldDecision,
  type SchemaReviewResponse,
} from "@/lib/autofill";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_RAW_TEXT_CHARS = 100_000;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(
  /\/$/,
  "",
);

type WorkflowStage = "landing" | "source" | "schema" | "result";

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

function userFacingError(status: number, payload: unknown) {
  if (status === 400) {
    if (typeof payload === "object" && payload !== null && "detail" in payload) {
      const detail = (payload as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) return detail;
    }
    return "Check that the PDF is readable and the source information is not empty.";
  }
  if (status === 413) return "The PDF or source information is larger than the allowed limit.";
  if (status === 422) {
    return "This PDF could not be filled. Use an unlocked, text-based PDF with one to three pages.";
  }
  if (status === 502) return "Autofill could not complete right now. Please try again shortly.";
  if (status === 503)
    return "Autofill is temporarily unavailable. Please contact your administrator.";
  if (status >= 500) return "Something went wrong while completing the form. Please try again.";
  return "The request could not be completed. Check your information and try again.";
}

export function AutofillFlow() {
  const [stage, setStage] = useState<WorkflowStage>("landing");
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [inputError, setInputError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [busy, setBusy] = useState(false);
  const [responseViewerOpen, setResponseViewerOpen] = useState(false);
  const [runTraceOpen, setRunTraceOpen] = useState(false);
  const [failure, setFailure] = useState<AutofillFailure | null>(null);
  const [apiResponse, setApiResponse] = useState<unknown>(null);
  const [hasApiResponse, setHasApiResponse] = useState(false);
  const [result, setResult] = useState<AutofillResponse | null>(null);
  const [schemaReview, setSchemaReview] = useState<SchemaReviewResponse | null>(null);
  const [schemaDraft, setSchemaDraft] = useState<SchemaDraft | null>(null);
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
    setFailure(null);
    setPdfUrl(null);
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
    setFailure(null);
    setPdfUrl(null);

    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("raw_text", rawText);

    try {
      const response = await fetch(`${API_BASE_URL}/api/autofill`, {
        method: "POST",
        body: formData,
      });
      const responseText = await response.text();
      let payload: unknown = responseText;
      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch {
        // Keep a non-JSON error body available only in the explicit response viewer.
      }
      setApiResponse(payload);
      setHasApiResponse(true);

      if (!response.ok) {
        if (isAutofillFailure(payload)) setFailure(payload);
        setRequestError(userFacingError(response.status, payload));
        return;
      }
      if (isSchemaReviewResponse(payload)) {
        setSchemaReview(payload);
        setSchemaDraft(payload.schema as SchemaDraft);
        setStage("schema");
        return;
      }
      if (!isAutofillResponse(payload)) {
        setRequestError("Autofill returned an unexpected response. Please try again.");
        return;
      }

      let outputBlob: Blob;
      try {
        outputBlob = createPdfBlob(payload.pdf_base64, payload.pdf_mime_type);
      } catch {
        setRequestError(
          "Autofill returned an unreadable PDF. Please try again or view the response.",
        );
        return;
      }
      setResult(payload);
      setPdfUrl(URL.createObjectURL(outputBlob));
      setStage("result");
    } catch {
      setRequestError(
        "Could not read a response from the autofill service. Check that the backend allows this website's origin, then try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const approveSchema = async () => {
    if (!schemaReview || !schemaDraft) return;
    setBusy(true);
    setRequestError("");
    try {
      const update = await fetch(
        `${API_BASE_URL}/api/v1/stage2/schemas/${schemaReview.template.schema_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(schemaDraft),
        },
      );
      if (!update.ok) throw new Error("The template schema could not be saved.");
      const review = await fetch(
        `${API_BASE_URL}/api/v1/stage2/schemas/${schemaReview.template.schema_id}/review`,
        {
          method: "POST",
        },
      );
      if (!review.ok) throw new Error("The template schema could not be approved.");
      setSchemaReview(null);
      setSchemaDraft(null);
      setStage("source");
      await runAutofill();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The schema could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const finalizeRun = async (decisions: FieldDecision[]) => {
    if (!file || !result) return;
    setBusy(true);
    setRequestError("");
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("raw_text", rawText);
    formData.append("decisions", JSON.stringify({ run_id: result.run_id, decisions }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/autofill/finalize`, {
        method: "POST",
        body: formData,
      });
      const payload: unknown = await response.json();
      setApiResponse(payload);
      setHasApiResponse(true);
      if (!response.ok) {
        const detail =
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : "The PDF could not be finalized.";
        setRequestError(detail);
        return;
      }
      if (!isFinalizeResponse(payload)) {
        setRequestError("Finalization returned an unexpected response.");
        return;
      }
      const outputBlob = createPdfBlob(payload.pdf_base64, payload.pdf_mime_type);
      setPdfUrl(URL.createObjectURL(outputBlob));
      setResult((current) =>
        current
          ? {
              ...current,
              status: payload.fields.every((field) => field.status === "filled")
                ? "completed"
                : "partial",
              requires_approval: false,
              output_filename: payload.output_filename,
              fields: payload.fields,
              summary: {
                ...current.summary,
                mapped: payload.fields.filter((field) => field.mapped_value).length,
                filled: payload.fields.filter((field) => field.status === "filled").length,
                skipped: payload.fields.filter((field) => field.status === "skipped").length,
                review: payload.fields.filter((field) => field.mapping_status === "review").length,
                missing: payload.fields.filter((field) => field.status === "missing").length,
                overflow: payload.fields.filter((field) => field.placement_status === "overflow")
                  .length,
                manual: payload.fields.filter((field) => field.placement_status === "manual")
                  .length,
                verification_passed: payload.fields.filter(
                  (field) => field.verification_status === "passed",
                ).length,
              },
            }
          : current,
      );
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The PDF could not be finalized.");
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
    setFailure(null);
    setPdfUrl(null);
    setApiResponse(null);
    setHasApiResponse(false);
    setRequestError("");
    setInputError("");
    setFile(null);
    setRawText("");
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
            activeStepIndex={
              stage === "source"
                ? 1
                : stage === "schema"
                  ? 2
                  : result && result.status === "completed"
                    ? 4
                    : 3
            }
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
                onSubmit={handleSourceSubmit}
                rawText={rawText}
                requestError={requestError}
                hasApiResponse={hasApiResponse}
                onViewResponse={() => setResponseViewerOpen(true)}
                hasTrace={failure !== null}
                onViewTrace={() => setRunTraceOpen(true)}
              />
            ) : stage === "schema" && schemaReview && schemaDraft ? (
              <SchemaReviewScreen
                schema={schemaDraft}
                setSchema={setSchemaDraft}
                previewImages={schemaReview.preview_images}
                trace={schemaReview.trace}
                filename={schemaReview.filename}
                busy={busy}
                error={requestError}
                onBack={() => setStage("source")}
                onApprove={() => void approveSchema()}
              />
            ) : result && pdfUrl ? (
              <ResultScreen
                result={result}
                pdfUrl={pdfUrl}
                error={requestError}
                onEditSource={() => setStage("source")}
                finalizing={busy}
                onFinalize={(decisions) => void finalizeRun(decisions)}
              />
            ) : null}
          </div>
        </div>
      )}

      <RunTraceDialog
        open={runTraceOpen}
        onOpenChange={setRunTraceOpen}
        runId={result?.run_id ?? failure?.run_id ?? ""}
        trace={result?.trace ?? failure?.trace ?? []}
        failedStage={failure?.failed_stage ?? null}
      />

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
}: {
  label?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-cream/25 px-4 py-3" aria-busy="true">
      <p
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 size={15} className="animate-spin text-primary" />
        {label}
      </p>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream"
        role="progressbar"
        aria-label="Autofill in progress"
      >
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        This can take several minutes. Keep this page open.
      </p>
    </div>
  );
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
  onSubmit,
  rawText,
  requestError,
  hasApiResponse,
  onViewResponse,
  hasTrace,
  onViewTrace,
}: {
  busy: boolean;
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  inputError: string;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRawTextChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  rawText: string;
  requestError: string;
  hasApiResponse: boolean;
  onViewResponse: () => void;
  hasTrace: boolean;
  onViewTrace: () => void;
}) {
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
              {hasTrace && (
                <button
                  type="button"
                  className="ml-2 inline-flex items-center gap-1 font-bold underline underline-offset-2"
                  onClick={onViewTrace}
                >
                  <Info size={13} /> View stage trace
                </button>
              )}
            </InlineAlert>
          )}

          <div className="pt-2" aria-busy={busy}>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cream text-ink">
                <Brain size={19} />
              </span>
              <div>
                <h3 className="text-base font-bold text-foreground">Field mapping</h3>
                <p className="text-xs text-muted-foreground">
                  {busy ? "Preparing your review" : "Map your PDF and source information"}
                </p>
              </div>
            </div>
            {busy ? (
              <AnalysisLoadingCard />
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

type ReviewFilter = "all" | ReviewStatus;

const zoomLevels = [75, 100, 125, 150, 175, 200] as const;
const defaultZoom = 150;

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
              <AnalysisLoadingCard label="Generating and verifying the final PDF…" />
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
