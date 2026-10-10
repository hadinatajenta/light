import { ApiError } from '../http';
import { invalidateCache, readCache, writeCache } from './cache';
import { parseDocument, serializeDocument } from './frontmatter';
import {
  type BlogFile,
  deleteFile,
  type GithubConfig,
  getFile,
  listBlogFiles,
  listDirectory,
  putFile,
} from './github';
import { POST_STATUSES, type PostStatus } from './post-schema';
import { toSlug } from './slug';

const BLOG_DIRECTORY = 'src/content/blog';
const MARKDOWN_EXTENSIONS = ['.md', '.mdx'];
const POSTS_CACHE_KEY = 'posts:list';
const POSTS_CACHE_TTL_MS = 15_000;

export interface PostSummary {
  id: string;
  path: string;
  sha: string;
  title: string;
  status: PostStatus;
  category: string | null;
  tags: string[];
  pubDate: string | null;
  updatedDate: string | null;
}

export interface PostDocument {
  id: string;
  path: string;
  sha: string;
  data: Record<string, unknown>;
  body: string;
}

function idOf(path: string): string {
  return (
    path
      .split('/')
      .pop()
      ?.replace(/\.(md|mdx)$/, '') ?? path
  );
}

function readStatus(value: unknown): PostStatus {
  return typeof value === 'string' && (POST_STATUSES as readonly string[]).includes(value)
    ? (value as PostStatus)
    : 'draft';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function toSummary(path: string, sha: string, data: Record<string, unknown>): PostSummary {
  return {
    id: idOf(path),
    path,
    sha,
    title: typeof data.title === 'string' ? data.title : idOf(path),
    status: readStatus(data.status),
    category: typeof data.category === 'string' ? data.category : null,
    tags: readStringArray(data.tags),
    pubDate: data.pubDate ? String(data.pubDate) : null,
    updatedDate: data.updatedDate ? String(data.updatedDate) : null,
  };
}

async function loadMarkdownFiles(config: GithubConfig): Promise<BlogFile[]> {
  const batch = await listBlogFiles(config, BLOG_DIRECTORY);
  if (batch) {
    return batch.filter((file) => MARKDOWN_EXTENSIONS.some((ext) => file.path.endsWith(ext)));
  }

  const entries = await listDirectory(config, BLOG_DIRECTORY);
  const markdown = entries.filter((entry) =>
    MARKDOWN_EXTENSIONS.some((ext) => entry.path.endsWith(ext)),
  );

  const files = await Promise.all(
    markdown.map(async (entry) => {
      const file = await getFile(config, entry.path);
      if (!file) {
        return null;
      }
      return { name: entry.name, path: entry.path, sha: file.sha, text: file.content };
    }),
  );

  return files.filter((file): file is BlogFile => file !== null);
}

export async function listPosts(config: GithubConfig): Promise<PostSummary[]> {
  const cached = readCache<PostSummary[]>(POSTS_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const files = await loadMarkdownFiles(config);
  const summaries = files.map((file) =>
    toSummary(file.path, file.sha, parseDocument(file.text).data),
  );

  writeCache(POSTS_CACHE_KEY, summaries, POSTS_CACHE_TTL_MS);
  return summaries;
}

async function findPathForId(config: GithubConfig, id: string): Promise<string | null> {
  const entries = await listDirectory(config, BLOG_DIRECTORY);
  const match = entries.find((entry) => idOf(entry.path) === id);
  return match ? match.path : null;
}

export async function getPost(config: GithubConfig, id: string): Promise<PostDocument> {
  const path = await findPathForId(config, id);
  if (!path) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'That post does not exist.');
  }

  const file = await getFile(config, path);
  if (!file) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'That post does not exist.');
  }

  const parsed = parseDocument(file.content);
  return { id, path, sha: file.sha, data: parsed.data, body: parsed.body };
}

export interface SavePostInput {
  id?: string;
  slug: string;
  data: Record<string, unknown>;
  body: string;
  message: string;
  expectedSha?: string;
}

function slugifiedId(slug: string): string {
  const id = toSlug(slug);
  if (!id) {
    throw new ApiError(422, 'INVALID_SLUG', 'The slug must contain letters or numbers.');
  }
  return id;
}

export async function createPost(
  config: GithubConfig,
  input: SavePostInput,
): Promise<PostDocument> {
  const id = slugifiedId(input.id ?? input.slug);
  const path = `${BLOG_DIRECTORY}/${id}.mdx`;

  const existing = await getFile(config, path);
  if (existing) {
    throw new ApiError(409, 'SLUG_TAKEN', 'A post with that slug already exists.');
  }

  const content = serializeDocument(input.data, input.body);
  const result = await putFile(config, path, content, input.message);
  invalidateCache(POSTS_CACHE_KEY);

  return { id, path, sha: result.sha, data: input.data, body: input.body };
}

export async function updatePost(
  config: GithubConfig,
  id: string,
  input: SavePostInput,
): Promise<PostDocument> {
  const path = await findPathForId(config, id);
  if (!path) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'That post does not exist.');
  }

  const file = await getFile(config, path);
  if (!file) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'That post does not exist.');
  }

  if (input.expectedSha && input.expectedSha !== file.sha) {
    throw new ApiError(409, 'REVISION_CONFLICT', 'The post changed elsewhere. Reload and retry.');
  }

  const content = serializeDocument(input.data, input.body);
  const result = await putFile(config, path, content, input.message, file.sha);
  invalidateCache(POSTS_CACHE_KEY);

  return { id, path, sha: result.sha, data: input.data, body: input.body };
}

export async function setPostStatus(
  config: GithubConfig,
  id: string,
  data: Record<string, unknown>,
  body: string,
  status: PostStatus,
  message: string,
  expectedSha?: string,
): Promise<void> {
  await updatePost(config, id, {
    slug: id,
    data: { ...data, status },
    body,
    message,
    expectedSha,
  });
}

export async function deletePost(config: GithubConfig, id: string, message: string): Promise<void> {
  const path = await findPathForId(config, id);
  if (!path) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'That post does not exist.');
  }

  const file = await getFile(config, path);
  if (!file) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'That post does not exist.');
  }

  await deleteFile(config, path, message, file.sha);
  invalidateCache(POSTS_CACHE_KEY);
}
