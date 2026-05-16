import { createHash } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;

function asDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

function daysBetween(later, earlier) {
  return Math.ceil((asDate(later).getTime() - asDate(earlier).getTime()) / DAY_MS);
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function severityRank(severity) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity] ?? 4;
}

function sortFindings(findings) {
  return findings.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.id.localeCompare(b.id);
  });
}

function reservationConflicts(instrument) {
  const reservations = [...(instrument.reservations ?? [])].sort((a, b) =>
    asDate(a.startsAt).getTime() - asDate(b.startsAt).getTime()
  );
  const conflicts = [];

  for (let i = 1; i < reservations.length; i += 1) {
    const previous = reservations[i - 1];
    const current = reservations[i];
    if (asDate(current.startsAt) < asDate(previous.endsAt)) {
      conflicts.push({
        instrumentId: instrument.id,
        projectIds: [previous.projectId, current.projectId].sort(),
        window: `${current.startsAt} overlaps ${previous.endsAt}`
      });
    }
  }

  return conflicts;
}

function buildFinding(kind, severity, subject, message, details = {}) {
  return {
    id: stableHash({ kind, subject, message, details }),
    kind,
    severity,
    subject,
    message,
    details
  };
}

function projectMap(projects) {
  return new Map((projects ?? []).map((project) => [project.id, project]));
}

function affectedProjectsForAsset(assetId, projects, field) {
  return (projects ?? [])
    .filter((project) => (project[field] ?? []).includes(assetId))
    .map((project) => project.id)
    .sort();
}

function findIntegrationFindings(input, now) {
  return (input.integrations ?? []).flatMap((integration) => {
    const lagHours = Math.round((asDate(now).getTime() - asDate(integration.lastSyncAt).getTime()) / (60 * 60 * 1000));
    const findings = [];

    if (integration.status === "failed") {
      findings.push(buildFinding(
        "integration_failed",
        "critical",
        integration.system,
        `${integration.system} has a failed sync state`,
        { kind: integration.kind, lagHours, queueDepth: integration.queueDepth }
      ));
    } else if (integration.status === "degraded" || lagHours >= 24 || integration.queueDepth >= 50) {
      findings.push(buildFinding(
        "integration_degraded",
        "high",
        integration.system,
        `${integration.system} needs operations review before export evidence is trusted`,
        { kind: integration.kind, lagHours, queueDepth: integration.queueDepth }
      ));
    }

    return findings;
  });
}

function findInstrumentFindings(input, now) {
  return (input.instruments ?? []).flatMap((instrument) => {
    const findings = [];
    const calibrationDays = daysBetween(instrument.calibrationDue, now);
    const maintenanceDays = daysBetween(instrument.maintenanceDue, now);
    const affectedProjects = affectedProjectsForAsset(instrument.id, input.projects, "requiredInstrumentIds");

    if (instrument.status !== "online") {
      findings.push(buildFinding(
        "instrument_offline",
        "critical",
        instrument.id,
        `${instrument.name} is ${instrument.status}`,
        { labId: instrument.labId, affectedProjects }
      ));
    }

    if (calibrationDays < 0) {
      findings.push(buildFinding(
        "calibration_overdue",
        "critical",
        instrument.id,
        `${instrument.name} calibration is overdue`,
        { overdueDays: Math.abs(calibrationDays), affectedProjects }
      ));
    } else if (calibrationDays <= 14) {
      findings.push(buildFinding(
        "calibration_due_soon",
        "medium",
        instrument.id,
        `${instrument.name} calibration is due within ${calibrationDays} days`,
        { dueInDays: calibrationDays, affectedProjects }
      ));
    }

    if (maintenanceDays <= 7) {
      findings.push(buildFinding(
        "maintenance_due",
        maintenanceDays < 0 ? "high" : "medium",
        instrument.id,
        `${instrument.name} maintenance requires scheduling`,
        { dueInDays: maintenanceDays, affectedProjects }
      ));
    }

    if (!instrument.linkedEln) {
      findings.push(buildFinding(
        "eln_link_missing",
        "medium",
        instrument.id,
        `${instrument.name} is not linked to the ELN evidence trail`,
        { affectedProjects }
      ));
    }

    for (const conflict of reservationConflicts(instrument)) {
      findings.push(buildFinding(
        "reservation_conflict",
        "high",
        instrument.id,
        `${instrument.name} has overlapping reservations`,
        conflict
      ));
    }

    return findings;
  });
}

