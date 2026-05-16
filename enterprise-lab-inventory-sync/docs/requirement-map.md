# Requirement Map

| Issue #19 capability | Lab inventory sync coverage |
| --- | --- |
| Admin dashboards | Produces lab, integration, finding, export-gate, and action metrics for research-office dashboards. |
| Contributor and usage analytics | Surfaces project owners and affected project IDs for blocked exports and reservation conflicts. |
| Compliance tracking | Blocks export evidence when calibration, maintenance, ELN linkage, or reagent expiry undermines reproducibility. |
| API and webhooks | Emits deterministic `lab_inventory.*` webhook event envelopes with evidence digests. |
| Electronic lab notebooks and lab inventory integrations | Models ELN, inventory, and instrument sync health, queue depth, and stale integration state. |
| Export pipelines | Produces per-project export gates: `ready`, `review_before_export`, or `block_export`. |
| Version and evidence history | Uses stable SHA-256 digests for findings, gates, and full reports. |

## Distinctness Check

This slice is about operational readiness of physical lab assets and inventory-system sync before research outputs are exported. It does not duplicate current #19 submissions for enterprise dashboards, export pipeline packaging, trust centers, compliance evidence packets, audit signal routing, webhook replay, identity provisioning drift, retention/legal hold, data residency, grant portfolio compliance, or SLA/uptime monitoring.
