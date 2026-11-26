// Regression: shared ring as one part (joint reaction + tooth form), pin/carrier static over the whole duty,
// planet bearing source (manual vs full-needle), output-bearing external load validation, duty units, legacy pgd/1 files.
// Every number is produced by the engine/checks paths the site uses — nothing is a stored constant of the result.
const assert = require('node:assert/strict');
const E = require('./engine.js');
// 이 시험의 기준값은 2026-11-26 이전 기본 조건(이론 판정 · Kγ 물리 모델)에서 계산됨 — 기본 판정이 ISO로 바뀌어도 같은 조건으로 고정
{ const t0 = E.templateDesign, d0 = E.defaultDesign;
  E.templateDesign = () => { const D = t0(); D.loads.basis = 'ideal'; D.loads.kgMode = 'model'; return D; };
  E.defaultDesign = () => { const D = d0(); D.loads.basis = 'ideal'; return D; }; }
require('./viewer3d.js'); require('./checks.js');
const C = globalThis.PGDChecks;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const clone = o => JSON.parse(JSON.stringify(o));
const prep = d => { C.ensure(d); C.applyNeedles(d); return d; };
// what the app does on load (app.js migrateLoaded) and before each analysis (compute)
const loadJSON = txt => { const d = JSON.parse(txt); const notes = []; const out = E.migrateDuty(d); const diff = E.syncSharedRing(out); notes.push(...C.migrateNeedles(out)); return { d: out, diff, notes }; };
const appCompute = d => {
  if (d.config.sharedRing && d.config.stages > 1) { E.syncSharedRing(d); const st = E.sharedStage(d.stages[0], d.stages[1]); for (const k of ['p', 'm', 'beta', 'alpha']) d.stages[1][k] = st[k]; if (st.sharedRing.auto && Number.isFinite(st.sharedRing.xpFit)) d.stages[1].xp = +st.sharedRing.xpFit.toFixed(4); }
  E.syncDutyTorque(d); C.ensure(d); C.applyNeedles(d); return E.analyze(d);
};

// ---------------------------------------------------------------- 1. shared ring reaction: signed sum of stage reactions
// (링–하우징 결합 계산은 BOM-1 2026-11-26 에서 삭제 — 반력 계산만 유지)
{
  const run = (Tpeak, shared) => { const d = prep(E.templateDesign()); Object.assign(d.req, { Tpeak }); d.config.sharedRing = shared; const R = appCompute(d); assert.deepEqual(R.errors, []); return { R, d, RR: C.ringReaction(R, d, Tpeak) }; };
  const { R, RR } = run(28, true);
  near(R.ratio, 9, 1e-9, '3:1 × 3:1');
  near(RR.stages[0].ring, 6.2222, 1e-3, '1단 링 반력'); near(RR.stages[1].ring, 18.6667, 1e-3, '2단 링 반력');
  near(RR.groups[0].T, 24.8889, 1e-3, '공용부 합계'); near(RR.groups[0].need, 37.3333, 1e-3, '요구 토크 1.5×|합|');
  const r = run(-28, true).RR; near(r.stages[0].ring, -6.2222, 1e-3, '역토크 1단'); near(r.groups[0].T, -24.8889, 1e-3, '역토크 합계'); near(r.groups[0].need, 37.3333, 1e-3, '역토크 요구');
  const s = run(28, false).RR; assert.equal(s.groups.length, 2);
  near(s.groups[0].need, 9.3333, 1e-3, 'R1 요구'); near(s.groups[1].need, 28, 1e-3, 'R2 요구');
  const o = C.compute(R, run(28, true).d); assert.equal(o['8-2'], undefined); assert.equal(o['2-4'], undefined); assert.equal(o['8-3'], undefined);
  console.log('1 shared ring reaction: 6.22 + 18.67 → 37.33, reversal, separate rings; ring–housing joint items removed — passed');
}

