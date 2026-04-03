# Feature Queue

## Queue

| # | Feature | Status | Date Added | Date Completed |
|---|---------|--------|------------|----------------|
| 1 | Artifact update enforcement rules | Done | 2026-04-03 | 2026-04-03 |

## All Pending Features

<!-- Format: - **Feature name** — short description -->
- **Chunked upload MCP tool** — Add an `append_content(upload_id, chunk, is_final)` tool so ChatGPT (and other clients with output token limits) can upload large HTML files across multiple tool calls without silent truncation
- **Small upload validation** — Detect suspiciously small uploads (e.g., <500 bytes with only a title tag) and return an error suggesting content was likely truncated, pointing to `upload_artifact_from_url`
- **Upload tool description warning** — Update `upload_artifact` description to warn that large files may be truncated by some clients, recommending `upload_artifact_from_url` as a fallback
- **Subscription plan levels** — Tiered plans with different limits/features for free vs paid users
- **UI redesign** — Refresh the app's visual design and UX
- **Internal sharing permissions** — Allow sharing artifacts only between registered SMYA users
- **Anonymous posting** — Allow uploading artifacts without requiring an account
- **Groups/communities** — Create groups or communities to share artifacts with
- **Social logins** — Add Google, Microsoft, GitHub, and X as login providers
