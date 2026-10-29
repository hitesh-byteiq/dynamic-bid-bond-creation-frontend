import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(frontend, "src/lib/autofill.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { fieldDisplayState, isAutofillFailure } = exports;

const writtenField = {
  status: "filled",
  mapping_status: "verified",
  placement_status: "written",
  verification_status: "passed",
};

test("written review values still need attention", () => {
  assert.equal(fieldDisplayState(writtenField), "filled");
  assert.equal(fieldDisplayState({ ...writtenField, mapping_status: "review" }), "attention");
  assert.equal(fieldDisplayState({ ...writtenField, verification_status: "failed" }), "attention");
  assert.equal(
    fieldDisplayState({
      ...writtenField,
      status: "skipped",
      mapping_status: "review",
      placement_status: "review",
      verification_status: "failed",
    }),
    "attention",
  );
});

test("missing and manual fields use their own attention states", () => {
  assert.equal(fieldDisplayState({ ...writtenField, mapping_status: "missing" }), "missing");
  assert.equal(fieldDisplayState({ ...writtenField, placement_status: "manual" }), "attention");
});

test("error trace contract requires a run ID and stage records", () => {
  assert.equal(
    isAutofillFailure({
      detail: "Autofill failed.",
      run_id: "run-1",
      failed_stage: "map",
      trace: [{ stage: "map", status: "failed", duration_ms: 10, summary: {}, output: {} }],
    }),
    true,
  );
  assert.equal(isAutofillFailure({ detail: "Autofill failed." }), false);
});
