/**
 * Rows the auto-fix engine merged away are archived (archivedAt set, active
 * false), never deleted. Readers that list setup data regardless of `active`
 * add this to their where clause (inside AND, so it combines with any OR).
 *
 * MongoDB distinguishes an explicit null from a missing field; rows written
 * before archiving existed have no archivedAt at all.
 */
export const NOT_ARCHIVED: { OR: ({ archivedAt: null } | { archivedAt: { isSet: boolean } })[] } = {
  OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }],
};
