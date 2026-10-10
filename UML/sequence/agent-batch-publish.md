# Sequence: agent batch publish

Multiple content agents produce drafts on a schedule. A quality gate decides
what reaches the repository, and publishing is batched so one build covers
many articles.

```mermaid
sequenceDiagram
  participant Cron as Scheduler (GitHub Actions)
  participant Agent as Content Agent
  participant LLM as LLM provider
  participant QA as QA Agent
  participant Store as ContentStore (git)
  participant Build as Cloudflare build

  Cron->>Agent: Run assignment (topic, angle, category)
  Agent->>LLM: Generate draft
  LLM-->>Agent: Draft article
  Agent->>Store: Commit draft branch (not main)
  Cron->>QA: Review drafts
  QA->>QA: Check length, dedupe, originality, placeholders
  alt Passes gate
    QA->>Store: Mark approved
    Cron->>Store: Merge approved drafts into main
    Store->>Build: Batched push triggers one build
    Build->>Build: Validate content and generate pages
  else Fails gate
    QA->>Store: Leave as draft with reasons
  end
```

## Rules

- Agents never push to `main` directly. They write to a branch; a merge step
  publishes. This keeps `main` clean and limits conflict windows.
- The quality gate is mandatory. At volume, review cannot be a human reading
  every article; it is an automated gate with a sampled human check.
- Publishing is batched. One build per article wastes build minutes and gives
  no benefit for a content site.
- The gate must reject rather than repair silently. Repairs belong in the
  agent, not in the gate.
