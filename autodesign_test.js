// 자동 설계 (docs/DESIGN-ALGORITHM.md §5 · §6): 외형 절대 고정 · 제작 규칙 · 입력 불변 · 판정 기준별 결과 · 산출물
const assert = require('assert');
const E = require('./engine.js'); require('./carrier-geometry.js'); require('./bearings.js'); require('./viewer3d.js'); require('./checks.js'); require('./process.js');
const REC = require('./recommend.js'), Q = require('./request.js'), A = require('./autodesign.js');
const env = basis => ({ E, C: globalThis.PGDChecks, P: globalThis.PGDProc, REC, PG: globalThis.PGD3D, basis });
const one = { I1: 1.3, I2: 3.8, I3: 3000, I5: 5, I6: '모름', I7: 5, I8: 60, I9: 40 };
(async () => {
  const q = Q.parse(one); assert(q.ok);
  const req0 = JSON.stringify(q.engineReq);
  // 1) 오차 0 가정 기준: 전 항목 충족, 외형 안, 제작 규칙
  let r = await A.run(q, env('ideal'));
  assert.strictEqual(r.status, 'pass', JSON.stringify(r.short));
  assert(r.score.OD <= 60 + .05 && r.score.L <= 40 + .05, `외형 ${r.score.OD} × ${r.score.L}`);
  assert(r.gears.length === 3 && r.gears.every(g => g.mn >= .4 && g.beta === 12 && g.grade === 6), JSON.stringify(r.gears));
  assert.strictEqual(r.gears.find(g => g.part === '유성').qty, 3);
  assert(r.bom.length > 5 && r.bom.every(b => b.qty >= 1));
  assert.strictEqual(r.D.loads.basis, 'ideal'); assert.strictEqual(r.D.config.floatingSun, false);
  { const L0 = E.templateDesign().lube; for (const k of ['nu40', 'nu100', 'rzFlank', 'fzg']) assert.strictEqual(r.D.lube[k], L0[k], '윤활 사양은 바꾸지 않음: ' + k); }
  assert.strictEqual(JSON.stringify(q.engineReq), req0, '의뢰 입력 불변'); assert.deepStrictEqual(r.D.meta.request, q.engineReq);
  assert(Math.abs(r.D.req.Trated - q.engineReq.Trated * Q.MARGIN) < 1e-9 && Q.MARGIN === 1, '판정 토크 = 요구 정격 (SF-1: 배수 없음)');
  assert.strictEqual(r.D.req.SH, 1); assert.strictEqual(r.D.req.SF, 1.4);   // 기본 안전율 (SF-1)
  assert(r.D.stages.every(s => !(s.mod?.crown > 0)), '크라우닝 없음 (CR-1)');
  assert(r.log.some(l => l.kind === '선택' && l.key === '최종안')); assert(r.log.some(l => l.kind === '가정'));
  assert(r.life.ok);
  // 2) ISO 계산 조건 (§3 기본): 소형 저하중에서 미달 → 부족분과 산정 기준 폭 보고
  r = await A.run(q, env());
  assert.strictEqual(r.D.loads.basis, 'iso'); assert.strictEqual(r.status, 'short');
  assert(r.short.some(s => /정격/.test(s.k))); assert(r.band && r.band.iso < r.band.ideal && r.band.lowLoad);
  assert(r.score.OD <= 60 + .05 && r.score.L <= 40 + .05, '미달이어도 외형은 지킴');
  // 3) 의뢰서 오류 → 계산하지 않음
  r = await A.run(Q.parse({ I3: 3000 }), env()); assert.strictEqual(r.status, 'input'); assert(r.errors.length);
  // 4) 기하학적으로 불가능한 중공 → 조합 없음 + 이유
  r = await A.run(Q.parse({ I3: 3000, I5: 40, I6: '정격', I7: 20, I8: 80, I9: 80, I10: 20, I13: 80, I14: 120 }), env());
  assert.strictEqual(r.status, 'none'); assert.match(r.error, /중공 Ø20/);
  console.log('자동 설계: all ok');
})().catch(e => { console.error(e); process.exit(1); });
