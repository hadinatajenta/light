import { recordActivity, toUserActor } from '@/lib/activity/record';
import { deleteProgram, programInputSchema, updateProgram } from '@/lib/affiliate/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The program id is required.');
  }

  return id;
}

export const PUT = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const payload = programInputSchema.parse(await readJsonBody(request, 20_000));
  const program = await updateProgram(database, id, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'program.updated',
    targetType: 'affiliate_program',
    targetId: program.id,
    summary: `Updated affiliate program "${program.name}"`,
  });

  return jsonOk({ program }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const program = await deleteProgram(database, id);

  await recordActivity({
    ...toUserActor(user),
    action: 'program.deleted',
    targetType: 'affiliate_program',
    targetId: program.id,
    summary: `Deleted affiliate program "${program.name}"`,
  });

  return jsonOk({ id, deleted: true }, requestId);
});
