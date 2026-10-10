# Deployment diagram

Where each part runs in production.

```mermaid
flowchart TB
  user[Visitor or Admin browser]

  subgraph CF[Cloudflare edge network]
    access[Access policies]
    workerNode[Worker: light]
    staticAssets[Static assets from dist]
    ssrRoutes[SSR: dashboard and API]
    r2[(R2 bucket: light-media)]
    kv[(KV: cache and rate limit)]
    analytics[Web Analytics]
  end

  repo[GitHub: hadinatajenta/light]
  actions[GitHub Actions: agents and cron]
  domain[light.hadinata.me]

  user --> domain
  domain --> access
  access --> workerNode
  workerNode --> staticAssets
  workerNode --> ssrRoutes
  ssrRoutes --> r2
  ssrRoutes --> kv
  workerNode --> analytics

  ssrRoutes --> repo
  actions --> repo
  repo --> workerNode
```

## Notes

- The public site is served as static assets; only `/dashboard` and `/api`
  run server-side.
- Server secrets live as Worker secrets: GitHub token, R2 credentials,
  Access verification key. Never in the repository.
- The agent pipeline runs in GitHub Actions, not in the Browser Worker,
  because it is long-running and needs outbound calls to LLM providers.
- Content changes reach production by commit, which triggers a build.
  Publishing is batched, not one build per article.
- A database (D1) is intentionally absent for now. When the catalog passes
  the migration threshold in the content plan, D1 replaces the git adapter
  behind `ContentStore` and article rendering moves to on-demand.
