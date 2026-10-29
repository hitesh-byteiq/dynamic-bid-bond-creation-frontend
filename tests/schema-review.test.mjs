import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/lib/schema-review.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { schemaCandidates, availableCandidates, addSchemaField, removeSchemaField } = exports;

const trace = [
  {
    stage: "inspect",
    output: {
      pages: [
        {
          page: 1,
          blank_candidates: [
            {
              candidate_id: "c1",
              rect: [10, 20, 90, 30],
              kind: "underline",
              nearby_words: ["Bond", "No."],
            },
            {
              candidate_id: "c2",
              rect: [10, 40, 90, 50],
              kind: "underline",
              nearby_words: ["Surety"],
            },
            { candidate_id: "c3", rect: [10, 60, 90, 70], kind: "separator", nearby_words: [] },
          ],
          acroform_fields: [
            { field_id: "a1", name: "Sign here", field_type: "Tx", rect: [10, 80, 90, 90] },
          ],
        },
      ],
    },
  },
];

const original = {
  template_sha256: "hash",
  pages: [{ width: 100, height: 100 }],
  fields: [
    {
      field_id: "bond_number",
      alias: "F01",
      aliases: ["F01"],
      label: "Bond number",
      page: 1,
      entry_bbox: [10, 20, 90, 30],
    },
  ],
  non_fields: [{ alias: "F02", reason: "Not a field" }],
  unresolved_aliases: ["F04"],
};

test("candidate aliases match the annotated preview and exclude separators from add options", () => {
  const candidates = schemaCandidates(trace);
  assert.deepEqual(
    candidates.map((item) => item.alias),
    ["F01", "F02", "F03", "A01"],
  );
  assert.deepEqual(
    availableCandidates(original, candidates).map((item) => item.alias),
    ["F02", "A01"],
  );
});

test("adding and removing a field update ownership and preserve its source geometry", () => {
  const candidate = schemaCandidates(trace)[1];
  const added = addSchemaField(
    original,
    candidate,
    "Surety name",
    "The surety company name.",
    false,
  );
  assert.equal(added.fields[1].candidate_id, "c2");
  assert.deepEqual(added.fields[1].entry_regions, [[10, 40, 90, 50]]);
  assert.equal(added.non_fields.length, 0);
  assert.equal(
    availableCandidates(added, schemaCandidates(trace)).some((item) => item.alias === "F02"),
    false,
  );
  const removed = removeSchemaField(added, added.fields[1].field_id);
  assert.equal(removed.fields.length, 1);
  assert.equal(removed.non_fields[0].alias, "F02");
  assert.equal(
    availableCandidates(removed, schemaCandidates(trace)).some((item) => item.alias === "F02"),
    true,
  );
});

test("add rejects missing meaning and duplicate locations", () => {
  const candidate = schemaCandidates(trace)[0];
  assert.throws(
    () => addSchemaField(original, candidate, "", "A value", false),
    /name and description/,
  );
  assert.throws(
    () => addSchemaField(original, candidate, "Bond number", "A value", false),
    /already a field/,
  );
});
