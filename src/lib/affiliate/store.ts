import { z } from 'astro/zod';
import {
  AFFILIATE_DISCLOSURE_SETTING,
  type AffiliateNetwork,
  type AffiliateProgram,
  type AffiliateStatus,
} from '@/config/monetization';
import { ApiError } from '../errors';
import { getSetting } from '../settings/store';
import { buildAffiliateUrl, isSafeLinkTemplate, isSafeTarget, isSafeTrackingId } from './links';
import { readAffiliateLinksEnabled } from './settings';

export const AFFILIATE_NETWORKS = [
  'amazon',
  'impact',
  'partnerstack',
  'shareasale',
  'direct',
] as const;

export const AFFILIATE_STATUSES = ['pending', 'approved', 'paused'] as const;

export const AFFILIATE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MAX_PRODUCT_TOPICS = 12;

const SLUG_MESSAGE = 'Use lowercase letters, numbers, and hyphens.';

const affiliateSlugSchema = z.string().max(60).regex(AFFILIATE_SLUG_PATTERN, SLUG_MESSAGE);

function emptyToNull(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function uppercaseOrNull(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null;
  }

  return value.toUpperCase();
}

function isSafeImageUrl(value: string | null): boolean {
  if (value === null) {
    return true;
  }

  if (value.startsWith('/')) {
    return !value.startsWith('//');
  }

  return value.startsWith('https://') || value.startsWith('http://');
}

const trackingIdSchema = z
  .string()
  .max(120)
  .nullable()
  .transform(emptyToNull)
  .refine(
    (value) => value === null || isSafeTrackingId(value),
    'Use letters, numbers, hyphens, or underscores.',
  )
  .default(null);

const linkTemplateSchema = z
  .string()
  .max(500)
  .nullable()
  .transform(emptyToNull)
  .refine(
    (value) => value === null || isSafeLinkTemplate(value),
    'Use an http or https URL that contains {target} and {trackingId}.',
  )
  .default(null);

export const programInputSchema = z.object({
  name: z.string().min(2).max(80),
  network: z.enum(AFFILIATE_NETWORKS),
  trackingId: trackingIdSchema,
  linkTemplate: linkTemplateSchema,
  status: z.enum(AFFILIATE_STATUSES),
  disclosure: z.string().max(1000).default(''),
});

export const programCreateSchema = programInputSchema.extend({
  id: affiliateSlugSchema,
});

export const productInputSchema = z
  .object({
    slug: affiliateSlugSchema,
    name: z.string().min(2).max(120),
    programId: affiliateSlugSchema,
    target: z
      .string()
      .min(1)
      .max(500)
      .refine(isSafeTarget, 'The target contains unsupported characters.'),
    priceAmount: z.number().nonnegative().max(1_000_000).nullable().default(null),
    priceCurrency: z
      .string()
      .regex(/^([A-Za-z]{3})?$/, 'Use a 3 letter currency code.')
      .nullable()
      .transform(uppercaseOrNull)
      .default(null),
    imageUrl: z
      .string()
      .max(500)
      .nullable()
      .transform(emptyToNull)
      .refine(isSafeImageUrl, 'Use an http or https URL, or a path that starts with a slash.')
      .default(null),
    topics: z
      .array(z.string().max(60).regex(AFFILIATE_SLUG_PATTERN, SLUG_MESSAGE))
      .max(MAX_PRODUCT_TOPICS)
      .default([]),
    notes: z.string().max(1000).nullable().transform(emptyToNull).default(null),
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) => (value.priceAmount === null) === (value.priceCurrency === null),
    'Provide both a price and a currency, or neither.',
  );

export type ProgramInput = z.infer<typeof programInputSchema>;
export type ProgramCreateInput = z.infer<typeof programCreateSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;

export interface AffiliateProduct {
  id: string;
  slug: string;
  name: string;
  programId: string;
  target: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  imageUrl: string | null;
  notes: string | null;
  topics: string[];
  isActive: boolean;
  lastCheckedAt: string | null;
}

export interface AffiliateProgramCounts {
  productCount: number;
  activeProductCount: number;
}

export type AffiliateProgramWithCounts = AffiliateProgram & AffiliateProgramCounts;

