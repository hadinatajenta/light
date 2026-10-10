import type { AffiliateNetwork, AffiliateProgram, AffiliateStatus } from '@/config/monetization';
import { buildAffiliateUrl } from './links';

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
  };
}

export async function listPrograms(db: D1Database): Promise<AffiliateProgram[]> {
  const result = await db
    .prepare('SELECT * FROM affiliate_programs ORDER BY name ASC')
    .all<ProgramRow>();
  return (result.results ?? []).map(toProgram);
}

export async function listProducts(db: D1Database): Promise<AffiliateProduct[]> {
  const result = await db
    .prepare('SELECT * FROM affiliate_products ORDER BY name ASC')
    .all<ProductRow>();

  return (result.results ?? []).map(toProduct);
}

export interface AffiliateContext {
  links: Map<string, string>;
  disclosure: string;
}

export async function loadAffiliateContext(db: D1Database): Promise<AffiliateContext> {
  const [programs, products] = await Promise.all([listPrograms(db), listProducts(db)]);
  const programById = new Map(programs.map((program) => [program.id, program]));
  const links = new Map<string, string>();
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
    if (program.disclosure) {
      disclosures.add(program.disclosure);
    }
  }

  return { links, disclosure: [...disclosures].join(' ') };
}
