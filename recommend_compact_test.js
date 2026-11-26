// 추천 제원: 짧은 외형(Ø100 × 50)에서도 축방향 부품을 최소 두께로 줄여 후보를 내고, 출력 베어링은 카탈로그에서 고른다.
// 허용 토크 탐색: 안전율 S(T)가 토크에 대해 단조 감소이고 capacity()가 유일한 교차점과 일치하는지 (이상적·ISO·공차 기준).
const assert = require('node:assert/strict');
const E = require('./engine.js'); globalThis.PGD = E; globalThis.PGDCarrier = require('./carrier-geometry.js'); require('./viewer3d.js');
globalThis.PGDBearings = require('./bearings.js');
const Rc = require('./recommend.js');
{
  const base = E.templateDesign();
  Object.assign(base.req, { Trated: 50, Tpeak: 100, Temerg: 125, rpm: 3000, lifeH: 20000, duty: [{ torque: 100, time: 100, mode: 'rated' }], ext: { Fr: 500, Fa: 300, M: 15 } });
  base.materials = base.materials.map((m, k) => k % 3 === 2 ? { family: 'NV', surfaceHRC: 56, coreHRC: 30, depth: .3 } : { family: 'Eh', surfaceHRC: 60, coreHRC: 36, depth: .3 });
  const spec = { OD: 100, H: 50, ratio: 24, ratioTolPct: 5, mods: [0.7, 0.8, 1.0], beta: 20, ns: [3, 4, 5, 6], ns2: [3, 4, 5, 6], modes: { shared: true, sep: true }, keep: { shared: 8, sep: 8 } };
  const ok = Rc.runSync(base, spec, E, globalThis.PGD3D.layout).res.filter(r => r.ok);
  assert.ok(ok.length > 0, 'Ø100 × 50 후보 없음');
  assert.ok(ok.every(r => r.OD <= 100.05 && r.H <= 50.05), '외형 한계');
  assert.ok(ok.every(r => r.D.outBearing.maker && r.D.outBearing.D <= 100 && r.D.housing === undefined), '카탈로그 출력 베어링');
  assert.ok(ok[0].cap >= 50, `1위 허용 토크 ${ok[0].cap}`);
  console.log(`compact recommend: Ø100 × 50 → ${ok.length}개 적합, 1위 ${ok[0].type} ${ok[0].stages.map(s => `m${s.m} ${s.s}/${s.p}/${s.R}×${s.n}`).join(' + ')} ${ok[0].cap.toFixed(1)} N·m · ${ok[0].D.outBearing.name} · 축방향 a ${ok[0].cand.axial}`);
}
{
  for (const basis of ['ideal', 'iso', 'tolerance']) for (const [name, mk] of [['HDS', E.defaultDesign], ['RH065', E.templateDesign]]) {
    const D = mk(); D.loads.basis = basis; const ctx = E.prepare(D), op = { rpm: D.req.rpm, cycles: E.cyclesFor(D.req.lifeH) };
    const S = T => Math.min(...E.evaluate(ctx, { ...op, Tout: T }).rows.map(x => Math.min(x.SH / D.req.SH, x.SF / D.req.SF)));
    const Ts = []; for (let T = 1e-3; T < 2e4; T *= 1.3) Ts.push(T);
    const v = Ts.map(S), cross = v.filter((x, i) => i && (v[i - 1] >= 1) !== (x >= 1)).length;
    assert.ok(v.every((x, i) => !i || x <= v[i - 1] * (1 + 1e-9)), `${basis} ${name}: S(T) 단조 감소`);
    assert.equal(cross, 1, `${basis} ${name}: 교차점 1개`);
    const cap = E.capacity(ctx, op, D.req); assert.ok(S(cap * .999) >= 1 && S(cap * 1.01) < 1, `${basis} ${name}: capacity = 교차점`);
  }
  console.log('capacity scan: ideal/iso/tolerance × HDS/RH065 — S(T) monotonic, single crossing = capacity');
}
