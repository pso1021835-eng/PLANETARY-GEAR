/* 유성감속기 설계실 — 설계 지도 (globalThis.PGDMap)
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

  function mount(host, opt) {
    const E = opt.E, onOpen = opt.onOpen || (() => { });
    host.innerHTML = `<div class="mp"><svg class="mp-svg"></svg>
      <div class="mp-ui"><button data-a="all" class="btn">전체 보기</button><label class="sw"><input type="checkbox" data-a="flow" checked> 단계 흐름</label><label class="sw"><input type="checkbox" data-a="rel" checked> 상호작용</label><span class="x">끌어서 이동 · 휠로 확대 · 단계·항목을 누르세요</span></div>
      <aside class="mp-side" hidden></aside></div>`;
    const svg = host.querySelector('svg'), side = host.querySelector('.mp-side'), ui = host.querySelector('.mp-ui');
    const defs = el('defs', {}, svg);
    defs.innerHTML = `<marker id="mpA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1L10,5L0,9Z" fill="#e4612a"/></marker>
      <marker id="mpF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1L10,5L0,9Z" fill="#8a8a8a"/></marker>
      <radialGradient id="mpGlow"><stop offset="0" stop-color="#e4612a" stop-opacity=".35"/><stop offset="1" stop-color="#e4612a" stop-opacity="0"/></radialGradient>`;
    const cam = el('g', {}, svg), gEdge = el('g', { class: 'mp-edges' }, cam), gRel = el('g', { class: 'mp-rels' }, cam), gNode = el('g', { class: 'mp-nodes' }, cam);

    // ---- graph
    const stages = E.map((g, si) => ({ key: String(g.n), g, si, name: g.n === 'D' ? '가공·원가' : g.name }));
    const N = stages.length, RING = 980;
    const nodes = [], byId = {};
    const hub = { id: 'hub', type: 'hub', label: '유성감속기 설계', x: 0, y: 0, tx: 0, ty: 0, r: 70 };
    nodes.push(hub);
    stages.forEach(s => {
      const a = -Math.PI / 2 + 2 * Math.PI * s.si / N;
      s.a = a; s.cx = RING * Math.cos(a); s.cy = RING * Math.sin(a); s.side = Math.cos(a) >= -.01 ? 1 : -1;
      const n = { id: 'st-' + s.key, type: 'stage', s, label: (s.key === 'D' ? 'D ' : s.key + ' ') + s.name, x: s.cx * .2, y: s.cy * .2, tx: s.cx, ty: s.cy, r: 46, ok: s.g.gate.ok };
      nodes.push(n); byId[n.id] = n; s.node = n;
      s.items = s.g.items.map((it, k) => { const m = { id: it.id, type: 'item', it, s, k, x: n.x, y: n.y, tx: s.cx, ty: s.cy, r: 11, ok: it.ok, kind: it.kind }; nodes.push(m); byId[it.id] = m; return m; });
    });
    const rels = REL.filter(([a, b]) => byId[a] && byId[b]).map(([a, b, t]) => ({ a: byId[a], b: byId[b], t }));

    // ---- layout: collapsed clusters, focused stage fans its items out
    let focus = null, sel = null;
    function layout() {
      stages.forEach(s => {
        const open = focus === s.key, n = s.items.length, side = s.side;
        s.items.forEach((m, k) => {
          if (open) {   // mind-map branch: a column of items on the outward side, slightly bowed
            const u = k - (n - 1) / 2;
            m.tx = s.cx + side * (190 + 26 * Math.abs(u) ** 1.2); m.ty = s.cy + u * 58;
          } else {      // collapsed: a tight arc of dots
            const t = n > 1 ? k / (n - 1) - .5 : 0, ang = s.a + t * Math.min(Math.PI * .9, n * .14);
            m.tx = s.cx + 120 * Math.cos(ang); m.ty = s.cy + 120 * Math.sin(ang);
          }
          m.open = open;
        });
      });
    }
    // ---- camera
    const view = { x: 0, y: 0, k: .3 }; let tween = null;
    const W = () => svg.clientWidth || 1000, H = () => svg.clientHeight || 700;
    const applyCam = () => cam.setAttribute('transform', `translate(${W() / 2 - view.x * view.k},${H() / 2 - view.y * view.k}) scale(${view.k})`);
    function flyTo(x, y, k, ms = 700) { const a = { ...view }, b = { x, y, k }, t0 = performance.now(); tween = { a, b, t0, ms }; kick(); }
    function fitAll(ms) { flyTo(0, 0, Math.min(W(), H()) / (2 * RING + 700), ms); }
    // frame a set of world points, keeping clear of the side panel on the right
    function fitPts(pts, padX, padY, kMax, ms) {
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), w = Math.max(...xs) - Math.min(...xs) + padX, h = Math.max(...ys) - Math.min(...ys) + padY;
      const panel = 344, k = Math.min(kMax, Math.min((W() - panel) / w, H() / h));
      flyTo((Math.max(...xs) + Math.min(...xs)) / 2 + panel / 2 / k, (Math.max(...ys) + Math.min(...ys)) / 2, k, ms);
    }
    function fitStage(s, ms) { fitPts([s.node, ...s.items].map(m => [m.tx + (m === s.node ? 0 : s.side * 300), m.ty]).concat([[s.cx, s.cy]]), 260, 200, 1.1, ms); }

    // ---- drawing (DOM created once, attributes updated per frame)
    const col = ok => ok === true ? '#3fae6e' : ok === false ? '#d9493a' : '#8a8f97';
    const kindCol = { calc: '#7fb69a', in: '#9db8d9', man: '#e0c27a', none: '#5a5a5c' };
    nodes.forEach(n => {
      const g = el('g', { class: 'mp-n mp-' + n.type, tabindex: 0, role: 'button' }, gNode); n.g = g;
      if (n.type === 'hub') { el('circle', { r: 120, fill: 'url(#mpGlow)' }, g); n.c = el('circle', { r: n.r, class: 'hubc' }, g); n.t = el('text', { class: 'mp-t hubt', 'text-anchor': 'middle', y: 6 }, g); n.t.textContent = n.label; }
      else if (n.type === 'stage') { n.c = el('circle', { r: n.r, class: 'stc', stroke: col(n.ok) }, g); n.t = el('text', { class: 'mp-t stt', 'text-anchor': 'middle', y: n.r + 30 }, g); n.t.textContent = n.label; n.num = el('text', { class: 'mp-t stn', 'text-anchor': 'middle', y: 10 }, g); n.num.textContent = n.s.key; n.prog = el('text', { class: 'mp-t stp', 'text-anchor': 'middle', y: n.r + 54 }, g); n.prog.textContent = `${n.s.g.done}/${n.s.g.total}`; }
      else { const sd = n.s.side, an = sd > 0 ? 'start' : 'end'; n.c = el('circle', { r: n.r, class: 'itc', fill: kindCol[n.kind] || '#666', stroke: col(n.ok) }, g); n.t = el('text', { class: 'mp-t itt', x: sd * 20, y: 6, 'text-anchor': an }, g); n.t.textContent = n.id + '  ' + n.it.t; n.t2 = el('text', { class: 'mp-t itn', x: sd * 20, y: 26, 'text-anchor': an }, g); n.t2.textContent = n.it.val != null ? String(n.it.val).slice(0, 46) : ''; }
    });
    // tree + flow edges
    const tree = [], flow = [];
    stages.forEach((s, i) => { tree.push([hub, s.node, el('path', { class: 'mp-tree' }, gEdge)]); s.items.forEach(m => tree.push([s.node, m, el('path', { class: 'mp-tree it' }, gEdge)])); if (i < N - 2) flow.push([s.node, stages[i + 1].node, el('path', { class: 'mp-flow', 'marker-end': 'url(#mpF)' }, gEdge)]); });
    rels.forEach(r => { r.p = el('path', { class: 'mp-rel', 'marker-end': 'url(#mpA)' }, gRel); r.lab = el('text', { class: 'mp-rl', 'text-anchor': 'middle' }, gRel); r.lab.textContent = r.t; });

    const curve = (a, b, bend = .18) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y; const cx = mx - dy * bend, cy = my + dx * bend; return { d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`, cx, cy }; };
    const trim = (a, b, ra, rb) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return [{ x: a.x + dx / L * ra, y: a.y + dy / L * ra }, { x: b.x - dx / L * rb, y: b.y - dy / L * rb }]; };
    function draw() {
      const k = view.k, showName = k > .55;
      nodes.forEach(n => {
        n.g.setAttribute('transform', `translate(${n.x},${n.y})`);
        if (n.type === 'item') {
          const hl = sel && (sel === n || rels.some(r => (r.a === sel && r.b === n) || (r.b === sel && r.a === n)));
          n.t.style.opacity = n.open || hl || n.peek ? 1 : 0; n.t2.style.opacity = (n.open && showName) || sel === n ? 1 : 0;
          n.g.classList.toggle('hl', !!hl); n.g.classList.toggle('dim', !!sel && !hl && sel.type === 'item');
          n.g.classList.toggle('sel', sel === n);
        }
        if (n.type === 'stage') n.g.classList.toggle('sel', focus === n.s.key);
      });
      tree.forEach(([a, b, p]) => p.setAttribute('d', `M${a.x},${a.y} L${b.x},${b.y}`));
      flow.forEach(([a, b, p]) => { const [p1, p2] = trim(a, b, a.r + 8, b.r + 10); p.setAttribute('d', curve(p1, p2, -.12).d); });
      rels.forEach(r => {
        const [p1, p2] = trim(r.a, r.b, r.a.r + 4, r.b.r + 6), c = curve(p1, p2, .22);
        r.p.setAttribute('d', c.d);
        const on = sel && (r.a === sel || r.b === sel); r.p.classList.toggle('on', !!on); r.p.classList.toggle('dim', !!sel && !on);
        r.lab.setAttribute('x', (p1.x + 2 * c.cx + p2.x) / 4); r.lab.setAttribute('y', (p1.y + 2 * c.cy + p2.y) / 4); r.lab.style.opacity = on ? 1 : 0;
      });
      applyCam();
    }
    // ---- animation loop: nodes ease toward targets, camera tweens
    let raf = 0;
    function frame(now) {
      raf = 0; let moving = false;
      nodes.forEach(n => { const dx = n.tx - n.x, dy = n.ty - n.y; if (Math.abs(dx) + Math.abs(dy) > .3) { n.x += dx * .16; n.y += dy * .16; moving = true; } else { n.x = n.tx; n.y = n.ty; } });
      if (tween) { const t = Math.min(1, (now - tween.t0) / tween.ms), e = ease(t); view.x = tween.a.x + (tween.b.x - tween.a.x) * e; view.y = tween.a.y + (tween.b.y - tween.a.y) * e; view.k = tween.a.k * Math.pow(tween.b.k / tween.a.k, e); if (t >= 1) tween = null; moving = true; }
      draw();
      if (moving) kick();
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    // ---- side panel
    const KIND = globalThis.PGDProc?.KIND || {};
    function showSide(n) {
      if (!n) { side.hidden = true; return; }
      side.hidden = false;
      if (n.type === 'stage') {
        const s = n.s;
        side.innerHTML = `<div class="mp-sh"><span class="snum">${s.key}</span><b>${esc(s.name)}</b></div>
          <div class="pgate ${s.g.gate.ok === true ? 'ok' : s.g.gate.ok === false ? 'bad' : ''}">게이트 · ${esc(s.g.gate.t)} — ${s.g.gate.ok === true ? '통과' : s.g.gate.ok === false ? '미달' : '기준 없음'}</div>
          <ul class="mp-list">${s.items.map(m => `<li data-id="${m.id}"><span class="pid">${m.id}</span>${esc(m.it.t)}<i class="d" style="background:${col(m.ok)}"></i></li>`).join('')}</ul>
          <button class="btn primary" data-open="st-${s.key}">단계 페이지 열기 →</button>`;
      } else {
        const it = n.it, out = rels.filter(r => r.a === n), inn = rels.filter(r => r.b === n);
        side.innerHTML = `<div class="mp-sh"><span class="snum">${esc(n.s.key)}</span><b>${it.id} ${esc(it.t)}</b></div>
          <p><span class="kchip k-${it.kind}">${KIND[it.kind] || ''}</span> ${it.ok === true ? '<b class="good">✓ 통과</b>' : it.ok === false ? '<b class="bad">✗ 미달</b>' : ''}</p>
          <p class="mp-val">${esc(it.val ?? '—')}</p>
          ${out.length ? `<h4>이 항목이 바꾸는 것</h4><ul class="mp-list">${out.map(r => `<li data-id="${r.b.id}"><span class="pid">${r.b.id}</span>${esc(r.b.it.t)}<small>${esc(r.t)}</small></li>`).join('')}</ul>` : ''}
          ${inn.length ? `<h4>이 항목을 바꾸는 것</h4><ul class="mp-list">${inn.map(r => `<li data-id="${r.a.id}"><span class="pid">${r.a.id}</span>${esc(r.a.it.t)}<small>${esc(r.t)}</small></li>`).join('')}</ul>` : ''}
          <button class="btn primary" data-open="st-${n.s.key}" data-anchor="${it.id}">이 항목 열기 →</button>`;
      }
      side.querySelectorAll('[data-id]').forEach(li => li.onclick = () => selectItem(byId[li.dataset.id]));
      side.querySelectorAll('[data-open]').forEach(b => b.onclick = () => open(b.dataset.open, b.dataset.anchor));
    }
    function selectStage(s) { focus = s.key; sel = null; layout(); fitStage(s); showSide(s.node); kick(); }
    function selectItem(n) {
      if (focus !== n.s.key) { focus = n.s.key; layout(); }
      sel = n; showSide(n);
      // frame the item together with its related items
      const rel = rels.filter(r => r.a === n || r.b === n).map(r => r.a === n ? r.b : r.a);
      fitPts([n.s.node, n, ...rel].map(m => [m.tx + (m.type === 'item' ? m.s.side * 220 : 0), m.ty]), 360, 260, 1.1);
    }
    function open(stageId, anchor) {
      const n = anchor ? byId[anchor] : byId[stageId];
      if (n) flyTo(n.x, n.y, Math.min(3, view.k * 2.6), 380);
      host.querySelector('.mp').classList.add('leaving');
      setTimeout(() => onOpen(stageId, anchor), 360);
    }

    // ---- input: click, drag, wheel, keys
    let drag = null, moved = false;
    svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, target: e.target }; moved = false; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (moved) { tween = null; view.x = drag.vx - dx / view.k; view.y = drag.vy - dy / view.k; kick(); } });
    svg.addEventListener('pointerup', e => {
      const was = drag; drag = null; if (!was || moved) return;
      const g = was.target.closest?.('.mp-n'); const n = g && nodes.find(x => x.g === g);
      if (!n) { sel = null; showSide(focus ? byId['st-' + focus] : null); kick(); return; }
      if (n.type === 'hub') { focus = null; sel = null; layout(); fitAll(); showSide(null); }
      else if (n.type === 'stage') selectStage(n.s); else selectItem(n);
      kick();
    });
    svg.addEventListener('wheel', e => {
      e.preventDefault(); tween = null;
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left - W() / 2, my = e.clientY - r.top - H() / 2;
      const wx = view.x + mx / view.k, wy = view.y + my / view.k, k2 = Math.max(.08, Math.min(3, view.k * Math.exp(-e.deltaY * .0015)));
      view.k = k2; view.x = wx - mx / k2; view.y = wy - my / k2; kick();
    }, { passive: false });
    gNode.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const n = nodes.find(x => x.g === e.target); if (n?.type === 'stage') selectStage(n.s); else if (n?.type === 'item') selectItem(n); });
    gNode.addEventListener('pointerover', e => { const g = e.target.closest?.('.mp-item'); const n = g && nodes.find(x => x.g === g); if (n && !sel) { rels.forEach(r => { const on = r.a === n || r.b === n; r.p.classList.toggle('peek', on); r.lab.style.opacity = on ? 1 : 0; }); n.peek = true; kick(); } });
    gNode.addEventListener('pointerout', () => { nodes.forEach(n => n.peek = false); if (!sel) rels.forEach(r => { r.p.classList.remove('peek'); r.lab.style.opacity = 0; }); kick(); });
    ui.querySelector('[data-a="all"]').onclick = () => { focus = null; sel = null; layout(); fitAll(); showSide(null); kick(); };
    ui.querySelector('[data-a="flow"]').onchange = e => gEdge.classList.toggle('noflow', !e.target.checked);
    ui.querySelector('[data-a="rel"]').onchange = e => gRel.style.display = e.target.checked ? '' : 'none';
    const ro = new ResizeObserver(() => kick()); ro.observe(svg);

    // ---- start: burst out from the hub, then fit
    layout(); view.k = .12; fitAll(900);
    if (opt.focus) { const n = byId[opt.focus] || byId['st-' + opt.focus]; if (n) setTimeout(() => n.type === 'item' ? selectItem(n) : selectStage(n.s), 650); }
    kick();
    return { dispose() { cancelAnimationFrame(raf); ro.disconnect(); host.innerHTML = ''; }, state: () => ({ focus, sel: sel?.id }) };
  }
  globalThis.PGDMap = { mount, REL };
})();
