# Sequence: upload media

An admin uploads an image. The file is validated before it is stored, and the
stored name is generated, never taken from the client.

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Dashboard UI
  participant API as Admin API
  participant Guard as Upload validator
  participant R2 as MediaStore (R2)
  participant Index as Media index

  Admin->>UI: Choose image
  UI->>API: POST /api/media (multipart)
  API->>API: Authenticate and authorize admin
  API->>Guard: Check size, count, and quota
  alt Over limit
    Guard-->>API: Rejected
    API-->>UI: 413 or 422 with reason
  else Within limit
    Guard->>Guard: Check extension, declared type, magic bytes
    Guard->>Guard: Reject active content such as SVG script
    Guard->>R2: put(generatedKey, bytes, contentType)
    R2-->>Guard: Stored object key
    Guard->>Index: Record id, key, url, mime, dimensions
    Index-->>API: Media record
    API-->>UI: 201 with media record
    UI-->>Admin: Image inserted with empty alt prompt
  end
```

## Rules

- Never trust the filename or the declared content type. Check the magic bytes.
- Generate the storage key. Never build a path from user input.
- Enforce a size limit, a count limit, and a total quota per admin.
- Serve uploads from R2, not from the same origin as HTML, so a stored file
  cannot become active content on the site domain.
- `alt` is required before the image can be saved as a post cover.
