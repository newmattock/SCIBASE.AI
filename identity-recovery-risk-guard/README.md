# Identity Recovery Risk Guard

This module implements a focused User & Project Management slice for account recovery and session-risk review. It is intentionally not another broad RBAC or profile-management demo. Instead, it answers a specific operational question:

> Should SCIBASE restore account access or linked-identity control when the user has sensitive project memberships, active sessions, and identity evidence that may not line up?

The guard evaluates synthetic password resets, MFA resets, email changes, OAuth relinks, and SAML rebinds before project access is restored.

## What it covers

- Linked identities across email, ORCID, GitHub, Google, and SAML.
- MFA recovery evidence, backup codes, and institutional approval.
- Suspicious sessions, new devices, country changes, and recent failed-login clusters.
- Project exposure for owner/admin roles and sensitive object grants.
- Recovery packets with missing evidence and required reviewers.
- Project access holds, session revocation recommendations, and deterministic audit events.

## Run locally

```bash
npm run check
npm test
npm run demo
npm run demo:gif
```

The implementation is dependency-free and uses synthetic data only.
