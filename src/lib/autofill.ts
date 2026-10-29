export type PdfRect = [number, number, number, number];

export type AutofillField = {
  field_id: string;
  candidate_id: string | null;
  label: string;
  description: string | null;
  field_type: string;
  page: number;
  blank_rect: PdfRect;
  entry_regions?: PdfRect[];
  preview_bbox: PdfRect;
  rect: PdfRect;
  write_rect?: PdfRect | null;
  write_rects?: PdfRect[];
  mapped_value: string | null;
  written_value: string | null;
  source_quote: string | null;
  status: "filled" | "missing" | "skipped";
  mapping_status: "verified" | "review" | "missing";
  placement_status: "written" | "overflow" | "skipped" | "manual" | "missing" | "review";
  verification_status: "passed" | "failed" | "not_checked";
  reason: string | null;
  value_origin?: "source" | "normalized" | "derived";
};

export type StageTrace = {
  stage: "inspect" | "calibrate" | "map" | "fill" | "verify";
  status: "completed" | "reused" | "failed";
  duration_ms: number;
  summary: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type AutofillFailure = {
  detail: string;
  run_id: string;
  failed_stage: string;
  trace: StageTrace[];
};

export type AutofillResponse = {
  run_id: string;
  status: "completed" | "partial";
  requires_approval?: boolean;
  mapping_id?: string | null;
  filename: string;
  output_filename: string;
  page_count: number;
  coordinate_system: "top_left_origin_pdf_points";
  template: {
    sha256: string;
    schema_id: string;
    schema_status: string;
    schema_source: string;
  };
  summary: {
    detected: number;
    mapped: number;
    filled: number;
    skipped: number;
    review: number;
    missing: number;
    overflow: number;
    manual: number;
    verification_passed: number;
  };
  pages: Array<{ page: number; width: number; height: number; rotation: number }>;
  fields: AutofillField[];
  warnings: string[];
  trace?: StageTrace[] | null;
  pdf_mime_type: "application/pdf";
  pdf_base64: string;
};

export type SchemaReviewResponse = {
  run_id: string;
  status: "schema_review_required";
  filename: string;
  template: { sha256: string; schema_id: string; schema_status: string; schema_source: string };
  schema: Record<string, unknown>;
  preview_images: string[];
  trace: StageTrace[];
};

export type FieldDecision = {
  field_id: string;
  action: "approve" | "reject" | "edit";
  value?: string;
  source_quote?: string;
};

export type FinalizeResponse = {
  run_id: string;
  status: "finalized";
  output_filename: string;
  pdf_mime_type: "application/pdf";
  pdf_base64: string;
  fields: AutofillField[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPdfRect(value: unknown): value is PdfRect {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
  );
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isAutofillField(value: unknown): value is AutofillField {
  if (!isRecord(value)) return false;
  const field = value as Partial<AutofillField>;
  return (
    typeof field.field_id === "string" &&
    isStringOrNull(field.candidate_id) &&
    typeof field.label === "string" &&
    isStringOrNull(field.description) &&
    typeof field.field_type === "string" &&
    Number.isInteger(field.page) &&
    (field.page as number) > 0 &&
    isPdfRect(field.blank_rect) &&
    isPdfRect(field.preview_bbox) &&
    isPdfRect(field.rect) &&
    (field.write_rect === undefined || field.write_rect === null || isPdfRect(field.write_rect)) &&
    (field.entry_regions === undefined ||
      (Array.isArray(field.entry_regions) && field.entry_regions.every(isPdfRect))) &&
    (field.write_rects === undefined ||
      (Array.isArray(field.write_rects) && field.write_rects.every(isPdfRect))) &&
    isStringOrNull(field.mapped_value) &&
    isStringOrNull(field.written_value) &&
    isStringOrNull(field.source_quote) &&
    ["filled", "missing", "skipped"].includes(String(field.status)) &&
    ["verified", "review", "missing"].includes(String(field.mapping_status)) &&
    ["written", "overflow", "skipped", "manual", "missing", "review"].includes(
      String(field.placement_status),
    ) &&
    ["passed", "failed", "not_checked"].includes(String(field.verification_status)) &&
    isStringOrNull(field.reason)
  );
}

export function isSchemaReviewResponse(value: unknown): value is SchemaReviewResponse {
  if (!isRecord(value) || !isRecord(value["template"]) || !isRecord(value["schema"])) return false;
  return (
    value["status"] === "schema_review_required" &&
    typeof value["run_id"] === "string" &&
    typeof value["filename"] === "string" &&
    typeof value["template"]["schema_id"] === "string" &&
    Array.isArray(value["preview_images"]) &&
    value["preview_images"].every((image) => typeof image === "string") &&
    Array.isArray(value["trace"]) &&
    value["trace"].every(isStageTrace)
  );
}

export function isFinalizeResponse(value: unknown): value is FinalizeResponse {
  return (
    isRecord(value) &&
    typeof value["run_id"] === "string" &&
    value["status"] === "finalized" &&
    typeof value["output_filename"] === "string" &&
    value["pdf_mime_type"] === "application/pdf" &&
    typeof value["pdf_base64"] === "string" &&
    Array.isArray(value["fields"]) &&
    value["fields"].every(isAutofillField)
  );
}

export function isStageTrace(value: unknown): value is StageTrace {
  if (!isRecord(value)) return false;
  const trace = value as Partial<StageTrace>;
  return (
    ["inspect", "calibrate", "map", "fill", "verify"].includes(String(trace.stage)) &&
    ["completed", "reused", "failed"].includes(String(trace.status)) &&
    typeof trace.duration_ms === "number" &&
    Number.isFinite(trace.duration_ms) &&
    isRecord(trace.summary) &&
    isRecord(trace.output)
  );
}

export function isAutofillFailure(value: unknown): value is AutofillFailure {
  if (!isRecord(value)) return false;
  const failure = value as Partial<AutofillFailure>;
  return (
    typeof failure.detail === "string" &&
    typeof failure.run_id === "string" &&
    typeof failure.failed_stage === "string" &&
    Array.isArray(failure.trace) &&
    failure.trace.every(isStageTrace)
  );
}

export function isAutofillResponse(value: unknown): value is AutofillResponse {
  if (!isRecord(value)) return false;
  const response = value as Partial<AutofillResponse>;
  if (!isRecord(response.summary) || !isRecord(response.template)) return false;
  const { summary, template } = response;
  return (
    typeof response.run_id === "string" &&
    ["completed", "partial"].includes(String(response.status)) &&
    typeof response.filename === "string" &&
    typeof response.output_filename === "string" &&
    Number.isInteger(response.page_count) &&
    (response.page_count as number) > 0 &&
    response.coordinate_system === "top_left_origin_pdf_points" &&
    typeof template.sha256 === "string" &&
    typeof template.schema_id === "string" &&
    typeof template.schema_status === "string" &&
    typeof template.schema_source === "string" &&
    [
      "detected",
      "mapped",
      "filled",
      "skipped",
      "review",
      "missing",
      "overflow",
      "manual",
      "verification_passed",
    ].every((key) => isNonnegativeNumber(summary[key as keyof AutofillResponse["summary"]])) &&
    Array.isArray(response.pages) &&
    response.pages.every((value: unknown) => {
      if (!isRecord(value)) return false;
      const page = value as Partial<AutofillResponse["pages"][number]>;
      return (
        Number.isInteger(page.page) &&
        (page.page as number) > 0 &&
        isNonnegativeNumber(page.width) &&
        isNonnegativeNumber(page.height) &&
        typeof page.rotation === "number"
      );
    }) &&
    Array.isArray(response.fields) &&
    response.fields.every(isAutofillField) &&
    Array.isArray(response.warnings) &&
    response.warnings.every((warning: unknown) => typeof warning === "string") &&
    (response.trace === undefined ||
      response.trace === null ||
      (Array.isArray(response.trace) && response.trace.every(isStageTrace))) &&
    response.pdf_mime_type === "application/pdf" &&
    typeof response.pdf_base64 === "string" &&
    response.pdf_base64.length > 0
  );
}

export function fieldDisplayState(field: AutofillField): "filled" | "missing" | "attention" {
  if (field.placement_status === "manual") return "attention";
  if (field.mapping_status === "missing" || field.status === "missing") return "missing";
  if (
    field.status === "filled" &&
    field.mapping_status === "verified" &&
    field.placement_status === "written" &&
    field.verification_status === "passed"
  )
    return "filled";
  return "attention";
}
