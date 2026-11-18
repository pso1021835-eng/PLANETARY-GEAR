// Regression against a KISSsoft 2026-SP2 report (HDS_82pi_1stage_common_R2 · planetary set, spur, ISO 6336:2019).
// Same inputs as the report; the 'iso' basis must reproduce the report within the tolerances below.
const E = require('./engine.js');
const D = E.defaultDesign();
D.config = { stages: 1, sharedRing: false, floatingSun: false };
const st = D.stages[0];
Object.assign(st, { s: 28, p: 35, n: 3, m: 0.4, beta: 0, alpha: 20, b: 5, xs: 0.1828, xp: 0.0745, xr: 0.3318, autoRingShift: false, grade: 6,
  mod: { crown: 0, tip: 2, verified: 'none' }, sunBore: 0, planetBore: 0, ringOD: 60,
  asn: [[0, 0], [-0.054, -0.084], [-0.054, -0.084]], cutter: { z0: 32, x0: 0 },
  pin: { d: 7, type: 'double', material: 'SUJ2', wall: 1.0, allow: 1200, holeMode: 'through', depth: null },
  carrier: { width: 7.5, groove: 5.5, pocket: null, outerD: null, innerD: null, bossT: 0, bossD: null, material: 'S45C' } });
D.stages = [st];
D.materials = Array.from({ length: 6 }, () => ({ family: 'Eh', surfaceHRC: 61, coreHRC: 28, depth: 0.3 }));
D.design.quality = 'MQ';
Object.assign(D.req, { Trated: 16.2, Tpeak: 16.2, Temerg: 16.2, rpm: 3010, lifeH: 100, SH: 1.0, SF: 1.4, duty: [{ torque: 100, time: 100, rpm: 0 }] });
Object.assign(D.lube, { type: 'oil', base: 'mineral', nu40: 220, nu100: 17.5, temp: 70, rho: .895, rzFlank: 4.8, rzRoot: 20, fzg: 12, starvation: 1 });
Object.assign(D.loads, { basis: 'iso', KA: 1.25, kgMode: 'fixed', kgFixed: 1.0, extraFsh: [0, 0], rigidCarrier: true });
const o = E.analyze(D);
if (o.errors.length) { console.log('errors', o.errors); process.exit(1); }
const R = o.rated.rows, by = id => R.find(r => r.id === id);
// [label, site value, KISSsoft value, relative tolerance]
const cases = [];
const add = (k, v, ref, tol) => cases.push([k, v, ref, tol]);
const sun = by('0-0-0'), pS = by('0-0-1'), pR = by('0-1-1'), ring = by('0-1-2');
add('cγα S–P', sun.f.cg, 16.776, .01); add('cγα P–R', ring.f.cg, 20.981, .01); add("c' S–P", sun.f.cp, 11.553, .01);
add('Kv S–P', sun.f.Kv, 1.02, .01); add('Kv P–R', ring.f.Kv, 1.05, .01);
add('KHβ S–P', sun.f.KHb, 1.43, .02); add('KHβ P–R', ring.f.KHb, 1.67, .02); add('KFβ S–P', sun.f.KFb, 1.35, .02); add('KFβ P–R', ring.f.KFb, 1.53, .02);
add('KHα S–P', sun.f.KHa, 1.18, .025); add('KHα P–R', ring.f.KHa, 1.39, .02);
add('σH0 S–P', sun.f.H0, 1075.94, .002); add('σH0 P–R', ring.f.H0, 546.02, .002);
add('YF sun', sun.f.YF, 1.33, .01); add('YS sun', sun.f.YS, 2.05, .01);
add('YF planet (sun side)', pS.f.YF, 1.99, .01); add('YS planet (sun side)', pS.f.YS, 1.67, .01);
add('YF planet (ring side)', pR.f.YF, 1.63, .01); add('YS planet (ring side)', pR.f.YS, 1.77, .01);
add('YF ring', ring.f.YF, 1.03, .02); add('YS ring', ring.f.YS, 2.50, .02);
add('σF0 sun', sun.f.F0, 292.27, .01); add('σF0 planet S', pS.f.F0, 357.35, .01); add('σF0 planet R', pR.f.F0, 309.13, .01); add('σF0 ring', ring.f.F0, 277.39, .02);
add('SH sun', sun.SH, 0.83, .025); add('SH planet S', pS.SH, 0.96, .025); add('SH planet R', pR.SH, 1.53, .025); add('SH ring', ring.SH, 1.64, .025);
add('SF sun', sun.SF, 1.26, .03); add('SF planet S', pS.SF, 0.74, .03); add('SF planet R', pR.SF, 0.63, .03); add('SF ring', ring.SF, 1.03, .03);
add('life planet root h', o.spectrum.list.find(p => p.id === '0-1-1').lifeH, 0.02178, .1);
add('efficiency', o.eff.total * 100, 97.457, .005);
let bad = 0;
for (const [k, v, ref, tol] of cases) { const d = v / ref - 1, ok = Math.abs(d) <= tol; if (!ok) bad++; console.log(`${ok ? 'ok ' : 'BAD'} ${k.padEnd(24)} site ${v.toFixed(4).padStart(10)}  KISS ${String(ref).padStart(8)}  ${(d * 100).toFixed(2)} %`); }
console.log(bad ? `KISSsoft regression: ${bad} out of tolerance` : `KISSsoft regression: all ${cases.length} within tolerance`);
process.exit(bad ? 1 : 0);
