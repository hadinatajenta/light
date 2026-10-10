# Sequence: publish a post

An admin writes in the dashboard and publishes. Content is committed to the
repository, which triggers a build.

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Dashboard UI
  participant API as Admin API
  participant Store as ContentStore (git)
  participant GH as GitHub API
  participant Build as Cloudflare build
  participant Live as Public site

  Admin->>UI: Write post, click Publish
  UI->>API: POST /api/posts (session cookie)
  API->>API: Authenticate and authorize admin
  API->>API: Normalize and validate payload
  API->>Store: savePost(post, expectedRevision)
  Store->>GH: Commit Markdown with idempotency key
  alt Commit conflict
    GH-->>Store: 409 conflict
    Store-->>API: ConflictError
    API-->>UI: 409 with current revision
    UI-->>Admin: "Changed elsewhere, reload"
  else Commit accepted
    GH-->>Store: Commit created
    Store-->>API: Saved
    API-->>UI: 201 with new revision
    GH->>Build: Push event triggers build
    Build->>Build: Validate content, generate pages
    Build->>Live: Deploy new assets
    UI-->>Admin: Published
  end
```

## Rules

- The request carries no author identity; the author is taken from the session.
- An `Idempotency-Key` prevents a double click from creating two commits.
- The expected revision makes the write optimistic, so a concurrent change is
  reported rather than silently overwritten.
- Validation runs before the commit: title length, description length, minimum
  body, and image alt text.
