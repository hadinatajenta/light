import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { deletePost, getPost, updatePost } from '@/lib/content/store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const bulkRequestSchema = z.object({
  action: z.enum(['archive', 'delete']),
  ids: z.array(z.string().min(1).max(120)).min(1).max(100),
});

interface BulkOutcome {
  id: string;
  ok: boolean;
  code?: string;
  message?: string;
}

export const POST = withAdmin(async ({ request }, requestId) => {
  const payload = bulkRequestSchema.parse(await readJsonBody(request, 20_000));

  const outcomes: BulkOutcome[] = [];

  for (const id of payload.ids) {
    try {
      if (payload.action === 'delete') {
        await deletePost(id);
      } else {
        const post = await getPost(id);
        await updatePost(id, {
          slug: id,
          data: { ...post.data, status: 'archived', updatedDate: new Date() },
          body: post.body,
          message: `chore(content): archive ${id}`,
        });
      }

      outcomes.push({ id, ok: true });
    } catch (error) {
      if (error instanceof ApiError) {
        outcomes.push({ id, ok: false, code: error.code, message: error.message });
      } else {
        outcomes.push({ id, ok: false, code: 'UNKNOWN', message: 'The action failed.' });
      }
    }
  }

  const failed = outcomes.filter((outcome) => !outcome.ok);

  return jsonOk(
    {
      action: payload.action,
      affected: outcomes.length - failed.length,
      failed,
    },
    requestId,
  );
});
