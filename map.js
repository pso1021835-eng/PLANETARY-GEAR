/* 유성감속기 설계실 — 설계 지도 (globalThis.PGDMap): 순서도 + 마인드맵 펼침
   모든 단계·세부 항목을 한 평면에 마인드맵처럼 배치한다. 끌어서 이동, 휠로 확대, 단계를 누르면 카메라가
   날아가 그 단계의 항목이 펼쳐지고, 항목을 누르면 연관 항목이 강조된다. 모든 전환은 보간 애니메이션.
   데이터는 PGDProc.evaluate 결과(E)와 아래 REL(항목 간 상호작용, 화이트보드 표 기준). */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 항목 간 상호작용 [바꾸는 항목, 따라 바뀌는 항목, 설명]
  const REL = [
    ['2-7', '5-6', '지지 강성·유격 → 유성 하중 분배'], ['2-5', '5-6', '스플라인 유격 → S2 자리잡음 → 2단 Kγ'],
    ['2-9', '3-3', '유성 수 → 조립 조건'], ['2-9', '3-4', '유성 수 → 인접 간섭'], ['2-9', '5-6', '유성 수 ↑ → Kγ ↑'],
    ['4-5', '5-3', '제작 오차 → Kv'], ['4-5', '5-4', '제작 오차 → KHβ'], ['4-5', '5-6', '제작 오차 → Kγ'],
    ['6-5', '5-4', '핀 처짐 → 유성 기울기 → KHβ'], ['6-6', '5-4', '캐리어 비틀림 → KHβ'],
    ['5-7', '3-7', '피팅 미달 → 치폭 증가'], ['3-7', '6-5', '치폭 ↑ → 핀 길이 ↑ → 처짐 ↑'],
    ['6-4', '7-2', '핀과 니들이 같은 공간을 나눔'], ['6-4', '3-9', '유성 보어 = 핀 + 2Dw → 림'],
    ['9-4', '7-3', '궤도면 경도 → 수명'], ['3-6', '8-1', '모듈·치폭 → 링 외경'], ['8-1', '7-5', '하우징 → 출력 베어링 dp'], ['7-5', '1-6', 'dp → 외경 한계'],
    ['3-8', '7-7', '헬리컬 추력 → 축방향 하중'], ['3-8', '6-6', '헬리컬 추력 → 캐리어'],
    ['3-9', '4-1', '전위 → 언더컷·이끝'], ['3-9', '4-4', '전위 → 내접 간섭'], ['3-9', '5-8', '전위 → 굽힘 강도'],
    ['9-1', '5-7', '재료 → 허용응력'], ['9-1', '3-6', '재료 등급 → 필요 모듈'],
    ['1-2', '5-12', '피크 토크 → 정적 안전율'], ['1-2', '6-4', '피크 토크 → 핀'], ['1-2', '8-3', '피크 토크 → 볼트'],
    ['1-5', '7-6', '외부 모멘트 → 출력 베어링 기울기'], ['7-6', '2-8', '기울기 → C2 지지'], ['2-8', '5-4', 'C2 기울기 → 2단 KHβ'],
    ['5-10', '10-6', '유막 ↔ 온도'], ['10-6', '10-5', '온도 → 효율'], ['8-6', '10-5', '실 마찰 → 효율'], ['8-2', '4-7', '압입 → 링 수축 → 백래시'],
    ['11-4', '11-5', '시험 차이 → 역산'], ['11-5', '2-7', '역산 → 지지 강성 재검토'], ['11-5', '5-4', '역산 → KHβ'], ['11-5', '5-6', '역산 → Kγ'],
    ['D3', '5-6', '핀 위치도 → Kγ'], ['D3', '4-5', '공차 ↔ 정밀도 등급'], ['D2', '3-6', '표준 모듈·호브'], ['D2', '3-8', '헬리컬 링 공구'],
    ['D4', '3-9', '최소 림 두께'], ['D1', '2-4', '링 가공 방식 ↔ 하우징 결합'], ['D5', '12-4', '원가 → 데이터시트'], ['D6', '3-8', '스퍼 전환 → 비틀림각'],
  ];
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const CW = 218, CH = 32, GY = 9, GX = 86, HEAD = 86, PERROW = 7;

  // 공급망 지도식 배치: 단계 = 열, 세부 항목 = 카드, 항목 간 상호작용 = 곡선. 전 항목이 항상 보인다.
  function mount(host, opt) {
    const E = opt.E, onOpen = opt.onOpen || (() => { });
    host.innerHTML = `<div class="mp sc"><svg class="mp-svg"></svg>
      <div class="sc-ctl"><select data-a="jump" aria-label="단계로 이동"><option value="">단계로 이동</option>${E.map(g => `<option value="${g.n}">${g.n === 'D' ? 'D 가공·원가' : g.n + ' ' + esc(g.name)}</option>`).join('')}</select><button data-a="all" class="scb">전체 맞춤</button><button data-a="rel" class="scb on" aria-pressed="true"><i></i>연관 선</button></div>
      <div class="sc-leg"><span><i class="l1"></i>상호작용</span><span><i class="l2"></i>단계 흐름</span><span><i class="d ok"></i>통과</span><span><i class="d bad"></i>미달</span><span><i class="d"></i>판정 없음</span><span class="r">항목에 올리면 연결을 따라갑니다 · 누르면 편집 · 끌어서 이동 · 휠 확대</span></div>
      <aside class="sc-side" hidden></aside></div>`;
    const root = host.querySelector('.mp'), svg = host.querySelector('svg'), side = host.querySelector('.sc-side');
    const cam = el('g', {}, svg), gFlow = el('g', {}, cam), gRel = el('g', { class: 'sc-rels' }, cam), gCol = el('g', {}, cam), gCard = el('g', {}, cam);
    const tone = ok => ok === true ? 'ok' : ok === false ? 'bad' : 'na';

    // ---------- layout
    const cols = E.map((g, i) => { const r = Math.floor(i / PERROW), c = i % PERROW; return { key: String(g.n), g, i, name: g.n === 'D' ? '가공·원가' : g.name, x: c * (CW + GX), r }; });
    const rowH = r => HEAD + Math.max(...cols.filter(c => c.r === r).map(c => c.g.items.length)) * (CH + GY) + 70;
    cols.forEach(c => { c.y = c.r ? rowH(0) : 0; });
    const byId = {}, cards = [];
    cols.forEach(c => {
      const g = el('g', { class: 'sc-col mp-n ' + tone(c.g.gate.ok), tabindex: 0, role: 'button', style: `animation-delay:${c.i * 45}ms` }, gCol); c.el = g;
      el('rect', { x: c.x - 10, y: c.y - 8, width: CW + 20, height: HEAD - 16, rx: 10, class: 'sc-hd' }, g);
      const n = el('text', { x: c.x, y: c.y + 20, class: 'sc-num' }, g); n.textContent = c.key === 'D' ? 'D' : c.key.padStart(2, '0');
      const t = el('text', { x: c.x + 34, y: c.y + 20, class: 'sc-name' }, g); t.textContent = c.name;
      el('circle', { cx: c.x + 5, cy: c.y + 43, r: 4.5, class: 'sc-dot' }, g);
      const s = el('text', { x: c.x + 16, y: c.y + 47.5, class: 'sc-sub' }, g); s.textContent = `게이트 ${c.g.gate.ok === true ? '통과' : c.g.gate.ok === false ? '미달' : '—'} · ${c.g.done}/${c.g.total}`;
      c.items = c.g.items.map((it, k) => {
        const y = c.y + HEAD + k * (CH + GY), cg = el('g', { class: 'sc-card mp-n ' + tone(it.ok) + ' k-' + it.kind, tabindex: 0, role: 'button', style: `animation-delay:${c.i * 45 + k * 18}ms` }, gCard);
        el('rect', { x: c.x, y, width: CW, height: CH, rx: 7, class: 'sc-bx' }, cg);
        el('rect', { x: c.x, y: y + 6, width: 3, height: CH - 12, rx: 1.5, class: 'sc-tk' }, cg);
        const a = el('text', { x: c.x + 12, y: y + 21, class: 'sc-id' }, cg); a.textContent = it.id;
        const b = el('text', { x: c.x + 48, y: y + 21, class: 'sc-tx' }, cg); b.textContent = it.t.length > 14 ? it.t.slice(0, 13) + '…' : it.t;
        const m = { id: it.id, it, c, k, el: cg, x: c.x, y: y + CH / 2 }; byId[it.id] = m; cards.push(m); return m;
      });
    });
    // stage flow: arcs between consecutive column heads
    cols.slice(0, -2).forEach((c, i) => {
      const n = cols[i + 1], same = n.r === c.r;
      const d = same ? `M${c.x + CW + 12},${c.y + 30} C${c.x + CW + 40},${c.y + 6} ${n.x - 40},${n.y + 6} ${n.x - 12},${n.y + 30}`
        : `M${c.x + CW / 2},${c.y + HEAD + c.g.items.length * (CH + GY) + 6} C${c.x + CW / 2},${n.y - 60} ${n.x + CW / 2},${n.y - 90} ${n.x + CW / 2},${n.y - 12}`;
      el('path', { d, class: 'sc-flow ' + tone(c.g.gate.ok) }, gFlow);
    });
    // relations
    const rels = REL.filter(([a, b]) => byId[a] && byId[b]).map(([a, b, t]) => {
      const A = byId[a], B = byId[b]; let d;
      if (A.c === B.c) { const x = A.x + CW; d = `M${x},${A.y} C${x + 46},${A.y} ${x + 46},${B.y} ${x},${B.y}`; }
      else { const fw = B.x > A.x, x1 = fw ? A.x + CW : A.x, x2 = fw ? B.x : B.x + CW, k = Math.max(40, Math.abs(x2 - x1) * .45) * (fw ? 1 : -1); d = `M${x1},${A.y} C${x1 + k},${A.y} ${x2 - k},${B.y} ${x2},${B.y}`; }
      return { a: A, b: B, t, p: el('path', { d, class: 'sc-rel' }, gRel) };
    });
    const outOf = {}, inOf = {};
    rels.forEach(r => { (outOf[r.a.id] = outOf[r.a.id] || []).push(r); (inOf[r.b.id] = inOf[r.b.id] || []).push(r); });
    // everything upstream and downstream of one item
    function trace(m) {
      const N = new Set([m]), L = new Set();
      const walk = (start, map, next) => { const q = [start]; while (q.length) { const x = q.shift(); for (const r of map[x.id] || []) { L.add(r); const y = next(r); if (!N.has(y)) { N.add(y); q.push(y); } } } };
      walk(m, outOf, r => r.b); walk(m, inOf, r => r.a); return { N, L };
    }
    let sel = null, focus = null, hover = null;
    function paint() {
      const m = hover || sel, tr = m ? trace(m) : null;
      root.classList.toggle('tracing', !!tr);
      cards.forEach(c => { c.el.classList.toggle('on', !!tr && tr.N.has(c)); c.el.classList.toggle('sel', sel === c); });
      rels.forEach(r => r.p.classList.toggle('on', !!tr && tr.L.has(r)));
      cols.forEach(c => c.el.classList.toggle('sel', focus === c.key && !sel));
    }

    // ---------- camera
    const view = { x: 0, y: 0, k: .4 }; let tween = null, raf = 0;
    const W = () => svg.clientWidth || 1000, H = () => svg.clientHeight || 700;
    const apply = () => cam.setAttribute('transform', `translate(${W() / 2 - view.x * view.k},${H() / 2 - view.y * view.k}) scale(${view.k})`);
    function frame(now) { raf = 0; if (tween) { const t = Math.min(1, (now - tween.t0) / tween.ms), e = ease(t); view.x = tween.a.x + (tween.b.x - tween.a.x) * e; view.y = tween.a.y + (tween.b.y - tween.a.y) * e; view.k = tween.a.k * Math.pow(tween.b.k / tween.a.k, e); if (t >= 1) tween = null; else kick(); } apply(); }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    function flyTo(x, y, k, ms = 700) { tween = { a: { ...view }, b: { x, y, k }, t0: performance.now(), ms }; kick(); }
    function fit(x0, y0, x1, y1, kMax, ms) { const panel = side.hidden ? 0 : side.offsetWidth + 20, k = Math.min(kMax, (W() - panel - 60) / (x1 - x0), (H() - 110) / (y1 - y0)); flyTo((x0 + x1) / 2 + panel / 2 / k, (y0 + y1) / 2 + 8 / k, k, ms); }
    const total = { x0: -20, y0: -30, x1: PERROW * (CW + GX) - GX + 20, y1: rowH(0) + rowH(1) - 60 };
    const fitAll = ms => fit(total.x0, total.y0, total.x1, total.y1, 1.2, ms);
    const fitCol = c => fit(c.x - CW * .9, c.y - 30, c.x + CW * 1.9, c.y + HEAD + c.items.length * (CH + GY) + 20, 1.5);

    // ---------- side panel
    const KIND = globalThis.PGDProc?.KIND || {};
    const chips = (list, pick, arrow) => list.map(r => { const x = pick(r); return `<button class="sc-chip ${tone(x.it.ok)}" data-id="${x.id}" title="${esc(r.t)}">${arrow} ${x.id} ${esc(x.it.t)}</button>`; }).join('');
    function showSide(x) {
      if (!x) { side.hidden = true; return; }
      side.hidden = false; side.scrollTop = 0; side.classList.toggle('wide', !x.items);
      if (x.items) {
        side.innerHTML = `<div class="sc-eye">설계 단계 ${x.key}</div><h3>${esc(x.name)}</h3>
          <div class="sc-gate ${tone(x.g.gate.ok)}">게이트 · ${esc(x.g.gate.t)} — ${x.g.gate.ok === true ? '통과' : x.g.gate.ok === false ? '미달' : '판정 기준 없음'}</div>
          <div class="sc-lab">세부 항목 ${x.g.total}개</div>
          <ul class="sc-list">${x.items.map(m => `<li data-id="${m.id}" class="${tone(m.it.ok)}"><span class="i">${m.id}</span><span>${esc(m.it.t)}</span><small>${esc(m.it.val ?? '')}</small></li>`).join('')}</ul>
          <button class="sc-cta" data-open="st-${x.key}">단계 페이지 열기</button>`;
      } else {
        const it = x.it, out = outOf[x.id] || [], inn = inOf[x.id] || [];
        side.innerHTML = `<div class="sc-eye">${esc(x.c.key)} ${esc(x.c.name)} · ${KIND[it.kind] || ''}</div><h3>${it.id} ${esc(it.t)}</h3>
          <p class="sc-val ${tone(it.ok)}">${esc(it.val ?? '—')}${it.ok === true ? ' <b>통과</b>' : it.ok === false ? ' <b>미달</b>' : ''}</p>
          ${inn.length ? `<div class="sc-lab">이 항목을 바꾸는 것</div><div class="sc-chips">${chips(inn, r => r.a, '←')}</div>` : ''}
          ${out.length ? `<div class="sc-lab">이 항목이 바꾸는 것</div><div class="sc-chips">${chips(out, r => r.b, '→')}</div>` : ''}
          <div class="sc-lab">입력 · 결과</div><div class="mp-detail">${opt.detail ? opt.detail(it.id) : ''}</div>
          <button class="sc-cta ghost" data-open="st-${x.c.key}" data-anchor="${it.id}">단계 페이지에서 크게 보기</button>`;
        if (opt.bindDetail) opt.bindDetail(side.querySelector('.mp-detail'), it.id);
      }
      side.insertAdjacentHTML('afterbegin', '<button class="mp-x" aria-label="닫기">×</button>');
      side.querySelector('.mp-x').onclick = () => clear();
      side.querySelectorAll('[data-id]').forEach(b => b.onclick = () => selectItem(byId[b.dataset.id], true));
      side.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { root.classList.add('leaving'); setTimeout(() => onOpen(b.dataset.open, b.dataset.anchor), 300); });
    }
    function clear() { sel = null; focus = null; showSide(null); paint(); fitAll(); }
    function selectCol(c) { sel = null; focus = c.key; showSide(c); paint(); fitCol(c); }
    function selectItem(m, fly) {
      sel = m; focus = m.c.key; showSide(m); paint();
      const tr = trace(m), xs = [...tr.N].map(n => n.x), ys = [...tr.N].map(n => n.y);
      if (fly !== false) fit(Math.min(...xs) - 30, Math.min(...ys) - 90, Math.max(...xs) + CW + 30, Math.max(...ys) + 60, 1.25);
    }

    // ---------- input
    const hit = t => { const g = t.closest?.('.mp-n'); if (!g) return null; return cards.find(m => m.el === g) || cols.find(c => c.el === g) || null; };
    let drag = null, moved = false;
    svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, target: e.target }; moved = false; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => {
      if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (moved) { tween = null; view.x = drag.vx - dx / view.k; view.y = drag.vy - dy / view.k; kick(); } return; }
      const x = hit(e.target), h = x && !x.items ? x : null; if (h !== hover) { hover = h; paint(); }
    });
    svg.addEventListener('pointerleave', () => { if (hover) { hover = null; paint(); } });
    svg.addEventListener('pointerup', () => { const was = drag; drag = null; if (!was || moved) return; const x = hit(was.target); if (!x) { if (sel || focus) clear(); return; } x.items ? selectCol(x) : selectItem(x); });
    svg.addEventListener('wheel', e => { e.preventDefault(); tween = null; const r = svg.getBoundingClientRect(), mx = e.clientX - r.left - W() / 2, my = e.clientY - r.top - H() / 2, wx = view.x + mx / view.k, wy = view.y + my / view.k, k2 = Math.max(.15, Math.min(3, view.k * Math.exp(-e.deltaY * .0015))); view.k = k2; view.x = wx - mx / k2; view.y = wy - my / k2; kick(); }, { passive: false });
    cam.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const x = hit(e.target); if (x) x.items ? selectCol(x) : selectItem(x); });
    const ctl = host.querySelector('.sc-ctl');
    ctl.querySelector('[data-a="all"]').onclick = clear;
    ctl.querySelector('[data-a="rel"]').onclick = e => { const b = e.currentTarget, on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); gRel.style.display = on ? '' : 'none'; };
    ctl.querySelector('[data-a="jump"]').onchange = e => { const c = cols.find(x => x.key === e.target.value); if (c) selectCol(c); e.target.value = ''; };
    const ro = new ResizeObserver(() => kick()); ro.observe(svg);
    const api = { dispose() { cancelAnimationFrame(raf); ro.disconnect(); host.innerHTML = ''; }, state: () => ({ focus, sel: sel?.id, view: { ...view }, scroll: side.scrollTop }), select: id => { const m = byId[id]; if (m) selectItem(m); } };

    if (opt.restore) {
      const r = opt.restore; root.classList.add('noanim'); Object.assign(view, r.view); focus = r.focus; sel = r.sel ? byId[r.sel] : null;
      showSide(sel || cols.find(c => c.key === focus) || null); side.scrollTop = r.scroll || 0; paint(); kick(); return api;
    }
    view.k = .25; view.x = (total.x0 + total.x1) / 2; view.y = (total.y0 + total.y1) / 2; fitAll(900);
    if (opt.focus) { const x = byId[opt.focus] || cols.find(c => c.key === String(opt.focus).replace('st-', '')); if (x) setTimeout(() => x.items ? selectCol(x) : selectItem(x), 750); }
    return api;
  }
  globalThis.PGDMap = { mount, REL };
})();
