/* 베어링 기준 자동 설계 (globalThis.PGDBearingFirst) — 사용자 결정 2026-11-26 (AD-2)
   감속비 지정 → 출력 베어링 형번 선택(사용자) → 베어링 정정격 C0로 목표 출력 토크 산출 → 2단 링기어 피치원 ≈ 베어링 롤러 피치원 추적
   → 2단 기어 제원 → 1단 기어 제원 → 1·2단 토크 밸런스(치폭 배분) → 상위 5안 비교 → 사용자가 고른 안을 사이트에서 편집.
   외경 = 2단 링기어 림 포함 외경, 길이 = b1 + 1·2단 캐리어 간격 + b2 (자동 산출, 한계 아님).
   의뢰서의 요구 토크는 쓰지 않는다 (사용자 결정). 판정 기준은 ISO 6336:2019 (KISSsoft 방식), 기본 안전율 SH ≥ 1.0 · SF ≥ 1.4. */
(function (root) {
  'use strict';
  const clone = o => JSON.parse(JSON.stringify(o));
  const RAD = Math.PI / 180, r05 = v => Math.round(v * 2) / 2;
  const fx = (x, d = 2) => Number.isFinite(+x) ? String(+(+x).toFixed(d)) : '—';
  const RULE = {
    mods: [0.4, 0.5, 0.6, 0.7, 0.8, 1.0], beta: 12, n: 3, ratioTolPct: 1, grade: 6,
    kappa: 0.2,          // 목표 출력 토크 / 베어링 허용 모멘트 (C0·dp / 2000·s0). RH065 0.18 · PI82 0.25 실물에서 보정한 가정
    s0: 1.0,             // 베어링 허용 모멘트를 정할 정적 안전율
    ringTeethBand: 2,    // 2단 링 잇수: 롤러 피치원에 가장 가까운 값 ± 2
    stageRatio: [3, 10], // 단 감속비 범위
    bMin: 3, bPerD1: 1.0, // 치폭 하한 3 mm, 상한 = 작은 기어 피치원 × 1.0 (ISO 권장 b/d1 ≤ 1)
    gap0: 3,             // 1·2단 캐리어 간격 빈칸 기본 (mm)
    clearance: .3,       // 캐리어 축방향 틈새 (한쪽, mm)
    shortlist: 14, top: 5, iters: 3,
    src: {
      kappa: '가정 κ 0.2 — 실물 RH065(28 N·m · RAU5005 C0 5500) 0.18, PI82(16.2 N·m · C0 3220) 0.25',
      ring: '사용자 결정 AD-2: 2단 링기어 피치원 ≈ 출력 베어링 롤러 피치원',
      balance: '사용자 결정 AD-2: 1·2단 토크 밸런스 (출력 환산 단별 한계를 같게)',
      basis: 'ISO 6336:2019 (KISSsoft 방식) · SH ≥ 1.0 · SF ≥ 1.4 (AD-1 · SF-1)',
    },
  };

  const bearingList = () => (root.PGDBearings && root.PGDBearings.crossRoller) || [];
  const bearingKey = b => `${b.maker} ${b.model}`;
  function findBearing(name) {
    const s = String(name || '').trim().toUpperCase().replace(/\s+/g, ' '); if (!s) return null;
    const L = bearingList();
    return L.find(b => bearingKey(b).toUpperCase() === s) || L.find(b => String(b.model).toUpperCase() === s) || null;
  }
  const dpOf = b => b.dp ?? (b.d + b.D) / 2;
  // 목표 출력 토크: 베어링 허용 모멘트 M0 = C0 · dp / (2000 · s0) (모멘트만 받을 때 등가 정하중 P0 = 2000·M/dp) × κ
  function torqueFromBearing(b, opt = {}) {
    const s0 = opt.s0 || RULE.s0, kappa = opt.kappa || RULE.kappa, dp = dpOf(b), M0 = b.C0 * dp / (2000 * s0);
    return { dp, M0, s0, kappa, T: M0 * kappa };
  }

  // ---- 잇수 후보
  const ratioOf = st => 1 + st.R / st.s;
  const mtOf = m => m / Math.cos(RULE.beta * RAD);
  const ringODest = (m, R) => mtOf(m) * R + 2.5 * m + 8 * m;     // 엔진 자동 림: df + 8m (≈ d + 2.5m + 8m)
  function stageList(REC, m, R, shift) { return REC.stageOptions(m, R, [RULE.n], RULE.beta, shift).filter(o => { const i = ratioOf(o); return i >= RULE.stageRatio[0] - 1e-9 && i <= RULE.stageRatio[1] + 1e-9; }); }
  // 전위: 전위 탐색이 꺼져 있으면 전위 0 형상이 성립해야 하고, 켜져 있으면 링 전위 격자에서 성립하는 첫 조합
  function profiles(E, REC, o, shift) {
    const t = REC.inspectTeeth(E, { s: o.s, p: o.p, r: o.R, n: o.n, m: 1, b: 6, alpha: 20, beta: RULE.beta }, shift);
    return t.candidates.map(c => c.profile);
  }

  function search(E, REC, spec, log) {
    const { i, dp, shift, shared, hollow } = spec, lo = i * (1 - RULE.ratioTolPct / 100), hi = i * (1 + RULE.ratioTolPct / 100);
    const minSun = hollow > 0 ? hollow + 8 : 0, cosB = Math.cos(RULE.beta * RAD), out = [], pcache = new Map();
    const prof = o => { const k = [o.s, o.p, o.R].join('/'); if (!pcache.has(k)) pcache.set(k, profiles(E, REC, o, shift)); return pcache.get(k); };
    const sunOK = o => o.s * o.m / cosB + 1e-9 >= minSun;
    const one = i <= RULE.stageRatio[1] + 1e-9;
    let nRing = 0;
    for (const m2 of RULE.mods) {
      const Rt = dp * cosB / m2;
      for (let R2 = Math.round(Rt) - RULE.ringTeethBand; R2 <= Math.round(Rt) + RULE.ringTeethBand; R2++) {
        if (R2 < 36) continue; nRing++;
        const od2 = ringODest(m2, R2), dev = mtOf(m2) * R2 - dp;
        for (const o2 of stageList(REC, m2, R2, shift)) {
          if (!sunOK(o2)) continue;
          const i2 = ratioOf(o2);
          if (one && i2 >= lo && i2 <= hi) { const p2 = prof(o2)[0]; if (p2) out.push({ type: 'one', stages: [{ ...o2, profile: p2 }], dev, od2 }); }
          if (hi < RULE.stageRatio[0] ** 2) continue;   // 2단은 단 감속비 하한² (3 × 3 = 9) 이상에서만
          const l1 = lo / i2, h1 = hi / i2;
          if (h1 < RULE.stageRatio[0] || l1 > RULE.stageRatio[1]) continue;
          const firsts = [];
          if (shared) firsts.push(...stageList(REC, m2, R2, shift).map(o => ({ o, m: m2 })));
          else for (const m1 of RULE.mods) {
            if (m1 > m2) continue;
            const Rmax = Math.floor((od2 - 10.5 * m1) / mtOf(m1));
            for (let R1 = 36; R1 <= Rmax; R1++) {
              const sLo = Math.ceil(R1 / (h1 - 1)), sHi = Math.floor(R1 / (l1 - 1));
              if (sHi < 12 || sLo > R1) continue;
              for (const o of stageList(REC, m1, R1, shift)) if (o.s >= sLo && o.s <= sHi) firsts.push({ o, m: m1 });
            }
          }
          for (const { o: o1 } of firsts) {
            const r = ratioOf(o1) * i2; if (r < lo || r > hi || !sunOK(o1)) continue;
            if (shared) {
              const a = prof(o1), b = prof(o2), xr = a.find(p => b.some(q => Math.abs(q.xr - p.xr) < 1e-9));
              if (!xr) continue;
              out.push({ type: 'shared', stages: [{ ...o1, profile: xr }, { ...o2, profile: b.find(q => Math.abs(q.xr - xr.xr) < 1e-9) }], dev, od2 });
            } else {
              const p1 = prof(o1)[0], p2 = prof(o2)[0]; if (!p1 || !p2) continue;
              out.push({ type: 'sep', stages: [{ ...o1, profile: p1 }, { ...o2, profile: p2 }], dev, od2 });
            }
          }
        }
      }
    }
    log.push({ kind: '탐색', key: '2단 링 잇수 후보', value: `모듈 ${RULE.mods.join('·')} × 링 잇수 ${nRing}개 (롤러 피치원 Ø${fx(dp, 2)} ± ${RULE.ringTeethBand}잇)`, why: '링 피치원 ≈ 롤러 피치원', basis: RULE.src.ring });
    log.push({ kind: '탐색', key: '잇수 조합', value: `${out.length}개 (감속비 ±${RULE.ratioTolPct} %, 단 감속비 ${RULE.stageRatio.join('~')}, 유성 ${RULE.n}개, ${shared ? '링 공유' : '링 분리'}, 전위 탐색 ${shift ? '켬' : '끔'})`, why: '조립 (S+R)/n 정수 · 인접 간섭 · 내접 간섭', basis: '§4' });
    return out;
  }

  // ---- 치폭: 간이식으로 첫 배분 → 엔진으로 단별 한계를 목표에 맞추고, 강한 단을 줄여 1·2단 밸런스
  const d1Of = o => mtOf(o.m) * Math.min(o.s, o.p);
  const bMax = o => Math.max(RULE.bMin, r05(RULE.bPerD1 * d1Of(o)));
  const clampB = (o, b) => Math.min(bMax(o), Math.max(RULE.bMin, r05(b)));
  function firstWidths(REC, cand, T) {
    const st = cand.stages, after = k => st.slice(k + 1).reduce((v, o) => v * ratioOf(o), 1);
    return st.map((o, k) => { const p = REC.proxy({ ...o, num: o.R + o.s, den: o.s }, 6, RULE.beta) * after(k); return clampB(o, 6 * T / Math.max(p, 1e-9)); });
  }
  function proxyCap(REC, cand, bs) {
    const st = cand.stages, after = k => st.slice(k + 1).reduce((v, o) => v * ratioOf(o), 1);
    return Math.min(...st.map((o, k) => REC.proxy({ ...o, num: o.R + o.s, den: o.s }, bs[k], RULE.beta) * after(k)));
  }

  function makeDesign(env, spec, cand, bs) {
    const { E, REC } = env, T = E.templateDesign(), base = clone(T);
    Object.assign(base.req, { case: 'custom', Trated: spec.T, Tpeak: spec.T, Temerg: spec.T, rpm: spec.rpm, lifeH: spec.lifeH, ratio: spec.i, Dmax: null, Lmax: null,
      ext: clone(spec.ext), duty: [{ torque: 100, time: 100, rpm: 0, mode: 'rated' }], dutyUnits: { torque: 'pct', time: 'pct' }, SH: 1, SF: 1.4 });
    base.loads.basis = spec.basis || 'iso';
    const rspec = { OD: cand.od2 + 4, H: 400, ratio: spec.i, beta: RULE.beta, hollow: spec.hollow || 0 };
    const D = REC.build(base, rspec, { ...cand, axial: 1 }, bs, E);
    D.outBearing = REC.catalogBearing(T.outBearing, spec.bearing);
    D.stages.forEach(s => { s.ringOD = null; s.grade = RULE.grade; });
    if (D.stages.length > 1) { D.stages[0].carrier.width = Math.max(1.5, +(spec.gap - 2 * RULE.clearance).toFixed(2)); D.stages[0].carrier.axialClearance = RULE.clearance; }
    D.config.floatingSun = false;
    if (D.stages.length > 1) D.struct.c1Support = 'nested';
    D.struct.obPos = 'outside'; D.struct.obFit = { inner: null };
    D.name = `베어링 기준 · ${bearingKey(spec.bearing)} · i ${spec.i} · ${cand.stages.map(o => `m${o.m} ${o.s}/${o.p}/${o.R}`).join(' + ')}`;
    D.meta = Object.assign({}, D.meta, { auto: true, method: 'bearing-first', request: { ratio: spec.i, bearing: bearingKey(spec.bearing), gap: spec.gap, shift: spec.shift, shared: spec.shared, hollow: spec.hollow, rpm: spec.rpm, lifeH: spec.lifeH, Trated: +spec.T.toFixed(3), kappa: spec.kappa, s0: spec.s0 } });
    return D;
  }
  function analyze(env, D) {
    const { E, C } = env;
    if (D.config.sharedRing && D.stages[1]) { E.syncSharedRing(D); const b = D.stages[1], st = E.sharedStage(D.stages[0], b); for (const k of ['p', 'm', 'beta', 'alpha']) b[k] = st[k]; if (st.sharedRing.auto && Number.isFinite(st.sharedRing.xpFit)) b.xp = +st.sharedRing.xpFit.toFixed(4); }
    C.ensure(D); C.applyNeedles(D);
    let R; try { R = E.analyze(D); } catch (e) { return { ok: false, why: '계산 오류: ' + e.message }; }
    if (R.errors && R.errors.length) return { ok: false, why: R.errors[0], R };
    const n = R.ctx.stages.length;
    // 단별 한계 (출력 환산): 그 단 기어(치면·치근, 정격 수명)와 유성 베어링 중 작은 값 — recommend.js evaluateOne과 같은 식
    const op = { rpm: D.req.rpm, cycles: E.cyclesFor(D.req.lifeH) };
    const stageCap = R.ctx.stages.map((s, k) => Math.min(E.capacity(R.ctx, op, D.req, k + 1), R.bearingCap?.[k] ?? Infinity));
    const rings = R.ctx.stages.map(s => s.geo.rims?.[2]?.diameter || 0);
    return { ok: true, R, stageCap, rings, n };
  }
  function tune(env, spec, cand, log) {
    let bs = firstWidths(env.REC, cand, spec.T), D, a;
    for (let it = 0; it < RULE.iters; it++) {
      D = makeDesign(env, spec, cand, bs); a = analyze(env, D); if (!a.ok) return { ok: false, why: a.why };
      const nb = cand.stages.map((o, k) => clampB(o, bs[k] * spec.T / Math.max(a.stageCap[k], 1e-6)));
      if (nb.every((b, k) => b === bs[k])) break; bs = nb;
    }
    D = makeDesign(env, spec, cand, bs); a = analyze(env, D); if (!a.ok) return { ok: false, why: a.why };
    // 밸런스: 강한 단의 치폭을 약한 단 한계에 맞춰 줄인다 (같은 한계 토크에서 길이 최소). 한계가 치폭에 비례하지 않으므로 줄이는 비율을 단계적으로 완화
    if (cand.stages.length > 1) for (let it = 0; it < 4; it++) {
      const common = Math.min(...a.stageCap), k = a.stageCap.indexOf(Math.max(...a.stageCap));
      if (a.stageCap[k] <= common * 1.05) break;
      let done = false;
      for (const e of [1, .6, .35]) {
        const nb = bs.slice(); nb[k] = clampB(cand.stages[k], bs[k] * (common / a.stageCap[k]) ** e);
        if (nb[k] === bs[k]) continue;
        const D2 = makeDesign(env, spec, cand, nb), a2 = analyze(env, D2);
        if (a2.ok && Math.min(...a2.stageCap) >= common * .98) { D = D2; a = a2; bs = nb; done = true; break; }
      }
      if (!done) break;
    }
    // 1단 링 외경은 2단 링 외경 안에서 자유 (분리 링)
    if (cand.type === 'sep' && a.rings[0] > a.rings[1] + 1e-6) return { ok: false, why: `1단 링 외경 Ø${fx(a.rings[0], 1)} > 2단 Ø${fx(a.rings[1], 1)}` };
    const R = a.R, cap = R.reducerCap, sc = a.stageCap, L = bs.reduce((s, b) => s + b, 0) + (bs.length > 1 ? spec.gap : 0);
    let mass = Infinity; try { mass = env.PG.partsList(R, D).reduce((s, p) => s + (p.mass || 0) * (p.qty || 1), 0); } catch (e) { }
    return { ok: true, D, R, bs, cap, stageCap: sc, balance: sc.length > 1 ? Math.min(...sc) / Math.max(...sc) : 1, OD: a.rings[a.rings.length - 1], ring1: a.rings[0], L, mass, gov: R.reducerGov,
      ratio: R.ratio, dev: cand.dev, type: cand.type, stages: cand.stages, fails: R.verdict.filter(v => !v.ok).map(v => v.k) };
  }

  async function run(q, env, onStep) {
    const log = [], t0 = Date.now(), step = async (m, p) => { if (onStep) { onStep(m, p); await new Promise(r => setTimeout(r, 0)); } };
    if (!q || !q.ok) return { status: 'input', errors: (q && q.errors) || [], log };
    const B = q.bearing, bt = torqueFromBearing(B, { s0: q.s0, kappa: q.kappa });
    const spec = { basis: env.basis || 'iso', i: q.ratio, bearing: B, dp: bt.dp, T: bt.T, s0: bt.s0, kappa: bt.kappa, gap: q.gap, shift: q.shift, shared: q.shared, hollow: q.hollow || 0, rpm: q.rpm, lifeH: q.lifeH, ext: q.ext };
    log.push({ kind: '요구', key: '감속비', value: String(q.ratio), why: '의뢰 조건', basis: 'AD-2' });
    log.push({ kind: '베어링', key: '출력 베어링', value: `${bearingKey(B)} · d ${B.d} × D ${B.D} × B ${B.B} · dp ${fx(bt.dp, 2)} · C ${B.C} · C0 ${B.C0} N`, why: '사용자 선택', basis: B.source || '카탈로그' });
    log.push({ kind: '베어링', key: '목표 출력 토크', value: `M0 = C0·dp/(2000·s0) = ${fx(bt.M0, 1)} N·m → T = κ ${bt.kappa} × M0 = ${fx(bt.T, 2)} N·m`, why: '베어링 정정격에 맞는 출력 토크 (의뢰서 요구 토크는 쓰지 않음)', basis: RULE.src.kappa });
    await step('잇수 조합 탐색', 5);
    const cands = search(env.E, env.REC, spec, log);
    if (!cands.length) return { status: 'none', error: `롤러 피치원 Ø${fx(bt.dp, 1)} 근처 링으로 감속비 ${q.ratio}를 만드는 조합이 없습니다${spec.shared ? ' (링 공유 — 공유 해제 또는 전위 탐색을 켜 보세요)' : spec.shift ? '' : ' (전위 탐색을 켜 보세요)'}.`, log, ms: Date.now() - t0, spec };
    // 간이 순위: 치폭 상한 안에서 낼 수 있는 출력 토크 → 롤러 피치원 근접 → 길이
    cands.forEach(c => { c.b0 = firstWidths(env.REC, c, spec.T); c.pcap = Math.min(spec.T, proxyCap(env.REC, c, c.b0)); c.L0 = c.b0.reduce((s, b) => s + b, 0); });
    cands.sort((a, b) => b.pcap - a.pcap || Math.abs(a.dev) - Math.abs(b.dev) || a.L0 - b.L0);
    const pick = [], seen = new Set();
    for (const c of cands) { const k = c.type + c.stages.map(o => `${o.m}/${o.R}`).join('-'); if (seen.has(k)) continue; seen.add(k); pick.push(c); if (pick.length >= RULE.shortlist) break; }
    for (const c of cands) { if (pick.length >= RULE.shortlist) break; if (!pick.includes(c)) pick.push(c); }
    log.push({ kind: '탐색', key: '정밀 계산 대상', value: `${cands.length}개 중 ${pick.length}개 (모듈·링 잇수 중복 없이)`, why: '간이 강도식 순위 (치폭 상한 안 출력 토크)', basis: 'recommend.js proxy' });
    const res = [];
    for (let k = 0; k < pick.length; k++) {
      await step(`후보 ${k + 1} / ${pick.length} 치폭·토크 밸런스`, 10 + 85 * k / pick.length);
      const r = tune(env, spec, pick[k], log); r.cand = pick[k]; res.push(r);
    }
    const ok = res.filter(r => r.ok);
    ok.sort((a, b) => Math.round(b.cap * 10) - Math.round(a.cap * 10) || b.balance - a.balance || a.L - b.L);
    const top = ok.slice(0, RULE.top).map((r, k) => ({ ...r, rank: k + 1, tag: `${k + 1}안 · ${r.type === 'one' ? '1단' : r.type === 'shared' ? '2단 링 공유' : '2단 링 분리'} · ${r.stages.map(o => `m${o.m} ${o.s}/${o.p}/${o.R}`).join(' + ')}` }));
    log.push({ kind: '선택', key: '비교안', value: `${top.length}안 (정밀 계산 ${res.length} · 성립 ${ok.length})`, why: '감속기 한계 토크 → 밸런스 → 길이 순', basis: RULE.src.balance });
    await step('완료', 100);
    if (!top.length) return { status: 'none', error: '정밀 계산에서 성립한 안이 없습니다: ' + [...new Set(res.map(r => r.why))].slice(0, 3).join(' · '), log, ms: Date.now() - t0, spec };
    return { status: 'ok', spec, bt, top, log, ms: Date.now() - t0, searched: cands.length, checked: res.length };
  }

  const api = { RULE, run, search, tune, makeDesign, analyze, findBearing, bearingList, bearingKey, torqueFromBearing, dpOf };
  root.PGDBearingFirst = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
