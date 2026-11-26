// 산정 기준 폭(오차 0 / ISO) · 저하중 경고 · C2–출력 플랜지 결합 판정 회귀 테스트
const assert = require('assert');
const E = require('./engine.js'); require('./viewer3d.js'); require('./checks.js'); const C = globalThis.PGDChecks;
// 이 시험의 기준값은 2026-11-26 이전 기본 조건(이론 판정 · Kγ 물리 모델)에서 계산됨 — 기본 판정이 ISO로 바뀌어도 같은 조건으로 고정
{ const t0 = E.templateDesign, d0 = E.defaultDesign;
  E.templateDesign = () => { const D = t0(); D.loads.basis = 'ideal'; D.loads.kgMode = 'model'; return D; };
  E.defaultDesign = () => { const D = d0(); D.loads.basis = 'ideal'; return D; }; }
const prep = d => { C.ensure(d); C.applyNeedles(d); return d; };
// 1) RH065 (m0.6, 실측 정격 28 N·m): 오차 0 기준이 실측에 가장 가깝고 ISO 방법 C는 저하중 영역
const rh = prep(E.templateDesign()), b = E.basisBand(rh);
assert(b && b.lowLoad && b.wm < 100, 'RH065 rated Fm/b < 100 N/mm');
assert(b.ideal > 15 && b.ideal < 40, `RH065 ideal ${b.ideal} near test 28 N·m`);
assert(b.iso < 0.2 * b.ideal, 'ISO method C far below ideal at light load');
const iso = JSON.parse(JSON.stringify(rh)); iso.loads.basis = 'iso';
assert(E.analyze(iso).warns.some(w => w.includes('저하중')), 'iso basis warns at light load');
assert(!E.analyze(rh).warns.some(w => w.includes('저하중')), 'ideal basis no warning');
// 2) C2–출력 플랜지: 기본 6×M3 → 템플릿 충족, 작은 볼트·높은 피크 → 미달, 일체 → 충족
let R = E.analyze(rh), ck = C.compute(R, rh)['2-8'];
assert.strictEqual(ck.ok, true, ck.val); assert(ck.c2.Tcap > ck.c2.need);
const weak = JSON.parse(JSON.stringify(rh)); weak.req.Tpeak = 60; weak.struct.c2outDim.bd = 2;
ck = C.compute(E.analyze(weak), weak)['2-8']; assert.strictEqual(ck.ok, false, ck.val);
const integ = JSON.parse(JSON.stringify(weak)); integ.struct.c2out = 'integral';
assert.strictEqual(C.compute(E.analyze(integ), integ)['2-8'].ok, true);
const mom = JSON.parse(JSON.stringify(rh)); mom.req.ext = { Fr: 0, Fa: 0, M: 200 };
ck = C.compute(E.analyze(mom), mom)['2-8']; assert(ck.c2.sep && ck.c2.sep.S < 1.5 && ck.ok === false, 'moment opens the bolted joint: ' + ck.val);
console.log('basis band / light-load warning / C2–output flange joint: passed');
