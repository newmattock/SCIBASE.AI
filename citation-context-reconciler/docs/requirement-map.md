# Requirement Map

This module targets SCIBASE issue #16, "AI-Powered Research Assistant Suite", with a narrow citation-context reconciliation slice.

| Issue requirement | Implemented support |
| --- | --- |
| Auto peer review reports | Generates reviewer queue comments for citation misuse, contradictory evidence, stale support, method/population drift, and reproducibility gaps. |
| Claims vs. evidence alignment | Builds a citation matrix that compares manuscript claims with cited source stance, effect direction, citation intent, method tags, population tags, and artifact availability. |
| Missing citations or scope misalignment | Flags claims without citations, dangling source IDs, background/method citations used as direct evidence, method-context gaps, and population-context gaps. |
| Reproducibility checker | Computes claim-level and aggregate reproducibility confidence from raw data, code, and protocol evidence attached to cited sources. |
| Research gap finder | Ranks opportunity cards from contradiction signals, blocked claim links, lab capabilities, and researcher interests. |
| Reviewer-ready handoff | Exports deterministic revision tasks, review comments, citation matrix, opportunity feed, reproducibility score, and an audit digest. |

The implementation is dependency-free, synthetic-data-only, and does not require external APIs, credentials, model calls, or private data.
