// 출력 베어링 카탈로그(bearings.js) 데이터 점검 + 형번 적용 시 레이아웃이 카탈로그 치수를 따르는지 확인
const E = require('./engine.js');
require('./viewer3d.js');
const B = require('./bearings.js');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const L = B.crossRoller;
ok(L.length >= 100, `형번 ${L.length}개`);
ok(new Set(L.map(b => b.model)).size === L.length, '형번 중복 없음');
ok(L.every(b => ['THK', 'IKO'].includes(b.maker)), '제조사 THK · IKO');
ok(L.every(b => b.d >= 10 && b.d <= 100 && b.D > b.d && b.B > 0), '내경 10~100, D > d, B > 0');
ok(L.every(b => b.dp == null || (b.dp > b.d && b.dp < b.D)), 'dp는 d와 D 사이');
ok(L.every(b => b.C > 0 && b.C0 > 0 && b.C < 2e5 && b.C0 < 2e5), 'C · C0 (N) 범위');
ok(L.every(b => b.r > 0 && b.r <= Math.min(b.B, (b.D - b.d) / 2) / 3), '모서리 R이 단면보다 작음');
const series = {}; L.forEach(b => (series[b.maker] ||= new Set()).add(b.series));
console.log('    ' + Object.entries(series).map(([m, s]) => `${m}: ${[...s].join(' ')}`).join(' / '));
// 형번 적용 → 레이아웃 내·외경 = 카탈로그 d · D, 폭 = B
const D = E.templateDesign(), b = L.find(x => x.model === 'RB3010');
Object.assign(D.outBearing, { maker: b.maker, series: b.series, model: b.model, d: b.d, D: b.D, B: b.B, dp: b.dp, C: b.C, C0: b.C0, r: b.r });
const R = E.analyze(D), lay = globalThis.PGD3D.layout(R, D);
ok(lay.cat && lay.raceIn === b.d / 2 && lay.raceOut === b.D / 2 && lay.Bw === b.B && lay.dp === b.dp, `레이아웃 Ø${lay.raceIn * 2} / Ø${lay.raceOut * 2} × ${lay.Bw}, dp ${lay.dp}`);
ok(R.outBearing.C === b.C && Number.isFinite(R.outBearing.L10h), `엔진 C ${R.outBearing.C} N → L10 ${R.outBearing.L10h.toFixed(0)} h`);
const D2 = E.templateDesign(), i = L.find(x => x.dp == null); Object.assign(D2.outBearing, { d: i.d, D: i.D, B: i.B, dp: (i.d + i.D) / 2 });
ok(globalThis.PGD3D.layout(E.analyze(D2), D2).dp === (i.d + i.D) / 2, `dp 미공개 형번(${i.model})은 (d + D) / 2`);
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('bearing catalog: all passed');
