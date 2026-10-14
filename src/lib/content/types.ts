import type { PostStatus } from './post-schema';

export interface PostSummary {
  id: string;
  path: string;
  sha: string;
  title: string;
  description: string;
  status: PostStatus;
  category: string | null;
  tags: string[];
  coverUrl: string | null;
  coverAlt: string | null;
  reviewStatus?: string | null;
  pubDate: string | null;
  updatedDate: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PostDocument {
  id: string;
  path: string;
  sha: string;
  data: Record<string, unknown>;
  body: string;
}

export interface SavePostInput {
  id?: string;
  slug: string;
  data: Record<string, unknown>;
  body: string;
  message: string;
  expectedSha?: string;
}

export interface CategoryRecord {
  slug: string;
  label: string;
  description: string;
}
