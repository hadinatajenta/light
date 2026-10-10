import { getGithubConfig } from './config';
import { createD1Store } from './d1-store';
import { resolveContentDatabase } from './database';
import * as gitStore from './post-store';
import type { PostDocument, PostSummary, SavePostInput } from './types';

export async function listPosts(): Promise<PostSummary[]> {
  const database = await resolveContentDatabase();
  return database ? createD1Store(database).listPosts() : gitStore.listPosts(getGithubConfig());
}

export async function getPost(id: string): Promise<PostDocument> {
  const database = await resolveContentDatabase();
  return database ? createD1Store(database).getPost(id) : gitStore.getPost(getGithubConfig(), id);
}

export async function createPost(input: SavePostInput): Promise<PostDocument> {
  const database = await resolveContentDatabase();
  return database
    ? createD1Store(database).createPost(input)
    : gitStore.createPost(getGithubConfig(), input);
}

export async function updatePost(id: string, input: SavePostInput): Promise<PostDocument> {
  const database = await resolveContentDatabase();
  return database
    ? createD1Store(database).updatePost(id, input)
    : gitStore.updatePost(getGithubConfig(), id, input);
}

export async function deletePost(id: string): Promise<void> {
  const database = await resolveContentDatabase();
  if (database) {
    await createD1Store(database).deletePost(id);
    return;
  }

  await gitStore.deletePost(getGithubConfig(), id, `chore(content): delete ${id}`);
}

export type { PostDocument, PostSummary, SavePostInput } from './types';
