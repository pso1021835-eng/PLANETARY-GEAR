// 출력 베어링 결합 자동 계산 (#73 S3-1c): 내륜–C2 보스 · 외륜–하우징, 상태 4구분, 잠긴 치수 처리
const assert = require('assert');
const E = require('./engine.js'); require('./viewer3d.js'); require('./checks.js'); const C = globalThis.PGDChecks;
const run = f => { const D = E.templateDesign(); f && f(D); C.ensure(D); C.applyNeedles(D); const R = E.analyze(D); return C.compute(R, D)['2-8']; };
const st = (g, k) => g.checks.find(x => x.key === k).status;
// 1) RH065 기본: 보스 Ø50 = 내경 Ø50, 공차 빈칸 → 결합 성립 · 끼워맞춤 입력 필요
let ck = run(), F = ck.fit;
assert.strictEqual(st(F.inner, 'seatD'), 'ok'); assert.strictEqual(st(F.inner, 'fit'), 'input'); assert.strictEqual(st(F.outer, 'fit'), 'input');
assert.strictEqual(F.status, 'input'); assert.match(F.rotation, /내륜은 캐리어와 함께 회전/); assert.notStrictEqual(ck.ok, false);
// 2) 공차 입력 → 충족
ck = run(D => { D.struct.obFit = { inner: 'k5', outer: 'H7' }; }); assert.strictEqual(ck.fit.status, 'ok'); assert.strictEqual(ck.ok, true);
// 3) 내륜은 맞고, 잠긴 하우징 플랜지(Ø62 → 벽 0.5 mm)만 미달 · 수정량 제시 · 잠금 유지
ck = run(D => { D.geom.housing = { flangeD: 62 }; }); F = ck.fit;
assert.strictEqual(st(F.inner, 'seatD'), 'ok'); assert.strictEqual(st(F.outer, 'wall'), 'fail'); assert.strictEqual(ck.ok, false);
const fx = F.outer.checks.find(x => x.key === 'wall').fix; assert(fx.locked && fx.value === 65 && fx.delta === 3, JSON.stringify(fx));
// 4) 보스 지름: 자동값이 안 맞으면 입력 필요(제안), 사용자 고정값이 안 맞으면 미달
ck = run(D => { D.stages[1].carrier.bossD = 48; }); F = ck.fit; assert.strictEqual(st(F.inner, 'seatD'), 'fail'); assert(F.inner.checks[0].fix.locked && F.inner.checks[0].fix.delta === 2);
// 5) 외경 한계: Dmax 66 < 하우징 Ø68 → 미달, 미입력이면 해당 없음
assert.strictEqual(st(run(D => { D.req.Dmax = 66; }).fit.outer, 'od'), 'fail'); assert.strictEqual(st(run().fit.outer, 'od'), 'na');
console.log('output bearing fit (inner–C2 boss · outer–housing · status · locked dims): passed');
