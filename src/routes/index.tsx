import { createFileRoute } from "@tanstack/react-router";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck2,
  FileText,
  FileUp,
  House,
  Keyboard,
  Loader2,
  Minus,
  Plus,
  Save,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Document Autofill Tool | Dynamic Form Fill AI" },
      {
        name: "description",
        content:
          "Upload a document template, parse raw text, review mapped fields, and generate a completed form.",
      },
      { property: "og:title", content: "Document Autofill Tool | Dynamic Form Fill AI" },
      {
        property: "og:description",
        content:
          "Upload a document template, parse raw text, review mapped fields, and generate a completed form.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const sampleRawText =
  "Document package for Road Improvement Project - Phase II, project number CIP-24-118. Principal: ABC Construction LLC, 1250 Alameda Street, Los Angeles, CA 90012. Obligee: City of Montebello. Bid package: Street resurfacing, traffic signal upgrades, and sidewalk accessibility improvements. Bid amount: $250,000. Required bond percentage: 10%. Bid opening date: October 18, 2026 at 2:00 PM Pacific. Bond type: Bid Bond. Surety: Pacific Guarantee Surety Company. Jurisdiction: California. Bond validity: 90 days after bid opening. Bid bond is required and surety confirmation is included. The package is not ready for countersignature. Authorized signer: Jordan Diaz. The obligee address and signer title are not included in the request package.";

const fieldBlueprints = [
  {
    id: "project",
    kind: "text",
    label: "Project name",
    value: "Road Improvement Project - Phase II",
    status: "verified",
    confidence: "98%",
    source: "Project title",
    required: true,
  },
  {
    id: "projectNumber",
    kind: "text",
    label: "Project number",
    value: "CIP-24-118",
    status: "verified",
    confidence: "93%",
    source: "Project number",
    required: true,
  },
  {
    id: "contractor",
    kind: "text",
    label: "Contractor / principal",
    value: "ABC Construction LLC",
    status: "verified",
    confidence: "96%",
    source: "Principal",
    required: true,
  },
  {
    id: "contractorAddress",
    kind: "text",
    label: "Contractor address",
    value: "1250 Alameda Street, Los Angeles, CA 90012",
    status: "verified",
    confidence: "94%",
    source: "Principal address",
    required: true,
  },
  {
    id: "obligee",
    kind: "text",
    label: "Obligee",
    value: "City of Montebello",
    status: "review",
    confidence: "82%",
    source: "Obligee",
    required: true,
  },
  {
    id: "address",
    kind: "text",
    label: "Obligee address",
    value: "",
    status: "missing",
    confidence: "0%",
    source: "Not found",
    required: true,
  },
  {
    id: "bidPackage",
    kind: "text",
    label: "Bid package / scope",
    value: "Street resurfacing, traffic signal upgrades, and sidewalk accessibility improvements",
    status: "review",
    confidence: "79%",
    source: "Bid package description",
    required: true,
  },
  {
    id: "amount",
    kind: "text",
    label: "Bid amount",
    value: "$250,000.00",
    status: "verified",
    confidence: "99%",
    source: "Bid amount",
    required: true,
  },
  {
    id: "bidPercentage",
    kind: "text",
    label: "Bond percentage",
    value: "10%",
    status: "verified",
    confidence: "92%",
    source: "Required bond percentage",
    required: true,
  },
  {
    id: "date",
    kind: "text",
    label: "Bid opening date",
    value: "October 18, 2026",
    status: "verified",
    confidence: "95%",
    source: "Bid opening date",
    required: true,
  },
  {
    id: "bidTime",
    kind: "text",
    label: "Bid opening time",
    value: "2:00 PM Pacific",
    status: "verified",
    confidence: "90%",
    source: "Bid opening time",
    required: true,
  },
  {
    id: "surety",
    kind: "text",
    label: "Surety company",
    value: "Pacific Guarantee Surety Company",
    status: "verified",
    confidence: "91%",
    source: "Surety",
    required: true,
  },
  {
    id: "suretyAddress",
    kind: "text",
    label: "Surety address",
    value: "",
    status: "missing",
    confidence: "0%",
    source: "Not found",
    required: false,
  },
  {
    id: "bondType",
    kind: "text",
    label: "Document type",
    value: "Bid Bond",
    status: "verified",
    confidence: "97%",
    source: "Bond type",
    required: true,
  },
  {
    id: "jurisdiction",
    kind: "text",
    label: "Jurisdiction",
    value: "California",
    status: "verified",
    confidence: "88%",
    source: "Jurisdiction",
    required: true,
  },
  {
    id: "validityPeriod",
    kind: "text",
    label: "Validity period",
    value: "90 days after bid opening",
    status: "verified",
    confidence: "86%",
    source: "Bond validity",
    required: true,
  },
  {
    id: "authorizedSigner",
    kind: "text",
    label: "Authorized signer",
    value: "Jordan Diaz",
    status: "verified",
    confidence: "84%",
    source: "Authorized signer",
    required: true,
  },
  {
    id: "signerTitle",
    kind: "text",
    label: "Signer title",
    value: "",
    status: "missing",
    confidence: "0%",
    source: "Not found",
    required: true,
  },
  {
    id: "bidBondRequired",
    kind: "checkbox",
    label: "Bid bond required",
    value: true,
    status: "verified",
    confidence: "96%",
    source: "Bond type requirement",
    required: true,
  },
  {
    id: "suretyConfirmed",
    kind: "checkbox",
    label: "Surety confirmed",
    value: true,
    status: "verified",
    confidence: "91%",
    source: "Surety confirmation",
    required: true,
  },
  {
    id: "readyForCountersignature",
    kind: "checkbox",
    label: "Ready for countersignature",
    value: false,
    status: "review",
    confidence: "72%",
    source: "Countersignature readiness",
    required: false,
  },
] as const;

const textFieldCount = fieldBlueprints.filter((field) => field.kind === "text").length;
const checkboxFieldCount = fieldBlueprints.filter((field) => field.kind === "checkbox").length;

const workflowSteps = [
  { id: "upload", label: "Upload Template" },
  { id: "raw", label: "Provide Raw Text" },
  { id: "extract", label: "Extract & Map" },
  { id: "review", label: "Review & Edit" },
  { id: "fill", label: "Fill Template" },
  { id: "store", label: "Store" },
] as const;

const zoomLevels = [75, 100, 125, 150] as const;

type FieldBlueprint = (typeof fieldBlueprints)[number];
type FieldId = FieldBlueprint["id"];
type FieldValue = string | boolean;
type FieldValues = Record<FieldId, FieldValue>;
type WorkflowStage = "landing" | "upload" | "raw" | "mapped" | "generated";

const isMappedValue = (field: FieldBlueprint, value: FieldValue) => {
  if (field.kind === "checkbox") return typeof value === "boolean";

  return typeof value === "string" && value.trim().length > 0;
};

const fieldPageMap: Record<FieldId, number> = {
  project: 1,
  projectNumber: 1,
  contractor: 1,
  contractorAddress: 1,
  obligee: 1,
  address: 1,
  bidPackage: 2,
  amount: 1,
  bidPercentage: 2,
  date: 1,
  bidTime: 2,
  surety: 2,
  suretyAddress: 2,
  bondType: 2,
  jurisdiction: 2,
  validityPeriod: 2,
  authorizedSigner: 3,
  signerTitle: 3,
  bidBondRequired: 2,
  suretyConfirmed: 2,
  readyForCountersignature: 3,
};

function Index() {
  const [templateName, setTemplateName] = useState("");
  const [rawText, setRawText] = useState(sampleRawText);
  const [selected, setSelected] = useState<FieldId>("address");
  const [values, setValues] = useState<FieldValues>(() =>
    fieldBlueprints.reduce(
      (current, field) => ({ ...current, [field.id]: field.value }),
      {} as FieldValues,
    ),
  );
  const [page, setPage] = useState(1);
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>("landing");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [zoom, setZoom] = useState(100);

  const hasTemplate = Boolean(templateName);
  const hasRawText = rawText.trim().length > 0;
  const canAnalyze = hasTemplate && hasRawText && !isAnalyzing;
  const allRequiredComplete = fieldBlueprints
    .filter((field) => field.required)
    .every((field) => isMappedValue(field, values[field.id]));
  const mappedCount = fieldBlueprints.filter((field) =>
    isMappedValue(field, values[field.id]),
  ).length;
  const missingCount = fieldBlueprints.length - mappedCount;
  const reviewCount = fieldBlueprints.filter(
    (field) => field.status === "review" && isMappedValue(field, values[field.id]),
  ).length;
  const verifiedCount = Math.max(mappedCount - reviewCount, 0);
  const canGenerate = allRequiredComplete && workflowStage === "mapped";
  const isWorkspace = workflowStage === "mapped" || workflowStage === "generated";
  const isLanding = workflowStage === "landing";

  const activeStepIndex = useMemo(() => {
    if (workflowStage === "landing") return -1;
    if (workflowStage === "generated") return 5;
    if (workflowStage === "mapped" && allRequiredComplete) return 4;
    if (workflowStage === "mapped") return 3;
    if (hasTemplate && hasRawText) return 2;
    if (hasTemplate) return 1;
    return 0;
  }, [allRequiredComplete, hasRawText, hasTemplate, workflowStage]);

  const updateField = (id: FieldId, value: FieldValue) => {
    setValues((current) => ({ ...current, [id]: value }));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setTemplateName(file.name);
    setWorkflowStage("raw");
  };

  const runAnalysis = () => {
    if (!canAnalyze) return;

    setIsAnalyzing(true);
    window.setTimeout(() => {
      setIsAnalyzing(false);
      setWorkflowStage("mapped");
      setSelected("address");
      setPage(1);
    }, 650);
  };

  const generateDocument = () => {
    if (!canGenerate) return;

    setWorkflowStage("generated");
    setGenerated(true);
  };

  const saveDraft = () => {
    setDraftSaved(true);
    window.setTimeout(() => setDraftSaved(false), 1600);
  };

  const adjustZoom = (delta: number) => {
    setZoom((current) => {
      const currentIndex = zoomLevels.findIndex((level) => level === current);
      const safeIndex = currentIndex === -1 ? zoomLevels.indexOf(100) : currentIndex;
      const nextIndex = Math.min(
        zoomLevels.length - 1,
        Math.max(0, safeIndex + (delta > 0 ? 1 : -1)),
      );

      return zoomLevels[nextIndex];
    });
  };

  const queueDownload = () => {
    setDownloadStarted(true);
    window.setTimeout(() => setDownloadStarted(false), 1800);
  };

  const returnToUpload = () => {
    setGenerated(false);
    setWorkflowStage(hasTemplate ? "raw" : "upload");
  };

  const returnHome = () => {
    setGenerated(false);
    setWorkflowStage("landing");
  };

  return (
    <main className="min-h-screen bg-background">
      {isLanding ? (
        <LandingPage onStart={() => setWorkflowStage(hasTemplate ? "raw" : "upload")} />
      ) : (
        <>
          <AppHeader activeStepIndex={activeStepIndex} onHome={returnHome} />
          {isWorkspace ? (
            <WorkspaceScreen
              allRequiredComplete={allRequiredComplete}
              canGenerate={canGenerate}
              draftSaved={draftSaved}
              downloadStarted={downloadStarted}
              fieldStats={{ mappedCount, missingCount, reviewCount, verifiedCount }}
              generated={generated}
              page={page}
              queueDownload={queueDownload}
              returnToUpload={returnToUpload}
              saveDraft={saveDraft}
              selected={selected}
              setGenerated={setGenerated}
              setPage={setPage}
              setSelected={setSelected}
              templateName={templateName}
              updateField={updateField}
              values={values}
              zoom={zoom}
              adjustZoom={adjustZoom}
              generateDocument={generateDocument}
            />
          ) : (
            <UploadSlide
              canAnalyze={canAnalyze}
              handleFileChange={handleFileChange}
              isAnalyzing={isAnalyzing}
              rawText={rawText}
              runAnalysis={runAnalysis}
              setRawText={setRawText}
              setTemplateName={setTemplateName}
              setWorkflowStage={setWorkflowStage}
              templateName={templateName}
            />
          )}
        </>
      )}
    </main>
  );
}

function AppHeader({ activeStepIndex, onHome }: { activeStepIndex: number; onHome: () => void }) {
  return (
    <header className="flex min-h-16 items-center justify-between border-b border-border bg-card/95 px-5 py-3 shadow-sm lg:px-8">
      <div className="flex items-center gap-3">
        <LogoMark />
        <div>
          <span className="font-display text-lg font-bold text-ink">Dynamic Form Fill AI</span>
          <p className="text-xs font-semibold text-muted-foreground">
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
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onHome}>
          <House size={15} />
          Home
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

function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <section className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,oklch(0.99_0.025_91.74),oklch(0.9584_0.0446_91.74)_42%,oklch(0.88_0.04_265)_100%)] p-3 text-ink lg:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1500px] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/78 shadow-2xl shadow-ink/15 backdrop-blur lg:min-h-[calc(100vh-2.5rem)]">
        <nav className="flex items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <LogoMark />
            <span className="hidden font-display text-base font-bold sm:inline">
              Dynamic Form Fill AI
            </span>
          </div>
          <Button className="h-9 rounded-full bg-primary px-5 text-xs" onClick={onStart}>
            Start demo
          </Button>
        </nav>

        <div className="flex flex-1 flex-col items-center px-5 pb-6 pt-8 text-center lg:px-8 lg:pt-12">
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-full bg-steel-blue px-4 py-2 text-xs font-bold text-primary-foreground shadow-lg shadow-steel-blue/25 transition-colors hover:bg-deep-blue"
          >
            No manual copy-paste required <ArrowRight size={14} />
          </button>
          <h1 className="mt-6 max-w-4xl font-display text-5xl font-bold leading-[0.98] tracking-normal text-ink sm:text-6xl lg:text-7xl">
            Turn documents into completed forms
          </h1>
          <p className="mt-5 max-w-2xl text-sm font-medium leading-6 text-steel-blue sm:text-base">
            Upload a form template, paste raw business text, let AI map the fields, then review and
            generate a completed document with confidence.
          </p>
          <HeroProductMockup onStart={onStart} />
        </div>
      </div>
    </section>
  );
}

