# Requirement Map

| Issue #17 capability | Implementation evidence |
| --- | --- |
| Cited references and DOIs | `publicationNotices` and relationship `evidenceDoi` matching in `src/retraction-signal-guard.js` |
| Entity pages with aggregated context | `entity_publication_notice` findings and `annotate_entity_page` curator actions |
| Graph navigation safety | relationship findings suppress or review graph edges that rely on unsafe evidence |
| AI recommendations | recommendation decisions emit `allow`, `annotate`, `review`, or `suppress` for sidebar, digest, and discovery recommendations |
| Linked data / schema.org metadata | JSON-LD style export is produced in `report.jsonLd` |
| Auditability | deterministic `evidenceDigest`, sorted findings, sample data, CLI demo, and Node tests |

## Distinctness

This module is not a broad extractor, navigator, ontology migration, conflict arbiter, author disambiguation, knowledge-gap explorer, or artifact-lineage tracker. It focuses on publication safety notices and how those notices propagate through graph edges and recommendations.
