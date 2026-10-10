import type { APIRoute } from 'astro';
import { getPublishedPosts } from '@/utils/content';

export const GET: APIRoute = async () => {
  const posts = await getPublishedPosts();

  const searchIndex = posts.map((post) => ({
    title: post.data.title,
    description: post.data.description,
    tags: post.data.tags,
    url: `/blog/${post.id}/`,
  }));

  return new Response(JSON.stringify(searchIndex), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