// ---------------------------------------------------------------- 2. one tooth form for the shared ring
{
  const ringOf = R => R.ctx.stages.map(s => { const g = s.geo.parts[2]; return [g.z, s.st.xr, +g.da.toFixed(6), +g.df.toFixed(6)]; });
  for (const mode of ['auto', 'direct']) {
    const d = E.templateDesign(); if (mode === 'direct') d.stages[0].r = 92;
    d.stages[1].xs = .2;
    const R = appCompute(d); assert.deepEqual(R.errors, [], mode);
    const [a, b] = ringOf(R); assert.deepEqual(a, b, `${mode}: 링 잇수·전위·이끝원·이뿌리원 일치`);
    near(a[2], 55.233, 1e-3, `${mode}: 공용 링 이끝원`);
    const st2 = R.ctx.stages[1], sh = st2.st.sharedRing;
    assert.equal(sh.auto, true); near(sh.gap, 0, 1e-9, `${mode}: 작동 중심거리 일치`);
    near(st2.geo.meshes[0].center, st2.geo.meshes[1].center, 1e-6, `${mode}: S–P = P–R`);
    near(d.stages[1].xp, sh.xpFit, 1e-4, `${mode}: 자동 조정 유성 전위 저장 (JSON·3D 공용)`);
    // stage-2 ring inputs follow stage 1 (one input place)
    assert.equal(d.stages[1].r, d.stages[0].r); assert.equal(d.stages[1].autoRingShift, d.stages[0].autoRingShift);
  }
  // planet shift fixed by the user: input kept, mismatch reported in mm
  { const d = E.templateDesign(); d.stages[1].xs = .2; d.stages[1].autoPlanetShift = false; d.stages[1].xp = 0;
    const R = appCompute(d); assert.equal(d.stages[1].xp, 0, '입력 보존');
    assert.match(R.errors.join(), /중심거리가 다릅니다: 썬–유성 21\.2801 \/ 유성–링 21\.1625 mm \(차 0\.1177 mm\)/); }
  // separate rings stay independent
  { const d = E.templateDesign(); d.config.sharedRing = false; d.stages[1].xs = .2; const R = appCompute(d); assert.deepEqual(R.errors, []);
    const [a, b] = ringOf(R); assert.notEqual(a[1], b[1], '분리 링: 링 전위 단별'); }
  // legacy pgd/1 with a different stage-2 ring: stage 1 adopted, difference listed
  { const d = E.templateDesign(); d.stages[1].autoRingShift = false; d.stages[1].xr = .2; d.schema = 'pgd/1';
    const { d: L, diff } = loadJSON(JSON.stringify(d));
    assert.ok(diff.some(x => x.label === '링 전위 자동' && x.was === false && x.now === true), '채택 내용 표시');
    assert.equal(L.stages[1].autoRingShift, true); const R = appCompute(L); assert.deepEqual(R.errors, []);
    const [a, b] = ringOf(R); assert.deepEqual(a, b); }
  // save → load round trip keeps the shared ring
  { const d = E.templateDesign(); d.stages[1].xs = .2; appCompute(d); const { d: L, diff } = loadJSON(JSON.stringify(d)); assert.deepEqual(diff, []);
    const R = appCompute(L); const [a, b] = ringOf(R); assert.deepEqual(a, b); }
  console.log('2 shared ring form: auto & direct ring teeth, xs2 +0.20 → one ring (da 55.233), planet shift fitted / kept with gap, separate rings, pgd/1 adoption — passed');
}

