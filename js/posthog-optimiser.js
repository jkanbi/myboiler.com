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

    var started = false;
    var resultViewed = false;
    var completed = {};

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

    function captureStarted() {
        if (started) return;
        started = true;
        capture('optimiser_started');
    }

    function captureStep(step, name, extra) {
        if (completed[name]) return;
        completed[name] = true;
        var props = { step: step, step_name: name };
        if (extra) {
            Object.keys(extra).forEach(function (key) {
                props[key] = extra[key];
            });
        }
        capture('optimiser_step_completed', props);
    }

    function captureResult() {
        if (resultViewed) return;
        resultViewed = true;
        capture('optimiser_result_viewed', resultProperties());
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
        var done = document.getElementById('tool-confirm-done');
        var button = document.getElementById('tool-confirm-submit');
        if (!form || !fromInput || !setInput) return;
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

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (submitted) return;
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
            var props = resultProperties();
            props.from_flow = fromFlow;
            props.set_flow = setFlow;
            props.annual_kwh = annualKwh;
            props.unit_rate = unitRate;
            props.tool_flow = numericAttr(form, 'data-tool-flow');
            props.saving_gbp = numericAttr(form, 'data-saving-gbp');
            props.space_kwh = numericAttr(form, 'data-space-kwh');
            if (props.tool_flow === null) {
                var slider = document.getElementById('flow-temp');
                var toolFlow = slider ? Number(slider.value) : NaN;
                props.tool_flow = isFinite(toolFlow) ? toolFlow : null;
            }
            capture('optimiser_flow_turned_down', props);
            captureStep(10, 'flow_turned_down');
            form.classList.add('is-done');
            fromInput.disabled = true;
            setInput.disabled = true;
            if (kwhInput) kwhInput.disabled = true;
            if (rateInput) rateInput.disabled = true;
            if (button) button.disabled = true;
            if (done) {
                done.hidden = false;
                var parts = ['it was ' + fromFlow + '°C', 'you set it to ' + setFlow + '°C'];
                if (annualKwh !== null) parts.push('annual use is ' + Math.round(annualKwh) + ' kWh');
                if (unitRate !== null) parts.push('unit rate is ' + unitRate + ' p/kWh');
                var last = parts.pop();
                done.textContent = 'Thanks. We logged that ' + (parts.length ? parts.join(', ') + ', and ' + last : last) + '.';
            }
        });
    }

    function ctaDest(href) {
        var url;
        try {
            url = new URL(href, location.origin);
        } catch (err) {
            return 'other';
        }
        if (url.pathname.indexOf('/heat-pump-checker') === 0) return 'heat_pump_checker';
        if (url.pathname.indexOf('/boiler-optimiser-advance-power-output') === 0) return 'power_output';
        if (url.pathname.indexOf('/quote') === 0) {
            var need = url.searchParams.get('need') || '';
            if (need === 'boiler-replacement') return 'quote_boiler_replacement';
            if (need === 'heat-pump') return 'quote_heat_pump';
            return 'quote';
        }
        return '';
    }

    function ctaLabel(link) {
        if (link.id === 'heat-pump-checker-link') return 'heat_pump_checker';
        var text = (link.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length > 60) text = text.slice(0, 60);
        return text || 'cta';
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

    function anonymousConfig() {
        return {
            api_host: API_HOST,
            ui_host: UI_HOST,
            person_profiles: 'identified_only',
            autocapture: false,
            capture_pageview: true,
            disable_surveys: true,
            persistence: 'memory',
            disable_session_recording: true,
            session_recording: recordingConfig()
        };
    }

    function fullConfig() {
        return {
            api_host: API_HOST,
            ui_host: UI_HOST,
            person_profiles: 'identified_only',
            autocapture: true,
            capture_pageview: true,
            disable_surveys: true,
            persistence: 'localStorage+cookie',
            disable_session_recording: false,
            session_recording: recordingConfig()
        };
    }

    function startPosthog(mode) {
        loadSnippet();
        window.posthog.init(TOKEN, mode === 'full' ? fullConfig() : anonymousConfig());
        captureStarted();
    }

    function enableFullMode() {
        if (!window.posthog || typeof window.posthog.set_config !== 'function') {
            startPosthog('full');
            return;
        }
        window.posthog.set_config({
            persistence: 'localStorage+cookie',
            autocapture: true,
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

    function bindFunnel() {
        document.addEventListener('click', function (event) {
            var boiler = event.target.closest('[data-boiler]');
            if (boiler) {
                captureStep(1, 'boiler_type');
                if (boiler.getAttribute('data-boiler') === 'standard') captureResult();
            }
            var system = event.target.closest('[data-system]');
            if (system) {
                captureStep(2, 'system_type');
                if (system.getAttribute('data-system') === 'combi-cylinder') captureResult();
            }
            if (event.target.closest('[data-gas-cooking]')) captureStep(3, 'bill_inputs');
            if (event.target.closest('#advanced-toggle') || event.target.closest('a[href*="/boiler-optimiser-advance-power-output"]')) {
                captureStep(5, 'advanced');
                captureResult();
            }
            if (event.target.closest('#output-auto')) captureStep(7, 'heating_output');
            var brandTile = event.target.closest('[data-brand]');
            if (brandTile) {
                var brandKey = brandTile.getAttribute('data-brand') || '';
                var brandLabel = brandTile.getAttribute('aria-label') || brandKey;
                var hasHowTo = brandKey === 'worcester' || brandKey === 'vaillant' || brandKey === 'main' || brandKey === 'intergas';
                capture('optimiser_brand_selected', {
                    brand: brandKey,
                    brand_label: brandLabel,
                    has_how_to: hasHowTo
                });
                captureStep(8, 'brand', { brand: brandKey, brand_label: brandLabel });
            }
            if (event.target.closest('[data-model]')) captureStep(9, 'model');

            var summary = event.target.closest('#tool-results > summary, #bill-card > summary');
            if (summary) {
                if (summary.parentElement.id === 'bill-card') captureStep(3, 'bill_inputs');
                if (summary.parentElement.id === 'tool-results') captureResult();
            }

            var link = event.target.closest('a');
            if (!link) return;
            var dest = ctaDest(link.getAttribute('href') || '');
            if (!dest) return;
            capture('optimiser_cta_clicked', { cta: ctaLabel(link), dest: dest });
        });

        document.addEventListener('input', function (event) {
            var id = event.target && event.target.id;
            if (id === 'annual-kwh' || id === 'unit-rate') {
                captureStep(3, 'bill_inputs', {
                    unit_rate: unitRateFrom(document.getElementById('unit-rate'))
                });
            }
            if (id === 'flow-temp') {
                captureStep(4, 'flow_temperature');
                captureResult();
            }
            if (id === 'heat-loss') captureStep(6, 'heat_loss');
            if (id === 'boiler-kw') captureStep(7, 'heating_output');
        });
    }

    ready(function () {
        bindFunnel();
        bindConfirm();
        var choiceMade = storedChoice();
        if (choiceMade === 'accepted') {
            startPosthog('full');
        } else {
            startPosthog('anonymous');
            if (choiceMade !== 'declined') showBanner();
        }
        if (path.indexOf('/boiler-optimiser-advance-power-output') === 0) captureStep(5, 'advanced');
    });
})();
