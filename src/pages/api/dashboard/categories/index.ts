import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { createCategory, listCategories } from '@/lib/content/categories';
import { categorySchema } from '@/lib/content/category-store';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const categories = await listCategories();
  return jsonOk({ categories }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const payload = categorySchema.parse(await readJsonBody(request, 10_000));
  const category = await createCategory(payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'category.created',
    targetType: 'category',
    targetId: category.slug,
    summary: `Created category "${category.label}"`,
  });

  return jsonOk({ category }, requestId, 201);
});
