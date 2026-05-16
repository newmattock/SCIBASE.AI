import { createHash } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;

const MATERIAL_FIELDS = new Set([
  "submissionDueAt",
  "reviewStartsAt",
  "prizePoolUsd",
  "ipPolicy",
  "visibility",
  "requiredDeliverables",
  "rubric",
  "ndaRequired",
  "prequalificationRules"
]);

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function asDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function daysBetween(start, end) {
  return Math.ceil((asDate(end).getTime() - asDate(start).getTime()) / DAY_MS);
}

function startedTeams(input) {
  return (input.teams ?? []).filter((team) => team.submissionStartedAt);
}

function activeTeams(input) {
  return (input.teams ?? []).filter((team) => team.registeredAt);
}

function reviewersAssigned(input) {
  return (input.reviewers ?? []).some((reviewer) => reviewer.assignedAt);
}

function valueChanged(amendment) {
  return JSON.stringify(amendment.before) !== JSON.stringify(amendment.after);
}

function rubricDelta(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  let largestShift = 0;
  const shifts = [];
  for (const key of keys) {
    const from = before[key] ?? 0;
    const to = after[key] ?? 0;
    const delta = to - from;
    if (delta !== 0) shifts.push({ criterion: key, before: from, after: to, delta });
    largestShift = Math.max(largestShift, Math.abs(delta));
  }
  return { largestShift, shifts: shifts.sort((a, b) => b.delta - a.delta || a.criterion.localeCompare(b.criterion)) };
}

function missingNotifications(amendment, teams) {
  const notified = new Set(amendment.notifiedTeamIds ?? []);
  return teams.filter((team) => !notified.has(team.id)).map((team) => team.id).sort();
}

function missingAcknowledgements(amendment, teams) {
  const acknowledged = new Set(amendment.acknowledgedTeamIds ?? []);
  return teams.filter((team) => !acknowledged.has(team.id)).map((team) => team.id).sort();
}

function amendmentDirection(amendment) {
  if (amendment.field === "submissionDueAt" || amendment.field === "reviewStartsAt") {
    const shiftDays = daysBetween(amendment.before, amendment.after);
    return shiftDays < 0 ? "shortens_window" : shiftDays > 0 ? "extends_window" : "unchanged";
  }

  if (amendment.field === "prizePoolUsd") {
    const deltaUsd = Number(amendment.after) - Number(amendment.before);
    return deltaUsd < 0 ? "decreases_prize" : deltaUsd > 0 ? "increases_prize" : "unchanged";
  }

  if (amendment.field === "ipPolicy" || amendment.field === "ndaRequired" || amendment.field === "visibility") {
    return "changes_participation_terms";
  }

  if (amendment.field === "requiredDeliverables") return "changes_deliverables";
  if (amendment.field === "rubric") return "changes_rubric";
  if (amendment.field === "prequalificationRules") return "changes_eligibility";
  return "changes_terms";
}

function classifySeverity({ amendment, direction, startedCount, missingNotice, missingAck, effectiveNoticeDays, reviewerAssigned }) {
  if (!valueChanged(amendment)) return "low";

  const afterWorkStarted = startedCount > 0;
  const missingAnyNotice = missingNotice.length > 0;
  const missingAnyAck = missingAck.length > 0;
  const shortNotice = effectiveNoticeDays < 3;

  if (direction === "changes_participation_terms" && afterWorkStarted) return "critical";
  if (direction === "shortens_window" && afterWorkStarted && (shortNotice || missingAnyNotice)) return "critical";
  if (direction === "decreases_prize" && afterWorkStarted) return "critical";
  if ((direction === "changes_rubric" || direction === "changes_deliverables") && afterWorkStarted && reviewerAssigned) return "high";
  if ((direction === "changes_rubric" || direction === "changes_deliverables") && (missingAnyNotice || missingAnyAck)) return "high";
  if (MATERIAL_FIELDS.has(amendment.field) && (missingAnyNotice || missingAnyAck)) return "medium";
  return "low";
}

function buildFinding(input, amendment) {
  const started = startedTeams(input);
  const active = activeTeams(input);
  const affectedTeams = amendment.field === "prequalificationRules" ? active : started.length > 0 ? started : active;
  const missingNotice = missingNotifications(amendment, affectedTeams);
  const missingAck = missingAcknowledgements(amendment, affectedTeams);
  const direction = amendmentDirection(amendment);
  const effectiveNoticeDays = daysBetween(amendment.requestedAt, amendment.effectiveAt);
  const reviewerAssigned = reviewersAssigned(input);
  const severity = classifySeverity({
    amendment,
    direction,
    startedCount: started.length,
    missingNotice,
    missingAck,
    effectiveNoticeDays,
    reviewerAssigned
  });

  const details = {
    field: amendment.field,
    direction,
    affectedTeamIds: affectedTeams.map((team) => team.id).sort(),
    missingNoticeTeamIds: missingNotice,
    missingAcknowledgementTeamIds: missingAck,
    effectiveNoticeDays,
    reviewersAssigned: reviewerAssigned
  };

  if (amendment.field === "rubric") details.rubricDelta = rubricDelta(amendment.before, amendment.after);
  if (amendment.field === "prizePoolUsd") details.prizeDeltaUsd = Number(amendment.after) - Number(amendment.before);
  if (amendment.field === "submissionDueAt" || amendment.field === "reviewStartsAt") {
    details.scheduleDeltaDays = daysBetween(amendment.before, amendment.after);
  }

  return {
    id: stableHash({ amendmentId: amendment.id, details }),
    amendmentId: amendment.id,
    severity,
    material: MATERIAL_FIELDS.has(amendment.field),
    message: `${amendment.field} ${direction.replaceAll("_", " ")}`,
    details
  };
}

