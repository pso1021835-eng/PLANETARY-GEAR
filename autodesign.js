// 자동 설계 (docs/DESIGN-ALGORITHM.md §3 · §5 · §8) — 1차분
// 엑셀 의뢰서(request.js parse 결과) → 후보 탐색(recommend.js) → ISO 계산 조건으로 30 % 여유 판정 → 선택 · 부족분 보고
// 구현 범위 (1차): S0 요구 정격 · S1~S5 단수·링 방식·감속비·잇수·모듈·치폭(외형 예산) · S9 판정 · S10 선택
// 다음 차수: §6 수정 규칙 반복, S6 핀·유성 베어링 재선정, S7 중공, S8 결합 구조 — 현재는 recommend.js 초안값 그대로
// 규칙에 없는 판단은 하지 않는다. AI 호출 없음.
(function (root) {
  'use strict';
  const clone = o => JSON.parse(JSON.stringify(o));
  const VERSION = 'autodesign-1';

  // §4 고정 조건 (설계 규칙 R1~R4 · Q15): SCM440 이온질화 (ISO 6336-5 NV, MQ) · 6급 · β 12° · 유성 3개
  const MODS = [0.4, 0.5, 0.6, 0.7, 0.8, 1.0];
  const BETA = 12, PLANETS = [3], GRADE = 6;
  const MAT = { family: 'NV', surfaceHRC: 60, coreHRC: 30, depth: 0.1 };   // 표준 DB와 같은 값
  // §3 판정 항목 (엔진 verdict id 앞부분). 효율·백래시·스커핑은 §3에 없으므로 판정에 넣지 않고 참고로만 남긴다.
  const ITEMS = [
    { key: '정격 토크 · 목표 수명 (기어)', grp: 'TR' },
    { key: '부하 스펙트럼 수명 (기어)', grp: 'life' },
    { key: '유성 베어링 L10', grp: 'life' },
    { key: '피크 토크 정적 안전율', grp: 'TA' },
    { key: '비상 토크 정적 안전율', grp: 'TM' },
    { key: '유성 베어링 정적 s0', grp: 'TA' },
    { key: '유성 핀·캐리어 정적', grp: 'TM' },
    { key: '출력 베어링 L10', grp: 'out' },
    { key: '출력 베어링 정적 s0', grp: 'out' },
  ];

  function specOf(q) {
    const i = q.engineReq.ratio;
    return {
      OD: q.engineReq.Dmax, H: q.engineReq.Lmax, ratio: i, mods: MODS, beta: BETA, b: null, ns: PLANETS, ns2: PLANETS,
      modes: { one: i <= 10, shared: true, sep: true },                         // S1: 1단은 i ≤ 10 일 때만
    };
  }

  // 판정용 설계: 후보 D에 의뢰 조건과 §3·§4 계산 조건을 덮어쓴다 (후보 기어 제원은 그대로)
  function judged(D0, q, mode) {
    const D = clone(D0), R = q.engineReq, d = q.derived, M = q.target.margin;
    const strength = mode === 'strength';
    Object.assign(D.req, {
      Trated: strength ? d.TR * M : d.TR, Tpeak: strength ? d.TA * M : d.TA, Temerg: strength ? d.TM * M : d.TM,
      rpm: R.rpm, lifeH: strength ? d.lifeH : d.lifeH * M, ratio: R.ratio, Dmax: R.Dmax, Lmax: R.Lmax,
      ext: { ...R.ext }, duty: [{ torque: 100, time: 100, rpm: 0, mode: 'rated' }], dutyUnits: { torque: 'pct', time: 'pct' },
    });
    D.loads = { ...D.loads, basis: 'iso', KA: 1, kgMode: 'model' };
    D.design = { ...D.design, quality: 'MQ' };
    D.materials = D.materials.map(() => ({ ...MAT }));
    D.stages.forEach(s => { s.grade = GRADE; });
    if (root.PGDChecks) { root.PGDChecks.ensure(D); root.PGDChecks.applyNeedles(D); }
    return D;
  }

  // S9: §3 판정. 상태 4구분(D2-2): ok / fail / input(외력 입력 필요) / na
  function judge(D0, q, E) {
    const out = [];
    for (const mode of ['strength', 'life']) {
      const D = judged(D0, q, mode), r = E.analyze(D);
      if (r.errors?.length) return { error: r.errors[0] };
      for (const it of ITEMS) {
        if (mode === 'strength' && it.grp === 'life') continue;
        if (mode === 'life' && it.grp !== 'life') continue;
        const v = r.verdict.find(x => x.id.startsWith(it.key));
        if (!v) { out.push({ id: it.key, grp: it.grp, state: 'na' }); continue; }
        const state = it.grp === 'out' && !q.extGiven ? 'input' : (v.value === null || v.value === undefined) ? (it.grp === 'out' ? 'input' : 'na') : v.ok ? 'ok' : 'fail';
        out.push({ id: v.id, grp: it.grp, state, value: v.value, target: v.target, unit: v.unit, note: v.note, ratio: Number.isFinite(v.value) && v.target ? v.value / v.target : null });
      }
    }
    // 예측 정격 (요구 수명 L_R 기준 감속기 허용 토크 · 지배 부품) — 여유율 = 예측 / 요구
    const Dn = judged(D0, q, 'strength'); Dn.req.Trated = q.derived.TR;
    const rn = E.analyze(Dn);
    return { items: out, cap: rn.reducerCap, gov: rn.reducerGov, warns: rn.warns, eff: rn.eff, lowLoad: rn.warns.some(w => w.includes('저하중')), r: rn };
  }

  // 기어 추정 질량 (kg): 썬·유성 = 원판(이끝원·이뿌리원 평균), 링 = 이뿌리원 바깥 림 3.5 m. S10 비교용 근사
  function gearMass(r) {
    const rho = 7.85e-6; let kg = 0;
    for (const s of r.ctx.stages) {
      const [sun, pl, ring] = s.geo.parts, b = s.st.b, n = s.st.n, dm = g => (g.da + g.df) / 2;
      kg += Math.PI / 4 * dm(sun) ** 2 * b * rho + n * Math.PI / 4 * dm(pl) ** 2 * b * rho;
      kg += Math.PI / 4 * ((ring.df + 7 * s.st.m) ** 2 - dm(ring) ** 2) * b * rho;
    }
    return kg;
  }

  // 의뢰서 한 건 → 결과. q = PGDRequest.parse(...) 결과
  function design(q, E, Rc, layout, base, opt = {}) {
    const t0 = Date.now();
    if (!q.ok) return { ok: false, version: VERSION, errors: q.errors };
    const spec = specOf(q), log = [];
    log.push({ step: 'S0', item: '요구 정격', value: q.derived, why: '§2-1', basis: 'request.js' });
    log.push({ step: 'S1', item: '구성 후보', value: Object.keys(spec.modes).filter(k => spec.modes[k]), why: spec.ratio <= 10 ? 'i ≤ 10: 1단 포함' : 'i > 10: 2단만', basis: '§4 · Q13' });
    const sl = Rc.shortlist(base, spec, E, layout);
    log.push({ step: 'S2~S5', item: '잇수 조합 · 정밀 평가 후보', value: { 조합: sl.total, 정밀: sl.list.length, 구성별: sl.counts }, why: '조립·간섭·감속비 정확 · 외형 예산 안 치폭 자동', basis: 'recommend.js' });
    const rows = [];
    for (const c of sl.list) {
      const e = Rc.evaluateOne(base, spec, c, E, layout);
      if (!e.ok) { rows.push({ type: e.type, stages: e.stages, ok: false, why: e.why }); continue; }
      const j = judge(e.D, q, E);
      if (j.error) { rows.push({ type: e.type, stages: e.stages, ok: false, why: j.error }); continue; }
      const fails = j.items.filter(x => x.state === 'fail');
      const minRatio = Math.min(...j.items.filter(x => x.state === 'ok' || x.state === 'fail').map(x => x.ratio ?? Infinity));
      rows.push({ type: e.type, stages: e.stages, b: e.b, OD: e.OD, H: e.H, D: e.D, ok: true, pass: !fails.length, fails, items: j.items,
        cap: j.cap, gov: j.gov, margin: j.cap / q.derived.TR, minRatio, mass: gearMass(j.r), lowLoad: j.lowLoad });
    }
    const feasible = rows.filter(r => r.ok), pass = feasible.filter(r => r.pass);
    // S10: 충족 후보 중 기어 질량 최소 → 동률(0.001 kg)이면 최소 여유 큰 순 · 충족 없으면 미달 수 최소 → 정격 여유 큰 순
    const byS10 = (a, b) => (Math.round(a.mass * 1e3) - Math.round(b.mass * 1e3)) || (b.minRatio - a.minRatio);
    const byNear = (a, b) => (a.fails.length - b.fails.length) || (b.margin - a.margin);
    const best = pass.length ? pass.slice().sort(byS10)[0] : feasible.slice().sort(byNear)[0] || null;
    log.push({ step: 'S9', item: '판정', value: { 외형적합: feasible.length, 전항목충족: pass.length }, why: 'ISO 계산 조건 · 정격·피크·순간 ×1.3 · 수명 ×1.3', basis: '§3' });
    if (best) log.push({ step: 'S10', item: '선택', value: best.stages.map(s => `m${s.m} ${s.s}/${s.p}/${s.R}×${s.n}`).join(' + '), why: pass.length ? '충족 후보 중 기어 질량 최소' : '충족 후보 없음 → 미달 수 최소', basis: '§5 S10' });
    // D1 병기: 선택안의 오차 0(이론) 기준 정격 — ISO 저하중 영역에서 두 값의 차이를 보이기 위해 (판정은 ISO)
    if (best) { const Di = judged(best.D, q, 'strength'); Di.req.Trated = q.derived.TR; Di.loads.basis = 'ideal'; const ri = E.analyze(Di); best.capIdeal = ri.errors?.length ? null : ri.reducerCap; }
    const shortfall = best && !best.pass ? best.fails.map(f => ({ id: f.id, value: f.value, target: f.target, unit: f.unit, short: f.target ? 1 - f.value / f.target : null })) : [];
    return {
      ok: true, version: VERSION, pass: !!best?.pass, best, rows, counts: { 조합: sl.total, 정밀: sl.list.length, 외형적합: feasible.length, 충족: pass.length },
      shortfall, derived: q.derived, target: q.target, assumptions: q.assumptions, log, ms: Date.now() - t0,
      pending: ['§6 수정 규칙 반복', 'S6 핀·유성 베어링 재선정', 'S7 중공', 'S8 결합 구조 · 출력 베어링 판정 연동', '결합부(2-4·2-5·2-6·2-8) 판정 연동'],
    };
  }

  const api = { VERSION, MODS, ITEMS, specOf, judged, judge, gearMass, design };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PGDAutoDesign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
