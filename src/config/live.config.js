/* ================================================================ *
 *  live.config.js — where the dashboards get their data
 *
 *  DEFAULT: the site generates every curve locally from the seeds in
 *  dashboards.config.js (works offline, no setup, looks real).
 *
 *  SWITCH TO REAL DATA: run your scraper (see scripts/scraper.py) and
 *  commit its output to  public/data/telemetry.json.  Set MODE to
 *  'file' and the dashboard reads that file instead of generating.
 *
 *  The header pill shows which mode is live, so you always know whether
 *  a number came from your scraper or from the simulator.
 * ================================================================ */

export const MODE = 'sim'; // 'sim' | 'file'

/* path is resolved against import.meta.env.BASE_URL, so it works both
   at /nurasik14/ on Pages and at / in local dev */
export const DATA_PATH = 'data/telemetry.json';

/* how long to wait for the scraper's file before falling back to sim.
   Keep it short: a static host either has the file or it does not. */
export const FETCH_TIMEOUT_MS = 2500;

/* Re-read the file every N ms. 0 = load once at mount.
   This is what makes the "live" tick real when your scraper commits
   frequently (e.g. every 5 min from a cron job). */
export const POLL_MS = 0;