function findReagentFindings(input, now) {
  return (input.reagents ?? []).flatMap((reagent) => {
    const daysToExpiry = daysBetween(reagent.expiresAt, now);
    const affectedProjects = affectedProjectsForAsset(reagent.id, input.projects, "requiredReagentIds");

    if (daysToExpiry < 0) {
      return [buildFinding(
        "reagent_expired",
        "critical",
        reagent.id,
        `${reagent.name} lot ${reagent.lot} is expired`,
        { expiredDays: Math.abs(daysToExpiry), quantity: reagent.quantity, unit: reagent.unit, affectedProjects }
      )];
    }

    if (daysToExpiry <= 14) {
      return [buildFinding(
        "reagent_expiring",
        "medium",
        reagent.id,
        `${reagent.name} lot ${reagent.lot} expires soon`,
        { expiresInDays: daysToExpiry, quantity: reagent.quantity, unit: reagent.unit, affectedProjects }
      )];
    }

    return [];
  });
}

function projectExportGates(input, findings) {
  const projects = projectMap(input.projects);
  const projectFindings = new Map();

  for (const finding of findings) {
    const affected = finding.details.affectedProjects ?? finding.details.projectIds ?? [];
    for (const projectId of affected) {
      if (!projectFindings.has(projectId)) projectFindings.set(projectId, []);
      projectFindings.get(projectId).push(finding);
    }
  }

  return [...projects.values()].map((project) => {
    const findingsForProject = projectFindings.get(project.id) ?? [];
    const hasCritical = findingsForProject.some((finding) => finding.severity === "critical");
    const hasHigh = findingsForProject.some((finding) => finding.severity === "high");
    const decision = hasCritical ? "block_export" : hasHigh ? "review_before_export" : "ready";

    return {
      projectId: project.id,
      title: project.title,
      owner: project.owner,
      exportDue: project.exportDue,
      decision,
      findingIds: findingsForProject.map((finding) => finding.id).sort()
    };
  });
}

function actionForFinding(finding) {
  const actionByKind = {
    integration_failed: "page_integration_owner",
    integration_degraded: "review_sync_backlog",
    instrument_offline: "reroute_or_pause_reservations",
    calibration_overdue: "lock_instrument_until_calibrated",
    calibration_due_soon: "schedule_calibration_window",
    maintenance_due: "schedule_maintenance_window",
    eln_link_missing: "link_instrument_to_eln",
    reservation_conflict: "resolve_reservation_conflict",
    reagent_expired: "quarantine_lot_and_block_exports",
    reagent_expiring: "reorder_or_validate_lot"
  };

  return {
    action: actionByKind[finding.kind] ?? "review",
    severity: finding.severity,
    subject: finding.subject,
    findingId: finding.id
  };
}

function webhookEvents(input, findings, exportGates) {
  return [
    ...findings.map((finding) => ({
      type: `lab_inventory.${finding.kind}`,
      subject: finding.subject,
      severity: finding.severity,
      findingId: finding.id,
      digest: stableHash({ institution: input.institution, finding })
    })),
    ...exportGates
      .filter((gate) => gate.decision !== "ready")
      .map((gate) => ({
        type: "lab_inventory.export_gate",
        subject: gate.projectId,
        severity: gate.decision === "block_export" ? "critical" : "high",
        findingIds: gate.findingIds,
        digest: stableHash({ institution: input.institution, gate })
      }))
  ];
}

export function analyzeLabInventorySync(input, options = {}) {
  const now = options.now ?? input.generatedAt ?? new Date().toISOString();
  const findings = sortFindings([
    ...findIntegrationFindings(input, now),
    ...findInstrumentFindings(input, now),
    ...findReagentFindings(input, now)
  ]);
  const exportGates = projectExportGates(input, findings);
  const actions = findings.map(actionForFinding).sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.subject.localeCompare(b.subject);
  });
  const events = webhookEvents(input, findings, exportGates);
  const blockedExports = exportGates.filter((gate) => gate.decision === "block_export").length;
  const reviewExports = exportGates.filter((gate) => gate.decision === "review_before_export").length;

  return {
    institution: input.institution,
    generatedAt: now,
    summary: {
      labs: input.labs?.length ?? 0,
      instruments: input.instruments?.length ?? 0,
      reagents: input.reagents?.length ?? 0,
      integrations: input.integrations?.length ?? 0,
      findings: findings.length,
      criticalFindings: findings.filter((finding) => finding.severity === "critical").length,
      highFindings: findings.filter((finding) => finding.severity === "high").length,
      blockedExports,
      reviewExports
    },
    findings,
    exportGates,
    adminActions: actions,
    webhookEvents: events,
    evidenceDigest: stableHash({ now, findings, exportGates })
  };
}
