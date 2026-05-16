# Requirement Map

SCIBASE issue #15 asks for peer reviews and comments, contributor credits, reputation scoring, leaderboards, badges, and incentive tiers.

| Requirement | Implementation |
| --- | --- |
| Structured peer reviews | `reviewReceipts` preserve per-review scores, evidence links, mode, and comment anchors. |
| Public, semi-private, anonymous, double-blind modes | `visibilityReceipt` redacts anonymous identities and restricts semi-private visibility. |
| Inline commenting | `commentAnchors` link review feedback to manuscript, dataset, code, or notebook locations. |
| Contributor credits | `contributionCredits` groups CRediT-style roles, verified artifacts, projects, and receipts per user. |
| Project timelines | `timeline` combines review, credit, and reputation tier events. |
| Reputation scoring | `reputationReports` expose contribution, review, endorsement, reproducibility, bounty, recency, and penalty signals. |
| Leaderboards | `leaderboards` emits global, domain, and institution rankings. |
| Badges and incentive tiers | `reputationTier` assigns community member, verified contributor, trusted reviewer, and open science champion tiers. |
| Abuse resistance | `moderationFindings` flags self endorsements, thin high-score reviews, endorsement rings, and anonymous identity leaks. |
| Auditability | `evidenceDigest` is deterministic for reviewer-ready receipts and score evidence. |
