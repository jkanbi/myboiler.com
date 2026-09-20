(function () {
    var INDEX_URL = "/fault-codes/fault-codes-index.json";
    var index = null;
    var loadState = "pending";
    var knownBrands = [];

    function $(id) {
        return document.getElementById(id);
    }

    function normalizeCode(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
    }

    function normalizeQuery(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function brandKey(name) {
        return String(name || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function buildKnownBrands() {
        var map = {};
        var codes = (index && index.codes) || [];
        var brands = (index && index.brands) || [];
        var aliases = (index && index.aliases) || {};
        var i;
        for (i = 0; i < brands.length; i++) {
            map[brandKey(brands[i].brand)] = brands[i].brand;
            if (brands[i].name) map[brandKey(brands[i].name)] = brands[i].brand;
        }
        for (i = 0; i < codes.length; i++) {
            map[brandKey(codes[i].brand)] = codes[i].brand;
        }
        Object.keys(aliases).forEach(function (alias) {
            map[brandKey(alias)] = aliases[alias];
        });
        knownBrands = Object.keys(map)
            .map(function (key) {
                return { key: key, brand: map[key] };
            })
            .sort(function (a, b) {
                return b.key.length - a.key.length;
            });
    }

    function parseQuery(raw) {
        var query = normalizeQuery(raw);
        if (!query) return { brand: "", codeQuery: "", codeNorm: "", text: "" };

        for (var i = 0; i < knownBrands.length; i++) {
            var item = knownBrands[i];
            if (query === item.key) {
                return { brand: item.brand, codeQuery: "", codeNorm: "", text: "" };
            }
            if (query.indexOf(item.key + " ") === 0) {
                var rest = query.slice(item.key.length + 1).trim();
                return {
                    brand: item.brand,
                    codeQuery: rest,
                    codeNorm: normalizeCode(rest),
                    text: rest,
                };
            }
        }

        return {
            brand: "",
            codeQuery: query,
            codeNorm: normalizeCode(query),
            text: query,
        };
    }

    function codeParts(entry) {
        return String(entry.code || "")
            .split(/[,\/\s]+/)
            .map(normalizeCode)
            .filter(Boolean);
    }

    function looksLikeCode(value) {
        var n = normalizeCode(value);
        if (!n) return false;
        if (/[0-9]/.test(n)) return true;
        return /^(ea|fd|fa|com|sr|err|er)$/i.test(n);
    }

    function searchCodes(raw) {
        if (!index || !index.codes) return { kind: "empty", items: [] };
        var parsed = parseQuery(raw);
        if (!parsed.brand && !parsed.codeNorm && !parsed.text) {
            return { kind: "empty", items: [] };
        }

        if (parsed.brand && !parsed.codeNorm) {
            var brandPages = (index.brands || []).filter(function (b) {
                return b.brand === parsed.brand;
            });
            return { kind: "brand", brand: parsed.brand, items: brandPages };
        }

        var exact = [];
        var prefix = [];
        var textHits = [];
        var useText = !looksLikeCode(parsed.codeQuery || parsed.text) && (parsed.text || "").length >= 3;

        for (var i = 0; i < index.codes.length; i++) {
            var entry = index.codes[i];
            if (parsed.brand && entry.brand !== parsed.brand) continue;

            if (parsed.codeNorm && looksLikeCode(parsed.codeQuery || parsed.text)) {
                if (entry.codeNorm === parsed.codeNorm) {
                    exact.push(entry);
                    continue;
                }
                var parts = codeParts(entry);
                var partHit = false;
                for (var p = 0; p < parts.length; p++) {
                    if (parts[p] === parsed.codeNorm) {
                        exact.push(entry);
                        partHit = true;
                        break;
                    }
                }
                if (partHit) continue;
                if (
                    parsed.codeNorm.length >= 2 &&
                    (entry.codeNorm.indexOf(parsed.codeNorm) === 0 ||
                        parts.some(function (part) {
                            return part.indexOf(parsed.codeNorm) === 0;
                        }))
                ) {
                    prefix.push(entry);
                }
                continue;
            }

            if (useText) {
                var hay = (
                    entry.code +
                    " " +
                    entry.title +
                    " " +
                    entry.detail +
                    " " +
                    entry.model
                ).toLowerCase();
                if (hay.indexOf(parsed.text) !== -1) textHits.push(entry);
            }
        }

        exact.sort(rankEntries);
        prefix.sort(rankEntries);
        textHits.sort(rankEntries);

        if (exact.length) return { kind: "codes", items: exact.slice(0, 40) };
        if (prefix.length) return { kind: "prefix", items: prefix.slice(0, 40) };
        if (textHits.length) return { kind: "text", items: textHits.slice(0, 40) };
        return { kind: "none", items: [], parsed: parsed };
    }

    function rankEntries(a, b) {
        if (a.deep !== b.deep) return a.deep ? -1 : 1;
        if (a.brand < b.brand) return -1;
        if (a.brand > b.brand) return 1;
        if (a.codeNorm < b.codeNorm) return -1;
        if (a.codeNorm > b.codeNorm) return 1;
        return 0;
    }

    function renderResults(raw) {
        var box = $("fault-code-results");
        if (!box) return;
        var query = String(raw || "").trim();

        if (!query) {
            box.hidden = true;
            box.innerHTML = "";
            return;
        }

        if (loadState === "pending") {
            box.hidden = false;
            box.innerHTML = '<p class="fc-results__status">Loading fault codes…</p>';
            return;
        }

        if (loadState === "failed") {
            box.hidden = false;
            box.innerHTML =
                '<p class="fc-results__status">Could not load the fault-code index. Refresh the page, or browse the A–Z list below.</p>';
            return;
        }

        var result = searchCodes(query);
        if (result.kind === "empty") {
            box.hidden = true;
            box.innerHTML = "";
            return;
        }

        if (result.kind === "brand") {
            if (!result.items.length) {
                box.hidden = false;
                box.innerHTML =
                    '<p class="fc-results__status">No page found for <strong>' +
                    escapeHtml(result.brand) +
                    "</strong>.</p>";
                return;
            }
            var brandHtml = '<ul class="fc-results__list">';
            for (var b = 0; b < result.items.length; b++) {
                var page = result.items[b];
                brandHtml += '<li class="fc-results__item"><a class="fc-results__link" href="' +
                    escapeHtml(page.url) +
                    '">';
                brandHtml += '<span class="fc-results__meta"><span class="fc-results__brand">' +
                    escapeHtml(page.brand) +
                    '</span><span class="fc-results__code">' +
                    escapeHtml(page.name) +
                    "</span></span>";
                brandHtml += '<span class="fc-results__title">Open the ' +
                    escapeHtml(page.kind === "range" ? "range" : "brand") +
                    " fault-code page</span>";
                brandHtml += "</a></li>";
            }
            brandHtml += "</ul>";
            box.hidden = false;
            box.innerHTML = brandHtml;
            return;
        }

        if (!result.items.length) {
            box.hidden = false;
            box.innerHTML =
                '<p class="fc-results__status">No codes matched <strong>' +
                escapeHtml(query) +
                "</strong>. Try <em>Vaillant F28</em>, <em>Alpha 10</em>, or a code on its own. Missing brand? <a href=\"/fault-codes/request/\">Request it</a>.</p>";
            return;
        }

        var html = '<ul class="fc-results__list">';
        for (var i = 0; i < result.items.length; i++) {
            var entry = result.items[i];
            html += '<li class="fc-results__item"><a class="fc-results__link" href="' +
                escapeHtml(entry.url) +
                '">';
            html += '<span class="fc-results__meta">';
            html += '<span class="fc-results__brand">' + escapeHtml(entry.brand) + "</span>";
            html += '<span class="fc-results__code">' + escapeHtml(entry.code) + "</span>";
            html += "</span>";
            if (entry.title) {
                html += '<span class="fc-results__title">' + escapeHtml(entry.title) + "</span>";
            }
            if (entry.model) {
                html += '<span class="fc-results__model">' + escapeHtml(entry.model) + "</span>";
            }
            html += "</a></li>";
        }
        html += "</ul>";
        box.hidden = false;
        box.innerHTML = html;
    }

    function loadIndex() {
        return fetch(INDEX_URL, { credentials: "same-origin" })
            .then(function (res) {
                if (!res.ok) throw new Error("index " + res.status);
                return res.json();
            })
            .then(function (data) {
                index = data;
                buildKnownBrands();
                loadState = "loaded";
            })
            .catch(function () {
                loadState = "failed";
            });
    }

    function initHubSearch() {
        var input = $("fault-code-search");
        var button = $("fault-code-search-btn");
        if (!input) return;

        var params = new URLSearchParams(window.location.search);
        var preset = params.get("q") || params.get("code") || "";
        if (preset && !input.value) input.value = preset;

        function run() {
            renderResults(input.value);
            var next = input.value.trim();
            var url = new URL(window.location.href);
            if (next) url.searchParams.set("q", next);
            else url.searchParams.delete("q");
            if (url.toString() !== window.location.href) {
                window.history.replaceState({}, "", url);
            }
        }

        input.addEventListener("input", run);
        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                run();
            }
        });
        if (button) {
            button.addEventListener("click", function () {
                run();
            });
        }

        loadIndex().then(function () {
            if (input.value.trim()) run();
        });
    }

    function rowText(row) {
        return (row.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function rowCodeNorm(row) {
        var first = row.querySelector("td");
        return first ? normalizeCode(first.textContent) : "";
    }

    function applyTableFilter(wrap, query) {
        var table = wrap.querySelector("table");
        if (!table) return;
        var q = normalizeQuery(query);
        var codeQ = normalizeCode(q);
        var rows = table.querySelectorAll("tbody tr");
        if (!rows.length) rows = table.querySelectorAll("tr");
        var shown = 0;
        var total = 0;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row.querySelector("th")) continue;
            var cells = row.querySelectorAll("td");
            if (!cells.length) continue;
            var empty = true;
            for (var c = 0; c < cells.length; c++) {
                if ((cells[c].textContent || "").trim()) {
                    empty = false;
                    break;
                }
            }
            if (empty) {
                row.classList.add("fc-row-hidden");
                row.classList.remove("fc-row-match");
                continue;
            }
            total += 1;
            var match = !q;
            if (q) {
                var text = rowText(row);
                var norm = rowCodeNorm(row);
                match = text.indexOf(q) !== -1 || (codeQ && norm.indexOf(codeQ) !== -1);
            }
            row.classList.toggle("fc-row-hidden", !match);
            row.classList.toggle("fc-row-match", Boolean(q && match));
            if (match) shown += 1;
        }
        var count = wrap.querySelector(".fc-table-filter__count");
        if (count) {
            count.textContent = q
                ? shown + " of " + total + " codes"
                : total + " codes";
        }
    }

    function ensureRowAnchors(table) {
        var rows = table.querySelectorAll("tbody tr");
        if (!rows.length) rows = table.querySelectorAll("tr");
        var used = {};
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row.querySelector("th")) continue;
            var first = row.querySelector("td");
            if (!first) continue;
            var code = normalizeCode(first.textContent);
            if (!code) continue;
            var id = "code-" + code;
            if (used[id]) {
                used[id] += 1;
                id = id + "-" + used[id];
            } else {
                used[id] = 1;
            }
            if (!row.id) row.id = id;
        }
    }

    function initTableFilters() {
        var wraps = document.querySelectorAll(".table-wrap");
        if (!wraps.length) return;
        var params = new URLSearchParams(window.location.search);
        var hash = (window.location.hash || "").replace(/^#code-/, "");
        var preset = params.get("code") || params.get("q") || hash;

        for (var i = 0; i < wraps.length; i++) {
            var wrap = wraps[i];
            var table = wrap.querySelector("table");
            if (!table) continue;
            var bodyRows = table.querySelectorAll("tbody tr");
            if (!bodyRows.length) bodyRows = table.querySelectorAll("tr");
            var countable = 0;
            for (var r = 0; r < bodyRows.length; r++) {
                if (!bodyRows[r].querySelector("th") && bodyRows[r].querySelector("td")) {
                    countable += 1;
                }
            }
            ensureRowAnchors(table);
            if (countable < 8) continue;
            if (wrap.querySelector(".fc-table-filter")) continue;

            var filter = document.createElement("div");
            filter.className = "fc-table-filter";
            var inputId = "fc-table-filter-" + i;
            filter.innerHTML =
                '<label class="fc-table-filter__label" for="' +
                inputId +
                '">Filter this table</label>' +
                '<input class="fc-table-filter__input" id="' +
                inputId +
                '" type="search" placeholder="Code, meaning, or model" autocomplete="off">' +
                '<p class="fc-table-filter__count"></p>';
            wrap.insertBefore(filter, wrap.firstChild);
            var input = filter.querySelector("input");
            input.addEventListener("input", function (currentWrap, currentInput) {
                return function () {
                    applyTableFilter(currentWrap, currentInput.value);
                };
            }(wrap, input));
            if (preset) {
                input.value = preset;
                applyTableFilter(wrap, preset);
            } else {
                applyTableFilter(wrap, "");
            }
        }

        if (preset) {
            var target = document.getElementById("code-" + normalizeCode(preset));
            if (target) {
                target.scrollIntoView({ block: "center" });
            }
        }
    }

    function init() {
        initHubSearch();
        initTableFilters();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
