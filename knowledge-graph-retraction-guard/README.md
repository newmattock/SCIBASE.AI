# Knowledge Graph Retraction Guard

Scientific knowledge graphs need to react when a paper is retracted, corrected, or flagged with an expression of concern. This module adds a deterministic retraction and correction propagation guard for graph edges, entity pages, and AI recommendation payloads.

The guard is self-contained and credential-free. It consumes synthetic graph entities, evidence relationships, recommendation candidates, and publication notices, then emits:

- retraction/correction findings tied to graph entities and evidence edges
- suppressed or review-only recommendation decisions
- curator actions for entity pages, relationship evidence, and digest exports
- JSON-LD style evidence output for downstream graph and audit systems
- a deterministic evidence digest for reproducible review

## Run

```bash
npm run check
npm test
npm run demo
```

The demo reads `data/sample-knowledge-graph.json`. Visual review artifacts are in `docs/demo.svg` and `docs/demo.gif`.

## Fit For Issue #17

This targets the Scientific Knowledge Graph Integration requirements for cited references, entity pages, graph navigation, and AI recommendations. It is distinct from prior extractor, navigator, link-audit, ontology-drift, conflict-arbiter, author-affiliation, knowledge-gap, and artifact-lineage slices because it focuses specifically on propagating publication safety notices through graph recommendations.