function severityRank(severity) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity] ?? 4;
}

function buildNotifications(input, findings) {
  const teamById = new Map((input.teams ?? []).map((team) => [team.id, team]));

  return findings.flatMap((finding) => {
    const amendment = input.amendments.find((item) => item.id === finding.amendmentId);
    const notified = new Set(amendment.notifiedTeamIds ?? []);
    const acknowledged = new Set(amendment.acknowledgedTeamIds ?? []);

    return finding.details.affectedTeamIds.map((teamId) => ({
      notificationId: stableHash({ amendmentId: finding.amendmentId, teamId }),
      amendmentId: finding.amendmentId,
      teamId,
      teamName: teamById.get(teamId)?.name ?? teamId,
      required: finding.material,
      sent: notified.has(teamId),
      acknowledged: acknowledged.has(teamId),
      priority: finding.severity === "critical" ? "urgent" : finding.severity === "high" ? "high" : "normal",
      summary: `${amendment.field} update requires ${acknowledged.has(teamId) ? "no further acknowledgement" : "team acknowledgement"}`
    }));
  }).sort((a, b) => a.amendmentId.localeCompare(b.amendmentId) || a.teamId.localeCompare(b.teamId));
}

function holdDecisions(findings) {
  const hasCritical = findings.some((finding) => finding.severity === "critical");
  const hasHigh = findings.some((finding) => finding.severity === "high");
  const missingNotice = findings.flatMap((finding) => finding.details.missingNoticeTeamIds);
  const missingAck = findings.flatMap((finding) => finding.details.missingAcknowledgementTeamIds);

  return {
    evaluation: hasCritical || missingNotice.length > 0 ? "hold" : hasHigh ? "review_before_start" : "release",
    reviewerAssignments: hasCritical || hasHigh ? "freeze_new_assignments" : "release",
    payoutReadiness: hasCritical || missingAck.length > 0 ? "hold_until_acknowledged" : "release",
    reasons: [
      ...(hasCritical ? ["critical_material_amendment"] : []),
      ...(hasHigh ? ["high_risk_material_amendment"] : []),
      ...(missingNotice.length > 0 ? ["solver_notice_incomplete"] : []),
      ...(missingAck.length > 0 ? ["solver_acknowledgement_incomplete"] : [])
    ]
  };
}

function auditEvents(input, findings, notifications, holds) {
  const events = [
    ...findings.map((finding) => ({
      type: "amendment_risk_classified",
      amendmentId: finding.amendmentId,
      severity: finding.severity,
      material: finding.material,
      digest: stableHash(finding)
    })),
    ...notifications
      .filter((notification) => notification.required && (!notification.sent || !notification.acknowledged))
      .map((notification) => ({
        type: "solver_notice_required",
        amendmentId: notification.amendmentId,
        teamId: notification.teamId,
        sent: notification.sent,
        acknowledged: notification.acknowledged,
        digest: stableHash(notification)
      })),
    {
      type: "hold_decision_recorded",
      challengeId: input.challenge.id,
      evaluation: holds.evaluation,
      payoutReadiness: holds.payoutReadiness,
      digest: stableHash(holds)
    }
  ];

  return events.map((event) => ({
    ...event,
    eventId: stableHash(event)
  }));
}

export function evaluateChallengeAmendments(input, options = {}) {
  const generatedAt = options.generatedAt ?? input.generatedAt ?? new Date().toISOString();
  const findings = (input.amendments ?? [])
    .filter((amendment) => valueChanged(amendment))
    .map((amendment) => buildFinding(input, amendment))
    .sort((a, b) => {
      const bySeverity = severityRank(a.severity) - severityRank(b.severity);
      if (bySeverity !== 0) return bySeverity;
      return a.amendmentId.localeCompare(b.amendmentId);
    });
  const notifications = buildNotifications(input, findings);
  const holds = holdDecisions(findings);
  const events = auditEvents(input, findings, notifications, holds);

  return {
    challengeId: input.challenge.id,
    challengeTitle: input.challenge.title,
    generatedAt,
    summary: {
      amendmentsReviewed: input.amendments?.length ?? 0,
      materialAmendments: findings.filter((finding) => finding.material).length,
      criticalFindings: findings.filter((finding) => finding.severity === "critical").length,
      highFindings: findings.filter((finding) => finding.severity === "high").length,
      teamsAffected: new Set(findings.flatMap((finding) => finding.details.affectedTeamIds)).size,
      missingNotifications: notifications.filter((notification) => notification.required && !notification.sent).length,
      missingAcknowledgements: notifications.filter((notification) => notification.required && !notification.acknowledged).length,
      evaluationDecision: holds.evaluation,
      payoutDecision: holds.payoutReadiness
    },
    findings,
    solverNotifications: notifications,
    holdDecisions: holds,
    auditEvents: events,
    evidenceDigest: stableHash({ generatedAt, findings, notifications, holds, events })
  };
}
