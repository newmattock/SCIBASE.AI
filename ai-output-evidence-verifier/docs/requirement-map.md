# Requirement Map

Issue #13 asks for AI-assisted research tools that help with summaries, peer-review diagnostics, citation management, and research quality without asking reviewers to trust ungrounded model output. This slice implements a deterministic evidence gate for those tool outputs.

| Requirement area | Implementation evidence |
| --- | --- |
| AI paper summarizer | Validates summary claims, source IDs, source freshness, and required AI disclosures before release. |
| AI peer review aid | Blocks peer-review suggestions that cite retracted sources or omit source coverage disclosure. |
| Citation management | Verifies citation-recommendation claims cite known source records of acceptable types. |
| Technical issue checking | Produces reviewer tasks for unsupported claims, unsafe source status, stale review evidence, and missing disclosure. |
| MVP-level local demo | `npm run demo` prints a deterministic release-readiness report from synthetic data. |
| Reviewer confidence | `auditDigest` provides a stable hash of the reviewed outputs, policy thresholds, findings, and source coverage. |
| Demo video | `npm run demo:video` renders `docs/demo.mp4` without service credentials or external APIs. |

This module intentionally avoids live LLM calls, scraping, external credentials, and private data. It is the trust layer around AI outputs, not another generic model wrapper.
