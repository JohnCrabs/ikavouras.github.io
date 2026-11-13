/* CPDF — home page: recently used tools, category filters, search and the tool grid. */
(function () {
  'use strict';
  const { $, el, icon } = PDFApp;

  const grid = $('#tool-grid');
  const filters = $('#filters');
  const search = $('#tool-search');
  let category = 'All';
  let caps = {};

  const hrefOf = (tl) => tl.href || `tool.html?tool=${tl.id}`;
  // The most used conversions come first, in this order; every other tool keeps its usual order.
  const FIRST = ['office-to-pdf', 'pdf-to-word', 'pdf-to-excel', 'pdf-to-ppt'];
  const rank = (tl) => (FIRST.includes(tl.id) ? FIRST.indexOf(tl.id) : FIRST.length);

  function badge(tl) {
    if (tl.soon) return el('span', { class: 'badge', text: L({ en: 'Coming soon', el: 'Σύντομα' }) });
    if (tl.requires && !caps[tl.requires]) return el('span', { class: 'badge', text: t(`badge.${tl.requires}`) });
    if (tl.hot) return el('span', { class: 'badge badge-hot', html: `${icon('flame', 12)}<span>${t('badge.hot')}</span>` });
    return null;
  }

  function card(tl) {
    const href = tl.soon ? null : hrefOf(tl);
    return el(href ? 'a' : 'div', { class: `tool-card${tl.soon ? ' is-soon' : ''}`, href, style: `--c:${tl.color}` }, [
      el('span', { class: 'tool-card-icon', html: icon(tl.icon, 26) }),
      el('h3', { text: L(tl.name) }),
      el('p', { text: L(tl.desc) }),
      badge(tl),
    ]);
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const shown = PDFTools.list.filter((tl) =>
      (category === 'All' || tl.category === category)
      && (!q || `${L(tl.name)} ${L(tl.desc)} ${tl.name.en} ${tl.name.el}`.toLowerCase().includes(q)))
      .sort((x, y) => rank(x) - rank(y));
    grid.replaceChildren(...shown.map(card));
    if (!shown.length) grid.append(el('p', { class: 'empty', text: t('home.empty') }));
    filters.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.cat === category);
      c.setAttribute('aria-selected', c.dataset.cat === category);
    });
  }

  function renderRecent() {
    const items = PDFApp.recent.list().map(PDFTools.get).filter((tl) => tl && !tl.soon);
    $('#recent').hidden = !items.length;
    $('#recent-list').replaceChildren(...items.map((tl) => el('a', { class: 'recent-item', href: hrefOf(tl), style: `--c:${tl.color}` }, [
      el('span', { class: 'recent-icon', html: icon(tl.icon, 18) }),
      el('span', { text: L(tl.name) }),
    ])));
  }

  filters.append(...['All', ...PDFTools.categories].map((cat) =>
    el('button', { class: 'chip', type: 'button', role: 'tab', dataset: { cat }, text: t(`cat.${cat}`), onclick: () => { category = cat; render(); } })));
  search.addEventListener('input', render);
  renderRecent();
  render();
  // Badges for tools that need LibreOffice / Ghostscript depend on what the local server finds.
  PDFApp.api.caps().then((c) => { caps = c; render(); });
})();
