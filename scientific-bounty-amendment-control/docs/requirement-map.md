# Requirement Map

This module maps to SCIBASE issue #18, Scientific Bounty System.

| Issue requirement | Implementation |
| --- | --- |
| Challenge posting portal | Validates sponsor amendments against published challenge terms, including deliverables, rubrics, prize amounts, timelines, prequalification rules, NDA posture, and IP policy. |
| Timeline and milestone deadlines | Flags shortened submission windows, review-start changes, short notice windows, and missing solver acknowledgement before changes take effect. |
| Prize amount and payout schedule | Detects prize decreases or increases, blocks payout readiness when material changes are not acknowledged, and emits signed hold decisions. |
| Evaluation criteria and scoring rubric | Computes rubric criterion shifts and freezes evaluation when rubric changes after submissions or reviewer assignments. |
| Public vs. private / anonymous participation | Treats visibility, NDA, prequalification, and IP policy changes as participation-term amendments requiring solver notice and acknowledgement. |
| Submission engine | Uses registered teams, active submissions, and reviewer assignments to decide who is affected by a sponsor amendment. |
| Arbitration and reward distribution | Places evaluation, reviewer-assignment, and payout-readiness holds when challenge terms change in a way that could unfairly affect solvers. |
| Audit logs for reproducibility | Generates deterministic finding IDs, solver-notification IDs, audit event IDs, and a final evidence digest. |

## Non-overlap

This is a challenge amendment control layer. It does not implement a general challenge intake system, solver workspace, scoring engine, arbitration module, appeals ledger, escrow settlement module, anti-collusion detector, or reproducibility audit gate. It focuses on the sponsor-change interval after a bounty is already live and before evaluation or payout readiness proceeds.
