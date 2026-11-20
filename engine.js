/* Planetary Gear Designer — calculation engine.
 * Units: N, mm, MPa, rpm, µm (deviations), N·m (torque).
 * Procedure-based: requirements → geometry → materials → load factors (physical models)
 * → ISO 6336 strength with S-N curves and duty spectrum → bearings/pins/efficiency/backlash
 * → virtual validation (Monte Carlo over tolerances, load sharing and fatigue scatter).
 * No measured data are assumed. Every factor carries a source tag: 규격 | 모델 | 가정.
 */
(function (root) {
  'use strict';
  const rad = Math.PI / 180, inv = a => Math.tan(a) - a;
  const fin = Number.isFinite, pos = x => fin(x) && x > 0;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const TOOL = { hfp: 1.25, hap: 1 };
  const NAMES = ['썬', '유성', '링'];

  // ------------------------------------------------------------ hardness (Mitutoyo E17001 / SAE J417)
  const HP = [[240,20.3],[250,22.2],[260,24],[270,25.6],[280,27.1],[290,28.5],[300,29.8],[320,32.2],[340,34.4],[360,36.6],[380,38.8],[400,40.8],[420,42.7],[440,44.5],[460,46.1],[480,47.7],[500,49.1],[520,50.5],[540,51.7],[560,53],[580,54.1],[600,55.2],[620,56.3],[640,57.3],[660,58.3],[680,59.2],[700,60.1],[720,61],[740,61.8],[760,62.5],[780,63.3],[800,64],[820,64.7],[840,65.3],[860,65.9],[880,66.4],[900,67],[920,67.5],[940,68]];
  function conv(x, from) {
    if (!fin(x)) return NaN;
    const to = 1 - from;
    if (x <= HP[0][from]) return HP[0][to];
    for (let i = 1; i < HP.length; i++) { const a = HP[i - 1], b = HP[i]; if (x <= b[from]) return a[to] + (x - a[from]) / (b[from] - a[from]) * (b[to] - a[to]); }
    return HP[HP.length - 1][to];
  }
  const hrc2hv = x => conv(x, 1), hv2hrc = x => conv(x, 0);

  // ------------------------------------------------------------ ISO 1328-1:2013 (= JIS B 1702-1:2016) tolerances, µm
  // ISO 1328-1:2013 §5.2.3 rounding: < 5 µm → 0.1 µm, 5…10 µm → 0.5 µm, > 10 µm → 1 µm
  const r1328 = v => v < 5 ? Math.round(v * 10) / 10 : v <= 10 ? Math.round(v * 2) / 2 : Math.round(v);
  function tolerances(z, m, b, beta, grade) {
    const d = m * z / Math.cos(beta * rad), s = 2 ** ((grade - 5) / 2);
    return {
      pitch: r1328((0.001 * d + 0.4 * m + 5) * s),
      profileForm: r1328((0.55 * m + 5) * s),
      profileSlope: r1328((0.4 * m + 0.001 * d + 4) * s),
      helixSlope: r1328((0.05 * Math.sqrt(d) + 0.35 * Math.sqrt(b) + 4) * s),
      helixForm: r1328((0.07 * Math.sqrt(d) + 0.45 * Math.sqrt(b) + 4) * s),
      runout: r1328(0.9 * (0.002 * d + 0.55 * Math.sqrt(d) + 0.7 * m + 12) * s),
      d
    };
  }

  // ------------------------------------------------------------ materials (ISO 6336-5:2016 Table 1 lines σ = A·HV + B)
  const FAMILY = {
    Eh: { label: '침탄 경화강 (Eh)', hv: { ML: [600, 800], MQ: [660, 800], ME: [660, 800] }, lines: { ML: [0, 1300, 0, 312], MQ: [0, 1500, 0, 425], ME: [0, 1650, 0, 525] }, E: 206000, nu: .3, rho: 7.85e-6, slip: .003 },
    NV: { label: '조질강 질화 (NV)', hv: { ML: [450, 650], MQ: [450, 650], ME: [450, 650] }, lines: { ML: [0, 788, 0, 258], MQ: [0, 998, 0, 363], ME: [0, 1217, 0, 432] }, E: 206000, nu: .3, rho: 7.85e-6, slip: .1005 },
    VA: { label: '조질 합금강 (V)', hv: { ML: [200, 360], MQ: [200, 360], ME: [200, 390] }, lines: { ML: [1.313, 188, .423, 104], MQ: [1.313, 373, .425, 187], ME: [2.213, 260, .358, 231] }, E: 206000, nu: .3, rho: 7.85e-6, slip: .0194 },
    VC: { label: '탄소강 조질 (V)', hv: { ML: [135, 210], MQ: [135, 210], ME: [135, 210] }, lines: { ML: [.963, 283, .25, 108], MQ: [.925, 360, .24, 163], ME: [.838, 432, .283, 202] }, E: 206000, nu: .3, rho: 7.85e-6, slip: .0194 }
  };
  // ISO 6336-2 Table 2 / ISO 6336-3 Table 2 life factors (static → endurance → 1e10 at 0.85, normal lubrication)
  const ZN = { Eh: [[1e5, 1.6], [5e7, 1], [1e10, .85]], VA: [[1e5, 1.6], [5e7, 1], [1e10, .85]], VC: [[1e5, 1.6], [5e7, 1], [1e10, .85]], NV: [[1e5, 1.3], [2e6, 1], [1e10, .85]] };
  const YN = { Eh: [[1e3, 2.5], [3e6, 1], [1e10, .85]], VA: [[1e4, 2.5], [3e6, 1], [1e10, .85]], VC: [[1e4, 2.5], [3e6, 1], [1e10, .85]], NV: [[1e3, 1.6], [3e6, 1], [1e10, .85]] };
  function curve(pts, N) {
    if (!(N > pts[0][0])) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [n0, v0] = pts[i - 1], [n1, v1] = pts[i];
      if (N <= n1) return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * Math.log(N / n0) / Math.log(n1 / n0));
    }
    return pts[pts.length - 1][1];
  }
  function curveT(pts, N) { return clamp(Math.log(N / pts[0][0]) / Math.log(pts[1][0] / pts[0][0]), 0, 1); }
  // inverse: N at which curve(N) = v (∞ if v below floor)
  function curveInv(pts, v) {
    if (v >= pts[0][1]) return pts[0][0] * (v > pts[0][1] * 1.000001 ? 0 : 1);
    for (let i = 1; i < pts.length; i++) {
      const [n0, v0] = pts[i - 1], [n1, v1] = pts[i];
      if (v >= v1) return n0 * Math.exp(Math.log(n1 / n0) * Math.log(v / v0) / Math.log(v1 / v0));
    }
    return Infinity;
  }

  function material(m, quality, reliability) {
    const f = FAMILY[m.family];
    const out = { family: m.family, label: f ? f.label : '?', warnings: [], quality };
    if (!f) { out.error = '지원하지 않는 재료'; return out; }
    const hv = pos(m.surfaceHV) ? m.surfaceHV : hrc2hv(m.surfaceHRC);
    const core = pos(m.coreHV) ? m.coreHV : hrc2hv(m.coreHRC);
    const r = f.hv[quality];
    let used = hv;
    if (hv > r[1]) { used = r[1]; out.warnings.push(`표면 ${hv.toFixed(0)} HV는 ISO 표 범위(${r[0]}~${r[1]} HV)를 넘어 ${r[1]} HV 끝점 값을 씁니다`); }
    if (hv < r[0]) { used = r[0]; out.warnings.push(`표면 ${hv.toFixed(0)} HV는 ISO 표 범위 아래입니다 · ${r[0]} HV 값을 쓰며 실제는 더 낮을 수 있습니다`); }
    const L = f.lines[quality];
    out.Hlim = L[0] * used + L[1];
    out.Flim = L[2] * used + L[3];
    if (m.family === 'Eh' && quality === 'MQ' && core >= 310) out.Flim = 500;
    out.HlimISO = out.Hlim; out.FlimISO = out.Flim;
    // reliability: ISO values are 1 % failure probability. Median = ×exp(2.326·σln) under a log-normal scatter assumption.
    if (reliability && reliability.mode === 'median') {
      out.Hlim *= Math.exp(2.326 * reliability.covH);
      out.Flim *= Math.exp(2.326 * reliability.covF);
    }
    Object.assign(out, { E: f.E, nu: f.nu, rho: f.rho, slip: f.slip, hv, hvUsed: used, core, depth: m.depth });
    // case depth adequacy (Hertz max shear depth checked later per mesh)
    return out;
  }

  // ------------------------------------------------------------ geometry
  function dims(z, m, beta, internal) {
    const b = Math.abs(beta) * rad, mt = m / Math.cos(b), d = mt * z;
    return { z, m, beta: b, mt, d, da: d + (internal ? -2 : 2) * m, df: d + (internal ? 2 : -2) * TOOL.hfp * m, h: (TOOL.hap + TOOL.hfp) * m, internal };
  }
  function contactPointFactors(t1, t2, z1, z2, ea, aw) {
    const a = (t1 - 2 * Math.PI / z1) * (t2 - (ea - 1) * 2 * Math.PI / z2);
    const b = (t2 - 2 * Math.PI / z2) * (t1 - (ea - 1) * 2 * Math.PI / z1);
    return [a > 0 ? Math.tan(aw) / Math.sqrt(a) : NaN, b > 0 ? Math.tan(aw) / Math.sqrt(b) : NaN];
  }
  function workingAngle(at, an, xsum, den) {
    const target = inv(at) + 2 * Math.tan(an) * xsum / den;
    if (xsum === 0) return at;
    if (!(target > 0)) return NaN;
    let lo = 0, hi = Math.PI / 2 - 1e-6;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (inv(mid) < target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  const ringTeeth = st => st.r ?? st.s + 2 * st.p;

  function geometry(st, opts = {}) {
    const { s, p, m, beta, n } = st, r = ringTeeth(st);
    const widths = [st.bSun ?? st.b, st.b, st.bRing ?? st.b];
    const x = [st.xs || 0, st.xp || 0, st.xr || 0];
    const an = (st.alpha || 20) * rad, br = Math.abs(beta) * rad;
    const at = Math.atan(Math.tan(an) / Math.cos(br)), bb = Math.asin(Math.sin(br) * Math.cos(an));
    const errors = [], warns = [], checks = [];
    const chk = (k, v, ok, note) => checks.push({ k, v, ok, note });
    if (![s, p, r, n].every(v => Number.isInteger(v) && v > 0) || !pos(m) || !pos(st.b)) { errors.push('잇수·유성 개수·모듈·치폭을 확인하세요'); return { errors, warns, checks, parts: [], meshes: [] }; }
    const parts = [s, p, r].map((z, i) => {
      const g = dims(z, m, beta, i === 2), dx = 2 * m * x[i];
      const da = g.da + dx, df = g.df + dx, db = g.d * Math.cos(at);
      const aa = Math.acos(Math.min(1, db / da));
      const th = Math.PI / 2 + (g.internal ? -2 : 2) * x[i] * Math.tan(an);
      const sa = da * (th / z + (g.internal ? -1 : 1) * (inv(at) - inv(aa))) * Math.cos(br);
      // tip chamfer hK (45°): the active tip form diameter dFa replaces da for contact ratio and load point
      const hK = Math.max(0, +((st.tipChamfer || [])[i]) || 0), dFa = g.internal ? da + 2 * hK : da - 2 * hK;
      return { ...g, da, dFa, hK, df, db, x: x[i], width: widths[i], tipThickness: sa, name: NAMES[i] };
    });
    const meshes = [false, true].map(internal => {
      const a = internal ? parts[1] : parts[0], c = internal ? parts[2] : parts[1], sign = internal ? -1 : 1;
      const aw = workingAngle(at, an, a.x + sign * c.x, a.z + sign * c.z);
      const center = Math.abs(a.db + sign * c.db) / (2 * Math.cos(aw));
      const b = Math.min(a.width, c.width);
      const r1 = a.dFa * a.dFa - a.db * a.db, r2 = c.dFa * c.dFa - c.db * c.db;
      const path = (Math.sqrt(r1) + sign * Math.sqrt(r2)) / 2 - sign * center * Math.sin(aw);
      const pbt = Math.PI * a.mt * Math.cos(at);
      const ea = path / pbt, eb = b * Math.sin(br) / (Math.PI * m), eg = ea + eb, ean = ea / Math.cos(bb) ** 2;
      // addendum contact ratios (for efficiency)
      const e1 = (Math.sqrt(r1) / 2 - a.db / 2 * Math.tan(aw)) / pbt;
      const e2 = ea - e1;
      const u = sign * c.z / a.z;
      const ZH = Math.sqrt(2 * Math.cos(bb) * Math.cos(aw) / (Math.cos(at) ** 2 * Math.sin(aw)));
      const Zeps = eb < 1 ? Math.sqrt((4 - ea) / 3 * (1 - eb) + eb / ea) : Math.sqrt(1 / ea);
      const Zbeta = 1 / Math.sqrt(Math.cos(br));
      const rr1 = a.db * Math.tan(aw) / 2, rr2 = c.db * Math.tan(aw) / 2, rho = Math.abs(rr1 * rr2 / (rr1 + sign * rr2));
      const t1 = Math.sqrt(r1) / a.db, t2 = Math.sqrt(r2) / c.db;
      const [fM, sM] = contactPointFactors(t1, t2, a.z, sign * c.z, ea, aw);
      const pinionFirst = internal || a.z <= c.z;
      const M1 = pinionFirst ? fM : sM, M2 = internal ? 1 : (pinionFirst ? sM : fM);
      const use2019 = ea > 1 && ea <= 2 && br > 0;   // helical fZCa also for the planet in the internal mesh (KISSsoft: ZB 1.10)
      const mod = st.mod || {};
      const fZCa = use2019 ? (mod.verified === 'qualified' ? 1.07 : mod.verified === 'uniform' ? 1 : 1.2) : 1;
      const join = M => eb >= 1 ? Math.sqrt(fZCa) : Math.max(1, M) * (1 - eb) + Math.sqrt(fZCa) * eb;
      const ZB = join(M1), ZD = internal ? 1 : join(M2);
      return { internal, a, c, sign, center, aw, at, an, bb, beta: br, m, b, ea, eb, eg, ean, e1, e2, u, ZH, Zeps, Zbeta, rho, M1, M2, ZB, ZD, pinionFirst, fZCa, pbt, label: internal ? '유성–링' : '썬–유성' };
    });
    const [sp, pr] = meshes;
    const ratio = 1 + r / s;
    chk('등간격 조립 (S+R)/Np', (s + r) / n, (s + r) % n === 0);
    if ((s + r) % n) errors.push('유성 등간격 조립 불가: (S+R)/Np가 정수가 아닙니다');
    chk('외접·내접 중심거리 차 (mm)', sp.center - pr.center, Math.abs(sp.center - pr.center) < 1e-4, '전위로 맞춥니다');
    if (Math.abs(sp.center - pr.center) >= 1e-4) errors.push('외접·내접 작용 중심거리가 다릅니다 · "링 전위 자동"을 쓰세요');
    const gap = 2 * sp.center * Math.sin(Math.PI / n) - parts[1].da;
    chk('인접 유성 이끝 간격 (mm)', gap, gap > 0.5 * m);
    if (!(gap > 0)) errors.push('인접 유성이 간섭합니다');
    chk('썬–유성 εα', sp.ea, sp.ea >= 1.2, '1.2 이상 권장');
    chk('유성–링 εα', pr.ea, pr.ea >= 1.2, '1.2 이상 권장');
    chk('축방향 물림률 εβ', sp.eb, sp.eb === 0 || sp.eb >= 1, '0 또는 1 이상 권장');
    if (sp.eb > 0 && sp.eb < 1) warns.push(`εβ ${sp.eb.toFixed(2)}: 헬리컬 축추력은 생기지만 ZB·ZD 이득이 작은 구간입니다 (0 또는 ≥1 권장)`);
    parts.forEach((g, i) => { const ok = g.tipThickness >= 0.4 * m; chk(g.name + ' 이끝 두께 (mm)', g.tipThickness, ok, '표면경화 0.4m 이상'); if (!(g.tipThickness > 0)) errors.push(g.name + ' 이끝이 뾰족합니다'); });
    const undercut = parts.slice(0, 2).some(g => g.z / Math.cos(br) ** 3 < 2 * (1 - g.x) / Math.sin(an) ** 2);
    chk('외접 언더컷', undercut ? '발생' : '없음', !undercut);
    if (undercut) warns.push('언더컷 가능 · 전위를 늘리거나 잇수를 늘리세요');
    const ringAlpha = Math.acos(pr.c.db / parts[2].dFa);
    const margin = p / r - 1 + Math.tan(ringAlpha) / Math.tan(pr.aw);
    chk('내접 인볼류트 간섭 여유', margin, margin >= 0);
    if (margin < 0) errors.push('내접 인볼류트 간섭');
    const clr = Math.min(sp.center - (parts[0].da + parts[1].df) / 2, sp.center - (parts[1].da + parts[0].df) / 2, (parts[2].df - parts[1].da) / 2 - pr.center, (parts[2].da - parts[1].df) / 2 - pr.center);
    chk('이끝·이뿌리 최소 간극 (mm)', clr, clr >= 0.15 * m);
    if (!(clr > 0)) errors.push('이끝·이뿌리 간극이 없습니다');
    [sp, pr].forEach(ms => { if (!(ms.ea >= 1 && ms.ea <= 2.5)) errors.push(ms.label + ' 물림률이 계산 범위 밖입니다'); });
    return { parts, meshes, ratio, at, an, bb, br, errors, warns, checks, r };
  }
  // Required ring-minus-planet shift at the external working centre distance.
  function ringShiftOffset(st, sum) {
    const outer = st.s + st.p, inner = ringTeeth(st) - st.p;
    if (!(outer > 0 && inner > 0)) return NaN;
    if (inner === outer) return sum;
    const an = (st.alpha || 20) * rad;
    const at = Math.atan(Math.tan(an) / Math.cos(st.beta * rad));
    const aw = workingAngle(at, an, sum, outer);
    const cosInternal = inner / outer * Math.cos(aw);
    if (!(cosInternal > 0 && cosInternal <= 1)) return NaN;
    return inner * (inv(Math.acos(cosInternal)) - inv(at)) / (2 * Math.tan(an));
  }

  function matchRingShift(st) {
    const xp = st.xp || 0;
    const offset = ringShiftOffset(st, (st.xs || 0) + xp);
    return fin(offset) ? xp + offset : 0;
  }

  function sharedStage(first, second) {
    const stage = { ...second, m: first.m, beta: first.beta, alpha: first.alpha };
    if (first.r == null) {
      stage.r = null;
      stage.p = (ringTeeth(first) - stage.s) / 2;
    } else {
      stage.r = ringTeeth(first);
      stage.xr = first.autoRingShift ? matchRingShift(first) : first.xr;
      stage.autoRingShift = false;
    }
    return stage;
  }

  // ------------------------------------------------------------ profile-shift map (단별 썬·유성 전위 평면)
  // Each point: coaxial ring shift solved (or the shared ring's shift kept → 1-D curve), geometry checks
  // (center distance, undercut, tip thickness, interference, tip/root clearance, planet gap, εα ≥ 1.2) and the
  // specific sliding at the start/end of contact. Uses the standard basic rack of the engine (no tool data).
  function slidingOf(ms) {
    const a = ms.a, c = ms.c, T = ms.center * Math.sin(ms.aw), sgn = ms.internal ? -1 : 1, u = c.z / a.z;
    const ra1 = a.dFa / 2, rb1 = a.db / 2, ra2 = c.dFa / 2, rb2 = c.db / 2;
    const r1E = Math.sqrt(Math.max(0, ra1 * ra1 - rb1 * rb1)), r2E = sgn > 0 ? T - r1E : r1E + T;
    const r2A = Math.sqrt(Math.max(0, ra2 * ra2 - rb2 * rb2)), r1A = sgn > 0 ? T - r2A : r2A - T;
    const z1A = 1 - r2A / (r1A * u), z2E = 1 - r1E * u / r2E;   // pinion root (A) · wheel root (E)
    return { z1A, z2E, bal: Math.abs(z1A - z2E), max: Math.max(Math.abs(z1A), Math.abs(z2E)) };
  }
  function shiftPoint(st, xs, xp, xr) {
    const s2 = { ...st, xs, xp, xr, autoRingShift: false }, g = geometry(s2);
    const bad = g.checks.filter(c => !c.ok && !/축방향 물림률/.test(c.k));
    const ok = !g.errors.length && !bad.length && g.parts.every(p => p.tipThickness >= .4 * p.m);
    const why = g.errors[0] || bad[0]?.k || (ok ? '' : '이끝 두께 < 0.4m');
    const sl = g.meshes.map(slidingOf);
    return { xs, xp, xr, ok, why, ea: g.meshes.map(ms => ms.ea), san: Math.min(...g.parts.map(p => p.tipThickness / p.m)), sl, bal: sl[0].bal + .5 * sl[1].bal };   // 외접 균형 우선, 내접은 절반 가중
  }
  function shiftMap(D, i, opt = {}) {
    const step = opt.step || .05, lo = opt.lo ?? -.5, hi = opt.hi ?? 1;
    const shared = i === 1 && D.config.sharedRing, st = shared ? sharedStage(D.stages[0], D.stages[1]) : { ...D.stages[i] };
    const fixedRing = shared && D.stages[0].r != null, pts = [], vals = [];
    for (let v = lo; v <= hi + 1e-9; v += step) vals.push(+v.toFixed(4));
    if (fixedRing) {
      // the physical ring (teeth and shift) is set by stage 1: for each planet shift solve the sun shift that keeps both centres equal
      const xr = st.xr;
      for (const xp of vals) {
        let a = -2, b = 3, fa = xp + ringShiftOffset(st, a) - xr;
        for (let k = 0; k < 60; k++) { const m = (a + b) / 2, fm = xp + ringShiftOffset(st, m) - xr; if (!Number.isFinite(fm)) { b = m; continue; } if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; }
        const xs = +((a + b) / 2 - xp).toFixed(4);
        if (xs >= lo - 1e-9 && xs <= hi + 1e-9) pts.push(shiftPoint(st, xs, xp, xr));
      }
    } else for (const xs of vals) for (const xp of vals) { const xr = matchRingShift({ ...st, xs, xp }); pts.push(shiftPoint(st, xs, xp, xr)); }
    const cur = { xs: st.xs || 0, xp: st.xp || 0, xr: st.autoRingShift ? matchRingShift(st) : st.xr };
    return { stage: i + 1, mode: fixedRing ? 'curve' : 'plane', lo, hi, step, vals, pts, cur };
  }
  // Recommend shifts on the map. objective: 'slide' (balanced specific sliding, geometry only),
  // 'cap' (largest allowable output torque of this stage) or 'bend' (equal root safety sun / planet), both by the full engine.
  function shiftCandidates(D, i, objective, opt = {}) {
    const map = shiftMap(D, i, { step: opt.step || (objective === 'slide' ? .05 : .1) });
    let ok = map.pts.filter(p => p.ok);
    if (objective === 'slide') return { map, list: ok.sort((a, b) => a.bal - b.bal || b.san - a.san).slice(0, opt.top || 5).map(p => ({ ...p, score: p.bal })) };
    return { map, list: ok };
  }
  function shiftScore(D, i, p) {
    const T = JSON.parse(JSON.stringify(D)), st = T.stages[i];
    Object.assign(st, { xs: p.xs, xp: p.xp, xr: p.xr, autoRingShift: false });
    const ctx = prepare(T); if (ctx.errors.length) return { ...p, ok: false, why: ctx.errors[0] };
    const op = { rpm: T.req.rpm, cycles: cyclesFor(T.req.lifeH) }, cap = capacity(ctx, op, T.req, i + 1);
    const rows = evaluate(ctx, { ...op, Tout: T.req.Trated }).rows.filter(r => r.stage === i + 1);
    const SF = part => Math.min(...rows.filter(r => r.part === part).map(r => r.SF));
    const sfS = SF(0), sfP = SF(1);
    return { ...p, cap, sfS, sfP, bendBal: Math.abs(sfS - sfP) / Math.min(sfS, sfP) };
  }

  function rim(g, bore) {
    // empty (null) = automatic rim; 0 on an external gear = solid body (no bore)
    if (!g.internal && bore === 0) return { YB: 1, diameter: 0, sR: g.df / 2, ratio: Infinity, assumed: false, solid: true };
    const assumed = !pos(bore);
    const value = assumed ? (g.internal ? g.df + 8 * g.m : Math.max(0, g.df - 2 * 1.2 * g.h)) : bore;
    const sR = g.internal ? (value - g.df) / 2 : (g.df - value) / 2;
    const ratio = sR / (g.internal ? g.m : g.h), solid = g.internal ? 3.5 : 1.2, thr = g.internal ? 1.75 : .5;
    if (!(ratio > thr)) return { YB: NaN, diameter: value, sR, ratio, assumed, error: '림이 너무 얇습니다 (ISO 범위 밖)' };
    const YB = ratio >= solid * (1 - 1e-9) ? 1 : (g.internal ? 1.15 * Math.log(8.324 / ratio) : 1.6 * Math.log(2.242 / ratio));
    return { YB: Math.max(1, YB), diameter: value, sR, ratio, assumed };
  }

  function rootFactors(g, mesh, rho = .38, hfp = 1.25, cutter = null) {
    if (g.internal) return internalRootFactors(g, mesh, rho, hfp, cutter || {});
    const an = mesh.an, sign = g.internal ? -1 : 1;
    const zn = sign * g.z / (Math.cos(mesh.bb) ** 2 * Math.cos(g.beta)), dn = zn * g.m, dbn = dn * Math.cos(an);
    const dan = dn + sign * (g.dFa ?? g.da) - sign * g.d;
    const rv = g.internal ? rho + (hfp - rho) ** 1.95 / (3.156 * 1.036 ** cutter) : rho;
    const E = Math.PI / 4 - hfp * Math.tan(an) - (1 - Math.sin(an)) * rv / Math.cos(an), G = rv - hfp + (g.x || 0);
    const tau = g.internal ? Math.PI / 6 : Math.PI / 3, H = 2 / zn * (Math.PI / 2 - E) - tau;
    let th = g.internal ? Math.PI / 3 : Math.PI / 6, ok = false;
    for (let k = 0; k < 80; k++) { const nx = 2 * G / zn * Math.tan(th) - H; if (Math.abs(nx - th) < 1e-12) { th = nx; ok = true; break; } th = nx; }
    const sF = zn * Math.sin(tau - th) + (g.internal ? 1 : Math.sqrt(3)) * (G / Math.cos(th) - rv);
    const rf = rv + 2 * G * G / (Math.cos(th) * (zn * Math.cos(th) ** 2 - 2 * G));
    const rTip = sign * Math.sqrt(dan * dan - dbn * dbn) / 2, rLoad = rTip - (mesh.ean - 1) * Math.PI * g.m * Math.cos(an);
    const den = sign * Math.sqrt(dbn * dbn + 4 * rLoad * rLoad), ae = Math.acos(dbn / den);
    const gamma = (Math.PI / 2 + 2 * (g.x || 0) * Math.tan(an)) / zn + inv(an) - inv(ae), af = ae - gamma;
    const h = .5 * ((Math.cos(gamma) - Math.sin(gamma) * Math.tan(af)) * den / g.m - zn * Math.cos(tau - th) - (g.internal ? Math.sqrt(3) : 1) * (G / Math.cos(th) - rv));
    const L = sF / h, qs = sF / (2 * rf);
    const eb = Math.min(mesh.eb, 1), fe = mesh.eb === 0 ? (mesh.ea < 2 ? 1 : .7) : Math.sqrt((mesh.ean < 2 ? 1 - eb : (1 - eb) / 2) + eb / mesh.ean);
    const YF = 6 * h * Math.cos(af) / (sF * sF * Math.cos(an)) * fe;
    const YS = (1.2 + .13 * L) * qs ** (1 / (1.21 + 2.3 / L));
    const Ybeta = (1 - Math.min(mesh.eb, 1) * Math.min(g.beta / rad, 30) / 120) / Math.cos(g.beta) ** 3;
    const error = !ok || ![sF, rf, h, YF, YS].every(pos) || !fin(af) || qs < 1 || qs > 8 ? '치근 형상계수 계산 범위 밖' : null;
    return { YF, YS, Ybeta, qs, L, sFn: sF * g.m, rhoF: rf * g.m, hFe: h * g.m, aFen: af, x: g.x, error, source: 'ISO 6336-3 방법 B' };
  }


  // Internal gear (ISO 6336-3:2019 §6.2.5 idea, exact form): the root is generated by a pinion-type cutter (z0, x0, tip
  // radius ρa0 = ρfP*·m, addendum hfP*·m). The fillet is the envelope of the cutter's tip-corner circle in the gear frame;
  // the critical section is where the fillet tangent makes 60° with the tooth centre line. Load at the single-contact point
  // nearest the internal tooth tip, along the line of action. Checked against KISSsoft (z 98, x −0.62, z0 32): YF 1.03, YS 2.50.
  const invSolve = t => { let lo = 0, hi = 1.5; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (inv(mid) < t) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const IRF_CACHE = new Map();
  function internalRootFactors(g, mesh, rho, hfp, cut) {
    const an = mesh.an, cb = Math.cos(mesh.bb), m = g.m;
    const z2 = g.z / (cb * cb * Math.cos(g.beta)), x2 = g.x || 0;          // virtual spur internal gear (our sign: +x = thinner tooth)
    const z0 = Math.max(10, Math.round(pos(cut.z0) ? cut.z0 : 0.33 * g.z)), x0 = fin(cut.x0) ? cut.x0 : 0;
    const zn0 = z0 / (cb * cb * Math.cos(g.beta));
    const key = [z2, x2, m, an, zn0, x0, rho, hfp, mesh.ean, g.dFa ?? g.da, g.d, mesh.a?.z].map(v => fin(v) ? v.toFixed(6) : v).join('|');
    if (IRF_CACHE.has(key)) return IRF_CACHE.get(key);
    const r0 = m * zn0 / 2, r2 = m * z2 / 2, rb0 = r0 * Math.cos(an), rb2 = r2 * Math.cos(an);
    const aw0 = invSolve(inv(an) + 2 * Math.tan(an) * (x2 - x0) / (z2 - zn0));
    const a0 = (r2 - r0) * Math.cos(an) / Math.cos(aw0);
    const etab = (Math.PI / 2 + 2 * x0 * Math.tan(an)) / zn0 + inv(an);
    const ra0 = r0 + m * (hfp + x0), rhoA = rho * m, rc = ra0 - rhoA;
    const phic = etab - inv(Math.acos(Math.min(1, rb0 / rc))) - rhoA / rb0;
    const k = (z2 - zn0) / zn0, tz = Math.PI / z2, cR = Math.cos(-tz), sR = Math.sin(-tz);
    const corner = (t, sg) => { const cx = -a0 * Math.sin(t), cy = a0 * Math.cos(t), ang = Math.PI / 2 - k * t + sg * phic; return [cx + rc * Math.cos(ang), cy + rc * Math.sin(ang), cx, cy]; };
    const env = (t, sg, sn) => { const h = 1e-7, p = corner(t, sg), q = corner(t + h, sg), r = corner(t - h, sg), tx = q[0] - r[0], ty = q[1] - r[1], L = Math.hypot(tx, ty) || 1e-30;
      const x = p[0] + rhoA * sn * ty / L, y = p[1] - rhoA * sn * tx / L; return [x * cR - y * sR, x * sR + y * cR]; };
    // gear boundary in the tooth-local frame (tooth centre line = +y, generating space centred at angle tz to the right):
    // the farthest point reached by the corner envelope at each polar angle
    const nb = 3000, bins = new Array(nb + 1);
    for (const sg of [1, -1]) for (let i = -6000; i <= 6000; i++) {
      const t = .5 * i / 6000;
      for (const sn of [1, -1]) { const [X, Y] = env(t, sg, sn), ph = Math.atan2(X, Y); if (ph < 0 || ph > tz) continue;
        const bi = Math.round(ph / tz * nb), rr = Math.hypot(X, Y), cur = bins[bi]; if (!cur || rr > cur[2]) bins[bi] = [X, Y, rr, t, sg, sn]; }
    }
    const curve = bins.filter(Boolean);
    let best = null;
    // the 60° tangent lies on the generated fillet just above the root circle (a0 + ra0); points farther in belong to the
    // flank or to cutter positions that do not bound the space
    const rRoot = a0 + ra0, rMin = rRoot - .6 * m;
    for (let i = 4; i < curve.length - 4; i++) { if (curve[i][2] < rMin) continue; const Q = curve[i], a = env(Q[3] - 1e-5, Q[4], Q[5]), c = env(Q[3] + 1e-5, Q[4], Q[5]), ang = Math.atan2(Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1])) / rad, d = Math.abs(ang - 60); if (!best || d < best.d) best = { d, i }; }
    const fail = { YF: NaN, YS: NaN, Ybeta: 1, qs: NaN, L: NaN, error: '내접 치근 형상계수 계산 범위 밖', source: 'ISO 6336-3:2019 내치 (피니언 커터 생성)' };
    if (!best || best.d > 3) { IRF_CACHE.set(key, fail); return fail; }
    const P = curve[best.i], hh = 2e-4, e0 = env(P[3] - hh, P[4], P[5]), e2 = env(P[3] + hh, P[4], P[5]);
    const circ = (a, b, c) => { const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (!d) return Infinity;
      const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d,
        uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d; return Math.hypot(a[0] - ux, a[1] - uy); };
    const rhoF = circ(e0, [P[0], P[1]], e2), sFn = 2 * Math.abs(P[0]);
    // load point: single contact nearest the internal tooth tip, one (εα − 1) base pitch beyond the tip along the line of action
    // virtual spur gear tip: dan = dn + (dFa − d) (internal: tip lies inside d)
    const ra2 = (z2 * m + Math.abs(g.dFa ?? g.da) - Math.abs(g.d)) / 2, tipLen = Math.sqrt(Math.max(0, ra2 * ra2 - rb2 * rb2));
    const rL = Math.hypot(rb2, tipLen + (mesh.ean - 1) * Math.PI * m * Math.cos(an)), aL = Math.acos(Math.min(1, rb2 / rL));
    const half = (Math.PI / 2 - 2 * x2 * Math.tan(an)) / z2 - inv(an) + inv(aL);
    const Lp = [rL * Math.sin(half), rL * Math.cos(half)], tg = [Math.cos(half), -Math.sin(half)], rd = [Math.sin(half), Math.cos(half)];
    const nrm = [tg[0] * Math.cos(aL) - rd[0] * Math.sin(aL), tg[1] * Math.cos(aL) - rd[1] * Math.sin(aL)];
    const yL = Lp[1] - Lp[0] / nrm[0] * nrm[1], hFe = Math.abs(P[1] - yL), aFen = Math.atan2(Math.abs(nrm[1]), Math.abs(nrm[0]));
    const fe = mesh.eb === 0 ? (mesh.ea < 2 ? 1 : .7) : Math.sqrt((mesh.ean < 2 ? 1 - Math.min(mesh.eb, 1) : (1 - Math.min(mesh.eb, 1)) / 2) + Math.min(mesh.eb, 1) / mesh.ean);
    const YF = 6 * (hFe / m) * Math.cos(aFen) / ((sFn / m) ** 2 * Math.cos(an)) * fe;
    const L = sFn / hFe, qs = sFn / (2 * rhoF), YS = (1.2 + .13 * L) * qs ** (1 / (1.21 + 2.3 / L));
    const Ybeta = (1 - Math.min(mesh.eb, 1) * Math.min(g.beta / rad, 30) / 120) / Math.cos(g.beta) ** 3;
    const error = ![sFn, rhoF, hFe, YF, YS].every(pos) || qs < 1 || qs > 8 ? '내접 치근 형상계수 계산 범위 밖' : null;
    const out = { YF, YS, Ybeta, qs, L, sFn, rhoF, hFe, aFen, x: x2, z0, x0, a0, error, source: `ISO 6336-3:2019 내치 · 피니언 커터 z0 ${z0}, x0 ${x0} 생성 형상 (60° 접선)` };
    IRF_CACHE.set(key, out); return out;
  }

  // ------------------------------------------------------------ load-factor models
  function meshStiffness(mesh, m1, m2, line) {
    const cb3 = Math.cos(mesh.beta) ** 3;
    const z1 = (mesh.internal ? mesh.a.z : Math.min(mesh.a.z, mesh.c.z)) / cb3;
    const z2 = mesh.internal ? Infinity : Math.max(mesh.a.z, mesh.c.z) / cb3;
    // ISO 6336-1 method B, q' with profile-shift terms (internal gear: zn2 = ∞, x2 in the ISO sign = −x of our convention)
    const x1 = mesh.internal ? mesh.a.x : (mesh.a.z <= mesh.c.z ? mesh.a.x : mesh.c.x), x2 = mesh.internal ? -mesh.c.x : (mesh.a.z <= mesh.c.z ? mesh.c.x : mesh.a.x);
    const q = .04723 + .15551 / z1 + (z2 === Infinity ? 0 : .25791 / z2) - .00635 * x1 - .11654 * x1 / z1 - .00193 * x2 - (z2 === Infinity ? 0 : .24188 * x2 / z2) + .00529 * x1 * x1 + .00182 * x2 * x2;
    const CB = 1 + .5 * (1.2 - TOOL.hfp), E = 2 * m1.E * m2.E / (m1.E + m2.E);
    const cp = .8 * CB * Math.cos(mesh.beta) / q * (E / 206000) * Math.min(1, (line / 100) ** .25);
    return { cp, cg: cp * (.75 * mesh.ea + .25), cb: cp * (.75 * mesh.ea + .25) * .85 };
  }
  function dynamicFactor(N, line, eg, Bp, Bf, Bk) {
    const Ns = line < 100 ? .5 + .35 * Math.sqrt(line / 100) : .85;
    const cv2 = eg <= 2 ? .34 : .57 / (eg - .3), cv3 = eg <= 2 ? .23 : .096 / (eg - 1.56), cv4 = eg <= 2 ? .9 : (.57 - .05 * eg) / (eg - 1.44);
    const res = .32 * Bp + cv2 * Bf + cv4 * Bk + 1;
    const cv6 = eg <= 2 ? .47 : .12 / (eg - 1.74), cv7 = eg <= 1.5 ? .75 : eg <= 2.5 ? .125 * Math.sin(Math.PI * (eg - 2)) + .875 : 1;
    const sup = .47 * Bp + cv6 * Bf + cv7;
    let raw, region;
    if (N <= Ns) { raw = 1 + N * (.32 * Bp + cv2 * Bf + cv3 * Bk); region = '아임계'; }
    else if (N <= 1.15) { raw = res; region = '공진'; }
    else if (N < 1.5) { raw = sup + (res - sup) * (1.5 - N) / .35; region = '중간'; }
    else { raw = sup; region = '초임계'; }
    return { Kv: Math.max(1, region === '공진' ? raw : Math.min(raw, 2)), N, region };
  }
  function faceLoad(mean, cb, gap, crown) {
    if (!(crown > 1e-8)) {
      const full = gap === 0 || mean >= cb * gap / 2;
      const delta = full ? mean / cb + gap / 2 : Math.sqrt(2 * mean * gap / cb);
      const frac = full ? 1 : delta / gap;
      return { KHb: cb * delta / mean, frac };
    }
    const a = 4 * crown, b = gap - a, vtx = clamp(-b / (2 * a), 0, 1);
    const prof = x => gap * x + 4 * crown * (x - .5) ** 2;
    const interval = d => { const c = crown - d, disc = b * b - 4 * a * c; if (disc <= 0) return [0, 0]; const q = -(b + (b >= 0 ? 1 : -1) * Math.sqrt(disc)) / 2; return [clamp(Math.min(q / a, c / q), 0, 1), clamp(Math.max(q / a, c / q), 0, 1)]; };
    const integ = d => { const [lo, hi] = interval(d); return hi > lo ? cb * (hi - lo) * (6 * d - prof(lo) - 4 * prof((lo + hi) / 2) - prof(hi)) / 6 : 0; };
    let lo = prof(vtx), hi = gap + crown + mean / cb;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (integ(mid) < mean) lo = mid; else hi = mid; }
    const d = (lo + hi) / 2, [s, e] = interval(d);
    return { KHb: cb * Math.max(0, d - prof(vtx)) / mean, frac: e - s };
  }
  function runin(mat, dev, v, face) {
    if (!pos(mat.HlimISO)) return 0;
    if (mat.family === 'NV' || mat.family === 'Eh') return Math.min((face ? .15 : .075) * dev, face ? 6 : 3, dev);
    const cap = v <= 5 ? Infinity : (v <= 10 ? (face ? 25600 : 12800) : (face ? 12800 : 6400)) / mat.HlimISO;
    return Math.min((face ? 320 : 160) / mat.HlimISO * dev, cap, dev);
  }
  const carrierGeometry = typeof module !== 'undefined' && module.exports ? require('./carrier-geometry.js') : root.PGDCarrier;
  const PIN_E = { SUJ2: 210000, SCM440: 206000, S45C: 206000 };
  function pinModel(sup, shape, force, moment) {
    const d = shape.diameter, E = PIN_E[sup.material] || 206000, I = Math.PI * d ** 4 / 64;
    const single = !shape.double, [lo, hi] = shape.loadInterval, b = hi - lo;
    const L = shape.span, a = shape.loadStart, n = 24;
    const green = (x, t) => { if (single) { const lo = Math.min(x, t), hi = Math.max(x, t); return lo ** 2 * (3 * hi - lo) / (6 * E * I); } return x <= t ? (L - t) * x * (L * L - (L - t) ** 2 - x * x) / (6 * L * E * I) : t * (L - x) * (L * L - t * t - (L - x) ** 2) / (6 * L * E * I); };
    const nodes = Array.from({ length: n }, (_, j) => a + b * (j + .5) / n), mid = a + b / 2;
    const mn = nodes.reduce((s, t) => s + (t - mid) ** 2, 0);
    const ys = [], zs = [];
    for (let j = 0; j <= 10; j++) {
      const z = a + b * j / 10; let y = 0, yr = 0;
      for (const t of nodes) { y += green(z, t) * force / n; yr += green(z, t) * moment * (t - mid) / mn; }
      ys.push([y, yr]); zs.push(z);
    }
    const zm = zs.reduce((s, z) => s + z, 0) / zs.length, zz = zs.reduce((s, z) => s + (z - zm) ** 2, 0);
    const slope = k => { const m = ys.reduce((s, y) => s + y[k], 0) / ys.length; return zs.reduce((s, z, i) => s + (z - zm) * (ys[i][k] - m), 0) / zz; };
    const tilt = slope(0), mtilt = slope(1);
    // bow over the face width: deviation of the deflection line from its best-fit straight line (ISO 6336-1 annex D idea)
    // pins pressed into both plates bend as built-in (fixed–fixed) beams; a cantilever pin as a cantilever
    const fixed = (x, t) => { const A = x <= t ? t : L - t, B = L - A, X = x <= t ? x : L - x; return B * B * X * X * (3 * A * L - (3 * A + B) * X) / (6 * L ** 3 * E * I); };
    const bowY = zs.map(z => nodes.reduce((s, t) => s + (single ? green(z, t) : fixed(z, t)) * force / n, 0));
    const bm = bowY.reduce((s, y) => s + y, 0) / bowY.length, bs = zs.reduce((s, z, i) => s + (z - zm) * (bowY[i] - bm), 0) / zz;
    const resid = bowY.map((y, i) => y - bm - bs * (zs[i] - zm)), bow = Math.max(...resid) - Math.min(...resid);
    const left = single ? 1 : 1 - mid / L, right = single ? 0 : mid / L;
    const c = L - a - b, m0 = left * a, k = -1 / (2 * b);
    // Integrate the squared unit-load bending moment for mean compliance.
    // Double support can be asymmetric when the blind hole stops in the far plate.
    const energy = single ? a ** 3 / 3 + a ** 2 * b / 2 + a * b ** 2 / 4 + b ** 3 / 20 :
      left ** 2 * a ** 3 / 3 + right ** 2 * c ** 3 / 3 + m0 ** 2 * b + m0 * left * b ** 2
      + (left ** 2 + 2 * m0 * k) * b ** 3 / 3 + left * k * b ** 4 / 2 + k ** 2 * b ** 5 / 5;
    const compliance = energy / (E * I), Mmax = force * (single ? mid : m0 + b * left ** 2 / 2);
    return { tilt, mtilt, bow, meanDefl: force * compliance, compliance, sigma: Math.hypot(Mmax, Math.abs(moment)) * 32 / (Math.PI * d ** 3), span: L, reactions: single ? [1] : [left, right] };
  }

  // ------------------------------------------------------------ preparation
  function prepare(D) {
    const errors = [], warns = [];
    const q = D.design.quality, rel = D.reliability;
    const stages = D.stages.map((st0, i) => {
      const st = i === 1 && D.config.sharedRing ? sharedStage(D.stages[0], st0) : { ...st0 };
      if (D.config.stages === 1 && i === 1) return null;
      if (st.autoRingShift) st.xr = matchRingShift(st);
      const geo = geometry(st);
      const mats = [0, 1, 2].map(k => material(D.materials[i === 1 && D.config.sharedRing && k === 2 ? 2 : i * 3 + k], q, rel));
      if (geo.parts.length) {
        geo.rims = [rim(geo.parts[0], st.sunBore), rim(geo.parts[1], st.planetBore), rim(geo.parts[2], st.ringOD)];
        geo.rims.forEach((r, k) => { if (r.error) errors.push(`${i + 1}단 ${NAMES[k]}: ${r.error}`); });
        // root strength uses the generating profile shift with the tooth-thickness allowance (thinnest tooth, Asn.i):
        // xE = x + Asn.i / (2·mn·tan αn); internal gear in our sign: xE = x − Asn.i / (2·mn·tan αn)
        const asn = st.asn || [], tanA = Math.tan((st.alpha || 20) * rad);
        const rootPart = k => { const ai = asn[k]?.[1]; return fin(ai) && ai !== 0 ? { ...geo.parts[k], x: geo.parts[k].x + (k === 2 ? -1 : 1) * ai / (2 * st.m * tanA) } : geo.parts[k]; };
        geo.shapes = geo.meshes.map((ms, j) => (j ? [1, 2] : [0, 1]).map(k => rootFactors(rootPart(k), ms, .38, TOOL.hfp, st.cutter)));
        geo.shapes.forEach((sp, j) => sp.forEach((sh, jj) => { if (sh.error) warns.push(`${i + 1}단 ${NAMES[(j ? [1, 2] : [0, 1])[jj]]}: ${sh.error}`); }));
        geo.tol = geo.parts.map(g => tolerances(g.z, st.m, g.width, st.beta, st.grade));
      }
      geo.errors.forEach(e => errors.push(`${i + 1}단 ${e}`));
      geo.warns.forEach(e => warns.push(`${i + 1}단 ${e}`));
      mats.forEach((mt, k) => mt.warnings.forEach(w => warns.push(`${i + 1}단 ${NAMES[k]}: ${w}`)));
      const carrier = geo.parts.length && geo.meshes[0] ? carrierGeometry.resolve(st, geo, i, D.geom?.['carrier' + (i + 1)]?.plateD) : null;
      carrier?.errors.forEach(msg => errors.push(`${i + 1}단 ${msg}`));
      carrier?.warnings.forEach(msg => warns.push(`${i + 1}단 ${msg}`));
      return { i, st, geo, mats, carrier };
    }).filter(Boolean);
    const ratio = stages.reduce((v, s) => v * (s.geo.ratio || NaN), 1);
    // Rating basis. 'ideal': perfect parts and assembly — no pitch/profile/helix deviations, no planet position
    // error, no carrier-bore misalignment. Only elastic deflections remain. Tolerances act only in the specimen simulation
    // (monteCarlo), where each specimen draws random errors. 'tolerance' (legacy designs/fixtures): tolerance limits as before.
    // 'iso' (default when unset): ISO 6336:2019 as KISSsoft applies it (KHβ method C with fHβ5, tolerance-based Kv/KHα)
    const basis = ['ideal', 'tolerance'].includes(D.loads?.basis) ? D.loads.basis : 'iso';
    const idealSample = basis === 'ideal' ? { ideal: true, pos: stages.map(s => Array(s.st.n).fill(0)), stage: stages.map(() => ({ fma: [0, 0], pitch: [0, 0], profile: [0, 0] })) } : null;
    return { D, stages, ratio, errors, warns, basis, idealSample };
  }

  // Load sharing model (Kγ). sample.pos: per-stage planet position errors (µm) or null → design value.
  function solve3(A, b) {
    const M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-30) return null; [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[3] / r[i]);
  }
  function kgamma(stg, D, Fmean, kpath, sample) {
    const n = stg.st.n, mode = sample ? 'model' : D.loads.kgMode;   // a specimen (or the ideal part) always uses the force model
    if (sample?.ideal) return { value: 1, src: '이론', note: '오차 0 (이상 조립) · 유성 하중 균등' };
    if (mode === 'fixed') return { value: D.loads.kgFixed, src: '가정', note: '직접 입력' };
    if (mode === 'agma') return { value: ({ 2: 1.16, 3: 1.23, 4: 1.32, 5: 1.35, 6: 1.38, 7: 1.47, 8: 1.52 })[n] ?? NaN, src: '규격', note: 'AGMA 6123-C16 표 7 Level 1' };
    const delta = D.loads.posError; // µm, carrier pin-hole position tolerance (±)
    let errs = sample?.pos?.[stg.i];
    if (!errs) errs = Array.from({ length: n }, (_, j) => j === 0 ? delta : 0);
    const total = n * Fmean;
    // Sun centre held by its shaft/bearings (not floating): radial play cs (µm), then support stiffness ks (N/µm).
    // Equilibrium = minimum of the convex energy  Σ ½kp·max(0, u − g_i(s))² − W·u + ½ks·max(0, |s| − cs)²,
    // g_i(s) = gap of path i (planet position error) shifted by the sun displacement s along the planet's tangent.
    const sup = sunSupportK(D, stg.i);
    const ks = Math.max(1e-9, sup.k), cs = Math.max(0, sup.play || 0), kp = kpath;
    const phi = Array.from({ length: n }, (_, j) => 2 * Math.PI * j / n), emax = Math.max(...errs);
    const e0 = errs.map(e => emax - e), dg = phi.map(p => [Math.sin(p), -Math.cos(p)]);
    const gap = (x, j) => e0[j] + dg[j][0] * x[1] + dg[j][1] * x[2];
    const energy = x => { let E = -total * x[0]; for (let j = 0; j < n; j++) { const a = Math.max(0, x[0] - gap(x, j)); E += .5 * kp * a * a; } const r = Math.hypot(x[1], x[2]); if (r > cs) E += .5 * ks * (r - cs) ** 2; return E; };
    let x = [total / (n * kp) + Math.max(...e0), 0, 0];
    for (let it = 0; it < 60; it++) {
      const g = [-total, 0, 0], H = [[1e-9, 0, 0], [0, 1e-9, 0], [0, 0, 1e-9]];
      for (let j = 0; j < n; j++) {
        const a = x[0] - gap(x, j); if (a <= 0) continue;
        const v = [1, -dg[j][0], -dg[j][1]];
        for (let p = 0; p < 3; p++) { g[p] += kp * a * v[p]; for (let q = 0; q < 3; q++) H[p][q] += kp * v[p] * v[q]; }
      }
      const r = Math.hypot(x[1], x[2]);
      if (r > cs) {
        const ux = x[1] / r, uy = x[2] / r, f = ks * (r - cs);
        g[1] += f * ux; g[2] += f * uy;
        const c1 = ks * (1 - cs / r), c2 = ks * cs / r;
        H[1][1] += c1 + c2 * ux * ux; H[2][2] += c1 + c2 * uy * uy; H[1][2] += c2 * ux * uy; H[2][1] += c2 * ux * uy;
      } else { H[1][1] += ks * 1e-6; H[2][2] += ks * 1e-6; }
      const d = solve3(H, g.map(v => -v));
      if (!d) break;
      let step = 1; const E0 = energy(x);
      while (step > 1e-6 && energy(x.map((v, i) => v + step * d[i])) > E0 - 1e-12 * step) step /= 2;
      x = x.map((v, i) => v + step * d[i]);
      if (Math.hypot(...d) * step < 1e-8) break;
    }
    const loads = Array.from({ length: n }, (_, j) => kp * Math.max(0, x[0] - gap(x, j)));
    const sx = x[1], sy = x[2];
    const value = Math.min(n, Math.max(...loads) / Fmean);
    return { value, src: '모델', note: `썬 고정 지지 (강성 ${ks.toFixed(1)} N/µm${sup.src !== '직접 입력' ? ' = ' + sup.src : ''}, 유격 ${cs} µm) · 유성 위치오차 ${delta} µm · 경로 강성 ${kpath.toFixed(0)} N/µm`, sunShift: Math.hypot(sx, sy) };
  }

  // ------------------------------------------------------------ evaluation at one operating point
  // op: {Tout, rpm (input), static, cycles: function(stg,part)->N or null, sample}
  function evaluate(ctx, op) {
    const D = ctx.D, rows = [], stageOut = [];
    const smp = op.sample || ctx.idealSample || null;   // explicit specimen, else the ideal part (ideal basis), else tolerance limits
    let Tin = op.Tout / ctx.ratio, nIn = op.rpm || 0;
    const obr = D.outBearing?.Z ? rollerModel(D, Math.max(0, op.Tout / D.req.Trated)) : null;
    for (const stg of ctx.stages) {
      const { st, geo, mats } = stg, ratio = geo.ratio, nc = nIn / ratio, rel = nIn - nc;
      const sun = geo.parts[0], planet = geo.parts[1];
      const Ft = 2000 * Tin / (st.n * sun.d);
      // mesh stiffness for path (needs line load; first pass with nominal)
      const pre0 = geo.meshes.map((ms, j) => meshStiffness(ms, mats[j ? 1 : 0], mats[j ? 2 : 1], Math.max(Ft / ms.b, 1e-6)));
      // planet tangential stiffness (planet free to spin): 4·(k_sp ⊕ k_pr), in series with pin bending; N/µm
      const kser = 1 / (1 / (pre0[0].cg * geo.meshes[0].b) + 1 / (pre0[1].cg * geo.meshes[1].b));
      const cPin = pinModel(st.pin, stg.carrier, 1, 0).compliance * 1000; // µm/N
      const ktan = 1 / (1 / (4 * kser) + cPin + (st.bearing.clearanceCompliance || 0));
      const kpath = ktan / 2; // mesh-load change per µm of planet position error
      const kg = kgamma(stg, D, Ft, kpath, smp);
      const KA = op.static ? 1 : D.loads.KA, Kg = kg.value;
      const v = Math.abs(rel) * Math.PI * sun.d / 60000;
      const mass = (g, mat, r) => { const dm = (g.da + g.df) / 2; return Math.PI * dm ** 4 / (8 * (g.d * Math.cos(geo.at)) ** 2) * mat.rho * (1 - (r.diameter / dm) ** 4); };
      const ms_ = mass(sun, mats[0], geo.rims[0]), mp = mass(planet, mats[1], geo.rims[1]);
      const modal = [mp * ms_ / (st.n * mp + ms_), mp];
      const sample = smp?.stage?.[stg.i];
      const pre = geo.meshes.map((ms, j) => {
        const ma = [mats[j ? 1 : 0], mats[j ? 2 : 1]], tl = [geo.tol[j ? 1 : 0], geo.tol[j ? 2 : 1]];
        const line = Ft * KA * Kg / ms.b, k = meshStiffness(ms, ma[0], ma[1], line);
        const pitch = (sample?.pitch?.[j] ?? Math.max(tl[0].pitch, tl[1].pitch)) * Math.cos(geo.at);
        const profile = sample?.profile?.[j] ?? Math.max(tl[0].profileForm, tl[1].profileForm);
        let dyn = { Kv: 1, region: '정적' };
        if (!op.static && nIn > 0) {
          const yp = (runin(ma[0], pitch, v) + runin(ma[1], pitch, v)) / 2, yf = (runin(ma[0], profile, v) + runin(ma[1], profile, v)) / 2;
          const Bp = k.cp * Math.max(0, pitch - yp) / line, Bf = k.cp * Math.max(0, profile - yf) / line;
          // ISO 6336-1 method B for planetary sets: sun–planet uses the reduced mass of sun + planets, planet–ring the planet
          // mass (ring fixed); resonance speed with the mesh stiffness cγα
          dyn = dynamicFactor(Math.abs(rel) * Math.PI * sun.z / 30000 * Math.sqrt(modal[j] / k.cg), line, ms.eg, Bp, Bf, 1);
        }
        return { ma, tl, line, k, pitch, profile, dyn };
      });
      const Kvmax = Math.max(...pre.map(p => p.dyn.Kv));
      const tilting = -Ft * Math.tan(Math.abs(st.beta) * rad) * planet.d;
      const pathT = geo.meshes.reduce((s, ms) => s + Math.cos(ms.aw) / Math.cos(ms.at), 0) * Ft;
      const pinForce = pathT * KA * Kg * Kvmax;
      const pin = pinModel(st.pin, stg.carrier, pinForce, tilting * KA * Kg * Kvmax);
      const car = carrierModel(stg, D, Tin * ratio * KA);
      const lastStage = stg.i === ctx.stages.length - 1, meshK = [];
      geo.meshes.forEach((ms, j) => {
        const P = pre[j], { ma, tl, line, k } = P, Kv = P.dyn.Kv, b = ms.b;
        const pinGap = (Math.abs(pin.tilt) * Math.cos(geo.at) + Math.abs(pin.mtilt) * Math.sin(geo.at)) * b * 1000 + (pin.bow || 0) * Math.cos(geo.at) * 1000;
        // manufacturing misalignment fma: design = RSS (ISO eq.66) of helix slope tolerances + carrier bore parallelism
        let fma, fmaSrc;
        if (sample?.fma?.[j] != null) { fma = sample.fma[j]; fmaSrc = smp.ideal ? '이론' : '시편'; }
        else if (D.loads.fmaMode === 'worst') { fma = tl[0].helixSlope + tl[1].helixSlope + D.loads.carrierParallel; fmaSrc = '규격'; }
        else { fma = Math.hypot(tl[0].helixSlope, tl[1].helixSlope, D.loads.carrierParallel); fmaSrc = '규격'; }
        const fshCar = Math.abs(car.slope) * Math.cos(geo.at) * b * 1000;
        const fshOB = lastStage && obr ? Math.abs(obr.tilt) * Math.cos(geo.at) * b * 1000 : 0;
        // sun torsion over the face width (ISO 6336-1 annex D, simplified form) with the torque of all n planets:
        // fsh = n · Fm/b · 0.023 · (b/d1)², hollow sun stiffened/weakened by 1/(1 − (di/d1)⁴)
        const sunBore = geo.rims?.[0]?.diameter || 0, hollow = 1 / Math.max(.2, 1 - (sunBore / sun.d) ** 4);
        const fshSun = j === 0 ? st.n * line * Kv * .023 * (b / sun.d) ** 2 * hollow : 0;
        const fsh = pinGap + fshCar + fshOB + fshSun + (smp?.ideal ? 0 : (D.loads.extraFsh?.[stg.i] || 0));
        const crown = st.mod?.crown || 0; // crowning on the planet acts on both meshes
        // ISO 6336-1:2019 method C (as KISSsoft): Fβx = |1.33·B1·fsh − B2·fHβ5|, fHβ5 = helix slope tolerance of grade 5,
        // B1/B2 from the lead modification (none 1/1, crowning 0.5/0.5); the crowning is then not integrated a second time
        const iso = ctx.basis === 'iso' && !op.sample;
        let fbx, B1 = 1, B2 = 1, fHb5 = null;
        if (iso) {
          if (crown > 0) { B1 = .5; B2 = .5; }
          fHb5 = Math.max(...[ms.a, ms.c].map(gp => tolerances(Math.abs(gp.z), st.m, b, st.beta, 5).helixSlope));
          // lower bound Fβx,min = max(0.005·Fm/b, 0.5·fHβ) with fHβ of the actual accuracy grade
          fbx = Math.max(Math.abs(1.33 * B1 * fsh - B2 * fHb5), .005 * line * Kv, .5 * Math.max(tl[0].helixSlope, tl[1].helixSlope)); fma = B2 * fHb5; fmaSrc = '규격 2019';
        } else fbx = fma + 1.33 * fsh;
        const yb = op.static ? 0 : (runin(ma[0], fbx, v, true) + runin(ma[1], fbx, v, true)) / 2;
        const fby = Math.max(0, fbx - yb);
        const face = faceLoad(line * Kv, k.cb, fby, iso ? 0 : crown);
        const KHb = Math.max(1, face.KHb);
        const bh = Math.max(3, b / Math.min(ms.a.h, ms.c.h)), NF = bh ** 2 / (1 + bh + bh ** 2), KFb = KHb ** NF;
        // ISO: KHα from the pitch deviation (single pitch tolerance, as KISSsoft: yα = 0.075·fp); profile form enters Kv only
        const dev = iso ? P.pitch / Math.cos(geo.at) : Math.max(P.pitch, P.profile), ya = op.static ? 0 : (runin(ma[0], dev, v) + runin(ma[1], dev, v)) / 2;
        const qa = k.cg * Math.max(0, dev - ya) / (line * Kv * KHb);
        const alpha = ms.eg <= 2 ? ms.eg / 2 * (.9 + .4 * qa) : .9 + .4 * Math.sqrt(2 * (ms.eg - 1) / ms.eg) * qa;
        const KHa = clamp(alpha, 1, Math.max(1, ms.eg / (ms.ea * ms.Zeps ** 2)));
        const KFa = clamp(alpha, 1, Math.max(1, ms.eg / (.25 * ms.ea + .75)));
        const ZE = Math.sqrt(1 / (Math.PI * ((1 - ma[0].nu ** 2) / ma[0].E + (1 - ma[1].nu ** 2) / ma[1].E)));
        const H0 = ms.ZH * ZE * ms.Zeps * ms.Zbeta * Math.sqrt(Ft * (ms.u + 1) / (ms.a.d * b * ms.u));
        const loadH = KA * Kg * Kv * KHb * KHa, loadF = KA * Kg * Kv * KFb * KFa;
        meshK[j] = { Kv, KHb, KHa };
        // Hertz max shear depth vs case depth (case crushing screen)
        (j ? [1, 2] : [0, 1]).forEach((part, jj) => {
          const shape = geo.shapes[j][jj], rm = geo.rims[part], mat = mats[part];
          const sym = (jj === 0) === ms.pinionFirst ? 'ZB' : 'ZD';
          const H = H0 * ms[sym] * Math.sqrt(loadH);
          const bw = Math.min(geo.parts[part].width, b + 2 * st.m);
          const F = Ft / (bw * st.m) * shape.YF * shape.YS * shape.Ybeta * rm.YB * loadF;
          // allowable curves
          const lub = D.lube, H_ = mat.HlimISO;
          const CZL = H_ < 850 ? .83 : H_ <= 1200 ? .83 + (H_ - 850) * .08 / 350 : .91;
          const ZL = CZL + 4 * (1 - CZL) / (1.2 + 134 / lub.nu40) ** 2;
          const CZV = CZL + .02, ZV = v > 0 ? CZV + 2 * (1 - CZV) / Math.sqrt(.8 + 32 / v) : CZV;
          const CZR = H_ < 850 ? .15 : H_ <= 1200 ? .32 - .0002 * H_ : .08;
          const ZR = (3 / (lub.rzFlank * (10 / ms.rho) ** (1 / 3))) ** CZR;
          const Ydel = (1 + Math.sqrt(.2 * mat.slip * (1 + 2 * shape.qs))) / (1 + Math.sqrt(1.2 * mat.slip));
          const r = lub.rzRoot, rh = r < 1 ? 1.12 : 1.674 - .529 * (r + 1) ** .1, rn = r < 1 ? 1.07 : 5.306 - 4.203 * (r + 1) ** .01;
          const YR = mat.family === 'NV' ? (r < 1 ? 1.025 : 4.299 - 3.259 * (r + 1) ** .0058) : mat.family === 'VC' ? Math.min(rh, rn) : rh;
          const YM = part === 1 ? .7 : (D.loads.reverse ? .7 : 1);
          const YdelS = mat.family === 'NV' ? .2 * shape.YS + .6 : mat.family === 'Eh' ? .44 * shape.YS + .12 : 1;
          const N = op.static ? 1 : op.cycles ? op.cycles(stg, part, rel, nc) : Infinity;
          const zn = ZN[mat.family], yn = YN[mat.family];
          const tH = op.static ? 0 : (op.lifeOff ? 1 : curveT(zn, N)), tF = op.static ? 0 : (op.lifeOff ? 1 : curveT(yn, N));
          const ZNT = op.static ? zn[0][1] : op.lifeOff ? 1 : curve(zn, N), YNT = op.static ? yn[0][1] : op.lifeOff ? 1 : curve(yn, N);
          const envH = 1 + (ZL * ZV * ZR - 1) * tH;
          const envF = YM * (YdelS + (Ydel * YR - YdelS) * tF);   // mean-stress factor YM applies over the whole S-N curve
          const HP = mat.Hlim * ZNT * envH, FP = 2 * mat.Flim * YNT * envF;
          // Hertz contact half width & max shear depth
          const Eeq = 1 / ((1 - ma[0].nu ** 2) / ma[0].E + (1 - ma[1].nu ** 2) / ma[1].E);
          const bH = 4 * ms.rho * H / (2 * Eeq) * 1; // half width ≈ 2·ρ·σH/E*  (Hertz line contact: a = 2σH·ρ/E*)
          const zMax = 0.786 * bH;
          rows.push({
            id: `${stg.i}-${j}-${part}`, stage: stg.i + 1, mesh: ms.label, part, partName: NAMES[part],
            H, F, HP, FP, SH: HP / H, SF: FP / F, N,
            f: { KA, Kg, KgSrc: kg.src, KgNote: kg.note, Kv, KvRegion: P.dyn.region, KHb, KFb, KHa, KFa, fma, fmaSrc, fsh, fshPin: pinGap, fshCar, fshOB, fshSun, fbx, fby, fHb5, B1, B2, frac: face.frac, crown, cg: k.cg, cb: k.cb, cp: k.cp, Nres: P.dyn.N,
              ZH: ms.ZH, ZE, Zeps: ms.Zeps, Zbeta: ms.Zbeta, ZBD: ms[sym], sym, fZCa: ms.fZCa, YF: shape.YF, YS: shape.YS, Ybeta: shape.Ybeta, YB: rm.YB,
              ZL, ZV, ZR, ZNT, YNT, Ydel, YR, YM, Hlim: mat.Hlim, Flim: mat.Flim, Ft, H0,
              F0: Ft / (bw * st.m) * shape.YF * shape.YS * shape.Ybeta * rm.YB, sFn: shape.sFn, rhoF: shape.rhoF, hFe: shape.hFe, aFen: shape.aFen, xE: shape.x, rootSrc: shape.source },
            caseDepthRatio: pos(mat.depth) ? mat.depth / zMax : null, zMax
          });
        });
      });
      // planet bearing: radial load per planet (heaviest path) = pin force
      stageOut.push({ i: stg.i, meshK, car, obr: lastStage ? obr : null, Tin, Tout: Tin * ratio, nIn, nc, rel, Ft, Kg, KgSrc: kg.src, KgNote: kg.note, kpath, ktan, pin, pinForce, planetRel: Math.abs(rel) * sun.z / planet.z });
      Tin *= ratio; nIn = nc;
    }
    return { rows, stages: stageOut };
  }

  const minSafety = (res, t, stage) => Math.min(...res.rows.filter(r => !stage || r.stage === stage).map(r => Math.min(r.SH / t.SH, r.SF / t.SF)));
  // cycles per part for constant operation of `hours` at input speed rpm
  function cyclesFor(hours) {
    return (stg, part, rel, nc) => {
      const g = stg.geo.parts, n = stg.st.n;
      const per = [Math.abs(rel) * n, Math.abs(rel) * g[0].z / g[1].z, Math.abs(nc) * n][part];
      return Math.max(1, per * 60 * hours);
    };
  }
  // output torque at which the smallest safety ratio reaches 1
  // output torque at which the gears reach the target safety; `stage` (1-based) limits the check to that stage's meshes
  function capacity(ctx, opBase, target, stage) {
    const f = T => minSafety(evaluate(ctx, { ...opBase, Tout: T }), target, stage);
    let lo = 1e-3, hi = 1e-3;
    if (!(f(lo) >= 1)) return 0;
    for (let i = 0; i < 80; i++) { hi = lo * 1.35; if (!(f(hi) >= 1)) break; lo = hi; if (hi > 1e7) return Infinity; }
    for (let i = 0; i < 40; i++) { const mid = Math.sqrt(lo * hi); if (f(mid) >= 1) lo = mid; else hi = mid; }
    return lo;
  }
  function governing(ctx, op, D) {
    const r = evaluate(ctx, op);
    let best = null;
    r.rows.forEach(row => { for (const [k, t] of [['SH', D.SH], ['SF', D.SF]]) { const v = row[k] / t; if (!best || v < best.v) best = { v, row, mode: k === 'SH' ? '치면(피팅)' : '치근(굽힘)' }; } });
    return best;
  }

  // ------------------------------------------------------------ duty spectrum (Miner) — ISO 6336-6 style
  function spectrumDamage(ctx, D, sample) {
    const levels = D.req.duty.filter(l => l.time > 0 && l.torque > 0);
    const totalT = levels.reduce((s, l) => s + l.time, 0);
    const hours = D.req.lifeH;
    const parts = {};
    for (const l of levels) {
      const T = D.req.Trated * l.torque / 100, h = hours * l.time / totalT, rpm = l.rpm || D.req.rpm;
      const res = evaluate(ctx, { Tout: T, rpm, lifeOff: false, cycles: () => 1e12, sample });
      for (const row of res.rows) {
        const stg = ctx.stages[row.stage - 1];
        const so = res.stages[row.stage - 1];
        const per = [Math.abs(so.rel) * stg.st.n, Math.abs(so.rel) * stg.geo.parts[0].z / stg.geo.parts[1].z, Math.abs(so.nc) * stg.st.n][row.part];
        const n = per * 60 * h;
        const mat = stg.mats[row.part];
        const key = row.id;
        const P = parts[key] ||= { id: key, stage: row.stage, mesh: row.mesh, part: row.part, partName: row.partName, DH: 0, DF: 0 };
        // Find N where allowable curve × env equals stress × S_target.
        const NH = invAllow(row, mat, 'H', row.H * D.req.SH), NF = invAllow(row, mat, 'F', row.F * D.req.SF);
        P.DH += n / NH; P.DF += n / NF;
      }
    }
    const list = Object.values(parts);
    list.forEach(p => { p.lifeH = hours / Math.max(p.DH, p.DF); p.mode = p.DH >= p.DF ? '치면(피팅)' : '치근(굽힘)'; });
    list.sort((a, b) => a.lifeH - b.lifeH);
    return { list, minLife: list[0]?.lifeH ?? NaN, gov: list[0] };
  }
  // Inverse of the allowable-stress S-N curve including the interpolated environment factors.
  function invAllow(row, mat, kind, stressNeeded) {
    const f = row.f, pts = kind === 'H' ? ZN[mat.family] : YN[mat.family];
    const allow = N => {
      const t = curveT(pts, N);
      if (kind === 'H') return mat.Hlim * curve(pts, N) * (1 + (f.ZL * f.ZV * f.ZR - 1) * t);
      const YdelS = mat.family === 'NV' ? .2 * f.YS + .6 : mat.family === 'Eh' ? .44 * f.YS + .12 : 1;
      return 2 * mat.Flim * curve(pts, N) * f.YM * (YdelS + (f.Ydel * f.YR - YdelS) * t);   // YM (alternating) at every life
    };
    if (stressNeeded > allow(1)) return 1; // exceeds static
    if (stressNeeded <= allow(1e10)) return Infinity;
    let lo = Math.log(1), hi = Math.log(1e10);
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (allow(Math.exp(mid)) > stressNeeded) lo = mid; else hi = mid; }
    return Math.exp((lo + hi) / 2);
  }

  // ------------------------------------------------------------ bearings, efficiency, backlash, stiffness
  function bearingLife(ctx, D, sample) {
    const levels = D.req.duty.filter(l => l.time > 0 && l.torque > 0), totalT = levels.reduce((s, l) => s + l.time, 0);
    return ctx.stages.map(stg => {
      const br = stg.st.bearing;
      let sumP = 0, sumRev = 0;
      for (const l of levels) {
        const T = D.req.Trated * l.torque / 100, rpm = l.rpm || D.req.rpm;
        const r = evaluate(ctx, { Tout: T, rpm, cycles: () => 1e8, sample });
        const so = r.stages[stg.i];
        const P = so.pinForce / Math.max(1, br.count || 1);
        const rev = so.planetRel * 60 * D.req.lifeH * l.time / totalT;
        sumP += P ** (10 / 3) * rev; sumRev += rev;
      }
      const Peq = (sumP / Math.max(sumRev, 1e-9)) ** (3 / 10);
      const rr = evaluate(ctx, { Tout: D.req.Trated, rpm: D.req.rpm, cycles: () => 1e8, sample }).stages[stg.i];
      const pk = evaluate(ctx, { Tout: D.req.Tpeak, rpm: 0, static: true, sample }).stages[stg.i];
      const em = evaluate(ctx, { Tout: D.req.Temerg, rpm: 0, static: true, sample }).stages[stg.i];
      const L10rev = (br.C / Peq) ** (10 / 3) * 1e6;
      const revPerH = sumRev / D.req.lifeH;
      const L10h = L10rev / revPerH;
      return { stage: stg.i + 1, name: br.name, C: br.C, C0: br.C0, Peq, L10h, L50h: L10h * (Math.log(.5) / Math.log(.9)) ** (1 / 1.5), planetRpm: rr.planetRel,
        s0peak: br.C0 / (pk.pinForce / Math.max(1, br.count || 1)), s0emerg: br.C0 / (em.pinForce / Math.max(1, br.count || 1)),
        pinSigmaPeak: pk.pin.sigma, pinSigmaEmerg: em.pin.sigma, pinAllow: stg.st.pin.allow, pinForceRated: rr.pinForce };
    });
  }

  // ============================================================ lubrication (operating condition)
  // Walther (ASTM D341) viscosity–temperature line through ν40 and ν100
  function viscosityAt(lube, T) {
    const W = v => Math.log10(Math.log10(v + .7)), K = t => Math.log10(t + 273.15);
    const n40 = lube.nu40, n100 = pos(lube.nu100) ? lube.nu100 : n40 / 9; // fallback ≈ VI 100 mineral
    const B = (W(n40) - W(n100)) / (K(100) - K(40)), A = W(n40) + B * K(40);
    return 10 ** (10 ** (A - B * K(T))) - .7;
  }
  const BM = 13.8;          // thermal contact coefficient of steel, N/(mm·s^0.5·K)
  // per-mesh lubrication state at one operating point (stage output from evaluate)
  function lubeMesh(ctx, D, so, stg, j) {
    const L = D.lube, ms = stg.geo.meshes[j], T = L.temp, nu = viscosityAt(L, T), eta = nu * (L.rho || .88); // mPa·s
    const a = ms.a, c = ms.c, w1 = Math.abs(j ? so.planetRel : so.rel) * Math.PI / 30, z1 = a.z, z2 = Math.abs(c.z);
    const w2 = w1 * z1 / z2;                                         // rad/s, relative to carrier
    const rb1 = a.db / 2, rb2 = c.db / 2, g = ms.center * Math.sin(ms.aw);
    const rho1p = rb1 * Math.tan(ms.aw), rho2 = r => ms.internal ? r + g : g - r;   // ρ2 from ρ1 along the line of action
    const tip1 = Math.sqrt((a.dFa / 2) ** 2 - rb1 ** 2), tip2 = Math.sqrt(Math.max(0, (c.dFa / 2) ** 2 - rb2 ** 2));
    const start = ms.internal ? tip2 - g : g - tip2;                  // ρ1 at start of active contact
    const pts = [Math.max(start, 1e-3), rho1p, tip1];
    const vt = w1 * rb1 / Math.cos(ms.aw) / 1000;                     // pitch-line speed m/s (rel. carrier)
    const Fbt = so.Ft * D.loads.KA * so.Kg / Math.cos(ms.aw), b = ms.b;
    const wline = Fbt / Math.cos(ms.bb) / (b * Math.max(1, ms.ea) / Math.cos(ms.bb));      // N/mm on the contact lines
    const Ra = Math.max(.05, L.rzFlank / 6), sig = Math.SQRT2 * Ra;                     // µm, Ra ≈ Rz/6
    const Es = 1 / ((1 - .09) / 206000 * 2);                                           // E* (MPa) steel/steel, ν .3
    // Dowson–Higginson minimum film at the pitch point (normal section)
    const Rn = ms.rho / Math.cos(ms.bb) / 1000, u = vt, Ep = 2 * Es * 1e6, alpha = (L.alphaP || 2.0) * 1e-8;
    const U = eta / 1000 * u / (Ep * Rn), G = alpha * Ep, Wd = wline * 1000 / (Ep * Rn);
    const starv = L.type === 'grease' ? (L.starvation ?? .7) : 1;
    const hmin = u > 0 ? 2.65 * U ** .7 * G ** .54 * Wd ** -.13 * Rn * 1e6 * starv : 0;  // µm
    const lambda = hmin / sig;
    // mesh friction, ISO/TR 14179-2 (Schlenk): μ = 0.048·(Fbt/b / (vΣC·ρC))^0.2·η^-0.05·Ra^0.25·XL
    const vSum = Math.max(.05, 2 * vt * Math.sin(ms.aw));
    const muModel = clamp(.048 * (Fbt / b / (vSum * ms.rho)) ** .2 * eta ** -.05 * Ra ** .25 * (L.XL || 1), .02, .12);
    const mu = D.perf.muMode === 'fixed' ? D.perf.mu : muModel;
    // Flash temperature along the path of contact (Blok, as ISO/TS 6336-20): load per unit length wBt·XΓ with
    // wBt = Ft·KA·Kγ·Kv·KBβ·KBα / b (KBβ = KHβ, KBα = KHα) and the load sharing factor XΓ of unmodified spur profiles
    // (1/3 at A and E, 2/3 at B and D, 1 in single contact). Bulk temperature θM = θoil + XS·0.47·Xmp·θflm,
    // Xmp = (1 + n)/2; SB = (θS − θoil) / (θBmax − θoil); θS = 80 + (0.85 + 1.4·XW)·XLs·FZG² (XLs 0.83 mineral oil)
    const mk = so.meshK?.[j] || { Kv: 1, KHb: 1, KHa: 1 };
    // helical load factor KBγ = 1 + 0.2·√((εγ − 2)(5 − εγ)) for 2 < εγ < 3.5 (1 below, 1.3 above)
    const eg = ms.ea + ms.eb, KBg = eg <= 2 ? 1 : eg >= 3.5 ? 1.3 : 1 + .2 * Math.sqrt((eg - 2) * (5 - eg));
    const wBt = so.Ft * D.loads.KA * so.Kg * mk.Kv * mk.KHb * mk.KHa / b;
    const sA = Math.max(start, 1e-3), sE = tip1, ga = sE - sA, pb = Math.PI * a.mt * Math.cos(ms.at);
    // load sharing XΓ: spur (1/3 → 2/3, 1 in single contact); wide helical (εβ ≥ 1) 1/εα; narrow helical blended by εβ.
    // Buttressing near A and E: Xbut = 1 + 0.3·εβ (≤ 1.3) falling to 1 over 0.2·sin βb of the Γ coordinate
    const XGspur = s => { if (ga <= pb) return 1; const B = ga - pb, Dp = pb; if (s < B) return 1 / 3 + s / B / 3; if (s > Dp) return 1 / 3 + (ga - s) / (ga - Dp) / 3; return 1; };
    const ebw = Math.min(1, ms.eb), Xbut0 = 1 + .3 * ebw, gw = .2 * Math.sin(ms.bb) * rho1p;   // Γ span → path length (ρ1p·ΔΓ)
    const XG = s => { const base = (1 - ebw) * XGspur(s) + ebw / ms.ea; if (!(gw > 0)) return base;
      const dEnd = Math.min(s, ga - s), but = dEnd < gw ? Xbut0 - (Xbut0 - 1) * dEnd / gw : 1; return base * but; };
    let flash = 0, sumF = 0, nF = 0;
    for (let q = 0; q <= 40; q++) {
      const s = ga * q / 40, r1 = sA + s, r2 = rho2(r1); if (!(r1 > 0 && r2 > 0)) continue;
      const v1 = w1 * r1 / 1000, v2 = w2 * r2 / 1000, w = wBt * KBg * XG(s) / Math.cos(ms.bb);
      const Rr = 1 / (1 / r1 + (ms.internal ? -1 : 1) / r2) / Math.cos(ms.bb);
      const bh = Math.sqrt(4 * w * Math.abs(Rr) / (Math.PI * Es));                 // mm
      const th = 1.11 * mu * w * Math.abs(Math.sqrt(v1) - Math.sqrt(v2)) * Math.sqrt(1000) / (BM * Math.sqrt(2 * bh));
      flash = Math.max(flash, th); sumF += th; nF++;
    }
    const flashMean = nF ? sumF / nF : 0, Xmp = (1 + stg.st.n) / 2, XS = L.XS ?? 1;
    const XLs = L.XLs ?? (L.base === 'synthetic' ? 1 : .83);
    const thetaM = T + XS * .47 * Xmp * flashMean;
    const thetaS = 80 + (.85 + 1.4 * (L.XW || 1)) * XLs * (L.fzg || 10) ** 2;
    const thetaB = thetaM + flash;
    const SB = thetaB - T > 1e-9 ? (thetaS - T) / (thetaB - T) : Infinity;
    const outOfRange = wBt < 150;   // ISO/TS 6336-21 lower bound of the method
    const regime = lambda >= 3 ? '완전 유막' : lambda >= 1 ? '혼합 윤활' : '경계 윤활';
    return { stage: stg.i + 1, mesh: ms.label, T, nu, eta, vt, hmin, lambda, regime, mu, muModel, flash, flashMean, thetaM, thetaB, thetaS, SB, wline, wBt, KBg, outOfRange };
  }
  function lubrication(ctx, D) {
    const r = evaluate(ctx, { Tout: D.req.Trated, rpm: D.req.rpm, cycles: () => 1e8 });
    const meshes = [];
    ctx.stages.forEach(stg => [0, 1].forEach(j => meshes.push(lubeMesh(ctx, D, r.stages[stg.i], stg, j))));
    const rp = evaluate(ctx, { Tout: D.req.Tpeak, rpm: D.req.rpm, cycles: () => 1e8 });
    const peak = []; ctx.stages.forEach(stg => [0, 1].forEach(j => peak.push(lubeMesh(ctx, D, rp.stages[stg.i], stg, j))));
    return { meshes, peak, nuOp: viscosityAt(D.lube, D.lube.temp), lambdaMin: Math.min(...meshes.map(m => m.lambda)), SBmin: Math.min(...peak.map(m => m.SB)) };
  }

  // ============================================================ output (cross-roller) bearing: roller load distribution
  // DOF: radial δr, axial δa, tilt θ. Roller j at ψj, alternating orientation s = ±1, contact angle 45°.
  // Roller (two line contacts, Palmgren): δ = 2·3.84e-5·Q^0.9 / L^0.8  →  Q = (δ·L^0.8 / 7.68e-5)^(1/0.9)
  function rollerModel(D, k) {
    const ob = D.outBearing, ext = D.req.ext || { Fr: 0, Fa: 0, M: 0 };
    const Z = Math.max(8, Math.round(ob.Z || 40)), Dw = ob.Dw || 4, Lw = ob.Lw || Dw * .9, dp = ob.dp, al = Math.PI / 4;
    const pre = (ob.preload || 0) / 1000; // mm (radial-normal interference per roller; negative = clearance)
    const Fr = ext.Fr * k, Fa = ext.Fa * k, M = ext.M * k * 1000;
    const ca = Math.cos(al), sa = Math.sin(al), R = dp / 2;
    const psi = Array.from({ length: Z }, (_, j) => 2 * Math.PI * j / Z), sg = psi.map((_, j) => j % 2 ? -1 : 1);
    const Qof = d => d > 0 ? (d * Lw ** .8 / 7.68e-5) ** (1 / .9) : 0;
    const dQ = d => d > 0 ? (1 / .9) * (Lw ** .8 / 7.68e-5) ** (1 / .9) * d ** (1 / .9 - 1) : 0;
    const defl = (x, j) => pre + x[0] * ca * Math.cos(psi[j]) + sg[j] * (x[1] + x[2] * R * Math.cos(psi[j])) * sa;
    const resid = x => {
      const f = [-Fr, -Fa, -M]; const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let j = 0; j < Z; j++) {
        const d = defl(x, j), Q = Qof(d), q = dQ(d);
        const g = [ca * Math.cos(psi[j]), sg[j] * sa, sg[j] * sa * R * Math.cos(psi[j])];   // ∂δ/∂x and force projections
        for (let p = 0; p < 3; p++) { f[p] += Q * g[p]; for (let r = 0; r < 3; r++) J[p][r] += q * g[p] * g[r]; }
      }
      return { f, J };
    };
    let x = [1e-4, 0, 0];
    for (let it = 0; it < 80; it++) {
      const { f, J } = resid(x), nf = Math.hypot(f[0], f[1], f[2] / R);
      if (nf < 1e-6) break;
      for (let p = 0; p < 3; p++) J[p][p] += 1e-3 * (p === 2 ? R * R : 1);                     // regularise (no-contact start)
      const d = solve3(J, f.map(v => -v)); if (!d) break;
      let s = 1; while (s > 1e-4) { const xn = x.map((v, i) => v + s * d[i]), r2 = resid(xn).f; if (Math.hypot(r2[0], r2[1], r2[2] / R) < nf) { x = xn; break; } s /= 2; }
      if (s <= 1e-4) x = x.map((v, i) => v + 1e-4 * d[i]);
    }
    const Q = psi.map((_, j) => Qof(defl(x, j)));
    const Qmax = Math.max(...Q), loaded = Q.filter(q => q > 1e-6).length;
    const Rr = 1 / (2 / Dw + ca / (R - Dw / 2 * ca));                                         // inner-race line contact
    const Es = 1 / ((1 - .09) / 206000 * 2);
    const p0 = Math.sqrt(Qmax / Lw * Es / (Math.PI * Rr));
    return { Z, Dw, Lw, Q, Qmax, Qmean: Q.reduce((s, q) => s + q, 0) / Z, loaded, p0, s0: p0 > 0 ? (4000 / p0) ** 2 : Infinity,
      tilt: x[2], tiltArcmin: x[2] * 180 / Math.PI * 60, dr: x[0] * 1000, da: x[1] * 1000, k };
  }

  // ============================================================ carrier stiffness (double-plate carrier with webs)
  // Far plate carries half the pin loads; it is tied to the output plate by n webs (fixed–guided beams in the tangential
  // direction). Windup between plates tilts each pin in the tangential plane → helix misalignment fsh on both meshes.
  function carrierModel(stg, D, Tcar) {
    const st = stg.st, cg = st.carrier || {}, n = st.n, a = stg.carrier.orbit;
    const { double, span, groove } = stg.carrier;
    if (!double || D.loads.rigidCarrier) return { double, kweb: NaN, windup: 0, slope: 0, ktor: Infinity, sigma: 0, span };
    const E = PIN_E[cg.material] || 206000, G = E / 2.6;
    // web section from the carrier shape (slot pockets cut by a radial end mill); the old equivalent rectangle is only a fallback
    const wb = stg.carrier.web, fromShape = wb?.I > 0 && wb?.A > 0;
    const w = cg.webW || 4, h = cg.webH || 3, Lw = groove, rw = a;     // web between planets on the pin PCD
    const I = fromShape ? wb.I : h * w ** 3 / 12, A = fromShape ? wb.A : w * h, cmax = fromShape ? wb.ymax : w / 2;
    const kweb = 1 / (Lw ** 3 / (12 * E * I) + 1.2 * Lw / (G * A));                        // N/mm tangential
    const Fweb = Tcar * 1000 / 2 / (n * rw);                                               // N per web
    const windup = Fweb / kweb / rw;                                                       // rad (far plate vs output plate)
    const slope = windup * a / span;                                                       // pin tangential slope
    const sigma = Fweb * Lw / 2 * cmax / I;                                                // web bending stress (fixed–guided, M = F·L/2)
    const ktor = 4 * n * kweb * rw * rw / 1000;                                            // N·m/rad: mean pin rotation = ½ far-plate windup
    return { double, kweb, windup, slope, ktor, sigma, Fweb, span, w, h, I, A, fromShape, webShape: wb?.shape };
  }
  // sun radial support: direct stiffness, or support bearing ⊕ shaft cantilever (structure)
  function sunSupportK(D, i) {
    const s = (D.loads.sunSupport || [])[i] || { k: 20, play: 0 };
    if (s.mode !== 'structure') return { k: s.k, play: s.play || 0, src: '직접 입력' };
    const E = 206000, I = Math.PI * ((s.od || 10) ** 4 - (s.id || 0) ** 4) / 64, L = s.overhang || 6;
    const kShaft = 1 / (1000 * L ** 3 / (3 * E * I));                                      // N/µm
    const k = 1 / (1 / Math.max(1e-6, s.bearingK || 40) + 1 / kShaft);
    return { k, play: s.play || 0, kShaft, src: `베어링 ${s.bearingK} ⊕ 축 ${kShaft.toFixed(0)} N/µm` };
  }

  // ------------------------------------------------------------ output main bearing (cross-roller style equivalent load)
  function outputBearing(ctx, D) {
    const ob = D.outBearing, ext = D.req.ext || { Fr: 0, Fa: 0, M: 0 };
    const levels = D.req.duty.filter(l => l.time > 0 && l.torque > 0), totalT = levels.reduce((s, l) => s + l.time, 0) || 1;
    const p = ob.type === 'ball' ? 3 : 10 / 3;
    const Pof = (Fr, Fa, M) => { const Fre = Fr + 2000 * M / ob.dp; const ratio = Fa / Math.max(Fre, 1e-9); const [X, Y] = ratio <= 1.5 ? [1, .45] : [.67, .67]; return X * Fre + Y * Fa; };
    // loads assumed proportional to the torque level of each spectrum segment (link loads scale with joint effort)
    let sumP = 0, sumRev = 0;
    for (const l of levels) {
      const k = l.torque / 100, rpmOut = (l.rpm || D.req.rpm) / ctx.ratio;
      const P = Pof(ext.Fr * k, ext.Fa * k, ext.M * k);
      const rev = rpmOut * 60 * D.req.lifeH * l.time / totalT;
      sumP += P ** p * rev; sumRev += rev;
    }
    const Peq = (sumP / Math.max(sumRev, 1e-9)) ** (1 / p);
    const L10rev = (ob.C / Peq) ** p * 1e6, revPerH = sumRev / D.req.lifeH;
    const kp = D.req.Tpeak / D.req.Trated, ke = D.req.Temerg / D.req.Trated;
    const P0 = k => ext.Fr * k + 2000 * ext.M * k / ob.dp + .44 * ext.Fa * k;
    return { name: ob.name, type: ob.type, C: ob.C, C0: ob.C0, dp: ob.dp, Peq, L10h: L10rev / Math.max(revPerH, 1e-12), outRpm: D.req.rpm / ctx.ratio,
      s0peak: ob.C0 / P0(kp), s0emerg: ob.C0 / P0(ke), tiltRated: pos(ob.Km) ? ext.M / ob.Km : NaN, tiltPeak: pos(ob.Km) ? ext.M * kp / ob.Km : NaN, ext,
      roll: ob.Z ? { rated: rollerModel(D, 1), peak: rollerModel(D, kp), emerg: rollerModel(D, ke) } : null };
  }
  // ------------------------------------------------------------ carrier & planet pin
  function carrierPin(ctx, D) {
    return ctx.stages.map(stg => {
      const st = stg.st, pin = st.pin, b = stg.geo.parts[1].width;
      const at = T => evaluate(ctx, { Tout: T, rpm: 0, static: true }).stages[stg.i];
      const rr = evaluate(ctx, { Tout: D.req.Trated, rpm: D.req.rpm, cycles: () => 1e8 }).stages[stg.i];
      const pk = at(D.req.Tpeak), em = at(D.req.Temerg);
      const A = Math.PI * pin.d ** 2 / 4;
      const engagement = stg.carrier.engagement, fit = Math.min(...engagement), reactions = pk.pin.reactions;
      const shear = F => 4 / 3 * F * Math.max(...reactions) / A;
      const press = F => Math.max(...engagement.map((length, i) => F * reactions[i] / (pin.d * length)));
      const out = { stage: stg.i + 1, d: pin.d, type: pin.type, span: rr.pin.span, fit, geometry: stg.carrier,
        rated: { F: rr.pinForce, sigma: rr.pin.sigma, tau: shear(rr.pinForce), defl: rr.pin.meanDefl * 1000, tilt: rr.pin.tilt * b * 1000, p: press(rr.pinForce) },
        peak: { F: pk.pinForce, sigma: pk.pin.sigma, tau: shear(pk.pinForce), p: press(pk.pinForce) },
        emerg: { F: em.pinForce, sigma: em.pin.sigma, tau: shear(em.pinForce), p: press(em.pinForce) },
        allow: pin.allow, carrierAllowP: D.carrier.allowP };
      out.Sbend = pin.allow / out.peak.sigma; out.Spress = D.carrier.allowP / out.peak.p;
      // carrier torque (output side of this stage) and plate shear at pin web (simple)
      out.carrierTorque = D.req.Tpeak / ctx.stages.slice(stg.i + 1).reduce((v, s) => v * s.geo.ratio, 1);
      out.car = { rated: rr.car, peak: pk.car };
      out.Sweb = out.car.peak.double ? D.carrier.allowB / out.car.peak.sigma : Infinity;
      return out;
    });
  }

  function efficiency(ctx, D, Tout) {
    const r = evaluate(ctx, { Tout, rpm: D.req.rpm, cycles: () => 1e8 });
    let total = 1;
    const st = ctx.stages.map(stg => {
      const loss = [];
      const etaMesh = stg.geo.meshes.map((ms, j) => {
        const mu = lubeMesh(ctx, D, r.stages[stg.i], stg, j).mu;
        const Hv = Math.PI * Math.abs(1 / ms.a.z + ms.sign / ms.c.z) * (1 - ms.ea + ms.e1 ** 2 + ms.e2 ** 2) / Math.cos(ms.bb);
        return 1 - mu * Hv;
      });
      const eta0 = etaMesh[0] * etaMesh[1], i0 = stg.geo.parts[2].z / stg.geo.parts[0].z;
      const gear = (1 + eta0 * i0) / (1 + i0);
      const eta = gear * (1 - D.perf.otherLoss / 100);
      total *= eta;
      return { stage: stg.i + 1, etaMesh, gear, eta };
    });
    return { stages: st, total };
  }
  // ------------------------------------------------------------ tooth thickness → measurement and backlash
  // Asn = [upper e, lower i] normal tooth thickness allowances (mm, ≤ 0). Internal: ours x > 0 = thinner tooth.
  const asnOf = (st, k) => { const a = (st.asn || [])[k] || []; return [+a[0] || 0, +a[1] || 0]; };
  function toothData(ctx) {
    return ctx.stages.map(stg => {
      const g = stg.geo, an = g.an, at = g.at, bb = g.bb;
      const parts = g.parts.map((p, k) => {
        const mn = p.m, z = p.z, sgn = p.internal ? -1 : 1, [Ae, Ai] = asnOf(stg.st, k);
        const sn = A => mn * (Math.PI / 2 + sgn * 2 * p.x * Math.tan(an)) + A;          // normal tooth thickness at d
        const out = { part: k, name: p.name, z, internal: p.internal, sn: [sn(Ae), sn(Ai)], Asn: [Ae, Ai] };
        // span measurement (external only): k chosen to touch near d + 2xm
        if (!p.internal) {
          const ax = Math.acos(Math.min(1, p.db / (p.d + 2 * p.x * mn)));
          const kk = Math.min(z - 1, Math.max(2, Math.round(z / Math.PI * (Math.tan(ax) / Math.cos(bb) ** 2 - inv(at) - 2 * p.x * Math.tan(an) / z) + .5)));
          const Wk = A => mn * Math.cos(an) * ((kk - 1) * Math.PI + z * inv(at)) + sn(A) * Math.cos(an);
          out.k = kk; out.Wk = [Wk(Ae), Wk(Ai)];
          out.WkNeedB = Wk(Ae) * Math.sin(bb) + 5;                                       // face width needed for a helical span reading
          out.WkOK = p.width >= out.WkNeedB || !(bb > 0);
        }
        // dimension over / between balls (pins for spur): DM ≈ 1.68·mn external, 1.44·mn internal
        const DMth = Math.round((p.internal ? 1.67 : 1.69) * mn * 1000) / 1000, DMin = +((stg.st.ballD || [])[k]) || 0, DM = DMin > 0 ? DMin : DMth;
        const Md = A => {
          const s_ = sn(A), e = Math.PI * mn - s_;
          const iM = p.internal ? inv(at) - DM / (mn * z * Math.cos(an)) + e / (mn * z) : inv(at) + s_ / (mn * z) + DM / (mn * z * Math.cos(an)) - Math.PI / z;
          const aM = invSolve(iM), dM = p.d * Math.cos(at) / Math.cos(aM), f = z % 2 ? Math.cos(Math.PI / (2 * z)) : 1;
          return p.internal ? dM * f - DM : dM * f + DM;
        };
        out.DM = DM; out.DMth = DMth; out.DMset = DMin > 0; out.Md = [Md(Ae), Md(Ai)];
        return out;
      });
      return { stage: stg.i + 1, parts };
    });
  }
  function meshBacklashFromAsn(stg, j) {
    // circumferential backlash at the working circle (µm): −(Ast1 + Ast2)·dw/d ± 2·Δa·tan αwt (Δa = pin position / centre tolerance)
    const g = stg.geo, ms = g.meshes[j], a = ms.a, c = ms.c, A1 = asnOf(stg.st, j), A2 = asnOf(stg.st, j + 1);
    const k = Math.cos(g.at) / Math.cos(ms.aw) / Math.cos(g.br), da = (+((stg.st.aTol || [])[j]) || 0) / 1000, ta = 2 * da * Math.tan(ms.aw);
    const sgn = ms.internal ? -1 : 1;
    const jmin = -(A1[0] + A2[0]) * k - ta, jmax = -(A1[1] + A2[1]) * k + ta;   // centre tolerance ± (external: +Δa opens; internal: −Δa opens)
    return [Math.max(0, jmin) * 1000, jmax * 1000, sgn];
  }
  function backlash(ctx, D) {
    // circumferential backlash per mesh (µm) → carrier free play at pin radius, propagated to output.
    // jt mode: entered backlash; asn mode: from tooth thickness allowances + centre tolerance (min / max, mean used for the verdict)
    let out = 0, outMin = 0, outMax = 0, ratioAfter = 1;
    const st = [...ctx.stages].reverse().map(stg => {
      const a = stg.geo.meshes[0].center, fromAsn = stg.st.blMode === 'asn';
      const rng = fromAsn ? [0, 1].map(j => meshBacklashFromAsn(stg, j)) : null;
      const j = fromAsn ? rng.map(r => (r[0] + r[1]) / 2) : (stg.st.jt || [0, 0]);
      const toRad = jj => ((jj[0] + jj[1]) / 2) / 1000 / a;
      const th = toRad(j), thMin = fromAsn ? toRad(rng.map(r => r[0])) : th, thMax = fromAsn ? toRad(rng.map(r => r[1])) : th;
      out += th / ratioAfter; outMin += thMin / ratioAfter; outMax += thMax / ratioAfter; const rA = ratioAfter; ratioAfter *= stg.geo.ratio;
      const am = v => v * 180 / Math.PI * 60;
      return { stage: stg.i + 1, mode: fromAsn ? 'asn' : 'jt', jt: j, jtRange: rng && rng.map(r => [r[0], r[1]]), arcmin: am(th), arcminOut: am(th / rA), arcminOutRange: [am(thMin / rA), am(thMax / rA)] };
    }).reverse();
    const am = v => v * 180 / Math.PI * 60;
    return { stages: st, arcmin: am(out), range: [am(outMin), am(outMax)] };
  }
  function stiffness(ctx, D) {
    // gear-mesh + pin compliance only (housing, carrier, bearings not included) at rated torque
    const r = evaluate(ctx, { Tout: D.req.Trated, rpm: D.req.rpm, cycles: () => 1e8 });
    let c = 0, ratioAfter = 1;
    const per = [...ctx.stages].reverse().map(stg => {
      const so = r.stages[stg.i], a = stg.geo.meshes[0].center, n = stg.st.n;
      const keff = so.ktan * 1000;                  // N/mm, planet tangential incl. pin
      const Kmesh = n * keff * a * a / 1000;        // N·m/rad at carrier (meshes + pins)
      const Kc = 1 / (1 / Kmesh + 1 / so.car.ktor);  // + carrier web windup
      c += 1 / (Kc * ratioAfter ** 2);
      ratioAfter *= stg.geo.ratio;
      return { stage: stg.i + 1, Kc, Kmesh, Kcar: so.car.ktor };
    }).reverse();
    const K = 1 / c; // N·m/rad at output
    return { stages: per, NmPerArcmin: K * Math.PI / (180 * 60) };
  }

  // ------------------------------------------------------------ Monte Carlo (virtual validation)
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function drawSample(ctx, D, r) {
    const sample = { pos: [], stage: [], strength: { H: Math.exp(gauss(r) * D.reliability.covH), F: Math.exp(gauss(r) * D.reliability.covF) } };
    ctx.stages.forEach(stg => {
      const n = stg.st.n, util = D.mc.utilization; // fraction of tolerance used by the process (3σ = util·tol)
      sample.pos[stg.i] = Array.from({ length: n }, () => gauss(r) * D.loads.posError * util / 3);
      const fma = [0, 1].map(j => {
        const t = [stg.geo.tol[j ? 1 : 0], stg.geo.tol[j ? 2 : 1]];
        const h1 = gauss(r) * t[0].helixSlope * util / 3, h2 = gauss(r) * t[1].helixSlope * util / 3, cp = gauss(r) * D.loads.carrierParallel * util / 3;
        return Math.abs(h1 - h2 + cp);
      });
      const pitch = [0, 1].map(j => Math.abs(gauss(r)) * Math.max(stg.geo.tol[j ? 1 : 0].pitch, stg.geo.tol[j ? 2 : 1].pitch) * util / 3 * 2);
      const profile = [0, 1].map(j => Math.abs(gauss(r)) * Math.max(stg.geo.tol[j ? 1 : 0].profileForm, stg.geo.tol[j ? 2 : 1].profileForm) * util / 3);
      sample.stage[stg.i] = { fma, pitch, profile };
    });
    return sample;
  }
  function withStrength(ctx, f) {
    // temporarily scale material strengths for a sample
    const saved = ctx.stages.map(s => s.mats.map(m => [m.Hlim, m.Flim]));
    return {
      apply(sample) { ctx.stages.forEach(s => s.mats.forEach(m => { m.Hlim *= sample.strength.H; m.Flim *= sample.strength.F; })); },
      restore() { ctx.stages.forEach((s, i) => s.mats.forEach((m, k) => { m.Hlim = saved[i][k][0]; m.Flim = saved[i][k][1]; })); }
    };
  }
  function monteCarlo(D, nSamples, onProgress) {
    const Dm = JSON.parse(JSON.stringify(D));
    Dm.reliability = { ...D.reliability, mode: 'median' };
    const ctx = prepare(Dm);
    if (ctx.errors.length) return { error: ctx.errors };
    const r = rng(12345), caps = [], lives = [], kgs = [], khbs = [];
    for (let i = 0; i < nSamples; i++) {
      const sm = drawSample(ctx, Dm, r);
      const st = withStrength(ctx); st.apply(sm);
      const cyc = cyclesFor(Dm.req.lifeH);
      caps.push(capacity(ctx, { rpm: Dm.req.rpm, cycles: cyc, sample: sm }, Dm.req));
      lives.push(spectrumDamage(ctx, Dm, sm).minLife);
      const ev = evaluate(ctx, { Tout: Dm.req.Trated, rpm: Dm.req.rpm, cycles: cyc, sample: sm });
      kgs.push(Math.max(...ev.stages.map(s => s.Kg)));
      khbs.push(Math.max(...ev.rows.map(x => x.f.KHb)));
      st.restore();
      if (onProgress && i % 10 === 9) onProgress((i + 1) / nSamples);
    }
    const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return NaN; const k = (s.length - 1) * p, lo = Math.floor(k); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (k - lo); };
    const pass = lives.filter(l => l >= D.req.lifeH).length / lives.length;
    return {
      n: nSamples, capacity: { p10: q(caps, .1), p50: q(caps, .5), p90: q(caps, .9), mean: caps.filter(Number.isFinite).reduce((s, v) => s + v, 0) / Math.max(1, caps.filter(Number.isFinite).length), all: caps },
      life: { p10: q(lives, .1), p50: q(lives, .5), p90: q(lives, .9), all: lives },
      Kg: { p50: q(kgs, .5), p90: q(kgs, .9) }, KHb: { p50: q(khbs, .5), p90: q(khbs, .9) }, passLife: pass
    };
  }


  // ------------------------------------------------------------ one-at-a-time sensitivity (deterministic ISO design rating)
  function sensitivity(D) {
    const base = analyze(D);
    const b0 = base.capacityLife;
    const cases = [];
    const C = (label, f) => { const d = JSON.parse(JSON.stringify(D)); f(d); try { const o = analyze(d); cases.push({ label, value: o.errors.length ? NaN : o.capacityLife, life: o.errors.length ? NaN : o.spectrum.minLife }); } catch (e) { cases.push({ label, value: NaN }); } };
    for (const q of ['ML', 'MQ', 'ME']) if (q !== D.design.quality) C('재료 등급 ' + q, d => d.design.quality = q);
    const tolCases = D.loads?.basis !== 'ideal';   // ideal basis: tolerances do not enter the deterministic rating
    if (tolCases) {
    C('정밀도 1등급 향상', d => d.stages.forEach(s => s.grade = Math.max(1, s.grade - 1)));
    C('정밀도 1등급 저하', d => d.stages.forEach(s => s.grade = Math.min(11, s.grade + 1)));
    }
    for (const c of [0, 1, 3]) if (c !== D.stages[0].mod.crown) C('크라우닝 ' + c + ' µm', d => d.stages.forEach(s => s.mod.crown = c));
    C('치형 수정 적합 확인 (fZCa 1.07)', d => d.stages.forEach(s => s.mod.verified = 'qualified'));
    if (tolCases) C(D.loads.fmaMode === 'rss' ? '잇줄 오차 최악합' : '잇줄 오차 제곱합', d => d.loads.fmaMode = D.loads.fmaMode === 'rss' ? 'worst' : 'rss');
    C('썬 지지 강성 절반', d => d.loads.sunSupport = (D.loads.sunSupport || []).map(s => ({ ...s, k: s.k / 2, bearingK: (s.bearingK || 40) / 2 })));
    if (tolCases) C('썬 지지 유격 +3 µm (베어링 틈새)', d => d.loads.sunSupport = (D.loads.sunSupport || []).map(s => ({ ...s, play: (s.play || 0) + 3 })));
    if (tolCases) C('유성 위치오차 2배', d => d.loads.posError *= 2);
    C('2단 치폭 +25 %', d => { d.stages[d.stages.length > 1 && d.config.stages === 2 ? 1 : 0].b *= 1.25; });
    C('목표 수명 ½', d => d.req.lifeH /= 2);
    C('침탄강 (Eh, 700 HV)', d => d.materials.forEach(m => { m.family = 'Eh'; m.surfaceHRC = 60; m.coreHRC = 35; m.depth = 0.3; }));
    cases.forEach(c => c.delta = (c.value / b0 - 1) * 100);
    cases.sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0));
    return { base: b0, cases };
  }

  // ------------------------------------------------------------ full analysis
  function analyze(D) {
    const ctx = prepare(D);
    const out = { ctx, errors: ctx.errors, warns: [...ctx.warns] };
    if (ctx.errors.length) return out;
    const cyc = cyclesFor(D.req.lifeH);
    const ratedOp = { rpm: D.req.rpm, cycles: cyc };
    out.ratio = ctx.ratio;
    out.rated = evaluate(ctx, { ...ratedOp, Tout: D.req.Trated });
    out.capacityLife = capacity(ctx, ratedOp, D.req);              // constant torque for target life at rated speed
    out.capacityInf = capacity(ctx, { rpm: D.req.rpm, cycles: () => 1e10 }, D.req); // long-life (1e10) limit
    out.govRated = governing(ctx, { ...ratedOp, Tout: Math.max(out.capacityLife, 1e-6) }, D.req);
    const stTarget = { SH: D.req.SHstat, SF: D.req.SFstat };
    out.staticCap = capacity(ctx, { rpm: 0, static: true }, stTarget);
    out.peak = evaluate(ctx, { Tout: D.req.Tpeak, rpm: 0, static: true });
    out.emerg = evaluate(ctx, { Tout: D.req.Temerg, rpm: 0, static: true });
    out.peakS = Math.min(...out.peak.rows.map(r => Math.min(r.SH, r.SF)));
    out.emergS = Math.min(...out.emerg.rows.map(r => Math.min(r.SH, r.SF)));
    out.govStatic = governing(ctx, { rpm: 0, static: true, Tout: Math.max(out.staticCap, 1e-6) }, stTarget);
    out.spectrum = spectrumDamage(ctx, D);
    out.bearings = bearingLife(ctx, D);
    out.outBearing = outputBearing(ctx, D);
    out.carrierPin = carrierPin(ctx, D);
    out.lube = lubrication(ctx, D);
    if (out.lube.meshes.some(m => m.outOfRange)) out.warns.push(`스커핑: 하중 wBt ${Math.min(...out.lube.meshes.map(m => m.wBt)).toFixed(0)} N/mm < 150 N/mm — ISO/TS 6336-20/21 적용 범위 밖 (참고값)`);
    if (out.lube.lambdaMin < 1) out.warns.push(`유막비 λ 최소 ${out.lube.lambdaMin.toFixed(2)} (정격): 경계 윤활입니다. 극압(EP) 그리스·표면 조도 개선 없이는 마모·마이크로피팅 위험이 큽니다 (이 판정은 피팅·굽힘 강도 계산에 포함되지 않음).`);
    out.eff = efficiency(ctx, D, D.req.Trated);
    out.backlash = backlash(ctx, D);
    out.tooth = toothData(ctx);
    out.stiffness = stiffness(ctx, D);
    // case depth screen at peak torque
    out.caseDepth = out.peak.rows.map(r => ({ id: r.id, stage: r.stage, partName: r.partName, mesh: r.mesh, zMax: r.zMax, depth: ctx.stages[r.stage - 1].mats[r.part].depth, ratio: r.caseDepthRatio }));
    // reducer limit (rated, constant torque, target life): gear vs bearing
    const brCap = ctx.stages.map(stg => {
      const br = stg.st.bearing;
      // torque at which planet bearing L10 equals target life at rated speed (constant torque)
      const at = T => { const so = evaluate(ctx, { Tout: T, rpm: D.req.rpm, cycles: () => 1e8 }).stages[stg.i]; const P = so.pinForce / Math.max(1, br.count || 1); return (br.C / P) ** (10 / 3) * 1e6 / (so.planetRel * 60); };
      let lo = 1e-3, hi = 1e-3;
      if (!(at(lo) >= D.req.lifeH)) return 0;
      for (let i = 0; i < 80; i++) { hi = lo * 1.35; if (!(at(hi) >= D.req.lifeH)) break; lo = hi; }
      for (let i = 0; i < 40; i++) { const m = Math.sqrt(lo * hi); if (at(m) >= D.req.lifeH) lo = m; else hi = m; }
      return lo;
    });
    out.bearingCap = brCap;
    out.reducerCap = Math.min(out.capacityLife, ...brCap);
    out.reducerGov = out.reducerCap === out.capacityLife ? '기어 · ' + (out.govRated ? `${out.govRated.row.stage}단 ${out.govRated.row.mesh} ${out.govRated.row.partName} ${out.govRated.mode}` : '') : `${brCap.indexOf(out.reducerCap) + 1}단 유성 베어링`;
    out.register = register(ctx, D, out);
    out.verdict = verdict(D, out);
    return out;
  }

  function verdict(D, o) {
    const items = [];
    const add = (k, value, target, ok, unit, note) => items.push({ k, value, target, ok, unit, note });
    add('정격 토크 · 목표 수명 (기어)', o.capacityLife, D.req.Trated, o.capacityLife >= D.req.Trated, 'N·m', `${D.req.lifeH} h · ${D.req.rpm} rpm 일정 운전`);
    add('부하 스펙트럼 수명 (기어)', o.spectrum.minLife, D.req.lifeH, o.spectrum.minLife >= D.req.lifeH, 'h', 'Miner 누적손상');
    const bl = Math.min(...o.bearings.map(b => b.L10h));
    add('유성 베어링 L10 (스펙트럼)', bl, D.req.lifeH, bl >= D.req.lifeH, 'h', 'ISO 281 기본 수명');
    add('피크 토크 정적 안전율', o.peakS, Math.min(D.req.SHstat, D.req.SFstat), o.peakS >= Math.min(D.req.SHstat, D.req.SFstat), '', `${D.req.Tpeak} N·m`);
    add('비상 토크 정적 안전율', o.emergS, 1, o.emergS >= 1, '', `${D.req.Temerg} N·m`);
    const s0 = Math.min(...o.bearings.map(b => b.s0peak));
    add('유성 베어링 정적 s0 (피크)', s0, D.req.s0, s0 >= D.req.s0, '', 'C0 / P0');
    add('출력 베어링 L10', o.outBearing.L10h, D.req.lifeH, o.outBearing.L10h >= D.req.lifeH, 'h', '외부 하중·모멘트 포함');
    add('출력 베어링 정적 s0 (피크)', o.outBearing.s0peak, D.req.s0, o.outBearing.s0peak >= D.req.s0, '', 'C0 / P0');
    if (o.outBearing.roll) { const rs = o.outBearing.roll.peak.s0; add('출력 베어링 롤러 접촉 s0 (피크)', rs, D.req.s0, rs >= D.req.s0, '', '롤러 하중분포 · 4000 MPa 기준'); }
    const pinS = Math.min(...o.carrierPin.map(c => Math.min(c.Sbend, c.Spress, c.Sweb)));
    add('유성 핀·캐리어 정적 (피크)', pinS, 1, pinS >= 1, '', '핀 굽힘·구멍 면압·캐리어 기둥 굽힘');
    add('스커핑 안전율 (피크, 섬광온도)', o.lube.SBmin, D.req.SBmin || 1.5, o.lube.SBmin >= (D.req.SBmin || 1.5), '', `운전 ${D.lube.temp} °C · FZG ${D.lube.fzg}`);

    add('효율 (정격, 추정)', o.eff.total * 100, D.req.effMin, o.eff.total * 100 >= D.req.effMin, '%', '치합 + 기타 손실 가정');
    { const asn = o.backlash.stages.some(x => x.mode === 'asn'), bl = asn ? o.backlash.range[1] : o.backlash.arcmin; add(asn ? '출력 백래시 최대 (치두께 공차)' : '출력 백래시 (추정)', bl, D.req.backlashMax, bl <= D.req.backlashMax, 'arcmin', asn ? '치두께 하한 + 중심거리 공차' : '치합 백래시만'); }
    return items;
  }

  function register(ctx, D, o) {
    const R = [];
    const add = (group, item, value, src, basis) => R.push({ group, item, value, src, basis });
    add('요구', '정격·피크·비상 토크', `${D.req.Trated} / ${D.req.Tpeak} / ${D.req.Temerg} N·m`, '가정', '사용자 입력 · 실제 운전 조건으로 확정 필요');
    add('요구', '부하 스펙트럼', D.req.duty.map(l => `${l.torque}%×${l.time}%`).join(', '), '가정', '로봇 관절 대표 패턴 예시');
    add('하중', 'KA', D.loads.KA, D.loads.KA === 1 ? '모델' : '가정', '스펙트럼에 피크를 포함하므로 1.0');
    const so = o.rated.stages;
    so.forEach(s => add('하중', `${s.i + 1}단 Kγ`, s.Kg.toFixed(3), s.KgSrc, s.KgNote));
    add('하중', '썬 지지 (플로팅 아님)', ctx.stages.map(s => { const k = sunSupportK(D, s.i); return `${k.k.toFixed(1)} N/µm · 유격 ${k.play} µm`; }).join(' / '), '가정', '축·베어링(1단)·캐리어(2단) 반경 강성 추정 · Kγ에 가장 큰 영향');
    if (ctx.basis === 'iso') add('하중', 'KHβ 치폭 오차', 'Fβx = |1.33·B1·fsh − B2·fHβ5| (ISO 6336-1:2019 방법 C)', '규격', 'fHβ5 = 5급 잇줄 기울기 공차, B1·B2 = 리드 수정별 · KISSsoft와 같은 방식 · Kv·KHα는 정밀도 등급 공차');
    else if (ctx.basis === 'ideal') add('하중', '오차·공차', '0 (이론 계산)', '이론', '피치·치형·잇줄 오차, 유성 위치 오차, 캐리어 평행도 = 0 · 공차는 시편 시뮬레이션(11-1)에서만 무작위로 반영');
    else add('하중', 'fma (잇줄 오차)', D.loads.fmaMode === 'worst' ? '최악합 (식 64)' : '제곱합 (식 66)', '규격', 'ISO 1328 공차 + 캐리어 핀 구멍 평행도 ' + D.loads.carrierParallel + ' µm');
    add('하중', 'fsh (지지 변형)', '핀 + 캐리어 + 출력 베어링', '모델', '핀 보 처짐·기울기, 캐리어 기둥 비틀림(양단 지지), 출력 베어링 롤러 모델 기울기(마지막 단)');
    add('요소', '캐리어 기둥', ctx.stages.map(s => s.carrier?.web ? `평행 홈 A ${s.carrier.web.A.toFixed(0)} mm² · I ${s.carrier.web.I.toFixed(0)} mm⁴ ×${s.st.n}` : '편단 (기둥 없음)').join(' / '), '모델', '캐리어 형상(포켓 마감)에서 단면 계산 · 양단 고정 보 · 판 자체 변형은 강체');
    add('요소', '출력 베어링 롤러', `Z ${D.outBearing.Z} · Dw ${D.outBearing.Dw} · Lw ${D.outBearing.Lw} mm · 예압 ${D.outBearing.preload} µm`, '가정', 'Palmgren 선접촉 강성 · 접촉각 45° 교차 배열');
    add('윤활', '윤활제', `${D.lube.type === 'grease' ? '그리스' : '오일'} · ν40 ${D.lube.nu40} / ν100 ${D.lube.nu100} mm²/s · ${D.lube.temp} °C`, '가정', '제품 데이터시트 값 입력 · 운전 온도는 가정');
    add('윤활', '유막 두께', 'Dowson–Higginson (피치점)', '모델', `압력점도계수 ${D.lube.alphaP}e-8 /Pa · ${D.lube.type === 'grease' ? '그리스 기유 결핍 ×' + D.lube.starvation : '오일'} · Ra ≈ Rz/6`);
    add('윤활', '마찰계수', D.perf.muMode === 'fixed' ? `고정 ${D.perf.mu}` : 'ISO/TR 14179-2 식', D.perf.muMode === 'fixed' ? '가정' : '규격', '하중·속도·점도·조도 반영');
    add('윤활', '스커핑', 'Blok 섬광온도', '모델', `θS = 80 + (0.85 + 1.4·XW)·XL·FZG² · 벌크 온도 = 운전 온도 가정`);
    add('하중', 'KHβ', '탄성 스트립 + 크라우닝', '모델', 'ISO 6336-1 방법 C 보조 + 포물선 크라우닝 적분');
    add('하중', 'Kv, KHα', 'ISO 6336-1 방법 B', '규격', ctx.basis === 'ideal' ? '오차 0 (이론) · 시편 시뮬레이션에서 등급 공차 반영' : '정밀도 등급 공차 · 길들이기 포함');
    add('강도', 'ZB/ZD · fZCa', (ctx.stages[0].geo.meshes[0].fZCa).toFixed(2), '규격', 'ISO 6336-2:2019 표 3 · 치형 수정 근거 수준');
    add('강도', '수명계수 ZNT·YNT', 'ISO 표 2 곡선', '규격', '정적 → 내구 → 10¹⁰회 0.85 (일반 윤활)');
    add('강도', '재료 등급', D.design.quality, '가정', 'ME는 품질 증빙 필요 · 없으면 MQ');
    add('강도', '피로강도 산포 (시편 예측)', `σln H ${D.reliability.covH} · F ${D.reliability.covF}`, '가정', 'ISO 값 = 1 % 파손확률 · 중앙값 = ×exp(2.326σ)');
    add('요소', '유성 베어링 C / C0', ctx.stages.map(s => `${s.st.bearing.C}/${s.st.bearing.C0} N`).join(', '), '가정', '카탈로그 값 입력');
    add('요구', '관절 케이스', CASES[D.req.case]?.label || '사용자 정의', '가정', CASES[D.req.case]?.note || '직접 입력');
    add('요소', '출력 베어링 외부 하중', `Fr ${fmt0(D.req.ext.Fr)} N · Fa ${fmt0(D.req.ext.Fa)} N · M ${fmt0(D.req.ext.M)} N·m`, '가정', '관절 케이스에서 정격 토크 비례로 설정 · 실제 링크 하중으로 확정 필요');
    add('요소', '출력 베어링 C / C0 / 강성', `${D.outBearing.C}/${D.outBearing.C0} N · ${D.outBearing.Km} N·m/arcmin`, '가정', '카탈로그 값 입력');
    add('성능', '기타 손실', D.perf.otherLoss + ' %/단', '가정', '베어링·씰·교반');
    add('검증', '몬테카를로 공차 활용률', D.mc.utilization, '가정', '공정이 공차의 몇 %를 3σ로 쓰는지');
    return R;
  }

  const fmt0 = x => Number.isFinite(x) ? x.toFixed(0) : '—';
  // Robot joint cases: representative assumptions, scaled to the rated output torque T.
  // peak/emerg ratios, duty spectrum, joint output speed, life and link loads on the output bearing.
  const CASES = {
    'lower-pitch': { label: '하체 · 피치 (고관절·무릎·발목 피치)', peak: 3.0, emerg: 4.0, outRpm: 20, life: 5000, duty: [[100, 25], [60, 35], [30, 30], [10, 10]], ext: [15, 5, 0.8], note: '보행 하중을 받는 주 구동축 · 충격·피크 큼' },
    'lower-roll': { label: '하체 · 롤 (고관절·발목 롤)', peak: 2.5, emerg: 3.5, outRpm: 15, life: 5000, duty: [[100, 15], [60, 30], [30, 35], [10, 20]], ext: [12, 5, 1.0], note: '측방 균형 · 모멘트 하중 큼' },
    'lower-yaw': { label: '하체 · 요 (고관절 요)', peak: 2.0, emerg: 3.0, outRpm: 15, life: 5000, duty: [[100, 10], [50, 30], [20, 40], [5, 20]], ext: [8, 10, 0.6], note: '자중 축방향 하중 · 토크는 낮음' },
    'upper-pitch': { label: '상체 · 피치 (어깨·팔꿈치 피치)', peak: 2.5, emerg: 3.5, outRpm: 25, life: 8000, duty: [[100, 15], [60, 30], [30, 35], [10, 20]], ext: [6, 3, 0.5], note: '팔 자중 + 가반하중 · 중간 충격' },
    'upper-roll': { label: '상체 · 롤 (어깨 롤)', peak: 2.0, emerg: 3.0, outRpm: 25, life: 8000, duty: [[100, 10], [50, 30], [25, 40], [10, 20]], ext: [6, 3, 0.5], note: '팔 벌림 · 하중 보통' },
    'upper-yaw': { label: '상체 · 요 (허리·손목 요)', peak: 2.0, emerg: 3.0, outRpm: 30, life: 8000, duty: [[80, 10], [40, 30], [20, 40], [5, 20]], ext: [5, 8, 0.4], note: '회전 위주 · 축방향 자중' }
  };
  function applyCase(D, key, ratio) {
    const c = CASES[key]; D.req.case = key; if (!c) return D;
    const T = D.req.Trated;
    Object.assign(D.req, { Tpeak: +(T * c.peak).toFixed(2), Temerg: +(T * c.emerg).toFixed(2), lifeH: c.life, rpm: Math.round(c.outRpm * (ratio || 9)),
      duty: c.duty.map(([tq, tm]) => ({ torque: tq, time: tm, rpm: 0 })), ext: { Fr: +(c.ext[0] * T).toFixed(1), Fa: +(c.ext[1] * T).toFixed(1), M: +(c.ext[2] * T).toFixed(2) } });
    return D;
  }
  // Basic example = KISSsoft report "HDS_82pi_1stage_common_R2 · Planetary gear set (spur)", ISO 6336:2019.
  // Gear data, load, life, lubricant and materials as in the report; parts the report does not cover (pins, needles,
  // carrier, housing, output bearing) are assumed and scaled from the RDP-RH065 template (가정).
  function defaultDesign() {
    const D = templateDesign();
    const st = Object.assign(JSON.parse(JSON.stringify(D.stages[1])), {
      s: 28, p: 35, n: 3, m: 0.4, beta: 0, alpha: 20, b: 5, xs: 0.1828, xp: 0.0745, xr: 0.3318, autoRingShift: false, grade: 6,
      mod: { crown: 0, tip: 2, verified: 'none' }, sunBore: 0, planetBore: 10, ringOD: 48, tipChamfer: [0, 0, 0],
      asn: [[0, 0], [-0.054, -0.084], [-0.054, -0.084]], cutter: { z0: 32, x0: 0 },        // DIN 3967 cd25 (planet, ring), ring by pinion cutter z0 32
      bearing: { name: '풀니들 Ø1.5 × 16 (가정)', C: 1900, C0: 1800, count: 1 }, jt: [20, 25],
      pin: { d: 7, type: 'double', material: 'SUJ2', wall: 1.5, allow: 1200, holeMode: 'through', depth: null },
      carrier: { width: 8.5, groove: 5.5, pocket: null, pocketShape: 'slot', outerD: null, innerD: null, bossD: null, bossT: 4, material: 'S45C' } });
    Object.assign(D, {
      name: 'HDS 82pi · 1단 유성 (KISSsoft 보고서 R2 기준)',
      config: { stages: 1, sharedRing: false, floatingSun: false },
      stages: [st, JSON.parse(JSON.stringify(st))],
      materials: Array.from({ length: 6 }, () => ({ family: 'Eh', surfaceHRC: 61, coreHRC: 28, depth: 0.3 })),
      lube: { type: 'oil', base: 'mineral', nu40: 220, nu100: 17.5, temp: 70, rho: .895, alphaP: 2.0, starvation: 1, XL: 1, XW: 1, fzg: 12, rzFlank: 4.8, rzRoot: 20 },
      outBearing: { name: '크로스 롤러 Dw 2 (가정 · 카탈로그 확인)', rows: 2, type: 'roller', C: 2340, C0: 3220, dp: 40.6, Km: 30, Z: 0, Dw: 2, Lw: 2, preload: 0 },
      housing: { wall: 2, coverT: 6, flangeT: 3, boltN: 6, boltD: 3 },
      geom: {},
      needle: [{ use: true, apply: true, Dw: 1.5, Lw: null, Z: 16, HRCpin: 60, HRCbore: 58 }, { use: true, apply: true, Dw: 1.5, Lw: null, Z: 16, HRCpin: 60, HRCbore: 58 }],
      verify: { feaKcar: [null, null], feaSigmaF: null, testT: null, testNote: '' },
      anim: { rpm: 3010, slow: 0.02 }
    });
    // report: carrier torque 16.2 N·m, sun 3010 rpm, 100 h, required SH 1.0 / SF 1.4, KA 1.25, Kγ 1.00
    Object.assign(D.req, { Trated: 16.2, Tpeak: 16.2, Temerg: 16.2, rpm: 3010, lifeH: 100, SH: 1.0, SF: 1.4, ext: { Fr: 0, Fa: 0, M: 0 }, duty: [{ torque: 100, time: 100, rpm: 0 }] });
    Object.assign(D.loads, { KA: 1.25, kgMode: 'fixed', kgFixed: 1.0, sunSupport: [{ ...D.loads.sunSupport[1], od: 11, id: 0 }] });
    return D;
  }
  // Template = RDP-RH065(9N) as drawn (EasternGear 300001–300009, 2026-06). Values not on the drawings are marked 가정 in the register.
  // Kept as the scaling base of the recommender (추천 제원) and for the 2-stage hollow layout.
  function templateDesign() {
    // SCM440 ion-nitrided: surface HRC 58–62, core HRC 25–28, effective case 0.1 mm (gears 3, 5, 7, 8 and housing ring 2)
    const mat = () => ({ family: 'NV', surfaceHRC: 60, coreHRC: 26.5, depth: 0.10 });
    const stage = (b, extra) => Object.assign({ s: 46, p: 23, n: 3, m: 0.6, beta: 12, alpha: 20, b, xs: 0, xp: 0, xr: 0, autoRingShift: true,
      grade: 7,                                         // 정밀도 '-' (hob/skiving, nitrided, not ground) → ISO 7 assumed
      mod: { crown: 0, tip: 0, verified: 'none' }, sunBore: null, planetBore: 7, ringOD: null,
      bearing: { name: '풀니들 Ø1.5 × 11 (SUJ2, HRC 58–62)', C: 1600, C0: 1500, count: 1 }, jt: [20, 25] }, extra);
    return {
      schema: 'pgd/1', name: 'RDP-RH065 (9N) · 중공 확장형 · 도면 기준',
      req: { case: 'custom', ext: { Fr: 135, Fa: 45, M: 7.2 }, Trated: 9, Tpeak: 28, Temerg: 40, rpm: 1000, lifeH: 5000, SH: 1.0, SF: 1.4, SHstat: 1.0, SFstat: 1.2, s0: 1.0, SBmin: 1.5, effMin: 85, backlashMax: 15,
        duty: [{ torque: 100, time: 20, rpm: 0 }, { torque: 70, time: 30, rpm: 0 }, { torque: 40, time: 40, rpm: 0 }, { torque: 10, time: 10, rpm: 0 }] },
      config: { stages: 2, sharedRing: true, floatingSun: false },
      design: { quality: 'MQ' },
      stages: [
        // 1단: S1 (300004) bore Ø23H7 at the teeth (6703 seat for S2), C1 (300005) single plate t4 Ø52.5, bore Ø17H7, 3×Ø4M7 THRU on PCD 42.325
        stage(5, { sunBore: 23, ringOD: 61,
          pin: { d: 4, type: 'single', material: 'SUJ2', wall: 4, allow: 1200, holeMode: 'through', depth: null },
          carrier: { width: 4, outerD: 52.5, innerD: 17, bossT: 0, bossD: null, axialClearance: 0.3, material: 'S45C' } }),
        // 2단: S2 (300006) bore Ø15, C2 (300007) one-piece double carrier: input plate 2.2 · planet seat 6.2 · output body,
        // pockets 3×20 straight slots, pins Ø4M7 blind DP12 from the input face. Plates modelled symmetric (2.9 each = same pin span 9.1 mm).
        stage(6, { sunBore: 15,
          pin: { d: 4, type: 'double', material: 'SUJ2', wall: 2.9, allow: 1200, holeMode: 'blind', depth: 12 },
          carrier: { width: 12, groove: 6.2, pocket: 20, pocketShape: 'slot', outerD: 52.5, innerD: 32, bossD: 50, bossT: 9.6, material: 'S45C' } })
      ],
      materials: Array.from({ length: 6 }, mat),
      lube: { type: 'grease', nu40: 100, nu100: 11, temp: 50, rho: .88, alphaP: 2.0, starvation: .7, XL: 1, XW: 1, fzg: 12, rzFlank: 2, rzRoot: 6 },
      // pin holes ⌖Ø0.01 → ±5 µm; ⊥0.01 A → carrier parallelism 10 µm.
      // S1: 6705DD in the cover (CN radial clearance ≥ 5 µm → free radius 2.5 µm), journal Ø25 / bore Ø17.5.
      // S2: 6703DD inside the S1 bore + 6705DD inside the C2 bore (straddle); 6703 CN ≥ 3 µm → 1.5 µm. Bearing stiffnesses are assumed.
      loads: { basis: 'ideal', KA: 1.0, kgMode: 'model', kgFixed: 1.1, posError: 5, sunSupport: [{ mode: 'structure', k: 20, play: 2.5, bearingK: 30, od: 25, id: 17.5, overhang: 7.8 }, { mode: 'structure', k: 20, play: 1.5, bearingK: 30, od: 17, id: 15, overhang: 3 }], fmaMode: 'rss', carrierParallel: 10, extraFsh: [0, 0], reverse: false },
      reliability: { mode: 'iso', covH: 0.08, covF: 0.07 },
      perf: { muMode: 'model', mu: 0.06, otherLoss: 1.5 },
      // output: RAU5005C0 × 2 between the C2 Ø50g6 seat and the housing Ø61H7 bore, ISTW-50 snap ring. Ratings not on the drawing → 가정.
      outBearing: { name: 'RAU5005C0 × 2 (Ø50/Ø61, 카탈로그 값 확인 필요)', rows: 2, type: 'roller', C: 4000, C0: 5500, dp: 55.5, Km: 30, Z: 0, Dw: 2.5, Lw: 2.5, preload: 0 },
      carrier: { allowP: 300, allowB: 250 },
      housing: { wall: 2, coverT: 8.8, flangeT: 4, boltN: 6, boltD: 3 },
      geom: { inshaft: { id: 15 }, sun1: { hubInOD: 25, hubInL: 7.5 }, sun2: { hubInOD: 25, hubInL: 13 } },   // S1 journal Ø25g6 × 7.5, S2 journal Ø25g6 (shape only)
      struct: { ringHousing: 'integral', c1s2: 'pin', c1s2Dim: { d: 17, L: 4.5, p: 40, n: 6, dp: 3, pcd: 21.5 }, s1motor: 'flange', s1Dim: { d: 17.5, L: 7.5, p: 40, n: 4, bd: 1.6, pcd: 22 }, c1Support: 'nested', obPos: 'outside' },
      needle: [{ use: true, apply: true, Dw: 1.5, Lw: null, Z: 11, HRCpin: 60, HRCbore: 58 }, { use: true, apply: true, Dw: 1.5, Lw: null, Z: 11, HRCpin: 60, HRCbore: 58 }],
      verify: { feaKcar: [null, null], feaSigmaF: null, testT: 28, testNote: '시험성적서 정격 (RDP-RH065 9N)' },
      anim: { rpm: 1000, slow: 0.02 },
      mc: { samples: 200, utilization: 0.7 }
    };
  }

  const api = { shiftMap, shiftCandidates, shiftScore, lubrication, rollerModel, carrierModel, sunSupportK, viscosityAt, CASES, applyCase, outputBearing, carrierPin, sensitivity, analyze, prepare, evaluate, capacity, monteCarlo, geometry, ringTeeth, ringShiftOffset, matchRingShift, sharedStage, tolerances, material, FAMILY, hrc2hv, hv2hrc, curve, ZN, YN, defaultDesign, templateDesign, cyclesFor, spectrumDamage, NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PGD = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
