(function () {
    var chevron =
        '<svg class="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
        '<path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z"/>' +
        '</svg>';

    window.SITE_NAV_HTML =
        '<ul class="nav-list">' +
        '<li class="nav-item"><a href="/repairs/"><span>Repairs</span></a></li>' +
        '<li class="nav-item"><a href="/boiler-cover/"><span>Boiler Cover</span></a></li>' +
        '<li class="nav-item"><a href="/choosing-a-new-boiler/"><span>New Boiler</span></a></li>' +
        '<li class="nav-item nav-item-has-dropdown">' +
        '<span class="nav-dropdown-label"><span>Advice</span>' + chevron + '</span>' +
        '<div class="mega-menu">' +
        '<div class="mega-menu-column">' +
        '<h4>Boilers</h4>' +
        '<a href="/money-and-energy-saving/">Money and Energy Saving</a>' +
        '<a href="/boiler-pressure/">Boiler Pressure</a>' +
        '<a href="https://boilerservice.com">Boiler Service</a>' +
        '<a href="/boiler-types/">Boiler Types</a>' +
        '<a href="/combi-boiler-problems/">Combi Boiler Problems</a>' +
        '<a href="/what-size-boiler/">What Size Boiler?</a>' +
        '<a href="/choosing-a-new-boiler/">Choosing a New Boiler</a>' +
        '<a href="/combi-boiler/choosing-a-new-combi-boiler/">Choosing a New Combi Boiler</a>' +
        '<a href="/what-is-a-gc-number/">What is a GC Number?</a>' +
        '<a href="/boiler-energy-efficiency/">Boiler Energy Efficiency</a>' +
        '<a href="/boiler-optimiser/">Boiler Optimiser</a>' +
        '<a href="/repairs/">Boiler Repairs</a>' +
        '<a href="/boiler-cover/">Boiler Cover</a>' +
        '<h4>OpenTherm &amp; Modulating Boilers</h4>' +
        '<a href="/opentherm/opentherm-boilers-and-controls/">OpenTherm &amp; Modulating Overview</a>' +
        '<a href="/opentherm/opentherm-boilers-and-controls/">OpenTherm Capable Boilers</a>' +
        '<a href="/opentherm/opentherm-boilers-and-controls/">OpenTherm Controls</a>' +
        '<a href="/smart-heating/modulating-a-rated-boilers-with-smart-modulating-thermostats/">Modulating Boilers &amp; Smart Controls</a>' +
        '<a href="/opentherm/vaillant-opentherm/">Vaillant OpenTherm Guide</a>' +
        '<a href="/opentherm/worcester-bosch-opentherm/">Worcester OpenTherm Guide</a>' +
        '</div>' +
        '<div class="mega-menu-column">' +
        '<h4>Heat Pumps</h4>' +
        '<a href="/heat-pumps/">Heat Pumps Overview</a>' +
        '<a href="/heat-pump-top-10/">Heat Pump Top 10</a>' +
        '<a href="/calculators/heat-pump-cop-breakeven-calculator/">Heat Pump COP Breakeven</a>' +
        '<a href="/heat-pumps/retrofit-an-existing-hot-water-cylinder-with-a-plate-heat-exchanger-for-use-with-a-heat-pump/">Heat Pump Cylinder Retrofit</a>' +
        '<a href="/heat-pumps/air-source-heat-pumps/">Air Source Heat Pump</a>' +
        '<a href="/heat-pumps/hybrid-heat-pumps/">Hybrid Heat Pumps</a>' +
        '<a href="/why-heat-pumps-work-well-with-underfloor-heating/">Heat Pumps and Underfloor Heating</a>' +
        '<a href="/underfloor-heating-vs-radiators/">UFH vs Radiators</a>' +
        '<a href="/towel-radiators/">Towel Radiators</a>' +
        '<a href="/heat-meter/">Heat Meters</a>' +
        '</div>' +
        '<div class="mega-menu-column">' +
        '<h4>Miscellaneous</h4>' +
        '<a href="/vaillant/how-to-adjust-the-flow-temperature-on-vaillant-ecotec-post-2012-models/">Flow Temperature &amp; Power</a>' +
        '<a href="/solar-thermal/">Solar Thermal Heating</a>' +
        '<a href="/solar-thermal/">Solar Thermal Servicing</a>' +
        '<a href="/intasol-combi-diverter-valve/">Intasol Combi Diverter Valve</a>' +
        '<a href="/s-plan/">S Plan Heating Systems</a>' +
        '<a href="/priority-domestic-hot-water/">Priority Domestic Hot Water</a>' +
        '<a href="/quote/">Get a Quote</a>' +
        '</div>' +
        '</div>' +
        '</li>' +
        '<li class="nav-item"><a href="/toolbox/"><span>Toolbox</span></a></li>' +
        '<li class="nav-item nav-item-cta"><a href="/chat/">Ask AI</a></li>' +
        '</ul>';

    var iconX =
        '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M13.982 10.622 20.54 3h-1.554l-5.693 6.618L8.745 3H3.5l6.876 10.007L3.5 21h1.554l6.012-6.989L15.868 21h5.245l-7.131-10.378Zm-2.128 2.474-.697-.997-5.543-7.93H8l4.474 6.4.697.996 5.815 8.318h-2.387l-4.745-6.787Z"/>' +
        '</svg>';
    var iconFacebook =
        '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M12 2C6.5 2 2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7C18.3 21.1 22 17 22 12c0-5.5-4.5-10-10-10z"/>' +
        '</svg>';
    var iconYoutube =
        '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M21.8,8.001c0,0-0.195-1.378-0.795-1.985c-0.76-0.797-1.613-0.801-2.004-0.847c-2.799-0.202-6.997-0.202-6.997-0.202h-0.009c0,0-4.198,0-6.997,0.202C4.608,5.216,3.756,5.22,2.995,6.016C2.395,6.623,2.2,8.001,2.2,8.001S2,9.62,2,11.238v1.517c0,1.618,0.2,3.237,0.2,3.237s0.195,1.378,0.795,1.985c0.761,0.797,1.76,0.771,2.205,0.855c1.6,0.153,6.8,0.201,6.8,0.201s4.203-0.006,7.001-0.209c0.391-0.047,1.243-0.051,2.004-0.847c0.6-0.607,0.795-1.985,0.795-1.985s0.2-1.618,0.2-3.237v-1.517C22,9.62,21.8,8.001,21.8,8.001z M9.935,14.594l-0.001-5.62l5.404,2.82L9.935,14.594z"/>' +
        '</svg>';

    window.SITE_FOOTER_HTML =
        '<footer class="footer">' +
        '<div class="footer-column"><h3>About Us</h3><ul>' +
        '<li><a href="/company/">Company</a></li>' +
        '<li><a href="/carbon-emissions/">Carbon Emissions</a></li>' +
        '<li><a href="/mission/">Our Mission</a></li>' +
        '<li><a href="/privacy-policy/">Privacy Policy</a></li>' +
        '<li><a href="/affilate-activity-disclosure/">Affiliates Disclosure</a></li>' +
        '</ul></div>' +
        '<div class="footer-column"><h3>Contact Us</h3><ul>' +
        '<li>A Rated House,</li><li>11 Sunnymead Road,</li><li>London,</li><li>NW9 8BT</li>' +
        '<li><a href="tel:+442081234411">+44 020 8123 4411</a></li>' +
        '</ul></div>' +
        '<div class="footer-column"><h3>Sister Sites</h3><ul>' +
        '<li><a href="https://boilermanuals.com">Boiler Manuals</a></li>' +
        '<li><a href="https://combiboiler.com">Combi Boiler</a></li>' +
        '<li><a href="https://boilerservice.com">Boiler Service</a></li>' +
        '</ul></div>' +
        '<div class="footer-column"><h3>Newsletter</h3>' +
        '<div id="mc_embed_shell"><div id="mc_embed_signup">' +
        '<form action="https://myboiler.us7.list-manage.com/subscribe/post?u=74520e86378a5e9ad9e26240e&amp;id=de886bf698&amp;f_id=00ccaee4f0" method="post" id="mc-embedded-subscribe-form" name="mc-embedded-subscribe-form" class="validate" target="_blank">' +
        '<div id="mc_embed_signup_scroll">' +
        '<div class="mc-field-group">' +
        '<label for="mce-EMAIL">Email Address</label><br><br>' +
        '<input type="email" name="EMAIL" class="required email" id="mce-EMAIL" required value=""><br><br>' +
        '</div>' +
        '<div class="clear foot"><input type="submit" name="subscribe" id="mc-embedded-subscribe" class="button" value="Subscribe"></div><br>' +
        '<div id="mce-responses" class="clear foot">' +
        '<div class="response" id="mce-error-response" style="display:none"></div>' +
        '<div class="response" id="mce-success-response" style="display:none"></div>' +
        '</div>' +
        '<div aria-hidden="true" style="position:absolute;left:-5000px">' +
        '<input type="text" name="b_76b9d06d4164064c0ffb0d455_68a8dc9423" tabindex="-1" value="">' +
        '</div>' +
        '<p style="margin:0 auto"><a href="http://eepurl.com/i6R-1E" title="Mailchimp - email marketing made easy and fun">' +
        '<span style="display:inline-block;background-color:transparent;border-radius:4px">' +
        '<img class="refferal_badge" src="https://digitalasset.intuit.com/render/content/dam/intuit/mc-fe/en_us/images/intuit-mc-rewards-text-light.svg" alt="Intuit Mailchimp" width="100" height="40">' +
        '</span></a></p>' +
        '</div></form></div></div></div></footer>' +
        '<footer class="copyright"><ul class="social-media no-bullets">' +
        '<li class="social-link social-link-x"><a rel="noopener nofollow" target="_blank" href="https://x.com/myboiler">' + iconX + '</a></li>' +
        '<li class="social-link social-link-facebook"><a rel="noopener nofollow" target="_blank" href="https://facebook.com/myboiler">' + iconFacebook + '</a></li>' +
        '<li class="social-link social-link-youtube"><a rel="noopener nofollow" target="_blank" href="https://www.youtube.com/@myboiler">' + iconYoutube + '</a></li>' +
        '</ul></footer>' +
        '<footer class="copyright"><p>&copy; 2026 MyBoiler.com - All rights reserved.</p></footer>';

    window.installSiteNav = function () {
        var nav = document.getElementById('nav-menu');
        if (!nav) return;
        nav.innerHTML = window.SITE_NAV_HTML;
    };

    window.installSiteFooter = function () {
        if (!document.body) return;
        var host = document.getElementById('site-footer');
        if (!host) {
            host = document.createElement('div');
            host.id = 'site-footer';
        }
        document.body.appendChild(host);
        host.innerHTML = window.SITE_FOOTER_HTML;
        Array.prototype.forEach.call(document.querySelectorAll('footer.footer, footer.copyright'), function (el) {
            if (!host.contains(el) && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        Array.prototype.forEach.call(document.querySelectorAll('#site-footer'), function (el) {
            if (el !== host && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
    };

    function installSiteChrome() {
        window.installSiteNav();
        window.installSiteFooter();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installSiteChrome);
    } else {
        installSiteChrome();
    }
})();

// Cookieless Amazon/eBay Buy-link click beacon. Same-origin, fire-and-forget.
// No cookies, no localStorage, no user id. Guard: site-nav.js is included twice
// on some pages.
(function () {
    if (window.__mbAffClickBound) return;
    window.__mbAffClickBound = true;

    var ENDPOINT = '/api/aff-click';
    var MAX_BYTES = 1800;
    var BUY_SEL = 'a.amazon-buy, a.ebay-buy';

    function closestBuy(el) {
        return el && el.closest ? el.closest(BUY_SEL) : null;
    }

    function networkOf(anchor) {
        if (anchor.classList.contains('amazon-buy')) return 'amazon';
        if (anchor.classList.contains('ebay-buy')) return 'ebay';
        return '';
    }

    function destHref(href) {
        try {
            var u = new URL(href, location.href);
            var host = u.hostname.toLowerCase();
            if (!/(^|\.)amazon\./.test(host) && !/(^|\.)ebay\./.test(host)) return '';
            return (host + u.pathname).replace(/\/+$/, '');
        } catch (err) {
            return '';
        }
    }

    function nearbyPart(anchor) {
        var scope = anchor.closest('li') || anchor.parentElement;
        if (!scope) return '';
        var nodes = scope.querySelectorAll('strong');
        var i;
        var text;
        for (i = 0; i < nodes.length; i++) {
            text = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim();
            if (/^\d{5,12}$/.test(text)) return text;
        }
        var prev = anchor.previousElementSibling;
        while (prev) {
            if (prev.tagName === 'STRONG') {
                text = (prev.textContent || '').replace(/\s+/g, ' ').trim();
                if (/^\d{5,12}$/.test(text)) return text;
            }
            prev = prev.previousElementSibling;
        }
        return '';
    }

    function send(payload) {
        var body;
        try {
            body = JSON.stringify(payload);
        } catch (err) {
            return;
        }
        if (body.length > MAX_BYTES) return;
        try {
            if (navigator.sendBeacon) {
                var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
                if (navigator.sendBeacon(ENDPOINT, blob)) return;
            }
        } catch (err) {}
        try {
            fetch(ENDPOINT, {
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

    function onBuyClick(event) {
        if (event.type === 'auxclick' && event.button !== 1) return;
        var anchor = closestBuy(event.target);
        if (!anchor) return;
        var net = networkOf(anchor);
        if (!net) return;
        var href = destHref(anchor.href || '');
        var part = nearbyPart(anchor);
        var payload = {
            t: Date.now(),
            net: net,
            path: location.pathname || '/',
            href: href
        };
        if (part) payload.part = part;
        send(payload);
    }

    document.addEventListener('click', onBuyClick, true);
    document.addEventListener('auxclick', onBuyClick, true);
})();
