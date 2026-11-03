/**
 * Same-origin Boiler Optimiser feedback + anonymous event collector.
 * POST /api/optimiser-feedback    → D1 optimiser_feedback (Europe/London day)
 * GET  /api/optimiser-feedbacks   → JSON dump (Bearer LIST_SECRET); merges legacy KV + D1
 * POST /api/optimiser-event       → D1 optimiser_events (allowlisted fields)
 *
 * Cookieless: does not set cookies, does not read client identifiers,
 * and does not persist IP / UA / fingerprints / country.
 *
 * Entry module exports only the default handler — wrangler/workerd treats
 * other named exports on this file as handlers. There is no cron trigger
 * (free-plan slot limit); the 400-day D1 purge runs on the first POST to
 * /api/optimiser-event in each isolate, at most once per London day.
 */

import { handleFetch } from "./lib.js";

export default {
  /**
   * @param {Request} request
   * @param {{ REQUESTS?: { get: Function, put: Function }, DB?: { prepare: Function }, LIST_SECRET?: string }} env
   * @param {{ waitUntil?: Function }} [ctx]
   */
  async fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  },
};
