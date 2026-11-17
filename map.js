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
  const BW = 230, BH = 92, DW = 150, DH = 104, STEP = 270, ROWH = 330, PER = 3;
  // 미달(No) 시 돌아가는 단계 — 마스터플랜 검증 루프 기준
  const BACK = { 4: '3', 5: '3', 7: '6', 10: '2', 11: '2' };

  function mount(host, opt) {
    const E = opt.E, onOpen = opt.onOpen || (() => { });
    host.innerHTML = `<div class="mp fl"><svg class="mp-svg"></svg>
      <div class="mp-ui"><button data-a="all" class="btn">전체 보기</button><label class="sw"><input type="checkbox" data-a="rel" checked> 상호작용</label><span class="x">단계를 누르면 세부 항목이 가지로 펼쳐집니다 · 끌어서 이동 · 휠 확대</span></div>
      <aside class="mp-side" hidden></aside></div>`;
    const svg = host.querySelector('svg'), side = host.querySelector('.mp-side'), ui = host.querySelector('.mp-ui');
    el('defs', {}, svg).innerHTML = `<marker id="mpA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1L10,5L0,9Z" fill="#6a93c2"/></marker>
      <marker id="mpR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1L10,5L0,9Z" fill="#e4612a"/></marker>
      <filter id="mpSh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#2b4a6b" flood-opacity=".18"/></filter>`;
    const cam = el('g', {}, svg), gFlow = el('g', {}, cam), gBox = el('g', {}, cam), gDim = el('rect', { class: 'mp-dim', x: -5000, y: -5000, width: 20000, height: 20000 }, cam), gBr = el('g', {}, cam), gItem = el('g', {}, cam), gRel = el('g', { class: 'mp-rels' }, cam);

    // ---------- process layout: snake rows of [stage box → gate diamond]
    const stages = E.filter(g => g.n !== 'D').map((g, i) => ({ key: String(g.n), g, i, name: g.name }));
    const dfm = E.find(g => g.n === 'D');
    const pos = i => { const r = Math.floor(i / PER), c = i % PER, dir = r % 2 ? -1 : 1, col = dir > 0 ? c : PER - 1 - c; return { r, dir, bx: col * 2 * STEP, y: r * ROWH }; };
    stages.forEach(s => { const p = pos(s.i); s.r = p.r; s.dir = p.dir; s.x = p.bx; s.y = p.y; s.dx = p.bx + p.dir * STEP; });
    const byId = {}, items = [];
    const start = { x: stages[0].x - STEP * .9, y: 0 }, last = stages.at(-1), end = { x: last.dx + last.dir * STEP * .9, y: last.y };
    const col = ok => ok === true ? '#3f9d68' : ok === false ? '#d24a36' : '#9fb3c8';

    // ---------- draw static flow
    const pill = (x, y, txt, cls) => { const g = el('g', { class: 'mp-pill ' + (cls || '') }, gBox); el('rect', { x: x - 80, y: y - 34, width: 160, height: 68, rx: 34 }, g); const t = el('text', { x, y: y + 7, 'text-anchor': 'middle' }, g); t.textContent = txt; return g; };
    const arrow = (d, cls = 'mp-ar', lab, lx, ly) => { el('path', { d, class: cls, 'marker-end': 'url(#mpA)' }, gFlow); if (lab) { const t = el('text', { x: lx, y: ly, class: 'mp-yn', 'text-anchor': 'middle' }, gFlow); t.textContent = lab; } };
    pill(start.x, start.y, '시작');
    arrow(`M${start.x + 80},0 H${stages[0].x - BW / 2 - 2}`);
    stages.forEach((s, i) => {
      // stage box
      const g = el('g', { class: 'mp-n mp-stage', tabindex: 0, role: 'button' }, gBox); s.gEl = g;
      s.rect = el('rect', { x: s.x - BW / 2, y: s.y - BH / 2, width: BW, height: BH, rx: 6, class: 'stb' }, g);
      el('circle', { cx: s.x + BW / 2 - 14, cy: s.y - BH / 2 + 14, r: 6, fill: col(s.g.gate.ok) }, g);
      const t1 = el('text', { x: s.x, y: s.y - 8, 'text-anchor': 'middle', class: 'stt' }, g); t1.textContent = `${s.key}. ${s.name}`;
      const t2 = el('text', { x: s.x, y: s.y + 22, 'text-anchor': 'middle', class: 'stp' }, g); t2.textContent = `세부 ${s.g.total}개 · 처리 ${s.g.done}`;
      // gate diamond
      const dg = el('g', { class: 'mp-n mp-gate', tabindex: 0, role: 'button' }, gBox); s.dEl = dg;
      el('polygon', { points: `${s.dx},${s.y - DH / 2} ${s.dx + DW / 2},${s.y} ${s.dx},${s.y + DH / 2} ${s.dx - DW / 2},${s.y}`, class: 'gtd ' + (s.g.gate.ok === true ? 'ok' : s.g.gate.ok === false ? 'bad' : '') }, dg);
      const gt = el('text', { x: s.dx, y: s.y - 4, 'text-anchor': 'middle', class: 'gtt' }, dg); gt.textContent = '게이트';
      const gs = el('text', { x: s.dx, y: s.y + 18, 'text-anchor': 'middle', class: 'gts' }, dg); gs.textContent = s.g.gate.ok === true ? '통과' : s.g.gate.ok === false ? '미달' : '기준 없음';
      // box → gate
      arrow(`M${s.x + s.dir * (BW / 2)},${s.y} H${s.dx - s.dir * (DW / 2 + 2)}`);
      // gate → next (Yes)
      const n = stages[i + 1];
      if (n) {
        if (n.r === s.r) arrow(`M${s.dx + s.dir * DW / 2},${s.y} H${n.x - s.dir * (BW / 2 + 2)}`, 'mp-ar', '통과', (s.dx + n.x) / 2, s.y - 10);
        else arrow(`M${s.dx},${s.y + DH / 2} V${n.y - ROWH / 2 + 20} H${n.x} V${n.y - BH / 2 - 2}`, 'mp-ar', '통과', s.dx + 26, s.y + DH / 2 + 26);
      } else arrow(`M${s.dx + s.dir * DW / 2},${s.y} H${end.x - s.dir * 82}`, 'mp-ar', '통과', (s.dx + end.x) / 2, s.y - 10);
      // gate No → back
      const back = BACK[s.key] ? stages.find(x => x.key === BACK[s.key]) : s;
      if (back === s) arrow(`M${s.dx},${s.y - DH / 2} V${s.y - BH / 2 - 44} H${s.x} V${s.y - BH / 2 - 2}`, 'mp-ar no', '미달', (s.x + s.dx) / 2, s.y - BH / 2 - 52);
      else {   // long return: down to the channel, out to the left margin, up to just under the target row, into the target box from below
        const j = Object.keys(BACK).indexOf(s.key), ch = s.y + ROWH / 2 - 14 - j * 6, mx = Math.min(...stages.map(q => q.dx), end.x - 120) - DW / 2 - 50 - j * 22, uy = back.y + BH / 2 + 34 + j * 8;
        arrow(`M${s.dx},${s.y + DH / 2} V${ch} H${mx} V${uy} H${back.x - 30 + j * 12} V${back.y + BH / 2 + 2}`, 'mp-ar no long', `미달 → ${back.key}단계`, s.dx + (mx - s.dx) * .5, ch - 8);
      }
    });
    pill(end.x, end.y, '출시');
    // 가공·원가 병행 트랙: a lane box beside the flow
    const minX = Math.min(...stages.map(s => Math.min(s.x, s.dx))) - BW, maxX = Math.max(...stages.map(s => Math.max(s.x, s.dx))) + BW;
    if (dfm) {
      const dx = maxX + 240, dy = ROWH * 1.5, g = el('g', { class: 'mp-n mp-stage mp-dfm', tabindex: 0, role: 'button' }, gBox);
      const s = { key: 'D', g: dfm, name: '가공·원가 (병행)', x: dx, y: dy, dir: 1, gEl: g, r: -1 };
      el('rect', { x: dx - BW / 2, y: dy - BH / 2 - 30, width: BW, height: BH + 60, rx: 6, class: 'stb dfm' }, g);
      const t1 = el('text', { x: dx, y: dy - 18, 'text-anchor': 'middle', class: 'stt' }, g); t1.textContent = 'D. 가공·원가';
      const t2 = el('text', { x: dx, y: dy + 10, 'text-anchor': 'middle', class: 'stp' }, g); t2.textContent = '설계 단계와 병행';
      const t3 = el('text', { x: dx, y: dy + 34, 'text-anchor': 'middle', class: 'stp' }, g); t3.textContent = `세부 ${dfm.total}개`;
      el('path', { d: `M${dx - BW / 2},${dy} H${maxX + 20}`, class: 'mp-ar par' }, gFlow);
      stages.push(s);
    }
    // ---------- items (hidden until their stage opens): mind-map branches under the box
    stages.forEach(s => {
      s.items = s.g.items.map((it, k) => {
        const g = el('g', { class: 'mp-n mp-item', tabindex: 0, role: 'button' }, gItem);
        const r = el('rect', { x: 0, y: -19, width: 250, height: 38, rx: 6, class: 'itb', stroke: col(it.ok) }, g);
        const t = el('text', { x: 12, y: 5, class: 'itt' }, g); t.textContent = `${it.id}  ${it.t}`;
        const br = el('path', { class: 'mp-br' }, gBr);
        const m = { id: it.id, it, s, k, g, br, x: s.x, y: s.y, tx: s.x, ty: s.y, a: 0, ta: 0 };
        byId[it.id] = m; items.push(m); return m;
      });
    });
    const rels = REL.filter(([a, b]) => byId[a] && byId[b]).map(([a, b, t]) => ({ a: byId[a], b: byId[b], t }));

    // ---------- state + layout of the open stage
    let focus = null, sel = null;
    function layout() {
      items.forEach(m => {
        const open = focus === m.s.key, s = m.s, n = s.items.length;
        if (open) {   // branches fan out below the box (mind-map), two columns when long
          const cols = n > 7 ? 2 : 1, per = Math.ceil(n / cols), c = Math.floor(m.k / per), k = m.k % per;
          m.side = cols === 2 && c === 0 ? -1 : 1;
          m.tx = m.side < 0 ? s.x - 34 - 250 : s.x + 34; m.ty = s.y + BH / 2 + 70 + k * 52; m.ta = 1;
        } else { m.tx = s.x - 125; m.ty = s.y; m.ta = 0; }
      });
      gDim.classList.toggle('on', !!focus);
      stages.forEach(s => s.gEl.classList.toggle('sel', focus === s.key));
    }
    // ---------- camera
    const view = { x: 0, y: 0, k: .3 }; let tween = null;
    const W = () => svg.clientWidth || 1000, H = () => svg.clientHeight || 700;
    const applyCam = () => cam.setAttribute('transform', `translate(${W() / 2 - view.x * view.k},${H() / 2 - view.y * view.k}) scale(${view.k})`);
    function flyTo(x, y, k, ms = 750) { tween = { a: { ...view }, b: { x, y, k }, t0: performance.now(), ms }; kick(); }
    function fitPts(pts, padX, padY, kMax, ms) {
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), w = Math.max(...xs) - Math.min(...xs) + padX, h = Math.max(...ys) - Math.min(...ys) + padY;
      const panel = side.hidden ? 0 : 344, k = Math.min(kMax, (W() - panel) / w, H() / h);
      flyTo((Math.max(...xs) + Math.min(...xs)) / 2 + panel / 2 / k, (Math.max(...ys) + Math.min(...ys)) / 2, k, ms);
    }
    const fitAll = ms => fitPts([[Math.min(minX, end.x) - 300, -ROWH * .6], [maxX + 380, (Math.ceil(12 / PER) - 1) * ROWH + ROWH * .6]], 80, 80, 1, ms);
    const fitStage = s => fitPts([[s.x - BW, s.y - BH], [s.x + BW, s.y + BH / 2 + 80 + Math.ceil(s.items.length / (s.items.length > 7 ? 2 : 1)) * 52]], 160, 120, 1.25);

    // ---------- per-frame
    function draw() {
      items.forEach(m => {
        m.g.setAttribute('transform', `translate(${m.x},${m.y})`); m.g.style.opacity = m.a; m.g.style.pointerEvents = m.a > .5 ? '' : 'none';
        const s = m.s, sx = s.x, sy = s.y + BH / 2 + (s.key === 'D' ? 30 : 0), ex = m.x, ey = m.y;
        const tip = m.side < 0 ? ex + 250 : ex, sg = m.side < 0 ? -1 : 1;   // trunk down the box centre, then a rounded branch to the item
        m.br.setAttribute('d', `M${sx},${sy} V${ey - 14} Q${sx},${ey} ${sx + sg * 14},${ey} H${tip}`); m.br.style.opacity = m.a;
        const hl = sel && (sel === m || rels.some(r => (r.a === sel && r.b === m) || (r.b === sel && r.a === m)));
        m.g.classList.toggle('sel', sel === m); m.g.classList.toggle('hl', !!hl && sel !== m);
      });
      // relations of the selected item: to the related item if its stage is open, else to that stage's box
      rels.forEach(r => {
        const on = sel && (r.a === sel || r.b === sel);
        if (!r.p) { r.p = el('path', { class: 'mp-rel', 'marker-end': 'url(#mpR)' }, gRel); r.lab = el('text', { class: 'mp-rl', 'text-anchor': 'middle' }, gRel); r.lab.textContent = r.t; }
        r.p.style.display = r.lab.style.display = on && relOn ? '' : 'none'; if (!on || !relOn) return;
        const P = m => m.a > .5 ? { x: m.x + (m.side < 0 ? 0 : 250), y: m.y } : { x: m.s.x, y: m.s.y };
        const A = P(r.a), B = P(r.b), mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, cx = mx - (B.y - A.y) * .2, cy = my + (B.x - A.x) * .2;
        r.p.setAttribute('d', `M${A.x},${A.y} Q${cx},${cy} ${B.x},${B.y}`); r.lab.setAttribute('x', (A.x + 2 * cx + B.x) / 4); r.lab.setAttribute('y', (A.y + 2 * cy + B.y) / 4 - 6);
      });
      applyCam();
    }
    let raf = 0, relOn = true;
    function frame(now) {
      raf = 0; let moving = false;
      items.forEach(m => { const dx = m.tx - m.x, dy = m.ty - m.y, da = m.ta - m.a; if (Math.abs(dx) + Math.abs(dy) > .3 || Math.abs(da) > .01) { m.x += dx * .18; m.y += dy * .18; m.a += da * .2; moving = true; } else { m.x = m.tx; m.y = m.ty; m.a = m.ta; } });
      if (tween) { const t = Math.min(1, (now - tween.t0) / tween.ms), e = ease(t); view.x = tween.a.x + (tween.b.x - tween.a.x) * e; view.y = tween.a.y + (tween.b.y - tween.a.y) * e; view.k = tween.a.k * Math.pow(tween.b.k / tween.a.k, e); if (t >= 1) tween = null; moving = true; }
      draw(); if (moving) kick();
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    // ---------- side panel
    const KIND = globalThis.PGDProc?.KIND || {};
    function showSide(x) {
      if (!x) { side.hidden = true; return; }
      side.hidden = false;
      if (x.items) {
        side.innerHTML = `<div class="mp-sh"><span class="snum">${x.key}</span><b>${esc(x.name)}</b></div>
          <div class="pgate ${x.g.gate.ok === true ? 'ok' : x.g.gate.ok === false ? 'bad' : ''}">게이트 · ${esc(x.g.gate.t)} — ${x.g.gate.ok === true ? '통과' : x.g.gate.ok === false ? '미달' : '기준 없음'}</div>
          <ul class="mp-list">${x.items.map(m => `<li data-id="${m.id}"><span class="pid">${m.id}</span>${esc(m.it.t)}<i class="d" style="background:${col(m.it.ok)}"></i></li>`).join('')}</ul>
          <button class="btn primary" data-open="st-${x.key}">단계 페이지 열기 →</button>`;
      } else {
        const it = x.it, out = rels.filter(r => r.a === x), inn = rels.filter(r => r.b === x);
        side.innerHTML = `<div class="mp-sh"><span class="snum">${esc(x.s.key)}</span><b>${it.id} ${esc(it.t)}</b></div>
          <p><span class="kchip k-${it.kind}">${KIND[it.kind] || ''}</span> ${it.ok === true ? '<b class="good">✓ 통과</b>' : it.ok === false ? '<b class="bad">✗ 미달</b>' : ''}</p>
          <p class="mp-val">${esc(it.val ?? '—')}</p>
          ${out.length ? `<h4>이 항목이 바꾸는 것</h4><ul class="mp-list">${out.map(r => `<li data-id="${r.b.id}"><span class="pid">${r.b.id}</span>${esc(r.b.it.t)}<small>${esc(r.t)}</small></li>`).join('')}</ul>` : ''}
          ${inn.length ? `<h4>이 항목을 바꾸는 것</h4><ul class="mp-list">${inn.map(r => `<li data-id="${r.a.id}"><span class="pid">${r.a.id}</span>${esc(r.a.it.t)}<small>${esc(r.t)}</small></li>`).join('')}</ul>` : ''}
          <button class="btn primary" data-open="st-${x.s.key}" data-anchor="${it.id}">이 항목 열기 →</button>`;
      }
      side.querySelectorAll('[data-id]').forEach(li => li.onclick = () => selectItem(byId[li.dataset.id]));
      side.querySelectorAll('[data-open]').forEach(b => b.onclick = () => open(b.dataset.open, b.dataset.anchor));
    }
    function selectStage(s) { if (focus === s.key && !sel) { focus = null; layout(); showSide(null); fitAll(); kick(); return; } focus = s.key; sel = null; layout(); showSide(s); fitStage(s); kick(); }
    function selectItem(m) {
      const changed = focus !== m.s.key; focus = m.s.key; sel = m; layout(); showSide(m);
      if (changed) fitStage(m.s); kick();
    }
    function open(stageId, anchor) { host.querySelector('.mp').classList.add('leaving'); flyTo(view.x, view.y, view.k * 1.6, 380); setTimeout(() => onOpen(stageId, anchor), 340); }

    // ---------- input
    let drag = null, moved = false;
    const hit = t => { const g = t.closest?.('.mp-n'); if (!g) return null; const it = items.find(m => m.g === g); if (it) return it; return stages.find(s => s.gEl === g || s.dEl === g) || null; };
    svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, target: e.target }; moved = false; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (moved) { tween = null; view.x = drag.vx - dx / view.k; view.y = drag.vy - dy / view.k; kick(); } });
    svg.addEventListener('pointerup', () => {
      const was = drag; drag = null; if (!was || moved) return;
      const x = hit(was.target);
      if (!x) { if (sel) { sel = null; showSide(stages.find(s => s.key === focus)); } else if (focus) { focus = null; layout(); showSide(null); fitAll(); } kick(); return; }
      if (x.items) selectStage(x); else selectItem(x);
    });
    svg.addEventListener('wheel', e => {
      e.preventDefault(); tween = null;
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left - W() / 2, my = e.clientY - r.top - H() / 2;
      const wx = view.x + mx / view.k, wy = view.y + my / view.k, k2 = Math.max(.1, Math.min(3, view.k * Math.exp(-e.deltaY * .0015)));
      view.k = k2; view.x = wx - mx / k2; view.y = wy - my / k2; kick();
    }, { passive: false });
    cam.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const x = hit(e.target); if (x) x.items ? selectStage(x) : selectItem(x); });
    ui.querySelector('[data-a="all"]').onclick = () => { focus = null; sel = null; layout(); showSide(null); fitAll(); kick(); };
    ui.querySelector('[data-a="rel"]').onchange = e => { relOn = e.target.checked; kick(); };
    const ro = new ResizeObserver(() => kick()); ro.observe(svg);

    layout(); view.k = .15; fitAll(900);
    if (opt.focus) { const x = byId[opt.focus] || stages.find(s => s.key === String(opt.focus).replace('st-', '')); if (x) setTimeout(() => x.items ? selectStage(x) : selectItem(x), 700); }
    kick();
    return { dispose() { cancelAnimationFrame(raf); ro.disconnect(); host.innerHTML = ''; }, state: () => ({ focus, sel: sel?.id }) };
  }
  globalThis.PGDMap = { mount, REL };
})();
