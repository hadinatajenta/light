import {
  countClicksSince,
  countInactiveProducts,
  countProductsWithoutProgram,
  findBrokenProductReferences,
  listProductSlugs,
  listTopProducts,
} from '@/lib/affiliate/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';

export const prerender = false;

const CLICK_WINDOW_DAYS = 30;
const TOP_PRODUCT_LIMIT = 10;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const since = new Date(Date.now() - CLICK_WINDOW_DAYS * DAY_IN_MS).toISOString();

  const [productSlugs, topProducts, clicksLast30Days, productsWithoutProgram, inactiveProducts] =
    await Promise.all([
      listProductSlugs(database),
      listTopProducts(database, TOP_PRODUCT_LIMIT),
      countClicksSince(database, since),
      countProductsWithoutProgram(database),
      countInactiveProducts(database),
    ]);

  const brokenReferences = await findBrokenProductReferences(database, productSlugs);

  return jsonOk(
    { brokenReferences, topProducts, clicksLast30Days, productsWithoutProgram, inactiveProducts },
    requestId,
  );
});
