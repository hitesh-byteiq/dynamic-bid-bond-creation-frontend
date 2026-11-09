import type { PDFDocument } from "pdf-lib";
import type { AutofillField } from "@/lib/autofill";

/**
 * AcroForm widget name for a review field.
 *
 * The backend can create widgets under `field_name`, `field_id`, or a suffixed
 * variant, so prefer the authoritative `widget_name` when the API provides it.
 */
export function widgetNameFor(field: AutofillField): string {
  return field.widget_name || field.field_name || field.field_id;
}

export function isCheckedValue(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return ["true", "yes", "y", "1", "checked", "x", "on"].includes(raw.trim().toLowerCase());
}

export type CompositeDateParts = {
  day: string;
  month: string;
  year_2digit: string;
};

/** Split an ISO `YYYY-MM-DD` value into the parts used by composite date fields. */
export function compositeDateParts(raw: string): CompositeDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, year = "", month = "", day = ""] = match;
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return {
    day: String(Number(day)),
    month: new Date(Number(year), monthNumber - 1, 1).toLocaleString("en-US", {
      month: "long",
    }),
    year_2digit: year.slice(-2),
  };
}

function isCheckbox(field: AutofillField) {
  return field.field_type.toLowerCase().includes("checkbox");
}

/**
 * Write review values into an already-loaded AcroForm PDF.
 * Unsupported/mismatched fields are skipped rather than failing the download.
 */
export function applyValuesToAcroForm(
  document: PDFDocument,
  fields: AutofillField[],
  values: Record<string, string>,
) {
  const form = document.getForm();
  const names = new Set(form.getFields().map((field) => field.getName()));

  for (const field of fields) {
    const value = values[field.field_id] ?? field.mapped_value ?? "";
    const baseName = widgetNameFor(field);
    try {
      if (field.blank_style === "composite_date" && field.date_targets?.length) {
        const parts = compositeDateParts(value);
        if (!parts) continue;
        for (const target of field.date_targets) {
          const component = target.component as keyof CompositeDateParts | undefined;
          if (!component) continue;
          const name = `${baseName}__${component}`;
          if (names.has(name)) form.getTextField(name).setText(parts[component]);
        }
        continue;
      }

      if (!names.has(baseName)) continue;

      if (isCheckbox(field)) {
        const checkbox = form.getCheckBox(baseName);
        if (isCheckedValue(value)) checkbox.check();
        else checkbox.uncheck();
      } else {
        form.getTextField(baseName).setText(value);
      }
    } catch {
      // A field can be named the same but be an unsupported widget type.
    }
  }

  form.updateFieldAppearances();
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Build the downloadable editable PDF from the latest review values. */
export async function buildAcroFormPdf(
  pdfBase64: string,
  fields: AutofillField[],
  values: Record<string, string>,
): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const document = await PDFDocument.load(base64ToBytes(pdfBase64));
  applyValuesToAcroForm(document, fields, values);
  const bytes = await document.save();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/pdf" });
}
