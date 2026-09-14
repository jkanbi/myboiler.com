(function () {
    var chevron =
        '<svg class="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
        '<path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z"/>' +
        '</svg>';

    window.SITE_NAV_HTML =
        '<ul class="nav-list">' +
        '<li class="nav-item nav-item-has-dropdown">' +
        '<span class="nav-dropdown-label"><span>Advice</span>' + chevron + '</span>' +
        '<div class="mega-menu">' +
        '<div class="mega-menu-column">' +
        '<h4>Boilers</h4>' +
        '<a href="/hub/money-and-energy-saving/">Money and Energy Saving</a>' +
        '<a href="/hub/boiler-pressure/">Boiler Pressure</a>' +
        '<a href="/hub/boiler-service/">Boiler Service</a>' +
        '<a href="/hub/boiler-types/">Boiler Types</a>' +
        '<a href="/hub/boiler-energy-efficiency/">Boiler Energy Efficiency</a>' +
        '<h4>OpenTherm &amp; Modulating Boilers</h4>' +
        '<a href="/hub/opentherm/opentherm-boilers-and-controls/">OpenTherm &amp; Modulating Overview</a>' +
        '<a href="/hub/opentherm/opentherm-boilers-and-controls/">OpenTherm Capable Boilers</a>' +
        '<a href="/hub/opentherm/opentherm-boilers-and-controls/">OpenTherm Controls</a>' +
        '<a href="/hub/smart-heating/modulating-a-rated-boilers-with-smart-modulating-thermostats/">Modulating Boilers &amp; Smart Controls</a>' +
        '<a href="/hub/opentherm/vaillant-opentherm/">Vaillant OpenTherm Guide</a>' +
        '<a href="/hub/opentherm/worcester-bosch-opentherm/">Worcester OpenTherm Guide</a>' +
        '</div>' +
        '<div class="mega-menu-column">' +
        '<h4>Heat Pumps</h4>' +
        '<a href="/hub/heat-pumps/">Heat Pumps Overview</a>' +
        '<a href="/hub/heat-pumps/retrofit-an-existing-hot-water-cylinder-with-a-plate-heat-exchanger-for-use-with-a-heat-pump/">Heat Pump Cylinder Retrofit</a>' +
        '<a href="/hub/heat-pumps/air-source-heat-pumps/">Air Source Heat Pump</a>' +
        '<a href="/hub/why-heat-pumps-work-well-with-underfloor-heating/">Underfloor Heating</a>' +
        '</div>' +
        '<div class="mega-menu-column">' +
        '<h4>Miscellaneous</h4>' +
        '<a href="/hub/vaillant/how-to-adjust-the-flow-temperature-on-vaillant-ecotec-post-2012-models/">Flow Temperature &amp; Power</a>' +
        '<a href="/hub/solar-thermal/">Solar Thermal Heating</a>' +
        '<a href="/hub/solar-thermal/">Solar Thermal Servicing</a>' +
        '<a href="/hub/s-plan/">S Plan Heating Systems</a>' +
        '<a href="/hub/radiators/">Radiators</a>' +
        '<a href="/quote/">Get a Quote</a>' +
        '</div>' +
        '</div>' +
        '</li>' +
        '<li class="nav-item nav-item-has-dropdown">' +
        '<span class="nav-dropdown-label"><span>Toolbox</span>' + chevron + '</span>' +
        '<div class="mega-menu">' +
        '<div class="mega-menu-column">' +
        '<h4>Vaillant</h4>' +
        '<a href="/hub/vaillant/vaillant-p-test-program-mode/">P Test Instructions</a>' +
        '<a href="/hub/vaillant/vaillant-ecotec-emissions-table/">Emissions Table</a>' +
        '<a href="/hub/how-to/vaillant-ecotec-boiler-service/">Ecotec Service How-To</a>' +
        '<a href="/hub/vaillant/vaillant-diagnostic-s-and-d-codes/">Diagnostic S &amp; D Codes</a>' +
        '<a href="/hub/vaillant/vaillant-fga-tool/">FGA Tool</a>' +
        '</div>' +
        '<div class="mega-menu-column">' +
        '<h4>Worcester Bosch</h4>' +
        '<a href="/hub/worcester-bosch-fga-tool/">FGA Tool</a>' +
        '</div>' +
        '<div class="mega-menu-column">' +
        '<h4>Other Brands</h4>' +
        '<a href="/hub/intergas-fga-tool/">Intergas FGA Tool</a>' +
        '<a href="/hub/how-to/service-an-intergas-boiler/">Intergas Service How-To</a>' +
        '<h4>Miscellaneous</h4>' +
        '<a href="/hub/boiler-maximum-and-minimum-output-mode-videos/">Max/Min Output Mode Videos</a>' +
        '</div>' +
        '</div>' +
        '</li>' +
        '<li class="nav-item nav-item-has-dropdown">' +
        '<span class="nav-dropdown-label"><span>Calculators</span>' + chevron + '</span>' +
        '<div class="mega-menu">' +
        '<div class="mega-menu-column">' +
        '<h4>Heating Design</h4>' +
        '<a href="/hub/air-change-rates-ach/">Air Change Calculator (ACH)</a>' +
        '<a href="/hub/calculators/boiler-usage-cost/">Boiler Consumption</a>' +
        '<a href="/hub/calculators/heating-system-output-calculator/">Heat Source/System Design</a>' +
        '<a href="/hub/calculators/heating-system-water-content-calculator/">Water Content</a>' +
        '<a href="/hub/calculators/hot-water-recovery-time-calculator/">Hot Water Recovery</a>' +
        '<a href="/hub/calculators/pipe-size-calculator/">Pipe Size Calculator</a>' +
        '<a href="/hub/calculators/radiator-correction-factor-tool/">Radiator Correction Factor</a>' +
        '<a href="/hub/calculators/volume-flow-rate-q-calculator/">Volume Flow Rate Q</a>' +
        '</div>' +
        '<div class="mega-menu-column">' +
        '<h4>Conversion Calculators</h4>' +
        '<a href="/hub/calculators/kw-to-flow-rate/">KW to Flow Rate &amp; Flow to KW</a>' +
        '<a href="/hub/calculators/flow-rate-lpm-to-energy-used-kwh/">LPM to kWh</a>' +
        '<a href="/hub/calculators/btu-to-kw/">BTU to Watts</a>' +
        '<a href="/hub/radiator-new-output/">Radiator New Output</a>' +
        '</div>' +
        '<div class="mega-menu-column">' +
        '<h4>Gas Calculators</h4>' +
        '<a href="/hub/calculators/combustion-performance-gas-ratio-calculator/">Combustion Ratio</a>' +
        '<a href="/hub/calculators/gas-rate-calculator/">Gas Rate</a>' +
        '<a href="/hub/calculators/gas-volume-m3-to-kwh/">m³ to kWh</a>' +
        '<h4>Buffers</h4>' +
        '<a href="/hub/calculators/buffer-minimum-volume-calculation/">Buffer Minimum Volume</a>' +
        '</div>' +
        '</div>' +
        '</li>' +
        '<li class="nav-item nav-item-cta"><a href="/chat/">Ask AI</a></li>' +
        '</ul>';

    window.installSiteNav = function () {
        var nav = document.getElementById('nav-menu');
        if (!nav) return;
        nav.innerHTML = window.SITE_NAV_HTML;
    };

    if (document.getElementById('nav-menu')) {
        window.installSiteNav();
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.installSiteNav);
    } else {
        window.installSiteNav();
    }
})();