export interface ProductCatalogEntry extends AffiliateProduct {
  programName: string;
  affiliateUrl: string | null;
  referenceCount: number;
}

export interface BrokenProductReference {
  postId: string;
  postTitle: string;
  slug: string;
}

export interface TopProduct {
  productId: string;
  slug: string;
  name: string;
  clicks: number;
}

export interface ProductListOptions {
  activeOnly?: boolean;
}

interface ProgramRow {
  id: string;
  name: string;
  network: string;
  tracking_id: string | null;
  link_template: string | null;
  status: string;
  disclosure: string;
}

interface ProgramCountRow extends ProgramRow {
  product_count: number;
  active_product_count: number;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  program_id: string;
  target: string;
  price_amount: number | null;
  price_currency: string | null;
  image_url: string | null;
  notes: string | null;
  topics: string;
  is_active: number;
  last_checked_at: string | null;
}

interface CountRow {
  total: number;
}

interface TopProductRow {
  product_id: string;
  slug: string;
  name: string;
  clicks: number;
}

interface PublishedPostRow {
  id: string;
  title: string;
  body: string;
}

const PRODUCT_REFERENCE_PATTERN = /product:([a-z0-9]+(?:-[a-z0-9]+)*)/g;

function parseTopics(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function toProgram(row: ProgramRow): AffiliateProgram {
  return {
    id: row.id,
    name: row.name,
    network: row.network as AffiliateNetwork,
    trackingId: row.tracking_id,
    linkTemplate: row.link_template,
    status: row.status as AffiliateStatus,
    disclosure: row.disclosure,
  };
}

function toProduct(row: ProductRow): AffiliateProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    programId: row.program_id,
    target: row.target,
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    imageUrl: row.image_url,
    notes: row.notes,
    topics: parseTopics(row.topics),
    isActive: row.is_active === 1,
    lastCheckedAt: row.last_checked_at,
  };
}

export async function listPrograms(db: D1Database): Promise<AffiliateProgram[]> {
  const result = await db
    .prepare('SELECT * FROM affiliate_programs ORDER BY name ASC')
    .all<ProgramRow>();
  return (result.results ?? []).map(toProgram);
}

export async function listProgramsWithCounts(
  db: D1Database,
): Promise<AffiliateProgramWithCounts[]> {
  const result = await db
    .prepare(
      `SELECT p.id, p.name, p.network, p.tracking_id, p.link_template, p.status, p.disclosure,
              COUNT(pr.id) AS product_count,
              COALESCE(SUM(pr.is_active), 0) AS active_product_count
       FROM affiliate_programs p
       LEFT JOIN affiliate_products pr ON pr.program_id = p.id
       GROUP BY p.id, p.name, p.network, p.tracking_id, p.link_template, p.status, p.disclosure
       ORDER BY p.name ASC`,
    )
    .all<ProgramCountRow>();

  return (result.results ?? []).map((row) => ({
    ...toProgram(row),
    productCount: row.product_count,
    activeProductCount: row.active_product_count,
  }));
}

export async function getProgram(db: D1Database, id: string): Promise<AffiliateProgram> {
  const row = await db
    .prepare('SELECT * FROM affiliate_programs WHERE id = ?')
    .bind(id)
    .first<ProgramRow>();

  if (!row) {
    throw new ApiError(404, 'PROGRAM_NOT_FOUND', 'That program does not exist.');
  }

  return toProgram(row);
}

export async function createProgram(
  db: D1Database,
  input: ProgramCreateInput,
): Promise<AffiliateProgram> {
  const existing = await db
    .prepare('SELECT id FROM affiliate_programs WHERE id = ?')
    .bind(input.id)
    .first();

  if (existing) {
    throw new ApiError(409, 'PROGRAM_EXISTS', 'A program with that id already exists.');
  }

  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO affiliate_programs (id, name, network, tracking_id, link_template, status,
        disclosure, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.name,
      input.network,
      input.trackingId,
      input.linkTemplate,
      input.status,
      input.disclosure,
      now,
      now,
    )
    .run();

  return getProgram(db, input.id);
}

