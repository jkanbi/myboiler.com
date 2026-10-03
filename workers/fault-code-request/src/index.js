/**
 * Same-origin missing fault-code request collector.
 * POST /api/fault-code-request   → Workers KV (daily list, Europe/London)
 * GET  /api/fault-code-requests  → JSON dump (Bearer LIST_SECRET)
 *
 * Cookieless: does not set cookies, does not read client identifiers,
 * and does not persist IP / UA / fingerprints.
 *
 * This Worker does not send email. Another bot GETs the list and emails
 * the daily digest.
 *
 * Entry module exports only the default handler — wrangler/workerd treats
 * other named exports on this file as handlers.
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
