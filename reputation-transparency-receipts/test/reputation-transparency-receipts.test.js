import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { analyzeReputationTransparencyReceipts } from "../src/reputation-transparency-receipts.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sample = JSON.parse(readFileSync(join(root, "data", "sample-community-input.json"), "utf8"));

describe("analyzeReputationTransparencyReceipts", () => {
  it("redacts double-blind reviewer identity while keeping visibility receipts", () => {
    const report = analyzeReputationTransparencyReceipts(sample);
    const blinded = report.reviewReceipts.find((receipt) => receipt.id === "rev-doubleblind-7");
    const publicReview = report.reviewReceipts.find((receipt) => receipt.id === "rev-manuscript-1");

    assert.match(blinded.reviewer, /^anonymous-/);
    assert.deepEqual(blinded.visibleTo, ["editor-board"]);
    assert.equal(publicReview.reviewer, "Ada Chen");
    assert.deepEqual(publicReview.visibleTo, ["public"]);
  });

  it("builds transparent reputation reports with tiers and signal breakdowns", () => {
    const report = analyzeReputationTransparencyReceipts(sample);
    const ada = report.reputationReports.find((item) => item.userId === "usr-ada");
    const cora = report.reputationReports.find((item) => item.userId === "usr-cora");

    assert.ok(ada.score > 60);
    assert.equal(ada.signals.bountyCompletions, 8);
    assert.equal(cora.signals.reproducibility, 9);
    assert.equal(report.leaderboards.byDomain.biology[0].userId, "usr-ada");
  });

  it("flags self endorsements and thin high-score reviews for moderation", () => {
    const report = analyzeReputationTransparencyReceipts(sample);
    const kinds = new Set(report.moderationFindings.map((finding) => finding.kind));

    assert.equal(kinds.has("self_endorsement"), true);
    assert.equal(kinds.has("thin_high_score_review"), true);
    assert.equal(report.summary.findings, 2);
  });

  it("is deterministic for audit evidence", () => {
    const first = analyzeReputationTransparencyReceipts(sample);
    const second = analyzeReputationTransparencyReceipts(sample);

    assert.equal(first.evidenceDigest, second.evidenceDigest);
    assert.deepEqual(first.timeline.map((event) => event.subject), second.timeline.map((event) => event.subject));
  });
});