export async function updateProgram(
  db: D1Database,
  id: string,
  input: ProgramInput,
): Promise<AffiliateProgram> {
  await getProgram(db, id);

  await db
    .prepare(
      `UPDATE affiliate_programs SET name = ?, network = ?, tracking_id = ?, link_template = ?,
        status = ?, disclosure = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      input.name,
      input.network,
      input.trackingId,
      input.linkTemplate,
      input.status,
      input.disclosure,
      new Date().toISOString(),
      id,
    )
    .run();

  return getProgram(db, id);
}

export async function countProgramProducts(db: D1Database, programId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS total FROM affiliate_products WHERE program_id = ?')
    .bind(programId)
    .first<CountRow>();

  return row?.total ?? 0;
}

export async function deleteProgram(db: D1Database, id: string): Promise<AffiliateProgram> {
  const program = await getProgram(db, id);
  const productCount = await countProgramProducts(db, id);

  if (productCount > 0) {
    throw new ApiError(
      409,
      'PROGRAM_IN_USE',
      `This program is still referenced by ${productCount} product(s). Delete or reassign them first.`,
    );
  }

  await db.prepare('DELETE FROM affiliate_programs WHERE id = ?').bind(id).run();

  return program;
}

export async function listProducts(
  db: D1Database,
  options: ProductListOptions = {},
): Promise<AffiliateProduct[]> {
  const where = options.activeOnly ? 'WHERE is_active = 1' : '';
  const result = await db
    .prepare(`SELECT * FROM affiliate_products ${where} ORDER BY name ASC`)
    .all<ProductRow>();

  return (result.results ?? []).map(toProduct);
}

export async function listProductSlugs(db: D1Database): Promise<Set<string>> {
  const result = await db.prepare('SELECT slug FROM affiliate_products').all<{ slug: string }>();
  return new Set((result.results ?? []).map((row) => row.slug));
}

export async function getProduct(db: D1Database, identifier: string): Promise<AffiliateProduct> {
  const row = await db
    .prepare('SELECT * FROM affiliate_products WHERE id = ? OR slug = ?')
    .bind(identifier, identifier)
    .first<ProductRow>();

  if (!row) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'That product does not exist.');
  }

  return toProduct(row);
}

export async function createProduct(
  db: D1Database,
  input: ProductInput,
): Promise<AffiliateProduct> {
  await getProgram(db, input.programId);

  const existing = await db
    .prepare('SELECT id FROM affiliate_products WHERE slug = ?')
    .bind(input.slug)
    .first();

  if (existing) {
    throw new ApiError(409, 'SLUG_TAKEN', 'A product with that slug already exists.');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO affiliate_products (id, slug, name, program_id, target, price_amount,
        price_currency, image_url, notes, topics, is_active, last_checked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      input.slug,
      input.name,
      input.programId,
      input.target,
      input.priceAmount,
      input.priceCurrency,
      input.imageUrl,
      input.notes,
      JSON.stringify(input.topics),
      input.isActive ? 1 : 0,
      now,
      now,
    )
    .run();

  return getProduct(db, id);
}

export async function updateProduct(
  db: D1Database,
  identifier: string,
  input: ProductInput,
): Promise<AffiliateProduct> {
  const product = await getProduct(db, identifier);
  await getProgram(db, input.programId);

  const conflict = await db
    .prepare('SELECT id FROM affiliate_products WHERE slug = ? AND id != ?')
    .bind(input.slug, product.id)
    .first();

  if (conflict) {
    throw new ApiError(409, 'SLUG_TAKEN', 'Another product already uses that slug.');
  }

  await db
    .prepare(
      `UPDATE affiliate_products SET slug = ?, name = ?, program_id = ?, target = ?,
        price_amount = ?, price_currency = ?, image_url = ?, notes = ?, topics = ?, is_active = ?,
        updated_at = ? WHERE id = ?`,
    )
    .bind(
      input.slug,
      input.name,
      input.programId,
      input.target,
      input.priceAmount,
      input.priceCurrency,
      input.imageUrl,
      input.notes,
      JSON.stringify(input.topics),
      input.isActive ? 1 : 0,
      new Date().toISOString(),
      product.id,
    )
    .run();

  return getProduct(db, product.id);
}

export async function deleteProduct(db: D1Database, identifier: string): Promise<AffiliateProduct> {
  const product = await getProduct(db, identifier);
  await db.prepare('DELETE FROM affiliate_products WHERE id = ?').bind(product.id).run();

  return product;
}

export async function countProductsWithoutProgram(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM affiliate_products p
       LEFT JOIN affiliate_programs g ON g.id = p.program_id
       WHERE g.id IS NULL`,
    )
    .first<CountRow>();

  return row?.total ?? 0;
}

