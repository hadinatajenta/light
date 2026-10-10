import type { AuthenticatedUser } from '../auth/types';
import { resolveContentDatabase } from '../content/database';
import { type ActivityEvent, insertActivity } from './store';

type ActorIdentity = Pick<ActivityEvent, 'actorId' | 'actorType' | 'actorLabel'>;

export function toUserActor(user: AuthenticatedUser): ActorIdentity {
  return {
    actorId: user.email,
    actorType: 'user',
    actorLabel: user.name || user.email,
  };
}

export async function recordActivity(event: ActivityEvent): Promise<void> {
  const database = await resolveContentDatabase();
  if (!database) {
    return;
  }

  try {
    await insertActivity(database, event);
  } catch (error) {
    console.error('Failed to record activity', event.action, error);
  }
}
