import { recordActivity, toUserActor } from '@/lib/activity/record';
import { buildAffiliateUrl } from '@/lib/affiliate/links';
import {
  countProductReferences,
  createProduct,
  listProducts,
  listPrograms,
  type ProductCatalogEntry,
  productInputSchema,
} from '@/lib/affiliate/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

function readActiveFilter(value: string | null): boolean | null {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return null;
}

function matchesQuery(product: ProductCatalogEntry, query: string): boolean {
  return (
    product.name.toLowerCase().includes(query) ||
    product.slug.includes(query) ||
    product.target.toLowerCase().includes(query)
  );
}

export const GET = withAdmin(async ({ url }, requestId) => {
  const database = await requireContentDatabase();
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const programId = url.searchParams.get('program');
  const active = readActiveFilter(url.searchParams.get('active'));
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const perPage = Math.min(
    50,
    Math.max(1, Number.parseInt(url.searchParams.get('per_page') ?? '20', 10) || 20),
  );

  const [programs, products, referenceCounts] = await Promise.all([
    listPrograms(database),
    listProducts(database),
    countProductReferences(database),
  ]);

  const programById = new Map(programs.map((program) => [program.id, program]));
  const catalog: ProductCatalogEntry[] = products.map((product) => {
    const program = programById.get(product.programId);

    return {
      ...product,
      programName: program?.name ?? product.programId,
      affiliateUrl: program ? buildAffiliateUrl(program, product.target) : null,
      referenceCount: referenceCounts.get(product.slug) ?? 0,
    };
  });

  const filtered = catalog.filter((product) => {
    if (programId && product.programId !== programId) {
      return false;
    }

    if (active !== null && product.isActive !== active) {
      return false;
    }

    if (query && !matchesQuery(product, query)) {
      return false;
    }

    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * perPage;

  return jsonOk(
    {
      products: filtered.slice(startIndex, startIndex + perPage),
      total,
      page: currentPage,
      per_page: perPage,
      total_pages: totalPages,
    },
    requestId,
  );
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = productInputSchema.parse(await readJsonBody(request, 30_000));
  const product = await createProduct(database, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'product.created',
    targetType: 'affiliate_product',
    targetId: product.id,
    summary: `Created product "${product.name}"`,
  });

  return jsonOk({ product }, requestId, 201);
});
