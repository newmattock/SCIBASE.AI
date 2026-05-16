import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyzeLabInventorySync } from "../src/lab-inventory-sync.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const input = JSON.parse(readFileSync(join(root, "data", "sample-lab-input.json"), "utf8"));
const report = analyzeLabInventorySync(input);

console.log(`${report.institution} lab inventory sync`);
console.log(`Evidence digest: ${report.evidenceDigest}`);
console.log(`Findings: ${report.summary.findings} (${report.summary.criticalFindings} critical, ${report.summary.highFindings} high)`);
console.log(`Export gates: ${report.summary.blockedExports} blocked, ${report.summary.reviewExports} review`);
console.log("Top admin actions:");
for (const action of report.adminActions.slice(0, 5)) {
  console.log(`- [${action.severity}] ${action.action}: ${action.subject}`);
}
