// 출력 베어링 결합 자동 계산 (#73 S3-1c): 내륜–C2 보스 · 외륜–하우징, 상태 4구분, 잠긴 치수 처리
const assert = require('assert');
const E = require('./engine.js'); require('./viewer3d.js'); require('./checks.js'); const C = globalThis.PGDChecks;
const run = f => { const D = E.templateDesign(); f && f(D); C.ensure(D); C.applyNeedles(D); const R = E.analyze(D); return C.compute(R, D)['2-8']; };
const st = (g, k) => g.checks.find(x => x.key === k).status;
// 1) RH065 기본: 보스 Ø50 = 내경 Ø50, 공차 빈칸 → 사용자 기준(보스 h7 · 하우징 H7) 적용, 틈새 범위 계산
let ck = run(), F = ck.fit;
assert.strictEqual(st(F.inner, 'seatD'), 'ok'); assert.strictEqual(st(F.inner, 'fit'), 'ok'); assert.strictEqual(st(F.outer, 'fit'), 'ok');
const fi = F.inner.checks.find(x => x.key === 'fit'), fo = F.outer.checks.find(x => x.key === 'fit');
assert.strictEqual(fi.grade, 'h7'); assert.strictEqual(fo.grade, 'H7'); assert.match(fi.src, /사용자 기준/);
assert.deepStrictEqual([fi.clearance.min, fi.clearance.max], [-12, 25]);   // Ø50: h7 0/−25, 보어 0/−12 (ISO 492 보통급)
assert.deepStrictEqual([fo.clearance.min, fo.clearance.max], [0, 43]);     // Ø61: H7 +30/0, 외경 0/−13
assert.strictEqual(F.status, 'ok'); assert.match(F.rotation, /내륜은 캐리어와 함께 회전/); assert.strictEqual(ck.ok, true);
// 2) 저장값이 기준과 다르면 확인 필요 (저장값 유지) · 카탈로그 링 공차가 있으면 그 값으로 계산
ck = run(D => { D.struct.obFit = { inner: 'k5', outer: 'H7' }; }); assert.strictEqual(st(ck.fit.inner, 'fit'), 'input'); assert.match(ck.fit.inner.checks.at(-1).note, /저장값 k5 ≠ 기준 h7/);
ck = run(D => { D.outBearing.tolBore = 8; }); assert.strictEqual(ck.fit.inner.checks.at(-1).clearance.min, -8); assert.match(ck.fit.inner.checks.at(-1).ringSrc, /카탈로그/);
// 3) 내륜은 맞고, 잠긴 하우징 플랜지(Ø62 → 벽 0.5 mm)만 미달 · 수정량 제시 · 잠금 유지
ck = run(D => { D.geom.housing = { flangeD: 62 }; }); F = ck.fit;
assert.strictEqual(st(F.inner, 'seatD'), 'ok'); assert.strictEqual(st(F.outer, 'wall'), 'fail'); assert.strictEqual(ck.ok, false);
const fx = F.outer.checks.find(x => x.key === 'wall').fix; assert(fx.locked && fx.value === 65 && fx.delta === 3, JSON.stringify(fx));
// 4) 보스 지름: 자동값이 안 맞으면 입력 필요(제안), 사용자 고정값이 안 맞으면 미달
ck = run(D => { D.stages[1].carrier.bossD = 48; }); F = ck.fit; assert.strictEqual(st(F.inner, 'seatD'), 'fail'); assert(F.inner.checks[0].fix.locked && F.inner.checks[0].fix.delta === 2);
// 5) 외경 한계: Dmax 66 < 하우징 Ø68 → 미달, 미입력이면 해당 없음
assert.strictEqual(st(run(D => { D.req.Dmax = 66; }).fit.outer, 'od'), 'fail'); assert.strictEqual(st(run().fit.outer, 'od'), 'na');
console.log('output bearing fit (inner–C2 boss · outer–housing · status · locked dims): passed');
