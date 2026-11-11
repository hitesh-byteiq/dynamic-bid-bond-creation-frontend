import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(frontend, "src/lib/pdf-form-values.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { compositeDateParts, isCheckedValue, widgetNameFor } = exports;

test("checkbox values accept the common truthy spellings", () => {
  for (const value of ["true", "YES", "1", "checked", "x", " on "]) {
    assert.equal(isCheckedValue(value), true, value);
  }
  for (const value of ["", "false", "no", "0", "unchecked", null, undefined]) {
    assert.equal(isCheckedValue(value), false, String(value));
  }
});

test("composite dates split into day, month name and two-digit year", () => {
  assert.deepEqual(compositeDateParts("2026-11-09"), {
    day: "9",
    month: "November",
    year_2digit: "26",
  });
  assert.equal(compositeDateParts("09/11/2026"), null);
  assert.equal(compositeDateParts("2026-13-01"), null);
  assert.equal(compositeDateParts(""), null);
});

test("widget names prefer the backend-reported widget name", () => {
  assert.equal(
    widgetNameFor({ field_id: "f1", field_name: "BidAmount", widget_name: "widget_1" }),
    "widget_1",
  );
  assert.equal(widgetNameFor({ field_id: "f2", field_name: "BidAmount" }), "BidAmount");
  assert.equal(widgetNameFor({ field_id: "f3" }), "f3");
});
