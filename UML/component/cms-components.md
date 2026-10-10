# Component diagram

How the parts of the system are organized and who calls whom.

```mermaid
flowchart TB
  browser[Browser]
  access[Cloudflare Access]
  worker[Astro on Cloudflare Worker]

  subgraph Worker
    publicRoutes[Public routes: static pages]
    adminRoutes[Dashboard routes: SSR]
    apiRoutes[Admin API]
    contentStore[ContentStore]
    mediaStore[MediaStore]
    authProvider[AuthProvider]
    insights[InsightsProvider]
    settingsStore[SettingsStore]
  end

  github[GitHub repository and API]
  actions[GitHub Actions]
  r2[(Cloudflare R2)]
  analytics[Cloudflare Web Analytics]
  gsc[Google Search Console]
  llm[LLM providers]

  browser --> access
  access --> worker
  browser --> publicRoutes
  browser --> adminRoutes
  adminRoutes --> authProvider
  adminRoutes --> apiRoutes

  apiRoutes --> contentStore
  apiRoutes --> mediaStore
  apiRoutes --> settingsStore
  apiRoutes --> insights

  contentStore --> github
  mediaStore --> r2
  insights --> analytics
  insights --> gsc

  actions --> llm
  actions --> github
  github --> worker

  authProvider -.->|now| access
  authProvider -.->|later| customAuth[Custom email and password]
```

## Interface note

`ContentStore`, `MediaStore`, and `SettingsStore` are interfaces, not concrete
implementations:

```text
ContentStore     savePost, getPost, listPosts, deletePost
MediaStore       put, get, list, delete
SettingsStore    read, write
AuthProvider     getCurrentUser, requireAdmin
```

Implementations today:

- `ContentStore` -> git adapter (Markdown committed to the repository)
- `MediaStore` -> Cloudflare R2
- `SettingsStore` -> JSON file in the repository
- `AuthProvider` -> Cloudflare Access

A future swap to a database changes only the adapter, not the callers.
