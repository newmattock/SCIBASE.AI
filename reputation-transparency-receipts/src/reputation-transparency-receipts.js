import { createHash } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  }
  return value;
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex").slice(0, 16);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function daysSince(date, now) {
  return Math.max(0, Math.ceil((new Date(now).getTime() - new Date(date).getTime()) / DAY_MS));
}

function userMap(users) {
  return new Map(asArray(users).map((user) => [user.id, user]));
}

function averageScore(scores = {}) {
  const values = ["clarity", "rigor", "novelty", "reproducibility"]
    .map((key) => Number(scores[key]))
    .filter(Number.isFinite);
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function visibilityReceipt(review, users) {
  const reviewer = users.get(review.reviewerId);
  const base = {
    id: review.id,
    projectId: review.projectId,
    mode: review.mode ?? "public",
    score: Number(averageScore(review.scores).toFixed(2)),
    evidenceCount: asArray(review.evidenceLinks).length,
    commentAnchors: asArray(review.commentAnchors).slice().sort()
  };

  if (base.mode === "anonymous" || base.mode === "double_blind") {
    return {
      ...base,
      reviewer: `anonymous-${stableHash({ reviewId: review.id, reviewerId: review.reviewerId })}`,
      visibleTo: asArray(review.visibleTo).slice().sort()
    };
  }

  if (base.mode === "semi_private") {
    return {
      ...base,
      reviewer: reviewer?.handle ?? review.reviewerId,
      visibleTo: [...new Set([review.reviewerId, ...asArray(review.visibleTo)])].sort()
    };
  }

  return {
    ...base,
    reviewer: reviewer?.handle ?? review.reviewerId,
    visibleTo: ["public"]
  };
}

function creditWeight(role) {
  return {
    conceptualization: 14,
    data_curation: 12,
    software: 12,
    formal_analysis: 10,
    validation: 10,
    peer_review: 8,
    visualization: 7,
    writing_review: 7,
    supervision: 5
  }[role] ?? 4;
}

function contributionReceipts(contributions) {
  const byUser = new Map();

  for (const contribution of asArray(contributions)) {
    if (!byUser.has(contribution.userId)) {
      byUser.set(contribution.userId, {
        userId: contribution.userId,
        roles: {},
        projectIds: new Set(),
        verifiedArtifacts: 0,
        creditScore: 0,
        receipts: []
      });
    }

    const receipt = byUser.get(contribution.userId);
    const role = contribution.creditRole ?? "other";
    const verified = Boolean(contribution.verifiedBy);
    receipt.roles[role] = (receipt.roles[role] ?? 0) + 1;
    receipt.projectIds.add(contribution.projectId);
    receipt.verifiedArtifacts += verified ? asArray(contribution.artifactIds).length : 0;
    receipt.creditScore += creditWeight(role) + (verified ? 4 : 0);
    receipt.receipts.push({
      id: contribution.id,
      projectId: contribution.projectId,
      role,
      verified,
      artifactIds: asArray(contribution.artifactIds).slice().sort(),
      createdAt: contribution.createdAt
    });
  }

  return [...byUser.values()].map((receipt) => ({
    ...receipt,
    projectIds: [...receipt.projectIds].sort(),
    creditScore: clamp(receipt.creditScore),
    receipts: receipt.receipts.sort((a, b) => a.id.localeCompare(b.id))
  }));
}

function findModerationFindings(input) {
  const findings = [];
  const endorsementPairs = new Map();

  for (const endorsement of asArray(input.endorsements)) {
    if (endorsement.fromUserId === endorsement.toUserId) {
      findings.push({
        id: stableHash({ kind: "self_endorsement", endorsement }),
        kind: "self_endorsement",
        severity: "high",
        subject: endorsement.toUserId,
        message: "Self endorsements are excluded from reputation scoring",
        evidence: [endorsement.id]
      });
    }

    const pair = [endorsement.fromUserId, endorsement.toUserId].sort().join(":");
    endorsementPairs.set(pair, (endorsementPairs.get(pair) ?? 0) + 1);
  }

  for (const [pair, count] of endorsementPairs.entries()) {
    if (count >= 3) {
      findings.push({
        id: stableHash({ kind: "endorsement_ring", pair, count }),
        kind: "endorsement_ring",
        severity: "medium",
        subject: pair,
        message: "Repeated reciprocal endorsements need moderator review",
        evidence: { count }
      });
    }
  }

  for (const review of asArray(input.reviews)) {
    if (averageScore(review.scores) >= 4.5 && asArray(review.evidenceLinks).length < 2) {
      findings.push({
        id: stableHash({ kind: "thin_high_score_review", reviewId: review.id }),
        kind: "thin_high_score_review",
        severity: "medium",
        subject: review.reviewerId,
        message: "High review score has too little evidence attached",
        evidence: [review.id]
      });
    }

    if ((review.mode === "anonymous" || review.mode === "double_blind") && review.publicReviewerName) {
      findings.push({
        id: stableHash({ kind: "anonymous_identity_leak", reviewId: review.id }),
        kind: "anonymous_identity_leak",
        severity: "critical",
        subject: review.reviewerId,
        message: "Anonymous review includes a public reviewer name",
        evidence: [review.id]
      });
    }
  }

  return findings.sort((a, b) => {
    const severity = { critical: 0, high: 1, medium: 2, low: 3 };
    const bySeverity = (severity[a.severity] ?? 9) - (severity[b.severity] ?? 9);
    return bySeverity || a.id.localeCompare(b.id);
  });
}

function reputationTier(score) {
  if (score >= 85) return "open_science_champion";
  if (score >= 70) return "trusted_reviewer";
  if (score >= 50) return "verified_contributor";
  return "community_member";
}

function buildReputationReports(input, now, creditReceipts, reviewReceipts, moderationFindings) {
  const users = userMap(input.users);
  const validEndorsements = asArray(input.endorsements).filter((endorsement) => endorsement.fromUserId !== endorsement.toUserId);
  const penaltiesByUser = new Map();

  for (const finding of moderationFindings) {
    if (finding.kind === "anonymous_identity_leak") {
      penaltiesByUser.set(finding.subject, (penaltiesByUser.get(finding.subject) ?? 0) + 15);
    } else if (finding.kind === "self_endorsement" || finding.kind === "thin_high_score_review") {
      penaltiesByUser.set(finding.subject, (penaltiesByUser.get(finding.subject) ?? 0) + 8);
    }
  }

  return asArray(input.users).map((user) => {
    const credit = creditReceipts.find((item) => item.userId === user.id);
    const userReviews = reviewReceipts.filter((review) => asArray(input.reviews).find((raw) => raw.id === review.id)?.reviewerId === user.id);
    const avgReviewScore = userReviews.length
      ? userReviews.reduce((sum, review) => sum + review.score, 0) / userReviews.length
      : 0;
    const endorsements = validEndorsements.filter((endorsement) => endorsement.toUserId === user.id);
    const badges = asArray(input.reproducibilityBadges).filter((badge) => badge.userId === user.id && badge.verified);
    const bountyCompletions = asArray(input.bountyCompletions).filter((completion) => completion.userId === user.id && completion.verified);
    const recencyBoost = Math.max(0, 8 - daysSince(user.lastActiveAt ?? now, now) / 30);
    const penalty = penaltiesByUser.get(user.id) ?? 0;

    const signals = {
      contributionCredit: credit?.creditScore ?? 0,
      reviewQuality: clamp(avgReviewScore * 14),
      endorsements: clamp(endorsements.length * 6, 0, 18),
      reproducibility: clamp(badges.length * 9, 0, 18),
      bountyCompletions: clamp(bountyCompletions.length * 8, 0, 16),
      recency: Number(recencyBoost.toFixed(2)),
      penalties: penalty
    };
    const score = clamp(
      signals.contributionCredit * 0.6 +
        signals.reviewQuality * 0.45 +
        signals.endorsements +
        signals.reproducibility +
        signals.bountyCompletions +
        signals.recency -
        signals.penalties
    );

    return {
      userId: user.id,
      handle: user.handle,
      domain: user.domain,
      institution: user.institution,
      score: Number(score.toFixed(2)),
      tier: reputationTier(score),
      signals,
      publicReceipts: [
        ...(credit?.receipts.map((receipt) => receipt.id) ?? []),
        ...userReviews.map((review) => review.id),
        ...badges.map((badge) => badge.id)
      ].sort()
    };
  }).sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle));
}

