import { ApiError } from '../http';

export interface GithubConfig {
  token: string;
  repo: string;
  branch: string;
}

export interface GithubFile {
  path: string;
  sha: string;
  content: string;
}

export interface GithubDirectoryEntry {
  name: string;
  path: string;
  sha: string;
}

const API_BASE = 'https://api.github.com';

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildHeaders(config: GithubConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'light-cms',
  };
}

async function githubRequest(
  config: GithubConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_BASE}/repos/${config.repo}/contents/${path}`, {
    ...init,
    headers: { ...buildHeaders(config), ...(init?.headers ?? {}) },
  });
}

export async function getFile(config: GithubConfig, path: string): Promise<GithubFile | null> {
  const response = await githubRequest(config, `${path}?ref=${encodeURIComponent(config.branch)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ApiError(502, 'GITHUB_ERROR', 'Failed to read from the repository.');
  }

  const payload = (await response.json()) as { content: string; sha: string };
  return { path, sha: payload.sha, content: decodeBase64(payload.content) };
}

export async function listDirectory(
  config: GithubConfig,
  path: string,
): Promise<GithubDirectoryEntry[]> {
  const response = await githubRequest(config, `${path}?ref=${encodeURIComponent(config.branch)}`);

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new ApiError(502, 'GITHUB_ERROR', 'Failed to list the repository directory.');
  }

  const payload = (await response.json()) as Array<{
    name: string;
    path: string;
    sha: string;
    type: string;
  }>;

  return payload
    .filter((entry) => entry.type === 'file')
    .map((entry) => ({ name: entry.name, path: entry.path, sha: entry.sha }));
}

export async function putFile(
  config: GithubConfig,
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const response = await githubRequest(config, path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: encodeBase64(content),
      branch: config.branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (response.status === 409 || response.status === 422) {
    throw new ApiError(409, 'REVISION_CONFLICT', 'The file changed elsewhere. Reload and retry.');
  }

  if (!response.ok) {
    throw new ApiError(502, 'GITHUB_ERROR', 'Failed to write to the repository.');
  }

  const payload = (await response.json()) as { content: { sha: string } };
  return { sha: payload.content.sha };
}

export async function putFileBase64(
  config: GithubConfig,
  path: string,
  base64Content: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const response = await githubRequest(config, path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: base64Content,
      branch: config.branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (response.status === 409 || response.status === 422) {
    throw new ApiError(409, 'REVISION_CONFLICT', 'The file changed elsewhere. Reload and retry.');
  }

  if (!response.ok) {
    throw new ApiError(502, 'GITHUB_ERROR', 'Failed to write to the repository.');
  }

  const payload = (await response.json()) as { content: { sha: string } };
  return { sha: payload.content.sha };
}

export async function deleteFile(
  config: GithubConfig,
  path: string,
  message: string,
  sha: string,
): Promise<void> {
  const response = await githubRequest(config, path, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: config.branch }),
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    throw new ApiError(502, 'GITHUB_ERROR', 'Failed to delete from the repository.');
  }
}
