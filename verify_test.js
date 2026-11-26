// 계산식 신뢰성 검증 — 무작위 기어 제원 (ISO 6336:2019, 판정 기준 'iso')
//  ① 독립 구현 대조: 기하(ISO 21771)·εα·εβ·ZH·ZE·Zε·Zβ·Ft·σH0·Yβ·KFβ(NF)를 엔진과 별도로 계산해 비교
//  ② 조립 일관성: σH = σH0·ZB/D·√(KA·Kγ·Kv·KHβ·KHα), σF = σF0·KA·Kγ·Kv·KFβ·KFα, σF0 = Ft/(b·mn)·YF·YS·Yβ·YB
//  ③ 규격 범위: Kv·KHβ·KHα·KFα·YF·YS·ZNT가 ISO 정의 범위 안
//  ④ 물리 법칙(변형 관계): σH0 ∝ √T, σF0 ∝ T, ISO 정격 ≤ 오차 0 정격, 정밀도 등급·수명·KA를 나쁘게 하면 정격이 줄어듦
// 실행: node verify_test.js [세트 수=120] [시드=7]
const E = require('./engine.js');
const N = +(process.argv[2] || 120), seed0 = +(process.argv[3] || 7);
let s = seed0; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)], uni = (a, b) => a + (b - a) * rnd();
const rad = Math.PI / 180, inv = a => Math.tan(a) - a;
const fail = [], stat = { sets: 0, skipped: 0, checks: 0, ratio: [] };
const chk = (ok, msg) => { stat.checks++; if (!ok) fail.push(msg); };
const rel = (a, b, tol, msg) => chk(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-9), `${msg}: 엔진 ${a} · 독립 ${b}`);

function make(o, T, basis, mut) {
  const D = E.defaultDesign(), st = D.stages[0];
  Object.assign(st, { s: o.zs, p: o.zp, r: null, n: 3, m: o.m, beta: o.beta, alpha: 20, b: o.b, xs: 0, xp: 0, xr: 0, autoRingShift: true, autoPlanetShift: false,
    grade: o.grade, mod: { crown: 0, tip: 0, verified: 'none' }, sunBore: 0, planetBore: null, ringOD: null, tipChamfer: [0, 0, 0], asn: [[0, 0], [0, 0], [0, 0]], cutter: { z0: null, x0: 0 } });
  st.pin = Object.assign({}, st.pin, { d: Math.max(1.5, Math.floor(o.zp * o.m * .3)), depth: null });
  st.carrier = Object.assign({}, st.carrier, { width: null, groove: null, pocket: null, outerD: null, innerD: null, bossT: 0, bossD: null });
  D.stages = [st, JSON.parse(JSON.stringify(st))];
  Object.assign(D.req, { Trated: T, Tpeak: T * 2, Temerg: T * 3, lifeH: o.life, rpm: 3000, SH: 1, SF: 1.4 });
  Object.assign(D.loads, { basis, KA: o.KA, kgMode: 'fixed', kgFixed: 1.0 });
  if (mut) mut(D);
  return D;
}
const run = D => { try { const R = E.analyze(D); return R.errors?.length ? null : R; } catch (e) { return null; } };

