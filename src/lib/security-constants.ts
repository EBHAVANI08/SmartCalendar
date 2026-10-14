/**
 * Security limits. Technical bounds only (no school data): how many failed
 * sign-ins or reset requests are allowed before a pause, and how long codes
 * and impersonation sessions live.
 */

/** Failed sign-ins per email within the window before that email is paused. */
export const LOGIN_MAX_FAILURES_PER_EMAIL = 5;
/** Failed sign-ins per network address within the window (many emails from one place). */
export const LOGIN_MAX_FAILURES_PER_IP = 30;
/** Window and pause length for failed sign-ins. */
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** Password-reset codes: lifetime, wrong guesses allowed, requests allowed per window. */
export const RESET_CODE_TTL_MS = 15 * 60 * 1000;
export const RESET_CODE_MAX_ATTEMPTS = 5;
export const RESET_REQUESTS_PER_EMAIL = 3;
export const RESET_REQUESTS_PER_IP = 10;
export const RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;

/** How long an owner's saved session lasts while impersonating a school. */
export const IMPERSONATION_TTL_SECONDS = 2 * 60 * 60;
