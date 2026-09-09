/**
 * Room types, as data.
 *
 * Stage 1 of making rooms a real scheduling concept: a school declares what a
 * room IS and what a subject NEEDS, so "Grade 10 Physics requires a physics lab"
 * is configuration rather than a rule buried in the generator.
 *
 * Nothing here enforces anything yet. Stage 2 adds ROOM_OCCUPIED and
 * ROOM_TYPE_MISMATCH to the shared validator, and is deliberately not started.
 */

export const ROOM_TYPES = [
  { id: 'classroom', label: 'Classroom' },
  { id: 'physics_lab', label: 'Physics Lab' },
  { id: 'chemistry_lab', label: 'Chemistry Lab' },
  { id: 'biology_lab', label: 'Biology Lab' },
  { id: 'computer_lab', label: 'Computer Lab' },
  { id: 'library', label: 'Library' },
  { id: 'music_room', label: 'Music Room' },
  { id: 'art_room', label: 'Art Room' },
  { id: 'auditorium', label: 'Auditorium' },
  { id: 'sports_ground', label: 'Sports Ground' },
  { id: 'multipurpose', label: 'Multipurpose' },
] as const;

export type RoomTypeId = (typeof ROOM_TYPES)[number]['id'];

const TYPE_IDS = new Set<string>(ROOM_TYPES.map((t) => t.id));

export function isKnownRoomType(value: string | null | undefined): value is RoomTypeId {
  return !!value && TYPE_IDS.has(value);
}

export function roomTypeLabel(value: string | null | undefined): string {
  const found = ROOM_TYPES.find((t) => t.id === value);
  if (found) return found.label;
  // Existing rows may carry a free-text type. Show it, do not rewrite it.
  return value ? value.replace(/_/g, ' ') : 'Unspecified';
}

/**
 * Suggest a normalised type from a room's existing free-text name or code.
 *
 * A suggestion only - existing room data is never rewritten automatically.
 * A school may have a library, a music hall and a science lab all typed "classroom";
 * an Admin confirms each one rather than a script guessing on their behalf.
 */
export function suggestRoomType(name: string, code?: string | null): { type: RoomTypeId; confidence: 'high' | 'review' } | null {
  const text = `${name} ${code ?? ''}`.toLowerCase();

  const rules: [RegExp, RoomTypeId, 'high' | 'review'][] = [
    [/\bphysics\b/, 'physics_lab', 'high'],
    [/\bchem(istry)?\b/, 'chemistry_lab', 'high'],
    [/\bbio(logy)?\b/, 'biology_lab', 'high'],
    [/\b(computer|comp\.?\s*lab|cl-|it lab)\b/, 'computer_lab', 'high'],
    [/\blibrar(y|ies)\b/, 'library', 'high'],
    [/\bauditorium|audi\b/, 'auditorium', 'high'],
    [/\b(sports?|playground|ground|field)\b/, 'sports_ground', 'high'],
    [/\bmusic\b/, 'music_room', 'high'],
    [/\bart\b/, 'art_room', 'high'],
    // Generic "lab" or "stem" could be several things; a person decides.
    [/\b(lab|stem)\b/, 'multipurpose', 'review'],
  ];

  for (const [pattern, type, confidence] of rules) {
    if (pattern.test(text)) return { type, confidence };
  }
  return null;
}

/** Parse the stored unavailablePeriods JSON into a day -> periods map. */
export function parseUnavailable(raw: unknown): Record<string, number[]> {
  if (!raw) return {};
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Record<string, number[]> = {};
    for (const [day, periods] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(periods)) {
        const nums = periods.map(Number).filter((n) => Number.isInteger(n) && n > 0);
        if (nums.length) out[day] = nums;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Parse the stored supportedSubjects JSON into a list. */
export function parseSupportedSubjects(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * A legacy synthetic room string such as "R-10A-3", written by the generator
 * before rooms were real. Not a Room id and must never be treated as one.
 */
export function isLegacyRoomString(value: string | null | undefined): boolean {
  if (!value) return false;
  // A real Room id is a 24-character Mongo ObjectId.
  return !/^[0-9a-f]{24}$/i.test(value);
}
