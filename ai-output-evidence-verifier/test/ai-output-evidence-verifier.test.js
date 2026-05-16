import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyAiOutputEvidence } from "../src/ai-output-evidence-verifier.js";

const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(
  await readFile(join(here, "..", "data", "sample-assistant-output.json"), "utf8")
);

const report = verifyAiOutputEvidence(sample);

assert.equal(report.ready, false);
assert.equal(report.recommendation, "hold_for_evidence_fix");
assert.equal(report.counts.outputs, 3);
assert.equal(report.counts.claims, 5);
assert.equal(report.counts.blockers, 4);
assert.equal(report.counts.warnings, 2);
assert.ok(report.auditDigest.startsWith("sha256:"));
assert.deepEqual(
  report.findings.map((finding) => finding.code).sort(),
  [
    "high_risk_claim_needs_multiple_sources",
    "low_confidence_claim",
    "missing_disclosure",
    "stale_source_review",
    "unsafe_source_status",
    "unsupported_claim"
  ].sort()
);
assert.ok(report.reviewerTasks.some((task) => task.action.includes("Add source evidence")));
assert.equal(report.sourceCoverage.missingCount, 0);

const cleanPacket = structuredClone(sample);
cleanPacket.sources = cleanPacket.sources.filter((source) => source.status === "active");
cleanPacket.outputs = [
  {
    id: "summary-clean",
    mode: "summary",
    audience: "collaborator",
    generatedAt: "2026-05-16T18:00:00Z",
    disclosures: ["ai-generated", "human-review-required", "source-coverage"],
    claims: [
      {
        id: "clean-claim",
        text: "The summary is limited to observed calcium-imaging correlations and dataset provenance.",
        sourceIds: ["paper-astrocyte-2025", "dataset-ca-raw"],
        tags: ["calcium-imaging", "raw-data"],
        confidence: 0.91
      }
    ]
  }
];

const cleanReport = verifyAiOutputEvidence(cleanPacket);
assert.equal(cleanReport.ready, true);
assert.equal(cleanReport.counts.blockers, 0);
assert.equal(cleanReport.counts.warnings, 0);
assert.equal(cleanReport.reviewerTasks.length, 0);

const missingSourcePacket = structuredClone(cleanPacket);
missingSourcePacket.outputs[0].claims[0].sourceIds = ["missing-source"];
const missingSourceReport = verifyAiOutputEvidence(missingSourcePacket);
assert.equal(missingSourceReport.ready, false);
assert.equal(missingSourceReport.sourceCoverage.missingCount, 1);
assert.ok(missingSourceReport.findings.some((finding) => finding.code === "unknown_source"));

console.log("ai-output-evidence-verifier tests passed");