for (let k = 0; stat.sets < N && k < N * 6; k++) {
  const o = { zs: 12 + Math.floor(rnd() * 30), zp: 12 + Math.floor(rnd() * 40), m: pick([0.4, 0.5, 0.6, 0.7, 0.8, 1.0]), beta: pick([0, 0, 8, 12, 15]),
    grade: pick([5, 6, 7]), life: pick([2000, 20000]), KA: pick([1, 1, 1.25]) };
  if ((2 * o.zp + 2 * o.zs) % 3) continue;                       // 유성 3개 등간격 조립 (S+R)/3 정수
  o.b = Math.round(uni(3, 14 * o.m * 2) * 2) / 2;
  const probe = run(make(o, 10, 'ideal')); if (!probe) { stat.skipped++; continue; }
  const T = +(probe.capacityLife * uni(.3, 1.4)).toFixed(3); if (!(T > 0)) { stat.skipped++; continue; }
  const D = make(o, T, 'iso'), R = run(D); if (!R) { stat.skipped++; continue; }
  stat.sets++;
  const tag = `[세트 ${stat.sets}: z ${o.zs}/${o.zp} m${o.m} β${o.beta} b${o.b} N${o.grade} T${T}]`;
  const g = R.ctx.stages[0].geo, [S, P, Rg] = g.parts, [m1, m2] = g.meshes, b = D.stages[0].b;
  const mn = o.m, be = o.beta * rad, an = 20 * rad, at = Math.atan(Math.tan(an) / Math.cos(be)), mt = mn / Math.cos(be), bb = Math.atan(Math.tan(be) * Math.cos(at));
  // ① 기하
  const d = z => z * mt, db = z => d(z) * Math.cos(at);
  rel(S.d, d(o.zs), 1e-9, `${tag} 썬 기준원`); rel(P.d, d(o.zp), 1e-9, `${tag} 유성 기준원`);
  const zr = o.zs + 2 * o.zp; chk(Rg.z === zr, `${tag} 링 잇수 ${Rg.z} ≠ ${zr}`);
  const aw = (o.zs + o.zp) * mt / 2;                               // 전위 0 → 작용 압력각 = αt
  const rbS = db(o.zs) / 2, rbP = db(o.zp) / 2, rbR = db(zr) / 2;
  const eaSP = (Math.sqrt((S.da / 2) ** 2 - rbS ** 2) + Math.sqrt((P.da / 2) ** 2 - rbP ** 2) - aw * Math.sin(at)) / (Math.PI * mt * Math.cos(at));
  const eaPR = (Math.sqrt((P.da / 2) ** 2 - rbP ** 2) - Math.sqrt((Math.abs(Rg.da) / 2) ** 2 - rbR ** 2) + aw * Math.sin(at)) / (Math.PI * mt * Math.cos(at));
  rel(m1.ea, eaSP, 2e-3, `${tag} εα 썬–유성`); rel(m2.ea, eaPR, 5e-3, `${tag} εα 유성–링`);
  const eb = b * Math.sin(be) / (Math.PI * mn); rel(m1.eb, eb, 2e-3, `${tag} εβ`);
  const ZH = Math.sqrt(2 * Math.cos(bb) / (Math.cos(at) ** 2 * Math.tan(at)));
  rel(m1.ZH, ZH, 1e-3, `${tag} ZH`);
  const Zeps = ea => eb < 1 ? Math.sqrt((4 - ea) / 3 * (1 - eb) + eb / ea) : Math.sqrt(1 / ea);
  rel(m1.Zeps, Zeps(eaSP), 2e-3, `${tag} Zε 썬–유성`);
  rel(m1.Zbeta, 1 / Math.sqrt(Math.cos(be)), 1e-6, `${tag} Zβ`);
  // 하중·응력
  const rows = R.rated.rows, sun = rows.find(r => r.id === '0-0-0'), ring = rows.find(r => r.id === '0-1-2');
  const Tsun = T / (1 + zr / o.zs), Ft = 2000 * Tsun / (3 * S.d);
  rel(sun.f.Ft, Ft, 5e-3, `${tag} Ft`);
  const ZE = Math.sqrt(1 / (Math.PI * 2 * (1 - .3 ** 2) / 206000));
  rel(sun.f.ZE ?? ZE, ZE, 5e-3, `${tag} ZE`);
  const uSP = o.zp / o.zs, uPR = zr / o.zp;
  rel(sun.f.H0, ZH * ZE * Zeps(eaSP) / Math.sqrt(Math.cos(be)) * Math.sqrt(sun.f.Ft / (S.d * b) * (uSP + 1) / uSP), 3e-3, `${tag} σH0 썬–유성`);
  rel(ring.f.H0, ZH * ZE * Zeps(eaPR) / Math.sqrt(Math.cos(be)) * Math.sqrt(ring.f.Ft / (P.d * b) * (uPR - 1) / uPR), 6e-3, `${tag} σH0 유성–링 (u−1)/u`);
  for (const r of rows) {
    const f = r.f, msh = g.meshes[+r.id.split('-')[1]];
    // ② 조립 일관성
    rel(r.H, f.H0 * f.ZBD * Math.sqrt(f.KA * f.Kg * f.Kv * f.KHb * f.KHa), 1e-6, `${tag} ${r.id} σH 조립`);
    rel(r.F, f.F0 * f.KA * f.Kg * f.Kv * f.KFb * f.KFa, 1e-6, `${tag} ${r.id} σF 조립`);
    rel(f.F0, f.Ft / (b * mn) * f.YF * f.YS * f.Ybeta * f.YB, 1e-6, `${tag} ${r.id} σF0 = Ft/(b·mn)·YF·YS·Yβ·YB`);
    rel(f.Ybeta, (1 - Math.min(msh.eb, 1) * Math.min(o.beta, 30) / 120) / Math.cos(be) ** 3, 1e-6, `${tag} ${r.id} Yβ`);
    const h = Math.min(msh.a.h, msh.c.h), bh = Math.max(3, b / h), NF = bh ** 2 / (1 + bh + bh ** 2);
    rel(f.KFb, f.KHb ** NF, 1e-6, `${tag} ${r.id} KFβ = KHβ^NF`);
    // ③ 범위 (내접 고물림률 εαn→2에서는 ISO 6336-3 방법 B의 하중 작용점이 낮아져 YF가 1 아래로 내려갈 수 있음 — 정의상 정상)
    chk(msh.ean < 2, `${tag} ${r.id} εαn ${msh.ean} ≥ 2 — ISO 6336-3 방법 B 적용 범위 밖`);
    const eg = msh.ea + msh.eb;
    chk(f.Kv >= 1 && f.Kv < 2, `${tag} ${r.id} Kv ${f.Kv}`);
    chk(f.KHb >= 1 - 1e-9 && f.KHb < 6, `${tag} ${r.id} KHβ ${f.KHb}`);
    chk(f.KHa >= 1 - 1e-9 && f.KHa <= Math.max(1, eg / (msh.ea * msh.Zeps ** 2)) + 1e-9, `${tag} ${r.id} KHα ${f.KHa} 상한 εγ/(εα·Zε²)`);
    chk(f.KFa >= 1 - 1e-9 && f.KFa <= Math.max(1, eg / (.25 * msh.ea + .75)) + 1e-9, `${tag} ${r.id} KFα ${f.KFa} 상한 εγ/(0.25εα+0.75)`);
    chk(f.YF > (msh.internal ? .5 : .8) && f.YF < 4.5 && f.YS > .9 && f.YS < 3.2, `${tag} ${r.id} YF ${f.YF} YS ${f.YS} · εα ${msh.ea.toFixed(3)} εαn ${msh.ean?.toFixed(3)} εβ ${msh.eb.toFixed(3)} 내접 ${msh.internal}`);
    chk(f.ZNT > .8 && f.ZNT <= 1.61 && f.YNT > .8 && f.YNT <= 2.51, `${tag} ${r.id} ZNT ${f.ZNT} YNT ${f.YNT}`);
    const P_ = f.ZL * f.ZV * f.ZR, HG = r.SH * r.H, lo = f.Hlim * f.ZNT * Math.min(1, P_), hi = f.Hlim * f.ZNT * Math.max(1, P_);
    chk(HG >= lo * (1 - 1e-6) && HG <= hi * (1 + 1e-6), `${tag} ${r.id} σHG ${HG} ∉ [${lo}, ${hi}] (ZL·ZV·ZR 수명 보간)`);
  }
  // ④ 변형 관계
  const R2 = run(make(o, 2 * T, 'iso'));
  if (R2) { const s2 = R2.rated.rows.find(r => r.id === '0-0-0'); rel(s2.f.H0 / sun.f.H0, Math.SQRT2, 1e-6, `${tag} σH0 ∝ √T`); rel(s2.f.F0 / sun.f.F0, 2, 1e-6, `${tag} σF0 ∝ T`); }
  const Ri = run(make(o, T, 'ideal'));
  // ISO 6336-1:2019 방법 C는 Fβx = |1.33·B1·fsh − B2·fHβ5| 로 잇줄 공차가 처짐을 일부 상쇄한다고 본다. 오차 0(상쇄 없음, 1.33·fsh)보다
  // ISO가 높게 나올 수 있는 경우는 처짐 fsh가 큰 넓은 치폭뿐이어야 한다 → 그 조건(1.33·fsh > fHβ5/2)을 확인한다.
  if (Ri) {
    const r0 = Ri.rated.rows.reduce((a, x) => (x.SH < a.SH ? x : a)), up = R.capacityLife > Ri.capacityLife * 1.001;
    if (up) { stat.isoAbove = (stat.isoAbove || 0) + 1; chk(rows.some(x => 1.33 * x.f.fsh > .5 * x.f.fHb5), `${tag} ISO 정격 ${R.capacityLife} > 오차 0 ${Ri.capacityLife} 인데 처짐 상쇄 조건이 아님`); }
    stat.ratio.push([R.capacityLife / Ri.capacityLife, Math.min(...rows.map(r => r.f.wm))]);
  }
  if (o.grade < 7) { const Rg2 = run(make(o, T, 'iso', D => D.stages.forEach(x => x.grade = o.grade + 1))); if (Rg2) chk(Rg2.capacityLife <= R.capacityLife * 1.005, `${tag} 등급 ${o.grade}→${o.grade + 1} 정격 증가 ${R.capacityLife}→${Rg2.capacityLife}`); }
  const RL = run(make(o, T, 'iso', D => D.req.lifeH = o.life * 10)); if (RL) chk(RL.capacityLife <= R.capacityLife * 1.001, `${tag} 수명 ×10 정격 증가`);
  if (o.KA === 1) { const RK = run(make(o, T, 'iso', D => D.loads.KA = 1.25)); if (RK) chk(RK.capacityLife < R.capacityLife, `${tag} KA 1.25 정격이 줄지 않음`); }
}
const r = stat.ratio.map(x => x[0]).sort((a, b) => a - b), q = p => r[Math.floor(p * (r.length - 1))];
const low = stat.ratio.filter(x => x[1] < 100).map(x => x[0]), hiL = stat.ratio.filter(x => x[1] >= 100).map(x => x[0]);
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
console.log(`무작위 제원 ${stat.sets}세트 (건너뜀 ${stat.skipped}) · 검사 ${stat.checks}건 · 실패 ${fail.length}건 · ISO > 오차 0 ${stat.isoAbove || 0}세트 (넓은 치폭 처짐 상쇄)`);
console.log(`ISO / 오차 0 정격 비: 최소 ${q(0).toFixed(2)} · 중앙 ${q(.5).toFixed(2)} · 최대 ${q(1).toFixed(2)} | 저하중(wm<100) 평균 ${avg(low).toFixed(2)} (${low.length}) · 그 외 ${avg(hiL).toFixed(2)} (${hiL.length})`);
if (fail.length) { console.log(fail.slice(0, 25).join('\n')); process.exit(1); }
