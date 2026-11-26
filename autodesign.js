/* 자동 설계 (globalThis.PGDAutoDesign) — docs/DESIGN-ALGORITHM.md §5 · §6 구현
   설계의뢰서(request.js 결과) → 요구 정격 (기본 안전율 SH 1.0 · SF 1.4) → 잇수·모듈·치폭 후보(recommend.js) → 시스템 판정(engine · checks · process)
   → 수정 규칙(한 번에 한 조치, 개선될 때만 채택) → 선택(전 항목 충족 중 질량 최소, 없으면 미달 최소 + 부족분).
   사용자에게 묻지 않고, 사용자가 입력한 값은 바꾸지 않는다. 모든 결정은 항목 · 값 · 이유 · 근거로 log에 남긴다. */
(function (root) {
  'use strict';
  const clone = o => JSON.parse(JSON.stringify(o));
  const fx = (x, d = 2) => Number.isFinite(+x) ? String(+(+x).toFixed(d)) : '—';
  const RULE = {
    mods: [0.4, 0.5, 0.6, 0.7, 0.8, 1.0], beta: 12, planets: [3], ratioTolPct: 1, grade: 6, basis: 'iso',
    pool: 6, prescreen: 24, iters: 12, info: ['5-10', '10-6'],   // 윤활 유막·발열: 윤활 사양과 운전률이 정해지지 않아 판정 정보로만 (§6)
    advisory: ['3-8', '5-4'],   // 권장 기준 (εβ ≥ 1, KHβ ≤ 2): 강도식에 이미 반영된 계수라 미달로 세지 않고 '권장 미충족'으로 보고
    mirror: ['3-6', '5-7', '5-8', '5-11', '10-1', '10-2'],   // 엔진 판정(verdict)과 같은 내용 — 중복 집계 방지
    src: {
      mods: '§4 모듈 ≥ 0.4 (호브 가공, 사용자 Q15)', beta: '§4 β 12° (설계 규칙 R3)', planets: '§4 유성 3개 (설계 규칙 R1)',
      shift: '§4 전위 0 우선 (설계 규칙 R5)', grade: '§4 정밀도 6급 (호브 + 이온질화, Q15)', basis: '§3 ISO 6336 계산 조건 (Q11)',
      margin: '§3 기본 안전율 SH ≥ 1.0 · SF ≥ 1.4 (SF-1)', float: '사용자 기준: 썬은 캐리어 또는 링과 동심 (플로팅 불가)', fit: '사용자 기준 F-1: 하우징 H7 · 캐리어 출력축 h7',
    },
  };
  // 강도·수명 판정 (§3). 효율·백래시 판정은 요구 조건이 없으므로 참고만.
  const isStrength = k => !/효율|백래시/.test(k);   // 판정 이름은 미달 시 바뀔 수 있어(예: '비상 접촉 미달') 제외 목록으로 거른다
  const isFail = v => v && v.ok === false;

  function evaluate(E, C, P, D) {
    if (D.config.sharedRing && D.config.stages > 1 && D.stages[1]) {
      E.syncSharedRing(D); const b = D.stages[1], st = E.sharedStage(D.stages[0], b);
      for (const k of ['p', 'm', 'beta', 'alpha']) b[k] = st[k];
      if (st.sharedRing.auto && Number.isFinite(st.sharedRing.xpFit)) b.xp = +st.sharedRing.xpFit.toFixed(4);
    }
    C.ensure(D); C.applyNeedles(D);
    let R; try { R = E.analyze(D); } catch (e) { R = { errors: ['계산 오류: ' + e.message], warns: [] }; }
    if (R.errors && R.errors.length) return { ok: false, R, CK: {}, fails: [{ id: 'error', k: R.errors.join(' · ') }], n: 99 };
    const CK = C.compute(R, D, {}), fails = [], advice = [];
    R.verdict.forEach(v => { if (!v.ok && isStrength(v.k)) fails.push({ id: 'v', k: v.k, v }); });
    for (const [id, v] of Object.entries(CK)) if (!id.startsWith('gate') && !RULE.info.includes(id) && !RULE.mirror.includes(id) && isFail(v)) fails.push({ id, k: id, v });
    if (P) try { P.evaluate(R, D, { CK }).forEach(g => g.items.forEach(i => { if (i.ok === false && !RULE.info.includes(i.id) && !RULE.mirror.includes(i.id) && !fails.some(x => x.id === i.id)) (RULE.advisory.includes(i.id) ? advice : fails).push({ id: i.id, k: `${i.id} ${i.t || ''}`.trim(), val: i.val, proc: true }); })); } catch (e) { }
    return { ok: true, R, CK, fails, advice, n: fails.length };
  }
  // 연속 부족량 — 같은 미달 수에서 개선 여부 판단
  function deficit(ev, D) {
    if (!ev.ok) return 1e9;
    let d = 0;
    for (const x of ev.fails) {
      const v = x.v;
      if (x.id === 'v' && Number.isFinite(v.value) && v.target > 0) d += Math.max(0, 1 - v.value / v.target);
      else if (x.id === '2-8' && v.fit) d += v.fit.status === 'fail' ? 1 : 0;
      else if (x.id === '1-6' && v.Dout != null) d += Math.max(0, (v.Dout - D.req.Dmax) / D.req.Dmax) + Math.max(0, (v.Lt - D.req.Lmax) / D.req.Lmax);
      else if (x.id === '3-8' && ev.R && ev.R.ctx) d += ev.R.ctx.stages.reduce((a, st) => { const eb = st.geo.meshes[0].eb; return a + (eb > 0 && eb < 1 ? 1 - eb : 0); }, 0);
      else d += 1;
    }
    return d;
  }
  // 권장 기준 부족량 (εβ < 1인 단의 1 − εβ, KHβ > 2 초과분)
  function advDef(ev) {
    if (!ev.ok || !ev.R.ctx) return 0;
    let d = 0;
    if ((ev.advice || []).some(x => x.id === '3-8')) d += ev.R.ctx.stages.reduce((a, st) => { const eb = st.geo.meshes[0].eb; return a + (eb > 0 && eb < 1 ? 1 - eb : 0); }, 0);
    if ((ev.advice || []).some(x => x.id === '5-4')) d += Math.max(0, Math.max(...ev.R.rated.rows.map(r => r.f.KHb)) - 2);
    return d;
  }
  // BOM-1: 외경·길이 = 링 외경 · 출력 베어링 기준 (하우징·커버·플랜지 삭제)
  function envelope(layout, ev, D) {
    try { const L = layout(ev.R, D), OD = 2 * Math.max(L.housR, L.flangeR), Ln = L.zFlange[1] - L.zIn; return { OD, L: Ln, ok: OD <= D.req.Dmax + .05 && Ln <= D.req.Lmax + .05 }; }
    catch (e) { return { OD: Infinity, L: Infinity, ok: false }; }
  }
  const massOf = (PG, ev, D) => { try { return PG.partsList(ev.R, D).reduce((s, p) => s + (p.mass || 0) * (p.qty || 1), 0); } catch (e) { return Infinity; } };

  // ---- §6 수정 규칙: 미달 → 조치 후보 (앞에서부터 시도). 윤활 사양은 바꾸지 않는다 (λ는 판정 정보).
  const JOINT_ORDER = {
    c1s2: [['spline', '스플라인'], ['pin', '다웰 핀 + 파일럿'], ['key', '키'], ['press', '압입'], ['integral', '일체 (C1·S2 한 부품)']],
    s1motor: [['key', '키'], ['clamp', '클램프'], ['spline', '스플라인'], ['flange', '볼트 플랜지'], ['integral', '모터축 일체']],
  };
  function actions(D, ev) {
    const out = [], CK = ev.CK, R = ev.R, A = (key, why, basis, fn) => out.push({ key, why, basis, fn });
    const set = (path, v) => { const ks = path.split('.'); let o = D; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] ?? (o[ks[i]] = {}); const was = o[ks.at(-1)]; o[ks.at(-1)] = v; return was; };
    const gearF = ev.fails.filter(x => x.id === 'v' && !/베어링|핀/.test(x.k));
    const brgF = ev.fails.filter(x => x.id === 'v' && /유성 베어링/.test(x.k));
    const pinF = ev.fails.filter(x => x.id === 'v' && /핀/.test(x.k));
    const n = D.stages.length, locked = p => ((D.meta && D.meta.locked) || []).includes(p);
    const gov = () => { const rated = gearF.some(x => /정격|스펙트럼|수명/.test(x.k)); const g = rated ? ((R.govRated && R.govRated.row) || (R.govStatic && R.govStatic.row)) : ((R.govStatic && R.govStatic.row) || (R.govRated && R.govRated.row)); return g && g.stage ? g.stage - 1 : n - 1; };
    // 기어 강도: ① 지배 단 치폭 +1 ② 다른 단에서 1 mm 이동 (축방향 예산 안)
    if (gearF.length) {
      const gi = gov(), why = gearF.map(x => x.k).join(', ') + ' 미달';
      A(`${gi + 1}단 치폭 +1 mm`, why, 'ISO 6336-2/-3 (σH ∝ 1/√b, σF ∝ 1/b) · §6 ①', () => { const w = D.stages[gi].b; D.stages[gi].b = +(w + 1).toFixed(1); return `${w} → ${D.stages[gi].b} mm`; });
      D.stages.forEach((s, j) => { if (j !== gi && s.b - 1 >= 3) A(`치폭 이동 ${j + 1}단 → ${gi + 1}단`, why, '§6 ② 여유가 큰 단의 치폭을 지배 단으로', () => { s.b = +(s.b - 1).toFixed(1); D.stages[gi].b = +(D.stages[gi].b + 1).toFixed(1); return `${j + 1}단 ${s.b + 1}→${s.b} · ${gi + 1}단 → ${D.stages[gi].b} mm`; }); });
    }
    // 기어 강도 ⑤ (마지막 수단): 정밀도 5급 — 사용자 제작 조건 '호브 + 열처리 후 5~6급' 범위 (Q15). 가공처 달성 확인 필요
    if (gearF.length && D.stages.some(s => s.grade > 5)) A('정밀도 5급 (마지막 수단)', gearF.map(x => x.k).join(', ') + ' 미달 · 치폭·축방향 배분으로 해결 안 됨',
      '§6 ⑤ · ISO 1328 · 제작 조건 Q15 (호브 + 이온질화 5~6급) — 가공처 측정 성적서로 5급 달성 확인 필요', () => { const w = D.stages.map(s => s.grade).join('/'); D.stages.forEach(s => { s.grade = 5; }); return `${w} → 5급`; });
    // 유성 베어링 · 핀: 핀 지름 +1 mm (니들은 applyNeedles가 보어에 맞춰 재선정)
    if (brgF.length || pinF.length) D.stages.forEach((s, j) => {
      if (!s.pin || !(s.pin.d > 0)) return;
      A(`${j + 1}단 유성핀 Ø +1 mm`, [...brgF, ...pinF].map(x => x.k).join(', ') + ' 미달', 'ISO 281 · ISO 76 · 핀 굽힘·면압 · §6', () => { const w = s.pin.d; s.pin.d = w + 1; return `Ø${w} → Ø${s.pin.d}`; });
      A(`${j + 1}단 치폭 +1 mm (베어링 길이)`, [...brgF, ...pinF].map(x => x.k).join(', ') + ' 미달', 'ISO 281 (니들 유효 길이) · §6 ③', () => { const w = s.b; s.b = +(w + 1).toFixed(1); return `${w} → ${s.b} mm`; });
    });
    // 축방향 물림률 εβ (3-8): 치폭 ±1 mm
    if (!ev.n && (ev.advice || []).some(x => x.id === '3-8')) D.stages.forEach((s, j) => {
      const need = Math.ceil(Math.PI * s.m / Math.sin((s.beta || RULE.beta) * Math.PI / 180) * 2) / 2;   // εβ = 1이 되는 치폭
      if (need > s.b) { const o = D.stages.find((t, k) => k !== j && t.b - (need - s.b) >= 3);
        if (o) A(`${j + 1}단 치폭 ${need} mm (εβ ≥ 1, 다른 단에서 이동)`, '3-8 축방향 물림률 εβ < 1', 'ISO 6336-1 εβ = b·sinβ/(π·mn) · §6 축방향 배분', () => { const w = s.b, dd = need - w; s.b = need; o.b = +(o.b - dd).toFixed(1); return `${w} → ${need} mm · 다른 단 −${fx(dd, 1)} mm`; });
        A(`${j + 1}단 치폭 ${need} mm (εβ ≥ 1)`, '3-8 축방향 물림률 εβ < 1', 'ISO 6336-1 εβ = b·sinβ/(π·mn)', () => { const w = s.b; s.b = need; return `${w} → ${need} mm`; }); }
      A(`${j + 1}단 치폭 +1 mm (εβ)`, '3-8 축방향 물림률 εβ 기준 미달', 'ISO 6336-1 εβ = b·sinβ/(π·mn) · §6', () => { const w = s.b; s.b = +(w + 1).toFixed(1); return `${w} → ${s.b} mm`; });
      if (s.b - 1 >= 3) A(`${j + 1}단 치폭 −1 mm (εβ)`, '3-8 축방향 물림률 εβ 기준 미달', 'ISO 6336-1 εβ · §6', () => { const w = s.b; s.b = +(w - 1).toFixed(1); return `${w} → ${s.b} mm`; });
    });
    // KHβ (5-4) 과대: 치폭 −1 mm
    if (!ev.n && (ev.advice || []).some(x => x.id === '5-4')) D.stages.forEach((s, j) => { if (s.b - 1 >= 3) A(`${j + 1}단 치폭 −1 mm (KHβ)`, '5-4 KHβ > 2', 'ISO 6336-1 KHβ (폭/지름 비) · §6', () => { const w = s.b; s.b = +(w - 1).toFixed(1); return `${w} → ${s.b} mm`; }); });
    // 출력 베어링 내륜–보스 결합 (2-8)
    const c28 = CK['2-8'];
    if (c28 && c28.fit) for (const g of [c28.fit.inner]) for (const ch of g.checks) {
      // 잠금은 사용자가 고정한 값(D.meta.locked)만 — 추천 엔진이 채운 값은 자동값으로 본다
      if (!['input', 'fail'].includes(ch.status) || !ch.fix || ch.key === 'fit' || locked(ch.fix.path)) continue;
      A(`출력 베어링 결합 · ${ch.label}`, ch.note, '베어링 치수에 맞춤 (자동값만) · ISO 286 · F-1', () => `${ch.fix.path} ${set(ch.fix.path, ch.fix.value) ?? '자동'} → ${ch.fix.value}`);
      // 안착 길이를 늘린 만큼 강도 여유가 가장 큰 단의 치폭을 줄여 길이 한계 안에서 해결 (§6 축방향 배분)
      if (ch.key === 'seatL' && ch.fix.delta > 0 && R && R.rated) {
        const mg = D.stages.map((_, i) => { const rr = R.rated.rows.filter(r => r.stage === i + 1); return rr.length ? Math.min(...rr.map(r => Math.min(r.SH / D.req.SH, r.SF / D.req.SF))) : 0; });
        const si = mg.indexOf(Math.max(...mg)), d = Math.ceil(ch.fix.delta * 2) / 2;
        if (mg[si] > 1.05 && D.stages[si].b - d >= 3 && !locked(`stages.${si}.b`)) A(`보스 연장 + ${si + 1}단 치폭 −${d} mm`, `${ch.note} · 길이 한계 안에서`, `강도 여유가 가장 큰 단 (최소 안전율 비 ${fx(mg[si], 2)}) · ISO 6336 · §6`, () => { set(ch.fix.path, ch.fix.value); const w = D.stages[si].b; D.stages[si].b = +(w - d).toFixed(1); return `${ch.fix.path} → ${ch.fix.value} · ${si + 1}단 b ${w} → ${D.stages[si].b} mm`; });
      }
    }
    // 결합 형식 (2-5 · 2-6): 결합 카탈로그 다음 경우
    for (const [id, key, name] of [['2-5', 'c1s2', 'C1–S2 결합'], ['2-6', 's1motor', 'S1–모터축 결합']]) {
      if (!isFail(CK[id]) || out.some(o => o.key.startsWith(name))) continue;
      const order = JOINT_ORDER[key], cur = order.findIndex(([v]) => v === D.struct[key]);
      order.slice(cur + 1).forEach(([v, label]) => A(`${name} → ${label}`, `${id} 전달 부족`, '결합 카탈로그 · 전달 ≥ 1.5 × 피크', () => { const w = D.struct[key]; D.struct[key] = v; return `${w} → ${v}`; }));
    }
    return out;
  }

  // ---- 설계 기준 (S0 · 구조 결정)
  function baseDesign(E, C, q) {
    const T = q.engineReq, D = E.templateDesign(), m = RULE.margin = (q.target && q.target.margin) || 1;
    D.name = `자동 설계 · ${T.Trated} N·m · i ${T.ratio} · Ø${T.Dmax}×${T.Lmax}`;
    Object.assign(D.req, {
      case: 'custom', Trated: +(T.Trated * m).toFixed(6), Tpeak: +(T.Tpeak * m).toFixed(6), Temerg: +(T.Temerg * m).toFixed(6),
      rpm: T.rpm, lifeH: T.lifeH, ratio: T.ratio, Dmax: T.Dmax, Lmax: T.Lmax, ext: clone(T.ext),
      duty: [{ torque: 100, time: 100, rpm: 0, mode: 'rated' }], dutyUnits: { torque: 'pct', time: 'pct' },
    });
    D.loads.basis = RULE.basis;
    D.meta = Object.assign({}, D.meta, q.meta || {}, { auto: true, request: clone(T), hollow: q.hollow });
    C.ensure(D);
    return D;
  }
  function specOf(q) {
    const T = q.engineReq, i = T.ratio, h = q.hollow > 0 ? q.hollow : 0;
    return {
      OD: T.Dmax, H: T.Lmax, ratio: i, ratioTolPct: RULE.ratioTolPct, minSunPCD: h ? h + 8 : 0, mods: RULE.mods, beta: RULE.beta, b: null,
      ns: RULE.planets, ns2: RULE.planets, modes: { one: i <= 10, shared: i >= 9, sep: i >= 9 }, allowShift: false, hollow: h,
    };
  }
  function structure(D, log, tag) {
    const two = D.stages.length > 1, add = (key, value, why, basis) => log.push({ kind: '구조', key, value, why, basis, cand: tag });
    D.config.floatingSun = false; add('썬 지지', '베어링으로 동심 지지 (플로팅 없음)', '유성 하중분배를 계산 가능한 상태로 둔다', RULE.src.float);
    if (two) { D.struct.c1Support = 'nested'; add('2단 썬 지지', 'S2 양측 지지 (지지 베어링 부품은 범위 밖)', 'C1 지지가 없으면 2단 썬이 사실상 플로팅', RULE.src.float); }
    D.struct.obPos = 'outside'; add('출력 베어링 위치', '2단 출력측 바깥', '외부 모멘트가 치합 정렬(KHβ)에 주는 영향 감소', 'ISO 6336-1 KHβ');
    D.struct.obFit = { inner: null }; add('출력 베어링 끼워맞춤', '보스 h7', '내륜 회전 (외륜 고정부는 범위 밖)', RULE.src.fit);
    D.stages.forEach(s => { s.grade = RULE.grade; }); add('정밀도', `${RULE.grade}급`, '호브 + 이온질화 후 5~6급 중 보수 쪽', RULE.src.grade);
    add('판정 기준', `${RULE.basis === 'ideal' ? '이론 (오차 0, 옵션)' : 'ISO 6336:2019 (KISSsoft 방식)'} · SH ≥ 1.0 · SF ≥ 1.4`, '사용자 결정 AD-1 · SF-1', `${RULE.src.basis} · ${RULE.src.margin}`);
  }

  // ---- 실행
  async function run(q, env, onStep) {
    if (!q || !q.ok) return { status: 'input', error: '의뢰서 오류', errors: (q && q.errors) || [] };
    RULE.basis = env.basis || 'iso';   // 기본 §3 ISO. 'ideal'은 판정 기준 비교 시험용
    const { E, C, P, REC, PG } = env, layout = PG.layout, log = [], hist = [], t0 = Date.now();
    const step = async (msg, pct) => { if (onStep) { onStep(msg, pct); await new Promise(r => setTimeout(r, 0)); } };
    const T = q.engineReq;
    log.push({ kind: '요구', key: '요구 정격', value: `정격 ${T.Trated} · 반복 피크 ${T.Tpeak} · 순간 최대 ${T.Temerg} N·m · ${T.rpm} rpm · ${T.lifeH} h`, why: '설계의뢰서', basis: '§2-1' });
    log.push({ kind: '요구', key: '판정 목표', value: `정격 ${q.target.TR} · 피크 ${q.target.TA} · 순간 ${q.target.TM} N·m`, why: '요구 토크에서 기본 안전율 (SH ≥ 1.0 · SF ≥ 1.4, 정적 1.0 / 1.2)', basis: RULE.src.margin });
    for (const a of q.assumptions || []) log.push({ kind: '가정', key: a.id, value: a.msg, why: '의뢰서 빈칸', basis: '§1' });
    await step('잇수·모듈 조합 탐색', 5);
    const base = baseDesign(E, C, q), spec = specOf(q);
    const RS = await REC.run(base, spec, E, layout, (i, n) => onStep && onStep(`조합 정밀 계산 ${i} / ${n}`, 5 + 40 * i / n));
    const okc = RS.res.filter(r => r.ok);
    log.push({ kind: '탐색', key: '잇수·모듈 조합', value: `조합 ${RS.total} → 정밀 계산 ${RS.checked} → 외형·간섭 통과 ${okc.length}`, why: '감속비 ±1 %, 외경·길이, 조립 (S+R)/n 정수, 인접 간섭', basis: `${RULE.src.mods} · ${RULE.src.beta} · ${RULE.src.planets} · ${RULE.src.shift}` });
    if (!okc.length) {
      const h = spec.hollow, why = h ? ` 중공 Ø${h}가 두 단 썬을 지나가려면 썬 기준원 ≥ Ø${spec.minSunPCD} mm가 필요하고, 감속비 ${T.ratio}에서는 링이 외경 Ø${T.Dmax} 안에 들어가지 않을 수 있습니다. 중공 지름을 줄이거나 외경·감속비를 검토하세요.` : '';
      return { status: 'none', error: '감속비·외형 조건에 맞는 잇수 조합이 없습니다.' + why, log, hist, ms: Date.now() - t0, searched: RS.total };
    }
    // S9 준비: 외형 통과 후보를 시스템 판정으로 먼저 걸러(미달 수 → 부족량), 구성·모듈이 겹치지 않게 상위 후보를 고른다
    await step('후보 시스템 판정', 45);
    const pre = okc.slice(0, RULE.prescreen).map(c => {
      const D = clone(c.D); Object.assign(D.req, clone(base.req)); D.loads.basis = RULE.basis; structure(D, [], '');
      const ev = evaluate(E, C, P, D); return { c, n: ev.ok ? ev.n : 99, d: deficit(ev, D) };
    }).sort((a, b) => a.n - b.n || a.d - b.d);
    const pool = [], seen = new Set();
    for (const { c } of pre) { const k = c.stages.length + (c.D.config.sharedRing ? 's' : '') + c.stages.map(s => s.m).join('/'); if (!seen.has(k)) { seen.add(k); pool.push(c); } if (pool.length >= RULE.pool) break; }
    for (const { c } of pre) { if (pool.length >= RULE.pool) break; if (!pool.includes(c)) pool.push(c); }
    log.push({ kind: '탐색', key: '후보 선별', value: `판정 ${pre.length}개 → 수정 대상 ${pool.length}개 (구성·모듈 중복 없이)`, why: '미달 수와 부족량이 작은 순', basis: '§5 S9' });
    let best = null;
    for (let ci = 0; ci < pool.length; ci++) {
      const c = pool[ci], tag = `후보 ${ci + 1} (${c.stages.map(s => `m${s.m} ${s.s}/${s.p}/${s.R}`).join(' + ')}${c.D.config.sharedRing ? ' · 공용 링' : c.stages.length > 1 ? ' · 분리 링' : ''})`;
      await step(`${tag} 판정·수정`, 45 + 50 * ci / pool.length);
      let D = clone(c.D); D.name = base.name; D.meta = Object.assign({}, D.meta, base.meta, { candidate: tag });
      Object.assign(D.req, clone(base.req)); D.loads.basis = RULE.basis;
      const clog = []; structure(D, clog, tag);
      let ev = evaluate(E, C, P, D), envl = envelope(layout, ev, D);
      for (let it = 1; it <= RULE.iters; it++) {
        hist.push({ cand: ci + 1, iter: it, fails: ev.n, deficit: +deficit(ev, D).toFixed(4), ids: ev.fails.map(x => x.k) });
        if (ev.ok && !ev.n && envl.ok && !(ev.advice || []).length) break;
        const acts = actions(D, ev); let taken = null;
        for (let k = 0; k < acts.length; k++) {
          const Dt = clone(D), value = actions(Dt, ev)[k].fn(), et = evaluate(E, C, P, Dt), en = envelope(layout, et, Dt);
          if (et.ok && (en.ok || (!envl.ok && en.OD <= envl.OD + 1e-6 && en.L <= envl.L + 1e-6)) && (et.n < ev.n || (et.n === ev.n && deficit(et, Dt) < deficit(ev, D) - .005) || (!et.n && !ev.n && en.ok && advDef(et) < advDef(ev) - .005))) { taken = { a: acts[k], value, Dt, et, en }; break; }
        }
        if (!taken) { clog.push({ kind: '종료', key: '수정 반복', value: `${it}회차`, why: acts.length ? `조치 ${acts.length}개 모두 미달을 줄이지 못함` : '해당 수정 규칙 없음', basis: '§6 한 번에 한 조치', cand: tag }); break; }
        D = taken.Dt; ev = taken.et; envl = taken.en;
        clog.push({ kind: '수정', key: taken.a.key, value: taken.value, why: taken.a.why, basis: taken.a.basis, cand: tag, iter: it });
      }
      const feasible = ev.ok && !ev.n && envl.ok;
      const sc = { feasible, envOk: envl.ok, fails: ev.ok ? ev.n : 99, deficit: deficit(ev, D), mass: ev.ok ? massOf(PG, ev, D) : Infinity, OD: envl.OD, L: envl.L, cap: ev.R.reducerCap };
      const e = { D, ev, sc, log: clog, tag };
      if (!best || better(sc, best.sc)) best = e;
    }
    await step('수명 여유 확인', 97);
    const life = lifeCheck(E, C, best.D);
    if (!life.ok && best.sc.feasible) best.sc.feasible = false;
    log.push({ kind: '확인', key: '수명 여유', value: life.text, why: '요구 정격 토크에서 예측 수명 ≥ 정격 수명', basis: '§3 · ISO 6336 · ISO 281' });
    log.push({ kind: '선택', key: '최종안', value: best.tag, why: best.sc.feasible ? `전 항목 충족 후보 중 질량 최소 (${fx(best.sc.mass * 1000, 0)} g)` : `충족 후보 없음 → 미달 ${best.sc.fails}건으로 가장 가까운 안`, basis: '§5 S10' });
    log.push(...best.log);
    const out = { status: best.sc.feasible ? 'pass' : 'short', D: best.D, R: best.ev.R, CK: best.ev.CK, ev: best.ev, score: best.sc, life, log, hist, ms: Date.now() - t0, pool: pool.length, searched: RS.total };
    out.short = shortfall(out, q); out.advice = (best.ev.advice || []).map(x => ({ id: x.id, k: x.k, val: x.val }));
    if (best.D.stages.some(s => s.grade <= 5)) out.advice.push({ id: 'grade', k: '정밀도 5급 적용 — 가공처 측정 성적서로 5급 달성 확인 필요' });
    // 참고: 같은 설계의 산정 기준 폭 (오차 0 가정 ↔ ISO). 판정은 ISO, 폭은 소형 저하중 재검토용 정보 (§3)
    try { const b = E.basisBand(clone(best.D)); out.band = { ideal: b.ideal, iso: b.iso, lowLoad: b.lowLoad, wm: b.wm, need: q.target.TR }; } catch (e) { out.band = null; }
    out.gears = gearTable(best.ev.R, best.D); out.bom = bom(PG, best.ev, best.D);
    return out;
  }
  const better = (a, b) => a.feasible !== b.feasible ? a.feasible
    : a.feasible ? (Math.abs(a.mass - b.mass) / b.mass > .02 ? a.mass < b.mass : a.cap > b.cap)
    : a.envOk !== b.envOk ? a.envOk : a.fails !== b.fails ? a.fails < b.fails : a.deficit < b.deficit;   // 외경·길이는 절대 조건

  // 수명: 요구 정격 토크에서 정격 수명을 만족하는지 (베어링 L10 포함)
  function lifeCheck(E, C, D) {
    const Dt = clone(D), T = D.meta.request, m = RULE.margin;
    Object.assign(Dt.req, { Trated: T.Trated, Tpeak: T.Tpeak, Temerg: T.Temerg, lifeH: T.lifeH * m });
    try { C.ensure(Dt); C.applyNeedles(Dt); const R = E.analyze(Dt); const v = R.verdict.filter(x => /수명|L10/.test(x.k)), bad = v.filter(x => !x.ok);
      return { ok: !bad.length, text: bad.length ? `미달: ${bad.map(x => x.k).join(', ')}` : `충족 (${v.map(x => `${x.k} ${fx(x.value, 2)}`).join(' · ')})`, items: v };
    } catch (e) { return { ok: false, text: '계산 오류: ' + e.message, items: [] }; }
  }
  function shortfall(out, q) {
    if (out.status === 'pass') return [];
    return out.ev.fails.map(x => ({ id: x.id, k: x.k, need: x.v && x.v.target, have: x.v && x.v.value, note: x.v && (x.v.note || (typeof x.v.val === 'string' ? x.v.val : '')) }));
  }
  // ---- 산출물 (§7)
  function gearTable(R, D) {
    if (!R || !R.ctx) return [];
    const rows = R.rated ? R.rated.rows : [], out = [];
    R.ctx.stages.forEach((s, i) => {
      const g = s.geo, st = D.stages[i];
      g.parts.forEach((p, j) => {
        const rr = rows.filter(r => r.stage === i + 1 && r.partName === p.name);
        out.push({ stage: i + 1, part: p.name, z: p.z, mn: p.m, alpha: st.alpha ?? 20, beta: st.beta, x: +fx(p.x, 4), d: +fx(p.d, 3), da: +fx(p.da, 3), df: +fx(p.df, 3), b: p.width, grade: st.grade,
          qty: j === 1 ? st.n : 1, material: 'SCM440 이온질화', SH: rr.length ? +fx(Math.min(...rr.map(r => r.SH)), 3) : null, SF: rr.length ? +fx(Math.min(...rr.map(r => r.SF)), 3) : null });
      });
    });
    return out;
  }
  function bom(PG, ev, D) {
    try { return PG.partsList(ev.R, D).map(p => ({ no: p.no, id: p.id, name: p.name, qty: p.qty, material: p.material, heat: p.heat, massG: +fx((p.mass || 0) * 1000, 1), verdict: p.verdict ? p.verdict.text : '', ok: p.verdict ? p.verdict.ok : null })); }
    catch (e) { return []; }
  }

  const api = { run, evaluate, baseDesign, specOf, gearTable, bom, RULE };
  root.PGDAutoDesign = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
