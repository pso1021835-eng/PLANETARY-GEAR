// Regression against two KISSsoft 2026-SP2 reports (HDS_82pi_1stage_common_R2 spur · planetary set helical, ISO 6336:2019).
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

// ---- case 2: KISSsoft report "Planetary gear set helical" (z 42/42/126, m 0.6, β 12°, ring tip chamfer hK 0.1 mm)
{
  const H = E.defaultDesign();
  H.config = { stages: 1, sharedRing: false, floatingSun: false };
  const s2 = H.stages[0];
  Object.assign(s2, { s: 42, p: 42, n: 3, m: 0.6, beta: 12, alpha: 20, b: 12, xs: 0, xp: 0, xr: 0, autoRingShift: false, grade: 6,
    mod: { crown: 0, tip: 2, verified: 'none' }, sunBore: 0, planetBore: 0, ringOD: 100, asn: [[0, 0], [0, 0], [0, 0]], cutter: { z0: 41, x0: 0 }, tipChamfer: [0, 0, 0.1],
    pin: { d: 12.88, type: 'double', material: 'SUJ2', wall: 2.0, allow: 1200, holeMode: 'through', depth: null },
    carrier: { width: 17.6, groove: 13.6, pocket: null, outerD: null, innerD: null, bossT: 0, bossD: null, material: 'S45C' } });
  H.stages = [s2];
  H.materials = Array.from({ length: 6 }, () => ({ family: 'Eh', surfaceHRC: 61, coreHRC: 28, depth: 0.3 }));
  H.design.quality = 'MQ';
  Object.assign(H.req, { Trated: 184.431, Tpeak: 184.431, Temerg: 184.431, rpm: 3000, lifeH: 20000, SH: 0.66, SF: 0.72, duty: [{ torque: 100, time: 100, rpm: 0 }] });
  Object.assign(H.lube, { type: 'oil', base: 'mineral', nu40: 220, nu100: 17.5, temp: 70, rho: .895, rzFlank: 4.8, rzRoot: 20, fzg: 12, starvation: 1 });
  Object.assign(H.loads, { basis: 'iso', KA: 1.25, kgMode: 'fixed', kgFixed: 1.0, extraFsh: [0, 0], rigidCarrier: true });
  const h = E.analyze(H);
  if (h.errors.length) { console.log('helical errors', h.errors); process.exit(1); }
  const Q = h.rated.rows, q = id => Q.find(r => r.id === id), ms = h.ctx.stages[0].geo.meshes;
  const S = q('0-0-0'), PS = q('0-0-1'), PR = q('0-1-1'), RG = q('0-1-2'), sc = h.lube.meshes;
  const a2 = (k, v, ref, tol) => add('[헬리컬] ' + k, v, ref, tol);
  a2('εα S–P', ms[0].ea, 1.669, .003); a2('εα P–R (hK 0.1)', ms[1].ea, 1.670, .003); a2('Zε P–R', ms[1].Zeps, 0.774, .003); a2('ZB planet P–R', ms[1].ZB, 1.10, .01);
  a2('cγα S–P', S.f.cg, 20.287, .01); a2('cγα P–R', RG.f.cg, 22.606, .01); a2("c' S–P", S.f.cp, 13.506, .01);
  a2('Kv S–P', S.f.Kv, 1.02, .01); a2('Kv P–R', RG.f.Kv, 1.05, .01);
  a2('Fβx S–P', S.f.fbx, 3.75, .01); a2('Fβx P–R', RG.f.fbx, 5.31, .01);
  a2('KHβ S–P', S.f.KHb, 1.21, .01); a2('KHβ P–R', RG.f.KHb, 1.33, .01); a2('KFβ S–P', S.f.KFb, 1.19, .01); a2('KFβ P–R', RG.f.KFb, 1.29, .01);
  a2('KHα S–P', S.f.KHa, 1.31, .01); a2('KHα P–R', RG.f.KHa, 1.32, .01);
  a2('σH0 S–P', S.f.H0, 1010.94, .002); a2('σH0 P–R', RG.f.H0, 583.53, .002);
  a2('YF sun', S.f.YF, 0.93, .01); a2('YS sun', S.f.YS, 2.07, .01); a2('YF planet (ring side)', PR.f.YF, 0.93, .01); a2('YS planet (ring side)', PR.f.YS, 2.07, .01);
  a2('YF ring', RG.f.YF, 0.64, .015); a2('YS ring', RG.f.YS, 2.72, .01);
  a2('σF0 sun', S.f.F0, 308.47, .005); a2('σF0 planet R', PR.f.F0, 308.23, .005); a2('σF0 ring', RG.f.F0, 275.44, .01);
  a2('SH sun', S.SH, 0.74, .015); a2('SH planet S', PS.SH, 0.76, .015); a2('SH planet R', PR.SH, 1.29, .015); a2('SH ring', RG.SH, 1.42, .015);
  a2('SF sun', S.SF, 1.10, .02); a2('SF planet S', PS.SF, 0.79, .015); a2('SF planet R', PR.SF, 0.72, .015); a2('SF ring', RG.SF, 1.16, .015);
  a2('life planet root h', h.spectrum.list.find(p => p.id === '0-1-1').lifeH, 20012, .05);
  a2('scuffing SB S–P', sc[0].SB, 5.067, .1);
  { const M = JSON.parse(JSON.stringify(H)); M.stages[0].ballD = [1.1, 1.1, 1.0]; const t = E.analyze(M).tooth[0].parts;
    a2('Wk sun (k 5)', t[0].k === 5 ? t[0].Wk[0] : NaN, 8.347, .002); a2('MdK sun (Ø1.1)', t[0].Md[0], 27.445, .002); a2('MdK ring (Ø1.0)', t[2].Md[0], 75.949, .002); }
}
// ---- 측정 치수·백래시 (KISSsoft 11.2–11.5): 스퍼 보고서, 볼 지름은 보고서의 실효값
{
  const M = JSON.parse(JSON.stringify(D)); Object.assign(M.stages[0], { ballD: [0.725, 0.725, 0.725], blMode: 'asn', aTol: [0, 0] });
  const m = E.analyze(M), t = m.tooth[0].parts, b = m.backlash, j = b.stages[0].jtRange;
  const a3 = (k, v, ref, tol = .002) => add('[측정] ' + k, v, ref, tol);
  a3('Wk sun (k 4)', t[0].Wk[0], 4.340); a3('Wk planet e (k 5)', t[1].Wk[0], 5.480); a3('Wk planet i', t[1].Wk[1], 5.451);
  a3('MdK sun', t[0].Md[0], 12.398); a3('MdK planet e', t[1].Md[0], 14.995); a3('MdK planet i', t[1].Md[1], 14.922); a3('MdK ring e', t[2].Md[0], 38.495); a3('MdK ring i', t[2].Md[1], 38.577);
  a3('jtw S–P min µm', j[0][0], 54, .02); a3('jtw S–P max µm', j[0][1], 85, .02); a3('jtw P–R min µm', j[1][0], 109, .02); a3('jtw P–R max µm', j[1][1], 169, .02);
  a3('carrier play min arcmin', b.range[0], 0.3683 * 60, .005); a3('carrier play max arcmin', b.range[1], 0.5730 * 60, .005);
}
let bad = 0;
for (const [k, v, ref, tol] of cases) { const d = v / ref - 1, ok = Math.abs(d) <= tol; if (!ok) bad++; console.log(`${ok ? 'ok ' : 'BAD'} ${k.padEnd(24)} site ${v.toFixed(4).padStart(10)}  KISS ${String(ref).padStart(8)}  ${(d * 100).toFixed(2)} %`); }
console.log(bad ? `KISSsoft regression: ${bad} out of tolerance` : `KISSsoft regression: all ${cases.length} within tolerance`);
process.exit(bad ? 1 : 0);
