import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { analyzeLabInventorySync } from "../src/lab-inventory-sync.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sample = JSON.parse(readFileSync(join(root, "data", "sample-lab-input.json"), "utf8"));

describe("analyzeLabInventorySync", () => {
  it("detects critical integration, calibration, instrument, and reagent findings", () => {
    const report = analyzeLabInventorySync(sample);
    const kinds = new Set(report.findings.map((finding) => finding.kind));

    assert.equal(report.summary.criticalFindings, 4);
    assert.equal(kinds.has("integration_failed"), true);
    assert.equal(kinds.has("calibration_overdue"), true);
    assert.equal(kinds.has("instrument_offline"), true);
    assert.equal(kinds.has("reagent_expired"), true);
  });

  it("blocks exports for projects that depend on unavailable or expired lab assets", () => {
    const report = analyzeLabInventorySync(sample);
    const gates = new Map(report.exportGates.map((gate) => [gate.projectId, gate.decision]));

    assert.equal(gates.get("proj-organoid-map"), "block_export");
    assert.equal(gates.get("proj-neurochip"), "block_export");
    assert.equal(gates.get("proj-metabolomics"), "block_export");
  });

  it("generates webhook events and prioritized admin actions", () => {
    const report = analyzeLabInventorySync(sample);
    const eventTypes = new Set(report.webhookEvents.map((event) => event.type));

    assert.equal(eventTypes.has("lab_inventory.integration_failed"), true);
    assert.equal(eventTypes.has("lab_inventory.export_gate"), true);
    assert.equal(report.adminActions[0].severity, "critical");
    assert.match(report.adminActions[0].action, /page|reroute|lock|quarantine/);
  });

  it("is deterministic for audit evidence", () => {
    const first = analyzeLabInventorySync(sample);
    const second = analyzeLabInventorySync(sample);

    assert.equal(first.evidenceDigest, second.evidenceDigest);
    assert.deepEqual(first.findings.map((finding) => finding.id), second.findings.map((finding) => finding.id));
  });
});
