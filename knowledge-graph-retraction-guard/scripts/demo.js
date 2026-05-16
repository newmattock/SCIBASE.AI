import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRetractionSignals } from "../src/retraction-signal-guard.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const input = JSON.parse(readFileSync(join(root, "data", "sample-knowledge-graph.json"), "utf8"));
const report = analyzeRetractionSignals(input);

console.log(`${report.workspace} retraction guard`);
console.log(`Evidence digest: ${report.evidenceDigest}`);
console.log(`Findings: ${report.summary.findings} (${report.summary.criticalFindings} critical, ${report.summary.highFindings} high)`);
console.log(`Recommendations: ${report.summary.suppressedRecommendations} suppressed, ${report.summary.reviewRecommendations} review`);
console.log("Top curator actions:");
for (const action of report.curatorActions.slice(0, 5)) {
  console.log(`- [${action.severity}] ${action.action}: ${action.subject}`);
}
