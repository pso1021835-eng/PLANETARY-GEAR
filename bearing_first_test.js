// 베어링 기준 자동 설계 (AD-2): 목표 토크 = κ·C0·dp/(2000·s0), 2단 링 피치원 ≥ 롤러 피치원 근처 · 링 외경 ≤ 베어링 외경, 침탄 기본, 링 공유·전위 탐색 옵션, 1단 링 외경 ≤ 2단, 5안 비교
const assert = require('assert');
const E = require('./engine.js'); globalThis.PGDBearings = require('./bearings.js');
require('./carrier-geometry.js'); require('./viewer3d.js'); require('./checks.js');
const REC = require('./recommend.js'), BF = require('./bearing-first.js'), Q = require('./request.js');
const env = { E, C: globalThis.PGDChecks, REC, PG: globalThis.PGD3D };
const near = (a, b, t, m) => assert(Math.abs(a - b) <= t, `${m}: ${a} vs ${b}`);
(async () => {
  // 1) 의뢰서 PGD-REQ-3
  let q = Q.parseBF({ I7: 25, B1: 'THK RU42', I3: 3000 });
  assert(q.ok, JSON.stringify(q.errors)); assert.strictEqual(q.bearing.model, 'RU42'); assert.strictEqual(q.shift, false); assert.strictEqual(q.shared, false); assert.strictEqual(q.gap, 3);
  near(q.derived.M0, 8350 * 41.5 / 2000, 1e-6, 'M0'); near(q.derived.T, 0.2 * 8350 * 41.5 / 2000, 1e-6, 'T');
  assert(!Q.parseBF({ I7: 25, B1: 'XX999', I3: 3000 }).ok, '없는 형번');
  assert(!Q.parseBF({ I7: 25, B1: 'RU42', I3: 3000, O1: '아마' }).ok, 'Y/N');
  assert.strictEqual(Q.parseBF({ I7: 25, B1: 'RU42', I3: 3000, O1: 'Y', O2: 'y' }).shared, true);
  // 2) 링 분리 · 전위 0
  let r = await BF.run(q, env);
  assert.strictEqual(r.status, 'ok', r.error); assert(r.top.length >= 3 && r.top.length <= 5);
  for (const x of r.top) {
    const st = x.stages, last = st[st.length - 1], dRing = last.m * last.R / Math.cos(12 * Math.PI / 180);
    assert(dRing >= 41.5 - 2.5 * last.m / Math.cos(12 * Math.PI / 180) - 1e-9, `링 피치원 ${dRing} ≥ 롤러 피치원 근처`);
    assert(x.OD <= 70 + 1e-6, `2단 링 외경 ${x.OD} ≤ 베어링 외경 70`);
    assert(x.D.materials.every(m => m.family === 'Eh'), '기본 재료 침탄');
    assert.strictEqual(x.type, 'sep'); assert(x.ring1 <= x.OD + 1e-6, '1단 링 외경 ≤ 2단');
    assert(st.every(o => !o.profile || [o.profile.xs, o.profile.xp, o.profile.xr].every(v => v === 0)), '전위 0');
    near(x.ratio, 25, 0.25 + 1e-9, '감속비 ±1 %'); near(x.L, x.bs[0] + 3 + x.bs[1], 1e-9, '길이 = b1 + 간격 + b2');
    near(x.OD, x.R.ctx.stages[1].geo.rims[2].diameter, 1e-9, '외경 = 2단 링 림 포함');
    assert.strictEqual(x.D.outBearing.model, 'RU42'); assert(x.cap > 0 && x.stageCap.length === 2);
  }
  for (let k = 1; k < r.top.length; k++) assert(Math.round(r.top[k - 1].cap * 10) >= Math.round(r.top[k].cap * 10), '한계 토크 순');
  // 침탄 연삭 기본에서 RU42 (C0 8350) 목표 34.7 N·m에 1안이 닿는다 (ISO)
  assert(r.top[0].cap >= 0.9 * r.spec.T, `1안 ${r.top[0].cap} / 목표 ${r.spec.T}`);
  // 이온질화 옵션
  { const n = await BF.run(Q.parseBF({ I7: 25, B1: 'THK RU42', I3: 3000, O3: 'Y' }), env); assert.strictEqual(n.status, 'ok'); assert(n.top[0].D.materials.every(m => m.family === 'NV')); assert(n.top[0].cap < r.top[0].cap); }
  // 3) 링 공유 + 전위 탐색
  r = await BF.run(Q.parseBF({ I7: 25, B1: 'THK RU42', I3: 3000, O1: 'Y', O2: 'Y' }), env);
  assert.strictEqual(r.status, 'ok', r.error); assert(r.top.every(x => x.type === 'shared' && x.D.config.sharedRing && x.stages[0].R === x.stages[1].R && x.stages[0].m === x.stages[1].m));
  // 4) 1단 (감속비 ≤ 10)
  r = await BF.run(Q.parseBF({ I7: 5, B1: 'THK RU42', I3: 3000 }), env);
  assert.strictEqual(r.status, 'ok', r.error); assert(r.top.some(x => x.type === 'one'));
  console.log('bearing-first autodesign: passed');
})().catch(e => { console.error(e); process.exit(1); });