// ---------------------------------------------------------------- 3. pin / carrier over the whole duty
{
  const d = E.defaultDesign(); d.stages[0].pin.allow = 21.31;           // test-only allowable at the verdict boundary
  d.req.duty = [{ torque: 200, time: 90, mode: 'stop' }, { torque: 100, time: 10, mode: 'rated' }];
  const R = E.analyze(d), c = R.carrierPin[0];
  near(c.peak.sigma, 14.21, .01, '피크 핀 굽힘'); near(c.cases.find(k => k.kind === '정지 유지').sigma, 28.41, .01, '정지 유지 핀 굽힘');
  near(c.cases.find(k => k.key === 'peak').S.bend, 1.50, .005, '피크 S'); near(c.Sbend, .75, .005, '최저 S = 정지 유지');
  assert.equal(c.gov.mode, 'bend'); assert.equal(c.gov.kind, '정지 유지'); assert.equal(c.gov.T, 32.4); assert.equal(c.gov.duty, 0);
  const v = R.verdict.find(x => x.id === '유성 핀·캐리어 정적 (듀티 전체)');
  assert.equal(v.ok, false); assert.equal(v.k, '핀 굽힘 미달 · 정지 유지 32.4 N·m'); near(v.value, .75, .005, '판정 값');
  // legacy pgd/1: rpm 0 without mode = rated rpm (rotating), not a hold
  const old = E.defaultDesign(); old.stages[0].pin.allow = 21.31; old.req.duty = [{ torque: 200, time: 90, rpm: 0 }, { torque: 100, time: 10, rpm: 0 }];
  const L = E.migrateDuty(JSON.parse(JSON.stringify(old))); assert.deepEqual(L.req.duty.map(l => l.mode), ['rated', 'rated']);
  const RL = E.analyze(L); assert.equal(RL.carrierPin[0].cases.some(k => k.kind === '정지 유지'), false, 'rpm 0 레거시 = 회전');
  assert.equal(RL.carrierPin[0].gov.kind, '회전');
  console.log('3 pin/carrier: peak 14.21 MPa S 1.50, hold 28.41 MPa S 0.75 governs "핀 굽힘 미달 · 정지 유지 32.4 N·m", legacy rpm 0 kept — passed');
}

// ---------------------------------------------------------------- 4. planet bearing: typed vs full-needle values
{
  const d = E.defaultDesign(); C.ensure(d);
  d.needle[0].apply = false; C.applyNeedles(d);
  const L10 = () => E.analyze(d).bearings[0].L10h;
  assert.equal(d.stages[0].bearing.C, 1900); near(L10(), 606, 1, '직접 입력 L10');
  d.needle[0].use = true; d.needle[0].apply = true; C.applyNeedles(d);
  assert.equal(d.stages[0].bearing.C, 3956); assert.equal(d.stages[0].bearing.C0, 4000); assert.equal(d.stages[0].bearing.src, 'needle'); near(L10(), 6984, 1, '풀니들 L10');
  const manualBore = d.stages[0].bearing.manual.planetBore, calcBore = d.stages[0].planetBore; assert.equal(calcBore, d.stages[0].bearing.calc.planetBore, '계산 보어 적용');
  d.needle[0].Dw = 2; C.applyNeedles(d); assert.notEqual(d.stages[0].bearing.C, 3956, '니들 치수 변경 반영'); assert.equal(d.stages[0].bearing.manual.C, 1900, '수동값 유지');
  d.needle[0].Dw = 1.5; C.applyNeedles(d);
  const { d: J } = loadJSON(JSON.stringify(d)); assert.equal(J.stages[0].bearing.manual.C, 1900); assert.equal(J.needle[0].apply, true);
  d.needle[0].apply = false; C.applyNeedles(d);
  assert.equal(d.stages[0].bearing.C, 1900); assert.equal(d.stages[0].bearing.C0, 1800); assert.equal(d.stages[0].bearing.src, 'manual'); near(L10(), 606, 1, '해제 → 직접 입력 복원');
  assert.equal(d.stages[0].planetBore, manualBore, '유성 보어도 직접 입력값으로 복원'); assert.equal(d.stages[0].bearing.name, d.stages[0].bearing.manual.name, '명칭 복원');
  J.needle[0].apply = false; C.applyNeedles(J); assert.equal(J.stages[0].bearing.C, 1900, 'JSON 재불러오기 후 해제도 복원');
  // legacy file: needle applied, typed values never saved → cannot restore, said so
  const old = E.defaultDesign(); C.ensure(old); C.applyNeedles(old); delete old.stages[0].bearing.src; delete old.stages[0].bearing.manual; delete old.stages[0].bearing.calc;
  const { d: O, notes } = loadJSON(JSON.stringify(old)); assert.ok(notes.some(t => /직접 입력값이 없습니다/.test(t)));
  O.needle[0].apply = false; C.applyNeedles(O); assert.equal(O.stages[0].bearing.manualLost, true);
  console.log('4 planet bearing: 1,900 N / 606 h ↔ 3,956 N / 6,984 h, needle size change, JSON round trip, legacy unrecoverable flagged — passed');
}

