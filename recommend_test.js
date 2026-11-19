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
