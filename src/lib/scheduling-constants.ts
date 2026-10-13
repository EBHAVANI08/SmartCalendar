/**
 * The only constants scheduling code may use that do not come from a school's
 * own settings. Each is a technical bound, not a school policy: periods per
 * day, times, breaks, quotas and workload caps always come from the database.
 */

/**
 * Shortest teaching period the bell schedule accepts. Below this the start and
 * end times cannot hold the configured periods and breaks, which is reported
 * as a setup error instead of silently stretching the day.
 */
export const MIN_PERIOD_MINUTES = 20;

/**
 * Auto-fix: a grade's subject rows are treated as auto-created only when at
 * least this many share identical settings and none was ever edited. Fewer
 * rows are too weak a signal to change anything.
 */
export const AUTO_CREATED_MIN_ROWS = 3;

/**
 * Auto-fix: a row counts as "never edited" when its updatedAt is within this
 * many milliseconds of its createdAt (the two are written in the same insert).
 */
export const UNEDITED_TOLERANCE_MS = 2000;

/** Auto-fix: safety stop for the fix-until-stable loop of one rule. */
export const AUTOFIX_MAX_ITERATIONS = 500;

/**
 * Auto-fix: a database transaction interrupted by the network is rolled back
 * and tried again, up to this many attempts in total.
 */
export const AUTOFIX_TRANSACTION_ATTEMPTS = 4;

/** Auto-fix: pause before a retry, multiplied by the attempt number. */
export const AUTOFIX_RETRY_DELAY_MS = 750;

/**
 * Solver: how many slots the repair step may try (moving the lessons that
 * block a slot elsewhere) for one lesson that found no free slot. Bounds run
 * time; a lesson still unplaced after this is reported as unallocated.
 */
export const SOLVER_REPAIR_ATTEMPTS_PER_LESSON = 400;

/**
 * Solver: independent attempts (different seeds) per generation; the attempt
 * that places the most lessons wins. Stops early once everything is placed.
 */
export const SOLVER_RESTARTS = 8;

/**
 * Solver: soft-score bonus for placing a lesson in the slot it had before a
 * settings change (larger than every other soft preference combined for one
 * slot), so rearranging a class after a change moves as few lessons as possible.
 */
export const PREVIOUS_SLOT_BONUS = 200;