export async function countInactiveProducts(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS total FROM affiliate_products WHERE is_active = 0')
    .first<CountRow>();

  return row?.total ?? 0;
}

export async function listTopProducts(db: D1Database, limit = 10): Promise<TopProduct[]> {
  const bounded = Math.min(Math.max(limit, 1), 50);
  const result = await db
    .prepare(
      `SELECT c.product_id, p.slug, p.name, COUNT(*) AS clicks
       FROM clicks c
       JOIN affiliate_products p ON p.id = c.product_id
       GROUP BY c.product_id, p.slug, p.name
       ORDER BY clicks DESC, p.name ASC
       LIMIT ?`,
    )
    .bind(bounded)
    .all<TopProductRow>();

  return (result.results ?? []).map((row) => ({
    productId: row.product_id,
    slug: row.slug,
    name: row.name,
    clicks: row.clicks,
  }));
}

export async function countClicksSince(db: D1Database, sinceIso: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS total FROM clicks WHERE created_at >= ?')
    .bind(sinceIso)
    .first<CountRow>();

  return row?.total ?? 0;
}

export function extractProductSlugs(body: string): string[] {
  const slugs = new Set<string>();

  for (const match of body.matchAll(PRODUCT_REFERENCE_PATTERN)) {
    slugs.add(match[1]);
  }

  return [...slugs];
}

export async function listPublishedPostBodies(db: D1Database): Promise<PublishedPostRow[]> {
  const result = await db
    .prepare("SELECT id, title, body FROM posts WHERE status = 'published' ORDER BY title ASC")
    .all<PublishedPostRow>();

  return result.results ?? [];
}

export async function countProductReferences(db: D1Database): Promise<Map<string, number>> {
  const posts = await listPublishedPostBodies(db);
  const counts = new Map<string, number>();

  for (const post of posts) {
    for (const slug of extractProductSlugs(post.body)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  return counts;
}

export async function findBrokenProductReferences(
  db: D1Database,
  knownSlugs: Set<string>,
): Promise<BrokenProductReference[]> {
  const posts = await listPublishedPostBodies(db);
  const broken: BrokenProductReference[] = [];

  for (const post of posts) {
    for (const slug of extractProductSlugs(post.body)) {
      if (!knownSlugs.has(slug)) {
        broken.push({ postId: post.id, postTitle: post.title, slug });
      }
    }
  }

  return broken;
}

export interface AffiliateContext {
  links: Map<string, string>;
  disclosure: string;
  products: AffiliateProduct[];
}

export async function loadAffiliateContext(db: D1Database): Promise<AffiliateContext> {
  const enabled = await readAffiliateLinksEnabled(db);

  if (!enabled) {
    return { links: new Map<string, string>(), products: [], disclosure: '' };
  }

  const [programs, products, storedDisclosure] = await Promise.all([
    listPrograms(db),
    listProducts(db, { activeOnly: true }),
    getSetting(db, AFFILIATE_DISCLOSURE_SETTING),
  ]);

  const programById = new Map(programs.map((program) => [program.id, program]));
  const links = new Map<string, string>();
  const linkable: AffiliateProduct[] = [];
  const disclosures = new Set<string>();

  for (const product of products) {
    const program = programById.get(product.programId);
    if (!program) {
      continue;
    }

    const url = buildAffiliateUrl(program, product.target);
    if (!url) {
      continue;
    }

    links.set(product.slug, url);
    linkable.push(product);

    if (program.disclosure) {
      disclosures.add(program.disclosure);
    }
  }

  const disclosure = (storedDisclosure ?? '').trim();

  return {
    links,
    products: linkable,
    disclosure: disclosure === '' ? [...disclosures].join(' ') : disclosure,
  };
}
