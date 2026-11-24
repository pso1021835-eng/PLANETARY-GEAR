/* Reduced-order assembly predictions. Positions are mm in the same frame as PGD3D.layout. */
(function (root) {
  'use strict';
  const P = typeof module === 'object' && module.exports ? require('./assembly-placement.js') : root.PGDPlacement;
  const RAD = Math.PI / 180, UM = 1000, TO_ARCMIN = 60 / RAD;
  const number = (x, d = null) => typeof x === 'number' && Number.isFinite(x) ? x : d;
  const positive = x => number(x, -1) > 0;
  const deadband = (x, gap) => Math.sign(x) * Math.max(0, Math.abs(x) - gap);
  const difference = (a, b) => a.map((x, i) => x - b[i]);
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const cross = ([x, y, z], [a, b, c]) => [y * c - z * b, z * a - x * c, x * b - y * a];
  const zeros = [0, 0, 0];
  function inverse(a, b, c) {
    const det = a * c - b * b;
    return det > Math.max(1, a * c) * 1e-12 ? [c / det, -b / det, a / det] : null;
  }
  const times = ([a, b, c], [x, y]) => [a * x + b * y, b * x + c * y];

  // Rigid shaft, with force springs at their actual z and independently entered moment stiffness.
  // q = [radial translation at reference, slope]. Stiffness is N/mm and N mm/rad.
  function radialPlane(supports, force, moment, loadArm) {
    const km = supports.reduce((sum, s) => sum + s.km, 0);
    const matrix = (q, all = false) => supports.reduce(([a, b, c], s) => {
      const k = all || s.gr === 0 || Math.abs(q[0] + q[1] * s.arm) > s.gr ? s.kr : 0;
      return [a + k, b + k * s.arm, c + k * s.arm ** 2];
    }, [0, 0, km]);
    const full = inverse(...matrix(zeros, true));
    if (!full) {
      if (Math.abs(force) <= 1e-9 && km > 0 && !supports.some(s => s.kr > 0)) {
        return { q: [null, moment / km], radial: supports.map(() => 0), moments: supports.map(s => s.km * moment / km), stiffness: null, momentStiffness: km };
      }
      if (Math.abs(force) <= 1e-9 && Math.abs(moment) <= 1e-8) return { q: [null, null], radial: supports.map(() => 0), moments: supports.map(() => 0), stiffness: null, momentStiffness: null };
      return { error: '반경·기울기 평형을 풀 지지 강성이 부족합니다. 모멘트 지지 또는 떨어진 반경 지지점이 필요합니다.' };
    }
    const applied = [force, moment];
    const evaluate = q => {
      const radial = supports.map(s => s.kr * deadband(q[0] + s.arm * q[1], s.gr));
      const reaction = radial.reduce(([f, m], v, i) => [f + v, m + v * supports[i].arm], [0, km * q[1]]);
      const energy = supports.reduce((e, s) => e + s.kr * deadband(q[0] + s.arm * q[1], s.gr) ** 2 / 2,
        km * q[1] ** 2 / 2 - force * q[0] - moment * q[1]);
      return { radial, residual: difference(reaction, applied), energy };
    };
    let q = times(full, applied);
    for (let step = 0; step < 300; step++) {
      const at = evaluate(q), [rf, rm] = at.residual;
      const tangent = inverse(...matrix(q));
      if (Math.abs(rf) <= 1e-7 * Math.max(1, Math.abs(force)) && Math.abs(rm) <= 1e-7 * Math.max(1, Math.abs(moment))) {
        const compliance = tangent && (tangent[0] + 2 * loadArm * tangent[1] + loadArm ** 2 * tangent[2]);
        return { q, radial: at.radial, moments: supports.map(s => s.km * q[1]), stiffness: compliance > 0 ? 1 / compliance : null,
          momentStiffness: tangent?.[2] > 0 ? 1 / tangent[2] : null };
      }
      const delta = times(tangent || full, [-rf, -rm]);
      let alpha = 1;
      const slope = rf * delta[0] + rm * delta[1];
      while (alpha > 1e-10) {
        const next = add(q, delta.map(v => v * alpha));
        if (evaluate(next).energy <= at.energy + alpha * slope * 1e-4 + 1e-12) { q = next; break; }
        alpha /= 2;
      }
      if (alpha <= 1e-10) break;
    }
    return { error: '유격 구간에서 지지 반력이 평형에 수렴하지 않았습니다.' };
  }
  function axial(supports, force) {
    const ks = supports.filter(s => s.ka > 0);
    if (!ks.length) return force === 0 ? { q: null, axial: supports.map(() => 0), stiffness: null } : { error: '축하중을 받는 지지점에 축 강성을 입력하세요.' };
    const sign = Math.sign(force);
    const reaction = x => ks.reduce((f, s) => f + s.ka * Math.max(0, x - s.ga), 0);
    let lo = 0, hi = Math.max(...ks.map(s => s.ga)) + Math.abs(force) / Math.min(...ks.map(s => s.ka));
    for (let n = 0; n < 70; n++) {
      const mid = (lo + hi) / 2;
      if (reaction(mid) > Math.abs(force)) hi = mid; else lo = mid;
    }
    const q = sign * (lo + hi) / 2;
    const stiffness = ks.reduce((k, s) => k + (s.ga === 0 || Math.abs(q) > s.ga ? s.ka : 0), 0);
    return { q, axial: supports.map(s => s.ka * deadband(q, s.ga)), stiffness: stiffness || null };
  }

  function supportResponse(given, load) {
    const reference = given[0]?.p ?? zeros;
    const supports = given.map(s => ({ ...s, arm: s.p[2] - reference[2] }));
    const lever = difference(load.p, reference);
    const m = add(load.m, cross(lever, load.f));
    const x = radialPlane(supports, load.f[0], m[1], lever[2]);
    const y = radialPlane(supports, load.f[1], -m[0], lever[2]);
    const z = axial(supports, load.f[2]);
    const errors = [...new Set([x.error, y.error, z.error].filter(Boolean))];
    if (errors.length) return { reference, load, errors };
    const reactions = supports.map((s, i) => ({ id: s.id, name: s.name, p: s.p,
      f: [-x.radial[i], -y.radial[i], -z.axial[i]], m: [y.moments[i], -x.moments[i], 0] }));
    const residual = reactions.reduce((b, s) => ({
      f: add(b.f, s.f), m: add(b.m, add(s.m, cross(difference(s.p, reference), s.f)))
    }), { f: load.f, m });
    // Axial and roll reactions on an eccentric station would couple to the other planes.
    // The support model only accepts collinear stations; return any remaining torsion separately.
    const displacement = (plane, arm) => plane.q[0] == null ? null : (plane.q[0] + plane.q[1] * arm) * UM;
    const inUnit = (value, scale) => value == null ? null : value * scale;
    return {
      reference, load, reactions, residual, errors,
      shift: [displacement(x, lever[2]), displacement(y, lever[2]), inUnit(z.q, UM)],
      tilt: [inUnit(y.q[1], -TO_ARCMIN), inUnit(x.q[1], TO_ARCMIN)],
      stiffness: [inUnit(x.stiffness, 1 / UM), inUnit(y.stiffness, 1 / UM), inUnit(z.stiffness, 1 / UM)],
      momentStiffness: [inUnit(y.momentStiffness, 1 / (UM * TO_ARCMIN)), inUnit(x.momentStiffness, 1 / (UM * TO_ARCMIN))]
    };
  }

  function loadResponse(D, L, placement, poses, settings) {
    const at = (id, z) => add([0, 0, z], poses.get(id)?.slice(0, 3) ?? zeros);
    const ext = D.req.ext || {};
    const force = number(ext.Fr), axialForce = number(ext.Fa), moment = number(ext.M);
    if ([force, axialForce, moment].some(value => value == null || value < 0)) return { errors: ['축·반경 하중과 전복모멘트 크기를 0 이상으로 입력하세요.'] };
    const a = (number(settings.forceAz, 0) * RAD), b = (number(settings.momentAz, 90) * RAD);
    const unit = angle => [Math.cos(angle), Math.sin(angle)];
    const [fx, fy] = unit(a), [mx, my] = unit(b);
    const zB = (L.zBear[0] + L.zBear[1]) / 2;
    const support = (id, name, p) => {
      const j = P.entry(placement, id).joint;
      const km = number(j.kMoment, id === 'xroller' ? number(D.outBearing.Km, 0) : 0);
      return { id, name, p, kr: Math.max(0, number(j.kRadial, 0)) * UM, ka: Math.max(0, number(j.kAxial, 0)) * UM,
        km: Math.max(0, km) * UM * TO_ARCMIN, gr: Math.max(0, number(j.gapRadial, 0)) / UM,
        ga: Math.max(0, number(j.gapAxial, 0)) / UM };
    };
    const supports = [support('xroller', D.outBearing.name || '출력 베어링', at('xroller', zB))];
    for (const body of placement.bodies) {
      const j = P.entry(placement, body.id).joint;
      if (j.outputSupport === true) supports.push(support(body.id, body.name, at(body.id, 0)));
    }
    const origin = supports[0].p;
    const bad = supports.find(s => Math.hypot(s.p[0] - origin[0], s.p[1] - origin[1]) > 1e-6);
    const tilted = supports.find(s => (poses.get(s.id)?.slice(3, 5) ?? []).some(v => Math.abs(v) > 1e-8));
    if (bad || tilted) return { errors: ['동축 출력 지지 모델은 지지점의 반경 위치와 축 방향이 일치해야 합니다.'] };
    const point = at('oflange', L.zFlange[1]);
    if (number(settings.loadZ) != null) point[2] = settings.loadZ;
    const load = { p: point, f: [force * fx, force * fy, axialForce], m: [moment * UM * mx, moment * UM * my, 0] };
    return supportResponse(supports, load);
  }

  function meshEnvelope(L, placement, poses) {
    const parts = [];
    const put = (id, name, z0, z1, radius, bore = 0, r = 0, angle = 0, speed = 0, approximate = false) => {
      if (![z0, z1, radius, bore, r, angle, speed].every(Number.isFinite) || radius <= 0 || z0 >= z1) return;
      const p = poses.get(id) ?? [0, 0, 0, 0, 0, 0];
      const tilt = Math.min(Math.PI / 2, (Math.abs(p[3]) + Math.abs(p[4])) * RAD);
      const h = (z1 - z0) / 2;
      parts.push({ id, name, z: (z0 + z1) / 2 + p[2], h: h + radius * Math.sin(tilt), roof: radius + h * Math.sin(tilt),
        bore: tilt > 1e-9 ? 0 : bore, x: p[0], y: p[1], orbit: r,
        angle: angle + p[5] * RAD, speed, edited: p.some(Boolean) || id.startsWith('added-'), approximate: approximate || tilt > 1e-9 });
    };
    let ratio = 1, cycle = 1, numerator = 1, denominator = 1;
    const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
    L.S.forEach((part, i) => {
      const n = i + 1, { st, g, z0, b, a, carrier } = part;
      ratio *= g.ratio;
      numerator *= g.parts[0].z + g.parts[2].z;
      denominator *= g.parts[0].z;
      if (Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator)) {
        const period = numerator / gcd(numerator, denominator);
        cycle = cycle / gcd(cycle, period) * period;
      } else cycle = Infinity;
      put(`sun${n}`, `${n}단 썬`, z0, z0 + b, g.parts[0].da / 2, part.sunBore / 2, 0, 0, 0, true);
      if (!L.shared || i === 0) put(L.shared ? 'ring' : `ring${n}`, L.shared ? '공용 링' : `${n}단 링`, z0, L.shared ? L.gearEnd : z0 + b, part.ringOD / 2, g.parts[2].da / 2, 0, 0, 0, true);
      const phase0 = L.S[0].g.parts[1].z % 2 ? Math.PI / L.S[0].g.parts[2].z : 0;
      const phase = L.shared && i > 0 ? phase0 - z0 * Math.tan(st.beta * RAD) / (g.parts[2].d / 2) - (g.parts[1].z % 2 ? Math.PI / g.parts[2].z : 0) : 0;
      for (let j = 0; j < st.n; j++) {
        const phi = j * 2 * Math.PI / st.n + phase;
        put(`planet${n}`, `${n}단 유성 ${j + 1}`, z0, z0 + b, g.parts[1].da / 2, part.planetBore / 2, a, phi, 1 / ratio, true);
        put(`pin${n}`, `${n}단 핀 ${j + 1}`, z0 + carrier.stock[0], z0 + carrier.stock[1], carrier.diameter / 2, 0, a, phi, 1 / ratio);
        if (part.planetBore > st.pin.d + .6) put(`needle${n}`, `${n}단 니들 ${j + 1}`, z0, z0 + b, part.planetBore / 2, carrier.diameter / 2, a, phi, 1 / ratio, true);
      }
      put(`carrier${n}`, `${n}단 캐리어`, z0 + carrier.axial[0], z0 + carrier.axial[1], carrier.outerD / 2, carrier.innerD / 2, 0, 0, 0, true);
    });
    put('xroller', '출력 베어링', ...L.zBear, L.raceOut, L.raceIn, 0, 0, 0, true);
    put('oflange', '출력 플랜지', ...L.zFlange, L.raceIn + .4, L.hollowR + .6);
    put('housing', '하우징 몸체', L.zIn + L.sh.coverT, L.zBear[0] - .2, L.housR, L.ringOD / 2, 0, 0, 0, true);
    put('housing', '출력 베어링 하우징', L.zBear[0] - .2, L.zFlange[1] + .4, L.flangeR, L.raceOut, 0, 0, 0, true);
    put('cover', '입력 커버', L.zIn, L.zIn + L.sh.coverT, L.housR, L.shaftR + L.sealH, 0, 0, 0, true);
    put('ocover', '출력 커버', ...L.zOC, L.raceOut + .2, L.ocIR);
    put('inshaft', '입력축', L.zIn - L.shaftExt, L.S[0].b, L.shaftR, L.hollowR);
    put('oshaft', '출력축', ...L.zOS, L.oshaftR, L.oshaftIR);
    put('seal', '입력 오일 실', L.zIn - .1, L.zIn - .1 + L.sealW, L.shaftR + L.sealH, L.shaftR);
    if (L.s1on) put('brgS1', '1단 썬 지지', ...L.zB1, L.shaftR + L.b1h, L.shaftR, 0, 0, 0, true);
    if (L.s2on && L.sunBoreR > L.oshaftR + .5) put('brgS2', '2단 썬 지지', ...L.zB2, L.sunBoreR, L.oshaftR, 0, 0, 0, true);
    for (let j = 0; j < Math.min(48, L.sh.boltN); j++) {
      const phi = 2 * Math.PI * (j + .5) / L.sh.boltN, d = L.sh.boltD;
      put('bolts', `입력 체결 볼트 ${j + 1}`, L.zIn - d * .7, L.zIn, d * .85, 0, L.coverBoltR, phi, 0, true);
      put('bolts', `출력 체결 볼트 ${j + 1}`, L.zFlange[1], L.zFlange[1] + d * .7, d * .85, 0, L.flangeBoltR, phi, 1 / ratio, true);
    }
    for (const body of placement.bodies) {
      const isRing = body.shape === 'ring';
      put(body.id, body.name, -body.length / 2, body.length / 2,
        isRing ? body.width / 2 : Math.hypot(body.width, body.depth) / 2, isRing ? body.bore / 2 : 0, 0, 0, 0, !isRing);
    }
    const excluded = [...poses].filter(([id, p]) => p.some(Boolean) && !parts.some(b => b.id === id)).map(([id]) => id);
    return { parts, cycle, excluded };
  }
  const contactExempt = (a, b) => {
    if (a.id === b.id) return !/^(planet|pin|needle)/.test(a.id);
    if (a.id.startsWith('added-') || b.id.startsWith('added-')) return false;
    const ids = [a.id, b.id].sort();
    const stage = id => id.match(/[12]$/)?.[0];
    if (stage(a.id) !== stage(b.id) && !ids.includes('ring')) return false;
    return /^planet[12] ring[12]?$|^planet[12] sun[12]$|^pin[12] planet[12]$|^carrier[12] pin[12]$|^carrier[12] planet[12]$|^needle[12] (pin|planet)[12]$|^carrier[12] needle[12]$/.test(ids.join(' '));
  };
  function contactScan(parts, cycle) {
    const hits = [];
    let tested = 0;
    const pos = (p, theta) => [p.x + p.orbit * Math.cos(p.angle + theta * p.speed), p.y + p.orbit * Math.sin(p.angle + theta * p.speed)];
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      if ((!a.edited && !b.edited) || contactExempt(a, b)) continue;
      tested++;
      const az = Math.abs(a.z - b.z) - a.h - b.h;
      if (az > 1e-6) continue;
      const dynamic = a.speed > 0 || b.speed > 0;
      const total = Math.min(cycle, 1000) * 2 * Math.PI;
      const N = dynamic ? Math.max(1, Math.min(1440, Math.ceil(total * Math.max(a.speed, b.speed) / (2 * RAD)))) : 1;
      const step = dynamic ? total / N : 0;
      const lipschitz = a.orbit * a.speed + b.orbit * b.speed;
      let minimum = Infinity, criticalRadial = Infinity, at = 0, initial;
      for (let k = 0; k < N; k++) {
        const d = Math.hypot(...difference(pos(a, k * step), pos(b, k * step)));
        const radial = Math.max(d - a.roof - b.roof, a.bore > 0 ? a.bore - d - b.roof : -Infinity, b.bore > 0 ? b.bore - d - a.roof : -Infinity);
        const margin = Math.max(az, radial);
        if (k === 0) initial = margin;
        if (margin < minimum || (margin === minimum && radial < criticalRadial)) { minimum = margin; criticalRadial = radial; at = k * step; }
      }
      if (minimum - step * lipschitz / 2 > 1e-6) continue;
      hits.push({ a: a.id, b: b.id, names: [a.name, b.name], margin: minimum, initial,
        angle: at / RAD, approximate: a.approximate || b.approximate, between: minimum > 1e-6 });
    }
    return { hits: hits.sort((a, b) => a.margin - b.margin), tested, cycle: Math.min(cycle, 1000), truncated: cycle > 1000 };
  }

  function reverse(stages, settings) {
    const t = number(settings.torque), rpm = number(settings.rpm);
    if (t == null || rpm == null || rpm < 0 || t < 0) return { error: '역구동 출력 토크와 출력 속도를 0 이상으로 입력하세요.' };
    const ratio = stages.reduce((r, s) => r * s.ratio, 1);
    const byStage = [], held = [];
    let at = t;
    for (const s of [...stages].reverse()) {
      const sun = at / s.ratio;
      held.push({ stage: s.stage, output: at, input: sun, ring: at - sun });
      at = sun;
    }
    const TinHeld = at;
    const inStart = number(settings.inputStart), outStart = number(settings.outputStart);
    const inputDrag = number(settings.inputDrag), outputDrag = number(settings.outputDrag);
    const start = [inStart, outStart].every(v => v != null && v >= 0) ? outStart + ratio * inStart : null;
    const eligible = rpm > 0 && t > 0 && [inputDrag, outputDrag].every(v => v != null && v >= 0);
    let usable = null, efficiency = null;
    if (eligible) {
      let available = Math.max(0, t - outputDrag);
      for (const s of [...stages].reverse()) {
        const sun = available * s.efficiency / s.ratio;
        byStage.push({ stage: s.stage, output: available, input: sun, gearEff: s.efficiency,
          ring: available - sun, loss: available - sun * s.ratio });
        available = sun;
      }
      usable = Math.max(0, available - inputDrag);
      efficiency = usable * ratio / t;
    }
    return { held, shaftTorque: TinHeld, start, canStart: start == null ? null : t > start, byStage,
      efficiency, usable, rpmIn: rpm * ratio, supplied: t, commonRing: settings.commonRing === true };
  }

  function analyze(R, D, L, ids) {
    const state = P.read(D), settings = D.assemblyPhysics || {};
    const { poses, errors } = P.solve(state, [...new Set([...ids, ...state.bodies.map(b => b.id)])]);
    const jointErrors = [...errors].map(([id, message]) => ({ id, message }));
    if (jointErrors.length) return { jointErrors };
    const geometry = meshEnvelope(L, state, poses);
    const reverseArg = { ...settings, torque: number(settings.torque, D.req.Trated), rpm: number(settings.rpm, D.req.rpm / R.ratio),
      commonRing: D.config.sharedRing && R.ctx.stages.length > 1 };
    const supports = loadResponse(D, L, state, poses, settings);
    let loadDrag;
    if (positive(settings.loadMu)) {
      if (supports.reactions) {
        loadDrag = supports.reactions.reduce((sum, s) => {
          const radius = s.id === 'xroller' ? L.dp / 2000 : (state.bodies.find(b => b.id === s.id)?.width ?? 0) / 2000;
          // Equivalent friction coefficient entered by the user. Forces act through the rolling radius.
          return sum + settings.loadMu * (Math.hypot(...s.f) * radius + Math.hypot(...s.m) / UM);
        }, 0);
      } else loadDrag = null;
      if (number(reverseArg.outputDrag) != null) reverseArg.outputDrag = loadDrag == null ? null : reverseArg.outputDrag + loadDrag;
    }
    const stages = R.ctx.stages.map((s, i) => ({ stage: i + 1, ratio: s.geo.ratio,
      efficiency: Math.max(0, Math.min(1, number(settings.gearEff?.[i], R.eff.stages[i].gear * 100) / 100)) }));
    return {
      jointErrors,
      supports,
      clearance: { ...contactScan(geometry.parts, geometry.cycle), excluded: geometry.excluded, count: geometry.parts.length,
        meshMoved: [...poses].some(([id, pose]) => /^(sun|ring|planet|carrier|pin|needle)/.test(id) && pose.some(Boolean)) },
      reverse: { ...reverse(stages, reverseArg), loadDrag }
    };
  }

  const api = { supportResponse, contactScan, reverse, analyze };
  root.PGDAssemblyPhysics = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