function leaderboards(reputationReports) {
  const byDomain = new Map();
  const byInstitution = new Map();

  for (const report of reputationReports) {
    if (!byDomain.has(report.domain)) byDomain.set(report.domain, []);
    byDomain.get(report.domain).push(report);
    if (!byInstitution.has(report.institution)) byInstitution.set(report.institution, []);
    byInstitution.get(report.institution).push(report);
  }

  const shape = (entries) => Object.fromEntries([...entries.entries()].sort().map(([key, reports]) => [
    key,
    reports.slice().sort((a, b) => b.score - a.score).slice(0, 5).map((report) => ({
      userId: report.userId,
      handle: report.handle,
      score: report.score,
      tier: report.tier
    }))
  ]));

  return {
    global: reputationReports.slice(0, 10).map((report) => ({
      userId: report.userId,
      handle: report.handle,
      score: report.score,
      tier: report.tier
    })),
    byDomain: shape(byDomain),
    byInstitution: shape(byInstitution)
  };
}

function timeline(input, reviewReceipts, creditReceipts, reports) {
  const reviewEvents = reviewReceipts.map((review) => ({
    at: asArray(input.reviews).find((raw) => raw.id === review.id)?.createdAt,
    type: "review_receipt",
    subject: review.id,
    projectId: review.projectId
  }));
  const creditEvents = creditReceipts.flatMap((credit) => credit.receipts.map((receipt) => ({
    at: receipt.createdAt,
    type: "credit_receipt",
    subject: receipt.id,
    projectId: receipt.projectId
  })));
  const tierEvents = reports.map((report) => ({
    at: input.generatedAt,
    type: "reputation_tier",
    subject: report.userId,
    tier: report.tier
  }));

  return [...reviewEvents, ...creditEvents, ...tierEvents]
    .filter((event) => event.at)
    .sort((a, b) => `${a.at}:${a.type}:${a.subject}`.localeCompare(`${b.at}:${b.type}:${b.subject}`));
}

