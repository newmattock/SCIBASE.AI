import { createHash } from "node:crypto";

const CURRENT_YEAR = 2026;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function setOverlap(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestFor(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

function finding(severity, code, claim, message, sourceIds = [], task = undefined) {
  return {
    severity,
    code,
    claimId: claim?.id ?? "project",
    section: claim?.section ?? "project",
    sourceIds: unique(sourceIds),
    message,
    task
  };
}

function sourceLabel(source) {
  return source ? `${source.id} (${source.year ?? "n.d."})` : "unknown source";
}

function buildCitationMatrix(claims, sourceById) {
  return claims.map((claim) => {
    const sources = asArray(claim.citedSourceIds).map((sourceId) => sourceById.get(sourceId)).filter(Boolean);
    return {
      claimId: claim.id,
      section: claim.section,
      citedSources: sources.map((source) => ({
        id: source.id,
        stance: source.stance ?? "unknown",
        intent: source.citationIntent ?? "unspecified",
        effectDirection: source.effectDirection ?? "unknown",
        methodOverlap: setOverlap(asArray(claim.methodTags), asArray(source.methodTags)),
        populationOverlap: setOverlap(asArray(claim.populations), asArray(source.populations)),
        reproducibilityEvidence: {
          rawData: Boolean(source.hasRawData),
          code: Boolean(source.hasCode),
          protocol: Boolean(source.hasProtocol)
        }
      }))
    };
  });
}

function scoreReproducibility(claims, sourceById) {
  const scoredClaims = claims.map((claim) => {
    const citedSources = asArray(claim.citedSourceIds).map((sourceId) => sourceById.get(sourceId)).filter(Boolean);
    const evidencePoints = citedSources.reduce((points, source) => {
      return points + Number(Boolean(source.hasRawData)) + Number(Boolean(source.hasCode)) + Number(Boolean(source.hasProtocol));
    }, 0);
    const maxPoints = Math.max(citedSources.length * 3, 1);
    return {
      claimId: claim.id,
      score: Math.round((evidencePoints / maxPoints) * 100),
      required: Boolean(claim.requiresReproducibilityEvidence)
    };
  });

  const requiredClaims = scoredClaims.filter((claim) => claim.required);
  const targetClaims = requiredClaims.length > 0 ? requiredClaims : scoredClaims;
  const score = Math.round(
    targetClaims.reduce((sum, claim) => sum + claim.score, 0) / Math.max(targetClaims.length, 1)
  );

  return {
    score,
    claims: scoredClaims,
    confidence: score >= 85 ? "high" : score >= 60 ? "medium" : "low"
  };
}

function buildOpportunityFeed(packet, findings) {
  const blockerClaimIds = new Set(
    findings.filter((item) => item.severity === "blocker").map((item) => item.claimId)
  );
  const labCapabilities = asArray(packet.lab?.capabilities);
  const labInterests = asArray(packet.lab?.interests);

  return asArray(packet.corpusGaps).map((gap) => {
    const capabilityOverlap = setOverlap(asArray(gap.requiredCapabilities), labCapabilities);
    const interestOverlap = setOverlap(asArray(gap.topicTags), labInterests);
    const linkedBlockers = asArray(gap.linkedClaimIds).filter((claimId) => blockerClaimIds.has(claimId));
    const priority =
      capabilityOverlap.length * 3 +
      interestOverlap.length * 2 +
      linkedBlockers.length * 3 +
      asArray(gap.contradictionSignals).length;

    return {
      id: gap.id,
      title: gap.title,
      priority,
      capabilityOverlap,
      interestOverlap,
      linkedBlockers,
      nextAction: gap.nextAction
    };
  }).sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

function reviewCommentFor(item) {
  const prefix = item.severity === "blocker" ? "Resolve before release" : "Review before submission";
  return {
    claimId: item.claimId,
    section: item.section,
    severity: item.severity,
    body: `${prefix}: ${item.message}`
  };
}

function revisionTaskFor(item) {
  return {
    claimId: item.claimId,
    code: item.code,
    ownerHint: item.severity === "blocker" ? "author" : "reviewer",
    task: item.task ?? item.message
  };
}

export function reconcileCitationContext(packet, options = {}) {
  const staleAfterYears = options.staleAfterYears ?? 7;
  const claims = asArray(packet.claims);
  const sources = asArray(packet.sources);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const findings = [];

  if (claims.length === 0) {
    findings.push(finding("blocker", "no-claims", undefined, "No manuscript claims were provided for assistant review."));
  }

  for (const claim of claims) {
    const citedSourceIds = asArray(claim.citedSourceIds);

    if (citedSourceIds.length === 0) {
      findings.push(finding(
        "blocker",
        "claim-without-citation",
        claim,
        "The claim has no linked citation context.",
        [],
        "Attach at least one source that directly supports or constrains this claim."
      ));
      continue;
    }

    const citedSources = [];
    for (const sourceId of citedSourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) {
        findings.push(finding(
          "blocker",
          "unknown-source",
          claim,
          `The claim references missing source ${sourceId}.`,
          [sourceId],
          "Add the missing source metadata or remove the dangling citation."
        ));
        continue;
      }
      citedSources.push(source);
    }

    const citedEffectDirections = unique(citedSources.map((source) => source.effectDirection));
    const nonNeutralDirections = citedEffectDirections.filter((direction) => direction && direction !== "mixed" && direction !== "unknown");
    if (nonNeutralDirections.length > 1) {
      findings.push(finding(
        "blocker",
        "contradictory-cited-effects",
        claim,
        `The cited sources disagree on effect direction: ${nonNeutralDirections.join(", ")}.`,
        citedSources.map((source) => source.id),
        "Rewrite the claim as contested or add an adjudication note explaining why one direction is preferred."
      ));
    }

    for (const source of citedSources) {
      const sourceIds = [source.id];
      if (source.retracted) {
        findings.push(finding(
          "blocker",
          "retracted-citation",
          claim,
          `${sourceLabel(source)} is marked retracted.`,
          sourceIds,
          "Remove or explicitly label the retracted source before release."
        ));
      }

      if (source.stance === "contradicts") {
        findings.push(finding(
          "blocker",
          "contradicting-source-used-as-support",
          claim,
          `${sourceLabel(source)} contradicts the claim but is cited without a limitation note.`,
          sourceIds,
          "Move the source into a limitation sentence or add a rebuttal-backed explanation."
        ));
      }

      if (source.stance === "mixed") {
        findings.push(finding(
          "warning",
          "mixed-source-needs-qualification",
          claim,
          `${sourceLabel(source)} reports mixed evidence and needs qualified language.`,
          sourceIds,
          "Add uncertainty language and identify which subgroup or assay is supported."
        ));
      }

      if (claim.effectDirection && source.effectDirection && source.effectDirection !== "mixed" && claim.effectDirection !== source.effectDirection) {
        findings.push(finding(
          "blocker",
          "effect-direction-mismatch",
          claim,
          `${sourceLabel(source)} has effect direction ${source.effectDirection}, but the claim states ${claim.effectDirection}.`,
          sourceIds,
          "Align the claim with the source or cite a direct source for the stated effect direction."
        ));
      }

      if (["background", "context", "method"].includes(source.citationIntent) && claim.usesCitationAs === "evidence") {
        findings.push(finding(
          "blocker",
          "citation-intent-mismatch",
          claim,
          `${sourceLabel(source)} is tagged for ${source.citationIntent}, not direct evidence.`,
          sourceIds,
          "Use the citation as context only or replace it with a direct empirical support source."
        ));
      }

      const methodOverlap = setOverlap(asArray(claim.methodTags), asArray(source.methodTags));
      if (asArray(claim.methodTags).length > 0 && methodOverlap.length === 0) {
        findings.push(finding(
          "warning",
          "method-context-gap",
          claim,
          `${sourceLabel(source)} does not share the claim method tags: ${asArray(claim.methodTags).join(", ")}.`,
          sourceIds,
          "Add a same-method source or explain the cross-method inference."
        ));
      }

      const populationOverlap = setOverlap(asArray(claim.populations), asArray(source.populations));
      if (asArray(claim.populations).length > 0 && populationOverlap.length === 0) {
        findings.push(finding(
          "warning",
          "population-context-gap",
          claim,
          `${sourceLabel(source)} does not cover the claim population: ${asArray(claim.populations).join(", ")}.`,
          sourceIds,
          "Add population-matched evidence or narrow the claim."
        ));
      }

      if (source.year && CURRENT_YEAR - source.year > staleAfterYears && claim.requiresCurrentEvidence) {
        findings.push(finding(
          "warning",
          "stale-citation",
          claim,
          `${sourceLabel(source)} is older than the configured ${staleAfterYears}-year recency window.`,
          sourceIds,
          "Run a recency search and add a current synthesis or explain why the older source is canonical."
        ));
      }

      if (claim.requiresReproducibilityEvidence && (!source.hasRawData || !source.hasCode || !source.hasProtocol)) {
        const missing = [
          !source.hasRawData ? "raw data" : undefined,
          !source.hasCode ? "code" : undefined,
          !source.hasProtocol ? "protocol" : undefined
        ].filter(Boolean);
        findings.push(finding(
          "warning",
          "reproducibility-evidence-gap",
          claim,
          `${sourceLabel(source)} is missing reproducibility evidence: ${missing.join(", ")}.`,
          sourceIds,
          "Link the missing artifacts or lower the reproducibility confidence for this claim."
        ));
      }
    }
  }

  const severityRank = { blocker: 0, warning: 1, info: 2 };
  findings.sort((left, right) => {
    return severityRank[left.severity] - severityRank[right.severity] ||
      left.claimId.localeCompare(right.claimId) ||
      left.code.localeCompare(right.code);
  });

  const citationMatrix = buildCitationMatrix(claims, sourceById);
  const reproducibility = scoreReproducibility(claims, sourceById);
  const opportunityFeed = buildOpportunityFeed(packet, findings);
  const counts = {
    claims: claims.length,
    sources: sources.length,
    blockers: findings.filter((item) => item.severity === "blocker").length,
    warnings: findings.filter((item) => item.severity === "warning").length,
    opportunities: opportunityFeed.length
  };

  const reviewerQueue = findings.map(reviewCommentFor);
  const revisionTasks = findings.map(revisionTaskFor);
  const exportPacket = {
    projectId: packet.project?.id ?? "unknown-project",
    generatedAt: packet.generatedAt ?? "2026-05-16T18:20:00.000Z",
    citationMatrix,
    reviewerQueue,
    revisionTasks,
    reproducibility,
    opportunityFeed
  };

  const auditDigest = `citation-context:${counts.blockers}:${counts.warnings}:${digestFor(exportPacket)}`;

  return {
    ready: counts.blockers === 0,
    counts,
    findings,
    reviewerQueue,
    revisionTasks,
    citationMatrix,
    reproducibility,
    opportunityFeed,
    exportPacket: {
      ...exportPacket,
      auditDigest
    }
  };
}
