import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeReputationTransparencyReceipts } from "../src/reputation-transparency-receipts.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const input = JSON.parse(readFileSync(join(root, "data", "sample-community-input.json"), "utf8"));
const report = analyzeReputationTransparencyReceipts(input);

console.log(`${report.community} reputation transparency receipts`);
console.log(`Evidence digest: ${report.evidenceDigest}`);
console.log(`Review receipts: ${report.summary.reviewReceipts}`);
console.log(`Contribution receipts: ${report.summary.contributionReceipts}`);
console.log(`Moderation findings: ${report.summary.findings}`);
console.log("Global leaderboard:");
for (const entry of report.leaderboards.global) {
  console.log(`- ${entry.handle}: ${entry.score} (${entry.tier})`);
}
