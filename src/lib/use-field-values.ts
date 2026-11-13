import { useCallback, useEffect, useRef, useState } from "react";
import type { AutofillField } from "@/lib/autofill";

type FieldValues = Record<string, string>;
type FieldFontSizes = Record<string, number | null>;

function seedValues(fields: AutofillField[]): FieldValues {
  return Object.fromEntries(fields.map((field) => [field.field_id, field.mapped_value ?? ""]));
}

function seedFontSizes(fields: AutofillField[]): FieldFontSizes {
  return Object.fromEntries(fields.map((field) => [field.field_id, field.font_size ?? null]));
}

/**
 * Single source of truth for review-screen values and per-field font sizes.
 *
 * The field cards and the PDF panel both read/write this state, so an edit in
 * either place instantly shows up in the other without regenerating the PDF.
 */
export function useFieldValues(fields: AutofillField[], workflowId: string) {
  const [values, setValues] = useState<FieldValues>(() => seedValues(fields));
  const [fontSizes, setFontSizes] = useState<FieldFontSizes>(() => seedFontSizes(fields));
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const workflowRef = useRef(workflowId);

  // A new workflow means a new document: reseed instead of keeping stale edits.
  useEffect(() => {
    if (workflowRef.current === workflowId) return;
    workflowRef.current = workflowId;
    setValues(seedValues(fields));
    setFontSizes(seedFontSizes(fields));
    setDirty(new Set());
  }, [fields, workflowId]);

  const setValue = useCallback((fieldId: string, value: string) => {
    setValues((current) =>
      current[fieldId] === value ? current : { ...current, [fieldId]: value },
    );
    setDirty((current) => {
      if (current.has(fieldId)) return current;
      const next = new Set(current);
      next.add(fieldId);
      return next;
    });
  }, []);

  const setFontSize = useCallback((fieldId: string, size: number | null) => {
    setFontSizes((current) =>
      current[fieldId] === size ? current : { ...current, [fieldId]: size },
    );
    setDirty((current) => {
      if (current.has(fieldId)) return current;
      const next = new Set(current);
      next.add(fieldId);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setValues(seedValues(fields));
    setFontSizes(seedFontSizes(fields));
    setDirty(new Set());
  }, [fields]);

  return { values, fontSizes, dirty, setValue, setFontSize, reset };
}
