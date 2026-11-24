// 자동 설계 1차분 시험 (docs/DESIGN-ALGORITHM.md §8): 표준 DB 의뢰서 + 크기·감속비가 다른 사례 10건
// 합격: 사례별 "전 항목 충족" 또는 "미달 + 가장 가까운 안 + 부족분" 보고 · 오류 0 · 같은 입력 → 같은 결과 · 외형 안 · 감속비 정확
// 30 % 여유 충족률은 보고값 (합격 조건 아님). 출력: node autodesign_test.js [--json 파일]
const assert = require('assert'), fs = require('fs');
const E = require('./engine.js'); globalThis.PGD = E; globalThis.PGDCarrier = require('./carrier-geometry.js');
require('./viewer3d.js'); require('./checks.js');
const Rc = require('./recommend.js'), Q = require('./request.js'), A = require('./autodesign.js');
const layout = globalThis.PGD3D.layout, base = E.defaultDesign();

// 사례: 의뢰서 칸 그대로 (I1·I2 모터 / I3 rpm / I5·I6 필요 토크 / I7 i / I8 외경 / I9 길이 / I11 수명 / I12 외력 / I13·I14 직접 지정)
const CASES = [
  { id: 'STD', name: '표준 DB Ø100×100 i25', c: { I3: 3000, I5: 25, I6: '정격', I7: 25, I8: 100, I9: 100, I11: 20000, I12c: 15, I13: 62.5, I14: 87.5 } },
  { id: 'C01', name: 'Ø60×50 i5 1단', c: { I1: 0.6, I2: 1.8, I3: 3000, I5: 2.5, I6: '정격', I7: 5, I8: 60, I9: 50 } },
  { id: 'C02', name: 'Ø68×54 i9 1단', c: { I1: 0.8, I2: 2.4, I3: 3000, I5: 6, I6: '정격', I7: 9, I8: 68, I9: 54 } },
  { id: 'C03', name: 'Ø80×60 i7 1단', c: { I1: 1.3, I2: 3.8, I3: 3000, I5: 8, I6: '정격', I7: 7, I8: 80, I9: 60 } },
  { id: 'C04', name: 'Ø70×40 i15 (sungoh)', c: { I3: 2000, I5: 30, I6: '정격', I7: 15, I8: 70, I9: 40, I13: 60, I14: 90 } },
  { id: 'C05', name: 'Ø80×80 i20 (semi)', c: { I3: 3000, I5: 40, I6: '정격', I7: 20, I8: 80, I9: 80, I12a: 240, I12b: 120, I12c: 10, I13: 80, I14: 120 } },
  { id: 'C06', name: 'Ø100×50 i24', c: { I3: 3000, I5: 50, I6: '정격', I7: 24, I8: 100, I9: 50, I12a: 500, I12b: 300, I12c: 15, I13: 100, I14: 125 } },
  { id: 'C07', name: 'Ø90×80 i30 모름', c: { I1: 0.64, I2: 1.9, I3: 3000, I5: 15, I6: '모름', I7: 30, I8: 90, I9: 80 } },
  { id: 'C08', name: 'Ø120×90 i36', c: { I1: 1.3, I2: 3.8, I3: 3000, I5: 40, I6: '정격', I7: 36, I8: 120, I9: 90 } },
  { id: 'C09', name: 'Ø110×100 i50', c: { I1: 0.64, I2: 1.9, I3: 3000, I5: 25, I6: '반복 피크', I7: 50, I8: 110, I9: 100 } },
  { id: 'C10', name: 'Ø70×30 i15 (sera)', c: { I3: 3000, I5: 40, I6: '정격', I7: 15, I8: 70, I9: 30, I12a: 240, I12b: 120, I12c: 20, I13: 80, I14: 120 } },
];

const sig = res => JSON.stringify(res.best ? [res.best.stages.map(s => [s.m, s.s, s.p, s.R, s.n]), res.best.b, res.best.fails.map(f => f.id)] : null);
const report = [];
let errors = 0;
for (const K of CASES) {
  const q = Q.parse(K.c);
  assert(q.ok, K.id + ' 의뢰서 오류: ' + JSON.stringify(q.errors));
  let res;
  try { res = A.design(q, E, Rc, layout, base); } catch (e) { errors++; console.log(K.id, '오류', e.message); continue; }
  assert(res.ok, K.id);
  // 1) 결과 형식: 충족이면 부족분 없음, 미달이면 가장 가까운 안 + 부족분, 후보가 아예 없으면 사유
  if (res.best) {
    assert.strictEqual(res.pass, res.best.pass);
    if (!res.pass) assert(res.shortfall.length > 0, K.id + ' 미달인데 부족분 없음');
    // 2) 외형 안 · 감속비 정확 (사용자 입력 불변)
    assert(res.best.OD <= q.engineReq.Dmax + 0.05 && res.best.H <= q.engineReq.Lmax + 0.05, K.id + ' 외형 초과');
    assert(Math.abs(E.analyze(res.best.D).ratio - q.engineReq.ratio) < 1e-9, K.id + ' 감속비');
    assert(res.best.stages.every(s => s.n === 3 && A.MODS.includes(s.m)), K.id + ' 유성 3 · 모듈 목록');
    // 3) 재현성: 같은 입력 → 같은 결과
    assert.strictEqual(sig(A.design(Q.parse(K.c), E, Rc, layout, base)), sig(res), K.id + ' 재현성');
  }
  const b = res.best;
  report.push({ id: K.id, name: K.name, TR: q.derived.TR, TA: q.derived.TA, TM: q.derived.TM, counts: res.counts, pass: res.pass,
    best: b && { type: b.type, gear: b.stages.map(s => `m${s.m} ${s.s}/${s.p}/${s.R}`).join(' + '), b: b.b, cap: +b.cap.toFixed(2), capIdeal: b.capIdeal && +b.capIdeal.toFixed(2), margin: +b.margin.toFixed(3), gov: b.gov, kg: +b.mass.toFixed(3), lowLoad: b.lowLoad },
    shortfall: res.shortfall.map(f => `${f.id} ${f.value?.toFixed?.(2)} / ${f.target?.toFixed?.(2)}`), ms: res.ms });
  console.log(`${K.id} ${K.name} · TR ${q.derived.TR} · 후보 ${res.counts.정밀}/${res.counts.외형적합}/${res.counts.충족} · ${res.pass ? '충족' : '미달'} · ${b ? `${b.type} ${report.at(-1).best.gear} b${b.b} · 예측 ${b.cap.toFixed(1)} N·m (×${b.margin.toFixed(2)}, 오차 0 기준 ${b.capIdeal?.toFixed(1)}) · ${b.gov}` : '후보 없음'}${res.shortfall.length ? ' · 부족: ' + report.at(-1).shortfall.join(', ') : ''} · ${res.ms} ms`);
}
const passN = report.filter(r => r.pass).length;
console.log(`\n30 % 여유 충족률 ${passN}/${report.length} · 오류 ${errors}`);
const jf = process.argv.indexOf('--json'); if (jf > 0) fs.writeFileSync(process.argv[jf + 1], JSON.stringify(report, null, 1));
assert.strictEqual(errors, 0);
assert(report.every(r => r.ms < 60000), '사례당 1분 초과');
console.log('autodesign test passed');
