/**
 * Shared calculator field helpers:
 * - two-way sync for .input-combo (number + range)
 * - optional non-linear slider maps via data-scale
 * - slider fill
 */
(function () {
    function fillSlider(slider) {
        if (!slider || slider.type !== "range") return;
        var min = parseFloat(slider.min);
        var max = parseFloat(slider.max);
        var value = parseFloat(slider.value);
        if (!isFinite(min) || !isFinite(max) || max === min) return;
        var pct = ((value - min) / (max - min)) * 100;
        slider.style.background =
            "linear-gradient(to right, var(--accent) 0%, var(--accent) " +
            pct +
            "%, var(--border) " +
            pct +
            "%)";
    }

    /**
     * Home-biased volume: first 75% of the track is 10–500 L (typical cylinders),
     * last 25% is 500–5000 L (light commercial). Slider position is 0–1000.
     */
    var SCALES = {
        "volume-home": {
            toValue: function (pos) {
                var p = pos / 1000;
                if (p <= 0.75) {
                    return Math.round(10 + (500 - 10) * (p / 0.75));
                }
                return Math.round(500 + (5000 - 500) * ((p - 0.75) / 0.25));
            },
            toPos: function (value) {
                var v = clamp(value, 10, 5000);
                if (v <= 500) {
                    return Math.round(((v - 10) / (500 - 10)) * 750);
                }
                return Math.round(750 + ((v - 500) / (5000 - 500)) * 250);
            }
        }
    };

    function clamp(value, min, max) {
        if (!isFinite(value)) return min;
        if (isFinite(min) && value < min) return min;
        if (isFinite(max) && value > max) return max;
        return value;
    }

    function snap(value, step) {
        if (!isFinite(step) || step <= 0) return value;
        var decimals = ((String(step).split(".")[1] || "").replace(/0+$/, "") || "").length;
        return parseFloat((Math.round(value / step) * step).toFixed(decimals));
    }

    function parseStep(stepAttr) {
        var step = parseFloat(stepAttr);
        return isFinite(step) && step > 0 ? step : 1;
    }

    function wireCombo(combo) {
        var number = combo.querySelector('input[type="number"]');
        var range = combo.querySelector('input[type="range"]');
        if (!number || !range) return;

        var scale = SCALES[combo.getAttribute("data-scale") || range.getAttribute("data-scale")];
        var step = parseStep(number.step || range.step);
        var min = parseFloat(number.min);
        var max = parseFloat(number.max);
        if (!isFinite(min)) min = parseFloat(range.min);
        if (!isFinite(max)) max = parseFloat(range.max);

        if (!scale) {
            if (number.min === "" && isFinite(parseFloat(range.min))) number.min = range.min;
            if (number.max === "" && isFinite(parseFloat(range.max))) number.max = range.max;
            if ((number.step === "" || number.step === "any") && range.step) number.step = range.step;
            min = parseFloat(number.min);
            max = parseFloat(number.max);
            step = parseStep(number.step || range.step);
        }

        function applyNumber(raw, dispatchRange) {
            var value = snap(clamp(parseFloat(raw), min, max), step);
            if (!isFinite(value)) return;
            if (number.value !== String(value)) number.value = String(value);
            if (scale) {
                var pos = String(scale.toPos(value));
                if (range.value !== pos) range.value = pos;
            } else if (range.value !== String(value)) {
                range.value = String(value);
            }
            fillSlider(range);
            if (dispatchRange) {
                range.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }

        function applyRange(dispatchNumber) {
            var value = scale ? scale.toValue(parseFloat(range.value)) : parseFloat(range.value);
            value = snap(clamp(value, min, max), step);
            if (number.value !== String(value)) number.value = String(value);
            fillSlider(range);
            if (dispatchNumber) {
                number.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }

        var syncing = false;
        applyNumber(number.value || range.value, false);
        fillSlider(range);

        number.addEventListener("input", function () {
            if (syncing || number.value === "") return;
            syncing = true;
            applyNumber(number.value, true);
            syncing = false;
        });
        number.addEventListener("change", function () {
            if (syncing) return;
            syncing = true;
            applyNumber(number.value, true);
            syncing = false;
        });
        range.addEventListener("input", function () {
            if (syncing) return;
            syncing = true;
            applyRange(true);
            syncing = false;
        });
        range.addEventListener("change", function () {
            if (syncing) return;
            syncing = true;
            applyRange(true);
            syncing = false;
        });
    }

    function init() {
        document.querySelectorAll(".input-combo").forEach(wireCombo);
        document.querySelectorAll("input.input-slider[type='range']").forEach(fillSlider);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
