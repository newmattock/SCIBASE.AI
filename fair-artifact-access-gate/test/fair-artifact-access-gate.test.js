import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assessFairArtifactAccessGate } from "../src/fair-artifact-access-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = join(here, "..", "data", "sample-artifacts.json");
const sample = JSON.parse(await readFile(samplePath, "utf8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

{
  const report = assessFairArtifactAccessGate(sample);
  assert.equal(report.ready, true);
  assert.equal(report.blockers.length, 0);
  assert.deepEqual(report.catalog.families, [
    "code",
    "dataset",
    "figure",
    "model",
    "notebook",
    "raw-instrument-output"
  ]);
  assert.equal(report.standardsIndex.allReady, true);
  assert.equal(report.fairSignals.allReady, true);
  assert.equal(report.reviewerPacket.entryCount, sample.artifacts.length + 4);
  assert.equal(report.reviewerPacket.auditDigest.packetHash, report.reviewerPacket.packetHash);
}

{
  const project = clone(sample);
  delete project.metadata.dataCite.publisher;
  const report = assessFairArtifactAccessGate(project);
  assert.equal(report.ready, false);
  assert.ok(report.blockers.includes("metadata standard not ready: dataCite"));
  assert.ok(report.blockers.includes("FAIR signal failed: findable"));
}

{
  const project = clone(sample);
  const rawArtifact = project.artifacts.find(
    (artifact) => artifact.family === "raw-instrument-output"
  );
  rawArtifact.reviewerAccess = false;
  delete rawArtifact.restrictionReason;
  const report = assessFairArtifactAccessGate(project);
  assert.equal(report.ready, false);
  assert.ok(
    report.blockers.includes(
      "restricted artifact lacks reviewer access: raw/instrument/session-0423.tiff"
    )
  );
  assert.ok(
    report.blockers.includes(
      "restricted artifact lacks restriction reason: raw/instrument/session-0423.tiff"
    )
  );
  assert.ok(report.blockers.includes("FAIR signal failed: accessible"));
}

{
  const project = clone(sample);
  delete project.tags.variables;
  const report = assessFairArtifactAccessGate(project);
  assert.equal(report.ready, false);
  assert.ok(report.blockers.includes("missing scientific tag group: variables"));
  assert.ok(report.blockers.includes("FAIR signal failed: reusable"));
}
