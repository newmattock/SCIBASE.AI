import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcileCitationContext } from "../src/citation-context-reconciler.js";

const fixture = JSON.parse(readFileSync(new URL("../sample/citation-context-packet.json", import.meta.url), "utf8"));

const audit = reconcileCitationContext(fixture);
assert.equal(audit.ready, false);
assert.equal(audit.counts.claims, 3);
assert.equal(audit.counts.sources, 4);
assert.equal(audit.counts.blockers, 5);
assert.equal(audit.counts.warnings, 6);
assert.equal(audit.counts.opportunities, 2);
assert.match(audit.exportPacket.auditDigest, /^citation-context:5:6:[a-f0-9]{16}$/);

const blockerCodes = audit.findings
  .filter((item) => item.severity === "blocker")
  .map((item) => item.code)
  .sort();
assert.deepEqual(blockerCodes, [
  "citation-intent-mismatch",
  "citation-intent-mismatch",
  "contradicting-source-used-as-support",
  "contradictory-cited-effects",
  "effect-direction-mismatch"
]);

assert.equal(audit.reproducibility.confidence, "low");
assert.equal(audit.opportunityFeed[0].id, "gap-older-adult-replication");
assert.equal(
  audit.revisionTasks.some((task) => task.code === "citation-intent-mismatch" && task.ownerHint === "author"),
  true
);

const cleanPacket = structuredClone(fixture);
cleanPacket.claims = [
  {
    id: "claim-clean-cytokine",
    section: "Results",
    text: "A recent replication did not detect a cytokine decrease in older post-viral cohorts.",
    citedSourceIds: ["src-recent-null-meta"],
    methodTags: ["wearable-sensor-cohort", "cytokine-panel"],
    populations: ["older-adults", "post-viral-fatigue"],
    effectDirection: "no-effect",
    usesCitationAs: "limitation",
    requiresCurrentEvidence: true,
    requiresReproducibilityEvidence: true
  }
];
cleanPacket.sources = cleanPacket.sources.map((source) =>
  source.id === "src-recent-null-meta" ? { ...source, stance: "supports" } : source
);
cleanPacket.corpusGaps = [];
const cleanAudit = reconcileCitationContext(cleanPacket);
assert.equal(cleanAudit.ready, true);
assert.equal(cleanAudit.counts.blockers, 0);
assert.equal(cleanAudit.counts.warnings, 0);
assert.equal(cleanAudit.reproducibility.confidence, "high");

const danglingPacket = structuredClone(cleanPacket);
danglingPacket.claims[0].citedSourceIds = ["src-missing"];
const danglingAudit = reconcileCitationContext(danglingPacket);
assert.equal(danglingAudit.ready, false);
assert.equal(danglingAudit.findings.some((item) => item.code === "unknown-source"), true);

console.log("citation context reconciler tests passed");
