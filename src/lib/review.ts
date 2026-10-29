import type { AutofillField, FieldDecision } from "@/lib/autofill";

export type ReviewStatus = "verified" | "review" | "fix" | "missing" | "manual";
export type ReviewEdit = { value: string; quote: string };

export function needsPlacementEdit(field: AutofillField): boolean {
  return (
    field.placement_status === "overflow" ||
    field.placement_status === "review" ||
    field.verification_status === "failed"
  );
}

export function reviewFieldStatus(field: AutofillField): ReviewStatus {
  if (field.placement_status === "manual") return "manual";
  if (field.mapping_status === "missing") return "missing";
  if (needsPlacementEdit(field)) return "fix";
  if (field.mapping_status === "review") return "review";
  if (field.placement_status === "missing") return "missing";
  return field.verification_status === "passed" ? "verified" : "fix";
}

export function needsDecision(field: AutofillField): boolean {
  return field.mapping_status === "review" || needsPlacementEdit(field);
}

export function reviewDecision(
  field: AutofillField,
  edit: ReviewEdit | undefined,
  approved: boolean,
  rejected: boolean,
): FieldDecision | null {
  if (!needsDecision(field)) return null;
  if (rejected && field.mapping_status === "review") {
    return { field_id: field.field_id, action: "reject" };
  }
  const value = (edit?.value ?? field.mapped_value ?? "").trim();
  const quote = (edit?.quote ?? field.source_quote ?? "").trim();
  const changed = value !== (field.mapped_value ?? "").trim();
  if (!approved || !value || !quote || (needsPlacementEdit(field) && !changed)) return null;
  return changed
    ? { field_id: field.field_id, action: "edit", value, source_quote: quote }
    : { field_id: field.field_id, action: "approve" };
}
