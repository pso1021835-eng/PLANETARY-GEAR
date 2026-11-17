'use strict';

const assert = require('node:assert/strict');
const E = require('./engine');
require('./viewer3d');
require('./checks');

const fresh = (update = () => {}) => {
  const D = E.defaultDesign();
  update(D);
  return D;
};
const rating = update => {
  const R = E.analyze(fresh(update));
  assert.deepEqual(R.errors, []);
  return R;
};
const close = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`
);

const base = rating();
const halfWidth = rating(d => { d.loads.posError = 3; });
const diametral = rating(d => { d.loads.posErrorType = 'diametral'; });
close(halfWidth.capacityLife, diametral.capacityLife);
close(halfWidth.rated.stages[1].Kg, diametral.rated.stages[1].Kg);
for (const T of [.001, 2.4, 9, 28]) {
  const r = E.evaluate(base.ctx, { Tout: T, rpm: 1000, cycles: E.cyclesFor(5000) });
  for (const [i, s] of r.stages.entries()) {
    const n = base.ctx.stages[i].st.n;
    close(s.KgPaths.reduce((sum, F) => sum + F, 0), n * s.Ft);
    close(s.Kg, Math.max(...s.KgPaths) / s.Ft);
    assert.ok(s.Kg >= 1 && s.Kg <= n);
  }
}

const unsupported = E.analyze(fresh(d => { d.struct.c1Support = 'none'; }));
assert.match(unsupported.errors.join(' '), /C1 지지/);
assert.equal(unsupported.capacityLife, undefined);
rating(d => { d.config.stages = 1; d.struct.c1Support = 'none'; });

const double = rating(d => { d.struct.c1Support = 'both'; d.loads.sunSupport[1].rearBearingK = 25; });
assert.equal(double.ctx.stages[1].support.bearingK, 45);
assert.ok(double.ctx.stages[1].support.k > base.ctx.stages[1].support.k);
const spline = rating(d => { d.struct.c1s2Dim.radialPlay = 3; d.loads.sunSupport[1].play = 1; });
assert.equal(spline.ctx.stages[1].support.play, 4);
assert.ok(spline.rated.stages[1].Kg < base.rated.stages[1].Kg);
close(spline.rated.stages[0].Kg, base.rated.stages[0].Kg);
const key = rating(d => { d.struct.c1s2 = 'key'; d.struct.c1s2Dim.radialPlay = 3; });
close(key.rated.stages[1].Kg, base.rated.stages[1].Kg);
const flex = rating(d => { d.stages[1].bearing.clearanceCompliance = .02; d.stages[1].pin.fitCompliance = .01; });
assert.ok(flex.rated.stages[1].kpath < base.rated.stages[1].kpath);
const runIn = rating(d => { d.loads.pathRunIn = 50; });
close(runIn.rated.stages[1].Kg, halfWidth.rated.stages[1].Kg);
assert.ok(E.prepare(fresh(d => { d.loads.pathRunIn = -1; })).errors.length);
assert.ok(E.prepare(fresh(d => { d.loads.sunSupport[1].mode = 'direct'; d.loads.sunSupport[1].k = 0; })).errors.length);
assert.equal(E.prepare(fresh(d => { d.stages[0].sunBore = 0; })).stages[0].geo.rims[0].solid, true);

const ring = rating(d => { d.stages[0].ringOD = 68; d.stages[1].ringOD = 75; });
assert.equal(ring.ctx.ringFits[0], ring.ctx.ringFits[1]);
assert.deepEqual(ring.ctx.stages.map(s => s.geo.rims[2].diameter), [68, 68]);
assert.equal(globalThis.PGD3D.layout(ring, ring.ctx.D).ringOD, 68);
const fit = globalThis.PGDChecks.compute(ring, ring.ctx.D)['8-2'];
close(fit.p, ring.ctx.ringFits[0].p);
close(fit.dj, ring.backlash.stages[0].reduction);
const noFit = rating(d => { d.struct.ringHousing = 'integral'; });
assert.ok(base.backlash.arcmin < noFit.backlash.arcmin);
assert.ok(base.backlash.stages.every(s => s.reduction > 0 && s.ringClearance < 25));
const jam = rating(d => { d.struct.ringFit.delta = .6; });
assert.ok(jam.backlash.interference);
assert.ok(jam.backlash.stages.some(s => s.ringClearance < 0));
assert.equal(jam.verdict.find(s => s.k.startsWith('출력 백래시')).ok, false);
const badFit = rating(d => { d.struct.ringFit.delta = -.01; });
assert.equal(badFit.backlash.fitValid, false);
assert.equal(badFit.verdict.find(s => s.k.startsWith('출력 백래시')).ok, false);

const inboard = rating(d => { d.struct.obPos = 'inside'; });
const outside = rating(d => { d.struct.obPos = 'outside'; });
assert.ok(inboard.outBearing.support.arm > outside.outBearing.support.arm);
assert.ok(outside.outBearing.support.arm > base.outBearing.support.arm);
assert.ok(inboard.rated.rows.at(-1).f.fshOB > base.rated.rows.at(-1).f.fshOB);
assert.equal(inboard.rated.rows[0].f.fshOB, 0);
const zeroArm = rating(d => { d.struct.obMomentArm = 0; });
close(zeroArm.outBearing.momentNm, zeroArm.ctx.D.req.ext.M);
close(base.outBearing.roll.rated.momentNm, base.outBearing.momentNm);
console.log('하중 경로 검증 통과: Kγ 합력과 공차, C1 지지와 스플라인, 공유 링 압입, 출력 베어링 레버암.');
