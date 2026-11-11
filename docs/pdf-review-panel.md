# PDF Review Panel

The review screen is a two-way PDF viewer: the field cards on the right and the
PDF panel on the left share one value state, so an edit in either place is
visible in the other immediately.

## Flow

```
WorkflowResultScreen (src/components/AutofillFlow.tsx)
├─ useFieldValues(fields, workflow_id)   shared values + dirty set
├─ Field cards                            read/write values
├─ FilledPdfPreview                       PDF viewer
│  ├─ pdf.js canvas                       page raster (zoom / paging)
│  ├─ pdf.js AnnotationLayer              real AcroForm widgets
│  └─ value overlay                       fallback when no widget exists
└─ Download                               built from the latest values
```

## Key files

| File | Responsibility |
| --- | --- |
| `src/lib/use-field-values.ts` | Single source of truth for `field_id -> value`. Resets on a new workflow. |
| `src/lib/pdf-form-values.ts` | Widget name resolution, checkbox/date normalisation, and `buildAcroFormPdf()` for downloads. |
| `src/components/FilledPdfPreview.tsx` | pdf.js viewer, `AnnotationLayer` widgets, live overlays, highlight toggle. |
| `src/components/AutofillFlow.tsx` | `WorkflowResultScreen` wiring: cards, toolbar, downloads. |

## Behaviour

- **Live preview** — typing in a card updates the shared state; the PDF widget
  value (or the fallback overlay) updates on the same render. The PDF is not
  regenerated while typing.
- **Two-way sync** — editing a real AcroForm widget writes back into the card.
- **Widgets** — the panel renders pdf.js `AnnotationLayer` so form fields appear
  and are interactive, instead of only showing coloured bounding boxes.
- **Highlights** — bounding boxes are opt-in via the "Show highlights" toggle;
  the selected field is always outlined.
- **Fallback overlay** — fields without a matching widget (flattened PDFs, XFA,
  unmapped names) render their value at the detected rectangle.
- **Downloads** — "Editable PDF" applies the latest values with `pdf-lib` at
  click time. The original uploaded PDF is never mutated.

## Backend contract

`/api/workflow/*` returns the AcroForm PDF as `pdf_base64`. When available, the
response may include `field_widget_names` (`field_id -> widget name`) so the
frontend does not have to guess widget names; otherwise it falls back to
`field_name` then `field_id`.

## Tests

- `tests/pdf-form-values.test.mjs` — checkbox, composite date, widget name.
- `tests/pdf-overlay.test.mjs` — coordinate projection.
