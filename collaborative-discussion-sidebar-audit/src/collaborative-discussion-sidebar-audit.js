import { createHash } from "node:crypto";

const DEFAULT_POLICY = Object.freeze({
  reviewDate: "2026-05-16T17:00:00.000Z",
  staleThreadDays: 5,
  sourceStatusesAllowedForDecisions: ["active", "accepted", "draft"],
  requiredLockedSectionRoles: ["owner", "reviewer"],
  activeDecisionStatuses: ["accepted", "proposed"]
});

export function auditDiscussionSidebar(packet, policyOverrides = {}) {
  const policy = { ...DEFAULT_POLICY, ...policyOverrides };
  const findings = [];
  const reviewerTasks = [];
  const exportEntries = [];

  const participantsById = indexBy(packet.participants, "id");
  const sectionsById = indexBy(packet.sections, "id");
  const sectionsByPath = new Map(
    (packet.sections ?? [])
      .filter((section) => section.filePath)
      .map((section) => [section.filePath, section])
  );
  const sourcesById = indexBy(packet.sources, "id");
  const threadsById = indexBy(packet.threads, "id");

  for (const thread of packet.threads ?? []) {
    const scope = resolveScope(thread, sectionsById, sectionsByPath);
    const threadActors = collectThreadActors(thread, participantsById);
    const pinnedSources = resolveSources(thread.pinnedSourceIds, sourcesById);

    if (!scope.known) {
      addFinding(findings, "blocker", "unknown-scope", `Thread ${thread.id} is attached to an unknown ${thread.scopeType} scope.`, {
        threadId: thread.id,
        scopeId: thread.scopeId
      });
    }

    if (thread.blocking === true && thread.status !== "resolved") {
      addFinding(findings, "blocker", "open-blocker", `Thread ${thread.id} is marked blocking and is still ${thread.status}.`, {
        threadId: thread.id
      });
      reviewerTasks.push({
        id: `${thread.id}:resolve-blocker`,
        threadId: thread.id,
        ownerId: thread.ownerId ?? null,
        title: `Resolve blocker: ${thread.title}`,
        priority: "high"
      });
    }

    const staleDays = ageInDays(thread.updatedAt, policy.reviewDate);
    if (thread.status !== "resolved" && staleDays > policy.staleThreadDays) {
      const severity = thread.blocking ? "blocker" : "warning";
      addFinding(findings, severity, "stale-thread", `Thread ${thread.id} has been idle for ${staleDays} days.`, {
        threadId: thread.id,
        staleDays
      });
    }

    for (const missingSourceId of pinnedSources.missing) {
      addFinding(findings, "blocker", "missing-pinned-source", `Thread ${thread.id} pins missing source ${missingSourceId}.`, {
        threadId: thread.id,
        sourceId: missingSourceId
      });
    }

    for (const source of pinnedSources.known) {
      if (!policy.sourceStatusesAllowedForDecisions.includes(source.status)) {
        addFinding(findings, "blocker", "unsafe-pinned-source", `Thread ${thread.id} pins ${source.status} source ${source.id}.`, {
          threadId: thread.id,
          sourceId: source.id,
          sourceStatus: source.status
        });
      }
    }

    if (scope.section?.locked) {
      const actorRoles = new Set(threadActors.map((actor) => actor.role));
      const missingRoles = policy.requiredLockedSectionRoles.filter((role) => !actorRoles.has(role));
      if (missingRoles.length > 0) {
        addFinding(findings, "warning", "locked-section-missing-review-role", `Thread ${thread.id} on locked section ${scope.section.id} is missing ${missingRoles.join(", ")} participation.`, {
          threadId: thread.id,
          sectionId: scope.section.id,
          missingRoles
        });
      }
    }

    for (const [index, message] of (thread.messages ?? []).entries()) {
      if (!message.authorId || !participantsById.has(message.authorId)) {
        addFinding(findings, "warning", "message-missing-author", `Thread ${thread.id} message ${index + 1} has no known author.`, {
          threadId: thread.id,
          messageIndex: index
        });
      }
      if (!message.createdAt || Number.isNaN(Date.parse(message.createdAt))) {
        addFinding(findings, "warning", "message-missing-timestamp", `Thread ${thread.id} message ${index + 1} has no valid timestamp.`, {
          threadId: thread.id,
          messageIndex: index
        });
      }
    }

    exportEntries.push({
      threadId: thread.id,
      title: thread.title,
      scopeType: thread.scopeType,
      scopeId: thread.scopeId,
      sectionTitle: scope.section?.title ?? null,
      status: thread.status,
      blocking: thread.blocking === true,
      ownerId: thread.ownerId ?? null,
      participantIds: Array.from(new Set(threadActors.map((actor) => actor.id))).sort(),
      pinnedSourceIds: pinnedSources.known.map((source) => source.id).sort(),
      decisionIds: (packet.decisions ?? [])
        .filter((decision) => decision.threadId === thread.id)
        .map((decision) => decision.id)
        .sort()
    });
  }

  const activeDecisionGroups = new Map();
  for (const decision of packet.decisions ?? []) {
    if (!threadsById.has(decision.threadId)) {
      addFinding(findings, "blocker", "decision-missing-thread", `Decision ${decision.id} references missing thread ${decision.threadId}.`, {
        decisionId: decision.id,
        threadId: decision.threadId
      });
    }

    const sourceIds = decision.sourceIds ?? [];
    if (sourceIds.length === 0) {
      addFinding(findings, "warning", "decision-missing-source", `Decision ${decision.id} has no pinned source evidence.`, {
        decisionId: decision.id
      });
    }

    for (const sourceId of sourceIds) {
      const source = sourcesById.get(sourceId);
      if (!source) {
        addFinding(findings, "blocker", "decision-source-missing", `Decision ${decision.id} references missing source ${sourceId}.`, {
          decisionId: decision.id,
          sourceId
        });
      } else if (!policy.sourceStatusesAllowedForDecisions.includes(source.status)) {
        addFinding(findings, "blocker", "decision-source-unsafe", `Decision ${decision.id} references ${source.status} source ${source.id}.`, {
          decisionId: decision.id,
          sourceId: source.id,
          sourceStatus: source.status
        });
      }
    }

    if (policy.activeDecisionStatuses.includes(decision.status)) {
      const key = `${decision.scopeId}:${decision.topicKey}`;
      const group = activeDecisionGroups.get(key) ?? [];
      group.push(decision);
      activeDecisionGroups.set(key, group);
    }
  }

  for (const [key, decisions] of activeDecisionGroups) {
    const independentDecisions = decisions.filter((decision) => !decision.supersedes);
    if (independentDecisions.length > 1) {
      addFinding(findings, "blocker", "conflicting-decisions", `Multiple active decisions compete for ${key}.`, {
        decisionIds: independentDecisions.map((decision) => decision.id).sort()
      });
    }
  }

  const counts = {
    sections: (packet.sections ?? []).length,
    threads: (packet.threads ?? []).length,
    decisions: (packet.decisions ?? []).length,
    blockers: findings.filter((finding) => finding.severity === "blocker").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    reviewerTasks: reviewerTasks.length
  };

  const sidebarCoverage = summarizeCoverage(packet, exportEntries);
  const packetHash = digest({
    project: packet.project,
    exportEntries,
    findings,
    reviewerTasks,
    sidebarCoverage
  });

  return {
    ready: counts.blockers === 0,
    project: packet.project,
    counts,
    sidebarCoverage,
    findings,
    reviewerTasks,
    exportPacket: {
      generatedAt: policy.reviewDate,
      packetHash,
      auditDigest: `${packet.project?.id ?? "project"}:${counts.blockers}:${counts.warnings}:${reviewerTasks.length}:${packetHash.slice(0, 12)}`,
      entries: exportEntries.sort((left, right) => left.threadId.localeCompare(right.threadId))
    }
  };
}

