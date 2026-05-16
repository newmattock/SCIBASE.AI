# Repository API Export Contract

This module covers the programmatic access and export-bundle portion of issue #10, "Project Repository & Version Control".

It builds a deterministic contract for a scientific project repository that includes:

- typed repository component manifests for manuscript, data, code, notebooks, results, protocols, and metadata
- content hashes and a repository integrity root for reproducibility checks
- REST API route coverage for GET, POST, and PUT workflows plus export access
- export-bundle entries with manifest, metadata, citation, reproducibility, and component files
- a Git-compatible CLI transcript for advanced lab users
- readiness checks that fail closed when required component, API, or reproducibility evidence is missing

## Run

```bash
npm test
npm run demo
```

The demo prints the export readiness decision, bundle hash, API coverage, and CLI workflow for the sample project in `data/sample-project.json`.

## Requirement Map

See [docs/requirement-map.md](docs/requirement-map.md) for the issue requirement mapping.
