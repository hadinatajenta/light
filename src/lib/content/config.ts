import { GITHUB_BRANCH, GITHUB_REPO, GITHUB_TOKEN } from 'astro:env/server';
import { ApiError } from '../http';
import type { GithubConfig } from './github';

export const DEFAULT_REPOSITORY = 'hadinatajenta/light';
export const DEFAULT_BRANCH = 'main';

export function getGithubConfig(): GithubConfig {
  if (!GITHUB_TOKEN) {
    throw new ApiError(
      500,
      'REPOSITORY_NOT_CONFIGURED',
      'Repository access is not configured (missing GITHUB_TOKEN).',
    );
  }

  return {
    token: GITHUB_TOKEN,
    repo: GITHUB_REPO ?? DEFAULT_REPOSITORY,
    branch: GITHUB_BRANCH ?? DEFAULT_BRANCH,
  };
}
