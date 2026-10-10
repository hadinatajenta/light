import { z } from 'astro/zod';
import type { AffiliateProgram } from '@/config/monetization';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { isSafeTarget } from '@/lib/affiliate/links';
import {
  AFFILIATE_SLUG_PATTERN,
  createProduct,
  getProgram,
  listProductSlugs,
} from '@/lib/affiliate/store';
import {
  AMAZON_ASIN_PATTERN,
  deriveNameFromAmazonUrl,
  extractAmazonAsin,
} from '@/lib/affiliate/targets';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { toSlug } from '@/lib/content/slug';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const MAX_IMPORT_LINES = 200;

const importRequestSchema = z.object({
  programId: z
    .string()
    .max(60)
    .regex(AFFILIATE_SLUG_PATTERN, 'Use lowercase letters, numbers, and hyphens.'),
  lines: z.union([z.string().max(100_000), z.array(z.string().max(800))]),
});

interface ImportedProductLine {
  slug: string;
  name: string;
  target: string;
}

interface ImportLineOutcome {
  line: number;
  reason: string;
}

type ImportLineResult = { ok: true; value: ImportedProductLine } | { ok: false; reason: string };

function isBareImportTarget(target: string): boolean {
  return target.includes('://') || AMAZON_ASIN_PATTERN.test(target);
}

function resolveImportTarget(
  target: string,
  program: AffiliateProgram,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (program.network !== 'amazon' || !target.includes('://')) {
    return { ok: true, value: target };
  }

  const asin = extractAmazonAsin(target);
  if (!asin) {
    return {
      ok: false,
      reason:
        'Could not find an ASIN in that Amazon URL. Paste the product page URL or the ASIN itself.',
    };
  }

  return { ok: true, value: asin };
}

export function parseImportLine(rawLine: string, program: AffiliateProgram): ImportLineResult {
  const parts = rawLine.split('|').map((part) => part.trim());

  if (parts.length > 3) {
    return { ok: false, reason: 'Use slug | name | target.' };
  }

  if (parts.length === 1) {
    const raw = parts[0];
    const resolved = resolveImportTarget(raw, program);

    if (!resolved.ok) {
      return { ok: false, reason: resolved.reason };
    }

    const target = resolved.value;

    if (program.network !== 'amazon' || !AMAZON_ASIN_PATTERN.test(target)) {
      return { ok: false, reason: 'Use slug | name | target.' };
    }

    const derivedName = deriveNameFromAmazonUrl(raw);

    if (derivedName) {
      const slug = toSlug(derivedName).slice(0, 60).replace(/-+$/, '');

      if (slug.length > 0) {
        return { ok: true, value: { slug, name: derivedName, target } };
      }
    }

    return { ok: true, value: { slug: target.toLowerCase(), name: target.toUpperCase(), target } };
  }

  if (parts.length === 2) {
    const [name, rawTarget] = parts;
    const slug = toSlug(name).slice(0, 60).replace(/-+$/, '');

    if (name.length < 2 || slug.length === 0) {
      return { ok: false, reason: 'Use slug | name | target.' };
    }

    const resolved = resolveImportTarget(rawTarget, program);

    if (!resolved.ok) {
      return { ok: false, reason: resolved.reason };
    }

    if (!isSafeTarget(resolved.value) || !isBareImportTarget(resolved.value)) {
      return { ok: false, reason: 'Use slug | name | target.' };
    }

    return { ok: true, value: { slug, name, target: resolved.value } };
  }

  const [slug, name, rawTarget] = parts;

  if (!AFFILIATE_SLUG_PATTERN.test(slug) || slug.length > 60) {
    return {
      ok: false,
      reason: `Invalid slug "${slug}". Use lowercase letters, numbers, and hyphens.`,
    };
  }

  if (name.length < 2) {
    return { ok: false, reason: 'A name is required.' };
  }

  if (!isSafeTarget(rawTarget)) {
    return { ok: false, reason: 'The target contains unsupported characters.' };
  }

  const resolved = resolveImportTarget(rawTarget, program);

  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }

  return { ok: true, value: { slug, name, target: resolved.value } };
}

function normalizeLines(input: string | string[]): string[] {
  const rawLines = Array.isArray(input) ? input : input.split(/\r?\n/);
  return rawLines.map((line) => line.trim()).filter((line) => line.length > 0);
}

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = importRequestSchema.parse(await readJsonBody(request, 200_000));
  const lines = normalizeLines(payload.lines);

  if (lines.length === 0) {
    throw new ApiError(422, 'EMPTY_IMPORT', 'Add at least one product line.');
  }

  if (lines.length > MAX_IMPORT_LINES) {
    throw new ApiError(
      422,
      'IMPORT_TOO_LARGE',
      `Import at most ${MAX_IMPORT_LINES} lines at once.`,
    );
  }

  const program = await getProgram(database, payload.programId);
  const existingSlugs = await listProductSlugs(database);
  const skipped: ImportLineOutcome[] = [];
  const errors: ImportLineOutcome[] = [];
  let created = 0;

  for (const [index, rawLine] of lines.entries()) {
    const line = index + 1;
    const parsed = parseImportLine(rawLine, program);

    if (!parsed.ok) {
      errors.push({ line, reason: parsed.reason });
      continue;
    }

    if (existingSlugs.has(parsed.value.slug)) {
      skipped.push({ line, reason: `Slug "${parsed.value.slug}" already exists.` });
      continue;
    }

    try {
      const product = await createProduct(database, {
        ...parsed.value,
        programId: program.id,
        priceAmount: null,
        priceCurrency: null,
        imageUrl: null,
        notes: null,
        topics: [],
        isActive: true,
      });

      existingSlugs.add(product.slug);
      created += 1;
    } catch (error) {
      const reason =
        error instanceof ApiError ? error.message : 'The product could not be created.';
      errors.push({ line, reason });
    }
  }

  if (created > 0) {
    await recordActivity({
      ...toUserActor(user),
      action: 'product.imported',
      targetType: 'affiliate_program',
      targetId: program.id,
      summary: `Imported ${created} product(s) into "${program.name}" (${skipped.length} skipped, ${errors.length} failed)`,
    });
  }

  return jsonOk({ created, skipped, errors }, requestId);
});
