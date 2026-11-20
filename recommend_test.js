// 추천 제원 생성 (정수 감속비): Ø68 × 54, i 9, 모듈 0.5/0.6/0.8, β 12°, 치폭 자동, 유성 3–8
// 후보가 나오고, 전체 감속비가 정확히 9이며, 외형 안, 허용 토크 내림차순인지 확인
const E = require('./engine.js'); globalThis.PGD = E; globalThis.PGDCarrier = require('./carrier-geometry.js'); require('./viewer3d.js');
const Rc = require('./recommend.js');
const spec = { OD: 68, H: 54, ratio: 9, mods: [0.5, 0.6, 0.8], beta: 12, b: null, ns: [3, 4, 5, 6, 7, 8] };
const out = Rc.runSync(E.defaultDesign(), spec, E, globalThis.PGD3D.layout), ok = out.res.filter(r => r.ok);
const exact = ok.every(r => r.stages.reduce((v, s) => v * (s.R + s.s), 1) === 9 * r.stages.reduce((v, s) => v * s.s, 1)
  && Math.abs(E.analyze(r.D).ratio - 9) < 1e-9);
const sorted = ok.every((r, i) => !i || Math.round(ok[i - 1].cap * 10) >= Math.round(r.cap * 10));
const fit = ok.every(r => r.OD <= 68.05 && r.H <= 54.05);
const types = new Set(ok.map(r => r.type));
console.log(`recommend: 정수비 조합 ${out.total} (${JSON.stringify(out.counts)}), 정밀 ${out.checked}, 적합 ${ok.length}, 1위 ${ok[0]?.type} ${ok[0]?.stages.map(s => `m${s.m} ${s.s}/${s.p}/${s.R}×${s.n}`).join(' + ')} ${ok[0]?.cap.toFixed(1)} N·m`);
if (!ok.length || !exact || !sorted || !fit || !types.has('shared') || !types.has('sep')) { console.log('FAIL', { exact, sorted, fit, types: [...types] }); process.exit(1); }
console.log('recommend test passed');

const shifted = Rc.runSync(E.defaultDesign(), {
  OD: 80, H: 72, ratio: 22, mods: [0.4, 0.6, 0.8], beta: 12, ns: [3], ns2: [5],
  modes: { shared: true }, allowShift: true, keep: { shared: 6 }
}, E, globalThis.PGD3D.layout).res;
const shiftedRow = shifted.find(row => row.ok && row.stages.some(s => s.R !== s.s + 2 * s.p));
if (!shiftedRow) throw new Error('Expected a feasible nonstandard tooth-count candidate');
const restored = E.prepare(JSON.parse(JSON.stringify(shiftedRow.D)));
const [first, second] = restored.stages;
if (restored.errors.length || Math.abs(restored.ratio - 22) > 1e-12 ||
    first.st.n !== 3 || second.st.n !== 5 || first.geo.r !== second.geo.r || first.st.xr !== second.st.xr ||
    restored.stages.some(({st, geo}) => (st.s + geo.r) % st.n !== 0 || Math.abs(geo.meshes[0].center - geo.meshes[1].center) > 1e-8)) {
  throw new Error('Applying the recommendation must retain tooth counts, assembly phase and shared-ring geometry');
}
console.log('profile shift recommendation test passed');
// 전위 지도: 예제 설계의 현재 점(0, 0)이 가능 영역이고, 미끄럼률 균형 추천이 현재보다 균형이 좋으며, 가능 영역 점은 모두 형상 판정 통과
{
  const E2 = require('./engine.js'), D2 = E2.defaultDesign(), map = E2.shiftMap(D2, 0);
  const cur = map.pts.find(p => Math.abs(p.xs) < 1e-9 && Math.abs(p.xp) < 1e-9), best = E2.shiftCandidates(D2, 0, 'slide').list[0];
  const okAll = map.pts.filter(p => p.ok).every(p => p.ea[0] >= 1.2 && p.ea[1] >= 1.2 && p.san >= .4);
  if (!cur?.ok || !(best.bal < cur.bal) || !okAll) { console.log('FAIL shift map', { cur: cur?.ok, best: best?.bal, curBal: cur?.bal, okAll }); process.exit(1); }
  console.log(`shift map: 가능 ${map.pts.filter(p => p.ok).length}/${map.pts.length}, 미끄럼 균형 추천 xs ${best.xs} xp ${best.xp} (균형 ${best.bal.toFixed(3)} < 현재 ${cur.bal.toFixed(3)})`);
}
