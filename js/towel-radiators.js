(function () {
    var DATA_URL = "/towel-radiators/data.json";
    var rows = [];
    var sortKey = "height";
    var sortDir = "asc";

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function dash(value) {
        return value == null || value === "" ? "—" : value;
    }

    function formatPrice(value) {
        if (value == null) return "—";
        return "£" + Number(value).toFixed(2);
    }

    function formatWm2(value) {
        if (value == null) return "—";
        return Number(value).toFixed(1).replace(/\.0$/, "");
    }

    function unique(values) {
        return values
            .filter(function (value, index, list) {
                return value != null && value !== "" && list.indexOf(value) === index;
            })
            .sort(function (a, b) {
                if (typeof a === "number" && typeof b === "number") return a - b;
                return String(a).localeCompare(String(b), undefined, { numeric: true });
            });
    }

    function fillSelect(el, values, allLabel) {
        var current = el.value;
        el.innerHTML = "";
        var all = document.createElement("option");
        all.value = "";
        all.textContent = allLabel;
        el.appendChild(all);
        values.forEach(function (value) {
            var option = document.createElement("option");
            option.value = String(value);
            option.textContent = String(value);
            el.appendChild(option);
        });
        if (current && values.some(function (value) { return String(value) === current; })) {
            el.value = current;
        }
    }

    function searchHaystack(row) {
        return [
            row.brand,
            row.supplier,
            row.code,
            row.description,
            row.style,
            row.colour,
            row.height,
            row.width,
            row.depth,
            row.watts,
            row.btu,
            row.bars,
            row.pipeCentres,
            row.price
        ]
            .filter(function (value) { return value != null && value !== ""; })
            .join(" ")
            .toLowerCase();
    }

    function readFilters() {
        return {
            q: ($("tr-search").value || "").trim().toLowerCase(),
            brand: $("tr-brand").value,
            colour: $("tr-colour").value,
            style: $("tr-style").value,
            height: $("tr-height").value,
            width: $("tr-width").value,
            minWatts: parseFloat($("tr-min-watts").value)
        };
    }

    function applyFilters(filters) {
        return rows.filter(function (row) {
            if (filters.q && searchHaystack(row).indexOf(filters.q) === -1) return false;
            if (filters.brand && row.brand !== filters.brand) return false;
            if (filters.colour && row.colour !== filters.colour) return false;
            if (filters.style && row.style !== filters.style) return false;
            if (filters.height && String(row.height) !== filters.height) return false;
            if (filters.width && String(row.width) !== filters.width) return false;
            if (!isNaN(filters.minWatts) && (row.watts == null || row.watts < filters.minWatts)) return false;
            return true;
        });
    }

    function compare(a, b, key) {
        var av = a[key];
        var bv = b[key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return av - bv;
        return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    }

    function sortRows(list) {
        var key = sortKey;
        var dir = sortDir === "desc" ? -1 : 1;
        return list.slice().sort(function (a, b) {
            var result = compare(a, b, key);
            if (result === 0 && key !== "brand") result = compare(a, b, "brand");
            if (result === 0 && key !== "height") result = compare(a, b, "height");
            if (result === 0 && key !== "width") result = compare(a, b, "width");
            return result * dir;
        });
    }

    function render(list) {
        var body = $("tr-body");
        if (!list.length) {
            body.innerHTML =
                '<tr class="tr-empty"><td colspan="11">No towel radiators match those filters.</td></tr>';
        } else {
            body.innerHTML = list
                .map(function (row) {
                    var size = (row.height || "—") + " × " + (row.width || "—");
                    return (
                        "<tr>" +
                        "<td>" + escapeHtml(row.brand) + "</td>" +
                        "<td>" + escapeHtml(dash(row.code)) + "</td>" +
                        "<td>" + escapeHtml(size) + "</td>" +
                        "<td>" + escapeHtml(dash(row.depth)) + "</td>" +
                        "<td>" + escapeHtml(dash(row.watts)) + "</td>" +
                        "<td>" + escapeHtml(dash(row.btu)) + "</td>" +
                        "<td>" + escapeHtml(dash(row.colour)) + "</td>" +
                        "<td>" + escapeHtml(dash(row.pipeCentres)) + "</td>" +
                        "<td>" + escapeHtml(formatWm2(row.wattsPerM2)) + "</td>" +
                        "<td>" + escapeHtml(formatPrice(row.price)) + "</td>" +
                        "<td>" + escapeHtml(dash(row.bars || row.description)) + "</td>" +
                        "</tr>"
                    );
                })
                .join("");
        }

        $("tr-count").textContent = list.length + " of " + rows.length + " rails";
        document.querySelectorAll("#tr-table th[data-sort]").forEach(function (th) {
            var active = th.getAttribute("data-sort") === sortKey;
            th.setAttribute("aria-sort", active ? (sortDir === "desc" ? "descending" : "ascending") : "none");
        });
    }

    function writeUrl(filters) {
        var params = new URLSearchParams();
        if (filters.q) params.set("q", filters.q);
        if (filters.brand) params.set("brand", filters.brand);
        if (filters.colour) params.set("colour", filters.colour);
        if (filters.style) params.set("style", filters.style);
        if (filters.height) params.set("height", filters.height);
        if (filters.width) params.set("width", filters.width);
        if (!isNaN(filters.minWatts)) params.set("minWatts", String(filters.minWatts));
        if (sortKey !== "height") params.set("sort", sortKey);
        if (sortDir !== "asc") params.set("dir", sortDir);
        var query = params.toString();
        var next = window.location.pathname + (query ? "?" + query : "") + window.location.hash;
        window.history.replaceState(null, "", next);
    }

    function update() {
        var filters = readFilters();
        var filtered = sortRows(applyFilters(filters));
        render(filtered);
        writeUrl(filters);
    }

    function readUrl() {
        var params = new URLSearchParams(window.location.search);
        if (params.get("q")) $("tr-search").value = params.get("q");
        if (params.get("brand")) $("tr-brand").value = params.get("brand");
        if (params.get("colour")) $("tr-colour").value = params.get("colour");
        if (params.get("style")) $("tr-style").value = params.get("style");
        if (params.get("height")) $("tr-height").value = params.get("height");
        if (params.get("width")) $("tr-width").value = params.get("width");
        if (params.get("minWatts")) $("tr-min-watts").value = params.get("minWatts");
        if (params.get("sort")) sortKey = params.get("sort");
        if (params.get("dir") === "desc") sortDir = "desc";
    }

    function populateFilters() {
        fillSelect($("tr-brand"), unique(rows.map(function (row) { return row.brand; })), "All brands");
        fillSelect($("tr-colour"), unique(rows.map(function (row) { return row.colour; })), "All colours");
        fillSelect($("tr-style"), unique(rows.map(function (row) { return row.style; })), "All styles");
        fillSelect($("tr-height"), unique(rows.map(function (row) { return row.height; })), "Any height");
        fillSelect($("tr-width"), unique(rows.map(function (row) { return row.width; })), "Any width");
    }

    function bind() {
        ["tr-search", "tr-brand", "tr-colour", "tr-style", "tr-height", "tr-width", "tr-min-watts"].forEach(function (id) {
            $(id).addEventListener("input", update);
            $(id).addEventListener("change", update);
        });
        $("tr-reset").addEventListener("click", function () {
            $("tr-search").value = "";
            $("tr-brand").value = "";
            $("tr-colour").value = "";
            $("tr-style").value = "";
            $("tr-height").value = "";
            $("tr-width").value = "";
            $("tr-min-watts").value = "";
            sortKey = "height";
            sortDir = "asc";
            update();
            $("tr-search").focus();
        });
        document.querySelectorAll("#tr-table th[data-sort]").forEach(function (th) {
            th.addEventListener("click", function () {
                var key = th.getAttribute("data-sort");
                if (sortKey === key) {
                    sortDir = sortDir === "asc" ? "desc" : "asc";
                } else {
                    sortKey = key;
                    sortDir = key === "brand" || key === "colour" ? "asc" : "asc";
                }
                update();
            });
        });
    }

    function showError(message) {
        $("tr-body").innerHTML =
            '<tr class="tr-empty"><td colspan="11">' + escapeHtml(message) + "</td></tr>";
        $("tr-count").textContent = "Catalogue unavailable";
    }

    function start(data) {
        rows = data;
        populateFilters();
        readUrl();
        bind();
        update();
    }

    var embedded = $("tr-data");
    if (embedded && embedded.textContent.trim()) {
        try {
            start(JSON.parse(embedded.textContent));
            return;
        } catch (err) {
            /* fall through to fetch */
        }
    }

    fetch(DATA_URL)
        .then(function (response) {
            if (!response.ok) throw new Error("Could not load catalogue");
            return response.json();
        })
        .then(start)
        .catch(function () {
            showError("Could not load the towel radiator catalogue.");
        });
})();
