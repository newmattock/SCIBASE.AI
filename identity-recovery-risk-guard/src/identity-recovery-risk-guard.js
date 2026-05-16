import { createHash } from "node:crypto";

const HOUR_MS = 60 * 60 * 1000;
const SENSITIVE_LEVELS = new Set(["restricted", "regulated", "human-subjects"]);
const ELEVATED_ROLES = new Set(["owner", "admin"]);

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function asDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function hoursBetween(start, end) {
  return (asDate(end).getTime() - asDate(start).getTime()) / HOUR_MS;
}

function userById(input) {
  return new Map((input.users ?? []).map((user) => [user.id, user]));
}

function projectsForUser(input, userId) {
  return (input.projects ?? [])
    .map((project) => {
      const membership = (project.memberships ?? []).find((item) => item.userId === userId);
      const grants = (project.objectGrants ?? []).filter((grant) => grant.userId === userId);
      if (!membership && grants.length === 0) return null;
      return {
        projectId: project.id,
        title: project.title,
        visibility: project.visibility,
        sensitivity: project.sensitivity,
        role: membership?.role ?? "object-grantee",
        grants
      };
    })
    .filter(Boolean);
}

function sessionsForRequest(input, request) {
  return (input.sessions ?? []).filter((session) => session.userId === request.userId && !session.revokedAt);
}

function recentEventsForRequest(input, request) {
  const windowHours = input.policy?.recentWindowHours ?? 72;
  return (input.authEvents ?? []).filter((event) => {
    if (event.userId !== request.userId) return false;
    const delta = hoursBetween(event.at, request.requestedAt);
    return delta >= 0 && delta <= windowHours;
  });
}

function linkedIdentity(user, provider) {
  return (user.linkedIdentities ?? []).find((identity) => identity.provider === provider);
}

function domainOf(subject = "") {
  const match = subject.toLowerCase().match(/@([^@]+)$/);
  return match?.[1] ?? "";
}

function trustedDomain(input, domain) {
  return (input.policy?.trustedInstitutionDomains ?? []).includes(domain);
}

function severityFromPoints(points) {
  if (points >= 80) return "critical";
  if (points >= 55) return "high";
  if (points >= 30) return "medium";
  return "low";
}

function addFactor(factors, code, points, message, evidence = {}) {
  factors.push({ code, points, message, evidence });
}

function exposureSummary(input, request) {
  const projects = projectsForUser(input, request.userId);
  const elevatedProjects = projects.filter((project) => ELEVATED_ROLES.has(project.role));
  const sensitiveProjects = projects.filter((project) => SENSITIVE_LEVELS.has(project.sensitivity));
  const sensitiveGrants = projects.flatMap((project) =>
    project.grants
      .filter((grant) => SENSITIVE_LEVELS.has(grant.sensitivity) || grant.action === "download")
      .map((grant) => ({ ...grant, projectId: project.projectId, projectTitle: project.title }))
  );

  return {
    projects,
    elevatedProjects,
    sensitiveProjects,
    sensitiveGrants
  };
}

