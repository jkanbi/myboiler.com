(function () {
    'use strict';

    var TEMPLATE_URL = '/toolbox/gas-safety-record-generator/template.pdf';
    var TEMPLATE_SHA256 = 'b738c653a0e28f26e6458bb943092e45dd918032e839a98f45ea8ca313e7fe95';
    var ENGINEER_KEY = 'mb-lgsr-engineer-v1';
    var GREY = { r: 0.85, g: 0.85, b: 0.85 };
    var INSET = 0.65;

    var YNNA = [
        { value: '', label: 'Select' },
        { value: 'Y', label: 'Yes' },
        { value: 'N', label: 'No' },
        { value: 'N/A', label: 'N/A' }
    ];
    var PASS = [
        { value: '', label: 'Select' },
        { value: 'Pass', label: 'Pass' },
        { value: 'Fail', label: 'Fail' },
        { value: 'N/A', label: 'N/A' }
    ];

    var APP_ROWS = [
        [315, 327],
        [328, 340],
        [341, 353],
        [354, 366],
        [367, 379]
    ];
    var APP_COLS = {
        location: [29, 117],
        type: [118, 205],
        make: [206, 299],
        model: [300, 393],
        efficiency: [411, 435],
        flueType: [436, 461],
        inspected: [462, 485],
        landlord: [486, 511],
        gasRate: [512, 580],
        pressure: [581, 609],
        safety: [610, 645],
        ventilation: [646, 674],
        visualFlue: [675, 728],
        fluePerf: [729, 755],
        serviced: [756, 782],
        safeToUse: [783, 807]
    };
    var COMB_COLS = [[118, 161], [162, 205], [206, 249], [250, 299]];
    var COMB_ROWS = {
        highRatio: [402, 416],
        highCO: [417, 429],
        highCO2: [430, 442],
        lowRatio: [443, 455],
        lowCO: [456, 468],
        lowCO2: [469, 481]
    };
    var CHECK_X = [411, 461];
    var CHECK_ROWS = {
        numTested: [402, 416],
        ecv: [417, 429],
        bonding: [430, 442],
        pipework: [443, 455],
        tightness: [456, 468],
        installPass: [469, 481]
    };
    var DEFECT_ROWS = [
        [402, 416],
        [417, 429],
        [430, 442],
        [443, 455],
        [456, 468],
        [469, 481]
    ];
    var BOX = {
        certificateNo: [729, 60, 807, 85],
        engineerCompany: [118, 112, 299, 150],
        engineerTown: [118, 151, 299, 163],
        engineerPostcode: [118, 164, 299, 176],
        engineerPhone: [118, 177, 299, 189],
        installation: [322, 112, 511, 189],
        client: [534, 112, 782, 189],
        gasSafeNo: [118, 203, 161, 215],
        licenceNo: [250, 203, 299, 215],
        reference: [411, 203, 511, 215],
        fgaSn: [581, 203, 674, 215],
        fgaCalDue: [756, 203, 807, 215],
        engName: [411, 496, 511, 508],
        engSig: [411, 509, 511, 521],
        engDate: [411, 522, 511, 535],
        recvName: [610, 496, 728, 508],
        recvSig: [610, 509, 728, 521],
        nextDue: [610, 522, 728, 535]
    };

    var ENGINEER_FIELDS = [
        'eng-company', 'eng-town', 'eng-postcode', 'eng-phone',
        'eng-gassafe', 'eng-licence', 'eng-fga-sn', 'eng-fga-cal', 'eng-name'
    ];

    var form = document.getElementById('lgsr-form');
    if (!form) return;

    var stepLabel = document.getElementById('wizard-step-label');
    var barFill = document.getElementById('wizard-bar-fill');
    var backBtn = document.getElementById('wizard-back');
    var nextBtn = document.getElementById('wizard-next');
    var generateBtn = document.getElementById('wizard-generate');
    var statusEl = document.getElementById('wizard-status');
    var applianceHost = document.getElementById('appliance-steps');
    var countEl = document.getElementById('appliance-count');
    var testedEl = document.getElementById('check-tested');
    var inspectEl = document.getElementById('inspection-date');
    var engDateEl = document.getElementById('eng-date');
    var nextDueEl = document.getElementById('next-due');
    var rememberEl = document.getElementById('eng-remember');

    var current = 0;
    var nextDueTouched = false;
    var sigPads = {};

    function val(id) {
        var el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
    }

    function checked(id) {
        var el = document.getElementById(id);
        return !!(el && el.checked);
    }

    function applianceCount() {
        var n = parseInt(val('appliance-count'), 10);
        if (!n || n < 1) return 1;
        if (n > 5) return 5;
        return n;
    }

    function stepIds() {
        var ids = ['certificate', 'engineer', 'property', 'count'];
        var n = applianceCount();
        var i;
        for (i = 1; i <= n; i += 1) ids.push('appliance-' + i);
        ids.push('checks', 'defects', 'alarms', 'signoff');
        return ids;
    }

    function stepTitle(id) {
        if (id.indexOf('appliance-') === 0) return 'Appliance ' + id.slice(10);
        var titles = {
            certificate: 'Certificate',
            engineer: 'Engineer',
            property: 'Property',
            count: 'How many appliances',
            checks: 'Installation checks',
            defects: 'Defects and notes',
            alarms: 'Safety alarms',
            signoff: 'Sign-off'
        };
        return titles[id] || id;
    }

    function optionsHtml(list) {
        return list.map(function (item) {
            return '<option value="' + item.value + '">' + item.label + '</option>';
        }).join('');
    }

    function field(id, label, control, extraClass) {
        return '<div class="field' + (extraClass ? ' ' + extraClass : '') + '"><label for="' + id + '">' + label + '</label>' + control + '</div>';
    }

    function input(id, name, attrs) {
        return '<input id="' + id + '" name="' + name + '" ' + (attrs || '') + '>';
    }

    function select(id, name, list) {
        return '<select id="' + id + '" name="' + name + '">' + optionsHtml(list) + '</select>';
    }

    function buildAppliance(n) {
        var p = 'app-' + n + '-';
        var comb = '';
        if (n <= 4) {
            comb =
                '<h3 class="appliance-block">Combustion analysis</h3>' +
                '<div class="check-row"><input type="checkbox" id="' + p + 'comb-na" name="' + p + 'combNa">' +
                '<label class="check-label" for="' + p + 'comb-na">Not applicable for this appliance (for example a cooker or fire)</label></div>' +
                '<div class="field-grid" data-comb-fields="' + n + '">' +
                field(p + 'high-ratio', 'High ratio', input(p + 'high-ratio', p + 'highRatio')) +
                field(p + 'high-co', 'High CO ppm', input(p + 'high-co', p + 'highCo')) +
                field(p + 'high-co2', 'High CO₂ %', input(p + 'high-co2', p + 'highCo2')) +
                field(p + 'low-ratio', 'Low ratio', input(p + 'low-ratio', p + 'lowRatio')) +
                field(p + 'low-co', 'Low CO ppm', input(p + 'low-co', p + 'lowCo')) +
                field(p + 'low-co2', 'Low CO₂ %', input(p + 'low-co2', p + 'lowCo2')) +
                '</div>';
        } else {
            comb = '<p class="hint">Form v3.2 only has combustion columns for appliances 1 to 4.</p>';
        }
        return (
            '<section class="wizard-step" data-step-id="appliance-' + n + '" hidden>' +
            '<h2>Appliance ' + n + '</h2>' +
            '<div class="field-grid">' +
            field(p + 'location', 'Location', input(p + 'location', p + 'location')) +
            field(p + 'type', 'Appliance type', input(p + 'type', p + 'type', 'list="appliance-types" placeholder="e.g. boiler, cooker, fire"')) +
            field(p + 'make', 'Make', input(p + 'make', p + 'make')) +
            field(p + 'model', 'Model', input(p + 'model', p + 'model')) +
            field(p + 'efficiency', 'Standard / high efficiency', select(p + 'efficiency', p + 'efficiency', [
                { value: '', label: 'Select' },
                { value: 'S', label: 'Standard' },
                { value: 'HE', label: 'High efficiency' },
                { value: 'N/A', label: 'N/A' }
            ])) +
            field(p + 'flue', 'Flue type', input(p + 'flue', p + 'flue', 'list="flue-types" placeholder="e.g. OF, RS, BF, FF, FL"')) +
            field(p + 'inspected', 'Appliance inspected', select(p + 'inspected', p + 'inspected', YNNA)) +
            field(p + 'landlord', 'Landlord appliance', select(p + 'landlord', p + 'landlord', YNNA)) +
            field(p + 'gas-rate', 'Gas rate / heat input', input(p + 'gas-rate', p + 'gasRate', 'placeholder="e.g. 21.5 kW"')) +
            field(p + 'net-gross', 'Net or gross', select(p + 'net-gross', p + 'netGross', [
                { value: '', label: 'Select' },
                { value: 'N', label: 'Net (N)' },
                { value: 'G', label: 'Gross (G)' }
            ])) +
            field(p + 'pressure', 'Operating pressure', input(p + 'pressure', p + 'pressure', 'placeholder="e.g. 20 mbar"')) +
            field(p + 'safety', 'Safety device(s) correct operation', select(p + 'safety', p + 'safety', YNNA)) +
            field(p + 'ventilation', 'Ventilation provision', select(p + 'ventilation', p + 'ventilation', YNNA)) +
            field(p + 'visual', 'Visual condition of flue and termination', select(p + 'visual', p + 'visual', PASS)) +
            field(p + 'flue-perf', 'Flue performance test(s)', select(p + 'flue-perf', p + 'fluePerf', PASS)) +
            field(p + 'serviced', 'Appliance serviced', select(p + 'serviced', p + 'serviced', YNNA)) +
            field(p + 'safe', 'Appliance safe to use', select(p + 'safe', p + 'safe', YNNA)) +
            '</div>' + comb +
            '</section>'
        );
    }

    function ensureAppliances() {
        if (applianceHost.getAttribute('data-built') === '5') return;
        var html = '<datalist id="appliance-types"><option value="Boiler"><option value="Cooker"><option value="Hob"><option value="Fire"><option value="Water heater"><option value="Warm air"><option value="Tumble dryer"></datalist>' +
            '<datalist id="flue-types"><option value="OF"><option value="RS"><option value="BF"><option value="FF"><option value="FL"></datalist>';
        var i;
        for (i = 1; i <= 5; i += 1) html += buildAppliance(i);
        applianceHost.innerHTML = html;
        applianceHost.setAttribute('data-built', '5');
        for (i = 1; i <= 4; i += 1) bindCombNa(i);
    }

    function bindCombNa(n) {
        var box = document.getElementById('app-' + n + '-comb-na');
        var wrap = form.querySelector('[data-comb-fields="' + n + '"]');
        if (!box || !wrap) return;
        function sync() {
            var off = box.checked;
            wrap.querySelectorAll('input').forEach(function (el) {
                el.disabled = off;
            });
        }
        box.addEventListener('change', sync);
        sync();
    }

    function setStatus(msg, isError) {
        statusEl.textContent = msg || '';
        statusEl.classList.toggle('is-error', !!isError);
    }

    function showStep() {
        var ids = stepIds();
        if (current < 0) current = 0;
        if (current >= ids.length) current = ids.length - 1;
        var id = ids[current];
        form.querySelectorAll('.wizard-step').forEach(function (section) {
            section.hidden = section.getAttribute('data-step-id') !== id;
        });
        stepLabel.textContent = 'Step ' + (current + 1) + ' of ' + ids.length + ' — ' + stepTitle(id);
        barFill.style.width = (((current + 1) / ids.length) * 100) + '%';
        backBtn.hidden = current === 0;
        nextBtn.hidden = id === 'signoff';
        generateBtn.hidden = id !== 'signoff';
        setStatus('');
        if (id === 'signoff') {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    Object.keys(sigPads).forEach(function (key) {
                        if (sigPads[key].resize) sigPads[key].resize();
                    });
                });
            });
        }
    }

    function formatUkDate(iso) {
        if (!iso) return '';
        var p = iso.split('-');
        if (p.length !== 3) return iso;
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function addYear(iso) {
        if (!iso) return '';
        var p = iso.split('-').map(Number);
        if (p.length !== 3) return '';
        var d = new Date(p[0] + 1, p[1] - 1, p[2]);
        if (d.getMonth() !== p[1] - 1) d = new Date(p[0] + 1, p[1], 0);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function syncDates() {
        var inspect = val('inspection-date');
        if (inspect && !val('eng-date')) engDateEl.value = inspect;
        if (inspect && !nextDueTouched) nextDueEl.value = addYear(inspect);
        if (!testedEl.dataset.touched) testedEl.value = String(applianceCount());
    }

    function loadEngineer() {
        try {
            var raw = localStorage.getItem(ENGINEER_KEY);
            if (!raw) return;
            var data = JSON.parse(raw);
            ENGINEER_FIELDS.forEach(function (id) {
                if (data[id] && document.getElementById(id)) document.getElementById(id).value = data[id];
            });
            rememberEl.checked = true;
        } catch (err) {}
    }

    function saveEngineer() {
        if (!rememberEl.checked) {
            try { localStorage.removeItem(ENGINEER_KEY); } catch (err) {}
            return;
        }
        var data = {};
        ENGINEER_FIELDS.forEach(function (id) { data[id] = val(id); });
        try { localStorage.setItem(ENGINEER_KEY, JSON.stringify(data)); } catch (err) {}
    }

    function setupPad(canvas) {
        var ctx = canvas.getContext('2d');
        var drawing = false;
        var last = null;

        function size() {
            var ratio = Math.max(window.devicePixelRatio || 1, 1);
            var rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var w = Math.max(2, Math.round(rect.width * ratio));
            var h = Math.max(2, Math.round(rect.height * ratio));
            if (canvas.width === w && canvas.height === h) return;
            var prev = null;
            if (canvas.width > 2 && canvas.height > 2) {
                prev = document.createElement('canvas');
                prev.width = canvas.width;
                prev.height = canvas.height;
                prev.getContext('2d').drawImage(canvas, 0, 0);
            }
            canvas.width = w;
            canvas.height = h;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            if (prev) ctx.drawImage(prev, 0, 0, w, h);
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 2.5;
        }

        function point(ev) {
            var rect = canvas.getBoundingClientRect();
            var src = ev.touches ? ev.touches[0] : ev;
            return { x: src.clientX - rect.left, y: src.clientY - rect.top };
        }

        function start(ev) {
            ev.preventDefault();
            size();
            drawing = true;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 2.5;
            last = point(ev);
        }
        function move(ev) {
            if (!drawing) return;
            ev.preventDefault();
            var p = point(ev);
            ctx.beginPath();
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last = p;
        }
        function end(ev) {
            if (ev) ev.preventDefault();
            drawing = false;
        }

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', end);
        canvas.addEventListener('touchcancel', end);
        size();
        sigPads[canvas.id] = { canvas: canvas, ctx: ctx, resize: size };
        return {
            clear: function () {
                var rect = canvas.getBoundingClientRect();
                ctx.setTransform(Math.max(window.devicePixelRatio || 1, 1), 0, 0, Math.max(window.devicePixelRatio || 1, 1), 0, 0);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, rect.width, rect.height);
            }
        };
    }

    function canvasHasInk(canvas) {
        var ctx = canvas.getContext('2d');
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        var i;
        for (i = 0; i < data.length; i += 4) {
            if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return true;
        }
        return false;
    }

    function sanitize(text) {
        return String(text || '')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\u00A0/g, ' ')
            .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
    }

    function pdfBox(page, b) {
        var h = page.getHeight();
        return {
            x: b[0] + INSET,
            y: h - b[3] + INSET,
            w: Math.max(0.5, b[2] - b[0] - INSET * 2),
            h: Math.max(0.5, b[3] - b[1] - INSET * 2)
        };
    }

    function appBox(row, col) {
        var y = APP_ROWS[row];
        var x = APP_COLS[col];
        return [x[0], y[0], x[1], y[1]];
    }

    function combBox(col, name) {
        var x = COMB_COLS[col];
        var y = COMB_ROWS[name];
        return [x[0], y[0], x[1], y[1]];
    }

    function fillGrey(page, lib, b) {
        var box = pdfBox(page, b);
        page.drawRectangle({
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            color: lib.rgb(GREY.r, GREY.g, GREY.b)
        });
    }

    function wrapParagraph(font, text, size, maxWidth) {
        var words = String(text).split(/\s+/).filter(Boolean);
        var lines = [];
        var line = '';
        var i;
        var trial;
        var parts;
        var j;
        var ch;
        var piece;
        for (i = 0; i < words.length; i += 1) {
            trial = line ? line + ' ' + words[i] : words[i];
            if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
                line = trial;
            } else if (!line) {
                parts = '';
                for (j = 0; j < words[i].length; j += 1) {
                    ch = words[i][j];
                    piece = parts + ch;
                    if (font.widthOfTextAtSize(piece, size) <= maxWidth || !parts) parts = piece;
                    else {
                        lines.push(parts);
                        parts = ch;
                    }
                }
                line = parts;
            } else {
                lines.push(line);
                line = words[i];
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    function wrapLines(font, text, size, maxWidth) {
        var blocks = String(text).replace(/\r\n/g, '\n').split('\n');
        var lines = [];
        var i;
        for (i = 0; i < blocks.length; i += 1) {
            if (!blocks[i]) {
                lines.push('');
            } else {
                lines = lines.concat(wrapParagraph(font, blocks[i], size, maxWidth));
            }
        }
        return lines.length ? lines : [''];
    }

    function drawParagraph(page, font, lib, text, b, maxSize) {
        var clean = sanitize(text);
        if (!clean) {
            fillGrey(page, lib, b);
            return;
        }
        var box = pdfBox(page, b);
        var size = maxSize || 8;
        var min = 5;
        var lines = wrapLines(font, clean, size, box.w - 0.6);
        var lineH = size * 1.12;
        while (size > min && (lines.length * lineH > box.h || lines.some(function (ln) { return font.widthOfTextAtSize(ln, size) > box.w; }))) {
            size -= 0.2;
            lines = wrapLines(font, clean, size, box.w - 0.6);
            lineH = size * 1.12;
        }
        var y = box.y + box.h - size - 0.4;
        var i;
        for (i = 0; i < lines.length; i += 1) {
            if (y < box.y - 0.2) break;
            page.drawText(lines[i], { x: box.x + 0.4, y: y, size: size, font: font, color: lib.rgb(0, 0, 0) });
            y -= lineH;
        }
    }

    function drawRotated(page, font, lib, text, box, size) {
        while (size > 4 && font.widthOfTextAtSize(text, size) > box.h - 0.4) size -= 0.15;
        var tw = font.widthOfTextAtSize(text, size);
        var x = box.x + (box.w + size * 0.72) / 2;
        var y = box.y + Math.max(0.2, (box.h - tw) / 2);
        page.drawText(text, {
            x: x,
            y: y,
            size: size,
            font: font,
            color: lib.rgb(0, 0, 0),
            rotate: lib.degrees(90)
        });
    }

    function isNaValue(text) {
        var t = String(text || '').trim().toUpperCase();
        return t === 'N/A' || t === 'NA';
    }

    function drawCell(page, font, lib, text, b, opts) {
        var clean = sanitize(text);
        opts = opts || {};
        if (!clean) {
            fillGrey(page, lib, b);
            return;
        }
        if (isNaValue(clean)) fillGrey(page, lib, b);
        var box = pdfBox(page, b);
        var size = Math.min(opts.maxSize || 8, box.h - 0.8);
        var min = opts.minSize || 4.5;
        while (size > min && font.widthOfTextAtSize(clean, size) > box.w - 0.4) size -= 0.15;
        var tw = font.widthOfTextAtSize(clean, size);
        if (opts.rotate && tw > box.w - 0.3) {
            drawRotated(page, font, lib, clean, box, Math.min(7, box.w - 1));
            return;
        }
        var x = box.x + 0.35;
        if (opts.align !== 'left') x = box.x + Math.max(0.15, (box.w - tw) / 2);
        var y = box.y + (box.h - size * 0.72) / 2;
        page.drawText(clean, { x: x, y: y, size: size, font: font, color: lib.rgb(0, 0, 0) });
    }

    function greyRow(page, lib, row) {
        Object.keys(APP_COLS).forEach(function (col) {
            fillGrey(page, lib, appBox(row, col));
        });
    }

    function greyCombCol(page, lib, col) {
        Object.keys(COMB_ROWS).forEach(function (name) {
            fillGrey(page, lib, combBox(col, name));
        });
    }

    function joinRate(rate, ng) {
        if (!rate && !ng) return '';
        if (rate && ng) return rate + ' ' + ng;
        return rate || ng;
    }

    async function sha256Hex(buffer) {
        var hash = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hash)).map(function (b) {
            return b.toString(16).padStart(2, '0');
        }).join('');
    }

    async function canvasPng(canvas) {
        var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
        return new Uint8Array(await blob.arrayBuffer());
    }

    function cropInkCanvas(canvas) {
        var ctx = canvas.getContext('2d');
        var width = canvas.width;
        var height = canvas.height;
        var data = ctx.getImageData(0, 0, width, height).data;
        var minX = width;
        var minY = height;
        var maxX = 0;
        var maxY = 0;
        var x;
        var y;
        var i;
        for (y = 0; y < height; y += 1) {
            for (x = 0; x < width; x += 1) {
                i = (y * width + x) * 4;
                if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < minX) return canvas;
        var pad = Math.max(2, Math.round(Math.min(width, height) * 0.04));
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(width - 1, maxX + pad);
        maxY = Math.min(height - 1, maxY + pad);
        var w = maxX - minX + 1;
        var h = maxY - minY + 1;
        var out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        out.getContext('2d').drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
        return out;
    }

    async function drawSignature(page, pdfDoc, lib, canvas, b) {
        if (!canvasHasInk(canvas)) {
            fillGrey(page, lib, b);
            return;
        }
        var png = await pdfDoc.embedPng(await canvasPng(cropInkCanvas(canvas)));
        var box = pdfBox(page, b);
        var scale = Math.min(box.w / png.width, box.h / png.height);
        var w = png.width * scale;
        var h = png.height * scale;
        page.drawImage(png, {
            x: box.x + (box.w - w) / 2,
            y: box.y + (box.h - h) / 2,
            width: w,
            height: h
        });
    }

    function fileName(cert, dateIso) {
        var c = String(cert || 'record').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'record';
        var d = dateIso || 'undated';
        return 'LGSR-' + c + '-' + d + '.pdf';
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function autoCertificateNo(when) {
        var d = when || new Date();
        return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
            pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    }

    function resolveCertificateNo() {
        return val('certificate-no') || autoCertificateNo();
    }

    async function generatePdf() {
        if (typeof PDFLib === 'undefined') {
            throw new Error('PDF library did not load.');
        }
        var lib = PDFLib;
        var res = await fetch(TEMPLATE_URL);
        if (!res.ok) throw new Error('Could not load the record template.');
        var bytes = await res.arrayBuffer();
        var hash = await sha256Hex(bytes);
        if (hash !== TEMPLATE_SHA256) {
            throw new Error('The record template did not match the expected file.');
        }
        var pdfDoc = await lib.PDFDocument.load(bytes, { updateMetadata: false });
        pdfDoc.setTitle('Landlord Gas Safety Record');
        pdfDoc.setCreator('MyBoiler.com');
        pdfDoc.setProducer('MyBoiler.com');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        var page = pdfDoc.getPages()[0];
        var font = await pdfDoc.embedFont(lib.StandardFonts.Helvetica);
        var n = applianceCount();
        var i;
        var prefix;
        var combNa;
        var rate;
        var combFields;
        var certNo = resolveCertificateNo();

        drawCell(page, font, lib, certNo, BOX.certificateNo, { maxSize: 10, align: 'left' });
        drawParagraph(page, font, lib, val('eng-company'), BOX.engineerCompany, 8);
        drawCell(page, font, lib, val('eng-town'), BOX.engineerTown, { maxSize: 8, align: 'left' });
        drawCell(page, font, lib, val('eng-postcode'), BOX.engineerPostcode, { maxSize: 8, align: 'left' });
        drawCell(page, font, lib, val('eng-phone'), BOX.engineerPhone, { maxSize: 8, align: 'left' });
        drawParagraph(page, font, lib, val('install-address'), BOX.installation, 8);
        drawParagraph(page, font, lib, val('client-details'), BOX.client, 8);
        drawCell(page, font, lib, val('eng-gassafe'), BOX.gasSafeNo, { maxSize: 8 });
        drawCell(page, font, lib, val('eng-licence'), BOX.licenceNo, { maxSize: 8 });
        drawCell(page, font, lib, val('install-ref'), BOX.reference, { maxSize: 8, align: 'left' });
        drawCell(page, font, lib, val('eng-fga-sn'), BOX.fgaSn, { maxSize: 8, align: 'left' });
        drawCell(page, font, lib, formatUkDate(val('eng-fga-cal')), BOX.fgaCalDue, { maxSize: 7 });

        for (i = 0; i < 5; i += 1) {
            if (i >= n) {
                greyRow(page, lib, i);
                continue;
            }
            prefix = 'app-' + (i + 1) + '-';
            rate = joinRate(val(prefix + 'gas-rate'), val(prefix + 'net-gross'));
            drawCell(page, font, lib, val(prefix + 'location'), appBox(i, 'location'), { maxSize: 7, align: 'left' });
            drawCell(page, font, lib, val(prefix + 'type'), appBox(i, 'type'), { maxSize: 7, align: 'left' });
            drawCell(page, font, lib, val(prefix + 'make'), appBox(i, 'make'), { maxSize: 7, align: 'left' });
            drawCell(page, font, lib, val(prefix + 'model'), appBox(i, 'model'), { maxSize: 7, align: 'left' });
            drawCell(page, font, lib, val(prefix + 'efficiency'), appBox(i, 'efficiency'), { maxSize: 7, rotate: true });
            drawCell(page, font, lib, val(prefix + 'flue'), appBox(i, 'flueType'), { maxSize: 7, rotate: true });
            drawCell(page, font, lib, val(prefix + 'inspected'), appBox(i, 'inspected'), { maxSize: 7, rotate: true });
            drawCell(page, font, lib, val(prefix + 'landlord'), appBox(i, 'landlord'), { maxSize: 7, rotate: true });
            drawCell(page, font, lib, rate, appBox(i, 'gasRate'), { maxSize: 7 });
            drawCell(page, font, lib, val(prefix + 'pressure'), appBox(i, 'pressure'), { maxSize: 6.5, rotate: true });
            drawCell(page, font, lib, val(prefix + 'safety'), appBox(i, 'safety'), { maxSize: 7, rotate: true });
            drawCell(page, font, lib, val(prefix + 'ventilation'), appBox(i, 'ventilation'), { maxSize: 7, rotate: true });
            drawCell(page, font, lib, val(prefix + 'visual'), appBox(i, 'visualFlue'), { maxSize: 6.5, rotate: true });
            drawCell(page, font, lib, val(prefix + 'flue-perf'), appBox(i, 'fluePerf'), { maxSize: 6.5, rotate: true });
            drawCell(page, font, lib, val(prefix + 'serviced'), appBox(i, 'serviced'), { maxSize: 7, rotate: true });
            drawCell(page, font, lib, val(prefix + 'safe'), appBox(i, 'safeToUse'), { maxSize: 7, rotate: true });
        }

        for (i = 0; i < 4; i += 1) {
            if (i >= n || checked('app-' + (i + 1) + '-comb-na')) {
                greyCombCol(page, lib, i);
                continue;
            }
            prefix = 'app-' + (i + 1) + '-';
            combFields = {
                highRatio: val(prefix + 'high-ratio'),
                highCO: val(prefix + 'high-co'),
                highCO2: val(prefix + 'high-co2'),
                lowRatio: val(prefix + 'low-ratio'),
                lowCO: val(prefix + 'low-co'),
                lowCO2: val(prefix + 'low-co2')
            };
            combNa = !combFields.highRatio && !combFields.highCO && !combFields.highCO2 && !combFields.lowRatio && !combFields.lowCO && !combFields.lowCO2;
            if (combNa) {
                greyCombCol(page, lib, i);
                continue;
            }
            Object.keys(combFields).forEach(function (name) {
                drawCell(page, font, lib, combFields[name], combBox(i, name), { maxSize: 8 });
            });
        }

        drawCell(page, font, lib, val('check-tested') || String(n), [CHECK_X[0], CHECK_ROWS.numTested[0], CHECK_X[1], CHECK_ROWS.numTested[1]], { maxSize: 9 });
        drawCell(page, font, lib, val('check-ecv'), [CHECK_X[0], CHECK_ROWS.ecv[0], CHECK_X[1], CHECK_ROWS.ecv[1]], { maxSize: 8 });
        drawCell(page, font, lib, val('check-bonding'), [CHECK_X[0], CHECK_ROWS.bonding[0], CHECK_X[1], CHECK_ROWS.bonding[1]], { maxSize: 8 });
        drawCell(page, font, lib, val('check-pipework'), [CHECK_X[0], CHECK_ROWS.pipework[0], CHECK_X[1], CHECK_ROWS.pipework[1]], { maxSize: 8 });
        drawCell(page, font, lib, val('check-tightness'), [CHECK_X[0], CHECK_ROWS.tightness[0], CHECK_X[1], CHECK_ROWS.tightness[1]], { maxSize: 8 });
        drawCell(page, font, lib, val('check-pass'), [CHECK_X[0], CHECK_ROWS.installPass[0], CHECK_X[1], CHECK_ROWS.installPass[1]], { maxSize: 8 });

        for (i = 0; i < 6; i += 1) {
            drawCell(page, font, lib, i < 5 ? val('defect-' + (i + 1)) : '', [486, DEFECT_ROWS[i][0], 807, DEFECT_ROWS[i][1]], { maxSize: 8, align: 'left' });
        }

        drawCell(page, font, lib, val('co-fitted'), [118, 509, 161, 521], { maxSize: 8 });
        drawCell(page, font, lib, formatUkDate(val('co-date')), [162, 509, 205, 521], { maxSize: 7 });
        drawCell(page, font, lib, val('co-location'), [206, 509, 249, 521], { maxSize: 7, align: 'left' });
        drawCell(page, font, lib, val('co-working'), [250, 509, 299, 521], { maxSize: 8 });
        drawCell(page, font, lib, val('smoke-fitted'), [118, 522, 161, 535], { maxSize: 8 });
        drawCell(page, font, lib, formatUkDate(val('smoke-date')), [162, 522, 205, 535], { maxSize: 7 });
        drawCell(page, font, lib, val('smoke-location'), [206, 522, 249, 535], { maxSize: 7, align: 'left' });
        drawCell(page, font, lib, val('smoke-working'), [250, 522, 299, 535], { maxSize: 8 });

        drawCell(page, font, lib, val('eng-name'), BOX.engName, { maxSize: 8, align: 'left' });
        drawCell(page, font, lib, formatUkDate(val('eng-date') || val('inspection-date')), BOX.engDate, { maxSize: 8 });
        drawCell(page, font, lib, val('recv-name'), BOX.recvName, { maxSize: 8, align: 'left' });
        drawCell(page, font, lib, formatUkDate(val('next-due')), BOX.nextDue, { maxSize: 8 });
        await drawSignature(page, pdfDoc, lib, document.getElementById('eng-sig'), BOX.engSig);
        await drawSignature(page, pdfDoc, lib, document.getElementById('recv-sig'), BOX.recvSig);

        return { bytes: await pdfDoc.save(), certNo: certNo };
    }

    function downloadBytes(bytes, name) {
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    function validateGenerate() {
        if (!val('inspection-date')) return 'Enter the inspection date.';
        if (!checked('eng-confirm')) return 'Confirm that you are a Gas Safe registered engineer responsible for this record.';
        if (!canvasHasInk(document.getElementById('eng-sig'))) return 'Draw the engineer signature.';
        if (!val('eng-name')) return 'Enter the engineer name.';
        return '';
    }

    form.addEventListener('submit', function (ev) { ev.preventDefault(); });

    ensureAppliances();
    loadEngineer();

    if (!inspectEl.value) {
        var today = new Date();
        inspectEl.value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    }
    syncDates();
    showStep();

    nextBtn.addEventListener('click', function () {
        if (stepIds()[current] === 'count') {
            testedEl.value = String(applianceCount());
            testedEl.dataset.touched = '';
        }
        current += 1;
        showStep();
    });
    backBtn.addEventListener('click', function () {
        current -= 1;
        showStep();
    });
    countEl.addEventListener('change', function () {
        if (!testedEl.dataset.touched) testedEl.value = String(applianceCount());
    });
    testedEl.addEventListener('input', function () {
        testedEl.dataset.touched = '1';
    });
    inspectEl.addEventListener('change', syncDates);
    nextDueEl.addEventListener('input', function () { nextDueTouched = true; });
    rememberEl.addEventListener('change', saveEngineer);
    ENGINEER_FIELDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', saveEngineer);
    });

    form.querySelectorAll('[data-clear-sig]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var canvas = document.getElementById(btn.getAttribute('data-clear-sig'));
            if (!canvas) return;
            var rect = canvas.getBoundingClientRect();
            var ctx = canvas.getContext('2d');
            var ratio = Math.max(window.devicePixelRatio || 1, 1);
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, rect.width, rect.height);
        });
    });

    setupPad(document.getElementById('eng-sig'));
    setupPad(document.getElementById('recv-sig'));
    window.addEventListener('resize', function () {
        Object.keys(sigPads).forEach(function (key) {
            if (sigPads[key].resize) sigPads[key].resize();
        });
    });

    generateBtn.addEventListener('click', function () {
        var err = validateGenerate();
        if (err) {
            setStatus(err, true);
            return;
        }
        saveEngineer();
        generateBtn.disabled = true;
        setStatus('Building the PDF on this device…');
        generatePdf().then(function (result) {
            var certEl = document.getElementById('certificate-no');
            if (certEl && !String(certEl.value || '').trim()) certEl.value = result.certNo;
            downloadBytes(result.bytes, fileName(result.certNo, val('inspection-date')));
            setStatus('Saved. Check your downloads. Nothing was uploaded.');
        }).catch(function (e) {
            setStatus(e.message || 'Could not build the PDF.', true);
        }).then(function () {
            generateBtn.disabled = false;
        });
    });
}());
