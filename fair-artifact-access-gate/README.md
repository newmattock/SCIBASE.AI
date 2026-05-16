# FAIR Artifact Access Gate

This module is a focused implementation slice for SCIBASE issue #14, "Scientific/Engineering Data & Code Hosting." It models the pre-publication gate a hosted scientific project should pass before SCIBASE exposes datasets, notebooks, source code, figures, raw instrument outputs, and model files to collaborators, reviewers, or the public.

The gate answers four practical hosting questions:

- Does the project expose machine-readable metadata through JSON-LD, DataCite, and schema.org?
- Are scientific artifacts cataloged by family, access policy, preview capability, versioning, and deterministic hashes?
- Do the hosted materials satisfy FAIR signals for findability, accessibility, interoperability, and reuse?
- Can SCIBASE produce a reviewer export packet that includes metadata, artifact links, access-policy evidence, and checksums?

## Files

- `src/fair-artifact-access-gate.js` contains the deterministic assessment logic.
- `data/sample-artifacts.json` provides a realistic mixed scientific artifact set.
- `test/fair-artifact-access-gate.test.js` covers success and failure paths.
- `scripts/demo.js` prints a concise readiness report for the sample project.
- `docs/demo.svg` and `docs/demo.mp4` show the intended product surface.

## Run

```sh
npm test
npm run demo
npm run demo:video
```

The implementation is intentionally dependency-free so it can be reviewed without installing a framework or service runtime.
