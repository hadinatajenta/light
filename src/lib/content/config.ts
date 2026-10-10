import { GITHUB_BRANCH, GITHUB_REPO, GITHUB_TOKEN } from 'astro:env/server';
import { ApiError } from '../http';
import type { GithubConfig } from './github';

export function getGithubConfig(): GithubConfig {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    throw new ApiError(500, 'REPOSITORY_NOT_CONFIGURED', 'Repository access is not configured.');
  }

  return { token: GITHUB_TOKEN, repo: GITHUB_REPO, branch: GITHUB_BRANCH ?? 'main' };
}
