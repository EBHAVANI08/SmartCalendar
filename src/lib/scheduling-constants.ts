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
