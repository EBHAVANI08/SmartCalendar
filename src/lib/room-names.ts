import { db } from '@/lib/db';

/**
 * Adds `roomName` to timetable rows whose roomId is one of the school's rooms.
 * Rows from the legacy generator carry made-up room labels instead of ids;
 * those are left as they are (roomName = the label).
 */
export async function withRoomNames<T extends { roomId?: string | null }>(schoolId: string, rows: T[]): Promise<(T & { roomName: string | null })[]> {
  const ids = [...new Set(rows.map((r) => r.roomId).filter((id): id is string => Boolean(id) && /^[0-9a-f]{24}$/i.test(id!)))];
  const rooms = ids.length ? await db.room.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(rooms.map((r) => [r.id, r.name]));
  return rows.map((row) => ({ ...row, roomName: row.roomId ? names.get(row.roomId) ?? row.roomId : null }));
}
