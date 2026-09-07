import { roleOf } from '@/lib/authz';
import { db } from '@/lib/db';

/**
 * The teacher record behind the current request, when the caller IS a teacher.
 *
 * Returns null for admins and owners — they are not "a teacher", and routes
 * should fall through to their school-wide behaviour for those roles.
 *
 * Used to narrow reads to a teacher's own data. A teacher must not be able to
 * read the whole school's timetable, everyone's cover list, or — most sensitive
 * of all — a colleague's leave records and stated reasons.
 */
export async function ownTeacherId(request: Request, schoolId: string): Promise<string | null> {
  if (roleOf(request) !== 'teacher') return null;

  const userId = request.headers.get('x-user-id');
  const email = request.headers.get('x-user-email');

  if (userId) {
    const byId = await db.teacher.findFirst({ where: { id: userId, schoolId }, select: { id: true } });
    if (byId) return byId.id;
  }
  if (email) {
    const byEmail = await db.teacher.findFirst({ where: { email, schoolId }, select: { id: true } });
    if (byEmail) return byEmail.id;
  }
  // A teacher session we cannot resolve to a record gets nothing, not everything.
  return '__unresolved__';
}
