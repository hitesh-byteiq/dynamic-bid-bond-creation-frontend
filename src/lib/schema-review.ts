import type { PdfRect, StageTrace } from "@/lib/autofill";

export type SchemaFieldDraft = Record<string, unknown> & {
  field_id: string;
  alias: string;
  label: string;
  description?: string | null;
  page: number;
  entry_bbox: PdfRect;
  entry_regions?: PdfRect[];
  aliases?: string[];
};

export type SchemaDraft = Record<string, unknown> & {
  fields: SchemaFieldDraft[];
  non_fields?: Array<{ alias: string; reason?: string | null }>;
  unresolved_aliases?: string[];
  pages?: Array<{ width: number; height: number }>;
};

export type SchemaCandidate = {
  alias: string;
  candidateId: string;
  page: number;
  rect: PdfRect;
  kind: string;
  nearbyWords: string[];
  sourceType: "blank" | "acroform";
  acroName: string | null;
  acroFieldType: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRect(value: unknown): value is PdfRect {
  return (
    Array.isArray(value) && value.length === 4 && value.every((part) => typeof part === "number")
  );
}

export function schemaCandidates(trace: StageTrace[]): SchemaCandidate[] {
  const inspect = trace.find((entry) => entry.stage === "inspect");
  const pages = inspect?.output["pages"];
  if (!Array.isArray(pages)) return [];
  const candidates: SchemaCandidate[] = [];
  let blankIndex = 1;
  let acroIndex = 1;
  for (const page of pages) {
    if (!isRecord(page) || typeof page["page"] !== "number") continue;
    const pageNumber = page["page"];
    for (const item of Array.isArray(page["blank_candidates"]) ? page["blank_candidates"] : []) {
      const alias = `F${String(blankIndex++).padStart(2, "0")}`;
      if (!isRecord(item) || !isRect(item["rect"])) continue;
      candidates.push({
        alias,
        candidateId: String(item["candidate_id"] ?? ""),
        page: pageNumber,
        rect: item["rect"],
        kind: String(item["kind"] ?? "blank"),
        nearbyWords: Array.isArray(item["nearby_words"])
          ? item["nearby_words"].filter((word): word is string => typeof word === "string")
          : [],
        sourceType: "blank",
        acroName: null,
        acroFieldType: null,
      });
    }
    for (const item of Array.isArray(page["acroform_fields"]) ? page["acroform_fields"] : []) {
      const alias = `A${String(acroIndex++).padStart(2, "0")}`;
      if (!isRecord(item) || !isRect(item["rect"])) continue;
      candidates.push({
        alias,
        candidateId: String(item["field_id"] ?? ""),
        page: pageNumber,
        rect: item["rect"],
        kind: "acroform",
        nearbyWords: [],
        sourceType: "acroform",
        acroName: typeof item["name"] === "string" ? item["name"] : null,
        acroFieldType: typeof item["field_type"] === "string" ? item["field_type"] : null,
      });
    }
  }
  return candidates;
}

export function availableCandidates(schema: SchemaDraft, candidates: SchemaCandidate[]) {
  const used = new Set(schema.fields.flatMap((field) => field.aliases ?? [field.alias]));
  return candidates.filter(
    (candidate) => !used.has(candidate.alias) && candidate.kind !== "separator",
  );
}

export function removeSchemaField(schema: SchemaDraft, fieldId: string): SchemaDraft {
  const removed = schema.fields.find((field) => field.field_id === fieldId);
  if (!removed) return schema;
  const aliases = removed.aliases ?? [removed.alias];
  const nonFields = (schema.non_fields ?? []).filter((item) => !aliases.includes(item.alias));
  return {
    ...schema,
    fields: schema.fields.filter((field) => field.field_id !== fieldId),
    non_fields: [
      ...nonFields,
      ...aliases.map((alias) => ({ alias, reason: "Removed from the template by reviewer" })),
    ],
    unresolved_aliases: (schema.unresolved_aliases ?? []).filter(
      (alias) => !aliases.includes(alias),
    ),
  };
}

export function addSchemaField(
  schema: SchemaDraft,
  candidate: SchemaCandidate,
  label: string,
  description: string,
  manual: boolean,
): SchemaDraft {
  const cleanLabel = label.trim();
  const cleanDescription = description.trim();
  if (!cleanLabel || !cleanDescription) throw new Error("Add a field name and description.");
  if (!availableCandidates(schema, [candidate]).length)
    throw new Error("This location is already a field.");
  const baseId =
    cleanLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "field";
  const ids = new Set(schema.fields.map((field) => field.field_id));
  let fieldId = baseId;
  for (let index = 2; ids.has(fieldId); index += 1) fieldId = `${baseId}_${index}`;
  const isCheckbox = candidate.acroFieldType?.toLowerCase().includes("btn") ?? false;
  const field: SchemaFieldDraft = {
    field_id: fieldId,
    alias: candidate.alias,
    aliases: [candidate.alias],
    label: cleanLabel,
    description: cleanDescription,
    field_type: manual ? "signature" : isCheckbox ? "checkbox" : "text",
    confidence: "medium",
    candidate_id: candidate.candidateId,
    page: candidate.page,
    blank_rect: candidate.rect,
    entry_bbox: candidate.rect,
    entry_regions: [candidate.rect],
    manual,
    nearby_words: candidate.nearbyWords,
    source_type: candidate.sourceType,
    acro_name: candidate.acroName,
  };
  return {
    ...schema,
    fields: [...schema.fields, field],
    non_fields: (schema.non_fields ?? []).filter((item) => item.alias !== candidate.alias),
    unresolved_aliases: (schema.unresolved_aliases ?? []).filter(
      (alias) => alias !== candidate.alias,
    ),
  };
}
