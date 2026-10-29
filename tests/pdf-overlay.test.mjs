import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import ts from "typescript";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(frontend, "src/lib/pdf-overlay.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { projectPdfRect } = exports;

const pdfPath = path.resolve(
  frontend,
  "../bid-bond-backend/documentation/sample bids/sample_form1.pdf",
);
const task = getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)) });
const document = await task.promise;
const page = await document.getPage(1);
const pageView = page.view;
const box = [100, 200, 350, 200.6];

test("PDF overlay uses exact geometry at different zoom levels", () => {
  const one = projectPdfRect(box, pageView, page.getViewport({ scale: 1 }));
  const two = projectPdfRect(box, pageView, page.getViewport({ scale: 2 }));
  assert.ok(one);
  assert.ok(two);
  assert.ok(Math.abs(one.left - (100 / pageView[2]) * 100) < 0.001);
  assert.ok(Math.abs(one.top - (200 / pageView[3]) * 100) < 0.001);
  assert.ok(Math.abs(one.width - (250 / pageView[2]) * 100) < 0.001);
  assert.ok(Math.abs(one.height - (0.6 / pageView[3]) * 100) < 0.001);
  for (const key of ["left", "top", "width", "height"]) {
    assert.ok(Math.abs(one[key] - two[key]) < 0.001);
  }
});

test("PDF overlay follows PDF.js page rotation", () => {
  const normal = projectPdfRect(box, pageView, page.getViewport({ scale: 1, rotation: 0 }));
  const rotated = projectPdfRect(box, pageView, page.getViewport({ scale: 1, rotation: 90 }));
  assert.ok(normal);
  assert.ok(rotated);
  assert.ok(Math.abs(normal.width - rotated.height) < 0.001);
  assert.ok(Math.abs(normal.height - rotated.width) < 0.001);
  assert.ok(rotated.left >= 0 && rotated.left + rotated.width <= 100);
  assert.ok(rotated.top >= 0 && rotated.top + rotated.height <= 100);
});

await task.destroy();
