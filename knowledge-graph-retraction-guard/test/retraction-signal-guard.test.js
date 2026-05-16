import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { analyzeRetractionSignals } from "../src/retraction-signal-guard.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sample = JSON.parse(readFileSync(join(root, "data", "sample-knowledge-graph.json"), "utf8"));

describe("analyzeRetractionSignals", () => {
  it("detects entity and relationship findings from publication notices", () => {
    const report = analyzeRetractionSignals(sample);
    const kinds = new Set(report.findings.map((finding) => finding.kind));

    assert.equal(report.summary.findings, 6);
    assert.equal(report.summary.criticalFindings, 2);
    assert.equal(report.summary.highFindings, 2);
    assert.equal(kinds.has("entity_publication_notice"), true);
    assert.equal(kinds.has("relationship_evidence_notice"), true);
  });

  it("suppresses recommendations backed by retracted evidence", () => {
    const report = analyzeRetractionSignals(sample);
    const decisions = new Map(report.recommendations.map((recommendation) => [recommendation.recommendationId, recommendation.decision]));

    assert.equal(decisions.get("rec-organoid-reuse"), "suppress");
    assert.equal(decisions.get("rec-protocol-transfer"), "review");
    assert.equal(decisions.get("rec-crispr-collab"), "allow");
    assert.equal(report.summary.suppressedRecommendations, 1);
    assert.equal(report.summary.reviewRecommendations, 1);
  });

  it("exports JSON-LD evidence for findings and recommendation decisions", () => {
    const report = analyzeRetractionSignals(sample);

    assert.equal(report.jsonLd["@context"].schema, "https://schema.org/");
    assert.equal(report.jsonLd["@graph"].length, 9);
    assert.equal(report.jsonLd["@graph"].some((node) => node.type === "scibase:RecommendationDecision"), true);
  });

  it("is deterministic for audit evidence", () => {
    const first = analyzeRetractionSignals(sample);
    const second = analyzeRetractionSignals(sample);

    assert.equal(first.evidenceDigest, second.evidenceDigest);
    assert.deepEqual(first.findings.map((finding) => finding.id), second.findings.map((finding) => finding.id));
  });
});
