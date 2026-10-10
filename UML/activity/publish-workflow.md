# Activity: publish workflow

The end-to-end path from a draft to a live article, including the quality
gate and the human review branch.

```mermaid
flowchart TD
  start([Draft created]) --> validate{Validation passes?}
  validate -- No --> fix[Return with reasons]
  fix --> start
  validate -- Yes --> gate{Quality gate passes?}

  gate -- No --> reject[Reject or hold as draft]
  reject --> start
  gate -- Yes --> review{Human review required?}

  review -- Yes --> human[Admin reviews in dashboard]
  human --> approve{Approved?}
  approve -- No --> reject
  approve -- Yes --> schedule{Schedule or publish now?}

  review -- No --> schedule
  schedule -- Schedule --> wait[Wait until publish time]
  wait --> merge
  schedule -- Now --> merge[Merge into main]

  merge --> build[Cloudflare build]
  build --> live([Article is live])
```

## Rules

- Validation covers structure: title, description, minimum body length, image
  alt text, no placeholder tokens.
- The quality gate covers meaning: duplication, thin content, unsupported
  claims.
- Human review is reserved for articles that are promoted on the landing page
  or that touch money, health, or safety claims.
- Only the merge step publishes. Everything before it is reversible.
