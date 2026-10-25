'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var js = fs.readFileSync(path.join(__dirname, '..', 'js', 'winter-banner.js'), 'utf8');
var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'winter-banner.css'), 'utf8');
var loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'site-nav.js'), 'utf8');

function assert(cond, message) {
    if (!cond) throw new Error(message);
}

assert(!/Gas Safe registered/i.test(js + css + loader), 'must not mention Gas Safe registered');
assert(!/£\s*\d/.test(js + css + loader), 'must not claim a specific £ saving');
assert(js.indexOf('utm_source=myboiler') !== -1, 'UTM source');
assert(js.indexOf('utm_medium=site_banner') !== -1, 'UTM medium');
assert(js.indexOf('utm_campaign=winter_combi') !== -1, 'UTM campaign');
assert(js.indexOf('mb_winter_banner_dismissed_2026') !== -1, 'storage key');
assert(js.indexOf('Dismiss winter alert') !== -1, 'accessible dismiss label');
assert(loader.indexOf('data-cfasync') !== -1, 'Rocket Loader flag on injected script');
assert(loader.indexOf('/js/winter-banner.js?v=winter-3') !== -1, 'cache-busted script');
assert(loader.indexOf('/css/winter-banner.css?v=winter-3') !== -1, 'cache-busted css');

function El(name) {
    this.tagName = String(name).toUpperCase();
    this.id = '';
    this.className = '';
    this.href = '';
    this.type = '';
    this.textContent = '';
    this.innerHTML = '';
    this.parentNode = null;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.style = {};
    this.classList = {
        _el: this,
        add: function (name) {
            if (this._el.className.indexOf(name) === -1) {
                this._el.className = (this._el.className + ' ' + name).trim();
            }
        },
        remove: function (name) {
            this._el.className = this._el.className
                .split(/\s+/)
                .filter(function (part) { return part && part !== name; })
                .join(' ');
        }
    };
}

El.prototype.setAttribute = function (key, value) {
    this.attrs[key] = String(value);
    if (key === 'id') this.id = String(value);
    if (key === 'href') this.href = String(value);
    if (key === 'class') this.className = String(value);
};

El.prototype.getAttribute = function (key) {
    return this.attrs[key];
};

El.prototype.appendChild = function (child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
};

El.prototype.insertBefore = function (node, ref) {
    node.parentNode = this;
    var i = this.children.indexOf(ref);
    if (i === -1) this.children.push(node);
    else this.children.splice(i, 0, node);
    return node;
};

El.prototype.removeChild = function (child) {
    var i = this.children.indexOf(child);
    if (i !== -1) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
};

El.prototype.addEventListener = function (type, fn) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(fn);
};

El.prototype.click = function () {
    (this.listeners.click || []).forEach(function (fn) {
        fn({ preventDefault: function () {} });
    });
};

function findById(node, id) {
    if (node.id === id) return node;
    for (var i = 0; i < (node.children || []).length; i++) {
        var found = findById(node.children[i], id);
        if (found) return found;
    }
    return null;
}

function findByClass(node, className) {
    if (node.className === className || (node.className && node.className.indexOf(className) !== -1)) {
        return node;
    }
    for (var i = 0; i < (node.children || []).length; i++) {
        var found = findByClass(node.children[i], className);
        if (found) return found;
    }
    return null;
}

function runOn(pathname, storage) {
    var html = new El('html');
    var head = new El('head');
    var body = new El('body');
    var header = new El('header');
    header.className = 'header';
    html.appendChild(head);
    html.appendChild(body);
    body.appendChild(header);

    var store = storage || {};
    var context = {
        window: null,
        document: {
            documentElement: html,
            head: head,
            body: body,
            readyState: 'complete',
            getElementById: function (id) {
                return findById(html, id);
            },
            querySelector: function (sel) {
                if (sel === 'header.header') return header;
                return null;
            },
            createElement: function (name) {
                return new El(name);
            },
            addEventListener: function () {}
        },
        location: { pathname: pathname },
        localStorage: {
            getItem: function (key) {
                return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
            },
            setItem: function (key, value) {
                store[key] = String(value);
            }
        }
    };
    context.window = context;
    vm.runInNewContext(js, context);
    return { html: html, body: body, store: store, header: header };
}

var home = runOn('/');
function allText(node) {
    var out = node.textContent || '';
    (node.children || []).forEach(function (child) {
        out += allText(child);
    });
    return out;
}

var banner = findById(home.html, 'mb-winter-banner');
assert(banner, 'banner mounts on a normal page');
assert(home.body.children[0] === banner, 'banner sits above the header');
var link = findByClass(banner, 'mb-winter-banner__link');
assert(link, 'banner has a link');
assert(link.href.indexOf('/boiler-optimiser/?utm_source=myboiler&utm_medium=site_banner&utm_campaign=winter_combi') !== -1, 'optimiser UTM href');
assert(link.textContent === 'Try the free Boiler Optimiser →', 'CTA is the only link text');
assert(allText(banner).indexOf('Got a combi boiler?') !== -1, 'suggested lead copy');

var close = findByClass(banner, 'mb-winter-banner__close');
assert(close && close.attrs['aria-label'] === 'Dismiss winter alert', 'dismiss label');
close.click();
assert(!findById(home.html, 'mb-winter-banner'), 'dismiss removes the banner');
assert(home.store.mb_winter_banner_dismissed_2026 === '1', 'dismiss is stored');

var dismissed = runOn('/', { mb_winter_banner_dismissed_2026: '1' });
assert(!findById(dismissed.html, 'mb-winter-banner'), 'stored dismiss hides the banner');

var optimiser = runOn('/boiler-optimiser/');
assert(!findById(optimiser.html, 'mb-winter-banner'), 'hidden on /boiler-optimiser/');

var optimiserIndex = runOn('/boiler-optimiser/index.html');
assert(!findById(optimiserIndex.html, 'mb-winter-banner'), 'hidden on optimiser index.html');

console.log('winter-banner checks passed');
