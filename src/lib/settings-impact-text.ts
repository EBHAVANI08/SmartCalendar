/**
 * One sentence for the toast after a setting is saved (client-safe: no
 * database). Example: "Draft v7 now has 3 problem(s); the live timetable v6
 * has 5. Open the Timetable Studio to fix only the affected lessons."
 */
type Version = { version: number; problems: number } | null | undefined;

export function impactText(impact: { draft?: Version; live?: Version } | null | undefined): string | null {
  if (!impact) return null;
  const parts: string[] = [];
  if (impact.draft && impact.draft.problems > 0) parts.push(`draft v${impact.draft.version} now has ${impact.draft.problems} problem(s)`);
  if (impact.live && impact.live.problems > 0) parts.push(`the live timetable v${impact.live.version} has ${impact.live.problems}`);
  if (!parts.length) return null;
  const sentence = parts.join('; ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. Open the Timetable Studio to fix only the affected lessons.`;
}
