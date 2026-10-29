import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/lib/review.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { needsDecision, reviewDecision, reviewFieldStatus } = exports;

const field = {
  field_id: "surety_details",
  mapped_value: "Long source-backed surety details",
  source_quote: "Long source-backed surety details",
  mapping_status: "verified",
  placement_status: "overflow",
  verification_status: "failed",
};

test("overflow is a correction, even when mapping is verified", () => {
  assert.equal(reviewFieldStatus(field), "fix");
  assert.equal(needsDecision(field), true);
  assert.equal(reviewDecision(field, undefined, true, false), null);
  assert.deepEqual(
    reviewDecision(field, { value: "surety details", quote: field.source_quote }, true, false),
    {
      field_id: field.field_id,
      action: "edit",
      value: "surety details",
      source_quote: field.source_quote,
    },
  );
});

test("review values need confirmation, while manual fields are labeled separately", () => {
  const review = {
    ...field,
    mapping_status: "review",
    placement_status: "written",
    verification_status: "passed",
  };
  assert.equal(reviewFieldStatus(review), "review");
  assert.equal(reviewDecision(review, undefined, false, false), null);
  assert.equal(reviewDecision(review, undefined, true, false).action, "approve");
  assert.equal(
    reviewDecision({ ...review, mapped_value: null }, undefined, false, true).action,
    "reject",
  );
  assert.equal(
    reviewFieldStatus({ ...field, placement_status: "manual", verification_status: "not_checked" }),
    "manual",
  );
});
