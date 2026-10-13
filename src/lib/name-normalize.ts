/**
 * Generic identity keys for master-data names (grades, subjects).
 *
 * Nothing here knows any particular school's names: two names are the same
 * when they differ only in case, spacing, punctuation, "&" vs "and", a
 * grade/class prefix, or Roman vs Arabic numerals.
 */

const GRADE_PREFIX = /^(grade|class|std\.?|standard)\s*[-:.]?\s*/i;
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

/** Strict Roman numeral parse ("IV" → 4); null for anything that is not one. */
export function parseRoman(value: string): number | null {
  const text = value.trim().toLowerCase();
  if (!text || !/^[ivxlcdm]+$/.test(text)) return null;
  let total = 0;
  for (let index = 0; index < text.length; index++) {
    const current = ROMAN_VALUES[text[index]];
    const next = ROMAN_VALUES[text[index + 1]] ?? 0;
    total += current < next ? -current : current;
  }
  // Round-trip check rejects malformed numerals such as "IIII" or "VX".
  return toRoman(total) === text ? total : null;
}

function toRoman(value: number): string {
  const table: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let rest = value;
  let out = '';
  for (const [amount, numeral] of table) {
    while (rest >= amount) { out += numeral; rest -= amount; }
  }
  return out;
}

function collapse(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Identity key for a grade name. "Grade 1", "grade 1", "Class I" and "1" share
 * the key "#1"; named levels ("Nursery", "U.K.G.") key on their collapsed text.
 */
export function gradeKey(value: unknown): string {
  const raw = String(value ?? '').trim();
  const rest = raw.replace(GRADE_PREFIX, '').trim();
  if (/^\d+$/.test(rest)) return `#${Number(rest)}`;
  const roman = parseRoman(rest);
  if (roman !== null) return `#${roman}`;
  return collapse(rest).replace(/\s+/g, '');
}

/** Identity key for a subject name: case, spacing, punctuation and "&"/"and" ignored. */
export function subjectKey(value: unknown): string {
  return collapse(String(value ?? ''));
}

/**
 * Every key a subject name answers to. A trailing all-caps abbreviation in
 * brackets is an alias, so "Environmental Studies (EVS)" also answers to "EVS"
 * and "Environmental Studies". A descriptive bracket ("Science (Practical)") is
 * part of the name and is not split off.
 */
export function subjectKeys(value: unknown): string[] {
  const raw = String(value ?? '').trim();
  const keys = new Set<string>();
  const full = subjectKey(raw);
  if (full) keys.add(full);
  const match = /^(.*?)\s*\(\s*([^()]+?)\s*\)\s*$/.exec(raw);
  if (match && /^[A-Z][A-Z0-9.&]{1,7}$/.test(match[2])) {
    const outside = subjectKey(match[1]);
    const abbreviation = subjectKey(match[2]);
    if (outside) keys.add(outside);
    if (abbreviation) keys.add(abbreviation);
  }
  return [...keys];
}

/** True when two subject names identify the same subject (exact key or bracketed abbreviation). */
export function sameSubject(a: unknown, b: unknown): boolean {
  const left = subjectKeys(a);
  return subjectKeys(b).some((key) => left.includes(key));
}

/** How two subject names relate, for duplicate reports. */
export type SubjectMatch = 'exact' | 'alias' | 'similar' | 'spelling' | null;

const significantWords = (value: unknown) => subjectKey(value).split(' ').filter((word) => word && word !== 'and');

/** True when `short` is written in capitals and spells the initials of `long` ("VE" / "Value Education"). */
function isInitialism(short: unknown, long: unknown): boolean {
  const raw = String(short ?? '').trim();
  if (!/^[A-Z]{2,6}$/.test(raw)) return false;
  const words = significantWords(long);
  return words.length >= 2 && words.map((word) => word[0]).join('') === raw.toLowerCase();
}

/** Levenshtein distance, stopping early once it exceeds `limit`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * - exact: same key (case/spacing/punctuation/"&" only). Safe to merge automatically.
 * - alias: a bracketed abbreviation, or capitals spelling the other's initials.
 * - similar: one name's words start the other's ("Art" / "Art & Craft").
 * - spelling: one letter apart (two in names of 10+ letters), e.g. a typo.
 * Only "exact" is ever merged without confirmation.
 */
export function compareSubjects(a: unknown, b: unknown): SubjectMatch {
  const keyA = subjectKey(a);
  const keyB = subjectKey(b);
  if (keyA && keyA === keyB) return 'exact';
  if (sameSubject(a, b) || isInitialism(a, b) || isInitialism(b, a)) return 'alias';
  // Similar: the shorter name is the start of the longer one ("Art" / "Art &
  // Craft"). A shared trailing word ("Science" / "Social Science") is not.
  const left = significantWords(a);
  const right = significantWords(b);
  if (!left.length || !right.length) return null;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  if (short.every((word, index) => long[index] === word)) return 'similar';
  const length = Math.min(keyA.length, keyB.length);
  if (length >= 5) {
    const limit = length >= 10 ? 2 : 1;
    if (editDistance(keyA, keyB, limit) <= limit) return 'spelling';
  }
  return null;
}

/** First existing name that is the same grade as `candidate`, if any. */
export function findSameGrade(candidate: unknown, existing: Iterable<string>): string | null {
  const key = gradeKey(candidate);
  if (!key) return null;
  for (const name of existing) if (gradeKey(name) === key) return name;
  return null;
}

/** First existing name that is the same subject as `candidate` (exact or alias), if any. */
export function findSameSubject(candidate: unknown, existing: Iterable<string>): string | null {
  for (const name of existing) if (sameSubject(candidate, name)) return name;
  return null;
}
