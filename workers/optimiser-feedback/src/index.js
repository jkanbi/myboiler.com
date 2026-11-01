/**
 * Same-origin Boiler Optimiser feedback collector.
 * POST /api/optimiser-feedback    → Workers KV (daily list, Europe/London)
 * GET  /api/optimiser-feedbacks   → JSON dump (Bearer LIST_SECRET)
 *
 * Cookieless: does not set cookies, does not read client identifiers,
 * and does not persist IP / UA / fingerprints.
 */

import { handleFetch } from "./lib.js";

export default {
  /**
   * @param {Request} request
   * @param {{ REQUESTS?: { get: Function, put: Function }, LIST_SECRET?: string }} env
   */
  async fetch(request, env) {
    return handleFetch(request, env);
  },
};
