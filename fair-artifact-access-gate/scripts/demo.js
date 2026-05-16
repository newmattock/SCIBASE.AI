import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assessFairArtifactAccessGate } from "../src/fair-artifact-access-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = join(here, "..", "data", "sample-artifacts.json");
const sample = JSON.parse(await readFile(samplePath, "utf8"));
const report = assessFairArtifactAccessGate(sample);

console.log(`Project: ${sample.title}`);
console.log(`Ready: ${report.ready ? "yes" : "no"}`);
console.log(`Artifact families: ${report.catalog.families.join(", ")}`);
console.log(
  `FAIR: ${report.fairSignals.signals
    .map((signal) => `${signal.key}=${signal.ready ? "pass" : "fail"}`)
    .join(", ")}`
);
console.log(`Reviewer packet entries: ${report.reviewerPacket.entryCount}`);
console.log(`Reviewer packet hash: ${report.reviewerPacket.packetHash}`);
console.log(
  `Audit digest: standards=${report.reviewerPacket.auditDigest.standardsReady}, fair=${report.reviewerPacket.auditDigest.fairReady}, restricted=${report.reviewerPacket.auditDigest.restrictedArtifactCount}`
);
console.log(`Blockers: ${report.blockers.length === 0 ? "none" : report.blockers.join("; ")}`);