function analyzeRequest(input, request, user) {
  const sessions = sessionsForRequest(input, request);
  const recentEvents = recentEventsForRequest(input, request);
  const exposure = exposureSummary(input, request);
  const factors = [];
  const evidence = request.evidence ?? {};
  const source = request.source ?? {};
  const sourceMatchesTrustedSession = sessions.some(
    (session) => session.trustedDevice && session.deviceFingerprint === source.deviceFingerprint && session.ipCountry === source.ipCountry
  );
  const suspiciousSessions = sessions.filter(
    (session) => !session.trustedDevice || session.deviceFingerprint !== source.deviceFingerprint || session.ipCountry !== source.ipCountry
  );
  const failedLogins = recentEvents.filter((event) => event.type === "failed_login" && event.success === false);

  if (request.type === "mfa_reset" && user.mfa?.enrolled && !evidence.mfaBackupCode && !evidence.institutionalAdminApproved) {
    addFactor(factors, "mfa_reset_without_strong_factor", 32, "MFA reset is missing backup-code or institutional-admin evidence", {
      backupCode: Boolean(evidence.mfaBackupCode),
      institutionalAdminApproved: Boolean(evidence.institutionalAdminApproved)
    });
  }

  if ((request.type === "email_change" || request.type === "mfa_reset" || request.type === "password_reset") && !evidence.emailVerified) {
    addFactor(factors, "email_not_verified", 18, "Recovery request has not verified the primary email channel");
  }

  if (!sourceMatchesTrustedSession && !evidence.deviceTrusted) {
    addFactor(factors, "new_or_untrusted_device", 18, "Recovery request originated from a device that does not match a trusted session", {
      sourceDevice: source.deviceFingerprint,
      sourceCountry: source.ipCountry
    });
  }

  if (suspiciousSessions.length > 0) {
    addFactor(factors, "suspicious_active_sessions", 15, "Active sessions include a new device, lower assurance, or country mismatch", {
      sessionIds: suspiciousSessions.map((session) => session.id).sort()
    });
  }

  if (failedLogins.length >= 3) {
    addFactor(factors, "failed_login_cluster", 16, "Recent failed-login cluster happened before the recovery request", {
      count: failedLogins.length
    });
  }

  if (request.type === "oauth_relink" || request.type === "saml_rebind") {
    const existing = linkedIdentity(user, request.targetProvider);
    const targetChanged = existing && existing.subject !== request.targetSubject;
    if (targetChanged && !evidence.orcidReverified) {
      addFactor(factors, "linked_identity_subject_changed", 21, "Linked identity subject changed without independent identity re-verification", {
        provider: request.targetProvider,
        previousSubject: existing.subject,
        requestedSubject: request.targetSubject
      });
    }
  }

  if (request.type === "saml_rebind") {
    const targetDomain = domainOf(request.targetSubject);
    if (!trustedDomain(input, targetDomain) || targetDomain !== user.institutionDomain) {
      addFactor(factors, "saml_domain_mismatch", 30, "SAML rebind target is outside the user's trusted institution domain", {
        targetDomain,
        expectedDomain: user.institutionDomain
      });
    }
    if (!evidence.institutionalAdminApproved) {
      addFactor(factors, "missing_institution_admin_approval", 20, "SAML rebind requires institution-admin approval before access restoration");
    }
  }

  if (exposure.elevatedProjects.length > 0) {
    addFactor(factors, "elevated_project_role_exposure", 12, "User controls owner/admin roles that should be held during risky recovery", {
      projectIds: exposure.elevatedProjects.map((project) => project.projectId).sort()
    });
  }

  if (exposure.sensitiveProjects.length > 0 || exposure.sensitiveGrants.length > 0) {
    addFactor(factors, "sensitive_research_access_exposure", 14, "User has restricted project or object access that raises recovery assurance requirements", {
      projectIds: exposure.sensitiveProjects.map((project) => project.projectId).sort(),
      objectIds: exposure.sensitiveGrants.map((grant) => grant.objectId).sort()
    });
  }

  const riskScore = Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0));
  const severity = severityFromPoints(riskScore);

  return {
    request,
    user,
    sessions,
    recentEvents,
    exposure,
    factors,
    riskScore,
    severity
  };
}

function decisionForAnalysis(input, analysis) {
  const criticalThreshold = input.policy?.criticalRiskThreshold ?? 80;
  const highThreshold = input.policy?.highRiskThreshold ?? 55;
  const factorCodes = new Set(analysis.factors.map((factor) => factor.code));

  if (analysis.riskScore >= criticalThreshold || factorCodes.has("saml_domain_mismatch")) {
    return {
      recovery: "hold_for_security_review",
      projectAccess: "freeze_elevated_roles_and_sensitive_objects",
      sessions: "revoke_untrusted_sessions",
      payoutOrAttribution: "hold_profile_attribution_changes",
      reasons: analysis.factors.map((factor) => factor.code)
    };
  }

  if (analysis.riskScore >= highThreshold) {
    return {
      recovery: "require_institution_or_project_owner_approval",
      projectAccess: "temporary_read_only",
      sessions: "step_up_reauthentication",
      payoutOrAttribution: "manual_review_before_changes",
      reasons: analysis.factors.map((factor) => factor.code)
    };
  }

  return {
    recovery: "approve_with_monitoring",
    projectAccess: "preserve_existing_access",
    sessions: "keep_sessions_with_reauth_prompt",
    payoutOrAttribution: "no_hold",
    reasons: analysis.factors.map((factor) => factor.code)
  };
}

