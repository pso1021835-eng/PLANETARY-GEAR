// 추천 제원 생성: 최대 외경 × 높이, 목표 감속비, 치직각 모듈 · 비틀림각 · 치폭 · 링 잇수를 받아
// 1단 / 2단(링 공유) 잇수·유성 개수 조합을 만들고, 현재 설계의 요구 조건(수명·안전율·재료·윤활·판정 기준)으로
// 계산한 감속기 허용 토크 순으로 정렬한다. 기어 외 치수(핀·베어링·캐리어·하우징)는 예제 설계를 외경 비로 맞춘 초안이다.
(function (root) {
  'use strict';
  const clone = o => JSON.parse(JSON.stringify(o));
  const r05 = v => Math.round(v * 2) / 2, f05 = v => Math.floor(v * 2) / 2;
  const OD0 = 68;            // 예제 설계(RDP-RH065)의 외경 (layout 기준)

  // ---- 잇수 조합 (링 잇수 R 고정)
  function stageCombos(R, ns) {
    const out = [];
    for (const n of ns) for (let S = 12; S <= R - 24; S++) {
      if ((R - S) % 2) continue;
      const P = (R - S) / 2;
      if (P < 12 || (S + R) % n) continue;
      if ((S + P) * Math.sin(Math.PI / n) <= P + 2.5) continue;   // 인접 유성 이끝 간격 0.5m 이상
      out.push({ s: S, p: P, n, i: 1 + R / S });
    }
    return out;
  }
  function combos(spec) {
    const { R, ratio } = spec, tol = spec.tol ?? 0.03, ns = spec.ns || [3, 4, 5, 6];
    const one = stageCombos(R, ns), list = [];
    for (const a of one) { const e = a.i / ratio - 1; if (Math.abs(e) <= tol) list.push({ stages: [a], ratio: a.i, err: e }); }
    for (const a of one) for (const b of one) {
      const i = a.i * b.i, e = i / ratio - 1;
      if (Math.abs(e) <= tol) list.push({ stages: [a, b], ratio: i, err: e });
    }
    // 같은 감속비면 잇수가 큰 쪽(굽힘 유리)·유성 수가 많은 쪽을 먼저 보도록 정렬해 두고, 오차 순으로 상한을 둔다
    list.sort((x, y) => Math.abs(x.err) - Math.abs(y.err) || y.stages.reduce((s, t) => s + t.n, 0) - x.stages.reduce((s, t) => s + t.n, 0));
    const lim = spec.limit ?? 80, one_ = list.filter(c => c.stages.length === 1).slice(0, lim / 2), two = list.filter(c => c.stages.length === 2).slice(0, lim - one_.length);
    return [...one_, ...two];
  }

  // ---- 후보 → 전체 설계
  function build(base, spec, cand, E) {
    const T = E.defaultDesign(), D = clone(T);
    // 사용자의 요구·재료·윤활·하중 기준은 현재 설계에서 가져온다
    for (const k of ['req', 'materials', 'lube', 'loads', 'design', 'reliability', 'perf', 'mc', 'anim']) if (base[k]) D[k] = clone(base[k]);
    const k = spec.OD / OD0, kz = k, ns = cand.stages.length;   // 축방향 부품(커버·판·보스)도 외경 비로: 높이는 판정에만 쓴다
    const m = spec.m, beta = spec.beta, b = spec.b, R = spec.R;
    D.name = `추천 · ${ns}단 · m${m} β${beta}° · R${R} · i ${cand.ratio.toFixed(3)}`;
    D.config = { stages: ns, sharedRing: ns > 1, floatingSun: false };
    const wall = Math.max(2, r05(2 * k));
    D.housing = { ...T.housing, wall, coverT: Math.max(3, r05(T.housing.coverT * kz)), flangeT: Math.max(2, r05(T.housing.flangeT * kz)) };
    const Dw = Math.max(1.5, r05(2.5 * k));
    D.outBearing = { ...T.outBearing, name: `크로스 롤러 Dw ${Dw} (외경 비 추정 · 카탈로그 확인)`, Dw, Lw: Dw, dp: spec.OD - 2 * (wall + 1.5) - 2.2 * Dw, C: Math.round(T.outBearing.C * k * k), C0: Math.round(T.outBearing.C0 * k * k) };
    D.geom = {};
    const sc = o => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, typeof v === 'number' && !['n', 'p'].includes(key) ? r05(v * k) || v : v]));
    D.struct = { ...T.struct, c1s2Dim: sc(T.struct.c1s2Dim), s1Dim: sc(T.struct.s1Dim) };
    const sup = T.loads.sunSupport.map(s => ({ ...s, od: r05(s.od * k), id: r05(s.id * k), overhang: r05(s.overhang * kz) }));
    D.loads = { ...D.loads, sunSupport: ns > 1 ? sup : [sup[1]], extraFsh: [0, 0] };
    const mt = m / Math.cos(beta * Math.PI / 180), ringOD = spec.OD - 2 * wall;
    D.needle = [];
    D.stages = cand.stages.map((c, i) => {
      const out = i === ns - 1, tpl = T.stages[out ? 1 : 0];
      // 유성 보어: 이뿌리원의 약 55 % (예제 비율), 니들 Dw ≈ 보어의 0.21, 핀 = 보어 − 2Dw
      const dfP = mt * c.p - 2.5 * m, bore = Math.max(3, f05(0.55 * dfP)), nDw = Math.max(1, r05(0.21 * bore)), pin = Math.max(2, bore - 2 * nDw);
      const Z = Math.max(6, Math.floor(Math.PI * (pin + nDw) / (nDw * 1.05)));
      D.needle.push({ use: true, apply: true, Dw: nDw, Lw: null, Z, HRCpin: 60, HRCbore: 58 });
      const bscale = (Z * nDw * b) / (11 * 1.5 * tpl.b);
      const plate = Math.max(1.5, r05((out ? 2.9 : 4) * kz));
      return Object.assign(clone(tpl), {
        s: c.s, p: c.p, n: c.n, m, beta, b, xs: 0, xp: 0, xr: 0, autoRingShift: true, sunBore: null, planetBore: bore, ringOD,
        tipChamfer: [0, 0, 0],
        bearing: { name: `풀니들 Ø${nDw} × ${Z} (추정)`, C: Math.round(1600 * bscale), C0: Math.round(1500 * bscale), count: 1 },
        pin: out ? { d: pin, type: 'double', material: 'SUJ2', wall: plate, allow: 1200, holeMode: 'blind', depth: null }
          : { d: pin, type: 'single', material: 'SUJ2', wall: plate, allow: 1200, holeMode: 'through', depth: null },
        carrier: out ? { width: null, groove: null, pocket: null, pocketShape: 'slot', outerD: null, innerD: null, bossD: null, bossT: Math.max(2, r05(9.6 * kz)), material: 'S45C' }
          : { width: plate, outerD: null, innerD: null, bossT: 0, bossD: null, axialClearance: 0.3, material: 'S45C' }
      });
    });
    return D;
  }

  function envelope(D, E, layout) {
    const ctx = E.prepare(D);
    if (ctx.errors?.length) return { errors: ctx.errors };
    try { const L = layout({ ctx }, D); return { OD: 2 * Math.max(L.housR, L.flangeR), H: L.zFlange[1] - L.zIn }; }
    catch (e) { return { errors: ['배치 계산 실패: ' + e.message] }; }
  }

  // 후보 하나 평가: 외형 확인 → 강도 계산
  function evaluateOne(base, spec, cand, E, layout) {
    const D = build(base, spec, cand, E), env = envelope(D, E, layout);
    const row = { cand, D, ratio: cand.ratio, err: cand.err, stages: cand.stages };
    if (env.errors) return { ...row, ok: false, why: env.errors[0] };
    Object.assign(row, { OD: env.OD, H: env.H });
    if (env.OD > spec.OD + 0.05) return { ...row, ok: false, why: `외경 Ø${env.OD.toFixed(1)} > Ø${spec.OD}` };
    if (env.H > spec.H + 0.05) return { ...row, ok: false, why: `높이 ${env.H.toFixed(1)} > ${spec.H} mm` };
    const r = E.analyze(D);
    if (r.errors?.length) return { ...row, ok: false, why: r.errors[0] };
    // 단별 허용 토크: 그 단의 기어(치면·치근)와 유성 베어링 중 작은 값. 출력축 기준으로 구한 뒤 그 단 캐리어 토크로 환산
    const op = { rpm: D.req.rpm, cycles: E.cyclesFor(D.req.lifeH) };
    const after = i => r.ctx.stages.slice(i + 1).reduce((v, s) => v * s.geo.ratio, 1);
    const stageCap = r.ctx.stages.map((s, i) => { const out = Math.min(E.capacity(r.ctx, op, D.req, i + 1), r.bearingCap?.[i] ?? Infinity); return { out, own: out / after(i) }; });
    return { ...row, ok: true, cap: r.reducerCap, gov: r.reducerGov, stageCap, fails: r.verdict.filter(v => !v.ok).length, warns: r.warns.length };
  }

  // 허용 토크 내림차순 (0.1 N·m 동률이면 감속비 오차 → 유성 총수 적은 순)
  const order = (a, b) => (b.ok - a.ok) || (Math.round((b.cap || 0) * 10) - Math.round((a.cap || 0) * 10)) || (Math.abs(a.err) - Math.abs(b.err)) || (a.stages.reduce((v, t) => v + t.n, 0) - b.stages.reduce((v, t) => v + t.n, 0));
  // 비동기 실행 (화면 멈춤 방지): onProgress(done, total)
  async function run(base, spec, E, layout, onProgress) {
    const list = combos(spec), res = [];
    for (let i = 0; i < list.length; i++) {
      res.push(evaluateOne(base, spec, list[i], E, layout));
      if (onProgress && (i % 3 === 2 || i === list.length - 1)) { onProgress(i + 1, list.length); await new Promise(r => setTimeout(r, 0)); }
    }
    res.sort(order);
    return res;
  }
  function runSync(base, spec, E, layout) {
    const res = combos(spec).map(c => evaluateOne(base, spec, c, E, layout));
    res.sort(order);
    return res;
  }

  const api = { combos, build, envelope, evaluateOne, run, runSync };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PGDRecommend = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
