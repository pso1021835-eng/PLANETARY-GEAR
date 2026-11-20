// Regression tests: peak static verdict per target, rotation reversal, stop/idle spectrum time base, legacy duty JSON.
const fs = require('fs');
const E = require('./engine.js');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + msg); if (!cond) fails++; };
const near = (a, b, tol) => Math.abs(a / b - 1) <= tol;
const base = () => E.defaultDesign();

// 1. peak static check: SH and SF each against their own target
{
  const D = base(); D.req.Tpeak = 40; D.req.SHstat = 1.0; D.req.SFstat = 1.4;
  const o = E.analyze(D), v = o.verdict.find(x => x.k.startsWith('피크'));
  ok(near(o.staticCap, 35.51, 2e-3), `정적 한계 토크 ${o.staticCap.toFixed(2)} ≈ 35.51 N·m`);
  ok(v.k === '피크 굽힘 미달' && !v.ok, `피크 40 N·m 판정 "${v.k}" ok=${v.ok}`);
  ok(o.peakCheck.mode === 'F' && near(o.peakCheck.S, 1.240, 2e-3) && o.peakCheck.target === 1.4, `지배 SF ${o.peakCheck.S.toFixed(3)} / 1.4 · ${o.peakCheck.where}`);
  for (const T of [20, 30, 35, 35.4, 35.6, 36, 40, 60]) {
    const d = base(); d.req.Tpeak = T; d.req.SHstat = 1.0; d.req.SFstat = 1.4;
    const r = E.analyze(d);
    ok(r.peakCheck.ok === (r.staticCap >= T), `Tpeak ${T}: 피크 판정 ${r.peakCheck.ok} = 정적 한계(${r.staticCap.toFixed(2)}) ≥ Tpeak`);
  }
}
// 2. reversal: |rpm| for Kv and revolutions, negative torque is a load level on the coast flank
{
  const D = base(), ctx = E.prepare(D), cyc = E.cyclesFor(100);
  const kv = rpm => E.evaluate(ctx, { Tout: 16.2, rpm, cycles: cyc }).stages.map(s => s.meshK.map(m => m.Kv)).flat();
  const kf = kv(3010), kr = kv(-3010);
  ok(kf.every((x, i) => Math.abs(x - kr[i]) < 1e-12) && kf.some(x => x > 1), `Kv(+3010) = Kv(−3010) = ${kf.map(x => x.toFixed(4)).join(' / ')}`);
  const neg = E.evaluate(ctx, { Tout: -16.2, rpm: 3010, cycles: cyc }), pos = E.evaluate(ctx, { Tout: 16.2, rpm: 3010, cycles: cyc });
  ok(neg.flank === 'coast' && pos.flank === 'drive' && neg.rows.every((r, i) => Math.abs(r.SH - pos.rows[i].SH) < 1e-9), '음수 토크: 역방향 치면, 응력 크기 동일');
  const ob = duty => { const d = base(); d.req.ext = { Fr: 300, Fa: 100, M: 4 }; d.req.duty = duty; return E.outputBearing(E.prepare(d), d).L10h; };
  const fwd = ob([{ torque: 100, time: 100, mode: 'rated' }]);
  const rev = ob([{ torque: 100, time: 50, mode: 'set', rpm: 3010 }, { torque: 100, time: 50, mode: 'set', rpm: -3010 }]);
  ok(near(fwd, 3264, 2e-3), `출력 베어링 L10 정회전 ${fwd.toFixed(0)} h ≈ 3264`);
  ok(near(rev, fwd, 1e-9), `출력 베어링 L10 ±3010 50 % ${rev.toFixed(0)} h = 정회전 (∞ 아님)`);
  const life = duty => { const d = base(); d.req.duty = duty; return E.spectrumDamage(E.prepare(d), d); };
  const allPos = life([{ torque: 100, time: 100, mode: 'rated' }]).minLife, allNeg = life([{ torque: -100, time: 100, mode: 'rated' }]).minLife;
  ok(near(allNeg, allPos, 1e-9), `전 구간 역방향 토크 수명 ${allNeg.toFixed(3)} = 정방향 ${allPos.toFixed(3)} h`);
  const mix = life([{ torque: 100, time: 50, mode: 'rated' }, { torque: -100, time: 50, mode: 'rated' }]);
  ok(mix.reversal && mix.minLife > allPos && mix.minLife < 2 * allPos + 1e-9 && mix.gov.flank, `정·역 50 % 수명 ${mix.minLife.toFixed(3)} h (지배 ${mix.gov.partName} ${mix.gov.flank}) — 음수 구간 제외 없음`);
  const planet = mix.list.filter(p => p.part === 1);
  ok(planet.length && planet.every(p => near(p.lifeH, allPos * 1, 1e-9) || p.lifeH <= allPos * 2), '유성 치근: 정·역 반전 시 같은 필렛 손상 합산');
  const D2 = base(); D2.req.duty = [{ torque: 100, time: 50, mode: 'rated' }, { torque: -100, time: 50, mode: 'rated' }];
  const bl = E.bearingLife(E.prepare(D2), D2)[0].L10h, D3 = base(); const bl0 = E.bearingLife(E.prepare(D3), D3)[0].L10h;
  ok(near(bl, bl0, 1e-9), `유성 베어링 L10 정·역 ${bl.toFixed(1)} = 정방향 ${bl0.toFixed(1)} h`);
}
// 3. stop / idle levels: normalised by total elapsed time
{
  const life = duty => { const d = base(); d.req.duty = duty; return E.spectrumDamage(E.prepare(d), d).minLife; };
  const full = life([{ torque: 100, time: 100, mode: 'rated' }]);
  const stop90 = life([{ torque: 100, time: 10, mode: 'rated' }, { torque: 0, time: 90, mode: 'stop' }]);
  const idle90 = life([{ torque: 100, time: 10, mode: 'rated' }, { torque: 0, time: 90, mode: 'rated' }]);
  ok(near(full, 3.11, 3e-3), `기어 스펙트럼 수명 100 % 연속 ${full.toFixed(3)} h ≈ 3.11`);
  ok(near(stop90, 31.1, 3e-3) && near(stop90, 10 * full, 1e-9), `10 % 운전 + 90 % 정지 ${stop90.toFixed(2)} h ≈ 31.1`);
  ok(near(idle90, 10 * full, 1e-9), `10 % 운전 + 90 % 무부하 회전 ${idle90.toFixed(2)} h`);
  const d = base(); d.req.SHstat = 1.0; d.req.SFstat = 1.4; d.req.duty = [{ torque: 100, time: 50, mode: 'rated' }, { torque: 250, time: 50, mode: 'stop' }];
  const o = E.analyze(d), hv = o.verdict.find(x => x.k.startsWith('정지 유지'));
  ok(o.holdCheck && hv && !hv.ok && o.spectrum.minLife > 0 && near(o.spectrum.minLife, 2 * full, 1e-9), `정지 유지 40.5 N·m: 회전 손상 0, 정적 판정 "${hv?.k}"`);
  const ob = duty => { const q = base(); q.req.ext = { Fr: 300, Fa: 100, M: 4 }; q.req.duty = duty; return E.outputBearing(E.prepare(q), q).L10h; };
  const idleLoaded = ob([{ torque: 0, time: 100, mode: 'rated', ext: 100 }]), idleDefault = ob([{ torque: 0, time: 100, mode: 'rated' }]);
  ok(near(idleLoaded, 3264, 2e-3) && idleDefault === Infinity, `무부하 회전 + 외부 하중 100 %: 출력 베어링 L10 ${idleLoaded.toFixed(0)} h (외부 하중 미입력 시 ∞)`);
  const ob2 = ob([{ torque: 100, time: 10, mode: 'rated' }, { torque: 0, time: 90, mode: 'stop' }]);
  ok(near(ob2, 3264 * 10, 2e-3), `출력 베어링 10 % 운전 + 90 % 정지 ${ob2.toFixed(0)} h`);
}
// 4. legacy pgd/1 JSON and save/reload of a stop level
{
  const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
  const fillMissing = new Function(src.match(/^function fillMissing[^\n]*$/m)[0] + '; return fillMissing;')();
  const legacy = JSON.parse(JSON.stringify(base())); legacy.req.duty = [{ torque: 100, time: 50, rpm: 0 }, { torque: 60, time: 50, rpm: 1500 }];
  const loaded = fillMissing(E.migrateDuty(JSON.parse(JSON.stringify(legacy))), E.defaultDesign());
  ok(loaded.req.duty[0].mode === 'rated' && loaded.req.duty[1].mode === 'set', `구 JSON rpm 0 → ${loaded.req.duty[0].mode}, rpm 1500 → ${loaded.req.duty[1].mode}`);
  const lv = E.dutyLevels(loaded);
  ok(lv[0].rpm === loaded.req.rpm && lv[1].rpm === 1500, '구 JSON 해석: 정격 rpm / 지정 1500 rpm');
  const fresh = base(); fresh.req.duty = [{ torque: 100, time: 10, rpm: 0, mode: 'rated' }, { torque: 0, time: 90, rpm: 0, mode: 'stop' }];
  const again = fillMissing(E.migrateDuty(JSON.parse(JSON.stringify(fresh))), E.defaultDesign());
  ok(again.req.duty[1].mode === 'stop' && E.dutyLevels(again)[1].rotating === false, '새 "0 rpm 정지" 구간: 저장·불러오기 후에도 정지');
}
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('engine fix regression: all passed');
