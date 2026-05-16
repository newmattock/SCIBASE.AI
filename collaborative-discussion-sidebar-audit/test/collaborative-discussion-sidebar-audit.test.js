import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditDiscussionSidebar } from "../src/collaborative-discussion-sidebar-audit.js";

const fixture = JSON.parse(readFileSync(new URL("../sample/discussion-sidebar-packet.json", import.meta.url), "utf8"));

const audit = auditDiscussionSidebar(fixture);
assert.equal(audit.ready, false);
assert.equal(audit.counts.threads, 4);
assert.equal(audit.counts.blockers, 5);
assert.equal(audit.counts.warnings, 3);
assert.equal(audit.counts.reviewerTasks, 1);
assert.equal(audit.sidebarCoverage.scopedSections, 3);
assert.equal(audit.sidebarCoverage.pinnedSources, 3);
assert.match(audit.exportPacket.auditDigest, /^scibase-paper-alpha:5:3:1:[a-f0-9]{12}$/);

const blockerCodes = audit.findings
  .filter((finding) => finding.severity === "blocker")
  .map((finding) => finding.code)
  .sort();
assert.deepEqual(blockerCodes, [
  "conflicting-decisions",
  "open-blocker",
  "stale-thread",
  "unknown-scope",
  "unsafe-pinned-source"
]);

const cleanPacket = structuredClone(fixture);
cleanPacket.threads = [
  {
    id: "thr-clean-methods",
    title: "Methods reviewer sign-off",
    scopeType: "section",
    scopeId: "sec-methods",
    status: "resolved",
    blocking: false,
    ownerId: "u-ada",
    participantIds: ["u-ada", "u-max"],
    updatedAt: "2026-05-16T12:00:00.000Z",
    pinnedSourceIds: ["src-protocol"],
    messages: [
      {
        authorId: "u-ada",
        createdAt: "2026-05-16T11:00:00.000Z",
        body: "Ready for sign-off."
      },
      {
        authorId: "u-max",
        createdAt: "2026-05-16T12:00:00.000Z",
        body: "Signed off."
      }
    ]
  }
];
cleanPacket.decisions = [
  {
    id: "dec-clean-methods",
    threadId: "thr-clean-methods",
    scopeId: "sec-methods",
    topicKey: "exclusion-criteria",
    status: "accepted",
    summary: "Use protocol v4 exclusion criteria.",
    decidedBy: "u-max",
    decidedAt: "2026-05-16T12:00:00.000Z",
    sourceIds: ["src-protocol"]
  }
];
const cleanAudit = auditDiscussionSidebar(cleanPacket);
assert.equal(cleanAudit.ready, true);
assert.equal(cleanAudit.counts.blockers, 0);
assert.equal(cleanAudit.counts.warnings, 0);
assert.equal(cleanAudit.exportPacket.entries.length, 1);

const missingEvidencePacket = structuredClone(cleanPacket);
missingEvidencePacket.decisions[0].sourceIds = ["src-missing"];
const missingEvidenceAudit = auditDiscussionSidebar(missingEvidencePacket);
assert.equal(missingEvidenceAudit.ready, false);
assert.equal(
  missingEvidenceAudit.findings.some((finding) => finding.code === "decision-source-missing"),
  true
);

console.log("collaborative discussion sidebar audit tests passed");
