# AI Output Evidence Verifier

This module is a focused implementation slice for SCIBASE issue #13, "AI-Assisted Research Tools (MVP Level)." It models the reviewer gate that should run before AI-generated summaries, peer-review aids, citation suggestions, or manuscript action packets are shown as trustworthy research guidance.

The verifier answers four practical questions:

- Are the AI tool's claims backed by known project sources?
- Are any cited sources retracted, under expression of concern, or too stale for the claim type?
- Does each output mode include the disclosure and citation fields expected by a research assistant?
- Which concrete reviewer actions should be completed before the output is released?

## Files

- `src/ai-output-evidence-verifier.js` contains deterministic evidence checks and audit digest generation.
- `data/sample-assistant-output.json` provides a mixed research-assistant output packet.
- `test/ai-output-evidence-verifier.test.js` covers blocked and releasable output paths.
- `scripts/demo.js` prints a concise release-readiness report for the sample packet.
- `docs/demo.svg` and `docs/demo.mp4` show the intended reviewer surface.

## Run

```sh
npm test
npm run demo
npm run demo:video
```

The implementation is dependency-free and uses synthetic project data only.
