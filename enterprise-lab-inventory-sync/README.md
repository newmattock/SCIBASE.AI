# Enterprise Lab Inventory Sync

Enterprise research offices need to know whether experiments, data exports, and publication packages depend on lab assets that are stale, offline, expired, or out of sync with institutional systems. This module adds a deterministic monitor for lab-inventory and instrument-readiness governance.

The monitor is intentionally self-contained and credential-free. It consumes synthetic inventory, ELN/LIMS integration, instrument, reagent, and project dependency records, then emits:

- dashboard metrics for institutional admins and lab operations teams
- project export gates when blocked instruments or expired reagents affect evidence packages
- webhook events for calibration drift, maintenance risk, integration lag, reservation conflicts, and inventory expiry
- prioritized admin actions with deterministic evidence digests for audit trails

## Run

```bash
npm run check
npm test
npm run demo
```

The demo reads `data/sample-lab-input.json` and prints the current governance status. The visual preview is available at `docs/demo.svg`; `docs/demo.gif` is a short generated walkthrough artifact for the bounty review.

## Fit For Issue #19

This targets the "API & Webhooks" and "Admin Dashboards" enterprise-tooling requirements for integrations with electronic lab notebooks and lab inventory systems. It is distinct from prior slices around broad dashboards, export packages, trust centers, webhook replay, identity drift, retention/legal hold, data residency, grant compliance, and SLA monitoring.
