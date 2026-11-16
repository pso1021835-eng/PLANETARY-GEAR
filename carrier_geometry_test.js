'use strict';
const assert = require('node:assert/strict');
const E = require('./engine.js');
require('./viewer3d.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);
const test = E.defaultDesign();
const shape = i => E.prepare(test).stages[i].carrier;
const a = shape(0), b = shape(1);
assert.deepEqual(a.errors, []);
assert.deepEqual(b.errors, []);
close(a.drivePCD, 42.324900627412205);
close(a.groove, 5.6);
close(a.pinLength, 13.6);
close(a.span, 9.6);
close(a.hole.entry, 9.3);
close(b.hole.entry, -4.3);
assert.equal(a.hole.direction, -1);
assert.equal(b.hole.direction, 1);
assert.equal(a.web.sections.length, 3);
for (const pin of a.pins) close(Math.hypot(pin.x, pin.y), a.orbit);
close((a.web.z[0] + a.web.z[1]) / 2, 2.5);

test.stages[0].carrier.bossD = 48; // fully covers the Ø4 holes on the 42.325 mm PCD
const throughBoss = shape(0);
assert.deepEqual(throughBoss.errors, []);
assert.equal(throughBoss.bossCoversPin, true);
close(throughBoss.pinLength, a.pinLength + a.bossT);
assert.equal(throughBoss.slabs[0].drilling.length, 1);

test.stages[0].carrier.bossD = null;
test.stages[0].pin.holeMode = 'blind';
const blind = shape(0);
assert.deepEqual(blind.errors, []);
assert.equal(blind.slabs.flatMap(s => s.drilling).filter(h => h.r0 !== h.r1).length, 1);
close(blind.hole.end - blind.hole.tip, 2 / Math.tan(59 * Math.PI / 180));
close(blind.pinLength, blind.hole.depth);
assert.ok(blind.engagement[0] < 4);
close(blind.engagement[1], 4);
assert.ok(blind.span < a.span);
assert.ok(blind.materialVolume > a.materialVolume);
const ctx = E.prepare(test), evaluated = E.evaluate(ctx, { Tout: 9, rpm: 3000, lifeOff: true });
close(evaluated.stages[0].pin.span, blind.span);
assert.ok(evaluated.stages[0].pin.reactions[0] > evaluated.stages[0].pin.reactions[1]);
assert.equal(E.carrierPin(ctx, test)[0].geometry, ctx.stages[0].carrier);

test.stages[0].pin.depth = 4.5;
assert.ok(shape(0).errors.some(s => s.includes('지지판')));
test.stages[0].pin.depth = null;
test.stages[0].pin.type = 'single';
test.stages[0].carrier.axialClearance = .5;
test.stages[0].carrier.groove = 1; // inactive in single support
const single = shape(0);
assert.deepEqual(single.errors, []);
assert.equal(single.web, null);
assert.equal(single.plates.length, 1);
close(single.span, 5.5);
close(single.pinLength, single.hole.depth + 5.5);
close(single.engagement[0], single.hole.depth);
close(single.stock[1], 5);
assert.equal(single.hole.entry, -.5);

test.stages[1].pin.type = 'single';
test.stages[1].pin.holeMode = 'blind';
const far = shape(1);
assert.deepEqual(far.errors, []);
close(far.stock[0], 0);
assert.ok(far.hole.tip > far.hole.end);
test.stages[1].carrier.bossD = 43;
assert.ok(shape(1).errors.some(s => s.includes('부분적으로')));
test.stages[1].carrier.bossD = null;

const rating = E.analyze(test), { PGD3D } = globalThis;
const layout = PGD3D.layout(rating, test), bom = PGD3D.partsList(rating, test);
assert.equal(layout.S[0].carrier, rating.ctx.stages[0].carrier);
close(layout.S[1].z0 + far.axial[0] - single.axial[1], .6);
close(bom.find(p => p.id === 'pin1').mass, Math.PI * 2 ** 2 * single.pinLength * 7.85e-6);
close(bom.find(p => p.id === 'carrier1').mass, single.materialVolume * 7.85e-6);
assert.ok(PGD3D.partSchema(rating, test, 'pin1').some(row => row.readonly && Number(row.value) > 5));

const legacy = E.defaultDesign();
legacy.geom = { carrier1: { plateD: 52 } };
assert.equal(E.prepare(legacy).stages[0].carrier.outerD, 52);
console.log('Carrier geometry: PCD, support, opposite boss/drill directions, through and blind pin lengths, load spans, layout and BOM passed.');
