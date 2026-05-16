# Requirement Map

Issue #14 asks for a platform to host scientific and engineering data plus code. This implementation focuses on the acceptance gate that decides whether a hosted project is ready to expose those artifacts.

| Issue need | Implementation surface |
| --- | --- |
| Store datasets, code, figures, notebooks, raw outputs, and model files | `buildArtifactCatalog` normalizes each artifact family with persistent links, access policy, preview state, versioning, and hashes. |
| Support scientific discovery and citation | `buildMetadataStandardsIndex` checks JSON-LD, DataCite, and schema.org metadata. |
| Keep restricted materials reviewable | `evaluateFairSignals` blocks restricted artifacts without reviewer access and a restriction reason. |
| Produce evidence for maintainers, reviewers, and collaborators | `planReviewerExportPacket` creates a deterministic export manifest with metadata, policy, FAIR report, artifact hashes, and audit digest. |
| Make regressions obvious | `test/fair-artifact-access-gate.test.js` covers the ready path plus metadata, access, and reuse failures. |

The slice is intentionally narrow: it does not build object storage, upload UI, billing, or auth. It defines the deterministic hosting contract those surfaces can call before publication.
