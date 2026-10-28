(function () {
    if (window.__mbCompReadMoreBound) return;
    window.__mbCompReadMoreBound = true;

    function enhance(cardId, moreId) {
        var card = document.getElementById(cardId);
        var more = document.getElementById(moreId);
        if (!card || !more || card.querySelector('.comp-more-toggle')) return;

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'comp-more-toggle';
        button.setAttribute('aria-controls', moreId);
        button.setAttribute('aria-expanded', 'false');
        button.textContent = 'Read more';
        button.addEventListener('click', function () {
            var open = card.classList.toggle('is-open');
            button.setAttribute('aria-expanded', open ? 'true' : 'false');
            button.textContent = open ? 'Show less' : 'Read more';
        });

        card.appendChild(button);
        card.classList.add('comp-card--ready');
    }

    function start() {
        enhance('load-compensation', 'load-compensation-more');
        enhance('weather-compensation', 'weather-compensation-more');
        enhance('system-savings-note', 'system-savings-more');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
