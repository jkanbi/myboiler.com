/* Boiler Optimiser only. Replace phc_s4op4bcQEy4zkZJBE9Rr6THsUkoYmdm4jFzKjUeup7Q4 with the live project token. */
(function () {
    var TOKEN = 'phc_s4op4bcQEy4zkZJBE9Rr6THsUkoYmdm4jFzKjUeup7Q4';
    var API_HOST = 'https://eu.i.posthog.com';
    var UI_HOST = 'https://eu.posthog.com';
    var STORAGE_KEY = 'mb_optimiser_posthog';

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
        if (!form || !fromInput || !setInput || !brandInput) return;
        if (form.dataset.phBound === '1') return;
        form.dataset.phBound = '1';
        var submitted = false;

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
                props.space_kwh = metrics.space_kwh;
            } else {
                props.saving_gbp = numericAttr(form, 'data-saving-gbp');
                props.space_kwh = numericAttr(form, 'data-space-kwh');
            }
            capture('optimiser_flow_turned_down', props);
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
        });
    }

    var BRANDS_WITH_VIDEOS = { worcester: 1, vaillant: 1, main: 1, intergas: 1 };

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

    function anonymousConfig() {
        var config = dashboardConfig();
        config.api_host = API_HOST;
        config.ui_host = UI_HOST;
        config.persistence = 'memory';
        config.disable_session_recording = true;
        config.session_recording = recordingConfig();
        return config;
    }

    function fullConfig() {
        var config = dashboardConfig();
        config.api_host = API_HOST;
        config.ui_host = UI_HOST;
        config.persistence = 'localStorage+cookie';
        config.disable_session_recording = false;
        config.session_recording = recordingConfig();
        return config;
    }

    function startPosthog(mode) {
        loadSnippet();
        window.posthog.init(TOKEN, mode === 'full' ? fullConfig() : anonymousConfig());
    }

    function enableFullMode() {
        if (!window.posthog || typeof window.posthog.set_config !== 'function') {
            startPosthog('full');
            return;
        }
        window.posthog.set_config({
            persistence: 'localStorage+cookie',
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            disable_session_recording: false,
            session_recording: recordingConfig()
        });
        if (typeof window.posthog.startSessionRecording === 'function') {
            window.posthog.startSessionRecording();
        }
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

    function injectStyles() {
        if (document.getElementById('optimiser-consent-style')) return;
        var style = document.createElement('style');
        style.id = 'optimiser-consent-style';
        style.textContent = [
            '.optimiser-consent{position:fixed;left:0;right:0;bottom:0;z-index:1100;background:var(--surface);border-top:1px solid var(--border);box-shadow:var(--shadow-md);padding:0.75rem var(--page-inline,16px);}',
            '.optimiser-consent__inner{max-width:var(--max-width,1024px);margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:0.65rem 1rem;}',
            '.optimiser-consent__text{flex:1 1 16rem;margin:0;font-size:0.875rem;line-height:1.45;color:var(--text);}',
            '.optimiser-consent__actions{display:flex;flex-wrap:wrap;gap:0.45rem;}',
            '.optimiser-consent button{min-height:2.5rem;padding:0.45rem 0.95rem;font:inherit;font-size:0.875rem;font-weight:600;border-radius:var(--radius);cursor:pointer;}',
            '.optimiser-consent__accept{background:var(--accent);color:#fff;border:2px solid var(--accent);}',
            '.optimiser-consent__decline{background:var(--surface);color:var(--text);border:2px solid var(--border);}',
            'body.optimiser-consent-open{padding-bottom:7.5rem;}',
            '@media (max-width:640px){body.optimiser-consent-open{padding-bottom:10.5rem;}.optimiser-consent{padding:0.7rem 16px;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function hideBanner(banner) {
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
        document.body.classList.remove('optimiser-consent-open');
    }

    function showBanner() {
        injectStyles();
        if (document.querySelector('.optimiser-consent')) return;
        var banner = document.createElement('div');
        banner.className = 'optimiser-consent';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Analytics consent');
        banner.innerHTML =
            '<div class="optimiser-consent__inner">' +
                '<p class="optimiser-consent__text">We\'d like to record how you use the Boiler Optimiser, only to improve the tool. No personal data is stored, and all recordings will be deleted once the tool is finished.</p>' +
                '<div class="optimiser-consent__actions">' +
                    '<button type="button" class="optimiser-consent__accept">Accept</button>' +
                    '<button type="button" class="optimiser-consent__decline">No thanks</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(banner);
        document.body.classList.add('optimiser-consent-open');
        banner.querySelector('.optimiser-consent__accept').addEventListener('click', function () {
            storeChoice('accepted');
            hideBanner(banner);
            enableFullMode();
        });
        banner.querySelector('.optimiser-consent__decline').addEventListener('click', function () {
            storeChoice('declined');
            hideBanner(banner);
        });
    }

    ready(function () {
        bindConfirm();
        bindBrandVideos();
        var choiceMade = storedChoice();
        if (choiceMade === 'accepted') {
            startPosthog('full');
        } else {
            startPosthog('anonymous');
            if (choiceMade !== 'declined') showBanner();
        }
    });
})();
