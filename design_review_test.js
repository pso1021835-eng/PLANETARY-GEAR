const assert = require('node:assert/strict');
const E = require('./engine');
const Rc = require('./recommend');
const createJobs = require('./analysis-jobs');

function near(actual, expected, tol = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tol, `${actual} != ${expected}`);
}

{
  const d = E.defaultDesign();
  Object.assign(d.stages[0], { blMode: 'asn', asn: [[0, 0], [0, 0], [0, 0]], aTol: [20, 20] });
  d.req.backlashMax = 20;
  let r = E.analyze(d);
  for (const m of r.backlash.meshMargins) near(m.min, -15.518876);
  near(r.backlash.range[1], 4.2007834);
  assert.equal(r.verdict.filter(v => v.k.endsWith('최소 백래시') && !v.ok).length, 2);
  assert.equal(r.verdict.find(v => v.k.startsWith('출력 백래시')).ok, true);
  assert.equal(r.backlash.ok, false);
  Object.assign(d.stages[0], { blMode: 'jt', jt: [20, 20] });
  d.req.backlashMax = 0;
  r = E.analyze(d);
  assert.equal(r.verdict.filter(v => v.k.endsWith('최소 백래시') && !v.ok).length, 0);
  assert.equal(r.backlash.ok, false);
  console.log('Signed mesh clearance and independent output backlash passed.');
}

{
  const d = E.defaultDesign();
  Object.assign(d.stages[0].bearing, { C0: 600, count: 1 });
  d.req.duty = [{ torque: 100, time: 10, mode: 'rated' }, { torque: 200, time: 90, mode: 'stop' }];
  const r = E.analyze(d), b = r.bearings[0];
  near(b.s0peak, 1.41111, .0001);
  near(b.governing.s0, .7055558);
  assert.equal(b.governing.torque, 32.4);
  assert.match(b.governing.label, /구간 2 · 정지/);
  assert.equal(r.verdict.find(v => v.k.startsWith('유성 베어링 정적')).ok, false);

  d.req.ext = { Fr: 300, Fa: 100, M: 4 };
  d.req.s0 = 4;
  d.req.duty = [{ time: 0, torque: 999, ext: 1000 }, { time: 100, mode: 'set', rpm: -3010, torque: 100, ext: 200 }];
  for (const mode of ['set', 'stop']) {
    d.req.duty[1].mode = mode;
    const q = E.analyze(d), ob = q.outBearing;
    near(ob.governing.s0, 2.9757266);
    near(ob.s0peak, 5.951453, .00001);
    assert.equal(ob.governing.scale, 2);
    assert.match(ob.governing.label, /구간 2/);
    assert.equal(q.verdict.find(v => v.k.startsWith('출력 베어링 정적')).ok, false);
  }
  console.log('Planet and output bearing minimum safety across rotating and holding loads passed.');
}

{
  const st = { s: 27, p: 40, r: 108, n: 3, m: .4, b: 6, alpha: 20, beta: 12 };
  const q = Rc.inspectTeeth(E, st, true);
  assert.equal(q.ratio, 5); assert.equal(q.phase, 45);
  assert.ok(q.candidates.length > 0);
  for (const { profile, geo } of q.candidates) {
    near(geo.meshes[0].center, geo.meshes[1].center);
    assert.ok(Object.values(profile).every(x => Math.abs(x) <= .500000001));
    assert.ok(geo.parts.every(p => p.tipThickness >= .4 * st.m));
    assert.ok(geo.checks.every(c => c.ok || c.k.includes('ε')));
  }
  const unshifted = Rc.inspectTeeth(E, st, false);
  assert.equal(unshifted.candidates.length, 0);
  assert.ok(unshifted.reasons.some(([key]) => key.includes('중심거리')));
  const wrongPhase = Rc.inspectTeeth(E, { ...st, n: 4 }, true);
  assert.equal(wrongPhase.candidates.length, 0);
  assert.ok(wrongPhase.reasons.some(([key]) => key.includes('등간격')));
  console.log('Fixed-tooth shift search, phase and exclusion reasons passed.');
}

{
  const d = E.defaultDesign();
  d.req.Trated = 8;
  const mc = E.monteCarlo(d, 24);
  assert.equal(mc.life.noDamage, 13);   // BOM-1: 썬 지지 고정 가정 (20 N/µm · 유격 0) assert.equal(mc.life.invalid, 0);
  assert.equal(mc.life.p50, Infinity); assert.equal(mc.life.p90, Infinity);
  near(mc.passLife, 18/24);
  console.log('Unconditional empirical life quantiles passed.');
}

for (const type of ['mc', 'sens']) {
  const workers = [], results = [], timers = [];
  const engine = { monteCarlo: d => d.name, sensitivity: d => d.name };
  const jobs = createJobs(engine, () => {
    const w = { terminate() {}, postMessage(msg) { this.msg = msg; } };
    workers.push(w); return w;
  }, fn => timers.push(fn));
  const d = { name: 'A', mc: { samples: 24 } };
  jobs.run(type, d, r => results.push(r));
  jobs.cancel();
  workers[0].onmessage({ data: { id: workers[0].msg.id, done: true, result: 'A' } });
  workers[0].onerror();
  assert.deepEqual(results, []);
  jobs.run(type, d, r => results.push(r));
  workers[1].onerror();
  d.name = 'B';
  timers.shift()();
  assert.deepEqual(results, ['A']); // fallback uses the original snapshot
  jobs.run(type, d, r => results.push(r));
  workers[2].onerror();
  jobs.cancel(); timers.shift()();
  assert.deepEqual(results, ['A']); // superseded fallback cannot publish
}
console.log('Design revision and fallback for Monte Carlo and sensitivity passed.');
