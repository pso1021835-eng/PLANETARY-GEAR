// RDP-RH065 9:1 template (1000 rpm, 5000 h): rated torque per rating basis and an exact factor decomposition of the gap.
// T_cap ∝ (σHP/SH)² / (Kγ·Kv·KHβ·KHα) on the governing contact row, so the capacity ratio between two bases must equal
// the product of their factor ratios. Prints the table used in the PR and fails if the decomposition stops closing.
const E = require('./engine.js');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const mk = (basis, kg, f) => { const D = E.templateDesign(); D.req.rpm = 1000; D.req.lifeH = 5000; D.loads.basis = basis; if (kg) { D.loads.kgMode = kg; D.loads.kgFixed = 1.0; } if (f) f(D); return D; };
const run = D => {
  const ctx = E.prepare(D), op = { rpm: D.req.rpm, cycles: E.cyclesFor(D.req.lifeH) }, T = E.capacity(ctx, op, D.req), r = E.evaluate(ctx, { ...op, Tout: T });
  let g = null; r.rows.forEach(x => [['H', x.SH / D.req.SH], ['F', x.SF / D.req.SF]].forEach(([m, v]) => { if (!g || v < g.v) g = { v, m, x }; }));
  return { T, g, r };
};
const modes = [['오차 0', 'ideal', null, 22.186], ['ISO + Kγ 모델', 'iso', 'model', 0.948], ['ISO + Kγ 1.0', 'iso', 'fixed', 2.844]], res = {};
console.log('기준            정격토크  지배             Kγ     Kv     KHβ    KHα    σH    σHP   Ft·KA·Kγ N');
for (const [n, b, kg, ref] of modes) {
  const c = run(mk(b, kg)), f = c.g.x.f; res[n] = c;
  console.log(`${n.padEnd(14)} ${c.T.toFixed(3).padStart(7)}  ${c.g.x.stage}단 ${c.g.x.mesh} ${c.g.x.partName} ${c.g.m}  ${f.Kg.toFixed(3)}  ${f.Kv.toFixed(3)}  ${f.KHb.toFixed(3)}  ${f.KHa.toFixed(3)}  ${c.g.x.H.toFixed(0)}  ${c.g.x.HP.toFixed(0)}  ${(f.Ft * f.KA * f.Kg).toFixed(1)}`);
  ok(Math.abs(c.T / ref - 1) < 2e-3, `${n} 정격토크 ${c.T.toFixed(3)} ≈ ${ref}`);
}
const a = res['오차 0'];
for (const n of ['ISO + Kγ 모델', 'ISO + Kγ 1.0']) {
  const b = res[n], id = b.g.x.id, ra = a.r.rows.find(x => x.id === id), fa = ra.f, fb = b.g.x.f;
  const terms = { 'Kγ': fb.Kg / fa.Kg, 'Kv': fb.Kv / fa.Kv, 'KHβ': fb.KHb / fa.KHb, 'KHα': fb.KHa / fa.KHa, 'σHP² (ZNT·ZL·ZV·ZR)': (ra.HP / b.g.x.HP) ** 2 };
  const prod = Object.values(terms).reduce((p, v) => p * v, 1), actual = a.T * (ra.SH / 1) ** 2 / b.T;
  console.log(`\n${n} ↔ 오차 0 (행 ${id}, 각 기준의 정격토크 지점): 계수 비 곱 ×${prod.toFixed(2)}`);
  for (const [k, v] of Object.entries(terms)) console.log(`  ${k.padEnd(20)} ×${v.toFixed(3)}  (로그 기여 ${(Math.log(v) / Math.log(prod) * 100).toFixed(1)} %)`);
  ok(b.g.m === 'H' && a.g.m === 'H' && Math.abs(prod / actual - 1) < 5e-3, `분해가 실제 용량 비 ×${actual.toFixed(2)}와 일치`);
}
console.log('\n입력 한 개씩 변경 (ISO + Kγ 모델 기준):');
const base = res['ISO + Kγ 모델'].T;
for (const [n, f] of [['Kγ 1.0 고정', D => { D.loads.kgMode = 'fixed'; D.loads.kgFixed = 1; }], ['유성 위치오차 5 → 0 µm', D => { D.loads.posError = 0; }],
  ['정밀도 7 → 5급', D => D.stages.forEach(s => { s.grade = 5; })],
  ['캐리어 평행도 10 → 0 µm', D => { D.loads.carrierParallel = 0; }], ['rpm 1000 → 100', D => { D.req.rpm = 100; }], ['수명 5000 → 500 h', D => { D.req.lifeH = 500; }]]) {
  const T = run(mk('iso', 'model', f)).T; console.log(`  ${n.padEnd(22)} ${base.toFixed(3)} → ${T.toFixed(3)} N·m (×${(T / base).toFixed(2)})`);
}
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('rating basis decomposition: passed');
