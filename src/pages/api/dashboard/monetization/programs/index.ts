import { recordActivity, toUserActor } from '@/lib/activity/record';
import { createProgram, listProgramsWithCounts, programCreateSchema } from '@/lib/affiliate/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const programs = await listProgramsWithCounts(database);

  return jsonOk({ programs }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = programCreateSchema.parse(await readJsonBody(request, 20_000));
  const program = await createProgram(database, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'program.created',
    targetType: 'affiliate_program',
    targetId: program.id,
    summary: `Created affiliate program "${program.name}"`,
  });

  return jsonOk({ program }, requestId, 201);
});
