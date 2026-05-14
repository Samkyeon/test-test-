// ============================================================
//  app.js  — 엘리베이터 개념 사전 메인 로직
// ============================================================

(function () {
  'use strict';

  // ── 상태 ────────────────────────────────────────────────
  let currentView = 'map';   // 'map' | 'card'
  let currentId   = null;
  let currentCat  = 'all';
  let openTabs    = [];       // [{id, label}]

  // ── 초기화 ───────────────────────────────────────────────
  function init() {
    buildNav();
    buildCatFilters();
    buildMap();
    renderTabs();
    bindSearch();
    // 첫 화면: 관계도 뷰 + 탭 "관계도" 하나
    openTabs = [{ id: '__map__', label: '🗺 관계도' }];
    renderTabs();
    showView('map');
  }

  // ── 사이드바 네비게이션 ──────────────────────────────────
  function buildNav() {
    const tree = document.getElementById('nav-tree');
    const grouped = groupByCat(CONCEPTS);
    let html = '';
    for (const [cat, items] of Object.entries(grouped)) {
      const info = CATEGORIES[cat] || {};
      html += `<div class="nav-cat">${info.label || cat}</div>`;
      items.forEach(item => {
        html += `<div class="nav-item" data-id="${item.id}" onclick="openCard('${item.id}')">${item.id}</div>`;
      });
    }
    tree.innerHTML = html;
  }

  function updateNavActive(id) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  // ── 카테고리 필터 버튼 ───────────────────────────────────
  function buildCatFilters() {
    const wrap = document.getElementById('cat-filters');
    let html = `<button class="cat-btn active" data-cat="all" onclick="filterCat('all')">전체</button>`;
    for (const [cat, info] of Object.entries(CATEGORIES)) {
      html += `<button class="cat-btn" data-cat="${cat}" onclick="filterCat('${cat}')">${info.label}</button>`;
    }
    wrap.innerHTML = html;
  }

  window.filterCat = function (cat) {
    currentCat = cat;
    document.querySelectorAll('.cat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });
    applyMapFilter();
  };

  function applyMapFilter() {
    document.querySelectorAll('.map-node').forEach(g => {
      const item = CONCEPTS.find(c => c.id === g.dataset.id);
      const show = currentCat === 'all' || (item && item.cat === currentCat);
      g.style.opacity = show ? '1' : '0.12';
    });
    document.querySelectorAll('.map-edge').forEach(line => {
      const [a, b] = line.dataset.pair.split('|');
      const ia = CONCEPTS.find(c => c.id === a);
      const ib = CONCEPTS.find(c => c.id === b);
      const show = currentCat === 'all' ||
        ((ia && ia.cat === currentCat) || (ib && ib.cat === currentCat));
      line.style.opacity = show ? '1' : '0.05';
    });
  }

  // ── 관계도 SVG 생성 ──────────────────────────────────────
  function buildMap() {
    const svg = document.getElementById('relation-svg');
    const { viewW, viewH, nodeW, nodeH, rx } = MAP_CONFIG;
    svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`);

    // 화살표 마커
    svg.innerHTML = `
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke"
            stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </marker>
      </defs>`;

    // 엣지 (연결선) — 노드보다 먼저 그려야 아래에 깔림
    const drawn = new Set();
    CONCEPTS.forEach(item => {
      (item.related || []).forEach(rid => {
        const key = [item.id, rid].sort().join('|');
        if (drawn.has(key)) return;
        drawn.add(key);
        const target = CONCEPTS.find(c => c.id === rid);
        if (!target) return;

        const x1 = item.x + nodeW / 2;
        const y1 = item.y + nodeH / 2;
        const x2 = target.x + nodeW / 2;
        const y2 = target.y + nodeH / 2;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#b0afa8');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-opacity', '0.5');
        line.setAttribute('fill', 'none');
        line.classList.add('map-edge');
        line.dataset.pair = key;
        svg.appendChild(line);
      });
    });

    // 노드
    CONCEPTS.forEach(item => {
      const cat = CATEGORIES[item.cat] || {};
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.classList.add('map-node');
      g.dataset.id = item.id;
      g.style.cursor = 'pointer';

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', item.x);
      rect.setAttribute('y', item.y);
      rect.setAttribute('width', nodeW);
      rect.setAttribute('height', nodeH);
      rect.setAttribute('rx', rx);
      rect.setAttribute('fill', cat.bg || '#f0efe9');
      rect.setAttribute('stroke', cat.color || '#888');
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-opacity', '0.8');

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', item.x + nodeW / 2);
      text.setAttribute('y', item.y + nodeH / 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', '12.5');
      text.setAttribute('font-weight', '500');
      text.setAttribute('fill', cat.color || '#333');
      text.setAttribute('font-family', "'Noto Sans KR', sans-serif");
      text.textContent = item.id;

      g.appendChild(rect);
      g.appendChild(text);

      // 이벤트
      g.addEventListener('mouseenter', e => onNodeHover(e, item));
      g.addEventListener('mouseleave', onNodeLeave);
      g.addEventListener('click', () => { selectMapNode(item.id); openCard(item.id); });
      // 호버 시 rect 밝기
      g.addEventListener('mouseenter', () => rect.setAttribute('fill-opacity', '0.75'));
      g.addEventListener('mouseleave', () => rect.setAttribute('fill-opacity', '1'));

      svg.appendChild(g);
    });
  }

  // 노드 호버
  function onNodeHover(e, item) {
    const tip = document.getElementById('map-tooltip');
    const cat = CATEGORIES[item.cat] || {};
    tip.innerHTML = `
      <div class="tip-title" style="color:${cat.color}">${item.id}</div>
      <div class="tip-desc">${item.short}</div>
      <div class="tip-related">연결: ${(item.related || []).map(r => `<span class="tip-tag">${r}</span>`).join('')}</div>`;

    const container = document.querySelector('.map-container');
    const cr = container.getBoundingClientRect();
    const nr = e.currentTarget.getBoundingClientRect();
    let left = nr.right - cr.left + 8;
    let top  = nr.top  - cr.top;
    if (left + 240 > cr.width) left = nr.left - cr.left - 248;
    tip.style.left = left + 'px';
    tip.style.top  = top + 'px';
    tip.classList.add('visible');

    highlightEdges(item.id, item.related || []);
  }

  function onNodeLeave() {
    document.getElementById('map-tooltip').classList.remove('visible');
    resetEdges();
  }

  function highlightEdges(id, related) {
    const ids = new Set([id, ...related]);
    document.querySelectorAll('.map-edge').forEach(l => {
      const [a, b] = l.dataset.pair.split('|');
      const active = a === id || b === id;
      l.setAttribute('stroke-opacity', active ? '0.9' : '0.07');
      l.setAttribute('stroke-width', active ? '1.8' : '0.8');
      l.setAttribute('stroke', active ? '#555' : '#b0afa8');
    });
    document.querySelectorAll('.map-node').forEach(g => {
      g.style.opacity = ids.has(g.dataset.id) ? '1' : '0.25';
    });
  }

  function resetEdges() {
    document.querySelectorAll('.map-edge').forEach(l => {
      l.setAttribute('stroke-opacity', '0.5');
      l.setAttribute('stroke-width', '1');
      l.setAttribute('stroke', '#b0afa8');
    });
    document.querySelectorAll('.map-node').forEach(g => g.style.opacity = '1');
    applyMapFilter();
  }

  function selectMapNode(id) {
    const item = CONCEPTS.find(c => c.id === id);
    if (!item) return;
    const cat = CATEGORIES[item.cat] || {};
    const panel = document.getElementById('map-detail');
    const relHtml = (item.related || []).map(r => {
      const ri = CONCEPTS.find(c => c.id === r);
      const rc = ri ? (CATEGORIES[ri.cat] || {}) : {};
      return `<span class="map-detail-tag"
        style="color:${rc.color||'#666'};border-color:${rc.color||'#ccc'}55;background:${rc.color||'#ccc'}11"
        onclick="openCard('${r}')">${r}</span>`;
    }).join('');

    panel.innerHTML = `
      <div class="map-detail-title" style="color:${cat.color}">${item.id}</div>
      <div class="map-detail-desc">${item.desc.slice(0, 140)}...</div>
      <div class="map-detail-tags">
        <span class="map-detail-label">연결 항목:</span>
        ${relHtml}
        <span class="map-detail-tag"
          style="color:${cat.color};border-color:${cat.color}55;background:${cat.color}11;margin-left:8px"
          onclick="openCard('${item.id}')">상세보기 →</span>
      </div>`;
  }

  // ── 탭 관리 ──────────────────────────────────────────────
  function renderTabs() {
    const scroll = document.querySelector('.tab-scroll');
    scroll.innerHTML = '';
    openTabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = 'view-tab';
      btn.textContent = tab.label;
      if (tab.id === '__map__') {
        btn.classList.toggle('active', currentView === 'map');
        btn.onclick = () => { showView('map'); };
      } else {
        btn.classList.toggle('active', currentView === 'card' && currentId === tab.id);
        btn.onclick = () => { currentId = tab.id; showView('card'); renderCard(tab.id); updateNavActive(tab.id); };
      }
      scroll.appendChild(btn);
    });
  }

  function addTab(id, label) {
    if (!openTabs.find(t => t.id === id)) {
      openTabs.push({ id, label });
    }
    renderTabs();
  }

  // ── 뷰 전환 ──────────────────────────────────────────────
  function showView(view) {
    currentView = view;
    document.getElementById('view-map').classList.toggle('hidden', view !== 'map');
    document.getElementById('view-card').classList.toggle('hidden', view !== 'card');
    renderTabs();
  }

  // ── 카드 뷰 렌더 ─────────────────────────────────────────
  window.openCard = function (id) {
    const item = CONCEPTS.find(c => c.id === id);
    if (!item) return;
    addTab(id, item.id);
    currentId = id;
    showView('card');
    renderCard(id);
    updateNavActive(id);
  };

  function renderCard(id) {
    const item = CONCEPTS.find(c => c.id === id);
    if (!item) return;
    const cat = CATEGORIES[item.cat] || {};

    const relHtml = (item.related || []).map(r => {
      const ri = CONCEPTS.find(c => c.id === r);
      const rc = ri ? (CATEGORIES[ri.cat] || {}) : {};
      return `<div class="card-related-item" onclick="openCard('${r}')">
        <div class="card-related-dot" style="background:${rc.color||'#aaa'}"></div>
        ${r}
      </div>`;
    }).join('');

    const pointsHtml = (item.points || []).map(p => `<li>${p}</li>`).join('');

    document.getElementById('card-content').innerHTML = `
      <div class="concept-card">
        <div class="card-breadcrumb">
          <span onclick="showView('map')">🗺 관계도</span>
          <span>›</span>
          <span style="color:${cat.color}">${cat.label || item.cat}</span>
          <span>›</span>
          <span>${item.id}</span>
        </div>
        <div class="card-cat-badge" style="color:${cat.color};background:${cat.bg};border:1px solid ${cat.color}33">
          ${cat.label || item.cat}
        </div>
        <div class="card-title">${item.id}</div>
        <div class="card-subtitle">${item.short}</div>
        <hr class="card-divider">

        <div class="card-section-title">개요</div>
        <div class="card-desc">${item.desc}</div>

        ${pointsHtml ? `
        <div class="card-section-title">핵심 포인트</div>
        <ul class="card-points">${pointsHtml}</ul>
        <hr class="card-divider">` : ''}

        <div class="card-section-title">연결 항목</div>
        <div class="card-related">${relHtml}</div>
      </div>`;
  }

  // ── 검색 ─────────────────────────────────────────────────
  function bindSearch() {
    const input = document.getElementById('search-input');
    const dropdown = document.getElementById('search-results');

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { dropdown.classList.remove('open'); return; }

      const matches = CONCEPTS.filter(c =>
        c.id.toLowerCase().includes(q) ||
        c.short.toLowerCase().includes(q) ||
        (c.desc || '').toLowerCase().includes(q)
      ).slice(0, 8);

      if (!matches.length) { dropdown.classList.remove('open'); return; }

      const cat2label = id => (CATEGORIES[id] || {}).label || id;
      dropdown.innerHTML = matches.map(c => `
        <div class="search-item" onclick="openCard('${c.id}');closeSearch()">
          <div class="search-item-name">${highlight(c.id, q)}</div>
          <div class="search-item-cat">${cat2label(c.cat)} — ${highlight(c.short, q)}</div>
        </div>`).join('');
      dropdown.classList.add('open');
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.header-search')) closeSearch();
    });
  }

  window.closeSearch = function () {
    document.getElementById('search-results').classList.remove('open');
    document.getElementById('search-input').value = '';
  };

  function highlight(text, q) {
    const re = new RegExp(`(${q})`, 'gi');
    return text.replace(re, '<mark style="background:#fff3a8;border-radius:2px">$1</mark>');
  }

  // ── 유틸 ─────────────────────────────────────────────────
  function groupByCat(items) {
    const g = {};
    items.forEach(item => {
      if (!g[item.cat]) g[item.cat] = [];
      g[item.cat].push(item);
    });
    return g;
  }

  // ── 시작 ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

})();