function projectHoldsForAnalysis(input, analysis) {
  const threshold = input.policy?.projectHoldRiskThreshold ?? 55;
  if (analysis.riskScore < threshold) return [];

  return analysis.exposure.projects.map((project) => ({
    holdId: stableHash({ requestId: analysis.request.id, projectId: project.projectId, role: project.role }),
    requestId: analysis.request.id,
    userId: analysis.user.id,
    projectId: project.projectId,
    projectTitle: project.title,
    role: project.role,
    action: ELEVATED_ROLES.has(project.role) ? "freeze_role_changes" : "restrict_sensitive_objects",
    heldObjectIds: project.grants
      .filter((grant) => SENSITIVE_LEVELS.has(grant.sensitivity) || grant.action === "download")
      .map((grant) => grant.objectId)
      .sort(),
    reason: "recovery_risk_before_access_restoration"
  }));
}

function sessionActionsForAnalysis(analysis) {
  return analysis.sessions.map((session) => {
    const source = analysis.request.source ?? {};
    const untrusted = !session.trustedDevice || session.deviceFingerprint !== source.deviceFingerprint || session.ipCountry !== source.ipCountry;
    return {
      actionId: stableHash({ requestId: analysis.request.id, sessionId: session.id }),
      requestId: analysis.request.id,
      sessionId: session.id,
      action: analysis.severity === "critical" && untrusted ? "revoke" : analysis.severity === "low" ? "monitor" : "require_step_up",
      reason: untrusted ? "session_does_not_match_recovery_source" : "session_matches_known_recovery_source"
    };
  });
}

function requiredReviewers(analysis) {
  const reviewers = new Set();
  const factorCodes = new Set(analysis.factors.map((factor) => factor.code));
  if (analysis.severity === "critical" || analysis.severity === "high") reviewers.add("security_reviewer");
  if (factorCodes.has("saml_domain_mismatch") || factorCodes.has("missing_institution_admin_approval")) reviewers.add("institution_admin");
  if (analysis.exposure.elevatedProjects.length > 0) reviewers.add("project_owner_delegate");
  if (analysis.exposure.sensitiveGrants.length > 0) reviewers.add("data_steward");
  return [...reviewers].sort();
}

function recoveryPacket(analysis, decision) {
  const missingEvidence = [];
  const evidence = analysis.request.evidence ?? {};

  if (!evidence.emailVerified) missingEvidence.push("verified_email_channel");
  if (analysis.request.type === "mfa_reset" && !evidence.mfaBackupCode) missingEvidence.push("mfa_backup_code_or_admin_override");
  if (analysis.request.type === "saml_rebind" && !evidence.institutionalAdminApproved) missingEvidence.push("institution_admin_approval");
  if ((analysis.request.type === "oauth_relink" || analysis.request.type === "saml_rebind") && !evidence.orcidReverified) {
    missingEvidence.push("independent_identity_reverification");
  }

  return {
    packetId: stableHash({ requestId: analysis.request.id, decision }),
    requestId: analysis.request.id,
    userId: analysis.user.id,
    userName: analysis.user.name,
    riskScore: analysis.riskScore,
    severity: analysis.severity,
    decision: decision.recovery,
    requiredReviewers: requiredReviewers(analysis),
    missingEvidence: [...new Set(missingEvidence)].sort(),
    safeNextSteps: decision.recovery === "approve_with_monitoring"
      ? ["notify_user", "record_audit_event", "prompt_session_reauthentication"]
      : ["freeze_sensitive_project_access", "collect_missing_evidence", "record_security_review"]
  };
}

function findingFromFactor(analysis, factor) {
  return {
    id: stableHash({ requestId: analysis.request.id, code: factor.code, evidence: factor.evidence }),
    requestId: analysis.request.id,
    userId: analysis.user.id,
    code: factor.code,
    severity: severityFromPoints(factor.points + Math.floor(analysis.riskScore / 4)),
    points: factor.points,
    message: factor.message,
    evidence: factor.evidence ?? {}
  };
}

