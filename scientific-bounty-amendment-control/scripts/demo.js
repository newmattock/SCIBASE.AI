import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateChallengeAmendments } from "../src/challenge-amendment-control.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sample = JSON.parse(readFileSync(join(root, "data", "sample-amendments.json"), "utf8"));
const report = evaluateChallengeAmendments(sample);

console.log(JSON.stringify({
  challenge: report.challengeId,
  digest: report.evidenceDigest,
  summary: report.summary,
  criticalAmendments: report.findings
    .filter((finding) => finding.severity === "critical")
    .map((finding) => ({ amendmentId: finding.amendmentId, field: finding.details.field, direction: finding.details.direction })),
  holdDecisions: report.holdDecisions
}, null, 2));
