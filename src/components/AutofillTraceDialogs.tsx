import { useEffect, useState } from "react";
import { Check, Copy, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AutofillField, StageTrace } from "@/lib/autofill";

function stageLabel(stage: string) {
  return (
    {
      inspect: "1/5 · Inspect PDF",
      calibrate: "2/5 · Prepare schema",
      map: "3/5 · Map values",
      fill: "4/5 · Fill PDF",
      verify: "5/5 · Verify PDF",
    }[stage] ?? stage
  );
}

function stageSummary(entry: StageTrace) {
  const value = (key: string) => Number(entry.summary[key] ?? 0);
  switch (entry.stage) {
    case "inspect":
      return `${value("pages")} pages · ${value("total_blank_candidates")} blanks found`;
    case "calibrate":
      return `${value("field_count")} fields · ${entry.summary["schema_status"] === "reviewed" ? "Ready to use" : "Needs schema review"}`;
    case "map":
      return `${value("verified")} verified · ${value("review")} need review · ${value("missing")} missing`;
    case "fill":
      return `${value("written")} written · ${value("overflow")} did not fit · ${value("manual")} manual`;
    case "verify":
      return `${value("passed")} passed · ${value("failed")} failed`;
    default:
      return "";
  }
}

function formatted(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "No output available.";
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // A user gesture can still allow the legacy copy command in some browsers.
    }
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  try {
    input.focus();
    input.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard access was denied.");
  } finally {
    input.remove();
  }
}

function CopyTraceButton({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => setStatus("idle"), [value]);

  const onCopy = async () => {
    try {
      await copyText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={() => void onCopy()}>
        {status === "copied" ? <Check size={14} /> : <Copy size={14} />}
        {status === "copied" ? "Copied" : "Copy trace"}
      </Button>
      {status === "error" && (
        <span role="alert" className="text-xs text-destructive">
          Copy failed. Check clipboard access.
        </span>
      )}
    </div>
  );
}

function findFieldRecord(trace: StageTrace[], stage: string, key: string, fieldId: string) {
  const output = trace.find((entry) => entry.stage === stage)?.output;
  const items = output?.[key];
  if (!Array.isArray(items)) return null;
  return (
    items.find((item: unknown) => {
      if (typeof item !== "object" || item === null || !("field_id" in item)) return false;
      return item.field_id === fieldId;
    }) ?? null
  );
}

function findCandidate(trace: StageTrace[], candidateId: string | null) {
  const pages = trace.find((entry) => entry.stage === "inspect")?.output["pages"];
  if (!Array.isArray(pages) || !candidateId) return null;
  for (const page of pages) {
    if (typeof page !== "object" || page === null) continue;
    for (const key of ["blank_candidates", "acroform_fields"]) {
      if (!(key in page) || !Array.isArray(page[key])) continue;
      const match = page[key].find(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          (("candidate_id" in item && item.candidate_id === candidateId) ||
            ("field_id" in item && item.field_id === candidateId)),
      );
      if (match) return match;
    }
  }
  return null;
}

export function RunTraceDialog({
  open,
  onOpenChange,
  runId,
  trace,
  failedStage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  trace: StageTrace[];
  failedStage?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-[min(96vw,900px)] flex-col rounded-2xl bg-white">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Info size={19} /> Autofill run trace
            </DialogTitle>
            <CopyTraceButton
              value={formatted({ run_id: runId, failed_stage: failedStage ?? null, trace })}
            />
          </div>
          <DialogDescription className="break-all">
            Run ID: {runId}
            {failedStage ? ` · Stopped at ${stageLabel(failedStage)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
          {trace.length === 0 && (
            <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Processing did not reach a pipeline stage.
            </p>
          )}
          {trace.map((entry) => (
            <section key={entry.stage} className="rounded-xl border border-border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-ink">{stageLabel(entry.stage)}</h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}
                >
                  {entry.status === "failed"
                    ? "Needs attention"
                    : entry.status === "reused"
                      ? "Ready from earlier review"
                      : "Complete"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {entry.status === "failed"
                  ? "This step could not finish. Check the message shown with the form and try again."
                  : stageSummary(entry)}
              </p>
              {Object.keys(entry.output).length > 0 && (
                <details className="mt-3 rounded-lg border border-border bg-[#F7F8FB]">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-steel-blue">
                    View technical details
                  </summary>
                  <pre className="max-h-80 overflow-auto border-t border-border p-3 text-xs leading-5">
                    {formatted(entry.output)}
                  </pre>
                </details>
              )}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FieldTraceDialog({
  open,
  onOpenChange,
  runId,
  field,
  trace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  field: AutofillField | null;
  trace: StageTrace[];
}) {
  if (!field) return null;
  const schema = trace.find((entry) => entry.stage === "calibrate")?.output["template_schema"];
  const schemaFields =
    typeof schema === "object" && schema !== null && "fields" in schema ? schema.fields : null;
  const schemaField = Array.isArray(schemaFields)
    ? schemaFields.find(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "field_id" in item &&
          item.field_id === field.field_id,
      )
    : null;
  const details = [
    ["Detection", findCandidate(trace, field.candidate_id)],
    ["Schema", schemaField],
    ["Mapping", findFieldRecord(trace, "map", "mappings", field.field_id)],
    ["Placement", findFieldRecord(trace, "fill", "placements", field.field_id)],
    ["Verification", findFieldRecord(trace, "verify", "checks", field.field_id)],
  ] as const;
  const geometry = {
    candidate_id: field.candidate_id,
    blank_rect: field.blank_rect,
    preview_bbox: field.preview_bbox,
    write_rect: field.write_rect ?? null,
  };
  const fieldTrace = {
    run_id: runId,
    field_id: field.field_id,
    label: field.label,
    page: field.page,
    geometry,
    detection: details[0][1],
    schema: details[1][1],
    mapping: details[2][1],
    placement: details[3][1],
    verification: details[4][1],
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-[min(96vw,760px)] flex-col rounded-2xl bg-white">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Info size={19} /> {field.label}
            </DialogTitle>
            <CopyTraceButton value={formatted(fieldTrace)} />
          </div>
          <DialogDescription>
            Field ID: {field.field_id} · Page {field.page}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1 text-sm">
          <section className="rounded-xl border border-border p-3">
            <h3 className="font-bold">Geometry · top-left PDF points</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Detected blank, preview area, and actual write area.
            </p>
            <pre className="mt-2 overflow-auto rounded-lg bg-[#F7F8FB] p-3 text-xs">
              {formatted(geometry)}
            </pre>
          </section>
          {details.map(([label, value]) => (
            <section key={label} className="rounded-xl border border-border p-3">
              <h3 className="font-bold">{label}</h3>
              <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[#F7F8FB] p-3 text-xs">
                {formatted(value)}
              </pre>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