// ---------------------------------------------------------------- 5. output-bearing external loads
{
  const run = ext => { const d = E.defaultDesign(); d.req.ext = ext; return E.analyze(d); };
  near(run({ Fr: 300, Fa: 100, M: 4 }).outBearing.L10h, 3264, 1, '기준 L10');
  for (const [ext, re] of [[{ Fr: -300, Fa: 100, M: 4 }, /Fr -300 N: 음수 불가/], [{ Fr: null, Fa: 100, M: 4 }, /Fr: 빈칸/], [{ Fr: 300, Fa: -1, M: 4 }, /Fa -1 N: 음수 불가/], [{ Fr: 300, Fa: 100, M: -4 }, /M -4 N·m: 음수 불가/]]) {
    const R = run(ext); assert.equal(R.outBearing.invalid, true);
    const vs = R.verdict.filter(v => v.id.startsWith('출력 베어링'));
    assert.ok(vs.length === 2 && vs.every(v => v.na && v.ok === false && /계산 불가/.test(v.k) && re.test(v.note)), JSON.stringify(ext));
    assert.ok(R.verdict.filter(v => !v.na).every(v => !Number.isNaN(v.value)), 'NaN 없음');
    assert.ok(!(R.outBearing.Peq < 0), '음수 등가하중 없음');
  }
  assert.equal(run({ Fr: 0, Fa: 0, M: 0 }).outBearing.invalid, undefined, '0 = 무하중 허용');
  // JSON import goes through the same validation
  const d = E.defaultDesign(); d.req.ext = { Fr: -300, Fa: 100, M: 4 }; const { d: J } = loadJSON(JSON.stringify(d)); assert.equal(E.analyze(J).outBearing.invalid, true);
  // torque / rpm signs are kept (reversal is meaningful)
  const r = E.defaultDesign(); r.req.duty = [{ torque: -100, time: 50, mode: 'set', rpm: -3000 }, { torque: 100, time: 50, mode: 'rated' }]; r.req.ext = { Fr: 300, Fa: 100, M: 4 };
  assert.ok(Number.isFinite(E.analyze(r).outBearing.L10h)); assert.equal(r.req.duty[0].torque, -100); assert.equal(r.req.duty[0].rpm, -3000);
  console.log('5 external loads: 3,264 h; negative/blank → 계산 불가 with reason, no NaN, 0 allowed, JSON same check, signed torque/rpm kept — passed');
}

// ---------------------------------------------------------------- 6. duty units
{
  const d = E.defaultDesign(); d.req.Trated = 16.2;
  E.setDutyUnit(d, 'torque', 'Nm'); E.setDutyUnit(d, 'time', 's');
  d.req.duty = [{ Tnm: 32.4, time: 54, mode: 'stop' }, { Tnm: 16.2, time: 6, mode: 'rated' }]; E.syncDutyTorque(d);
  const lv = E.dutyLevels(d); assert.deepEqual(lv.map(l => +(l.frac * 100).toFixed(6)), [90, 10]); assert.deepEqual(lv.map(l => l.T), [32.4, 16.2]);
  assert.deepEqual(d.req.duty.map(l => l.torque), [200, 100]);
  const before = JSON.stringify(d.req.duty);
  for (let k = 0; k < 5; k++) { const L = loadJSON(JSON.stringify(d)).d; E.syncDutyTorque(L); Object.assign(d, L); }
  assert.equal(JSON.stringify(d.req.duty), before, '반복 저장');
  E.setDutyUnit(d, 'time', 'pct'); E.setDutyUnit(d, 'time', 's'); assert.equal(JSON.stringify(d.req.duty), before, '시간 단위 전환');
  E.setDutyUnit(d, 'torque', 'pct'); assert.deepEqual(d.req.duty.map(l => l.torque), [200, 100]); E.setDutyUnit(d, 'torque', 'Nm'); assert.deepEqual(d.req.duty.map(l => l.Tnm), [32.4, 16.2], '토크 단위 전환');
  const R = E.analyze(d); near(R.spectrum.holdT, 32.4, 1e-9, '정지 유지 토크');
  console.log('6 duty units: 32.4 N·m × 54 s hold + 16.2 N·m × 6 s → 90 % / 10 %, unit switch and repeated save stable — passed');
}
console.log('shared ring / duty / bearing source / external load regression: all passed');
