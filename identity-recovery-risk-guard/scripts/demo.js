import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateIdentityRecoveryRisk } from "../src/identity-recovery-risk-guard.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sample = JSON.parse(readFileSync(join(root, "data", "sample-recovery-cases.json"), "utf8"));
const report = evaluateIdentityRecoveryRisk(sample);

console.log(JSON.stringify({
  digest: report.evidenceDigest,
  summary: report.summary,
  blockedRecoveries: report.recoveryCases
    .filter((item) => item.severity === "critical" || item.severity === "high")
    .map((item) => ({
      requestId: item.requestId,
      user: item.userName,
      type: item.type,
      severity: item.severity,
      riskScore: item.riskScore,
      factors: item.factors
    })),
  decisions: report.decisions.map((decision) => ({
    requestId: decision.requestId,
    recovery: decision.recovery,
    projectAccess: decision.projectAccess,
    sessions: decision.sessions
  })),
  requiredReviewPackets: report.recoveryPackets.map((packet) => ({
    requestId: packet.requestId,
    reviewers: packet.requiredReviewers,
    missingEvidence: packet.missingEvidence
  }))
}, null, 2));
