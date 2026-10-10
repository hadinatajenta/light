import { type CollectionEntry, getCollection } from 'astro:content';
import { filterVisiblePosts, sortPostsByDateDesc } from './posts';

export type BlogPost = CollectionEntry<'blog'>;

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog');
  return sortPostsByDateDesc(filterVisiblePosts(posts, !import.meta.env.PROD));
}
