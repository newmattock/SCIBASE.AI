import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { analyzeRevenueDisputes } from "../src/dispute-evidence-guard.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sample = JSON.parse(readFileSync(join(root, "data", "sample-revenue-input.json"), "utf8"));

describe("analyzeRevenueDisputes", () => {
  it("detects disputed, short-paid, and failed payments", () => {
    const report = analyzeRevenueDisputes(sample);
    const kinds = new Set(report.findings.map((finding) => finding.kind));

    assert.equal(report.summary.paymentsAtRisk, 3);
    assert.equal(report.summary.revenueAtRiskUsd, 17400);
    assert.equal(kinds.has("payment_disputed"), true);
    assert.equal(kinds.has("invoice_short_paid"), true);
    assert.equal(kinds.has("payment_failed"), true);
  });

  it("holds or limits entitlements while revenue evidence is incomplete", () => {
    const report = analyzeRevenueDisputes(sample);
    const decisions = new Map(report.entitlementDecisions.map((entitlement) => [entitlement.entitlementId, entitlement.decision]));

    assert.equal(decisions.get("ent-lab-a-compute"), "hold_access");
    assert.equal(decisions.get("ent-institute-b-license"), "limit_until_resolved");
    assert.equal(decisions.get("ent-analyst-c-api"), "limit_until_resolved");
  });

  it("builds evidence packets with missing evidence lists", () => {
    const report = analyzeRevenueDisputes(sample);
    const stripePacket = report.evidencePackets.find((packet) => packet.paymentId === "pay-778");
    const invoicePacket = report.evidencePackets.find((packet) => packet.paymentId === "pay-812");

    assert.deepEqual(stripePacket.missingEvidence, ["service_acceptance"]);
    assert.deepEqual(invoicePacket.missingEvidence, ["invoice_pdf", "purchase_order"]);
    assert.equal(report.summary.readyEvidencePackets, 0);
  });

  it("is deterministic for audit evidence", () => {
    const first = analyzeRevenueDisputes(sample);
    const second = analyzeRevenueDisputes(sample);

    assert.equal(first.evidenceDigest, second.evidenceDigest);
    assert.deepEqual(first.findings.map((finding) => finding.id), second.findings.map((finding) => finding.id));
  });
});
