import { GITHUB_BRANCH, GITHUB_REPO, GITHUB_TOKEN } from 'astro:env/server';
import { withAdmin } from '@/lib/api/handler';
import { DEFAULT_BRANCH, DEFAULT_REPOSITORY } from '@/lib/content/config';
import { jsonOk } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  return jsonOk(
    {
      hasToken: Boolean(GITHUB_TOKEN),
      repository: GITHUB_REPO ?? DEFAULT_REPOSITORY,
      branch: GITHUB_BRANCH ?? DEFAULT_BRANCH,
    },
    requestId,
  );
});
