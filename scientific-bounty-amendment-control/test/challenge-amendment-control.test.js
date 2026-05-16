import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { evaluateChallengeAmendments } from "../src/challenge-amendment-control.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sample = JSON.parse(readFileSync(join(root, "data", "sample-amendments.json"), "utf8"));

describe("evaluateChallengeAmendments", () => {
  it("detects material sponsor changes after solver work has started", () => {
    const report = evaluateChallengeAmendments(sample);
    const byAmendment = new Map(report.findings.map((finding) => [finding.amendmentId, finding]));

    assert.equal(report.summary.amendmentsReviewed, 4);
    assert.equal(report.summary.materialAmendments, 4);
    assert.equal(byAmendment.get("amd-deadline-shorter").severity, "critical");
    assert.equal(byAmendment.get("amd-rubric-shift").severity, "high");
    assert.equal(byAmendment.get("amd-ip-policy").severity, "critical");
  });

  it("holds evaluation and payout readiness until teams receive notice and acknowledge", () => {
    const report = evaluateChallengeAmendments(sample);

    assert.equal(report.summary.evaluationDecision, "hold");
    assert.equal(report.summary.payoutDecision, "hold_until_acknowledged");
    assert.equal(report.holdDecisions.reasons.includes("solver_notice_incomplete"), true);
    assert.equal(report.holdDecisions.reasons.includes("solver_acknowledgement_incomplete"), true);
  });

  it("creates team notification packets for every affected material amendment", () => {
    const report = evaluateChallengeAmendments(sample);
    const ipPolicyNotices = report.solverNotifications.filter((notice) => notice.amendmentId === "amd-ip-policy");
    const prizeIncreaseNotices = report.solverNotifications.filter((notice) => notice.amendmentId === "amd-prize-increase");

    assert.equal(ipPolicyNotices.length, 2);
    assert.equal(ipPolicyNotices.every((notice) => notice.priority === "urgent"), true);
    assert.equal(prizeIncreaseNotices.every((notice) => notice.sent && notice.acknowledged), true);
  });

  it("is deterministic for audit evidence", () => {
    const first = evaluateChallengeAmendments(sample);
    const second = evaluateChallengeAmendments(sample);

    assert.equal(first.evidenceDigest, second.evidenceDigest);
    assert.deepEqual(first.auditEvents.map((event) => event.eventId), second.auditEvents.map((event) => event.eventId));
  });
});
