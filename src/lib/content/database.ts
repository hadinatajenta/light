export async function resolveContentDatabase(): Promise<D1Database | null> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env as unknown as { CONTENT_DB?: D1Database }).CONTENT_DB ?? null;
  } catch {
    return null;
  }
}
