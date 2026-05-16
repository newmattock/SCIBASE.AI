# Requirement Map

This module maps issue #11 to a focused recovery-risk control layer for User & Project Management.

| Issue #11 requirement | Implementation |
| --- | --- |
| Email/password login with 2FA | `mfa_reset` and `password_reset` requests evaluate MFA backup-code, verified email, and device evidence before access is restored. |
| OAuth integrations and account linking | Linked identity records model email, ORCID, GitHub, Google, and SAML providers; relinks are checked for subject changes. |
| Institutional login via SAML | `saml_rebind` requests require trusted institutional domains and institution-admin approval. |
| Account linking for unified identity | `linked_identity_subject_changed` findings detect identity subject drift before project access is restored. |
| Public/private profile and attribution safety | Risky recovery decisions hold profile attribution changes until identity is reviewed. |
| Project spaces and linked collaborators | Project memberships and object grants are scanned for owner/admin exposure and sensitive project access. |
| Role-based access | Owner/admin roles trigger project access holds during high-risk recovery. |
| Object-level control | Restricted datasets and download grants are held separately from general project membership. |
| Project audit log | `auditEvents` records deterministic hashes for risk scoring, decisions, review packets, project holds, and session actions. |

## Distinctness

Existing issue #11 submissions cover broad RBAC, workspace governance, member offboarding, institutional recertification, anonymous-review escrow, and identity merge/export. This slice focuses on account recovery and active-session risk before access restoration. It is designed to sit in front of those systems and prevent a compromised recovery flow from inheriting sensitive project access.