function indexBy(items = [], field) {
  return new Map(items.map((item) => [item[field], item]));
}

function addFinding(findings, severity, code, message, context) {
  findings.push({ severity, code, message, context });
}

function resolveScope(thread, sectionsById, sectionsByPath) {
  if (thread.scopeType === "section") {
    const section = sectionsById.get(thread.scopeId);
    return { known: Boolean(section), section };
  }
  if (thread.scopeType === "file") {
    const section = sectionsByPath.get(thread.scopeId);
    return { known: Boolean(section), section };
  }
  return { known: false, section: null };
}

function collectThreadActors(thread, participantsById) {
  const ids = new Set([thread.ownerId, ...(thread.participantIds ?? [])].filter(Boolean));
  for (const message of thread.messages ?? []) {
    if (message.authorId) ids.add(message.authorId);
  }
  return Array.from(ids)
    .map((id) => participantsById.get(id))
    .filter(Boolean);
}

function resolveSources(sourceIds = [], sourcesById) {
  const known = [];
  const missing = [];
  for (const sourceId of sourceIds) {
    const source = sourcesById.get(sourceId);
    if (source) {
      known.push(source);
    } else {
      missing.push(sourceId);
    }
  }
  return { known, missing };
}

function ageInDays(updatedAt, reviewDate) {
  const updated = Date.parse(updatedAt);
  const reviewed = Date.parse(reviewDate);
  if (Number.isNaN(updated) || Number.isNaN(reviewed)) return 0;
  return Math.max(0, Math.floor((reviewed - updated) / 86_400_000));
}

function summarizeCoverage(packet, exportEntries) {
  const scopedSections = new Set(
    exportEntries
      .filter((entry) => entry.sectionTitle)
      .map((entry) => entry.sectionTitle)
  );
  const resolvedThreads = exportEntries.filter((entry) => entry.status === "resolved").length;
  const pinnedSourceIds = new Set(exportEntries.flatMap((entry) => entry.pinnedSourceIds));
  const unscopedThreads = exportEntries.filter((entry) => !entry.sectionTitle).length;

  return {
    scopedSections: scopedSections.size,
    totalSections: (packet.sections ?? []).length,
    resolvedThreads,
    totalThreads: exportEntries.length,
    pinnedSources: pinnedSourceIds.size,
    unscopedThreads
  };
}

function digest(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
