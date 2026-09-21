#!/usr/bin/env node
/**
 * Write recovered hub.myboiler.com WordPress fault pages into the static tree.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const BRAND_CSS = `        .article-page { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }
        .article-container { flex: 1; padding: clamp(2rem, 5vw, 4rem) clamp(20px, 5vw, 40px); max-width: 1100px; margin: 0 auto; width: 100%; box-sizing: border-box; }
        .article-header { margin-bottom: 2.5rem; }
        .article-title { font-size: clamp(2rem, 5vw, 3rem); font-weight: 700; line-height: 1.1; color: var(--text); margin: 0 0 1rem; letter-spacing: -0.02em; }
        .article-intro { font-size: 1.125rem; line-height: 1.6; color: var(--text-muted); margin: 0 0 2rem; }
        .article-content { background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: clamp(1.5rem, 4vw, 3rem); margin-bottom: 2rem; }
        .article-content p { font-size: 1rem; line-height: 1.7; color: var(--text); margin: 0 0 1.25rem; }
        .article-content h2 { font-size: 1.5rem; font-weight: 700; color: var(--text); margin: 2rem 0 1rem; }
        .article-content h3 { font-size: 1.25rem; font-weight: 600; color: var(--text); margin: 1.5rem 0 1rem; }
        .article-content a { color: var(--accent); }
        .article-content ul, .article-content ol { margin: 1rem 0 1.25rem; padding-left: 1.5rem; }
        .article-content li { font-size: 1rem; line-height: 1.7; color: var(--text); margin-bottom: 0.5rem; }
        .article-content strong { font-weight: 600; color: var(--text); }
        .table-wrap { overflow-x: auto; margin: 1.5rem 0; }
        .article-content table { width: 100%; border-collapse: collapse; margin: 0; font-size: 0.875rem; }
        .article-content table th, .article-content table td { padding: 0.75rem; text-align: left; border: 1px solid var(--border); vertical-align: top; }
        .article-content table th { background: var(--bg-subtle); font-weight: 600; color: var(--text); }
        .article-content table tr:nth-child(even) { background: var(--bg-subtle); }
        .article-content table td:first-child { font-weight: 600; }
        .article-back { margin: 0 0 1.25rem; }
        @media (max-width: 768px) { .article-content { padding: 1.5rem; } }`;

function page({ title, description, canonical, crumb, h1, intro, body }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - MyBoiler.com</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonical}">
    <link rel="stylesheet" type="text/css" href="/css/styles.css">
    <link rel="stylesheet" type="text/css" href="/css/fault-codes.css">
    <style>
${BRAND_CSS}
    </style>
    <script type="text/javascript" src="/js/site-nav.js" data-cfasync="false"></script>
</head>
<body class="article-page">
    <div class="menu-overlay"></div>
    <div class="nav-mega-backdrop" aria-hidden="true"></div>
    <header class="header">
        <a href="/" class="logo">
            <img src="/img/myboiler-logo-light.svg" alt="MyBoiler Logo" width="200" height="44" class="light-mode-logo js-theme-logo">
            <img src="/img/myboiler-logo-dark.svg" alt="MyBoiler Logo" width="200" height="44" class="dark-mode-logo js-theme-logo">
        </a>
        <div class="tagline">Smarter Heating & Hot Water</div>
        <div class="right-header-items">
            <button class="hamburger-menu" onclick="toggleMenu()" aria-label="Toggle Menu">
                <span class="hamburger-line"></span>
                <span class="hamburger-line"></span>
                <span class="hamburger-line"></span>
            </button>
            <nav id="nav-menu" class="nav-menu"><ul class="nav-list"><li class="nav-item"><a href="/advice/">Advice</a></li><li class="nav-item"><a href="/toolbox/">Toolbox</a></li><li class="nav-item nav-item-cta"><a href="/chat/">Ask AI</a></li></ul></nav>
        </div>
    </header>
    <div class="article-container">
        <header class="article-header">
            <h1 class="article-title">${h1}</h1>
            ${intro ? `<p class="article-intro">${intro}</p>` : ""}
        </header>
        <article class="article-content">
            ${crumb}
            ${body}
            <p>Gas work stays with a Gas Safe registered engineer. These steps are guidance from the manufacturer sequence, not a substitute for the handbook.</p>
        </article>
    </div>
    <div id="site-footer"></div>
    <script type="text/javascript" src="/js/site-nav.js" data-cfasync="false"></script>
    <script type="text/javascript" src="/js/fault-codes.js" data-cfasync="false"></script>
    <script type="text/javascript" src="/js/menu.js" data-cfasync="false"></script>
</body>
</html>
`;
}

function writePage(relDir, html) {
    const dir = path.join(ROOT, relDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
    console.log("wrote " + relDir + "/");
}

function stepsTable(rows) {
    let html =
        '<div class="table-wrap"><table><thead><tr><th>Step</th><th>Check</th><th>If yes</th><th>If no / next</th></tr></thead><tbody>';
    for (const row of rows) {
        html +=
            "<tr><td>" +
            row.step +
            "</td><td>" +
            row.check +
            "</td><td>" +
            (row.yes || "") +
            "</td><td>" +
            (row.no || "") +
            "</td></tr>";
    }
    html += "</tbody></table></div>";
    return html;
}

const worcesterCrumb =
    '<p class="article-back"><a href="/fault-codes/">Fault codes</a> / <a href="/fault-codes/worcester-bosch-fault-codes/">Worcester Bosch</a></p>';

const worcester = [
    {
        slug: "worcester-bosch-fault-code-a1",
        code: "A1",
        title: "Worcester Bosch A1 Fault Code",
        meaning: "A1 and the fault indicator LED are flashing — controlled-characteristic pump has run dry, stalled, or seized.",
        rows: [
            { step: "1", check: "System pressure below 1.2 bar?", yes: "Power off. Check for leaks and repair. Fill, bleed, and re-pressurise. Turn on. If A1 remains, go to step 2.", no: "Go to step 2." },
            { step: "2", check: "Pump seized or sticking?", yes: "Free / release the pump.", no: "Go to step 3." },
            { step: "3", check: "Audible bearing damage on the pump?", yes: "Power off, isolate, drain, replace the pump, refill/bleed, reconnect and turn on.", no: "Go to step 4." },
            { step: "4", check: "Activate the venting sequence", yes: "In the first service level, set service function 2.C (air purge) to 1 and store. The boiler vents for about eight minutes. Vent radiators manually.", no: "" },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-a7",
        code: "A7",
        title: "Worcester Bosch A7 Fault Code",
        meaning: "A7 and the fault indicator LED are flashing. Hot-water NTC sensor defective. The boiler may still produce hot water, but temperature control is less accurate.",
        rows: [
            { step: "1", check: "Is the water NTC connector corroded, damaged, or dirty?", yes: "Replace the affected parts. If A7 remains, go to step 2.", no: "Go to step 2." },
            { step: "2", check: "Power off, unplug the 20-pin PCB connector, and check resistance from connections 3 to 4 on the cable side against the NTC table.", yes: "Note service settings, replace the PCB, restore settings.", no: "Go to step 3." },
            { step: "3", check: "Unplug the NTC and check its resistance against the NTC table.", yes: "Replace the 20-pin connector lead assembly.", no: "Replace the NTC sensor." },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-a8",
        code: "A8",
        title: "Worcester Bosch A8 Fault Code",
        meaning: "A8 and the fault indicator LED are flashing. Bus communication to the programmer is interrupted (set value not received). Recovered from the old WordPress slug /4155-2/.",
        rows: [
            { step: "1", check: "Wiring between programmer and appliance. Use terminals B only (centre terminal is not for bus). Is there continuity?", yes: "If A8 remains, go to step 2.", no: "Correct or replace the bus cable, then power on." },
            { step: "2", check: "Multiple bus modules: wiring between modules and the branch box on terminals B. Continuity?", yes: "If A8 remains, go to step 3.", no: "Repair or replace the cable." },
            { step: "3", check: "Wiring between branch box and programmer on terminals B. Continuity?", yes: "If A8 remains, go to step 4.", no: "Repair or replace the cable." },
            { step: "4", check: "Has the programmer been replaced?", yes: "Go to step 5.", no: "Replace the programmer." },
            { step: "5", check: "Has the bus module been replaced?", yes: "Go to step 6.", no: "Replace the bus module." },
            { step: "6", check: "PCB control board", yes: "Note service settings, replace the PCB, restore settings.", no: "" },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-b1",
        code: "b1",
        title: "Worcester Bosch b1 Fault Code",
        meaning: "b1 and the fault indicator LED are flashing — code plug not detected.",
        rows: [
            { step: "1", check: "In the second service level, service function 8.b (code plug). Compare digits 7–10 of the order number. Missing or incorrect number?", yes: "Go to step 2.", no: "Go to step 3." },
            { step: "2", check: "Code plug loose, incorrect, or defective?", yes: "Power off, fit the correct code plug, power on. If b1 remains, go to step 3.", no: "" },
            { step: "3", check: "PCB damaged", yes: "Note service settings, replace the PCB, restore settings.", no: "" },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-c6",
        code: "C6",
        title: "Worcester Bosch C6 Fault Code",
        meaning: "C6 and the fault indicator LED are flashing. Fan speed too low.",
        rows: [
            { step: "1", check: "Fan cable connector correctly fitted on the fan?", yes: "Go to step 2.", no: "Power off, reconnect, power on. If C6 remains, go to step 2." },
            { step: "2", check: "Supply voltage within 230 V AC ±10% with other appliances on?", yes: "Go to step 3.", no: "Switch off other loads, then go to step 3." },
            { step: "3", check: "Fan lead continuity on each core?", yes: "Go to step 4.", no: "Replace the fan cable." },
            { step: "4", check: "Fan defective?", yes: "Replace the fan. If C6 remains, go to step 5.", no: "Go to step 5." },
            { step: "5", check: "PCB damaged", yes: "Note service settings, replace the PCB, restore settings.", no: "" },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-e2",
        code: "E2",
        title: "Worcester Bosch E2 Fault Code",
        meaning: "E2 and the fault indicator LED are flashing. CH flow NTC sensor defective.",
        rows: [
            { step: "1", check: "Is the flow NTC connector corroded, damaged, or dirty?", yes: "Replace the affected parts. If E2 remains, go to step 2.", no: "Go to step 2." },
            { step: "2", check: "Power off, unplug the 20-pin PCB connector, check resistance from connections 8 to 9 against the NTC table.", yes: "Note service settings, replace the PCB, restore settings.", no: "Go to step 3." },
            { step: "3", check: "Unplug the NTC and check its resistance against the NTC table.", yes: "Replace the 20-pin connector lead assembly.", no: "Replace the NTC sensor." },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-e9",
        code: "E9",
        title: "Worcester Bosch E9 Fault Code",
        meaning: "E9, the reset button, and the fault indicator LED are flashing. Safety temperature circuit has tripped.",
        rows: [
            { step: "1", check: "Fully pumped sealed system?", yes: "Go to step 3.", no: "Go to step 2." },
            { step: "2", check: "Open-vented: enough water in the F&amp;E tank?", yes: "Go to step 4.", no: "Top up, vent, reset for 3 seconds." },
            { step: "3", check: "Sealed system pressure between 1 and 2 bar?", yes: "Go to step 4.", no: "Top up, vent, reset." },
            { step: "4", check: "Pump seized?", yes: "Free the pump or replace it, refill/vent, reset.", no: "Go to step 5." },
            { step: "5", check: "Lead disconnected from flue and/or CH flow safety temperature limiter?", yes: "Reconnect, reset.", no: "Continue limiter continuity checks, fuse SI 3, then PCB." },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-ea",
        code: "EA",
        title: "Worcester Bosch EA Fault Code",
        meaning: "EA, the reset button, and the fault indicator LED are flashing. During operation the flame is not detected.",
        rows: [
            { step: "1", check: "Is a burner flame visible?", yes: "Go to step 5 (earth / condensate / electrode path).", no: "Go to step 2." },
            { step: "2", check: "Is the gas cock on?", yes: "Go to step 3.", no: "Open the gas valve and reset for 3 seconds." },
            { step: "3", check: "Air in the supply pipe?", yes: "Vent the supply, then reset.", no: "Go to step 4." },
            { step: "4", check: "Natural-gas working pressure (or LPG flow rate) correct?", yes: "Confirm the correct code plug is fitted, then reset.", no: "Check pipework and the building regulator / cylinder." },
            { step: "5+", check: "Earth, condensate trap, air/gas diaphragm, gas-valve coils, flue/CO<sub>2</sub>, ignition electrodes, 20-pin harness, PCB", yes: "Work through those checks in order. Reset for 3 seconds after each repair.", no: "Replace the PCB last, restoring service settings." },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-f0",
        code: "F0",
        title: "Worcester Bosch F0 Fault Code",
        meaning: "F0 and the fault indicator LED (and possibly the reset button) are flashing. Internal failure.",
        rows: [
            { step: "1", check: "Reset button flashing?", yes: "Reset for 3 seconds. Raise heat demand with the boost button, cancel after 30 seconds, and repeat twice. If F0 remains, go to step 2.", no: "Go to step 2." },
            { step: "2", check: "PCB damaged", yes: "Note service settings, replace the PCB, restore settings.", no: "" },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-f7",
        code: "F7",
        title: "Worcester Bosch F7 Fault Code",
        meaning: "F7 and the fault indicator LED are flashing. Flame is still detected after the appliance switches off.",
        rows: [
            { step: "1", check: "Electrodes dirty or defective (wear, deposits, mechanical damage)?", yes: "Replace the electrode assembly and reset.", no: "Refit electrodes, reset, go to step 2." },
            { step: "2", check: "CO<sub>2</sub> in combustion air above 0.2% with the casing on?", yes: "Flue gases in the combustion air — check and repair the flue.", no: "Go to step 3." },
            { step: "3", check: "PCB damaged", yes: "Note service settings, replace the PCB, restore settings.", no: "" },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-fa",
        code: "FA",
        title: "Worcester Bosch FA Fault Code",
        meaning: "FA, the reset button, and the fault indicator LED are flashing. Flame is detected after the appliance switches off.",
        rows: [
            { step: "1", check: "Condensate trap blocked?", yes: "Clean the trap and discharge, then reset.", no: "Go to step 2." },
            { step: "2", check: "Electrode assembly burnt out?", yes: "Replace electrodes and reset.", no: "Go to step 3." },
            { step: "3", check: "CO<sub>2</sub> in combustion air above 0.2%?", yes: "Check and clean the flue, then reset.", no: "Go to step 4." },
            { step: "4", check: "Gas valve damaged?", yes: "Isolate gas and power, replace the valve, leak-test, reset.", no: "Go to step 5." },
            { step: "5", check: "20-pin connector lead damaged?", yes: "Replace the harness, then reset.", no: "Replace the PCB last, restoring service settings." },
        ],
    },
    {
        slug: "worcester-bosch-fault-code-fd",
        code: "Fd",
        title: "Worcester Bosch Fd Fault Code",
        meaning: "Fd, the reset button, and the fault indicator LED are flashing. The reset button was pressed by mistake.",
        rows: [
            { step: "1", check: "Reset button flashing?", yes: "Press reset for 3 seconds and release. The appliance restarts. If Fd remains, go to step 2.", no: "Go to step 2." },
            { step: "2", check: "PCB damaged", yes: "Note service settings, switch off, isolate power, replace the PCB, restore settings.", no: "" },
        ],
    },
];

function writeRedirect(relDir, href, label) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url=${href}">
    <link rel="canonical" href="${href}">
    <title>Redirecting...</title>
</head>
<body>
    <p>Redirecting to <a href="${href}">${label}</a>...</p>
    <script data-cfasync="false">window.location.href = ${JSON.stringify(href)};</script>
</body>
</html>
`;
    writePage(relDir, html);
}

function main() {
    writePage(
        "fault-codes/ambirad-fault-codes",
        page({
            title: "Ambirad Fault Codes",
            description: "Ambirad SmartElec2 heater fault codes recovered from the original MyBoiler WordPress pages.",
            canonical: "/fault-codes/ambirad-fault-codes/",
            crumb: '<p class="article-back"><a href="/fault-codes/">Back to fault codes</a></p>',
            h1: "Ambirad Fault Codes",
            intro: "SmartElec2 display codes. Recovered from the original hub.myboiler.com page.",
            body: `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Description</th><th>Symptom</th><th>Possible cause</th><th>Remedy</th><th>Model</th></tr></thead><tbody>
<tr><td>#*</td><td>Communication failure</td><td>No control on faulty unit</td><td>Bad data-cable connection or damaged cable</td><td>Check data cable(s) and plugs. Repair or replace damaged cable.</td><td>SmartElec2</td></tr>
<tr><td># E1</td><td>Air sensor temperature too high / air sensor failure</td><td>Fan operating, no heat</td><td>High ambient air temperature, impeller turning the wrong way, motor failure, air-sensor cable disconnected, air sensor broken</td><td>Check ventilation, impeller rotation, motor, cable; replace the air sensor if needed.</td><td>SmartElec2</td></tr>
<tr><td># E3</td><td>Heatsink too hot</td><td>Fan operating, no heat</td><td>High ambient air or faulty base unit</td><td>Replace the SmartElec base unit.</td><td>SmartElec2</td></tr>
<tr><td># E4</td><td>Heatsink sensor failure</td><td>Fan operating, no heat</td><td>Heatsink sensor wiring disconnected or faulty</td><td>Check the wiring.</td><td>SmartElec2</td></tr>
<tr><td># E5</td><td>External temperature</td><td>Unit runs, but no external temperature control</td><td>External temperature sensor faulty</td><td>Replace the sensor.</td><td>SmartElec2</td></tr>
<tr><td># E6</td><td>Overheat thermostat open circuit</td><td>Fan operating, no heat</td><td>Overheat thermostat open circuit</td><td>Reset or replace the overheat thermostat.</td><td>SmartElec2</td></tr>
</tbody></table></div>`,
        })
    );

    for (const item of worcester) {
        writePage(
            "fault-codes/" + item.slug,
            page({
                title: item.title,
                description: item.meaning,
                canonical: "/fault-codes/" + item.slug + "/",
                crumb: worcesterCrumb,
                h1: item.title,
                intro: item.meaning,
                body: "<h3>" + item.code + " checks</h3>" + stepsTable(item.rows),
            })
        );
    }

    writePage(
        "fault-codes/potterton-fault-code-e133-repair",
        page({
            title: "Potterton E133 Fault Code Repair",
            description: "Potterton E133 ignition / failure-to-light repair notes, including frozen condensate.",
            canonical: "/fault-codes/potterton-fault-code-e133-repair/",
            crumb: '<p class="article-back"><a href="/fault-codes/">Fault codes</a> / <a href="/fault-codes/potterton-fault-codes/">Potterton</a></p>',
            h1: "Potterton E133 Fault Code Repair",
            intro: "E133 — failure to light. Often ignition, but gas supply, electrodes, the PCB, or a frozen condensate pipe can all show this code.",
            body: `<h3>First checks</h3>
<p>Confirm gas is available — if you can, light a cooker or fire. The handbook lists this as an ignition fault, but the time of year matters. In hard frost it is often a blocked or frozen condensate.</p>
<h3>Frozen condensate</h3>
<p>Switch the boiler off. Pour warm water (about 50&nbsp;°C) over the exposed condensate pipe until it runs clear. Switch on and reset if needed. Repeat if the lockout returns.</p>
<p>A temporary check: cut the internal condensate and drop a flexible hose into a bucket (use towels). If the boiler then lights, the outdoor run is still frozen or blocked.</p>
<h3>Normal weather</h3>
<p>Have the ignition electrodes checked. The gas valve or PCB can also fail on this code and may need testing or replacement.</p>`,
        })
    );

    writePage(
        "fault-codes/worcester-bosch-siphon-fill-code",
        page({
            title: "Worcester Bosch Siphon Fill Code",
            description: "Worcester Bosch -¦¦- / XX siphon fill mode. The boiler runs at a low burn for about 15 minutes to fill the condensate trap.",
            canonical: "/fault-codes/worcester-bosch-siphon-fill-code/",
            crumb: worcesterCrumb,
            h1: "Worcester Bosch Siphon Fill Code",
            intro: "Display alternates between a temperature (for example 40) and the -¦¦- or XX symbol.",
            body: `<h3>Meaning</h3>
<p>Siphon fill mode. The boiler runs at a low burn for about 15 minutes to fill the condensate trap. This happens after the boiler has been turned off, if it has not been used for a day or so, or if the control knob has been turned down and back up.</p>
<p>This is a normal safety feature. After about 15 minutes the boiler should return to normal. If it continues for more than half an hour, call a heating engineer or Worcester on 0330 123 9559.</p>`,
        })
    );

    writePage(
        "fault-codes/baxi-fault-codes/baxi-duo-tec-platinum-and-megaflo",
        page({
            title: "Baxi Duo-tec Platinum &amp; Megaflo Fault Codes",
            description: "Baxi Duo-tec, Platinum and Megaflo display codes recovered from hub.myboiler.com.",
            canonical: "/fault-codes/baxi-fault-codes/baxi-duo-tec-platinum-and-megaflo/",
            crumb: '<p class="article-back"><a href="/fault-codes/">Fault codes</a> / <a href="/fault-codes/baxi-fault-codes/">Baxi</a></p>',
            h1: "Baxi Duo-tec, Platinum &amp; Megaflo Fault Codes",
            intro: "Range-specific Baxi display codes. Recovered from the original hub.myboiler.com table.",
            body: `<div class="table-wrap"><table><thead><tr><th>Error code</th><th>Possible fault</th><th>Installer action</th></tr></thead><tbody>
<tr><td>E10</td><td>Outdoor Sensor Error</td><td>Outdoor sensor fault. Check the sensor and that the IP menu outdoor-sensor value reads correctly.</td></tr>
<tr><td>E20</td><td>Central Heating Thermistor Sensor Fault</td><td>Check resistance across the sensor is about 12&nbsp;kΩ at 25&nbsp;°C. If not, suspect the sensor.</td></tr>
<tr><td>E28</td><td>Flue Thermistor Fault</td><td>Check the flue sensor value. Check for a blocked flue.</td></tr>
<tr><td>E110</td><td>Boiler Overheat Tripped</td><td>Check boiler temperature is not over 110&nbsp;°C; continuity across the overheat stat; pump circulation; clear air from the system.</td></tr>
<tr><td>E119</td><td>System Pressure Low (&lt; 0.5 Bar)</td><td>Check for leaks; check expansion-vessel charge; add water via the filling loop. Restoring pressure resets the error.</td></tr>
<tr><td>E125</td><td>Primary Water Circulation Fault</td><td>Check the pump; system full of water; clear air; check for blockages; check thermistors are located correctly.</td></tr>
<tr><td>E131</td><td>Flue Overheat Lockout</td><td>May follow a power cut — try reset. Flue NTC exceeded 130&nbsp;°C; check resistance. Possible blocked heat-exchanger waterways.</td></tr>
<tr><td>E133</td><td>Ignition Fault</td><td>Check wiring, supply pressure, purge air, spark at electrode, electrode condition, gas valve opening, condensate drain.</td></tr>
<tr><td>E160</td><td>Fan Fault</td><td>Check the fan and cable. Probable fan failure.</td></tr>
<tr><td>E161</td><td>Fan Fault</td><td>Check the fan and cable. Probable fan failure.</td></tr>
<tr><td>E164</td><td>Heating Flow Switch Error (Ireland) / Pressure Sensor Error (UK)</td><td>HEa Irish system boilers have flow switches — check switch operation. UK boilers: fit the correct PCB.</td></tr>
<tr><td>E167</td><td>PCB Fault</td><td></td></tr>
<tr><td>E168</td><td>PCB Lock Out</td><td>May follow a power-supply problem. Try reset.</td></tr>
<tr><td>E193</td><td>Circulation Fault</td><td>If it persists, E125 usually follows.</td></tr>
</tbody></table></div>`,
        })
    );

    writePage(
        "fault-codes/baxi-fault-codes/baxi-ecoblue-heat-only",
        page({
            title: "Baxi EcoBlue Heat Only Fault Codes",
            description: "Baxi EcoBlue heat-only flash codes recovered from hub.myboiler.com.",
            canonical: "/fault-codes/baxi-fault-codes/baxi-ecoblue-heat-only/",
            crumb: '<p class="article-back"><a href="/fault-codes/">Fault codes</a> / <a href="/fault-codes/baxi-fault-codes/">Baxi</a></p>',
            h1: "Baxi EcoBlue Heat Only Fault Codes",
            intro: "LED flash codes for EcoBlue heat-only. Recovered from the original hub.myboiler.com table.",
            body: `<div class="table-wrap"><table><thead><tr><th>Error code</th><th>Possible fault</th><th>Installer action</th></tr></thead><tbody>
<tr><td>FLASHED Green 1 TIME</td><td>Boiler temp reached</td><td></td></tr>
<tr><td>3 GREEN FLASHES</td><td>Temporary Flame Loss (No Reset Required)</td><td>Temporary error, self-reset. If it continues it goes to 3 red flashes (lockout).</td></tr>
<tr><td>4 GREEN FLASHES</td><td>Communication Fault Between PCB And Control</td><td>Temporary error, self-reset.</td></tr>
<tr><td>5 GREEN FLASHES</td><td>Parameter Error On PSU/PCB</td><td>Temporary error, self-reset.</td></tr>
<tr><td>6 GREEN FLASHES</td><td>Miscellaneous Error</td><td>Temporary error, self-reset.</td></tr>
<tr><td>ONE RED FLASH</td><td>Sensor Error: Sensor Fault, Temperature Fault Or Flow Fault</td><td>Check wiring; sensors about 12&nbsp;kΩ at 25&nbsp;°C; sensor in the pocket; AAV open; system full and vented; pump running; flow/return orientation; blockages.</td></tr>
<tr><td>2 RED FLASHES</td><td>Boiler Overheat Tripped</td><td>Vent the system; check water pressure; continuity across the overheat stat and APS if fitted; circulation direction, pump, valves; wiring; not air-locked.</td></tr>
<tr><td>3 RED FLASHES</td><td>Ignition Fault. Boiler Has Failed To Light After 5 Attempts</td><td>Check wiring, supply pressure, purge air, spark, electrode condition, gas valve opening, condensate drain.</td></tr>
<tr><td>4 RED FLASHES</td><td>Fan Fault</td><td>If the fan is not running, check power to the gas-air unit. If it is running, check APS (if fitted). Check the flue for blockages.</td></tr>
<tr><td>5 RED FLASHES</td><td>Parameter Or PSU Error</td><td>Check PCB and loom; replace PSU and recommission; check wiring.</td></tr>
<tr><td>FLASHES RED 6 TIMES</td><td>Miscellaneous</td><td>Check wiring connections. If needed replace the PU and/or control/fan assembly.</td></tr>
</tbody></table></div>`,
        })
    );

    const siphonHref = "/fault-codes/worcester-bosch-siphon-fill-code/";
    const siphonLabel = "Worcester Bosch Siphon Fill Code";
    const fdHref = "/fault-codes/worcester-bosch-fault-code-fd/";
    writeRedirect("fault-codes/worcester-bosch-%c2%a6%c2%a6-code", siphonHref, siphonLabel);
    writeRedirect("fault-codes/worcester-bosch-\u00a6\u00a6-code", siphonHref, siphonLabel);
    writeRedirect("worcester-bosch-%c2%a6%c2%a6-code", siphonHref, siphonLabel);
    writeRedirect("worcester-bosch-\u00a6\u00a6-code", siphonHref, siphonLabel);
    writeRedirect("hub/fault-codes/worcester-bosch-siphon-fill-code", siphonHref, siphonLabel);
    writeRedirect("hub/fault-codes/worcester-bosch-%c2%a6%c2%a6-code", siphonHref, siphonLabel);
    writeRedirect("hub/worcester-bosch-%c2%a6%c2%a6-code", siphonHref, siphonLabel);
    writeRedirect("hub/fault-codes/worcester-bosch-fault-code-fd", fdHref, "Worcester Bosch Fd Fault Code");
    writeRedirect("baxi-ecoblue-heat-only", "/fault-codes/baxi-fault-codes/baxi-ecoblue-heat-only/", "Baxi EcoBlue Heat Only Fault Codes");
    writeRedirect("baxi-solo-heat-only", "/fault-codes/baxi-fault-codes/baxi-solo-heat-only/", "Baxi Solo Heat Only Fault Codes");
    writeRedirect("baxi-600-combi", "/fault-codes/baxi-fault-codes/baxi-600-combi/", "Baxi 600 Combi Fault Codes");
    writeRedirect("baxi-baxi-200-400", "/fault-codes/baxi-fault-codes/baxi-200-400/", "Baxi 200 & 400 Fault Codes");
    writeRedirect("hub/fault-codes/baxi-fault-codes/baxi-duo-tec-platinum-and-megaflo", "/fault-codes/baxi-fault-codes/baxi-duo-tec-platinum-and-megaflo/", "Baxi Duo-tec Platinum & Megaflo Fault Codes");
    writeRedirect("hub/fault-codes/baxi-fault-codes/baxi-ecoblue-heat-only", "/fault-codes/baxi-fault-codes/baxi-ecoblue-heat-only/", "Baxi EcoBlue Heat Only Fault Codes");
    writeRedirect("hub/baxi-ecoblue-heat-only", "/fault-codes/baxi-fault-codes/baxi-ecoblue-heat-only/", "Baxi EcoBlue Heat Only Fault Codes");
    writeRedirect("faults-and-fixes", "/fault-codes/faults-and-fixes/", "Boiler Faults and Fixes");
    writeRedirect("hub/faults-and-fixes", "/fault-codes/faults-and-fixes/", "Boiler Faults and Fixes");
    writeRedirect("vaillant/vaillant-fault-codes-new", "/fault-codes/vaillant-fault-codes/", "Vaillant Fault Codes");
    writeRedirect("hub/vaillant/vaillant-fault-codes-new", "/fault-codes/vaillant-fault-codes/", "Vaillant Fault Codes");
    writeRedirect("vaillant-ecotec-fault-code-overview", "/fault-codes/vaillant-fault-codes/", "Vaillant Fault Codes");
    writeRedirect("hub/vaillant-ecotec-fault-code-overview", "/fault-codes/vaillant-fault-codes/", "Vaillant Fault Codes");
    writeRedirect("worcester-bosch-fault-codes/worcester-bosch-fault-code-e2", "/fault-codes/worcester-bosch-fault-code-e2/", "Worcester Bosch E2 Fault Code");
    writeRedirect("hub/worcester-bosch-fault-codes/worcester-bosch-fault-code-e2", "/fault-codes/worcester-bosch-fault-code-e2/", "Worcester Bosch E2 Fault Code");
    writeRedirect("hub/4155-2", "/fault-codes/worcester-bosch-fault-code-a8/", "Worcester Bosch A8 Fault Code");

    writePage(
        "fault-codes/faults-and-fixes",
        page({
            title: "Boiler Faults and Fixes",
            description: "Worked examples of boiler faults and the fix that cleared them.",
            canonical: "/fault-codes/faults-and-fixes/",
            crumb: '<p class="article-back"><a href="/fault-codes/">Back to fault codes</a></p>',
            h1: "Boiler Faults and Fixes",
            intro: "Real jobs from the original MyBoiler notes. Manufacturer flow charts still apply — not every intermediate step is recorded here.",
            body: `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Brand</th><th>Model</th><th>Fault</th><th>Fix</th><th>Notes</th></tr></thead><tbody>
<tr><td>27/08/2018</td><td>Main</td><td>Combi 30 HE</td><td>Ignition-failure light and fan light flashing together shortly after the pump starts. Pump runs, fan does not. Fan, pump and air-pressure proven.</td><td>PCB replaced</td><td></td></tr>
</tbody></table></div>`,
        })
    );
}

main();
