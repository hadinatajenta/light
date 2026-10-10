import { type CollectionEntry, getCollection } from 'astro:content';
import { filterPublishedPosts, sortPostsByDateDesc } from './posts';

export type BlogPost = CollectionEntry<'blog'>;

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog');
  return sortPostsByDateDesc(filterPublishedPosts(posts, !import.meta.env.PROD));
}
