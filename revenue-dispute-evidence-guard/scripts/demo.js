import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRevenueDisputes } from "../src/dispute-evidence-guard.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const input = JSON.parse(readFileSync(join(root, "data", "sample-revenue-input.json"), "utf8"));
const report = analyzeRevenueDisputes(input);

console.log(`${report.organization} dispute evidence guard`);
console.log(`Evidence digest: ${report.evidenceDigest}`);
console.log(`Revenue at risk: $${report.summary.revenueAtRiskUsd}`);
console.log(`Findings: ${report.summary.paymentsAtRisk} (${report.summary.criticalFindings} critical, ${report.summary.highFindings} high)`);
console.log(`Entitlements: ${report.summary.heldEntitlements} held, ${report.summary.limitedEntitlements} limited`);
console.log("Top finance actions:");
for (const action of report.financeActions.slice(0, 5)) {
  console.log(`- [${action.severity}] ${action.action}: ${action.paymentId} missing ${action.missingEvidence.join(", ") || "none"}`);
}
