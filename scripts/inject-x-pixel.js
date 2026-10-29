#!/usr/bin/env node
/**
 * The X (Twitter) conversion pixel is no longer injected into HTML.
 * js/posthog-optimiser.js loads it only after cookie consent, and only
 * on /boiler-optimiser/ and /boiler-optimiser-advance-power-output/.
 *
 * This module still exports injectXPixel() so page generators keep
 * working: it now strips any leftover inline snippet instead of adding one.
 *
 *   node scripts/inject-x-pixel.js
 *   node scripts/inject-x-pixel.js --check
 */
"use strict";

const { stripPixel, stillHasPixel, main } = require("./strip-x-pixel");

function injectXPixel(html) {
    const result = stripPixel(html);
    return { html: result.html, status: result.changed ? "stripped" : "already" };
}

module.exports = { injectXPixel, stripPixel, stillHasPixel, main };

if (require.main === module) {
    main();
}