function LogoMark() {
  return (
    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-ink/15">
      <FileCheck2 size={20} />
    </span>
  );
}

function HeroProductMockup({ onStart }: { onStart: () => void }) {
  return (
    <div className="mt-10 w-full max-w-5xl rounded-[28px] border border-ink/20 bg-ink p-3 shadow-2xl shadow-ink/25 lg:mt-12">
      <div className="rounded-[22px] bg-card p-4 text-left lg:p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Autofill workspace</p>
            <h2 className="font-display text-xl font-bold text-foreground">Review mapped form</h2>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            Open demo
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="rounded-2xl border border-border bg-cream/65 p-4">
            <div className="mb-3 flex items-center justify-between text-xs font-bold text-muted-foreground">
              <span>Source package</span>
              <span>Ready</span>
            </div>
            <div className="space-y-3">
              <HeroMiniStep
                icon={<FileUp size={15} />}
                title="PDF form template"
                meta="3 pages | 18 fields"
              />
              <HeroMiniStep
                icon={<Keyboard size={15} />}
                title="Raw document text"
                meta="638 characters parsed"
              />
              <HeroMiniStep
                icon={<Brain size={15} />}
                title="AI extraction"
                meta="15 mapped | 3 need review"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              <div className="text-center font-serif text-[10px] font-bold tracking-[0.18em] text-ink">
                BID BOND
              </div>
              <div className="mt-5 space-y-3">
                <HeroDocLine label="PROJECT NAME" value="Road Improvement Project" />
                <HeroDocLine label="PRINCIPAL" value="ABC Construction LLC" />
                <HeroDocLine label="OBLIGEE ADDRESS" value="Required field" missing />
                <HeroDocLine label="SIGNER TITLE" value="Required field" missing />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-muted-foreground">Mapped fields</p>
                <span className="rounded-full bg-cream px-2 py-1 text-[10px] font-bold text-ink">
                  15 / 18
                </span>
              </div>
              <HeroField label="Bid amount" value="$250,000.00" status="Verified" />
              <HeroField
                label="Bid package"
                value="Traffic signals and sidewalks"
                status="Review"
              />
              <HeroField label="Obligee address" value="Needs input" status="Missing" />
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
  missing,
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

function HeroField({ label, value, status }: { label: string; value: string; status: string }) {
  const tone =
    status === "Missing"
      ? "text-destructive"
      : status === "Review"
        ? "text-warning"
        : "text-success";

  return (
    <div className="mb-2 rounded-xl border border-border p-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold">
        <span className="text-muted-foreground">{label}</span>
        <span className={tone}>{status}</span>
      </div>
      <p className="truncate text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function UploadSlide({
  canAnalyze,
  handleFileChange,
  isAnalyzing,
  rawText,
  runAnalysis,
  setRawText,
  setTemplateName,
  setWorkflowStage,
  templateName,
}: {
  canAnalyze: boolean;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  isAnalyzing: boolean;
  rawText: string;
  runAnalysis: () => void;
  setRawText: (value: string) => void;
  setTemplateName: (value: string) => void;
  setWorkflowStage: (value: WorkflowStage) => void;
  templateName: string;
}) {
  return (
    <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-white px-4 py-6 lg:px-8">
      <div className="mx-auto grid min-h-[540px] w-full max-w-[1240px] overflow-hidden rounded-[28px] border border-border bg-white shadow-2xl shadow-ink/10 xl:grid-cols-[0.82fr_1.18fr]">
        <aside className="flex min-h-[540px] flex-col bg-ink p-6 text-primary-foreground lg:p-7">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <LogoMark />
              <div>
                <p className="text-xs font-bold uppercase text-primary-foreground/60">
                  Source package
                </p>
                <h1 className="font-display text-3xl font-bold leading-tight">Upload & raw text</h1>
              </div>
            </div>
            <p className="max-w-md text-sm font-medium leading-6 text-primary-foreground/72">
              Start with a form template and the raw business text. The AI will detect fields, map
              values, and flag anything that needs review.
            </p>
            <div className="mt-6 grid gap-2.5">
              <UploadProgressItem
                complete={Boolean(templateName)}
                label="Template selected"
                meta={templateName || "PDF form is required"}
              />
              <UploadProgressItem
                complete={rawText.trim().length > 0}
                label="Raw text available"
                meta={`${rawText.trim().length} characters ready`}
              />
              <UploadProgressItem
                complete={canAnalyze || isAnalyzing}
                label="Ready to extract"
                meta={canAnalyze ? "AI parse can begin" : "Waiting for source package"}
              />
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/8 p-3.5">
            <p className="text-xs font-bold uppercase text-primary-foreground/55">Demo flow</p>
            <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] font-bold text-primary-foreground/80">
              <span className="rounded-full bg-white/10 px-3 py-1.5">Upload</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">Parse</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">Review</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">Generate</span>
            </div>
          </div>
        </aside>

        <div className="flex min-h-[540px] flex-col justify-center space-y-3 p-4 lg:p-5">
          <div className="rounded-[22px] border border-border bg-white/95 p-4 shadow-md shadow-ink/5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-ink shadow-inner">
                  <FileUp size={21} />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-bold text-foreground">PDF form template</p>
                  <p className="mt-1 min-h-10 break-words text-sm text-muted-foreground">
                    {templateName || "Choose the system-generated form you want AI to fill."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="rounded-full bg-white">
                  <label htmlFor="template-upload" className="cursor-pointer">
                    <FileUp size={15} />
                    Upload PDF
                  </label>
                </Button>
                <input
                  id="template-upload"
                  className="sr-only"
                  accept="application/pdf"
                  type="file"
                  onChange={handleFileChange}
                />
                <Button
                  size="sm"
                  variant="soft"
                  className="rounded-full bg-cream text-ink hover:bg-cream/80"
                  onClick={() => {
                    setTemplateName("BID_BOND_TEMPLATE.PDF");
                    setWorkflowStage("raw");
                  }}
                >
                  Use sample
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-border bg-white/95 p-4 shadow-md shadow-ink/5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-ink shadow-inner">
                  <Keyboard size={21} />
                </span>
                <div>
                  <p className="text-base font-bold text-foreground">Raw document text</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {rawText.trim().length} characters available for extraction
                  </p>
                </div>
              </div>
              <span className="hidden rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-ink sm:inline-flex">
                Source text
              </span>
            </div>
            <Textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              className="h-40 resize-none rounded-2xl border-border bg-cream/30 p-4 text-sm leading-6 shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Paste Bid/Bond business information here"
            />
          </div>

          <div className="rounded-[22px] border border-border bg-white/95 p-4 shadow-md shadow-ink/5">
            <div className="mb-3 flex items-center gap-3.5">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-ink shadow-inner">
                <Brain size={21} />
              </span>
              <div>
                <p className="text-base font-bold text-foreground">AI extraction & field mapping</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {canAnalyze
                    ? "Ready to parse the source package"
                    : "Upload a template and provide text to continue"}
                </p>
              </div>
            </div>
            <Button
              className={`h-11 w-full rounded-2xl text-sm font-bold ${canAnalyze ? "bg-primary text-primary-foreground hover:bg-deep-blue" : "bg-steel-blue/55 text-primary-foreground"}`}
              onClick={runAnalysis}
              disabled={!canAnalyze}
            >
              {isAnalyzing ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {isAnalyzing ? "Analyzing source package" : "Run AI parse & map"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function UploadProgressItem({
  complete,
  label,
  meta,
}: {
  complete: boolean;
  label: string;
  meta: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/8 p-2.5">
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${complete ? "bg-cream text-ink" : "bg-white/10 text-primary-foreground/55"}`}
      >
        {complete ? <Check size={14} /> : <ChevronRight size={14} />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-primary-foreground">{label}</p>
        <p className="truncate text-xs text-primary-foreground/55">{meta}</p>
      </div>
    </div>
  );
}

function WorkspaceScreen({
  allRequiredComplete,
  canGenerate,
  draftSaved,
  downloadStarted,
  fieldStats,
  generated,
  page,
  queueDownload,
  returnToUpload,
  saveDraft,
  selected,
  setGenerated,
  setPage,
  setSelected,
  templateName,
  updateField,
  values,
  zoom,
  adjustZoom,
  generateDocument,
}: {
  allRequiredComplete: boolean;
  canGenerate: boolean;
  draftSaved: boolean;
  downloadStarted: boolean;
  fieldStats: {
    mappedCount: number;
    missingCount: number;
    reviewCount: number;
    verifiedCount: number;
  };
  generated: boolean;
  page: number;
  queueDownload: () => void;
  returnToUpload: () => void;
  saveDraft: () => void;
  selected: FieldId;
  setGenerated: (value: boolean) => void;
  setPage: (value: number) => void;
  setSelected: (value: FieldId) => void;
  templateName: string;
  updateField: (id: FieldId, value: FieldValue) => void;
  values: FieldValues;
  zoom: number;
  adjustZoom: (delta: number) => void;
  generateDocument: () => void;
}) {
  const fieldCardRefs = useRef<Partial<Record<FieldId, HTMLLabelElement | null>>>({});

  const selectField = (fieldId: FieldId) => {
    setSelected(fieldId);
    setPage(fieldPageMap[fieldId]);
  };

  const selectDocumentField = (fieldId: FieldId) => {
    selectField(fieldId);
    window.requestAnimationFrame(() => {
      fieldCardRefs.current[fieldId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  const canZoomOut = zoom > zoomLevels[0];
  const canZoomIn = zoom < zoomLevels[zoomLevels.length - 1];

  return (
    <section className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-white">
      <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-5 py-3 shadow-sm lg:px-8">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
            <FileText size={14} />
            <span className="break-words">{templateName || "BID_BOND_TEMPLATE.PDF"}</span>
            <span className="text-success">Template analyzed</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Review mapped form</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={returnToUpload}>
            <ArrowLeft size={16} />
            Source
          </Button>
          <Button variant="outline" onClick={saveDraft}>
            {draftSaved ? <Check size={16} /> : <Save size={16} />}
            {draftSaved ? "Draft saved" : "Save draft"}
          </Button>
          <Button onClick={generateDocument} disabled={!canGenerate}>
            <FileCheck2 size={16} />
            Approve & generate
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 overflow-auto bg-white lg:grid-cols-[45fr_55fr] lg:overflow-hidden">
        <section className="flex min-h-[560px] min-w-0 flex-col border-b border-border bg-white lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border bg-white px-4">
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase text-steel-blue">PDF template</span>
              <span className="ml-3 text-xs text-muted-foreground">
                {textFieldCount} text fields | {checkboxFieldCount} checkboxes
              </span>
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
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[#F7F8FB] px-3 py-4 lg:px-4">
            <div
              className="relative aspect-[0.77] w-[min(94%,520px)] origin-top border border-border bg-white p-[7%] shadow-xl shadow-ink/10"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
            >
              <PdfPage
                page={page}
                selected={selected}
                setSelected={selectDocumentField}
                values={values}
              />
              <div className="absolute bottom-6 left-0 right-0 text-center text-[9px] text-muted-foreground">
                Page {page} of 3
              </div>
            </div>
          </div>
          <div className="flex h-14 items-center justify-center gap-2 border-t border-border bg-white px-4">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              aria-label="Previous page"
              className="rounded-full"
            >
              <ChevronLeft size={17} />
            </Button>
            <span className="min-w-24 text-center text-xs font-bold text-foreground">
              Page {page} of 3
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setPage(Math.min(3, page + 1))}
              disabled={page === 3}
              aria-label="Next page"
              className="rounded-full"
            >
              <ChevronRight size={17} />
            </Button>
          </div>
        </section>

        <section className="flex min-h-[620px] min-w-0 flex-col bg-white lg:min-h-0">
          <div className="border-b border-border bg-white px-4 py-4 lg:px-5">
            <div className="mx-auto max-w-[920px]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-steel-blue">Mapped information</p>
                  <h2 className="mt-1 font-display text-xl font-bold text-foreground">
                    Review & approve
                  </h2>
                </div>
                <Stat
                  value={`${fieldStats.mappedCount} / ${fieldBlueprints.length}`}
                  label="Mapped"
                  tone="text-primary"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Stat
                  value={String(fieldStats.verifiedCount)}
                  label="Verified"
                  tone="text-success"
                />
                <Stat value={String(fieldStats.reviewCount)} label="Review" tone="text-warning" />
                <Stat value={String(fieldStats.missingCount)} label="Missing" tone="text-primary" />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[#F7F8FB] px-4 py-3 lg:px-5">
            <div className="mx-auto max-w-[920px] space-y-2.5">
              {fieldBlueprints.map((field) => {
                const fieldValue = values[field.id];
                const mapped = isMappedValue(field, fieldValue);
                const currentMissing = field.required && !mapped;
                const status = !mapped
                  ? "missing"
                  : field.status === "review"
                    ? "review"
                    : "verified";
                const isActive = selected === field.id;

                return (
                  <label
                    key={field.id}
                    ref={(node) => {
                      fieldCardRefs.current[field.id] = node;
                    }}
                    className={`block cursor-pointer rounded-xl border p-3 shadow-sm transition-all ${
                      isActive
                        ? "border-ink bg-cream/35 shadow-md shadow-ink/8"
                        : currentMissing
                          ? "border-destructive/30 bg-white hover:border-destructive/45"
                          : "border-border bg-white hover:border-steel-blue/40"
                    }`}
                    onClick={() => selectField(field.id)}
                  >
                    <span className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold text-steel-blue">
                      <span>{field.label}</span>
                      <Status status={status} />
                    </span>
                    {field.kind === "checkbox" ? (
                      <span className="flex items-center justify-between gap-3 rounded-lg bg-[#F7F8FB] px-3 py-2">
                        <span className="text-sm font-bold text-foreground">
                          {fieldValue === true ? "Checked" : "Unchecked"}
                        </span>
                        <input
                          type="checkbox"
                          checked={fieldValue === true}
                          onChange={(event) => updateField(field.id, event.target.checked)}
                          className="size-4 accent-primary"
                        />
                      </span>
                    ) : (
                      <input
                        value={typeof fieldValue === "string" ? fieldValue : ""}
                        onChange={(event) => updateField(field.id, event.target.value)}
                        placeholder={currentMissing ? "Enter required value" : undefined}
                        className="h-7 w-full border-0 bg-transparent text-sm font-bold text-foreground outline-none placeholder:text-destructive"
                      />
                    )}
                    <span className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] font-medium text-muted-foreground">
                      <span>Source: {field.source}</span>
                      <span>Confidence: {mapped ? field.confidence : "0%"}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border bg-white px-4 py-3 shadow-[0_-10px_24px_oklch(0.1696_0.0914_265.04/0.05)] lg:px-5">
            <div className="mx-auto max-w-[920px]">
              <div
                className={`mb-2.5 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
                  allRequiredComplete ? "bg-success/10 text-success" : "bg-cream/80 text-ink"
                }`}
              >
                {allRequiredComplete ? <Check size={15} /> : <AlertTriangle size={15} />}
                {allRequiredComplete
                  ? "All required fields are complete."
                  : "Required fields must be completed before generation."}
              </div>
              <div className="flex justify-end">
                <Button
                  className="h-10 rounded-xl bg-primary px-5 font-bold text-primary-foreground hover:bg-deep-blue"
                  onClick={generateDocument}
                  disabled={!canGenerate}
                >
                  Approve & generate <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {generated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4">
          <div className="w-full max-w-md rounded-[24px] border border-border bg-white p-8 text-center shadow-2xl shadow-ink/20">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-success">
              <Check size={28} />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold">Document Generated</h2>
            <p className="mt-2 text-sm text-muted-foreground">Completed_Form_Output.pdf</p>
            <div className="my-6 border-y border-border py-4 text-xs text-muted-foreground">
              Template metadata stored | Review record saved | Output ready
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setGenerated(false)}>
                Back
              </Button>
              <Button className="flex-1" onClick={queueDownload}>
                {downloadStarted ? <Check size={16} /> : <Download size={16} />}
                {downloadStarted ? "Download queued" : "Download PDF"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
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

function PdfPage({
  page,
  selected,
  setSelected,
  values,
}: {
  page: number;
  selected: FieldId;
  setSelected: (value: FieldId) => void;
  values: FieldValues;
}) {
  const textValue = (fieldId: FieldId) => {
    const value = values[fieldId];

    return typeof value === "string" ? value : "";
  };
  const checkboxValue = (fieldId: FieldId) => values[fieldId] === true;

  if (page === 2) {
    return (
      <>
        <PdfHeading title="BID BOND" subtitle="PROJECT TERMS AND SURETY DETAILS" />
        <p className="mt-8 text-[11px] leading-6 text-muted-foreground">
          The surety and principal agree that the following extracted terms will govern the bid
          security for the referenced solicitation.
        </p>
        <PdfField
          label="BID PACKAGE / SCOPE"
          value={textValue("bidPackage")}
          active={selected === "bidPackage"}
          warning
          onClick={() => setSelected("bidPackage")}
        />
        <div className="grid grid-cols-2 gap-4">
          <PdfField
            label="BOND PERCENTAGE"
            value={textValue("bidPercentage")}
            active={selected === "bidPercentage"}
            onClick={() => setSelected("bidPercentage")}
          />
          <PdfField
            label="BID OPENING TIME"
            value={textValue("bidTime")}
            active={selected === "bidTime"}
            onClick={() => setSelected("bidTime")}
          />
        </div>
        <PdfField
          label="SURETY COMPANY"
          value={textValue("surety")}
          active={selected === "surety"}
          onClick={() => setSelected("surety")}
        />
        <PdfField
          label="SURETY ADDRESS"
          value={textValue("suretyAddress") || "Optional field"}
          active={selected === "suretyAddress"}
          missing={!textValue("suretyAddress")}
          onClick={() => setSelected("suretyAddress")}
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <PdfCheckboxField
            label="BID BOND REQUIRED"
            checked={checkboxValue("bidBondRequired")}
            active={selected === "bidBondRequired"}
            onClick={() => setSelected("bidBondRequired")}
          />
          <PdfCheckboxField
            label="SURETY CONFIRMED"
            checked={checkboxValue("suretyConfirmed")}
            active={selected === "suretyConfirmed"}
            onClick={() => setSelected("suretyConfirmed")}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <PdfField
            label="DOCUMENT TYPE"
            value={textValue("bondType")}
            active={selected === "bondType"}
            onClick={() => setSelected("bondType")}
          />
          <PdfField
            label="JURISDICTION"
            value={textValue("jurisdiction")}
            active={selected === "jurisdiction"}
            onClick={() => setSelected("jurisdiction")}
          />
        </div>
        <PdfField
          label="VALIDITY PERIOD"
          value={textValue("validityPeriod")}
          active={selected === "validityPeriod"}
          onClick={() => setSelected("validityPeriod")}
        />
      </>
    );
  }

  if (page === 3) {
    return (
      <>
        <PdfHeading title="BID BOND" subtitle="EXECUTION AND ACKNOWLEDGEMENT" />
        <p className="mt-8 text-[11px] leading-6 text-muted-foreground">
          The approved values below are reserved for final execution, signature, seal, and internal
          validation of the completed document.
        </p>
        <PdfField
          label="AUTHORIZED SIGNER"
          value={textValue("authorizedSigner")}
          active={selected === "authorizedSigner"}
          onClick={() => setSelected("authorizedSigner")}
        />
        <PdfField
          label="SIGNER TITLE"
          value={textValue("signerTitle") || "Required field"}
          active={selected === "signerTitle"}
          missing={!textValue("signerTitle")}
          onClick={() => setSelected("signerTitle")}
        />
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="min-h-20 border border-dashed border-steel-blue/30 p-3 text-[10px] text-muted-foreground">
            Principal signature block
          </div>
          <div className="min-h-20 border border-dashed border-steel-blue/30 p-3 text-[10px] text-muted-foreground">
            Surety signature block
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="min-h-16 border border-dashed border-steel-blue/30 p-3 text-[10px] text-muted-foreground">
            Corporate seal
          </div>
          <div className="min-h-16 border border-dashed border-steel-blue/30 p-3 text-[10px] text-muted-foreground">
            Notary acknowledgement
          </div>
        </div>
        <div className="mt-6">
          <PdfCheckboxField
            label="READY FOR COUNTERSIGNATURE"
            checked={checkboxValue("readyForCountersignature")}
            active={selected === "readyForCountersignature"}
            onClick={() => setSelected("readyForCountersignature")}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PdfHeading title="BID BOND" subtitle="KNOW ALL PERSONS BY THESE PRESENTS" />
      <p className="mt-8 text-[11px] leading-6 text-muted-foreground">
        That we, the undersigned Principal and Surety, are firmly bound unto the Obligee in the
        penal sum shown below, for payment of which we bind ourselves.
      </p>
      <PdfField
        label="PROJECT NAME"
        value={textValue("project")}
        active={selected === "project"}
        onClick={() => setSelected("project")}
      />
      <PdfField
        label="PROJECT NUMBER"
        value={textValue("projectNumber")}
        active={selected === "projectNumber"}
        onClick={() => setSelected("projectNumber")}
      />
      <PdfField
        label="CONTRACTOR / PRINCIPAL"
        value={textValue("contractor")}
        active={selected === "contractor"}
        onClick={() => setSelected("contractor")}
      />
      <PdfField
        label="CONTRACTOR ADDRESS"
        value={textValue("contractorAddress")}
        active={selected === "contractorAddress"}
        onClick={() => setSelected("contractorAddress")}
      />
      <div className="grid grid-cols-2 gap-4">
        <PdfField
          label="BID AMOUNT"
          value={textValue("amount")}
          active={selected === "amount"}
          onClick={() => setSelected("amount")}
        />
        <PdfField
          label="BID OPENING DATE"
          value={textValue("date")}
          active={selected === "date"}
          onClick={() => setSelected("date")}
        />
      </div>
      <PdfField
        label="OBLIGEE"
        value={textValue("obligee")}
        active={selected === "obligee"}
        warning
        onClick={() => setSelected("obligee")}
      />
      <PdfField
        label="OBLIGEE ADDRESS"
        value={textValue("address") || "Required field"}
        active={selected === "address"}
        missing={!textValue("address")}
        onClick={() => setSelected("address")}
      />
    </>
  );
}

function PdfCheckboxField({
  label,
  checked,
  active,
  onClick,
}: {
  label: string;
  checked: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl px-2 py-2 text-left transition-all ${active ? "bg-cream/70 ring-2 ring-ink ring-offset-2" : "hover:bg-cream/35"}`}
    >
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-normal text-muted-foreground">
        <span
          className={`flex size-4 items-center justify-center border ${
            checked ? "border-ink bg-ink text-primary-foreground" : "border-steel-blue/45 bg-white"
          }`}
        >
          {checked && <Check size={11} />}
        </span>
        {label}
      </span>
      <span className="mt-1 block pl-6 text-[11px] font-bold text-foreground">
        {checked ? "Checked" : "Unchecked"}
      </span>
    </button>
  );
}

function PdfHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center font-serif">
      <p className="text-xs font-bold tracking-[0.18em]">{title}</p>
      <p className="mt-2 text-[10px]">{subtitle}</p>
    </div>
  );
}

function PdfField({
  label,
  value,
  active,
  warning,
  missing,
  onClick,
}: {
  label: string;
  value: string;
  active?: boolean;
  warning?: boolean;
  missing?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-4 w-full rounded-xl text-left transition-all ${active ? "bg-cream/70 ring-2 ring-ink ring-offset-2" : "hover:bg-cream/35"}`}
    >
      <span className="block px-1 text-[9px] font-bold uppercase tracking-normal text-muted-foreground">
        {label}
      </span>
      <span
        className={`mt-1 block min-h-7 border-b px-2 py-1.5 text-[11px] font-bold ${
          missing
            ? "border-destructive bg-destructive/5 text-destructive"
            : warning
              ? "border-warning bg-warning/10 text-foreground"
              : "border-steel-blue/35 bg-cream/35 text-foreground"
        }`}
      >
        {value}
      </span>
    </button>
  );
}

function Status({ status }: { status: string }) {
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

  return (
    <span className="text-success">
      <Check size={13} className="mr-1 inline" />
      Verified
    </span>
  );
}
function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 shadow-sm">
      <strong className={`font-display text-sm ${tone}`}>{value}</strong>
      <span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
    </div>
  );
}
