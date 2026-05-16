# Reputation Transparency Receipts

This module is a self-contained milestone for SCIBASE issue #15, Community and User Reputation System. It focuses on transparent reputation evidence rather than a broad social feed implementation.

It models structured peer-review receipts, CRediT-style contribution records, anonymous and semi-private review visibility, endorsement quality, reproducibility badges, bounty completions, leaderboards, tiers, and moderator findings. The goal is to make every reputation point explainable from a reviewer-safe receipt.

## What It Covers

- Structured peer review scores for clarity, rigor, novelty, and reproducibility.
- Public, semi-private, anonymous, and double-blind review receipts.
- Inline comment anchors against manuscripts, datasets, code, or notebooks.
- CRediT-style contribution attribution with verified artifact receipts.
- Transparent reputation signal breakdowns and incentive tiers.
- Domain, institution, and global leaderboards.
- Abuse and privacy findings for self endorsement, thin high-score reviews, reciprocal endorsement rings, and anonymous identity leaks.
- Deterministic evidence digests for audit trails and project timelines.

## Run It

```bash
npm run check
npm test
npm run demo
```

All logic is dependency-free and uses only Node.js built-ins.
