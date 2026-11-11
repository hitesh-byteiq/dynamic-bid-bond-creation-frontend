import type { AutofillField, PdfRect } from "@/lib/autofill";

export type WorkflowEvent = {
  event: string;
  data: Record<string, unknown>;
};

export type PdfType = "acroform" | "normal";

export type WorkflowResponse = {
  workflow_id: string;
  status: "completed" | "needs_review" | "failed" | string;
  pdf_base64: string | null;
  pdf_filename: string;
  error: string;
  detected_fields: Array<Record<string, unknown>>;
  template_fields?: Array<{
    field_id: string;
    label: string;
    field_state: "PRE_FILLED" | "EMPTY" | "REQUIRES_INPUT" | string;
    existing_value?: string | null;
    rect?: number[] | null;
    safe_rect?: number[] | null;
    review_reason?: string | null;
  }>;
  mapped_fields: Array<Record<string, unknown>>;
  unresolved_fields: Array<Record<string, unknown>>;
  /** field_id -> AcroForm widget name, produced by the S4 fill stage. */
  field_widget_names?: Record<string, string>;
  composite_widget_names?: Record<string, string[]>;
  verdict: Record<string, unknown> | null;
  tool_calls: Array<Record<string, unknown>>;
  repair_history: Array<Record<string, unknown>>;
  quality: Record<string, unknown>;
};

function apiBaseUrl() {
  return String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
}

function base64ToPdfBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "application/pdf" });
}

/** Apply the current review values and return the requested PDF format. */
export async function finalizeReviewedPdf({
  pdfBase64,
  fields,
  values,
  pdfType,
  filename,
  compositeWidgetNames = {},
}: {
  pdfBase64: string;
  fields: AutofillField[];
  values: Record<string, string>;
  pdfType: PdfType;
  filename: string;
  compositeWidgetNames?: Record<string, string[]>;
}): Promise<Blob> {
  const fieldPayload = fields.map((field) => {
    const names = compositeWidgetNames[field.field_id] ?? [];
    const componentWidgetNames: Record<string, string> = {};
    field.date_targets?.forEach((target, index) => {
      const component = target.component;
      const name = names[index];
      if (component && name) componentWidgetNames[component] = name;
    });
    return {
      field_id: field.field_id,
      label: field.label,
      field_type: field.field_type,
      blank_style: field.blank_style ?? "",
      widget_name: field.widget_name || field.field_name || field.field_id,
      component_widget_names: componentWidgetNames,
      value: values[field.field_id] ?? field.mapped_value ?? "",
    };
  });
  const formData = new FormData();
  formData.append("file", base64ToPdfBlob(pdfBase64), filename || "filled_document.pdf");
  formData.append("fields", JSON.stringify(fieldPayload));
  formData.append("pdf_type", pdfType);

  const response = await fetch(`${apiBaseUrl()}/api/pdf/finalize`, {
    method: "POST",
    body: formData,
    headers: { Accept: "application/pdf" },
  });
  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed: unknown = JSON.parse(body);
      if (isRecord(parsed) && typeof parsed["detail"] === "string") detail = parsed["detail"];
    } catch {
      // Keep the response body as a readable HTTP error.
    }
    throw new Error(detail || `PDF finalization failed (HTTP ${response.status}).`);
  }
  return response.blob();
}

export async function runWorkflow(
  formData: FormData,
  onEvent: (event: WorkflowEvent) => void,
  signal?: AbortSignal,
): Promise<WorkflowResponse> {
  const response = await fetch(`${apiBaseUrl()}/api/workflow/stream`, {
    method: "POST",
    body: formData,
    ...(signal ? { signal } : {}),
    headers: { Accept: "text/event-stream" },
  });

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed: unknown = JSON.parse(body);
      if (isRecord(parsed) && typeof parsed["detail"] === "string") detail = parsed["detail"];
    } catch {
      // Keep the response body as a readable HTTP error.
    }
    throw new Error(detail || `Workflow request failed (HTTP ${response.status}).`);
  }
  if (!response.body) throw new Error("Workflow stream ended without a response body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: WorkflowResponse | null = null;
  let streamFailure = "";

  const dispatch = (frame: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let data: unknown;
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      throw new Error("Workflow returned an unreadable stream event.");
    }
    if (!isRecord(data)) throw new Error("Workflow returned an invalid stream event.");
    onEvent({ event: eventName, data });
    if (eventName === "run_failed") {
      streamFailure = typeof data["error"] === "string" ? data["error"] : "Workflow failed.";
    } else if (eventName === "run_finished") {
      finalResult = data as WorkflowResponse;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        dispatch(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }

  if (streamFailure) throw new Error(streamFailure);
  if (!finalResult) throw new Error("Workflow stream ended before its final result arrived.");
  return finalResult;
}

/** Compatibility helper for callers that already have a filled AcroForm PDF. */
export async function flattenPdf(filledPdf: Blob, filename?: string): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", filledPdf, filename || "filled_document.pdf");

  const response = await fetch(`${apiBaseUrl()}/api/pdf/flatten`, {
    method: "POST",
    body: formData,
    headers: { Accept: "application/pdf" },
  });

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed: unknown = JSON.parse(body);
      if (isRecord(parsed) && typeof parsed["detail"] === "string") detail = parsed["detail"];
    } catch {
      // Keep the response body as a readable HTTP error.
    }
    throw new Error(detail || `Flatten failed (HTTP ${response.status}).`);
  }
  return response.blob();
}

