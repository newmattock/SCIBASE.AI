# Requirement Map

Issue #10 asks for a scientific project repository system with version control, programmatic access, and export support. This module focuses on the API/export slice so it does not duplicate broad repository ledger, dataset diff, release embargo, schema migration, notebook replay, or citation impact submissions already open.

| Issue requirement | Module coverage |
| --- | --- |
| Repository structure with manuscript, data, code, notebooks, results, protocols, and metadata | `buildRepositoryManifest` validates required component coverage and records typed component entries. |
| Hash-based integrity for reproducibility | Every component receives a deterministic `sha256:` content hash, and the manifest receives an integrity root. |
| Semantic versioning and tagged releases | The manifest records `semanticVersion` and `tag`, and the CLI transcript clones/export by tag. |
| Computation-aware reproducibility | The readiness gate checks reproducibility status and evidence paths before release. |
| DOI and citation generation | Export bundles include `citation/cite-this-project.json` with DOI, citation text, and tag metadata. |
| Public REST API for project and data access | `validateRestApiPlan` requires public GET, POST, and PUT routes with scopes. |
| Export bundles | `planExportBundle` emits manifest, API contract, reproducibility runbook, citation metadata, and component entries. |
| Git-compatible CLI for advanced contributors | `buildGitCompatibleCliPlan` emits clone, status, export, and route-discovery commands. |
| Reviewable local validation | `npm test` covers ready, missing metadata, incomplete API, and failing reproducibility cases. |
