/* 유성감속기 설계실 — 설계 공정 추가 검토 (globalThis.PGDChecks)
   설계 공정 체크리스트에서 비어 있던 항목을 계산한다. 계산 엔진(engine.js)의 결과는 바꾸지 않고,
   엔진 결과(R)와 3D 배치(PGD3D.layout)를 읽어 별도 검토값을 낸다.
   예외: 7-2 니들 제원은 사용자가 '베어링 계산에 적용'을 켰을 때만 엔진 입력(유성 베어링 C·C0)을 바꾼다.
   모든 상수·가정은 함수 옆 주석과 화면의 '가정' 표시로 드러낸다. */
(function () {
  'use strict';
  const f = (x, d = 2) => Number.isFinite(x) ? (+x.toFixed(d)).toLocaleString('ko-KR') : '—';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PI = Math.PI;

  // ---------------------------------------------------------------- defaults (added to D once)
  const DEF = {
    req: { Dmax: null, Lmax: null, ratio: null, stiffMin: null },
    struct: {
      ringHousing: 'press',                      // integral | press | bolt
      ringFit: { delta: 0.03, mu: 0.12, E: 70000, nu: 0.33, Sy: 240, boltN: 6, boltD: 3 }, // 알루미늄 하우징 기본
      c1s2: 'spline', c1s2Dim: { d: null, L: null, p: 40, n: 6, dp: 3, pcd: null },   // integral | spline | key | press | pin
      s1motor: 'key', s1Dim: { d: null, L: 8, p: 40, n: 4, bd: 1.6, pcd: null },        // integral | key | press | clamp | spline | flange
      c1Support: 'none',                         // none | out | both | nested (S2 held by bearings in the S1 and C2 bores)
      obPos: 'flange',                           // inside | outside | flange
      c2out: 'flange', c2outDim: { n: 6, bd: 3, dp: 3, pcd: null, d: null, L: null, p: 40 }, // C2 ↔ 출력 플랜지(크로스 롤러 내륜): integral | flange | pin | press
    },
    bolts: { grade: 12.9, mu: 0.12, util: 0.7 },
    thermal: { Tamb: 25, h: 12, duty: 1 },
    verify: { feaKcar: [null, null], feaSigmaF: null, testT: null, testNote: '' },
    review: { by: '', date: '', status: 'draft', note: '' },
    dfm: {
      qty: 100, rate: 60000, steel: 3000, alu: 7000, ht: 8000,
      proc: { sun: 'hob', planet: 'hob', ring: 'shape', carrier: 'mill', housing: 'turn', pin: 'buy' },
    },
  };
  const needleDef = () => ({ use: false, apply: false, Dw: 1.5, Lw: null, Z: null, HRCpin: 60, HRCbore: 58 });
  function fill(dst, src) { for (const k in src) { if (dst[k] === undefined || dst[k] === null && src[k] !== null && typeof src[k] === 'object' && !Array.isArray(src[k])) dst[k] = JSON.parse(JSON.stringify(src[k])); else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') fill(dst[k], src[k]); } return dst; }
  function ensure(D) {
    fill(D, DEF);
    D.needle = D.needle || [];
    D.stages.forEach((_, i) => { D.needle[i] = Object.assign(needleDef(), D.needle[i] || {}); });
    if (!Array.isArray(D.verify.feaKcar)) D.verify.feaKcar = [null, null];
  }

  // ---------------------------------------------------------------- small tables
  const STD_M = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1, 1.25, 1.5, 2];             // ISO 54 1계열
  const AS = { 2: 2.07, 2.5: 3.39, 3: 5.03, 4: 8.78, 5: 14.2, 6: 20.1, 8: 36.6, 10: 58 };  // 볼트 유효 단면적 mm²
  const RP = { 8.8: 640, 10.9: 940, 12.9: 1100 };                            // 항복 MPa
  // ISO 281 롤러 베어링 fc (γ = Dw cosα / Dpw)
  const FC = [[.01, 52.1], [.02, 60.8], [.03, 66.5], [.04, 70.7], [.05, 74.1], [.06, 76.9], [.07, 79.2], [.08, 81.2], [.09, 82.8], [.10, 84.2], [.12, 86.4], [.14, 87.7], [.16, 88.5], [.18, 88.8], [.20, 88.7], [.22, 88.2], [.24, 87.5], [.26, 86.4], [.28, 85.2], [.30, 83.8]];
  const lerp = (T, x) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [x0, y0] = T[i - 1], [x1, y1] = T[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return T.at(-1)[1]; };

  // ---------------------------------------------------------------- helpers on R
  const stg = R => R?.ctx?.stages || [];
  const rows = R => R?.rated?.rows || [];
  const ratioOf = s => s.geo.ratio;
  // peak torques along the train (N·m): sun i, carrier i
  function peakTorques(R, D) {
    const S = stg(R), T = D.req.Tpeak; const car = [], sun = []; let t = T;
    for (let i = S.length - 1; i >= 0; i--) { car[i] = t; sun[i] = t / ratioOf(S[i]); t = sun[i]; }
    return { car, sun, ring: S.map((_, i) => car[i] - sun[i]) };
  }
  function layout(R, D) { try { return globalThis.PGD3D ? PGD3D.layout(R, D) : null; } catch (e) { return null; } }

  // Lamé shrink fit: inner ring (a..b) in outer housing (b..c), diametral interference delta
  function pressFit(a, b, c, delta, Eo, nuo, Ei, nui) {
    const d = 2 * b;
    const p = delta / (d * ((1 / Eo) * ((c * c + b * b) / (c * c - b * b) + nuo) + (1 / Ei) * ((b * b + a * a) / (b * b - a * a) - nui)));
    const shrinkInner = 2 * (2 * p * b * b * a) / (Ei * (b * b - a * a));      // 링 내경 감소 (지름, mm)
    const hoopOuter = p * (c * c + b * b) / (c * c - b * b);                   // 하우징 내면 원주응력
    return { p, shrinkInner, hoopOuter };
  }
  // shaft–hub joint torque capacity (N·m)
  const pos = v => Number.isFinite(v) && v > 0;
  // pin (dowel) coupling: n pins Ø dp on PCD, single shear, allowable τ 150 MPa (hardened SUJ2, 가정);
  // bolted flange: n bolts M bd on PCD, friction only — preload 60 % of yield (12.9), μ 0.15 (가정)
  function jointCap(type, d, L, p, mu = 0.12, x = {}) {
    if (type === 'pin') return pos(x.n) && pos(x.dp) && pos(x.pcd) ? x.n * PI * x.dp * x.dp / 4 * 150 * x.pcd / 2 / 1000 : null;
    if (type === 'flange') { if (!(pos(x.n) && pos(x.bd) && pos(x.pcd))) return null; const As = PI / 4 * (x.bd * .85) ** 2; return x.n * .6 * 1080 * As * .15 * x.pcd / 2 / 1000; }
    if (!(d > 0 && L > 0)) return null;
    if (type === 'integral') return Infinity;
    if (type === 'press' || type === 'clamp') return mu * p * PI * d * L * d / 2 / 1000;
    if (type === 'key') { const b = Math.max(1, d / 4), h = Math.max(1, d / 6); return Math.min(60 * b * L * d / 2, 100 * (h / 2) * L * d / 2) / 1000; } // 전단 60 · 면압 100 MPa (가정)
    if (type === 'spline') return (PI / 8) * d * d * L * 0.75 * 60 / 1000 * 2;  // 이 전단 60 MPa · 하중분배 0.75 (가정)
    return null;
  }
  // C2 ↔ 출력 플랜지(크로스 롤러 내륜) 결합: 출력 토크 전부가 지나고(피크 × 1.5), 볼트 결합은 외부 모멘트·축하중에 벌어지지 않아야 한다.
  // 외부 하중은 엔진과 같이 비상 토크 비율(Temerg/Trated)로 키운다. PCD 빈칸 = 출력 베어링 dp − 2.5·Dw (내륜 중앙, 가정).
  const C2N = { integral: '일체 (C2 = 내륜·출력 플랜지)', flange: '볼트 체결', pin: '다웰 핀', press: '압입' };
  function c2outCheck(D, PT) {
    const st = D.struct, x = { ...st.c2outDim }, ob = D.outBearing || {}, type = st.c2out || 'flange', head = `${ob.name || ''} · 위치 ${{ inside: '2단 기어 폭 안', outside: '2단 출력측 바깥', flange: '출력 플랜지 쪽' }[st.obPos]} · C2 결합 ${C2N[type]}`;
    if (type === 'integral') return { kind: 'calc', val: `${head} — 체결 없음`, ok: true, c2: { type } };
    if (!pos(x.pcd)) x.pcd = pos(ob.dp) ? ob.dp - 2.5 * (ob.Dw || 2) : null;
    const d = x.d || x.pcd, L = x.L || 5, Tcap = jointCap(type, d, L, x.p, .12, x), need = 1.5 * Math.abs(PT.out ?? D.req.Tpeak);
    const ext = D.req.ext || {}, k = (D.req.Temerg || D.req.Tpeak) / (D.req.Trated || 1);
    let sep = null;
    if (type === 'flange' && pos(x.n) && pos(x.pcd) && pos(x.bd)) {
      const Fv = .6 * 1080 * PI / 4 * (x.bd * .85) ** 2, Fb = 4 * Math.abs(ext.M || 0) * k * 1000 / (x.n * x.pcd) + Math.abs(ext.Fa || 0) * k / x.n;
      sep = { Fv, Fb, S: Fb > 0 ? Fv / Fb : Infinity };
    }
    const okT = Tcap != null && Tcap >= need, okS = !sep || sep.S >= 1.5;
    const txt = Tcap == null ? '치수 입력 필요' : `${type === 'flange' ? `${x.n}×M${f(x.bd, 1)}` : type === 'pin' ? `${x.n}×Ø${f(x.dp, 1)}` : `Ø${f(d, 1)}×${f(L, 1)}`} PCD ${f(x.pcd, 1)} · 전달 ${f(Tcap, 1)} / 필요 ${f(need, 1)} N·m (피크 × 1.5)`
      + (sep ? ` · 모멘트 벌어짐: 체결력 ${f(sep.Fv, 0)} / 볼트당 ${f(sep.Fb, 0)} N = ${f(sep.S, 2)} (≥ 1.5)` : type === 'pin' ? ' · 핀은 토크만 — 모멘트·축하중은 별도 볼트로' : '');
    return { kind: 'calc', val: `${head} · ${txt}`, ok: Tcap == null ? null : okT && okS, c2: { type, Tcap, need, sep, pcd: x.pcd } };
  }
  // Ring reaction torque per stage (signed, same sign as the output torque T): ring holds T_carrier − T_sun of its stage.
  const RING_SF = 1.5;
  const sgn = (x, d = 2) => (x >= 0 ? '+' : '−') + f(Math.abs(x), d);
  function ringReaction(R, D, T) {
    const S = stg(R), car = [], sun = []; let t = T;
    for (let i = S.length - 1; i >= 0; i--) { car[i] = t; sun[i] = t / ratioOf(S[i]); t = sun[i]; }
    const stages = S.map((s, i) => ({ stage: i + 1, car: car[i], sun: sun[i], ring: car[i] - sun[i] }));
    const shared = !!(D.config.sharedRing && S.length > 1);
    const groups = shared ? [{ name: '공용 링 R1-2', idx: stages.map((_, i) => i), shared: true, T: stages.reduce((v, x) => v + x.ring, 0) }]
      : stages.map((x, i) => ({ name: `링 R${x.stage}`, idx: [i], shared: false, T: x.ring }));
    groups.forEach(g => { g.need = RING_SF * Math.abs(g.T); });
    return { T, stages, shared, groups };
  }
  // Transfer capacity of each ring–housing joint (press fit: Lamé pressure over the engaged length; bolts: friction).
  function ringJoints(R, D, L, RR) {
    const S = stg(R), rf = D.struct.ringFit, type = D.struct.ringHousing;
    return RR.groups.map(g => {
      const a = Math.max(...g.idx.map(i => S[i].geo.parts[2].df)) / 2, b = Math.max(...g.idx.map(i => L.S?.[i]?.ringOD || L.ringOD)) / 2, c = L.housR;
      const len = g.shared ? L.gearEnd : S[g.idx[0]].geo.parts[2].width;
      let Tcap, extra = {};
      if (type === 'press') {
        const pf = pressFit(a, b, c, rf.delta, rf.E, rf.nu, 206000, .3);
        Tcap = rf.mu * pf.p * PI * 2 * b * len * b / 1000;
        extra = { p: pf.p, shrink: pf.shrinkInner, hoop: pf.hoopOuter, dj: pf.shrinkInner * Math.tan(20 * PI / 180) * 1000 };
      } else { const F = (D.bolts.util * RP[D.bolts.grade] || 770) * (AS[rf.boltD] || 5); Tcap = rf.boltN * F * D.bolts.mu * (b + 2) / 1000; }
      return { ...g, len, Tcap, ok: Tcap >= g.need, ...extra };
    });
  }
  const JNAME = { integral: '일체', spline: '스플라인', key: '키', press: '압입', clamp: '클램프', pin: '핀 결합', flange: '볼트 플랜지' };

  // ---------------------------------------------------------------- the checks
  function compute(R, D, X = {}) {
    ensure(D);
    const out = {};
    if (!R || R.errors?.length) return out;
    const L = layout(R, D), S = stg(R), PT = peakTorques(R, D), put = (id, o) => { out[id] = o; };

    // 1-6 외경·길이
    if (L) {
      const Dout = 2 * Math.max(L.flangeR, L.housR), Lt = (L.zFlange[1] + .4) - L.zIn;
      const okD = D.req.Dmax ? Dout <= D.req.Dmax : null, okL = D.req.Lmax ? Lt <= D.req.Lmax : null;
      put('1-6', { val: `외경 Ø${f(Dout, 1)} · 길이 ${f(Lt, 1)} mm${D.req.Dmax ? ` (한계 Ø${D.req.Dmax})` : ''}${D.req.Lmax ? ` (한계 ${D.req.Lmax})` : ''}`, ok: okD === false || okL === false ? false : (okD ?? okL), Dout, Lt });
    }
    // 1-8 강성 목표
    const k = R.stiffness?.NmPerArcmin;
    put('1-8', { kind: 'calc', val: `백래시 ≤ ${D.req.backlashMax} arcmin · 강성 ${f(k, 1)}${D.req.stiffMin ? ` / 목표 ${D.req.stiffMin}` : ''} N·m/arcmin`, ok: R.backlash ? R.backlash.ok && (!D.req.stiffMin || k >= D.req.stiffMin) : null });

    // 2-4 / 8-2 링–하우징 결합: 단별 링 반력(부호 유지)을 체결부별로 합산 — 공용 링은 한 부품이므로 1·2단 반력의 합,
    // 분리 링은 링마다 따로. 압입·볼트 모두 같은 반력(ringReaction)을 쓰고, 요구 = 1.5 × |합계|.
    const ringType = D.struct.ringHousing;
    if (L) {
      const RR = ringReaction(R, D, D.req.Tpeak), J = ringJoints(R, D, L, RR);
      const head = `반력 (피크 ${f(D.req.Tpeak, 2)} N·m) ${RR.stages.map(x => `${x.stage}단 ${sgn(x.ring)}`).join(' · ')} N·m`;
      if (ringType === 'integral') put('2-4', { val: '하우징 일체 (강 하우징 · 링 가공 = 하우징 가공)', ok: true, RR }), put('8-2', { val: `일체 — 체결 없음 · ${head}`, ok: true, RR });
      else {
        const ok = J.every(j => j.ok), txt = J.map(j => `${j.name}: ${j.shared ? '합계' : '반력'} ${sgn(j.T)} N·m × ${RING_SF} = 필요 ${f(j.need, 2)} · 전달 ${f(j.Tcap, 2)} ${j.ok ? '≥' : '<'} ${f(j.need, 2)} N·m ${j.ok ? '합격' : '미달'}`).join(' · ');
        const j0 = J[0];
        put('2-4', { val: `${ringType === 'press' ? `압입 · 면압 ${f(j0.p, 1)} MPa` : `볼트 체결 M${D.struct.ringFit.boltD} × ${D.struct.ringFit.boltN}`} · ${txt}`, ok, RR, J });
        put('8-2', { val: `${head} · ${txt}${ringType === 'press' ? ` · 링 수축 ${f(j0.shrink * 1000, 1)} µm → 백래시 −${f(j0.dj, 1)} µm · 하우징 응력 ${f(j0.hoop, 0)} / ${D.struct.ringFit.Sy} MPa` : ''}`,
          ok: ok && (ringType !== 'press' || J.every(j => j.hoop <= D.struct.ringFit.Sy / 1.5)), p: j0.p, Tcap: j0.Tcap, need: j0.need, dj: j0.dj, RR, J });
      }
    }
    // 2-5 / 6-7 C1–S2, 2-6 S1–모터축
    if (S.length > 1) {
      const cj = D.struct.c1s2Dim, d = cj.d || L?.S?.[1]?.sunBore || S[1].st.m * S[1].st.s * .5, Lj = cj.L || S[1].st.b;
      const cap = jointCap(D.struct.c1s2, d, Lj, cj.p, .12, cj), need = PT.sun[1];
      const txt = D.struct.c1s2 === 'integral' ? '일체 (결합부 없음)' : D.struct.c1s2 === 'pin' ? `핀 ${cj.n}×Ø${f(cj.dp, 1)} PCD ${f(cj.pcd, 1)} + 파일럿 Ø${f(d, 1)} · 전달 ${f(cap, 1)} / 피크 ${f(need, 1)} N·m` : `${JNAME[D.struct.c1s2]} Ø${f(d, 1)} × ${f(Lj, 1)} · 전달 ${f(cap, 1)} / 피크 ${f(need, 1)} N·m`;
      put('2-5', { val: txt + (D.struct.c1s2 === 'spline' ? ' · 유격이 S2 자리잡음 허용' : ''), ok: cap >= need });
      put('6-7', { val: txt, ok: cap >= need * 1.2 });
    } else { put('2-5', { val: '1단 구조 — 해당 없음', ok: true }); put('6-7', { val: '1단 구조 — 해당 없음', ok: true }); }
    {
      const sj = D.struct.s1Dim, d = sj.d || L?.S?.[0]?.sunBore || 6, cap = jointCap(D.struct.s1motor, d, sj.L, sj.p, .12, sj), need = PT.sun[0];
      put('2-6', { val: D.struct.s1motor === 'integral' ? '모터축 일체 (썬 직접 가공)' : D.struct.s1motor === 'flange' ? `볼트 플랜지 ${sj.n}×M${f(sj.bd, 1)} PCD ${f(sj.pcd, 1)} · 마찰 전달 ${f(cap, 2)} / 피크 ${f(need, 2)} N·m` : `${JNAME[D.struct.s1motor]} Ø${f(d, 1)} × ${f(sj.L, 1)} · 전달 ${f(cap, 2)} / 피크 ${f(need, 2)} N·m`, ok: cap >= need });
    }
    // 2-7 C1 지지 (입력 보강), 2-8 출력 베어링 위치
    const c1 = D.struct.c1Support, OBP = { inside: '2단 기어 폭 안', outside: '2단 출력측 바깥', flange: '출력 플랜지 쪽' };
    put('2-7', { kind: 'in', val: (D.loads.sunSupport || []).map((s, i) => `S${i + 1} ${s.mode === 'structure' ? `베어링 ${s.bearingK} N/µm` : `${s.k} N/µm`}`).join(' · ') + ` · C1 지지 ${c1 === 'none' ? '없음' : c1 === 'out' ? '출력측 1개' : c1 === 'nested' ? 'S2 양측 (S1 보어·C2 보어 베어링)' : '양측'}`, ok: S.length > 1 && c1 === 'none' ? false : null });
    put('2-8', c2outCheck(D, PT));
    // 2-10 하중 경로, gate 2
    const floating = S.length > 1 && c1 === 'none';
    put('2-10', { val: floating ? 'C1 지지 없음 → S2 반경 위치는 유성 맞물림에만 의존' : '모든 축에 반경 지지 있음', ok: !floating, html: loadPathHTML(D, S, floating) });
    put('gate-2', { ok: !floating, val: floating ? 'C1 지지 없음 — S2 사실상 플로팅 (플로팅 불가 조건 위반)' : '모든 회전 부품 구속' });

    // 3-5 감속비 오차
    put('3-5', D.req.ratio ? { val: `${f(R.ratio, 4)} / 목표 ${D.req.ratio} · 오차 ${f(Math.abs(R.ratio - D.req.ratio) / D.req.ratio * 100, 2)} %`, ok: Math.abs(R.ratio - D.req.ratio) / D.req.ratio <= .01 } : { val: `${f(R.ratio, 4)} : 1 (목표 감속비 미입력)`, ok: null });
    // 3-6 모듈 역산: SH ∝ d (σH ∝ 1/d), SF ∝ m² → 필요 모듈
    {
      const req = S.map((s, i) => {
        const rs = rows(R).filter(r => r.stage === i + 1); if (!rs.length) return null;
        const SH = Math.min(...rs.map(r => r.SH)), SF = Math.min(...rs.map(r => r.SF));
        const mH = s.st.m * D.req.SH / SH, mF = s.st.m * Math.sqrt(D.req.SF / SF), mr = Math.max(mH, mF);
        return { m: s.st.m, mr, std: STD_M.find(x => x >= mr - 1e-9) ?? STD_M.at(-1), mode: mH >= mF ? '피팅' : '굽힘' };
      });
      put('3-6', { val: req.map((q, i) => q ? `${i + 1}단 m ${q.m} / 필요 ${f(q.mr, 3)} (${q.mode}) → 규격 ${q.std}` : '').join(' · '), ok: req.every(q => !q || q.m >= q.mr - 1e-6), req });
    }

    // 7-2 / 9-4 니들
    {
      const res = S.map((s, i) => needleCalc(s, D.needle[i], R));
      put('7-2', { kind: D.needle.some(n => n.use) ? 'calc' : 'in', val: res.map((r, i) => r ? `${i + 1}단 Dw ${r.Dw}×${f(r.Lw, 1)} · Z ${r.Z} → C ${f(r.C, 0)} N · C0 ${f(r.C0, 0)} N${D.needle[i].apply ? ' (적용)' : ''}` : `${i + 1}단 기성 베어링`).join(' · '), ok: res.every(r => !r || r.rimOk), res });
      put('9-4', { kind: 'calc', val: res.map((r, i) => r ? `${i + 1}단 궤도 HRC ${Math.min(D.needle[i].HRCpin, D.needle[i].HRCbore)} → C 보정 ×${f(r.fH, 2)}` : `${i + 1}단 ${s0(S[i])}`).join(' · '), ok: res.every(r => !r || r.fH >= .9) });
      function s0(s) { return s.st.pin.material; }
    }

    // 8-3 볼트 (출력 플랜지 볼트 마찰 전달)
    if (L && D.housing) {
      const F = D.bolts.util * (RP[D.bolts.grade] || 1100) * (AS[D.housing.boltD] || 5), Tcap = D.housing.boltN * F * D.bolts.mu * L.flangeBoltR / 1000, need = 1.5 * D.req.Tpeak;
      put('8-3', { kind: 'calc', val: `M${D.housing.boltD} × ${D.housing.boltN} (${D.bolts.grade}) · 마찰 전달 ${f(Tcap, 1)} / 필요 ${f(need, 1)} N·m (피크 × 1.5)`, ok: Tcap >= need, Tcap });
      put('gate-8', { ok: (out['8-3'].ok !== false) && (out['8-2']?.ok !== false), val: '체결 여유 1.5배' });
    }
    // 8-7 조립 순서 · 축방향 유격
    {
      const gaps = (R.carrierPin || []).map(c => c.geometry?.gap);
      const ok = gaps.every(g => g == null || (g >= .1 && g <= 1));
      put('8-7', { val: `유성 축방향 유격 ${gaps.map(g => f(g, 2)).join(' / ')} mm · 조립 ${assemblySteps(D, S).length}단계`, ok, html: `<ol class="asm">${assemblySteps(D, S).map(t => `<li>${esc(t)}</li>`).join('')}</ol>` });
    }

    // 10-6 열평형
    if (L) {
      const eta = (R.verdict?.find(v => v.k === '효율 (정격, 추정)')?.value || 95) / 100, rpmOut = D.req.rpm / R.ratio;
      const P = D.req.Trated * 2 * PI * rpmOut / 60 * (1 / eta - 1) * D.thermal.duty;
      const Dm = 2 * L.housR / 1000, Lm = ((L.zFlange[1] + .4) - L.zIn) / 1000, A = PI * Dm * Lm + 2 * PI * Dm * Dm / 4;
      const dT = P / (D.thermal.h * A), T = D.thermal.Tamb + dT;
      put('10-6', { kind: 'calc', val: `손실 ${f(P, 2)} W · 표면 ${f(A * 1e4, 0)} cm² → 온도 ${f(T, 1)} °C (윤활 가정 ${D.lube.temp} °C)`, ok: T <= D.lube.temp + 5, T, P });
    }

    // 11-2 ~ 11-5 검증
    {
      const ks = (R.stiffness?.stages || []).map((s, i) => { const fe = D.verify.feaKcar?.[i]; return fe ? { i, r: fe / (s.Kcar / 1000) } : null; }).filter(Boolean);
      put('11-2', ks.length ? { kind: 'calc', val: ks.map(q => `${q.i + 1}단 FEA/모델 ${f(q.r, 2)}`).join(' · '), ok: ks.every(q => q.r > .7 && q.r < 1.3) } : { kind: 'in', val: 'FEA 결과 미입력', ok: null });
      const sF = Math.max(...rows(R).map(r => r.F));
      put('11-3', D.verify.feaSigmaF ? { kind: 'calc', val: `FEA ${D.verify.feaSigmaF} / ISO ${f(sF, 0)} MPa · 비 ${f(D.verify.feaSigmaF / sF, 2)}`, ok: D.verify.feaSigmaF / sF < 1.3 } : { kind: 'in', val: `ISO 최대 σF ${f(sF, 0)} MPa · FEA 미입력`, ok: null });
      const tt = D.verify.testT, cap = R.reducerCap, mc = X.MC?.capacity?.p50;
      put('11-4', tt ? { kind: 'calc', val: `시험 ${tt} N·m · ${D.loads?.basis === 'ideal' ? '이론' : 'ISO'} ${f(cap, 2)} (×${f(tt / cap, 1)})${mc ? ` · 시편 예측 P50 ${f(mc, 1)} (×${f(tt / mc, 2)})` : ''}`, ok: mc ? Math.abs(tt / mc - 1) < .3 : null } : { kind: 'in', val: '시험값 미입력', ok: null });
      if (tt) {
        const g = R.govRated?.row?.f, kNeed = cap / tt;  // 피팅: 정격 ∝ 1/(Kγ·KHβ)
        put('11-5', { kind: 'calc', val: g ? `Kγ·KHβ = ${f(g.Kg * g.KHb, 2)} → 시험과 맞으려면 ${f(g.Kg * g.KHb * kNeed, 2)} (×${f(kNeed, 2)})` : `보정 배수 ×${f(kNeed, 2)}`, ok: null,
          html: g ? `<p class="note">정격토크는 피팅 지배일 때 대략 1/(Kγ·KHβ)에 비례합니다. 현재 Kγ ${f(g.Kg, 2)} · KHβ ${f(g.KHb, 2)}. 시험값과 맞추려면 두 계수의 곱이 ${f(g.Kg * g.KHb * kNeed, 2)}가 되어야 하며, Kγ ≥ 1 · KHβ ≥ 1 이므로 ${g.Kg * g.KHb * kNeed < 1 ? '<b class="bad">계수만으로는 설명되지 않습니다 — 재료 한도(σHlim)·하중 정의(정격 vs 피크)·수명 조건을 먼저 확인하세요.</b>' : '지지 강성(2-7)·핀 처짐(6-5) 가정을 그 방향으로 재검토하세요.'}</p>` : '' });
      } else put('11-5', { kind: 'in', val: '시험값 입력 시 역산', ok: null });
    }

    // 12-x 출력물
    put('12-2', { kind: 'calc', val: '솔리드웍스 전역변수 · CadQuery 스크립트 복사' });
    put('12-4', { kind: 'calc', val: '데이터시트 표 (출력물 화면)' });
    put('12-5', { kind: 'calc', val: `구조 선택 ${Object.keys(D.struct).length}개 · 가정 ${R.register?.length || 0}개 · 형상 덮어쓰기 ${Object.values(D.geom || {}).reduce((s, o) => s + Object.values(o || {}).filter(v => v != null && v !== '').length, 0)}개` });
    const RV = { draft: '검토 전', review: '검토 중', approved: '승인', rejected: '반려' };
    put('12-6', { kind: 'in', val: `${RV[D.review.status] || D.review.status}${D.review.by ? ' · ' + D.review.by : ''}${D.review.date ? ' · ' + D.review.date : ''}`, ok: D.review.status === 'approved' ? true : D.review.status === 'rejected' ? false : null });
    put('gate-12', { ok: D.review.status === 'approved' ? true : null, val: '' });

    // D1 ~ D6 가공·원가
    const PN = { hob: '호빙', shape: '셰이핑', skive: '스카이빙', broach: '브로칭', wire: '와이어컷', mill: '선삭+밀링', plate: '판 조립', sinter: '소결·MIM', turn: '선삭', cast: '주조+가공', buy: '구매품', grind: '연삭' };
    put('D1', { kind: 'in', val: Object.entries(D.dfm.proc).map(([k, v]) => `${{ sun: '썬', planet: '유성', ring: '링', carrier: '캐리어', housing: '하우징', pin: '핀' }[k]} ${PN[v] || v}`).join(' · ') });
    {
      const iss = [];
      S.forEach((s, i) => { if (!STD_M.includes(s.st.m)) iss.push(`${i + 1}단 모듈 ${s.st.m} 비규격 → 특수 공구`); });
      if (S.some(s => s.st.beta > 0) && ['shape', 'broach'].includes(D.dfm.proc.ring)) iss.push(`헬리컬 링(β ${S[0].st.beta}°) ${PN[D.dfm.proc.ring]} → 나선 가이드·특수 공구 필요`);
      if (S.some(s => s.st.beta > 0) && D.dfm.proc.ring === 'wire') iss.push('와이어컷은 헬리컬 링 불가');
      if (D.struct.s1motor === 'integral') iss.push('S1 축 일체 → 호브 도피 거리 확보 필요');
      if (D.struct.ringHousing === 'integral' && D.dfm.proc.ring === 'shape') iss.push('링 일체 하우징 셰이핑 → 커터 도피 홈 필요');
      put('D2', { kind: 'calc', val: iss.length ? iss.join(' · ') : '표준 공구로 가공 가능', ok: !iss.some(t => /불가|비규격/.test(t)) ? (iss.length ? null : true) : false });
    }
    // ideal basis: the rating has no errors (Kγ = 1); tolerances show up only in the specimen simulation (11-1)
    if (D.loads?.basis === 'ideal') put('D3', { kind: 'calc', val: X.MC?.Kg ? `유성 위치 ±${D.loads.posError} µm · 정밀도 ${D.stages.map(s => s.grade).join('/')}급 → 시편 Kγ 중앙 ${f(X.MC.Kg.p50, 2)} / P90 ${f(X.MC.Kg.p90, 2)} · KHβ P90 ${f(X.MC.KHb.p90, 2)}` : '시편 시뮬레이션(11-1) 실행 전', ok: X.MC?.Kg ? X.MC.Kg.p90 <= 1.3 : null });
    else put('D3', { kind: 'calc', val: `유성 위치오차 ±${D.loads.posError} µm → Kγ ${(R.rated?.stages || []).map(s => f(s.Kg, 2)).join(' / ')} · 정밀도 ${D.stages.map(s => s.grade).join('/')}급`, ok: (R.rated?.stages || []).every(s => s.Kg <= 1.3) });
    if (L) {
      const th = [];
      S.forEach((s, i) => {
        const sb = L.S[i].sunBore, pb = L.S[i].planetBore, m = s.st.m, h = 2.25 * m;
        const dfS = s.geo.parts[0].df, dfP = s.geo.parts[1].df;
        if (sb > 0) th.push([`S${i + 1} 림`, (dfS - sb) / 2, 1.2 * h]);
        if (pb > 0) th.push([`P${i + 1} 림`, (dfP - pb) / 2, 1.2 * h]);
      });
      const m0 = S[0].st.m;
      th.push(['링 림', (L.ringOD - S[0].geo.parts[2].df) / 2, 3.5 * m0], ['하우징 벽', L.housR - L.ringOD / 2, .8]);
      (R.carrierPin || []).forEach((c, i) => { if (c.geometry?.wall) th.push([`C${i + 1} 판 (자동)`, c.geometry.wall, 1]); if (c.geometry?.pocket) th.push([`C${i + 1} 포켓 폭`, c.geometry.pocket, 2]); });
      const bad = th.filter(([, v, mn]) => v < mn - 1e-3);
      put('D4', { kind: 'calc', val: bad.length ? '부족: ' + bad.map(([n, v, mn]) => `${n} ${f(v, 2)} < ${f(mn, 2)} mm`).join(' · ') : `최소 두께 통과 (${th.length}곳)`, ok: !bad.length, th });
    }
    {
      const c = costModel(R, D, L);
      put('D5', { kind: 'calc', val: c ? `약 ${Math.round(c.total).toLocaleString('ko-KR')} 원/대 (수량 ${D.dfm.qty}) · 상위: ${c.items.slice(0, 3).map(x => x.name).join(', ')}` : '부품 목록 없음', ok: null, cost: c });
      const sug = savings(R, D, c);
      put('D6', { kind: 'calc', val: sug.length ? `${sug.length}개 제안 · 최대 ${sug[0].t}` : '추가 제안 없음', ok: null, sug });
    }
    return out;
  }

  // full-complement needle bearing on the pin (ISO 281 roller formula; hardness factor assumed)
  function needleCalc(s, N, R) {
    if (!N?.use) return null;
    const pinD = s.st.pin.d, Dw = N.Dw, Lw = N.Lw || Math.max(1, s.st.b - .4), Dpw = pinD + Dw;
    const Zmax = Math.floor(PI * Dpw / Dw - .5), Z = Math.min(N.Z || Zmax, Zmax);   // full complement: total circumferential clearance ≥ 0.5·Dw
    const gamma = Dw / Dpw, fc = lerp(FC, gamma), bm = 1.1;
    const HRC = Math.min(N.HRCpin, N.HRCbore), fH = Math.min(1, Math.pow(HRC / 58, 3.6)), f0H = Math.min(1, Math.pow(HRC / 58, 2));
    const C = bm * fc * Math.pow(Lw, 7 / 9) * Math.pow(Z, 3 / 4) * Math.pow(Dw, 29 / 27) * fH;
    const C0 = 44 * (1 - gamma) * Z * Lw * Dw * f0H;
    const bore = pinD + 2 * Dw, m = s.st.m, dfP = m * s.st.p / Math.cos(s.st.beta * PI / 180) - 2.5 * m, rim = (dfP - bore) / 2;
    return { Dw, Lw, Z, Zmax, C, C0, fH, bore, rim, rimOk: rim >= 1.2 * 2.25 * m };
  }
  // Planet bearing source per stage: 'manual' (직접 입력 — catalogue values the designer typed) or 'needle' (풀니들 계산).
  // bearing.manual keeps the typed name/C/C0/planet bore while the calculation is applied; bearing.calc keeps the last
  // calculated set. Turning the calculation off restores the typed values. Files saved before this split may have lost
  // the typed values (bearing.manualLost) — the app says so instead of guessing.
  function applyNeedles(D) {
    if (!D.needle) return;
    D.stages.forEach((s, i) => {
      const N = D.needle[i], br = s.bearing || (s.bearing = {}), on = !!(N?.use && N.apply);
      if (on) {
        const r = needleCalc({ st: s }, N); if (!r) return;
        if (br.src !== 'needle') { br.manual = { name: br.name ?? null, C: br.C ?? null, C0: br.C0 ?? null, planetBore: s.planetBore ?? null }; delete br.manualLost; }
        br.calc = { name: `풀니들 Ø${r.Dw}×${f(r.Lw, 1)} × ${r.Z} (계산)`, C: Math.round(r.C), C0: Math.round(r.C0), planetBore: +r.bore.toFixed(3) };
        Object.assign(br, { name: br.calc.name, C: br.calc.C, C0: br.calc.C0, src: 'needle' }); s.planetBore = br.calc.planetBore;
      } else if (br.src === 'needle') {
        if (br.manual && !br.manualMissing) { Object.assign(br, { name: br.manual.name, C: br.manual.C, C0: br.manual.C0 }); s.planetBore = br.manual.planetBore; }
        else br.manualLost = true;
        delete br.manualMissing; br.src = 'manual';
      } else if (!br.src) br.src = 'manual';
    });
  }
  // pgd/1 files saved before the source split: decide what the stored bearing values are and report it.
  function migrateNeedles(d) {
    const notes = [];
    (d.stages || []).forEach((s, i) => {
      const br = s.bearing; if (!br || br.src) return;
      const N = d.needle?.[i], calcName = /\(계산\)/.test(br.name || '');
      if (N?.use && N.apply && calcName) { br.src = 'needle'; br.manualMissing = true; notes.push(`${i + 1}단 유성 베어링: 파일에 풀니들 계산값(C ${br.C} N)만 있고 적용 전 직접 입력값이 없습니다 — 적용을 해제하면 카탈로그 값을 다시 입력해야 합니다.`); }
      else if (calcName) { br.src = 'manual'; br.manualLost = true; notes.push(`${i + 1}단 유성 베어링: 풀니들 적용이 꺼져 있지만 저장된 C ${br.C} N은 계산값입니다 — 원래 직접 입력값은 파일에 없어 복원하지 못했습니다.`); }
      else br.src = 'manual';
    });
    return notes;
  }

  function assemblySteps(D, S) {
    const two = S.length > 1, st = D.struct, J = JNAME;
    const a = [];
    a.push(st.ringHousing === 'integral' ? '하우징(링 일체) 준비' : st.ringHousing === 'press' ? '링 R1-2를 하우징에 압입 (가열 끼움 권장)' : '링을 하우징에 볼트 체결');
    a.push('출력 베어링 외륜을 하우징에 장착' + (D.struct.obPos === 'flange' ? ' (출력 플랜지 쪽)' : ''));
    if (two) a.push(`C2에 유성핀·유성 베어링·P2 조립 후 출력 베어링 내륜·출력 플랜지와 결합`);
    if (two) a.push(`C1–S2 ${J[st.c1s2]} 결합` + (st.c1s2 === 'integral' ? ' (일체 부품)' : ''));
    a.push(`C1에 유성핀·유성 베어링·P1 조립${two ? ' 후 S2가 P2 사이에 물리도록 삽입' : ''}`);
    if (st.c1Support === 'nested') a.push('S2 저널에 6703(입력측, S1 보어 안)·6705(출력측, C2 보어 안) 베어링 장착'); else if (st.c1Support !== 'none') a.push('C1 지지 베어링 장착');
    a.push(`S1을 P1 사이에 삽입 · S1–모터축 ${J[st.s1motor]}`);
    a.push('입력 커버·오일 실 장착 후 볼트 체결 · 출력 커버 장착');
    a.push('축방향 유격 확인 (유성·캐리어) · 회전 토크·백래시 측정');
    return a;
  }

  function loadPathHTML(D, S, floating) {
    const two = S.length > 1, st = D.struct, OB = { inside: '2단 기어 폭 안', outside: '2단 출력측 바깥', flange: '출력 플랜지 쪽' };
    const row = (t, path, sep = '<i>→</i>') => `<div class="lp"><b>${t}</b><span>${path.map(esc).join(sep)}</span></div>`;
    return `<div class="lpath">
      ${row('토크', ['모터', `S1 (${JNAME[st.s1motor]})`, 'P1', 'C1', ...(two ? [`S2 (${JNAME[st.c1s2]})`, 'P2', 'C2'] : []), '출력 플랜지'])}
      ${row('반력 토크', ['P1·P2', 'R1-2', `하우징 (${{ integral: '일체', press: '압입', bolt: '볼트' }[st.ringHousing]})`])}
      ${row('반경 지지', [`S1: ${(D.loads.sunSupport?.[0]?.mode === 'structure') ? '지지 베어링' : '모터 베어링'}`, two ? `C1·S2: ${st.c1Support === 'none' ? '지지 없음 (유성 위)' : st.c1Support === 'out' ? '출력측 베어링' : st.c1Support === 'nested' ? 'S1 보어·C2 보어 안 베어링' : '양측 베어링'}` : '', `C2: 출력 베어링 (${OB[st.obPos]})`].filter(Boolean), '<i>·</i>')}
      ${row('외부 모멘트', ['출력 플랜지', `출력 베어링 (${OB[st.obPos]})`, '하우징'])}<div class="lp"><b></b><span class="x">출력 베어링 기울기 → C2 기울기 → 2단 KHβ</span></div>
      ${floating ? '<p class="bad" style="margin:6px 0 0">C1 지지 베어링이 없어 S2의 반경 위치가 유성 맞물림에만 의존합니다 — 사실상 플로팅. 플로팅 불가 조건이면 C1 지지를 추가하세요.</p>' : ''}
    </div>`;
  }

  // rough unit cost (KRW): stock + machining time + heat treatment + purchased parts, setup spread over the batch
  function costModel(R, D, L) {
    let parts = []; try { parts = globalThis.PGD3D ? PGD3D.partsList(R, D) : []; } catch (e) { }
    if (!parts.length) return null;
    const dm = D.dfm, rate = dm.rate / 60, items = [];   // 원/분
    // [가공 분, 셋업 분, 열처리 여부, 소재] per part kind (가정)
    const T = id => {
      const stage = R.ctx.stages[Number(id.replace(/\D/g, '') || 1) - 1];
      const tooth = stage ? (id.startsWith('sun') ? stage.st.s : id.startsWith('planet') ? stage.st.p : stage.geo.r) * stage.st.b : 0;
      if (/^sun/.test(id)) return [6 + .02 * tooth * (dm.proc.sun === 'hob' ? 1 : 1.5), 45, 1, 'steel'];
      if (/^planet/.test(id)) return [(4 + .02 * tooth) * (dm.proc.planet === 'hob' ? .5 : 1), 45, 1, 'steel'];   // 스택 호빙
      if (/^ring/.test(id)) return [10 + tooth * ({ shape: .06, skive: .02, broach: .005, wire: .15 }[dm.proc.ring] || .06), 90, 1, 'steel'];
      if (/^carrier/.test(id)) return [{ mill: 25, plate: 18, sinter: 3 }[dm.proc.carrier] || 25, 60, 0, 'steel'];
      if (/^pin/.test(id)) return dm.proc.pin === 'buy' ? [0, 0, 0, 'buy', 150] : [3, 30, 1, 'steel'];
      if (id === 'housing') return [{ turn: 20, cast: 8 }[dm.proc.housing] || 20, 60, 0, D.struct.ringHousing === 'integral' ? 'steel' : 'alu'];
      if (/^(cover|ocover|oflange|oshaft|inshaft)$/.test(id)) return [8, 30, 0, 'alu'];
      if (/^needle/.test(id)) return [0, 0, 0, 'buy', D.needle.some(n => n.use) ? 600 : 1500];
      if (id === 'xroller') return [0, 0, 0, 'buy', 60000];
      if (/^brgS/.test(id)) return [0, 0, 0, 'buy', 2500];
      if (id === 'seal') return [0, 0, 0, 'buy', 1500];
      if (id === 'bolts') return [0, 0, 0, 'buy', 80];
      return [5, 30, 0, 'steel'];
    };
    for (const p of parts) {
      const [tm, setup, ht, mat, buy] = T(p.id), q = p.qty || 1, kg = (p.mass || 0) * q;
      const material = mat === 'buy' ? (buy || 0) * q : kg * 1.6 * (mat === 'alu' ? dm.alu : dm.steel);
      const mach = tm * q * rate + setup * rate / Math.max(1, dm.qty), heat = ht ? kg * dm.ht + 500 : 0;
      items.push({ id: p.id, name: p.name, material, mach, heat, total: material + mach + heat });
    }
    items.sort((a, b) => b.total - a.total);
    return { items, total: items.reduce((s, x) => s + x.total, 0) };
  }
  function savings(R, D, c) {
    if (!c) return [];
    const S = R.ctx.stages, s = [], by = id => c.items.filter(x => x.id.startsWith(id)).reduce((t, x) => t + x.total, 0);
    if (S.length > 1 && S[0].st.p === S[1].st.p && S[0].st.m === S[1].st.m && S[0].st.b !== S[1].st.b) s.push({ t: '1·2단 유성 치폭 통일 → 유성 공용화', v: by('planet') * .15 });
    if (D.dfm.proc.pin !== 'buy') s.push({ t: '유성핀을 규격 니들 롤러 축·다월핀 구매품으로', v: by('pin') * .5 });
    if (S.some(x => x.st.beta > 0)) s.push({ t: '스퍼(β 0°)로 바꾸면 링 셰이핑 나선 가이드 불필요 (εβ 경고 감수)', v: by('ring') * .25 });
    if (D.dfm.qty >= 1000 && D.dfm.proc.carrier !== 'sinter') s.push({ t: '수량 1000대 이상 → 캐리어 소결·MIM', v: by('carrier') * .5 });
    if (D.dfm.qty >= 2000 && D.dfm.proc.ring !== 'broach') s.push({ t: '대량 → 링 브로칭', v: by('ring') * .4 });
    if (D.struct.ringHousing === 'integral') s.push({ t: '링 분리 압입 + 알루미늄 하우징', v: by('housing') * .3 });
    if (!D.needle.some(n => n.use)) s.push({ t: '니들 케이지 → 풀니들 (외륜 없는 궤도면 겸용)', v: by('needle') * .4 });
    if (D.housing && D.req.Tpeak && D.housing.boltD > 3) s.push({ t: '볼트 호칭 통일로 구매·조립 공수 감소', v: by('bolts') * .2 });
    return s.sort((a, b) => b.v - a.v).map(x => ({ t: x.t, v: Math.round(x.v) }));
  }

  // ---------------------------------------------------------------- forms (rendered by the app's num/sel/chk helpers)
  const JOPT = [['integral', '일체'], ['spline', '스플라인'], ['key', '키'], ['press', '압입']];
  const FORMS = {
    '1-6': { view: 's1', title: '외경·길이 한계', f: [['num', 'req.Dmax', '외경 한계 Dmax (mm)'], ['num', 'req.Lmax', '길이 한계 (mm)']] },
    '1-8': { view: 's1', title: '강성 목표', f: [['num', 'req.stiffMin', '비틀림 강성 목표 (N·m/arcmin)']] },
    '3-5': { view: 's2', title: '목표 감속비', f: [['num', 'req.ratio', '목표 감속비 i']] },
    '2-4': { view: 's2', title: '링–하우징 결합', f: [['sel', 'struct.ringHousing', '방식', [['integral', '일체 (강 하우징)'], ['press', '압입'], ['bolt', '볼트']]]], more: '8-2' },
    '2-5': { view: 's2', title: 'C1–S2 결합', f: [['sel', 'struct.c1s2', '방식', [...JOPT, ['pin', '핀 결합']]], ['num', 'struct.c1s2Dim.d', '결합 지름 (빈칸=S2 보어)'], ['num', 'struct.c1s2Dim.L', '결합 길이 (빈칸=치폭)'], ['num', 'struct.c1s2Dim.p', '압입 면압 MPa (압입 시)']] },
    '2-6': { view: 's2', title: 'S1–모터축 결합', f: [['sel', 'struct.s1motor', '방식', [...JOPT, ['clamp', '클램프'], ['flange', '볼트 플랜지']]], ['num', 'struct.s1Dim.d', '축 지름 (빈칸=S1 보어)'], ['num', 'struct.s1Dim.L', '결합 길이'], ['num', 'struct.s1Dim.p', '면압 MPa (압입·클램프)']] },
    '2-7': { view: 's2', title: 'C1 지지 베어링', f: [['sel', 'struct.c1Support', 'C1 지지', [['none', '없음 (유성 위에 얹힘)'], ['out', '출력측 1개'], ['both', '양측'], ['nested', 'S2 양측 (S1·C2 보어 안 베어링)']]]] },
    '2-8': { view: 's2', title: '출력 베어링 위치 · C2 결합', f: [['sel', 'struct.obPos', '위치', [['inside', '2단 기어 폭 안'], ['outside', '2단 출력측 바깥'], ['flange', '출력 플랜지 쪽']]], ['sel', 'struct.c2out', 'C2 ↔ 출력 플랜지', [['integral', '일체'], ['flange', '볼트'], ['pin', '다웰 핀'], ['press', '압입']]], ['num', 'struct.c2outDim.n', '볼트·핀 수'], ['num', 'struct.c2outDim.bd', '볼트 호칭 M'], ['num', 'struct.c2outDim.dp', '핀 지름'], ['num', 'struct.c2outDim.pcd', 'PCD (빈칸=베어링 dp − 2.5Dw)']] },
    '2-10': { view: 's2', title: '하중 경로도', f: [] },
    '3-6': { view: 's3', title: '모듈 역산 (필요 안전율 기준)', f: [] },
    '7-2': { view: 's9', title: '풀니들 유성 베어링', stage: true, f: [['chk', 'needle.{i}.use', '{s}단 풀니들 사용'], ['num', 'needle.{i}.Dw', '{s}단 니들 Dw'], ['num', 'needle.{i}.Lw', '{s}단 길이 Lw (빈칸=치폭−0.4)'], ['num', 'needle.{i}.Z', '{s}단 개수 Z (빈칸=최대)'], ['num', 'needle.{i}.HRCpin', '{s}단 핀 HRC'], ['num', 'needle.{i}.HRCbore', '{s}단 유성 보어 HRC'], ['chk', 'needle.{i}.apply', '{s}단 계산값을 베어링 계산에 적용 (유성 보어도 갱신)']] },
    '8-2': { view: 'shous', title: '링 고정 (압입·볼트)', f: [['num', 'struct.ringFit.delta', '압입 죔새 (지름, mm)'], ['num', 'struct.ringFit.mu', '마찰계수'], ['num', 'struct.ringFit.E', '하우징 E (MPa)'], ['num', 'struct.ringFit.Sy', '하우징 항복 (MPa)'], ['num', 'struct.ringFit.boltN', '볼트 수 (볼트 체결 시)'], ['num', 'struct.ringFit.boltD', '볼트 호칭 M']] },
    '8-3': { view: 'shous', title: '출력 플랜지 볼트 체결', f: [['sel', 'bolts.grade', '강도 등급', [['8.8', '8.8'], ['10.9', '10.9'], ['12.9', '12.9']], 'numsel'], ['num', 'bolts.mu', '마찰계수'], ['num', 'bolts.util', '체결력 / 항복 비']] },
    '8-7': { view: 'shous', title: '조립 순서 · 축방향 유격', f: [] },
    '10-6': { view: 's10', title: '발열·온도 (열평형)', f: [['num', 'thermal.Tamb', '주변 온도 °C'], ['num', 'thermal.h', '방열 계수 W/m²K'], ['num', 'thermal.duty', '연속 운전 비율 (0~1)']] },
    '11-2': { view: 's11', title: 'FEA 캐리어 강성', f: [['num', 'verify.feaKcar.0', '1단 FEA 강성 (N·m/mrad)'], ['num', 'verify.feaKcar.1', '2단 FEA 강성 (N·m/mrad)']] },
    '11-3': { view: 's11', title: 'FEA 이뿌리 응력', f: [['num', 'verify.feaSigmaF', 'FEA 최대 이뿌리 응력 (MPa, 정격)']] },
    '11-4': { view: 's11', title: '시험값 비교', f: [['num', 'verify.testT', '시험 정격 토크 (N·m)']] },
    '11-5': { view: 's11', title: '가정 역산', f: [] },
    '12-2': { view: 'out', title: 'CAD 내보내기', f: [] },
    '12-4': { view: 'out', title: '성능 데이터시트', f: [] },
    '12-5': { view: 'out', title: '설계 근거 기록', f: [] },
    '12-6': { view: 'out', title: '검토·승인', f: [['sel', 'review.status', '상태', [['draft', '검토 전'], ['review', '검토 중'], ['approved', '승인'], ['rejected', '반려']]], ['str', 'review.by', '검토자'], ['str', 'review.date', '날짜'], ['str', 'review.note', '메모']] },
    'D1': { view: 'out', title: '가공 방식', f: [['sel', 'dfm.proc.sun', '썬', [['hob', '호빙'], ['shape', '셰이핑']]], ['sel', 'dfm.proc.planet', '유성', [['hob', '호빙 (스택)'], ['shape', '셰이핑']]], ['sel', 'dfm.proc.ring', '링', [['shape', '셰이핑'], ['skive', '파워 스카이빙'], ['broach', '브로칭'], ['wire', '와이어컷']]], ['sel', 'dfm.proc.carrier', '캐리어', [['mill', '일체 선삭+밀링'], ['plate', '판 조립'], ['sinter', '소결·MIM']]], ['sel', 'dfm.proc.housing', '하우징', [['turn', '선삭'], ['cast', '주조+가공']]], ['sel', 'dfm.proc.pin', '핀', [['buy', '구매품'], ['grind', '자체 연삭']]]] },
    'D2': { view: 'out', title: '공구·공정 제약', f: [] },
    'D4': { view: 'out', title: '가공 가능 검사 (최소 두께)', f: [] },
    'D5': { view: 'out', title: '원가 추정 (가정 단가)', f: [['num', 'dfm.qty', '생산 수량'], ['num', 'dfm.rate', '가공 임률 (원/h)'], ['num', 'dfm.steel', '강 소재 (원/kg)'], ['num', 'dfm.alu', '알루미늄 소재 (원/kg)'], ['num', 'dfm.ht', '열처리 (원/kg)']] },
    'D6': { view: 'out', title: '원가 절감 대안', f: [] },
  };

  globalThis.PGDChecks = { ensure, compute, ringReaction, ringJoints, applyNeedles, migrateNeedles, FORMS, needleCalc, costModel, assemblySteps };
})();
