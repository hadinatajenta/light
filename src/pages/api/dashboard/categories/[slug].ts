import { withAdmin } from '@/lib/api/handler';
import { deleteCategory, updateCategory } from '@/lib/content/categories';
import { categorySchema } from '@/lib/content/category-store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

function requireSlug(slug: string | undefined): string {
  if (!slug) {
    throw new ApiError(400, 'MISSING_SLUG', 'The category slug is required.');
  }
  return slug;
}

export const PUT = withAdmin(async ({ params, request }, requestId) => {
  const slug = requireSlug(params.slug);
  const payload = categorySchema.parse(await readJsonBody(request, 10_000));
  const category = await updateCategory(slug, payload);

  return jsonOk({ category }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId) => {
  const slug = requireSlug(params.slug);
  await deleteCategory(slug);

  return jsonOk({ slug, deleted: true }, requestId);
});
