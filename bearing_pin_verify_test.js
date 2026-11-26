// 유성 베어링 · 유성 핀 계산 독립 검증 (남은 과제 ②): 엔진 값을 교과서 식으로 다시 계산해 대조한다
//  - 유성 상대 회전수 n_rel = (n_in − n_c)·zs/zp (단별 입력 회전수 n_in, 캐리어 n_c = n_in / i)
//  - 핀 하중 F = Kγ · T_c / (n · a) (T_c 그 단 캐리어 토크, a 작동 중심거리)          — 핀 피크
//  - L10h = (C / Peq)^(10/3) · 10⁶ / (60 · n_rel) (ISO 281 롤러)                       — 유성 베어링
//  - s0 = C0 / P0 (P0 = 피크 핀 하중 / 베어링 수)                                       — 정적 안전율
//  - 핀 전단 τ = 4/3 · V / (π d² / 4) (원형 단면 최대 전단, V = 외팔 F · 양단은 큰 쪽 반력 F/2 ~ F)
//  - 핀 굽힘: 양단 지지 F·L/8 ≤ M ≤ F·L/4, 외팔 F·L/2 ≤ M ≤ F·L (σ = 32M / πd³)
const assert = require('assert');
const E = require('./engine.js'); globalThis.PGDBearings = require('./bearings.js');
require('./carrier-geometry.js'); require('./viewer3d.js'); require('./checks.js');
const REC = require('./recommend.js'), BF = require('./bearing-first.js'), Q = require('./request.js');
const env = { E, C: globalThis.PGDChecks, REC, PG: globalThis.PGD3D };
let n = 0, fails = 0;
const near = (a, b, rel, msg) => { n++; if (!(Math.abs(a - b) <= rel * Math.max(1e-9, Math.abs(b)))) { fails++; console.log('FAIL', msg, a, b); } };
const within = (v, lo, hi, msg) => { n++; if (!(v >= lo * (1 - 1e-6) && v <= hi * (1 + 1e-6))) { fails++; console.log('FAIL', msg, v, [lo, hi]); } };
function check(name, D) {
  globalThis.PGDChecks.ensure(D); globalThis.PGDChecks.applyNeedles(D);
  const R = E.analyze(D); assert.deepStrictEqual(R.errors, [], name);
  const S = R.ctx.stages;
  S.forEach((s, i) => {
    const g = s.geo, zs = g.parts[0].z, zp = g.parts[1].z, a = g.meshes[0].center, st = s.st, b = R.bearings[i], p = R.carrierPin[i];
    const before = S.slice(0, i).reduce((v, t) => v * t.geo.ratio, 1), after = S.slice(i + 1).reduce((v, t) => v * t.geo.ratio, 1);
    const nIn = D.req.rpm / before, nc = nIn / g.ratio;
    near(b.planetRpm, (nIn - nc) * zs / zp, 1e-9, `${name} ${i + 1}단 유성 상대 회전수`);
    near(b.L10h, (b.C / b.Peq) ** (10 / 3) * 1e6 / (60 * b.planetRpm), 1e-9, `${name} ${i + 1}단 L10h`);
    const kg = R.rated.rows.find(r => r.stage === i + 1).f.Kg, Tc = D.req.Tpeak / after;
    near(p.peak.F, kg * Tc * 1000 / (st.n * a), 1e-6, `${name} ${i + 1}단 핀 피크 하중`);
    near(b.s0peak, b.C0 / (p.peak.F / Math.max(1, st.bearing.count || 1)), 1e-6, `${name} ${i + 1}단 s0`);
    const A = Math.PI * p.d ** 2 / 4;
    if (p.type === 'double') within(p.peak.tau, 4 / 3 * (p.peak.F / 2) / A, 4 / 3 * p.peak.F / A, `${name} ${i + 1}단 핀 전단 (양단: 큰 쪽 반력)`);
    else near(p.peak.tau, 4 / 3 * p.peak.F / A, 1e-6, `${name} ${i + 1}단 핀 전단`);
    const k = 32 / (Math.PI * p.d ** 3), F = p.peak.F, L = p.span;
    if (p.type === 'double') within(p.peak.sigma, F * L / 8 * k, F * L / 4 * k, `${name} ${i + 1}단 핀 굽힘 (양단)`);
    else within(p.peak.sigma, F * L / 2 * k, F * L * k, `${name} ${i + 1}단 핀 굽힘 (외팔)`);
  });
}
(async () => {
  check('HDS 82pi', E.defaultDesign());
  check('RH065', E.templateDesign());
  for (const [B, i, o] of [['THK RU42', 25, {}], ['THK RU42', 25, { O1: 'Y', O2: 'Y' }], ['THK RU66', 9, { O2: 'Y', O1: 'Y' }], ['THK RU42', 5, {}]]) {
    const r = await BF.run(Q.parseBF({ I7: i, B1: B, I3: 3000, ...o }), env); assert.strictEqual(r.status, 'ok', r.error);
    r.top.forEach(x => check(`${B} i${i} ${x.tag}`, JSON.parse(JSON.stringify(x.D))));
  }
  console.log(`유성 베어링 · 핀 독립 검증: ${n}건 · 실패 ${fails}건`);
  if (fails) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
