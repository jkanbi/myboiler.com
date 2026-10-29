#!/usr/bin/env node
/**
 * The X (Twitter) conversion pixel is no longer injected into HTML.
 * js/consent.js loads it only after the visitor accepts cookies.
 *
 * This script now strips any leftover inline snippets, or checks that
 * none remain:
 *   node scripts/inject-x-pixel.js
 *   node scripts/inject-x-pixel.js --check
 */
"use strict";

require("./strip-x-pixel.js");
