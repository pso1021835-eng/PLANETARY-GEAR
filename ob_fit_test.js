// 출력 베어링 결합 자동 계산 (#73 S3-1c): 내륜–C2 보스, 상태 4구분, 잠긴 치수 처리.
// 외륜–하우징은 BOM-1 (2026-11-26) 하우징 삭제로 범위 밖.
const assert = require('assert');
const E = require('./engine.js'); require('./viewer3d.js'); require('./checks.js'); const C = globalThis.PGDChecks;
const run = f => { const D = E.templateDesign(); f && f(D); C.ensure(D); C.applyNeedles(D); const R = E.analyze(D); return C.compute(R, D)['2-8']; };
const st = (g, k) => g.checks.find(x => x.key === k).status;
// 1) RH065 기본: 보스 Ø50 = 내경 Ø50, 공차 빈칸 → 사용자 기준 보스 h7 적용, 틈새 범위 계산
let ck = run(), F = ck.fit;
assert.strictEqual(F.outer, undefined);
assert.strictEqual(st(F.inner, 'seatD'), 'ok'); assert.strictEqual(st(F.inner, 'fit'), 'ok');
const fi = F.inner.checks.find(x => x.key === 'fit');
assert.strictEqual(fi.grade, 'h7'); assert.match(fi.src, /사용자 기준/);
assert.deepStrictEqual([fi.clearance.min, fi.clearance.max], [-12, 25]);   // Ø50: h7 0/−25, 보어 0/−12 (ISO 492 보통급)
assert.strictEqual(F.status, 'ok'); assert.match(F.rotation, /내륜은 캐리어와 함께 회전/); assert.strictEqual(ck.ok, true);
// 2) 저장값이 기준과 다르면 확인 필요 (저장값 유지) · 카탈로그 링 공차가 있으면 그 값으로 계산
ck = run(D => { D.struct.obFit = { inner: 'k5' }; }); assert.strictEqual(st(ck.fit.inner, 'fit'), 'input'); assert.match(ck.fit.inner.checks.at(-1).note, /저장값 k5 ≠ 기준 h7/);
ck = run(D => { D.outBearing.tolBore = 8; }); assert.strictEqual(ck.fit.inner.checks.at(-1).clearance.min, -8); assert.match(ck.fit.inner.checks.at(-1).ringSrc, /카탈로그/);
// 3) 옛 저장 정보(하우징·외륜 공차)는 불러올 때 삭제
{ const D = E.templateDesign(); D.housing = { wall: 2 }; D.geom.housing = { flangeD: 62 }; D.struct.obFit = { inner: null, outer: 'H7' }; D.struct.ringHousing = 'press'; D.loads.sunSupport = [{ k: 1 }];
  C.ensure(D); assert.strictEqual(D.housing, undefined); assert.strictEqual(D.geom.housing, undefined); assert.strictEqual(D.struct.obFit.outer, undefined);
  assert.strictEqual(D.struct.ringHousing, undefined); assert.strictEqual(D.loads.sunSupport, undefined); }
// 4) 보스 지름: 사용자 고정값이 안 맞으면 미달 · 수정량 제시
ck = run(D => { D.stages[1].carrier.bossD = 48; }); F = ck.fit; assert.strictEqual(st(F.inner, 'seatD'), 'fail'); assert(F.inner.checks[0].fix.locked && F.inner.checks[0].fix.delta === 2);
// 5) 회전 관계: 끼워맞춤 입력 필요가 남으면 '장착 조건 확인 필요'
F = run().fit; assert.strictEqual(F.rotationState, 'ok'); assert.deepStrictEqual(F.rotationPending, []);
F = run(D => { D.struct.obFit = { inner: 'k5' }; }).fit;
assert.strictEqual(F.rotationState, 'input'); assert.match(F.rotation, /장착 조건 확인 필요 \(내륜 끼워맞춤\)/); assert.doesNotMatch(F.rotation, /함께 회전/);
F = run(D => { D.stages[1].carrier.bossD = 48; }).fit; assert.strictEqual(F.rotationState, 'fail'); assert.match(F.rotation, /결합 미성립/);
console.log('output bearing fit (inner–C2 boss · status · locked dims · purge of removed parts): passed');
