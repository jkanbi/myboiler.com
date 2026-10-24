/* Boiler Optimiser only. Replace __POSTHOG_PROJECT_TOKEN__ with the live project token. */
(function () {
    var TOKEN = '__POSTHOG_PROJECT_TOKEN__';
    var API_HOST = 'https://eu.i.posthog.com';
    var UI_HOST = 'https://eu.posthog.com';
    var STORAGE_KEY = 'mb_optimiser_posthog';
    var MASK_TEXT_SELECTOR = [
        '.result-value',
        '.bill-results',
        '#tool-results',
        '#plan',
        '#heat-pump-size',
        '#space-heating-kwh',
        '#heat-loss-range',
        '[data-ph-mask]',
        '[id*="postcode"]',
        '[name*="postcode"]',
        '[autocomplete="postal-code"]'
    ].join(', ');

    var path = (location.pathname || '').replace(/\/+$/, '');
    if (path !== '/boiler-optimiser' && path.indexOf('/boiler-optimiser/') !== 0) {
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
            recommendation_category: recommendationCategory()
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

    function captureStep(step, name) {
        if (completed[name]) return;
        completed[name] = true;
        capture('optimiser_step_completed', { step: step, step_name: name });
    }

    function captureResult() {
        if (resultViewed) return;
        resultViewed = true;
        capture('optimiser_result_viewed', resultProperties());
    }

    function ctaDest(href) {
        var url;
        try {
            url = new URL(href, location.origin);
        } catch (err) {
            return 'other';
        }
        if (url.pathname.indexOf('/heat-pump-checker') === 0) return 'heat_pump_checker';
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

    function startPosthog() {
        loadSnippet();
        window.posthog.init(TOKEN, {
            api_host: API_HOST,
            ui_host: UI_HOST,
            person_profiles: 'identified_only',
            autocapture: true,
            capture_pageview: true,
            disable_surveys: true,
            persistence: 'localStorage+cookie',
            session_recording: {
                maskAllInputs: true,
                maskTextSelector: MASK_TEXT_SELECTOR
            }
        });
        captureStarted();
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
            '.optimiser-consent__text a{color:var(--accent);font-weight:500;}',
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
            startPosthog();
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
            if (event.target.closest('#advanced-toggle')) {
                captureStep(5, 'advanced');
                captureResult();
            }
            if (event.target.closest('#output-auto')) captureStep(7, 'heating_output');
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
            if (id === 'annual-kwh' || id === 'unit-rate') captureStep(3, 'bill_inputs');
            if (id === 'flow-temp') {
                captureStep(4, 'flow_temperature');
                captureResult();
            }
            if (id === 'heat-loss') captureStep(6, 'heat_loss');
            if (id === 'boiler-kw') captureStep(7, 'heating_output');
        });

        document.addEventListener('change', function (event) {
            if (event.target && event.target.id === 'brand') captureStep(8, 'brand');
        });
    }

    ready(function () {
        bindFunnel();
        var choiceMade = storedChoice();
        if (choiceMade === 'accepted') {
            startPosthog();
            return;
        }
        if (choiceMade === 'declined') return;
        showBanner();
    });
})();
