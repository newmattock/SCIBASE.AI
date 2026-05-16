# Requirement Map

This package targets the "Document chat or discussion sidebar per file or section" requirement from SCIBASE issue #12.

| Issue capability | Coverage in this package |
| --- | --- |
| Real-time collaboration readiness | Validates sidebar participants, open blockers, reviewer ownership, and locked-section participation before export. |
| Section and file comments | Models threads scoped to either manuscript sections or file paths, then flags orphaned threads. |
| Suggestions, decisions, and discussion history | Records accepted/proposed decisions and detects conflicting active decisions for the same section/topic. |
| Version history and autosave handoff | Emits a deterministic export packet with stable hash and audit digest suitable for snapshot history. |
| Scientific source traceability | Requires pinned source evidence for decisions and blocks unsafe or missing sources. |
| Reviewer task management | Converts unresolved blocking threads into explicit reviewer tasks with owners and priority. |

The slice is deliberately narrow so it can be reviewed independently of larger editor, notebook, reference-formatting, and figure/table implementations.
