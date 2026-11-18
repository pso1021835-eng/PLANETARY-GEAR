// 추천 제원 생성: 예제 조건(Ø68 × 58, i 9, m 0.6, β 12°, b 6, R 92)에서 후보가 나오고 허용 토크 내림차순인지 확인
const E = require('./engine.js'); globalThis.PGD = E; globalThis.PGDCarrier = require('./carrier-geometry.js'); require('./viewer3d.js');
const Rc = require('./recommend.js');
const res = Rc.runSync(E.defaultDesign(), { OD: 68, H: 58, ratio: 9, m: 0.6, beta: 12, b: 6, R: 92 }, E, globalThis.PGD3D.layout);
const ok = res.filter(r => r.ok);
const sorted = ok.every((r, i) => !i || Math.round(ok[i - 1].cap * 10) >= Math.round(r.cap * 10));
const fit = ok.every(r => r.OD <= 68.05 && r.H <= 58.05 && Math.abs(r.err) <= .03);
const stageMin = ok.every(r => Math.abs(Math.min(...r.stageCap.map(c => c.out)) - r.cap) / r.cap < .02 || r.gov.includes('베어링'));
console.log(`recommend: ${res.length} 조합, 적합 ${ok.length}, 1위 ${ok[0]?.stages.map(s => `${s.s}/${s.p}×${s.n}`).join(' + ')} ${ok[0]?.cap.toFixed(1)} N·m`);
if (!ok.length || !sorted || !fit || !stageMin) { console.log('FAIL', { sorted, fit, stageMin }); process.exit(1); }
console.log('recommend test passed');