function auditEvents(analyses, decisions, packets, projectHolds, sessionActions) {
  const events = [
    ...analyses.map((analysis) => ({
      type: "recovery_risk_scored",
      requestId: analysis.request.id,
      userId: analysis.user.id,
      riskScore: analysis.riskScore,
      severity: analysis.severity,
      digest: stableHash({ requestId: analysis.request.id, factors: analysis.factors })
    })),
    ...decisions.map((decision) => ({
      type: "recovery_decision_recorded",
      requestId: decision.requestId,
      recovery: decision.recovery,
      projectAccess: decision.projectAccess,
      digest: stableHash(decision)
    })),
    ...packets.map((packet) => ({
      type: "recovery_packet_created",
      requestId: packet.requestId,
      packetId: packet.packetId,
      reviewers: packet.requiredReviewers,
      digest: stableHash(packet)
    })),
    ...projectHolds.map((hold) => ({
      type: "project_access_hold_created",
      requestId: hold.requestId,
      projectId: hold.projectId,
      action: hold.action,
      digest: stableHash(hold)
    })),
    ...sessionActions
      .filter((action) => action.action === "revoke" || action.action === "require_step_up")
      .map((action) => ({
        type: "session_action_required",
        requestId: action.requestId,
        sessionId: action.sessionId,
        action: action.action,
        digest: stableHash(action)
      }))
  ];

  return events.map((event) => ({
    ...event,
    eventId: stableHash(event)
  }));
}

function severityRank(severity) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity] ?? 4;
}

export function evaluateIdentityRecoveryRisk(input, options = {}) {
  const generatedAt = options.generatedAt ?? input.generatedAt ?? new Date().toISOString();
  const users = userById(input);
  const analyses = (input.recoveryRequests ?? []).map((request) => {
    const user = users.get(request.userId);
    if (!user) throw new Error(`Unknown user for recovery request: ${request.userId}`);
    return analyzeRequest(input, request, user);
  });

  const decisions = analyses.map((analysis) => ({
    requestId: analysis.request.id,
    userId: analysis.user.id,
    ...decisionForAnalysis(input, analysis)
  }));
  const findings = analyses
    .flatMap((analysis) => analysis.factors.map((factor) => findingFromFactor(analysis, factor)))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.points - a.points || a.id.localeCompare(b.id));
  const projectHolds = analyses.flatMap((analysis) => projectHoldsForAnalysis(input, analysis));
  const sessionActions = analyses.flatMap((analysis) => sessionActionsForAnalysis(analysis));
  const packets = analyses.map((analysis) => recoveryPacket(
    analysis,
    decisions.find((decision) => decision.requestId === analysis.request.id)
  ));
  const events = auditEvents(analyses, decisions, packets, projectHolds, sessionActions);

  const report = {
    generatedAt,
    summary: {
      requestsReviewed: analyses.length,
      criticalRequests: analyses.filter((analysis) => analysis.severity === "critical").length,
      highRequests: analyses.filter((analysis) => analysis.severity === "high").length,
      projectHolds: projectHolds.length,
      sessionRevocations: sessionActions.filter((action) => action.action === "revoke").length,
      missingEvidenceItems: packets.reduce((sum, packet) => sum + packet.missingEvidence.length, 0)
    },
    recoveryCases: analyses.map((analysis) => ({
      requestId: analysis.request.id,
      userId: analysis.user.id,
      userName: analysis.user.name,
      type: analysis.request.type,
      riskScore: analysis.riskScore,
      severity: analysis.severity,
      factors: analysis.factors.map((factor) => factor.code),
      exposedProjectIds: analysis.exposure.projects.map((project) => project.projectId).sort()
    })),
    findings,
    decisions,
    projectHolds,
    sessionActions,
    recoveryPackets: packets,
    auditEvents: events
  };

  return {
    ...report,
    evidenceDigest: stableHash({
      generatedAt,
      summary: report.summary,
      recoveryCases: report.recoveryCases,
      decisions: report.decisions,
      projectHolds: report.projectHolds,
      sessionActions: report.sessionActions,
      auditEvents: report.auditEvents.map((event) => event.eventId)
    })
  };
}
