# Collaborative Discussion Sidebar Audit

This package adds a focused readiness layer for the real-time collaborative research editor requested in SCIBASE issue #12. It does not implement a broad editor shell, notebook runtime, reference formatter, lock recovery system, or figure/table workflow. Instead, it covers the issue requirement for a document chat or discussion sidebar per file or section.

The audit model checks whether sidebar discussions are safe to export during an active manuscript review:

- section and file scoped discussion threads
- open blockers, stale conversations, and unresolved reviewer tasks
- pinned sources and citation evidence for decisions
- conflicting accepted decisions on the same section/topic
- locked-section owner and reviewer participation
- deterministic handoff packets for review, export, and version history

## Run

```sh
npm test
npm run demo
npm run demo:video
```

`npm run demo` writes a JSON audit report and an SVG storyboard to `docs/`. `npm run demo:video` renders a short MP4 demo for reviewers.

## Why This Slice Matters

In a collaborative scientific editor, the sidebar is not just chat. It becomes the record of why a section changed, which source supports the decision, who still needs to respond, and what must be preserved when the document is exported or reviewed later. This package gives that workflow deterministic checks and a compact export packet before the larger editor UI is wired in.
