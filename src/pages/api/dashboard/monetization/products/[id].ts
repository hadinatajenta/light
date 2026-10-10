import { recordActivity, toUserActor } from '@/lib/activity/record';
import {
  deleteProduct,
  getProgram,
  productInputSchema,
  updateProduct,
} from '@/lib/affiliate/store';
import { resolveAffiliateTarget } from '@/lib/affiliate/targets';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The product id is required.');
  }

  return id;
}

export const PUT = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const payload = productInputSchema.parse(await readJsonBody(request, 30_000));
  const program = await getProgram(database, payload.programId);
  const resolved = resolveAffiliateTarget(payload.target, program.network === 'amazon');
  const product = await updateProduct(database, id, { ...payload, target: resolved.target });

  await recordActivity({
    ...toUserActor(user),
    action: 'product.updated',
    targetType: 'affiliate_product',
    targetId: product.id,
    summary: `Updated product "${product.name}"`,
  });

  return jsonOk({ product }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const product = await deleteProduct(database, id);

  await recordActivity({
    ...toUserActor(user),
    action: 'product.deleted',
    targetType: 'affiliate_product',
    targetId: product.id,
    summary: `Deleted product "${product.name}"`,
  });

  return jsonOk({ id: product.id, deleted: true }, requestId);
});