/** Legacy endpoint that reruns the workflow before returning a PDF. */
export async function downloadFilledPdf({
  file,
  sourceText,
  instructions,
  pdfType,
}: {
  file: File;
  sourceText: string;
  instructions?: string;
  pdfType: PdfType;
}): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("source_text", sourceText);
  if (instructions?.trim()) formData.append("instructions", instructions.trim());
  formData.append("pdf_type", pdfType);

  const response = await fetch(`${apiBaseUrl()}/api/workflow/run/download`, {
    method: "POST",
    body: formData,
    headers: { Accept: "application/pdf" },
  });

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed: unknown = JSON.parse(body);
      if (isRecord(parsed) && typeof parsed["detail"] === "string") detail = parsed["detail"];
    } catch {
      // Keep the response body as a readable HTTP error.
    }
    throw new Error(detail || `Download failed (HTTP ${response.status}).`);
  }
  return response.blob();
}

export function toReviewFields(result: WorkflowResponse): AutofillField[] {
  const mappings = new Map(result.mapped_fields.map((field) => [String(field["field_id"]), field]));
  const unresolved = new Map(
    result.unresolved_fields.map((field) => [String(field["field_id"]), field]),
  );
  const widgetNames = result.field_widget_names ?? {};
  return result.detected_fields.flatMap((detected) => {
    const id = String(detected["field_id"] ?? "");
    const mapping = mappings.get(id);
    const unresolvedField = unresolved.get(id);
    const rect = isRect(detected["safe_rect"]) ? detected["safe_rect"] : detected["rect"];
    if (!id || !isRect(rect)) return [];
    const compositeNames = result.composite_widget_names?.[id] ?? [];
    const dayWidgetName = compositeNames.find((name) => name.endsWith("__day"));
    const compositeBaseName = dayWidgetName?.slice(0, -"__day".length);
    const value = mapping?.["value"];
    const textValue = value === null || value === undefined ? null : String(value);
    const finalStatus = mapping?.["final_status"];
    const filled = mapping?.["fill_status"] === "filled";
    const status: AutofillField["status"] = filled ? "filled" : textValue ? "skipped" : "missing";
    const mappingStatus: AutofillField["mapping_status"] = textValue
      ? finalStatus === "verified"
        ? "verified"
        : "review"
      : "missing";
    const placementStatus: AutofillField["placement_status"] = filled
      ? "written"
      : textValue
        ? "review"
        : "missing";
    return [
      {
        field_id: id,
        candidate_id: id,
        label: String(mapping?.["label"] ?? detected["label"] ?? id),
        description: typeof detected["description"] === "string" ? detected["description"] : null,
        field_type: String(detected["field_type"] ?? "text"),
        field_name: typeof detected["field_name"] === "string" ? detected["field_name"] : null,
        widget_name:
          widgetNames[id] ??
          compositeBaseName ??
          (typeof detected["field_name"] === "string" ? detected["field_name"] : null),
        blank_style: typeof detected["blank_style"] === "string" ? detected["blank_style"] : null,
        ...(Array.isArray(detected["date_targets"])
          ? {
              date_targets: detected["date_targets"].filter(isRecord).map((target) => ({
                ...(typeof target["component"] === "string"
                  ? { component: target["component"] }
                  : {}),
                ...(isRect(target["rect"]) ? { rect: target["rect"] } : {}),
                ...(isRect(target["safe_rect"]) ? { safe_rect: target["safe_rect"] } : {}),
              })),
            }
          : {}),
        page: Number(detected["page"] ?? 1),
        blank_rect: rect,
        preview_bbox: rect,
        rect,
        mapped_value: textValue,
        written_value: filled ? textValue : null,
        source_quote:
          typeof mapping?.["source_excerpt"] === "string" ? mapping["source_excerpt"] : null,
        status,
        mapping_status: mappingStatus,
        placement_status: placementStatus,
        verification_status: finalStatus === "verified" ? "passed" : "not_checked",
        reason:
          typeof mapping?.["guardian_reason"] === "string"
            ? mapping["guardian_reason"]
            : typeof unresolvedField?.["reason"] === "string"
              ? unresolvedField["reason"]
              : null,
      },
    ];
  });
}

function isRect(value: unknown): value is PdfRect {
  return Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === "number");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
