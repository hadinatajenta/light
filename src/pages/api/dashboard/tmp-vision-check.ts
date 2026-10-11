import type { APIRoute } from 'astro';
import { withAdmin } from '@/lib/api/handler';
import { jsonOk } from '@/lib/http';

export const prerender = false;

interface VisionBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

export const POST: APIRoute = withAdmin(async ({ request }, requestId) => {
  const body = (await request.json()) as { imageUrl: string };
  const response = await fetch(body.imageUrl);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const byteArray = Array.from(bytes);

  const { env } = await import('cloudflare:workers');
  const ai = (env as unknown as { AI: VisionBinding }).AI;

  const attempts: Array<{ label: string; model: string; input: unknown }> = [
    {
      label: 'llama32-vision-list',
      model: '@cf/meta/llama-3.2-11b-vision-instruct',
      input: {
        image: byteArray,
        prompt:
          'You are checking a stock photograph for problems. Reply with a JSON object: {"textFound": true or false, "items": ["each word, letter, logo or brand mark you can see"]}. Look carefully at book spines, screens, posters, labels, packaging, whiteboards and device logos. If there is no text or logo at all, return an empty items list.',
        max_tokens: 256,
      },
    },
    {
      label: 'llama32-vision-simple',
      model: '@cf/meta/llama-3.2-11b-vision-instruct',
      input: {
        image: byteArray,
        prompt:
          'Is there any readable text or any logo in this image? Answer yes or no, then name what you found.',
        max_tokens: 128,
      },
    },
  ];

  const results: Array<{ label: string; value?: unknown; error?: string }> = [];

  for (const attempt of attempts) {
    try {
      const value = await ai.run(attempt.model, attempt.input);
      results.push({ label: attempt.label, value });
    } catch (error) {
      results.push({
        label: attempt.label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return jsonOk({ results }, requestId);
});
