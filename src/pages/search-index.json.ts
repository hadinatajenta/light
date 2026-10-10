import type { APIRoute } from 'astro';
import { getPublishedPostSummaries } from '@/lib/content/public';

export const prerender = false;

export const GET: APIRoute = async () => {
  const posts = (await getPublishedPostSummaries()).map((post) => ({
    title: post.title,
    description: post.description,
    tags: post.tags,
    url: `/blog/${post.id}/`,
  }));

  return new Response(JSON.stringify(posts), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
