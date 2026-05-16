import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { evaluateIdentityRecoveryRisk } from "../src/identity-recovery-risk-guard.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sample = JSON.parse(readFileSync(join(root, "data", "sample-recovery-cases.json"), "utf8"));

describe("evaluateIdentityRecoveryRisk", () => {
  it("holds high-risk MFA recovery and revokes untrusted sessions", () => {
    const report = evaluateIdentityRecoveryRisk(sample);
    const ada = report.recoveryCases.find((item) => item.requestId === "rec-ada-mfa-reset");
    const decision = report.decisions.find((item) => item.requestId === "rec-ada-mfa-reset");
    const sessionActions = report.sessionActions.filter((item) => item.requestId === "rec-ada-mfa-reset");

    assert.equal(ada.severity, "critical");
    assert.equal(decision.recovery, "hold_for_security_review");
    assert.equal(decision.projectAccess, "freeze_elevated_roles_and_sensitive_objects");
    assert.equal(sessionActions.some((item) => item.sessionId === "sess-ada-known" && item.action === "revoke"), true);
    assert.equal(report.projectHolds.some((hold) => hold.projectId === "project-quasar" && hold.action === "freeze_role_changes"), true);
  });

  it("requires institution approval for a SAML rebind outside the trusted domain", () => {
    const report = evaluateIdentityRecoveryRisk(sample);
    const lina = report.recoveryCases.find((item) => item.requestId === "rec-lina-saml-rebind");
    const packet = report.recoveryPackets.find((item) => item.requestId === "rec-lina-saml-rebind");
    const findingCodes = report.findings.filter((item) => item.requestId === "rec-lina-saml-rebind").map((item) => item.code);

    assert.equal(lina.severity, "high");
    assert.equal(findingCodes.includes("saml_domain_mismatch"), true);
    assert.equal(packet.requiredReviewers.includes("institution_admin"), true);
    assert.equal(packet.missingEvidence.includes("institution_admin_approval"), true);
  });

  it("approves a low-risk password reset with monitoring", () => {
    const report = evaluateIdentityRecoveryRisk(sample);
    const omar = report.recoveryCases.find((item) => item.requestId === "rec-omar-password");
    const decision = report.decisions.find((item) => item.requestId === "rec-omar-password");

    assert.equal(omar.severity, "low");
    assert.equal(decision.recovery, "approve_with_monitoring");
    assert.equal(decision.projectAccess, "preserve_existing_access");
  });

  it("generates deterministic audit evidence", () => {
    const first = evaluateIdentityRecoveryRisk(sample);
    const second = evaluateIdentityRecoveryRisk(sample);

    assert.equal(first.evidenceDigest, second.evidenceDigest);
    assert.deepEqual(first.auditEvents.map((event) => event.eventId), second.auditEvents.map((event) => event.eventId));
  });
});