export function analyzeReputationTransparencyReceipts(input, options = {}) {
  const now = options.now ?? input.generatedAt ?? new Date().toISOString();
  const users = userMap(input.users);
  const reviewReceipts = asArray(input.reviews).map((review) => visibilityReceipt(review, users));
  const creditReceipts = contributionReceipts(input.contributions);
  const moderationFindings = findModerationFindings(input);
  const reputationReports = buildReputationReports(input, now, creditReceipts, reviewReceipts, moderationFindings);
  const board = leaderboards(reputationReports);
  const events = timeline(input, reviewReceipts, creditReceipts, reputationReports);
  const summary = {
    users: asArray(input.users).length,
    reviewReceipts: reviewReceipts.length,
    contributionReceipts: creditReceipts.reduce((sum, receipt) => sum + receipt.receipts.length, 0),
    findings: moderationFindings.length,
    criticalFindings: moderationFindings.filter((finding) => finding.severity === "critical").length,
    trustedReviewers: reputationReports.filter((report) => report.tier === "trusted_reviewer" || report.tier === "open_science_champion").length
  };
  const result = {
    generatedAt: now,
    community: input.community ?? "SCIBASE research community",
    summary,
    reviewReceipts,
    contributionCredits: creditReceipts,
    reputationReports,
    leaderboards: board,
    moderationFindings,
    timeline: events
  };

  return {
    ...result,
    evidenceDigest: stableHash(result)
  };
}
