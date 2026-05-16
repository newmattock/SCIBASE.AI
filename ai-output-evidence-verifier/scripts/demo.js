import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyAiOutputEvidence } from "../src/ai-output-evidence-verifier.js";

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = join(here, "..", "data", "sample-assistant-output.json");
const sample = JSON.parse(await readFile(samplePath, "utf8"));
const report = verifyAiOutputEvidence(sample);

console.log(`Project: ${report.project.title}`);
console.log(`Ready: ${report.ready ? "yes" : "no"}`);
console.log(`Recommendation: ${report.recommendation}`);
console.log(`Outputs: ${report.counts.outputs}`);
console.log(`Claims: ${report.counts.claims}`);
console.log(`Sources: ${report.counts.sources}`);
console.log(`Source coverage: ${report.sourceCoverage.knownCount}/${report.sourceCoverage.referencedCount} known`);
console.log(`Blockers: ${report.counts.blockers}`);
console.log(`Warnings: ${report.counts.warnings}`);
console.log(`Reviewer tasks: ${report.counts.reviewerTasks}`);
console.log(`Audit digest: ${report.auditDigest}`);

for (const task of report.reviewerTasks.slice(0, 5)) {
  console.log(`- [${task.severity}] ${task.target}: ${task.action}`);
}
