/* 유성감속기 설계실 — 2D part drawings (globalThis.PGDDraw)
   For each part: axial front view (x–y, looking along the axis from the input side) and
   radial right section view (z horizontal = input → output, r vertical, cut through the axis).
   Every dimension tied to an input path is a clickable object (data-p); the app writes the value
   and recomputes, so the 3D model and BOM update immediately. Geometry comes from PGD3D.layout,
   the same source as the 3D model, so drawing and model never disagree. */
(function () {
  'use strict';
  const f = (x, d = 2) => Number.isFinite(x) ? (+x.toFixed(d)).toString() : '—';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------------ part model
  // front: shapes centred on the part axis   sec: closed (r, z) profiles (upper half; mirrored)
  // fd: diameter dims (front)   ad: axial dims (section)   vd: diameter dims (section)   rd: radial dims (section)
  function model(R, D, id) {
    const P = globalThis.PGD3D, L = P.layout(R, D);
    const rows = {}; try { P.partSchema(R, D, id).forEach(r => { if (r.path) rows[r.path] = r; }); } catch (e) { }
    // tie a dimension to an input path; geometric value is used when the input is blank (auto)
    const at = (path, geo, label) => {
      const r = rows[path];
      if (!r || r.readonly) return { value: geo, label };
      const v = Number.isFinite(+r.value) && +r.value > 0 ? +r.value : geo;
      return { value: v, label, path, lock: !!r.lock, auto: !(Number.isFinite(+r.value) && +r.value > 0) };
    };
    const ref = (value, label) => ({ value, label });
    const M = { front: [], sec: [], fd: [], ad: [], vd: [], rd: [], axisSec: true, notes: [] };
    const rect = (r0, r1, z0, z1, o = {}) => M.sec.push({ pts: [[r0, z0], [r1, z0], [r1, z1], [r0, z1]], ...o });
    const circ = (r, o = {}) => M.front.push({ t: 'c', r, ...o });
    const m = /^(sun|planet|ring|pin|needle|carrier)(\d?)$/.exec(id);
    if (m) {
      const i = m[2] ? +m[2] - 1 : 0, x = L.S[i], st = x.st, g = x.g, sh = x.carrier;
      if (m[1] === 'sun' || m[1] === 'planet' || m[1] === 'ring') {
        const k = { sun: 0, planet: 1, ring: 2 }[m[1]], gp = g.parts[k];
        M.front.push({ t: 'p', pts: P.outline(gp, g.at), cls: 'ol' });
        circ(gp.d / 2, { cls: 'cl' });
        const dRef = ref(gp.d, 'd'); dRef.prefix = 'PCD ';
        if (k < 2) {
          const bp = `stages.${i}.${k ? 'planetBore' : 'sunBore'}`, bore = at(bp, k ? x.planetBore : x.sunBore, '보어');
          const rb = Math.min((bore.value || 0) / 2, gp.df / 2 - .3 * gp.m);
          if (rb > .2) circ(rb, { cls: 'ol' });
          rect(rb > .2 ? rb : 0, gp.df / 2, 0, gp.width); rect(gp.df / 2, gp.da / 2, 0, gp.width, { cls: 'tooth' });
          M.fd.push(ref(gp.da, 'da'), dRef, rb > .2 ? bore : Object.assign(bore, { value: 0, prefix: '중실 ' }));
          M.ad.push(at(`stages.${i}.b`, gp.width, '치폭 b'));
          if (rb > .2) M.vd.push(ref(rb * 2, '보어'));
          M.vd.push(ref(gp.da, 'da'));
          M.notes.push(`z ${gp.z} · m ${f(gp.m, 3)} · x ${f(gp.x, 3)} · β ${f(st.beta, 1)}°`);
        } else {
          const od = at('stages.0.ringOD', x.ringOD, '외경');
          circ(od.value / 2, { cls: 'ol' });
          const depth = L.shared ? L.gearEnd : gp.width;
          rect(gp.df / 2, od.value / 2, 0, depth); rect(gp.da / 2, gp.df / 2, 0, depth, { cls: 'tooth' });
          M.fd.push(od, ref(gp.da, 'da (내측)'), dRef);
          M.ad.push(ref(depth, L.shared ? '치폭 (1·2단 공유)' : '치폭 b'));
          M.vd.push(ref(od.value, '외경'), ref(gp.da, 'da'));
          M.notes.push(`내접 z ${gp.z} · m ${f(gp.m, 3)} · x ${f(gp.x, 3)}${L.shared ? ' · 1·2단 공유 (한 몸체)' : ''}`);
        }
      } else if (m[1] === 'pin') {
        const d = at(`stages.${i}.pin.d`, st.pin.d, '핀 지름');
        circ(d.value / 2, { cls: 'ol' }); circ(d.value / 2 - .25, { cls: 'th' });
        rect(0, d.value / 2, 0, sh.pinLength);
        M.fd.push(d); M.ad.push(ref(sh.pinLength, '핀 길이')); M.vd.push(ref(d.value, '지름'));
        M.notes.push(`${st.n}개 · PCD ${f(sh.orbit * 2, 2)} · ${st.pin.type === 'single' ? '편단' : '양단'} 지지 · 홀 ${st.pin.holeMode === 'blind' ? '깊이 지정' : '관통'}`);
      } else if (m[1] === 'needle') {
        const ri = st.pin.d / 2, ro = x.planetBore / 2, nd = (ro - ri) * .92, rc = (ri + ro) / 2, cnt = Math.max(6, Math.floor(2 * Math.PI * rc / (nd * 1.08)));
        circ(ri, { cls: 'th' }); circ(ro, { cls: 'th' });
        for (let q = 0; q < cnt; q++) { const t = 2 * Math.PI * q / cnt; M.front.push({ t: 'c', r: nd / 2, cx: rc * Math.cos(t), cy: rc * Math.sin(t), cls: 'ol' }); }
        rect(rc - nd / 2, rc + nd / 2, 0, x.b * .9);
        M.fd.push(ref(ri * 2, '내경 (핀)'), ref(ro * 2, '외경 (유성 보어)'));
        M.ad.push(ref(x.b * .9, '폭')); M.notes.push(`${st.bearing.name || '니들'} · 롤러 ${cnt}개 · 유성당 ${st.bearing.count || 1}열`);
      } else if (m[1] === 'carrier') {
        const z0 = sh.axial[0];
        const sv = sh.slabs.map(s => ({ ...s, z: [s.z[0] - z0, s.z[1] - z0] }));
        const outer = Math.max(...sv.map(s => s.outer)), inner = Math.min(...sv.map(s => s.inner));
        [...new Set(sv.map(s => +s.outer.toFixed(3)))].forEach(r => circ(r, { cls: 'ol' }));
        circ(inner, { cls: 'ol' }); circ(sh.orbit, { cls: 'cl' });
        const hr = Math.max(0, ...sv.flatMap(s => s.drilling.map(b => Math.max(b.r0, b.r1))));
        sh.pins.forEach(p => M.front.push({ t: 'c', r: hr, cx: p.x, cy: p.y, cls: 'ol' }));
        if (sh.web) {
          sh.web.sections.forEach(sec => M.front.push({ t: 'p', pts: sec.map(p => [p.x, p.y]), cls: 'th' }));
          const rr = sh.web.sections.flatMap(sec => sec.map(p => Math.hypot(p.x, p.y)));
          rect(Math.min(...rr), Math.max(...rr), sh.web.z[0] - z0, sh.web.z[1] - z0);
        }
        sv.forEach(s => {
          rect(s.inner, s.outer, s.z[0], s.z[1]);
          s.drilling.forEach(b => M.sec.push({ pts: [[sh.orbit - b.r0, b.z[0] - z0], [sh.orbit + b.r0, b.z[0] - z0], [sh.orbit + b.r1, b.z[1] - z0], [sh.orbit - b.r1, b.z[1] - z0]], cls: 'void', top: !sh.pins.some(p => Math.abs(p.y) < 1e-6 && p.x < 0) }));
        });
        M.fd.push(at(`stages.${i}.carrier.outerD`, sh.outerD, '최대외경'), at(`stages.${i}.carrier.innerD`, sh.innerD, '내경'));
        if (sh.bossT > 0) M.fd.push(at(`stages.${i}.carrier.bossD`, sh.bossD, '보스 외경'));
        const pcd = ref(sh.orbit * 2, 'PCD'); pcd.prefix = `${sh.pins.length}×Ø${f(hr * 2, 2)} PCD `; M.fd.push(pcd);
        const plates = sv.filter(s => s.drilling.length), boss = sv.find(s => !s.drilling.length);
        { const pz = sh.plates.map(p => [p[0] - z0, p[1] - z0]), a = Math.min(...pz.map(p => p[0])), b = Math.max(...pz.map(p => p[1]));
          M.ad.push(Object.assign(at(`stages.${i}.carrier.width`, b - a, '캐리어 두께'), { z0: a, z1: b })); }
        if (boss) M.ad.push(Object.assign(at(`stages.${i}.carrier.bossT`, boss.z[1] - boss.z[0], '보스 두께'), { z0: boss.z[0], z1: boss.z[1] }));
        if (sh.double && plates.length > 1) M.ad.push(Object.assign(at(`stages.${i}.carrier.groove`, plates[1].z[0] - plates[0].z[1], '홈 폭'), { z0: plates[0].z[1], z1: plates[1].z[0] }));
        M.ad.push(Object.assign(ref(sh.axial[1] - sh.axial[0], '전체 길이'), { z0: 0, z1: sh.axial[1] - sh.axial[0] }));
        M.vd.push(ref(outer * 2, '외경'), ref(inner * 2, '내경'));
        M.notes.push(`${sh.double ? '양단' : '편단'} 지지 · 핀 ${sh.pins.length}개 · 홀 Ø${f(hr * 2, 2)}`);
      }
    } else {
      const zs = [];
      const R2 = (r0, r1, z0, z1, o) => { rect(r0, r1, z0, z1, o); zs.push(z0, z1); };
      if (id === 'xroller') {
        const a = L.dp / 2 - L.Dw * .35, b = L.dp / 2 + L.Dw * .35;
        circ(L.raceIn, { cls: 'ol' }); circ(a, { cls: 'ol' }); circ(b, { cls: 'ol' }); circ(L.raceOut, { cls: 'ol' }); circ(L.dp / 2, { cls: 'cl' });
        R2(L.raceIn, a, L.zBear[0], L.zBear[1]); R2(b, L.raceOut, L.zBear[0], L.zBear[1]);
        const zc = (L.zBear[0] + L.zBear[1]) / 2, h = L.Dw / 2;
        M.sec.push({ pts: [[L.dp / 2 - h, zc], [L.dp / 2, zc - h], [L.dp / 2 + h, zc], [L.dp / 2, zc + h]], cls: 'roll' });
        M.fd.push(ref(L.raceIn * 2, '내륜 내경'), ref(L.raceOut * 2, '외륜 외경'), at('outBearing.dp', L.dp, '피치원 dp'));
        M.ad.push(at('geom.xroller.width', L.Bw, '궤도륜 폭'));
        M.vd.push(at('outBearing.Dw', L.Dw, '롤러 Dw'));
        M.vd[M.vd.length - 1].span = [L.dp / 2 - h, L.dp / 2 + h];
        M.notes.push(`${D.outBearing.name || '크로스 롤러'} · 롤러 ${D.outBearing.Z}개`);
      // 출력 플랜지 · 하우징 · 커버 · 중공축 · 오일 실 · 볼트 · 썬 베어링 도면: 삭제 (BOM-1)
      }
    }
    // normalise section z to start at 0
    const allz = M.sec.flatMap(s => s.pts ? s.pts.map(p => p[1]) : [s.circle[1]]);
    const zmin = Math.min(...allz);
    M.sec.forEach(s => { if (s.pts) s.pts = s.pts.map(([r, z]) => [r, z - zmin]); else s.circle[1] -= zmin; });
    M.ad.forEach(a => { if (a.z0 != null) { a.z0 -= zmin; a.z1 -= zmin; } });
    M.rd.forEach(a => { if (a.z != null) a.z -= zmin; });
    M.zLen = Math.max(...M.sec.flatMap(s => s.pts ? s.pts.map(p => p[1]) : [s.circle[1] + s.circle[2]]));
    return M;
  }

  // ------------------------------------------------------------------ SVG
  const W = 380, H = 320;
  function dimText(d) {
    const v = d.prefix != null ? d.prefix + (d.prefix === 'M' ? '' : 'Ø') + f(d.value) : 'Ø' + f(d.value);
    return v;
  }
  function dimAttrs(d, cls) {
    if (!d.path) return `class="dm ref ${cls || ''}"`;
    return `class="dm ${d.lock ? 'lk' : 'ed'} ${cls || ''}" data-p="${d.path}" data-v="${f(d.value, 4)}" data-l="${esc(d.label)}" tabindex="${d.lock ? -1 : 0}" role="button" aria-label="${esc(d.label)} ${f(d.value)} mm${d.lock ? ' (잠금)' : ' 편집'}"`;
  }
  const lbl = (d, txt) => d.path ? txt : `(${txt})`;

  function frontSVG(M) {
    const rMax = Math.max(1e-3, ...M.front.map(s => s.t === 'c' ? s.r + Math.hypot(s.cx || 0, s.cy || 0) : s.t === 'h' ? s.R + s.r : Math.max(...s.pts.map(p => Math.hypot(p[0], p[1])))));
    const k = Math.min((W - 150) / (2 * rMax), (H - 70) / (2 * rMax)), cx = W / 2 - 10, cy = H / 2 + 8;
    const X = x => cx + x * k, Y = y => cy - y * k;
    let s = `<line class="axis" x1="${X(-rMax * 1.12)}" y1="${cy}" x2="${X(rMax * 1.12)}" y2="${cy}"/><line class="axis" x1="${cx}" y1="${Y(rMax * 1.12)}" x2="${cx}" y2="${Y(-rMax * 1.12)}"/>`;
    for (const e of M.front) {
      if (e.t === 'c') s += `<circle class="${e.cls || 'ol'}" cx="${X(e.cx || 0)}" cy="${Y(e.cy || 0)}" r="${Math.max(.5, e.r * k)}"/>`;
      else if (e.t === 'p') s += `<path class="${e.cls || 'ol'}" d="M${e.pts.map(p => X(p[0]).toFixed(2) + ',' + Y(p[1]).toFixed(2)).join('L')}Z"/>`;
      else if (e.t === 'h') for (let j = 0; j < e.n; j++) { const a = Math.PI / 2 + 2 * Math.PI * j / e.n; s += `<circle class="ol" cx="${X(e.R * Math.cos(a))}" cy="${Y(e.R * Math.sin(a))}" r="${Math.max(.8, e.r * k)}"/>`; }
    }
    const angs = [38, 142, 218, 322, 62, 118];
    M.fd.forEach((d, j) => {
      if (!(d.value > 0)) { s += `<g ${dimAttrs(d)}><text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(d.label)}: ${lbl(d, '중실 (0)')}</text></g>`; return; }
      const a = angs[j % angs.length] * Math.PI / 180, r = d.value / 2 * k, ca = Math.cos(a), sa = Math.sin(a);
      const x1 = cx - r * ca, y1 = cy + r * sa, x2 = cx + r * ca, y2 = cy - r * sa, ext = 30 + 0 * j;
      const xe = x2 + ca * ext, ye = y2 - sa * ext, right = ca >= 0, xt = xe + (right ? 26 : -26);
      s += `<g ${dimAttrs(d)}><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-start="url(#ar)" marker-end="url(#ar)"/><line class="hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><polyline points="${x2},${y2} ${xe},${ye} ${xt},${ye}"/>
        <text x="${right ? xe + 2 : xt}" y="${ye - 3}">${esc(lbl(d, dimText(d)))}</text><title>${esc(d.label)}</title></g>`;
    });
    return s;
  }

  function secSVG(M) {
    const rMax = Math.max(1e-3, ...M.sec.flatMap(s => s.pts ? s.pts.map(p => p[0]) : [s.circle[0] + s.circle[2]]));
    const nA = M.ad.length, nV = M.vd.length, nR = M.rd.length, zL = Math.max(M.zLen, 1e-3);
    const padT = 16 + nA * 18, padR = 18 + nV * 22, padL = 22 + nR * 22, padB = 22;
    const k = Math.min((W - padL - padR) / zL, (H - padT - padB) / (2 * rMax)), cy = padT + (H - padT - padB) / 2, x0 = padL + ((W - padL - padR) - zL * k) / 2;
    const X = z => x0 + z * k, Y = r => cy - r * k;
    let s = '';
    for (const sgn of [1, -1]) for (const e of M.sec) {
      if (e.top && sgn < 0) continue;
      if (e.circle) { const [r, z, rr] = e.circle; s += `<circle class="roll" cx="${X(z)}" cy="${Y(sgn * r)}" r="${rr * k}"/>`; continue; }
      const cls = e.cls === 'void' ? 'void' : e.cls === 'tooth' ? 'tooth' : e.cls === 'roll' ? 'roll' : 'cut';
      s += `<path class="${cls}" d="M${e.pts.map(([r, z]) => X(z).toFixed(2) + ',' + Y(sgn * r).toFixed(2)).join('L')}Z"/>`;
    }
    s += `<line class="axis" x1="${X(0) - 10}" y1="${cy}" x2="${X(zL) + 10}" y2="${cy}"/>`;
    const top = Y(rMax);
    M.ad.forEach((d, j) => {
      const z0 = d.z0 ?? 0, z1 = d.z1 ?? z0 + d.value, y = top - 12 - j * 18;
      s += `<g ${dimAttrs(d)}><line class="ext" x1="${X(z0)}" y1="${top - 2}" x2="${X(z0)}" y2="${y - 3}"/><line class="ext" x1="${X(z1)}" y1="${top - 2}" x2="${X(z1)}" y2="${y - 3}"/>
        <line x1="${X(z0)}" y1="${y}" x2="${X(z1)}" y2="${y}" marker-start="url(#ar)" marker-end="url(#ar)"/><line class="hit" x1="${X(z0)}" y1="${y}" x2="${X(z1)}" y2="${y}"/><text x="${(X(z0) + X(z1)) / 2}" y="${y - 3}" text-anchor="middle">${esc(lbl(d, f(d.value)))}</text><title>${esc(d.label)}</title></g>`;
    });
    M.vd.forEach((d, j) => {
      const [ra, rb] = d.span || [-d.value / 2, d.value / 2], x = X(zL) + 14 + j * 22, ya = Y(rb), yb = Y(ra);
      s += `<g ${dimAttrs(d)}><line class="ext" x1="${X(zL) + 2}" y1="${ya}" x2="${x + 3}" y2="${ya}"/><line class="ext" x1="${X(zL) + 2}" y1="${yb}" x2="${x + 3}" y2="${yb}"/>
        <line x1="${x}" y1="${ya}" x2="${x}" y2="${yb}" marker-start="url(#ar)" marker-end="url(#ar)"/><line class="hit" x1="${x}" y1="${ya}" x2="${x}" y2="${yb}"/><text transform="translate(${x - 3},${(ya + yb) / 2}) rotate(-90)" text-anchor="middle">${esc(lbl(d, (d.span ? '' : 'Ø') + f(d.value)))}</text><title>${esc(d.label)}</title></g>`;
    });
    M.rd.forEach((d, j) => {
      const x = X(0) - 14 - j * 22, ya = Y(d.r1), yb = Y(d.r0);
      s += `<g ${dimAttrs(d)}><line class="ext" x1="${X(d.z ?? 0) - 2}" y1="${ya}" x2="${x - 3}" y2="${ya}"/><line class="ext" x1="${X(d.z ?? 0) - 2}" y1="${yb}" x2="${x - 3}" y2="${yb}"/>
        <line x1="${x}" y1="${ya}" x2="${x}" y2="${yb}" marker-start="url(#ar)" marker-end="url(#ar)"/><line class="hit" x1="${x}" y1="${ya}" x2="${x}" y2="${yb}"/><text transform="translate(${x - 3},${(ya + yb) / 2}) rotate(-90)" text-anchor="middle">${esc(lbl(d, f(d.value)))}</text><title>${esc(d.label)}</title></g>`;
    });
    s += `<text class="cap" x="8" y="${H - 6}">← 입력측</text><text class="cap" x="${W - 8}" y="${H - 6}" text-anchor="end">출력측 →</text>`;
    return s;
  }

  const DEFS = `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1.5L10,5L0,8.5Z" fill="context-stroke"/></marker>
    <pattern id="hat" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="hl"/></pattern></defs>`;

  function render(R, D, id, name) {
    let M; try { M = model(R, D, id); } catch (e) { return `<p class="note">도면 생성 오류: ${esc(e.message)}</p>`; }
    if (!M.sec.length && !M.front.length) return '<p class="note">이 부품은 도면이 없습니다.</p>';
    const view = (title, body) => `<figure class="dw-v"><figcaption>${title}</figcaption><svg viewBox="0 0 ${W} ${H}" class="dw-svg" xmlns="http://www.w3.org/2000/svg">${DEFS}${body}</svg></figure>`;
    const ed = [...M.fd, ...M.ad, ...M.vd, ...M.rd].filter(d => d.path), locked = ed.length && ed.every(d => d.lock);
    return `<div class="dw-row">${view('정면도 (축방향, 입력측에서 봄)', frontSVG(M))}${view('우측 단면도 (반경방향, 축 포함 단면)', secSVG(M))}</div>
      <p class="note dw-n">${M.notes.map(esc).join(' · ')}${M.notes.length ? ' — ' : ''}${locked ? '<b>잠금</b>: 치수가 고정되어 편집할 수 없습니다.' : '<span class="dw-k ed">파란 치수</span>를 누르면 값을 고칠 수 있고 3D에 바로 반영됩니다. 빈칸으로 두면 자동값. <span class="dw-k">(괄호)</span>는 다른 치수에서 정해지는 참고 치수입니다.'}</p>`;
  }

  globalThis.PGDDraw = { model, render };
})();
