import { createHash } from "node:crypto";

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function severityRank(severity) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity] ?? 4;
}

function normalizeDoi(doi) {
  return String(doi ?? "").trim().toLowerCase();
}

function byId(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

function sortFindings(findings) {
  return findings.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.id.localeCompare(b.id);
  });
}

function noticeDecision(type) {
  if (type === "retraction") return "suppress";
  if (type === "expression_of_concern") return "review";
  return "annotate";
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

function buildNoticeIndex(notices = []) {
  const index = new Map();
  for (const notice of notices) {
    const doi = normalizeDoi(notice.doi);
    if (!doi) continue;
    if (!index.has(doi)) index.set(doi, []);
    index.get(doi).push({
      ...notice,
      doi,
      decision: noticeDecision(notice.type)
    });
  }
  return index;
}

function impactedEntityFindings(entities, noticeIndex) {
  return entities.flatMap((entity) => {
    const notices = noticeIndex.get(normalizeDoi(entity.doi)) ?? [];
    return notices.map((notice) => buildFinding(
      "entity_publication_notice",
      notice.severity,
      entity.id,
      `${entity.label} is linked to a ${notice.type.replaceAll("_", " ")}`,
      {
        entityType: entity.type,
        doi: notice.doi,
        noticeType: notice.type,
        source: notice.source,
        reason: notice.reason,
        projectIds: entity.projectIds ?? []
      }
    ));
  });
}

function impactedRelationshipFindings(relationships, noticeIndex, entitiesById) {
  return relationships.flatMap((relationship) => {
    const notices = noticeIndex.get(normalizeDoi(relationship.evidenceDoi)) ?? [];
    return notices.map((notice) => {
      const source = entitiesById.get(relationship.sourceId);
      const target = entitiesById.get(relationship.targetId);

      return buildFinding(
        "relationship_evidence_notice",
        notice.severity,
        relationship.id,
        `${relationship.type} evidence has a ${notice.type.replaceAll("_", " ")}`,
        {
          evidenceDoi: notice.doi,
          noticeType: notice.type,
          decision: notice.decision,
          confidence: relationship.confidence,
          sourceId: relationship.sourceId,
          sourceLabel: source?.label,
          targetId: relationship.targetId,
          targetLabel: target?.label,
          recommendationId: relationship.recommendationId,
          reason: notice.reason
        }
      );
    });
  });
}

function recommendationDecisions(recommendations, relationshipsById, relationshipFindings) {
  const findingsByRelationship = new Map();
  for (const finding of relationshipFindings) {
    const relationshipId = finding.subject;
    if (!findingsByRelationship.has(relationshipId)) findingsByRelationship.set(relationshipId, []);
    findingsByRelationship.get(relationshipId).push(finding);
  }

  return recommendations.map((recommendation) => {
    const findings = (recommendation.relationshipIds ?? []).flatMap((relationshipId) =>
      findingsByRelationship.get(relationshipId) ?? []
    );
    const hasCritical = findings.some((finding) => finding.severity === "critical");
    const hasHigh = findings.some((finding) => finding.severity === "high");
    const decision = hasCritical ? "suppress" : hasHigh ? "review" : findings.length ? "annotate" : "allow";
    const evidenceEdges = (recommendation.relationshipIds ?? []).map((relationshipId) => relationshipsById.get(relationshipId)).filter(Boolean);

    return {
      recommendationId: recommendation.id,
      title: recommendation.title,
      audience: recommendation.audience,
      decision,
      findingIds: findings.map((finding) => finding.id).sort(),
      evidenceRelationshipIds: evidenceEdges.map((edge) => edge.id).sort()
    };
  });
}

function actionForFinding(finding) {
  const actionByKind = {
    entity_publication_notice: "annotate_entity_page",
    relationship_evidence_notice: finding.severity === "critical" ? "suppress_relationship_recommendations" : "queue_curator_review"
  };

  return {
    action: actionByKind[finding.kind] ?? "review",
    severity: finding.severity,
    subject: finding.subject,
    findingId: finding.id
  };
}

function buildJsonLd(input, findings, recommendationResults) {
  return {
    "@context": {
      scibase: "https://scibase.ai/kg#",
      schema: "https://schema.org/",
      id: "@id",
      type: "@type"
    },
    "@graph": [
      ...findings.map((finding) => ({
        id: `scibase:finding/${finding.id}`,
        type: "scibase:PublicationNoticeFinding",
        "schema:name": finding.message,
        "scibase:severity": finding.severity,
        "scibase:subject": finding.subject,
        "scibase:kind": finding.kind
      })),
      ...recommendationResults
        .filter((result) => result.decision !== "allow")
        .map((result) => ({
          id: `scibase:recommendation/${result.recommendationId}`,
          type: "scibase:RecommendationDecision",
          "schema:name": result.title,
          "scibase:decision": result.decision,
          "scibase:findingIds": result.findingIds
        }))
    ],
    generatedAt: input.generatedAt
  };
}

export function analyzeRetractionSignals(input) {
  const entities = input.entities ?? [];
  const relationships = input.relationships ?? [];
  const recommendations = input.recommendations ?? [];
  const noticeIndex = buildNoticeIndex(input.publicationNotices ?? []);
  const entitiesById = byId(entities);
  const relationshipsById = byId(relationships);
  const entityFindings = impactedEntityFindings(entities, noticeIndex);
  const relationshipFindings = impactedRelationshipFindings(relationships, noticeIndex, entitiesById);
  const findings = sortFindings([...entityFindings, ...relationshipFindings]);
  const recommendationResults = recommendationDecisions(recommendations, relationshipsById, relationshipFindings);
  const actions = findings.map(actionForFinding).sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.subject.localeCompare(b.subject);
  });
  const jsonLd = buildJsonLd(input, findings, recommendationResults);

  return {
    workspace: input.workspace,
    generatedAt: input.generatedAt,
    summary: {
      entities: entities.length,
      relationships: relationships.length,
      notices: input.publicationNotices?.length ?? 0,
      findings: findings.length,
      criticalFindings: findings.filter((finding) => finding.severity === "critical").length,
      highFindings: findings.filter((finding) => finding.severity === "high").length,
      suppressedRecommendations: recommendationResults.filter((result) => result.decision === "suppress").length,
      reviewRecommendations: recommendationResults.filter((result) => result.decision === "review").length
    },
    findings,
    recommendations: recommendationResults,
    curatorActions: actions,
    jsonLd,
    evidenceDigest: stableHash({ generatedAt: input.generatedAt, findings, recommendationResults, jsonLd })
  };
}
