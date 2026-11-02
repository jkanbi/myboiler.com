/**
 * Same-origin Boiler Optimiser feedback + anonymous event collector.
 * POST /api/optimiser-feedback    → Workers KV (daily list, Europe/London)
 * GET  /api/optimiser-feedbacks   → JSON dump (Bearer LIST_SECRET)
 * POST /api/optimiser-event       → D1 optimiser_events (allowlisted fields)
 *
 * Cookieless: does not set cookies, does not read client identifiers,
 * and does not persist IP / UA / fingerprints / country.
 *
 * Entry module exports only the default handler — wrangler/workerd treats
 * other named exports on this file as handlers.
 */

import { handleFetch, handleScheduled } from "./lib.js";

export default {
  /**
   * @param {Request} request
   * @param {{ REQUESTS?: { get: Function, put: Function }, DB?: { prepare: Function }, LIST_SECRET?: string }} env
   */
  async fetch(request, env) {
    return handleFetch(request, env);
  },

  /**
   * Daily retention: delete optimiser_events older than 400 days.
   * @param {ScheduledController} _controller
   * @param {{ DB?: { prepare: Function } }} env
   */
  async scheduled(_controller, env) {
    return handleScheduled(env);
  },
};
