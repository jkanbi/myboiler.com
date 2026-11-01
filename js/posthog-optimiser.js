/* Boiler Optimiser only. Replace phc_s4op4bcQEy4zkZJBE9Rr6THsUkoYmdm4jFzKjUeup7Q4 with the live project token. */
(function () {
    var TOKEN = 'phc_s4op4bcQEy4zkZJBE9Rr6THsUkoYmdm4jFzKjUeup7Q4';
    var API_HOST = 'https://eu.i.posthog.com';
    var UI_HOST = 'https://eu.posthog.com';
    var STORAGE_KEY = 'mb_optimiser_posthog';
    var DISMISS_KEY = 'mb_optimiser_consent_dismissed';
    var TURNED_DOWN_KEY = 'mb_optimiser_turned_down';
    var DID_IT_WORK_KEY = 'mb_optimiser_did_it_work';
    var STORE_ENDPOINT = '/api/optimiser-feedback';
    var PIXEL_ID = 'nvyf0';
    var xLoaded = false;
    var DID_IT_WORK_TIPS = {
        yes: 'Great. If you have a condensing boiler, try the next step down, about 5°C lower.',
        cool: 'Turn it back up about 5°C, or half a number on a dial.',
        not_yet: 'No problem. Come back once you\'ve tried it for a few days.'
    };

    var path = (location.pathname || '').replace(/\/+$/, '');
    if (path.indexOf('/boiler-optimiser') !== 0) {
        return;
    }

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    function choice(attr) {
        var el = document.querySelector('[' + attr + '].active');
        return el ? el.getAttribute(attr) : '';
    }

    function recommendationCategory() {
        var boiler = choice('data-boiler') || 'condensing';
        var system = choice('data-system') || 'combi';
        if (boiler === 'standard') return 'replacement';
        if (system === 'combi-cylinder') return 'needs_review';
        var flowEl = document.getElementById('flow-temp');
        var flow = flowEl ? Number(flowEl.value) : NaN;
        if (system === 'system') return 'stored_hot_water';
        if (flow <= 65) return 'fully_condensing';
        if (flow <= 75) return 'partially_condensing';
        return 'high_flow';
    }

    function resultProperties() {
        return {
            boiler_type: choice('data-boiler') || 'condensing',
            system: choice('data-system') || 'combi',
            recommendation_category: recommendationCategory(),
            unit_rate: unitRateFrom(document.getElementById('unit-rate'))
        };
    }

    function capture(event, properties) {
        if (!window.posthog || typeof window.posthog.capture !== 'function') return;
        window.posthog.capture(event, properties || {});
    }

    function hasAcceptedConsent() {
        return storedChoice() === 'accepted';
    }

    function readStorage(key) {
        try {
            return localStorage.getItem(key) || '';
        } catch (err) {
            return '';
        }
    }

    function writeStorage(key, value) {
        if (!hasAcceptedConsent()) return;
        try {
            localStorage.setItem(key, value);
        } catch (err) { /* private mode */ }
    }

    function sendStore(payload) {
        var body;
        try {
            body = JSON.stringify(payload);
        } catch (err) {
            return;
        }
        if (body.length > 1800) return;
        try {
            if (navigator.sendBeacon) {
                var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
                if (navigator.sendBeacon(STORE_ENDPOINT, blob)) return;
            }
        } catch (err) {}
        try {
            fetch(STORE_ENDPOINT, {
                method: 'POST',
                body: body,
                headers: { 'Content-Type': 'text/plain' },
                keepalive: true,
                credentials: 'omit',
                mode: 'same-origin',
                cache: 'no-store'
            }).catch(function () {});
        } catch (err) {}
    }

    function numericAttr(el, name) {
        if (!el) return null;
        var n = Number(el.getAttribute(name));
        return isFinite(n) ? n : null;
    }

    function validFlow(n) {
        return isFinite(n) && n >= 35 && n <= 90;
    }

    function validKwh(n) {
        return isFinite(n) && n >= 0 && n <= 200000;
    }

    function validRate(n) {
        return isFinite(n) && n >= 0 && n <= 100;
    }

    function unitRateFrom(el) {
        if (!el || el.value.trim() === '') return null;
        var n = Number(el.value);
        return validRate(n) ? n : null;
    }

    function bindConfirm() {
        var form = document.getElementById('tool-confirm');
        var fromInput = document.getElementById('from-flow');
        var setInput = document.getElementById('set-flow');
        var kwhInput = document.getElementById('confirm-kwh');
        var rateInput = document.getElementById('confirm-rate');
        var brandInput = document.getElementById('confirm-brand');
        var done = document.getElementById('tool-confirm-done');
        var button = document.getElementById('tool-confirm-submit');
        var checkback = document.getElementById('tool-confirm-checkback');
        var checkbackTip = document.getElementById('tool-confirm-checkback-tip');
        var alreadyWrap = document.getElementById('tool-confirm-already-wrap');
        var alreadyBtn = document.getElementById('tool-confirm-already');
        if (!form || !fromInput || !setInput || !brandInput) return;
        if (form.dataset.phBound === '1') return;
        form.dataset.phBound = '1';
        var submitted = false;

        function formContext() {
            var brandKey = brandInput.value || '';
            var brandLabel = '';
            var selected = brandInput.options[brandInput.selectedIndex];
            if (selected && selected.value === brandKey) brandLabel = selected.text;
            var fromFlow = Number(fromInput.value);
            var setFlow = Number(setInput.value);
            return {
                brand: brandKey,
                brand_label: brandLabel || brandKey,
                from_flow: validFlow(fromFlow) ? fromFlow : null,
                set_flow: validFlow(setFlow) ? setFlow : null,
                path: location.pathname || '/boiler-optimiser/'
            };
        }

        function showCheckback() {
            form.classList.add('is-done');
            if (alreadyWrap) alreadyWrap.hidden = true;
            if (checkback) checkback.hidden = false;
            if (done) done.hidden = true;
        }

        function showCheckbackTip(answer) {
            var tip = DID_IT_WORK_TIPS[answer] || '';
            showCheckback();
            form.classList.add('is-checkback-answered');
            if (checkbackTip) {
                checkbackTip.hidden = !tip;
                checkbackTip.textContent = tip;
            }
        }

        function recordDidItWork(answer) {
            if (!DID_IT_WORK_TIPS[answer] || form.dataset.didItWork === '1') return;
            form.dataset.didItWork = '1';
            var ctx = formContext();
            sendStore({
                t: Date.now(),
                type: 'did_it_work',
                answer: answer,
                path: ctx.path,
                brand: ctx.brand,
                from_flow: ctx.from_flow,
                set_flow: ctx.set_flow
            });
            if (hasAcceptedConsent()) {
                writeStorage(DID_IT_WORK_KEY, answer);
                capture('optimiser_did_it_work', { answer: answer, section: 'confirm_form' });
            }
            showCheckbackTip(answer);
        }

        fromInput.addEventListener('input', function () {
            fromInput.dataset.edited = '1';
        });
        setInput.addEventListener('input', function () {
            setInput.dataset.edited = '1';
        });
        if (kwhInput) {
            kwhInput.addEventListener('input', function () {
                kwhInput.dataset.edited = '1';
            });
        }
        if (rateInput) {
            rateInput.addEventListener('input', function () {
                rateInput.dataset.edited = '1';
            });
        }
        brandInput.addEventListener('change', function () {
            brandInput.dataset.edited = '1';
        });

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (submitted) return;
            var brandKey = brandInput.value || '';
            if (!brandKey) {
                if (typeof brandInput.reportValidity === 'function') brandInput.reportValidity();
                else brandInput.focus();
                return;
            }
            var fromFlow = Number(fromInput.value);
            var setFlow = Number(setInput.value);
            var annualKwh = kwhInput && kwhInput.value.trim() !== '' ? Number(kwhInput.value) : null;
            var unitRate = unitRateFrom(rateInput);
            if (unitRate === null) unitRate = numericAttr(form, 'data-unit-rate');
            if (unitRate === null) unitRate = unitRateFrom(document.getElementById('unit-rate'));
            if (!validFlow(fromFlow)) {
                fromInput.focus();
                return;
            }
            if (!validFlow(setFlow)) {
                setInput.focus();
                return;
            }
            if (annualKwh !== null && !validKwh(annualKwh)) {
                if (kwhInput) kwhInput.focus();
                return;
            }
            if (rateInput && rateInput.value.trim() !== '' && !validRate(Number(rateInput.value))) {
                rateInput.focus();
                return;
            }
            if (setFlow > fromFlow) {
                var raiseNote = document.getElementById('tool-confirm-raise');
                if (raiseNote) raiseNote.hidden = false;
                var proceed = window.confirm(
                    'Aim lower if you can. Raising the flow temperature is worse long term: it uses more gas, is harder on the boiler, and future heating system changes may be needed.\n\nSubmit this higher setting anyway?'
                );
                if (!proceed) {
                    setInput.focus();
                    return;
                }
            }
            submitted = true;
            var brandLabel = '';
            var selected = brandInput.options[brandInput.selectedIndex];
            if (selected && selected.value === brandKey) brandLabel = selected.text;
            var props = resultProperties();
            props.from_flow = fromFlow;
            props.set_flow = setFlow;
            props.annual_kwh = annualKwh;
            props.unit_rate = unitRate;
            props.brand = brandKey;
            props.brand_label = brandLabel || brandKey;
            props.section = 'confirm_form';
            props.tool_flow = numericAttr(form, 'data-tool-flow');
            if (props.tool_flow === null) {
                var slider = document.getElementById('flow-temp');
                var toolFlow = slider ? Number(slider.value) : NaN;
                props.tool_flow = isFinite(toolFlow) ? toolFlow : null;
            }
            var metrics = typeof window.mbOptimiserConfirmMetrics === 'function'
                ? window.mbOptimiserConfirmMetrics(fromFlow, setFlow, annualKwh, unitRate)
                : null;
            if (metrics) {
                props.saving_gbp = metrics.saving_gbp;
                props.saving_kwh = metrics.saving_kwh;
                props.space_kwh = metrics.space_kwh;
            } else {
                props.saving_gbp = numericAttr(form, 'data-saving-gbp');
                props.saving_kwh = numericAttr(form, 'data-saving-kwh');
                props.space_kwh = numericAttr(form, 'data-space-kwh');
            }
            capture('optimiser_flow_turned_down', props);
            sendStore({
                t: Date.now(),
                type: 'turned_down',
                path: location.pathname || '/boiler-optimiser/',
                brand: brandKey,
                from_flow: fromFlow,
                set_flow: setFlow
            });
            writeStorage(TURNED_DOWN_KEY, '1');
            form.classList.add('is-done');
            fromInput.disabled = true;
            setInput.disabled = true;
            brandInput.disabled = true;
            if (kwhInput) kwhInput.disabled = true;
            if (rateInput) rateInput.disabled = true;
            if (button) button.disabled = true;
            if (done) {
                done.hidden = false;
                var parts = ['it was ' + fromFlow + '°C', 'you set it to ' + setFlow + '°C'];
                if (brandLabel) parts.push('the brand is ' + brandLabel);
                if (annualKwh !== null) parts.push('annual use is ' + Math.round(annualKwh) + ' kWh');
                if (unitRate !== null) parts.push('unit rate is ' + unitRate + ' p/kWh');
                var last = parts.pop();
                done.textContent = 'Thanks. We logged that ' + (parts.length ? parts.join(', ') + ', and ' + last : last) + '.';
            }
            showCheckback();
        });
        form.querySelectorAll('[data-did-it-work]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                recordDidItWork(btn.getAttribute('data-did-it-work') || '');
            });
        });
        if (alreadyBtn) {
            alreadyBtn.addEventListener('click', function () {
                showCheckback();
            });
        }
        if (hasAcceptedConsent() && readStorage(TURNED_DOWN_KEY) === '1') {
            submitted = true;
            fromInput.disabled = true;
            setInput.disabled = true;
            brandInput.disabled = true;
            if (kwhInput) kwhInput.disabled = true;
            if (rateInput) rateInput.disabled = true;
            if (button) button.disabled = true;
            var savedAnswer = readStorage(DID_IT_WORK_KEY);
            if (savedAnswer && DID_IT_WORK_TIPS[savedAnswer]) showCheckbackTip(savedAnswer);
            else showCheckback();
        }
    }

    var BRANDS_WITH_VIDEOS = { worcester: 1, vaillant: 1, main: 1, intergas: 1, baxi: 1, ideal: 1, potterton: 1 };

    function bindBrandVideos() {
        var picks = document.getElementById('brand-picks');
        if (!picks) return;
        picks.addEventListener('click', function (event) {
            var tile = event.target.closest('[data-brand]');
            if (!tile || !picks.contains(tile)) return;
            var brandKey = tile.getAttribute('data-brand') || '';
            if (!brandKey) return;
            capture('optimiser_brand_selected', {
                brand: brandKey,
                brand_label: tile.getAttribute('aria-label') || brandKey,
                has_how_to: !!BRANDS_WITH_VIDEOS[brandKey],
                section: 'how_to_videos'
            });
        });
    }

    function loadSnippet() {
        if (window.posthog && window.posthog.__SV) return;
        /* Official PostHog array.js snippet, with data-cfasync=false for Cloudflare Rocket Loader. */
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.setAttribute("data-cfasync","false"),p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    }

    function recordingConfig() {
        return {
            maskAllInputs: false,
            maskInputOptions: {
                password: true,
                email: true,
                tel: true
            },
            maskAllText: false,
            mask_all_text: false
        };
    }

    function dashboardConfig() {
        return {
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            disable_surveys: true,
            person_profiles: 'identified_only'
        };
    }

    function fullConfig() {
        var config = dashboardConfig();
        config.api_host = API_HOST;
        config.ui_host = UI_HOST;
        config.persistence = 'localStorage+cookie';
        config.opt_out_capturing_by_default = false;
        config.disable_session_recording = false;
        config.session_recording = recordingConfig();
        return config;
    }

    function startFullMode() {
        loadXPixel();
        loadSnippet();
        if (!window.posthog || typeof window.posthog.init !== 'function') return;
        if (window.posthog.__loaded || window.posthog._i && window.posthog._i.length) {
            if (typeof window.posthog.set_config === 'function') {
                window.posthog.set_config({
                    persistence: 'localStorage+cookie',
                    autocapture: false,
                    capture_pageview: false,
                    capture_pageleave: false,
                    disable_session_recording: false,
                    session_recording: recordingConfig()
                });
            }
        } else {
            window.posthog.init(TOKEN, fullConfig());
        }
        if (typeof window.posthog.opt_in_capturing === 'function') {
            window.posthog.opt_in_capturing();
        }
        if (typeof window.posthog.startSessionRecording === 'function') {
            window.posthog.startSessionRecording();
        }
    }

    function expireNamedCookie(name) {
        var host = location.hostname || '';
        var domains = ['', host];
        if (host) domains.push('.' + host);
        var apex = host.replace(/^www\./, '');
        if (apex && apex !== host) {
            domains.push(apex);
            domains.push('.' + apex);
        }
        domains.push('.myboiler.com');
        var unique = [];
        domains.forEach(function (domain) {
            if (unique.indexOf(domain) === -1) unique.push(domain);
        });
        unique.forEach(function (domain) {
            var extra = domain ? ';domain=' + domain : '';
            try {
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;Max-Age=0' + extra;
            } catch (err) {}
            try {
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;Max-Age=0;Secure;SameSite=Lax' + extra;
            } catch (err) {}
        });
    }

    function clearTwCookies() {
        var names = { _twsid: 1, _twpid: 1, _twclid: 1, personalization_id: 1 };
        try {
            document.cookie.split(';').forEach(function (part) {
                var name = part.split('=')[0].trim();
                if (name && (names[name] || name.indexOf('_tw') === 0)) names[name] = 1;
            });
        } catch (err) { /* ignore */ }
        Object.keys(names).forEach(expireNamedCookie);
    }

    function loadXPixel() {
        if (xLoaded) return;
        xLoaded = true;
        try {
            document.querySelectorAll('script[src*="ads-twitter.com/uwt.js"]').forEach(function (el) {
                if (el.parentNode) el.parentNode.removeChild(el);
            });
        } catch (err) { /* ignore */ }
        try { delete window.twq; } catch (err) {
            try { window.twq = undefined; } catch (err2) {}
        }
        !function (e, t, n, s, u, a) {
            e.twq || (s = e.twq = function () {
                s.exe ? s.exe.apply(s, arguments) : s.queue.push(arguments);
            }, s.version = '1.1', s.queue = [], u = t.createElement(n), u.async = !0,
            u.src = 'https://static.ads-twitter.com/uwt.js',
            a = t.getElementsByTagName(n)[0], a.parentNode.insertBefore(u, a));
        }(window, document, 'script');
        if (typeof window.twq === 'function') window.twq('config', PIXEL_ID);
    }

    function disableXPixel() {
        xLoaded = false;
        try { window.twq = function () {}; } catch (err) {}
        clearTwCookies();
    }

    function clearPhStorage() {
        function expireCookie(name) {
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
        }
        try {
            document.cookie.split(';').forEach(function (part) {
                var name = part.split('=')[0].trim();
                if (!name) return;
                if (name.indexOf('ph_') === 0 || name.indexOf('phc_') === 0 || name.indexOf('__ph_') === 0) expireCookie(name);
            });
        } catch (err) { /* ignore */ }
        function wipeStore(store) {
            if (!store) return;
            var keys = [];
            for (var i = 0; i < store.length; i++) {
                var key = store.key(i);
                if (key && (key.indexOf('ph_') === 0 || key.indexOf('__ph_') === 0)) keys.push(key);
            }
            keys.forEach(function (key) { store.removeItem(key); });
        }
        try { wipeStore(window.localStorage); } catch (err) { /* ignore */ }
        try { wipeStore(window.sessionStorage); } catch (err) { /* ignore */ }
    }

    function optOutAndClear() {
        storeChoice('declined');
        if (window.posthog) {
            if (typeof window.posthog.stopSessionRecording === 'function') {
                window.posthog.stopSessionRecording();
            }
            if (typeof window.posthog.opt_out_capturing === 'function') {
                window.posthog.opt_out_capturing();
            }
            if (typeof window.posthog.set_config === 'function') {
                window.posthog.set_config({
                    persistence: 'memory',
                    disable_session_recording: true
                });
            }
        }
        clearPhStorage();
        disableXPixel();
    }

    function storedChoice() {
        try {
            return localStorage.getItem(STORAGE_KEY) || '';
        } catch (err) {
            return '';
        }
    }

    function storeChoice(value) {
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (err) { /* private mode */ }
    }

    function sessionDismissed() {
        try {
            return sessionStorage.getItem(DISMISS_KEY) === '1';
        } catch (err) {
            return false;
        }
    }

    function markSessionDismissed() {
        try {
            sessionStorage.setItem(DISMISS_KEY, '1');
        } catch (err) { /* private mode */ }
    }

    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function injectStyles() {
        if (document.getElementById('optimiser-consent-style')) return;
        var style = document.createElement('style');
        style.id = 'optimiser-consent-style';
        style.textContent = [
            'html.optimiser-consent-open body{padding-bottom:2.75rem;}',
            '.optimiser-consent{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--surface);border-top:1px solid var(--border);box-shadow:0 -1px 4px rgba(15,23,42,0.06);padding:0.35rem var(--page-inline,16px);pointer-events:auto;transform:translateY(100%);}',
            '.optimiser-consent.is-visible{transform:translateY(0);transition:transform 0.35s ease;}',
            '.optimiser-consent__inner{max-width:var(--max-width,1024px);margin:0 auto;display:flex;flex-wrap:nowrap;align-items:center;gap:0.5rem 0.75rem;}',
            '.optimiser-consent__text{flex:1 1 auto;min-width:0;margin:0;font-size:0.75rem;line-height:1.35;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.optimiser-consent__actions{display:flex;flex-wrap:nowrap;align-items:center;gap:0.35rem;flex:0 0 auto;}',
            '.optimiser-consent button{font:inherit;font-size:0.75rem;font-weight:600;cursor:pointer;box-sizing:border-box;border-radius:var(--radius);}',
            '.optimiser-consent__accept,.optimiser-consent__decline{min-height:1.7rem;min-width:4.4rem;padding:0.15rem 0.55rem;border:1px solid var(--text);background:var(--surface);color:var(--text);}',
            '.optimiser-consent__dismiss{width:1.7rem;height:1.7rem;padding:0;border:0;background:transparent;color:var(--text);font-size:1.05rem;line-height:1;opacity:0.7;}',
            '.optimiser-consent__dismiss:hover,.optimiser-consent__dismiss:focus{opacity:1;}',
            '@media (max-width:640px){html.optimiser-consent-open body{padding-bottom:4.25rem;}.optimiser-consent{padding:0.3rem 10px 0.4rem;}.optimiser-consent__inner{flex-wrap:wrap;gap:0.2rem 0.5rem;}.optimiser-consent__text{flex:1 1 100%;white-space:normal;overflow:visible;text-overflow:unset;font-size:0.6875rem;line-height:1.3;}.optimiser-consent__actions{margin-left:auto;}.optimiser-consent__accept,.optimiser-consent__decline{min-width:3.8rem;min-height:1.6rem;font-size:0.6875rem;padding:0.12rem 0.45rem;}}',
            '@media (prefers-reduced-motion:reduce){.optimiser-consent,.optimiser-consent.is-visible{transform:none;transition:none;}}',
            '.optimiser-cookie-settings-wrap{margin:0.4rem 0 0;text-align:center;}',
            '.optimiser-cookie-settings{background:none;border:0;padding:0;color:inherit;font:inherit;font-size:0.8125rem;cursor:pointer;text-decoration:underline;}'
        ].join('');
        (document.head || document.documentElement).appendChild(style);
    }

    function reserveBannerSpace() {
        var choiceMade = storedChoice();
        if (choiceMade === 'accepted' || choiceMade === 'declined') return;
        if (sessionDismissed()) return;
        document.documentElement.classList.add('optimiser-consent-open');
    }

    function hideBanner(banner) {
        var bar = banner || document.querySelector('.optimiser-consent');
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        document.documentElement.classList.remove('optimiser-consent-open');
        if (document.body) document.body.classList.remove('optimiser-consent-open');
    }

    function dismissForSession(banner) {
        markSessionDismissed();
        hideBanner(banner);
    }

    function revealBanner(banner) {
        if (prefersReducedMotion()) {
            banner.classList.add('is-visible');
            return;
        }
        window.setTimeout(function () {
            window.requestAnimationFrame(function () {
                banner.classList.add('is-visible');
            });
        }, 280);
    }

    function showBanner() {
        injectStyles();
        if (document.querySelector('.optimiser-consent')) return;
        if (!document.body) return;
        var banner = document.createElement('div');
        banner.className = 'optimiser-consent';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Optional cookies');
        banner.innerHTML =
            '<div class="optimiser-consent__inner">' +
                '<p class="optimiser-consent__text">Optional cookies for PostHog analytics and X ads. Nothing is set unless you accept.</p>' +
                '<div class="optimiser-consent__actions">' +
                    '<button type="button" class="optimiser-consent__accept">Accept</button>' +
                    '<button type="button" class="optimiser-consent__decline">Opt out</button>' +
                    '<button type="button" class="optimiser-consent__dismiss" aria-label="Dismiss">&times;</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(banner);
        document.documentElement.classList.add('optimiser-consent-open');
        banner.querySelector('.optimiser-consent__accept').addEventListener('click', function () {
            storeChoice('accepted');
            hideBanner(banner);
            startFullMode();
        });
        banner.querySelector('.optimiser-consent__decline').addEventListener('click', function () {
            hideBanner(banner);
            optOutAndClear();
        });
        banner.querySelector('.optimiser-consent__dismiss').addEventListener('click', function () {
            dismissForSession(banner);
        });
        revealBanner(banner);
    }

    function placeCookieSettings() {
        injectStyles();
        var existing = document.querySelector('.optimiser-cookie-settings-wrap');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        var wrap = document.createElement('div');
        wrap.className = 'optimiser-cookie-settings-wrap';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'optimiser-cookie-settings';
        btn.textContent = 'Cookie settings';
        btn.addEventListener('click', showBanner);
        wrap.appendChild(btn);
        var host = document.getElementById('site-footer');
        var copyright = host && host.querySelector('footer.copyright:last-of-type');
        if (copyright) copyright.appendChild(wrap);
        else if (host) host.appendChild(wrap);
        else if (document.body) document.body.appendChild(wrap);
    }

    function hookFooter() {
        var original = window.installSiteFooter;
        if (typeof original !== 'function' || original.__mbConsentHooked) return;
        var wrapped = function () {
            original.call(window);
            placeCookieSettings();
        };
        wrapped.__mbConsentHooked = true;
        window.installSiteFooter = wrapped;
    }

    injectStyles();
    reserveBannerSpace();

    ready(function () {
        bindConfirm();
        bindBrandVideos();
        hookFooter();
        placeCookieSettings();
        var choiceMade = storedChoice();
        if (choiceMade === 'accepted') {
            startFullMode();
        } else if (choiceMade !== 'declined' && !sessionDismissed()) {
            showBanner();
        }
    });
})();
