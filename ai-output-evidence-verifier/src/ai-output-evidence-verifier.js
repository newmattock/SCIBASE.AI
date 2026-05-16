import { createHash } from "node:crypto";

const DEFAULT_POLICY = {
  staleReviewDays: 180,
  minClaimConfidence: 0.65,
  requiredDisclosuresByMode: {
    summary: ["ai-generated", "human-review-required", "source-coverage"],
    "peer-review": ["ai-generated", "human-review-required", "source-coverage"],
    "citation-recommendation": ["ai-generated", "human-review-required", "source-coverage"]
  },
  highRiskTags: ["causality", "clinical", "dosage", "safety", "policy"],
  requiredSourceTypesByTag: {
    "raw-data": ["dataset"],
    segmentation: ["dataset"],
    citation: ["article", "preprint", "dataset"]
  }
};

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

function sha256(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function daysBetween(start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.floor((endMs - startMs) / 86_400_000);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function sourceIndex(sources) {
  return new Map((sources || []).map((source) => [source.id, source]));
}

function finding(code, severity, output, claim, message, evidence = {}) {
  return {
    code,
    severity,
    outputId: output.id,
    mode: output.mode,
    claimId: claim?.id || null,
    message,
    evidence
  };
}

function buildSourceCoverage(outputs, sourcesById) {
  const referencedSourceIds = unique(
    (outputs || []).flatMap((output) => (output.claims || []).flatMap((claim) => claim.sourceIds || []))
  );
  const knownSourceIds = referencedSourceIds.filter((id) => sourcesById.has(id));
  const missingSourceIds = referencedSourceIds.filter((id) => !sourcesById.has(id));

  return {
    referencedSourceIds,
    knownSourceIds,
    missingSourceIds,
    referencedCount: referencedSourceIds.length,
    knownCount: knownSourceIds.length,
    missingCount: missingSourceIds.length
  };
}

function checkDisclosures(output, policy) {
  const expected = policy.requiredDisclosuresByMode[output.mode] || [];
  const actual = new Set(output.disclosures || []);
  const missing = expected.filter((disclosure) => !actual.has(disclosure));

  if (missing.length === 0) {
    return [];
  }

  return [
    finding(
      "missing_disclosure",
      "blocker",
      output,
      null,
      `Output ${output.id} is missing required disclosure fields: ${missing.join(", ")}`,
      { missing }
    )
  ];
}

function checkClaimSources(output, claim, sourcesById, reviewDate, policy) {
  const findings = [];
  const sourceIds = claim.sourceIds || [];
  const sources = sourceIds.map((id) => sourcesById.get(id)).filter(Boolean);
  const missingSourceIds = sourceIds.filter((id) => !sourcesById.has(id));

  if (sourceIds.length === 0) {
    findings.push(
      finding(
        "unsupported_claim",
        "blocker",
        output,
        claim,
        "Claim has no cited source IDs.",
        { text: claim.text }
      )
    );
  }

  if (missingSourceIds.length > 0) {
    findings.push(
      finding(
        "unknown_source",
        "blocker",
        output,
        claim,
        `Claim references unknown source IDs: ${missingSourceIds.join(", ")}`,
        { missingSourceIds }
      )
    );
  }

  for (const source of sources) {
    if (source.status && source.status !== "active") {
      findings.push(
        finding(
          "unsafe_source_status",
          "blocker",
          output,
          claim,
          `Claim cites source ${source.id} with status ${source.status}.`,
          { sourceId: source.id, status: source.status }
        )
      );
    }

    const ageDays = daysBetween(source.reviewedAt || source.publishedAt, reviewDate);
    if (ageDays > policy.staleReviewDays) {
      findings.push(
        finding(
          "stale_source_review",
          "warning",
          output,
          claim,
          `Source ${source.id} was last reviewed ${ageDays} days before the project review date.`,
          { sourceId: source.id, ageDays }
        )
      );
    }
  }

  if (Number(claim.confidence || 0) < policy.minClaimConfidence) {
    findings.push(
      finding(
        "low_confidence_claim",
        "warning",
        output,
        claim,
        `Claim confidence ${claim.confidence} is below the policy threshold ${policy.minClaimConfidence}.`,
        { confidence: claim.confidence, threshold: policy.minClaimConfidence }
      )
    );
  }

  const tags = new Set(claim.tags || []);
  const highRiskTags = policy.highRiskTags.filter((tag) => tags.has(tag));
  if (highRiskTags.length > 0 && sources.length < 2) {
    findings.push(
      finding(
        "high_risk_claim_needs_multiple_sources",
        "blocker",
        output,
        claim,
        `High-risk claim tags require at least two known sources: ${highRiskTags.join(", ")}`,
        { highRiskTags, knownSourceCount: sources.length }
      )
    );
  }

  for (const [tag, allowedTypes] of Object.entries(policy.requiredSourceTypesByTag || {})) {
    if (!tags.has(tag)) {
      continue;
    }

    const hasRequiredType = sources.some((source) => allowedTypes.includes(source.type));
    if (!hasRequiredType) {
      findings.push(
        finding(
          "missing_required_source_type",
          "warning",
          output,
          claim,
          `Claim tagged ${tag} should cite at least one source of type: ${allowedTypes.join(", ")}`,
          { tag, allowedTypes }
        )
      );
    }
  }

  return findings;
}

function buildReviewerTasks(findings) {
  return findings.map((item) => {
    const prefix = item.claimId ? `${item.outputId}/${item.claimId}` : item.outputId;
    const actionByCode = {
      unsupported_claim: "Add source evidence or downgrade the claim.",
      unknown_source: "Replace missing source IDs with indexed project sources.",
      unsafe_source_status: "Remove the claim or add an explicit retraction caveat.",
      stale_source_review: "Refresh source review date or cite a newer source.",
      low_confidence_claim: "Require human reviewer confirmation before release.",
      high_risk_claim_needs_multiple_sources: "Add independent corroborating evidence.",
      missing_required_source_type: "Cite a source type that supports this claim class.",
      missing_disclosure: "Add the required AI disclosure fields."
    };

    return {
      id: `${item.code}:${prefix}`,
      severity: item.severity,
      action: actionByCode[item.code] || "Review before release.",
      target: prefix
    };
  });
}

export function verifyAiOutputEvidence(packet, policyOverrides = {}) {
  const policy = {
    ...DEFAULT_POLICY,
    ...policyOverrides,
    requiredDisclosuresByMode: {
      ...DEFAULT_POLICY.requiredDisclosuresByMode,
      ...(policyOverrides.requiredDisclosuresByMode || {})
    },
    requiredSourceTypesByTag: {
      ...DEFAULT_POLICY.requiredSourceTypesByTag,
      ...(policyOverrides.requiredSourceTypesByTag || {})
    }
  };
  const project = packet.project || {};
  const sources = packet.sources || [];
  const outputs = packet.outputs || [];
  const reviewDate = project.reviewDate || new Date().toISOString().slice(0, 10);
  const sourcesById = sourceIndex(sources);
  const findings = [];

  for (const output of outputs) {
    findings.push(...checkDisclosures(output, policy));

    for (const claim of output.claims || []) {
      findings.push(...checkClaimSources(output, claim, sourcesById, reviewDate, policy));
    }
  }

  const blockerCount = findings.filter((item) => item.severity === "blocker").length;
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  const sourceCoverage = buildSourceCoverage(outputs, sourcesById);
  const reviewerTasks = buildReviewerTasks(findings);
  const claimCount = outputs.reduce((sum, output) => sum + (output.claims || []).length, 0);
  const ready = blockerCount === 0;
  const auditDigest = sha256({
    projectId: project.id,
    outputIds: outputs.map((output) => output.id).sort(),
    findingCodes: findings.map((item) => `${item.code}:${item.outputId}:${item.claimId || ""}`).sort(),
    sourceCoverage,
    policy: {
      staleReviewDays: policy.staleReviewDays,
      minClaimConfidence: policy.minClaimConfidence
    }
  });

  return {
    project: {
      id: project.id,
      title: project.title,
      domain: project.domain,
      reviewDate
    },
    ready,
    recommendation: ready ? "release_with_human_review" : "hold_for_evidence_fix",
    counts: {
      outputs: outputs.length,
      claims: claimCount,
      sources: sources.length,
      blockers: blockerCount,
      warnings: warningCount,
      reviewerTasks: reviewerTasks.length
    },
    sourceCoverage,
    findings,
    reviewerTasks,
    auditDigest: `sha256:${auditDigest}`
  };
}

export { DEFAULT_POLICY };
