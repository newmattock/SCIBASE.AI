# Citation Context Reconciler

`citation-context-reconciler` is a focused SCIBASE AI research assistant module for issue #16. It helps authors and reviewers catch citation drift before a manuscript leaves the workspace: sources cited as evidence are checked against the actual source context, effect direction, method match, population match, recency, and reproducibility artifacts.

The slice is intentionally narrower than a broad copilot. It answers a practical question during pre-submission review: "Are these citations being used honestly enough for a reviewer, journal, funder, or replication team to trust the claim?"

## What It Does

- Reviews manuscript claims against cited source metadata.
- Detects direct blockers such as contradictory cited effects, citation-intent mismatch, retracted citations, missing sources, and effect-direction mismatch.
- Raises warnings for mixed evidence, stale citations, population/method context gaps, and missing raw data/code/protocol evidence.
- Generates reviewer comments and author revision tasks.
- Scores reproducibility support from raw data, code, and registered protocol availability.
- Ranks research opportunities from contradictions, lab capabilities, and researcher interests.
- Exports a deterministic assistant packet with an audit digest for handoff and version history.

## Files

- `src/citation-context-reconciler.js` - dependency-free reconciliation engine.
- `sample/citation-context-packet.json` - synthetic manuscript/source packet.
- `test/citation-context-reconciler.test.js` - executable behavioral tests.
- `scripts/demo.js` - writes `docs/citation-context-report.json` and `docs/demo.svg`.
- `scripts/render-demo-video.m` - macOS-native MP4 renderer for `docs/demo.mp4`.
- `docs/requirement-map.md` - issue #16 capability mapping.

## Validation

```sh
npm test
npm run demo
npm run demo:video
```

The demo uses only local synthetic data and does not call an AI provider or external service.
