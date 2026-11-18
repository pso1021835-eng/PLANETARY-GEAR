/* 유성감속기 설계실 — 3D viewer (Three.js r128, no examples modules, no external assets)
   mode 'gears': gear set only (step 4).  mode 'full': assembled reducer with housing, carriers, bearings, flange.
   Gear outline + phasing are the verified versions from the previous app.js (do not change). */
(function () {
  'use strict';
  const T = () => window.THREE;
  const STEEL = 7.85e-6, ALU = 2.7e-6;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d) : '—';

  // ------------------------------------------------------------------ verified gear geometry
  function outline(g, at) {
    const z = g.z, rb = g.db / 2, inv = a => Math.tan(a) - a;
    const inner = g.internal ? g.da / 2 : g.df / 2, outer = g.internal ? g.df / 2 : g.da / 2;
    const half = (Math.PI / 2 + (g.internal ? -2 : 2) * g.x * Math.tan(20 * Math.PI / 180)) / z;
    const w = r => { const rr = Math.max(r, rb * 1.0000001); return half + inv(at) - inv(Math.acos(Math.min(1, rb / rr))); };
    const r0 = Math.max(inner, rb), steps = 7, pts = [];
    for (let k = 0; k < z; k++) {
      const c = 2 * Math.PI * k / z + (g.internal ? Math.PI / z : 0);
      pts.push([inner, c - w(r0)]);
      for (let i = 0; i <= steps; i++) { const r = r0 + (outer - r0) * i / steps; pts.push([r, c - w(r)]); }
      const wa = w(outer); for (let i = 1; i < 4; i++) pts.push([outer, c - wa + 2 * wa * i / 4]);
      for (let i = steps; i >= 0; i--) { const r = r0 + (outer - r0) * i / steps; pts.push([r, c + w(r)]); }
      pts.push([inner, c + w(r0)]);
      const nx = 2 * Math.PI * (k + 1) / z + (g.internal ? Math.PI / z : 0) - w(r0), cur = c + w(r0);
      for (let i = 1; i < 3; i++) pts.push([inner, cur + (nx - cur) * i / 3]);
    }
    return pts.map(([r, a]) => [r * Math.cos(a), r * Math.sin(a)]);
  }
  // rimDia: bore for external gears (0 = solid), outside diameter for the ring
  function gearGeometry(g, at, b, betaDeg, internal, rimDia) {
    const TH = T(), pts = outline(g, at).map(([x, y]) => new TH.Vector2(x, y));
    let shape;
    if (internal) {
      shape = new TH.Shape(); const R0 = Math.max(g.df / 2 + .5 * g.m, (rimDia || g.df + 8 * g.m) / 2);
      shape.absarc(0, 0, R0, 0, Math.PI * 2, false); shape.holes.push(new TH.Path(pts.slice().reverse()));
    } else {
      shape = new TH.Shape(pts);
      const rh = Math.min((rimDia || 0) / 2, g.df / 2 - .3 * g.m);
      if (rh > .2) { const hole = new TH.Path(); hole.absarc(0, 0, rh, 0, Math.PI * 2, true); shape.holes.push(hole); }
    }
    const geo = new TH.ExtrudeGeometry(shape, { depth: b, bevelEnabled: false, curveSegments: 40, steps: Math.max(2, Math.round(b)) });
    const tb = Math.tan(betaDeg * Math.PI / 180), rp = g.d / 2, pos = geo.attributes.position;
    // ring gear: the outer diameter is a plain straight cylinder — only the teeth follow the helix
    const Rout = internal ? Math.max(g.df / 2 + .5 * g.m, (rimDia || g.df + 8 * g.m) / 2) : Infinity;
    const onOD = i => Math.hypot(pos.getX(i), pos.getY(i)) > Rout - 1e-4;
    for (let i = 0; i < pos.count; i++) { if (onOD(i)) continue; const x = pos.getX(i), y = pos.getY(i), zz = pos.getZ(i), a = zz * tb / rp, c = Math.cos(a), s = Math.sin(a); pos.setXY(i, x * c - y * s, x * s + y * c); }
    geo.computeVertexNormals();
    if (internal) { const nm = geo.attributes.normal; for (let i = 0; i < pos.count; i++) if (onOD(i) && Math.abs(nm.getZ(i)) < .5) { const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y); nm.setXYZ(i, x / r, y / r, 0); } nm.needsUpdate = true; }
    return geo;
  }
  // revolved solid from an (r, z) outline (closed), chamfered corners look crisp under the environment map
  function lathe(profile, seg = 96) {
    const TH = T();
    return new TH.LatheGeometry(profile.map(([r, z]) => new TH.Vector2(r, z)), seg).rotateX(Math.PI / 2);
  }
  // annular ring r1..r2, z0..z1 with 0.3 mm chamfers
  function ringSolid(r1, r2, z0, z1, ch = .3) {
    const c = Math.min(ch, (r2 - r1) / 4, (z1 - z0) / 4);
    const p = r1 > .01
      ? [[r1 + c, z0], [r2 - c, z0], [r2, z0 + c], [r2, z1 - c], [r2 - c, z1], [r1 + c, z1], [r1, z1 - c], [r1, z0 + c], [r1 + c, z0]]
      : [[0, z0], [r2 - c, z0], [r2, z0 + c], [r2, z1 - c], [r2 - c, z1], [0, z1]];
    return lathe(p);
  }
  function annulusMass(r1, r2, L, rho) { return Math.PI * (r2 * r2 - r1 * r1) * L * rho; }

  function reverseFaces(geometry) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    for (const name of ['position', 'normal']) {
      const { array, itemSize } = g.attributes[name];
      for (let i = 0; i < array.length; i += 3 * itemSize) {
        for (let j = 0; j < itemSize; j++) {
          [array[i + itemSize + j], array[i + 2 * itemSize + j]] = [array[i + 2 * itemSize + j], array[i + itemSize + j]];
        }
      }
      if (name === 'normal') for (let i = 0; i < array.length; i++) array[i] *= -1;
    }
    return g;
  }
  function carrierBody(shape, opts = {}) {
    const TH = T(), positions = [], normals = [];
    const add = (source, reversed = false) => {
      const geometry = reversed ? reverseFaces(source) : (source.index ? source.toNonIndexed() : source);
      for (const x of geometry.attributes.position.array) positions.push(x);
      for (const x of geometry.attributes.normal.array) normals.push(x);
      geometry.dispose();
      if (!reversed && geometry !== source) source.dispose();
    };
    const wall = (r0, r1, [z0, z1], x, y, reversed, segments = 72) => add(
      new TH.CylinderGeometry(r1, r0, z1 - z0, segments, 1, true)
        .rotateX(Math.PI / 2).translate(x, y, (z0 + z1) / 2), reversed
    );
    // Ø outer and Ø inner are each built as ONE turned surface over plates + web on a shared angular grid, so plate and web
    // meet without T-junction cracks or seam lines. Between the plates only the web spans (outside the pockets) are filled.
    const RO = shape.outerD / 2, RI = shape.innerD / 2, EPSR = 1e-6, web = shape.web, np = shape.pins.length, pitch = 2 * Math.PI / np;
    const half = web ? shape.pocket / 2 : 0;
    const spansFor = R => { if (!web || !web.sections.length || half >= R) return []; const a = Math.asin(half / R); return a < pitch / 2 ? Array.from({ length: np }, (_, i) => [a + i * pitch, pitch - a + i * pitch]) : []; };
    const inSpan = (t, spans) => spans.some(([a, b]) => { const u = ((t - a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); return u <= b - a; });
    // one angular grid for every face on Ø outer / Ø inner (turned surfaces and plate faces), so their edges coincide exactly
    const ang = new Set(Array.from({ length: 240 }, (_, k) => k * Math.PI / 120));
    [...spansFor(RO), ...spansFor(RI)].forEach(([a, b]) => { for (const v of [a, b]) ang.add(((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)); });
    const A = [...ang].sort((x, y) => x - y);
    const cyl = (R, sg, bands) => {
      if (!bands.length) return;
      for (const bd of bands) for (let k = 0; k < A.length; k++) {
        const t0 = A[k], t1 = k + 1 < A.length ? A[k + 1] : A[0] + 2 * Math.PI;
        if (t1 - t0 < 1e-9 || (bd.spans && !inSpan((t0 + t1) / 2, bd.spans))) continue;
        const P = (t, z) => [R * Math.cos(t), R * Math.sin(t), z], N = t => [sg * Math.cos(t), sg * Math.sin(t), 0];
        const a = P(t0, bd.z[0]), b = P(t1, bd.z[0]), c = P(t1, bd.z[1]), d = P(t0, bd.z[1]);
        const quad = sg > 0 ? [[a, t0], [b, t1], [c, t1], [a, t0], [c, t1], [d, t0]] : [[a, t0], [c, t1], [b, t1], [a, t0], [d, t0], [c, t1]];
        for (const [p, t] of quad) { positions.push(...p); normals.push(...N(t)); }
      }
    };
    const roBands = shape.slabs.filter(sl => Math.abs(sl.outer - RO) < EPSR).map(sl => ({ z: sl.z })), riBands = shape.slabs.filter(sl => Math.abs(sl.inner - RI) < EPSR).map(sl => ({ z: sl.z }));
    if (web && web.sections.length) { roBands.push({ z: web.z, spans: spansFor(RO) }); const si = spansFor(RI); if (si.length) riBands.push({ z: web.z, spans: si }); }
    cyl(RO, 1, roBands); cyl(RI, -1, riBands);
    if (opts.spans) Object.assign(opts.spans, { RO, RI, z: web?.z, ro: spansFor(RO), ri: spansFor(RI), inSpan });
    for (const slab of shape.slabs) {
      if (Math.abs(slab.outer - RO) >= EPSR) wall(slab.outer, slab.outer, slab.z, 0, 0, false);
      if (Math.abs(slab.inner - RI) >= EPSR) wall(slab.inner, slab.inner, slab.z, 0, 0, true);
      for (const high of [false, true]) {
        const z = slab.z[+high];
        // a plate face that touches the web is inside the solid where the web is: pull its rim in by 0.2 mm there, so it can
        // never tie in depth with the turned surface (that tie showed as a dotted seam line)
        const inner = web && web.sections.length && web.z.some(wz => Math.abs(wz - z) < 1e-9), so = inner ? spansFor(RO) : [], si = inner ? spansFor(RI) : [];
        const ring = (R, rev, spans, d) => { const pts = A.map(t => { const r = spans.length && inSpan(t, spans) ? R + d : R; return new TH.Vector2(r * Math.cos(t), r * Math.sin(t)); }); return rev ? pts.reverse() : pts; };
        const section = Math.abs(slab.outer - RO) < EPSR ? new TH.Shape(ring(RO, false, so, -.2)) : (() => { const sh = new TH.Shape(); sh.absarc(0, 0, slab.outer, 0, Math.PI * 2, false); return sh; })();
        const bore = Math.abs(slab.inner - RI) < EPSR ? new TH.Path(ring(RI, true, si, .2)) : (() => { const pa = new TH.Path(); pa.absarc(0, 0, slab.inner, 0, Math.PI * 2, true); return pa; })();
        section.holes.push(bore);
        const band = slab.drilling.find(h => Math.abs(h.z[+high] - z) < 1e-8);
        const radius = band ? (high ? band.r1 : band.r0) : 0;
        if (radius > 1e-8) for (const pin of shape.pins) {
          const hole = new TH.Path(); hole.absarc(pin.x, pin.y, radius, 0, Math.PI * 2, true); section.holes.push(hole);
        }
        add(new TH.ShapeGeometry(section, 48).translate(0, 0, z), !high);
      }
      for (const band of slab.drilling) for (const pin of shape.pins) wall(band.r0, band.r1, band.z, pin.x, pin.y, true, 72);
    }
    if (shape.web) for (const section of shape.web.sections) {
      const profile = new TH.Shape(section.map(p => new TH.Vector2(p.x, p.y)));
      const [z0, z1] = shape.web.z;
      // side walls only: the web's end caps lie on the plate faces (inside the solid) and would z-fight / draw seams
      const eg = new TH.ExtrudeGeometry(profile, { depth: z1 - z0, bevelEnabled: false }).translate(0, 0, z0), sg = eg.groups.find(g => g.materialIndex === 1);
      if (sg) {
        // keep the pocket walls; faces on Ø outer / Ø inner come from the shared turned surfaces above
        const P = eg.attributes.position.array, Nn = eg.attributes.normal.array, kp = [], kn = [];
        const onR = (i, R) => Math.abs(Math.hypot(P[i], P[i + 1]) - R) < 1e-4;
        for (let i = sg.start * 3; i < (sg.start + sg.count) * 3; i += 9) {
          if ([0, 3, 6].every(o => onR(i + o, RO)) || [0, 3, 6].every(o => onR(i + o, RI))) continue;
          for (let o = 0; o < 9; o++) { kp.push(P[i + o]); kn.push(Nn[i + o]); }
        }
        const sub = new TH.BufferGeometry(); sub.setAttribute('position', new TH.Float32BufferAttribute(kp, 3)); sub.setAttribute('normal', new TH.Float32BufferAttribute(kn, 3)); add(sub); eg.dispose();
      }
      else add(eg);
    }
    // end-mill corner radius: material left where a pocket wall meets a plate face, swept along the wall
    const r = shape.pocketR;
    if (r > 1e-6 && shape.fillets?.length && opts.fillets !== false) {
      // profile in (s = into the pocket from the wall, h = away from the plate face): corner minus the tool circle
      const prof = [[0, 0], [r, 0]];
      for (let k = 1; k < 12; k++) { const a = -Math.PI / 2 - k * Math.PI / 24; prof.push([r + r * Math.cos(a), r + r * Math.sin(a)]); }
      prof.push([0, r]);
      const tris = TH.ShapeUtils.triangulateShape(prof.map(([x, y]) => new TH.Vector2(x, y)), []);
      const ro = shape.outerD / 2, ri = shape.innerD / 2, orient = Math.sign(prof.reduce((a, p, i) => { const q = prof[(i + 1) % prof.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0));
      // along the wall direction u from P0: the tool is plunged radially from the max OD, so every profile line runs out to
      // the outer cylinder (no step at the opening) and starts at the bore or the wall start, whichever is further out
      const hit = (P, u, R, far) => { const bq = P[0] * u[0] + P[1] * u[1], c = P[0] * P[0] + P[1] * P[1] - R * R, d = bq * bq - c; return d < 0 ? null : far ? -bq + Math.sqrt(d) : -bq - Math.sqrt(d); };
      for (const f of shape.fillets) {
        const L = Math.hypot(f.B[0] - f.A[0], f.B[1] - f.A[1]), u = [(f.B[0] - f.A[0]) / L, (f.B[1] - f.A[1]) / L];
        // neighbouring pocket whose wall meets this one at A (web tip between two pockets): the two R strips run on past A and
        // meet in a mitre, where a point stays only while it is also inside the neighbour's R (s₂ ≤ r − √(r² − (r − h)²))
        const g = shape.fillets.find(o => o !== f && o.z === f.z && Math.hypot(o.A[0] - f.A[0], o.A[1] - f.A[1]) < 1e-6);
        const gu = g ? g.n[0] * u[0] + g.n[1] * u[1] : 0, mitre = g && gu < -1e-9;
        const ends = prof.map(([sv, h]) => {
          const P = [f.A[0] + f.n[0] * sv, f.A[1] + f.n[1] * sv], z = f.z + f.dir * h;
          const sMax = r - Math.sqrt(Math.max(0, r * r - (r - h) ** 2)), c2 = mitre ? g.n[0] * (P[0] - g.A[0]) + g.n[1] * (P[1] - g.A[1]) : 0;
          const l1 = hit(P, u, ro, true) ?? L, l0 = mitre ? Math.max(hit(P, u, ri, true) ?? -Infinity, (sMax - c2) / gu) : Math.max(0, hit(P, u, ri, true) ?? 0);
          return [[P[0] + u[0] * l0, P[1] + u[1] * l0, z], [P[0] + u[0] * l1, P[1] + u[1] * l1, z]];
        });
        // orient each triangle by its intended outward normal (side: profile edge normal, caps: ∓u)
        const tri = (a, b, c, want, vn) => {
          const ab = [0, 1, 2].map(k => b[k] - a[k]), ac = [0, 1, 2].map(k => c[k] - a[k]);
          let n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
          const len = Math.hypot(...n); if (len < 1e-12) return; n = n.map(v => v / len);
          let V = vn || [n, n, n];
          if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) { [b, c] = [c, b]; V = [V[0], V[2], V[1]]; if (!vn) V = V.map(() => n.map(v => -v)); }
          [a, b, c].forEach((p, i) => { positions.push(...p); normals.push(...V[i]); });
        };
        // smooth R: the normal at each profile point points at the tool centre (r, r), so the round shades as one surface and
        // meets the plate face and the pocket wall tangentially (no faceted bands)
        const vnorm = j => { const [sv, h] = prof[j], a = r - sv, b = r - h, L = Math.hypot(a, b) || 1; return [f.n[0] * a / L, f.n[1] * a / L, f.dir * b / L]; };
        for (let j = 0; j < ends.length; j++) {
          const k = (j + 1) % ends.length, ds = prof[k][0] - prof[j][0], dh = prof[k][1] - prof[j][1];
          // the flat faces of the corner (on the plate face h = 0 and on the pocket wall s = 0) are inside the solid: skip them so the R blends into plate and wall
          if ((Math.abs(prof[j][1]) < 1e-9 && Math.abs(prof[k][1]) < 1e-9) || (Math.abs(prof[j][0]) < 1e-9 && Math.abs(prof[k][0]) < 1e-9)) continue;
          const ns = orient * dh, nh = -orient * ds, want = [f.n[0] * ns, f.n[1] * ns, f.dir * nh];
          const nj = vnorm(j), nk = vnorm(k);
          tri(ends[j][0], ends[k][0], ends[k][1], want, [nj, nk, nk]); tri(ends[j][0], ends[k][1], ends[j][1], want, [nj, nk, nj]);
        }
        // the mitre cap is shared with the neighbour's strip (inside the solid): only open ends get a cap
        for (const [x, y, z] of tris) { if (!mitre) tri(ends[x][0], ends[y][0], ends[z][0], [-u[0], -u[1], 0]); tri(ends[x][1], ends[y][1], ends[z][1], [u[0], u[1], 0]); }
      }
    }
    // one continuous outer / inner diameter: every face lying on Ø outer or Ø inner (plates, web, end of the pocket R) gets the
    // cylinder's radial normal, so the web between the plates shades like the same turned surface instead of flat facets
    const ro = shape.outerD / 2, ri = shape.innerD / 2;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], r = Math.hypot(x, y);
      if (Math.abs(normals[i + 2]) > .5 || r < 1e-6) continue;
      const sg = Math.abs(r - ro) < 2e-3 ? 1 : Math.abs(r - ri) < 2e-3 ? -1 : 0;
      if (sg) { normals[i] = sg * x / r; normals[i + 1] = sg * y / r; normals[i + 2] = 0; }
    }
    const geometry = new TH.BufferGeometry();
    geometry.setAttribute('position', new TH.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new TH.Float32BufferAttribute(normals, 3));
    return geometry;
  }

  // ------------------------------------------------------------------ geometry model (dimensions only)
  // optional parts: shown/hidden (on) and dimension lock (lock); strength calculations are unchanged
  const OPTIONS = [
    { key: 'pin', label: '유성핀', parts: ['pin1', 'pin2'] },
    { key: 'cover', label: '입력단 커버', parts: ['cover'] },
    { key: 'ocover', label: '출력단 커버', parts: ['ocover'] },
    { key: 'oshaft', label: '출력단 중공축', parts: ['oshaft'] },
    { key: 'housing', label: '하우징', parts: ['housing'] },
    { key: 'pbrg', label: '유성 베어링', parts: ['needle1', 'needle2'] },
    { key: 'obrg', label: '출력 베어링', parts: ['xroller'] },
    { key: 's2brg', label: '2단 썬기어 베어링', parts: ['brgS2'] },
    { key: 's1brg', label: '1단 썬기어 베어링', parts: ['brgS1'] }
  ];
  const optOf = id => OPTIONS.find(o => o.parts.includes(id));
  const optOn = (D, key) => D.options?.[key]?.on !== false;
  const partOn = (D, id) => { const o = optOf(id); return !o || optOn(D, o.key); };
  const partLocked = (D, id) => { const o = optOf(id); return !!(o && D.options?.[o.key]?.lock); };
  const compName = (R, D, id) => {
    const shared = D.config.sharedRing && R.ctx.stages.length > 1;
    const m = /^(sun|planet|ring|carrier)(\d?)$/.exec(id);
    if (m) { const n = m[2] || '1'; return { sun: `S${n} 썬기어`, planet: `P${n} 유성기어`, ring: shared ? 'R1-2 링기어 (공유)' : `R${n} 링기어`, carrier: `C${n} 캐리어${n === String(R.ctx.stages.length) ? ' (출력)' : ''}` }[m[1]]; }
    return null;
  };

  function layout(R, D) {
    const stages = R.ctx.stages, sh = Object.assign({ wall: 3, coverT: 4, boltN: 8, boltD: 3, flangeT: 5 }, D.housing || {});
    const G = D.geom || {}, auto = {};
    // dimension override: D.geom[part][key] (mm, diameters as diameters); auto values are kept for the input panel
    const ov = (part, key, a) => { (auto[part] ||= {})[key] = a; const v = G[part]?.[key]; return Number.isFinite(v) && v > 0 ? v : a; };
    const S = stages.map(s => {
      const g = s.geo, st = s.st, rim = k => g.rims?.[k]?.diameter;
      const carrier = s.carrier;
      return { s, g, st, carrier, a: carrier.orbit, plateR: carrier.outerD / 2, sunBore: rim(0), planetBore: rim(1), ringOD: rim(2), b: g.parts[1].width };
    });
    // Stack each stage from its assembled gear, carrier, pin and boss extents.
    let z = 0; const zStart = [];
    S.forEach((x, i) => {
      x.z0 = i ? z + .6 - x.carrier.axial[0] : 0;
      zStart.push(x.z0);
      z = x.z0 + x.carrier.axial[1];
    });
    const gearEnd = S[S.length - 1].z0 + S[S.length - 1].b;
    const ob = D.outBearing || {}, dp = ob.dp || 60, Dw = ob.Dw || 4, Bw = ov('xroller', 'width', Dw * 1.5);
    const raceIn = dp / 2 - Dw * 1.1, raceOut = dp / 2 + Dw * 1.1;
    const zBear = [z + .6, z + .6 + Bw];
    const zFlange = [zBear[1] + .2, zBear[1] + .2 + sh.flangeT];
    const ringOD = Math.max(...S.map(x => x.ringOD || 0));
    const hollowR = ov('inshaft', 'id', 2 * Math.max(1, (S[0].sunBore || 6) / 2 - 1.8)) / 2;
    const shaftR = Math.max(hollowR + .4, ov('inshaft', 'od', 2 * (hollowR + 2.2)) / 2), shaftExt = ov('inshaft', 'ext', 9);
    const sealW = ov('seal', 'w', 2.3), sealH = ov('seal', 'h', 2.6);
    const housR = ringOD / 2 + sh.wall, flangeR = ov('housing', 'flangeD', 2 * (raceOut + sh.wall + 1.5)) / 2;
    const hubR = ov('oflange', 'hubD', 2 * Math.min(raceIn + .4, S[S.length - 1].plateR)) / 2;
    const coverBoltR = ov('cover', 'boltPCD', 2 * ((shaftR + sealH + housR) / 2 + .5)) / 2;
    const flangeBoltR = ov('oflange', 'boltPCD', 2 * ((hollowR + raceIn) / 2 + 1)) / 2;
    // 1단 썬기어 베어링: between input shaft and a boss on the input cover
    const s1on = optOn(D, 's1brg'), b1w = ov('brgS1', 'w', 4), b1h = ov('brgS1', 'h', 3);
    const zIn = S[0].carrier.axial[0] - .6 - (s1on ? b1w + .4 : 0) - sh.coverT;
    const zB1 = [zIn + sh.coverT, zIn + sh.coverT + b1w];
    // 출력단 중공축 (rides with the output) and 2단 썬기어 베어링 between it and the last sun bore
    const last = S[S.length - 1], sunBoreR = Math.max(1, (last.sunBore || 2 * (hollowR + 3)) / 2);
    const s2on = optOn(D, 's2brg') && S.length > 1, b2h = ov('brgS2', 'h', 2.5), b2w = ov('brgS2', 'w', Math.min(last.b, 4));
    const oshaftR = ov('oshaft', 'od', 2 * Math.max(.8, sunBoreR - (s2on ? b2h : .4))) / 2;
    const oshaftIR = ov('oshaft', 'id', 2 * Math.max(.4, Math.min(hollowR, oshaftR - 1))) / 2;
    const zOS = [last.z0 - (S.length > 1 ? .2 : 0), zFlange[1]];
    const zB2 = [last.z0 + (last.b - b2w) / 2, last.z0 + (last.b + b2w) / 2];
    // 출력단 커버: retainer ring over the outer race on the output face
    const ocT = ov('ocover', 't', 1.5), ocIR = ov('ocover', 'id', 2 * (dp / 2 - Dw * .2)) / 2;
    const zOC = [zBear[1] + .15, zBear[1] + .15 + ocT];
    return { S, zStart, gearEnd, zEnd: z, ob, dp, Dw, Bw, raceIn, raceOut, zBear, zFlange, ringOD, hollowR, shaftR, shaftExt, sealW, sealH, housR, flangeR, hubR, coverBoltR, flangeBoltR, zIn, sh, auto,
      s1on, b1w, b1h, zB1, s2on, b2h, b2w, zB2, sunBoreR, oshaftR, oshaftIR, zOS, ocT, ocIR, zOC, shared: !!(D.config.sharedRing && S.length > 1) };
  }
  // housing revolve profile (r, z) shared by 3D and drawings
  function housingProfile(L) {
    const zA = L.zIn + L.sh.coverT, zF0 = L.zBear[0] - .2, zF1 = L.zFlange[1] + .4;
    const ch = .5, hr = L.housR, fr = L.flangeR, ri = L.ringOD / 2, ro = L.raceOut;
    return [[ri, zA], [hr - ch, zA], [hr, zA + ch], [hr, zF0 - 2], [fr - ch, zF0 - 2], [fr, zF0 - 2 + ch], [fr, zF1 - ch], [fr - ch, zF1], [ro, zF1], [ro, zF0], [ri, zF0 - 2], [ri, zA]];
  }
  // input cover profile, with a bearing boss when the 1단 썬기어 베어링 is on
  function coverProfile(L) {
    const zA = L.zIn + L.sh.coverT, r0 = L.s1on ? L.shaftR + L.b1h : L.shaftR + L.sealH, hr = L.housR, c = .4;
    if (!L.s1on) return [[r0 + c, L.zIn], [hr - c, L.zIn], [hr, L.zIn + c], [hr, zA], [r0, zA], [r0, L.zIn + c], [r0 + c, L.zIn]];
    const rb = r0 + 1.6;
    return [[L.shaftR + L.sealH + c, L.zIn], [hr - c, L.zIn], [hr, L.zIn + c], [hr, zA], [rb, zA], [rb, L.zB1[1]], [r0, L.zB1[1]], [r0, L.zIn + L.sealW + .2], [L.shaftR + L.sealH, L.zIn + L.sealW + .2], [L.shaftR + L.sealH, L.zIn + c], [L.shaftR + L.sealH + c, L.zIn]];
  }

  // parts list for BOM (also used for picking names); masses are geometric estimates
  function partsList(R, D) {
    const L = layout(R, D), out = [];
    const fam = i => { const m = D.materials[i]; return m ? { material: { NV: '질화강', Eh: '침탄강', VA: '조질합금강', VC: '탄소강' }[m.family] || m.family, heat: { NV: '질화', Eh: '침탄', VA: '조질', VC: '조질' }[m.family] + (m.surfaceHRC ? ` HRC${m.surfaceHRC}` : '') } : { material: '—', heat: '—' }; };
    const reqSH = D.req.SH, reqSF = D.req.SF;
    const gearVerdict = (stage, part) => {
      const rows = R.rated.rows.filter(r => r.stage === stage && r.part === part); if (!rows.length) return null;
      const s = Math.min(...rows.map(r => Math.min(r.SH / reqSH, r.SF / reqSF)));
      const r = rows.reduce((m, x) => Math.min(x.SH / reqSH, x.SF / reqSF) < Math.min(m.SH / reqSH, m.SF / reqSF) ? x : m);
      return { ok: s >= 1, text: `SH ${fmt(r.SH, 2)} · SF ${fmt(r.SF, 2)}` };
    };
    L.S.forEach((x, i) => {
      const g = x.g, n = x.st.n, st = i + 1, mi = i * 3;
      const gm = (p, bore, w) => annulusMass((bore || 0) / 2, (p.da + p.df) / 4, w, STEEL);
      out.push({ id: `sun${st}`, name: compName(R, D, `sun${st}`), qty: 1, ...fam(mi), mass: gm(g.parts[0], x.sunBore, g.parts[0].width), step: 's3', verdict: gearVerdict(st, 0) });
      out.push({ id: `planet${st}`, name: compName(R, D, `planet${st}`), qty: n, ...fam(mi + 1), mass: gm(g.parts[1], x.planetBore, g.parts[1].width), step: 's3', verdict: gearVerdict(st, 1) });
      if (!L.shared || i === 0) out.push({ id: L.shared ? 'ring' : `ring${st}`, name: compName(R, D, L.shared ? 'ring' : `ring${st}`), qty: 1, ...fam(mi + 2),
        mass: annulusMass((g.parts[2].da + g.parts[2].df) / 4, L.ringOD / 2, L.shared ? L.gearEnd : g.parts[2].width, STEEL), step: 's3',
        verdict: (() => { const v = [gearVerdict(1, 2), L.shared ? gearVerdict(2, 2) : null].filter(Boolean); return v.length ? { ok: v.every(q => q.ok), text: v.map(q => q.text).join(' / ') } : null; })() });
      const cp = R.carrierPin[i];
      out.push({ id: `pin${st}`, name: `${st}단 유성핀`, qty: n, material: x.st.pin.material, heat: '담금질', mass: Math.PI / 4 * x.carrier.diameter ** 2 * x.carrier.pinLength * STEEL, step: 'scar',
        verdict: cp ? { ok: Math.min(cp.Sbend, cp.Spress) >= 1, text: `굽힘 S ${fmt(cp.Sbend, 2)}` } : null });
      const br = R.bearings[i];
      out.push({ id: `needle${st}`, name: `${st}단 유성베어링 (${x.st.bearing.name})`, qty: n * (x.st.bearing.count || 1), material: '베어링강', heat: '—', mass: annulusMass(x.st.pin.d / 2, (x.planetBore || x.st.pin.d + 3) / 2, x.b, STEEL) * .45, step: 's9',
        verdict: br ? { ok: br.L10h >= D.req.lifeH && br.s0peak >= D.req.s0, text: `L10 ${br.L10h >= 1e6 ? fmt(br.L10h / 1e6, 1) + 'M' : fmt(br.L10h / 1e3, 1) + 'k'} h · s0 ${fmt(br.s0peak, 2)}` } : null });
      out.push({ id: `carrier${st}`, name: compName(R, D, `carrier${st}`), qty: 1, material: x.st.carrier?.material || 'S45C', heat: '조질', step: 'scar',
        mass: x.carrier.materialVolume * STEEL,
        verdict: cp ? { ok: cp.Sweb >= 1, text: Number.isFinite(cp.Sweb) ? `기둥 S ${fmt(cp.Sweb, 2)}` : '편단 지지' } : null });
    });
    const ob = R.outBearing, roll = ob.roll;
    out.push({ id: 'xroller', name: `출력베어링 (${D.outBearing.name})`, qty: 1, material: '베어링강', heat: '담금질', step: 's9',
      mass: annulusMass(L.raceIn, L.raceOut, L.Bw, STEEL) * .8,
      verdict: { ok: ob.L10h >= D.req.lifeH && ob.s0peak >= D.req.s0 && (!roll || roll.peak.s0 >= D.req.s0), text: `s0 ${fmt(roll ? roll.peak.s0 : ob.s0peak, 2)}` } });
    out.push({ id: 'oflange', name: '출력 플랜지 (C2 결합)', qty: 1, material: 'S45C', heat: '조질', step: 'shous', mass: annulusMass(L.hollowR + .6, L.raceIn + .4, L.sh.flangeT, STEEL) + annulusMass(L.hollowR + .6, L.hubR, L.zFlange[0] - L.zEnd, STEEL) });
    out.push({ id: 'housing', name: '하우징', qty: 1, material: 'AL6061-T6', heat: '흑색 아노다이징', step: 'shous',
      mass: annulusMass(L.ringOD / 2, L.housR, L.zBear[0] - L.zIn, ALU) + annulusMass(L.raceOut, L.flangeR, L.zFlange[1] - L.zBear[0], ALU) });
    out.push({ id: 'cover', name: '입력단 커버', qty: 1, material: 'AL6061-T6', heat: '흑색 아노다이징', step: 'shous', mass: annulusMass(L.shaftR + L.sealH, L.housR, L.sh.coverT, ALU) });
    out.push({ id: 'inshaft', name: '입력 중공축', qty: 1, material: 'S45C', heat: '조질', step: 's7', mass: annulusMass(L.hollowR, L.shaftR, L.S[0].b + L.shaftExt + L.sh.coverT + 5, STEEL) });
    out.push({ id: 'ocover', name: '출력단 커버', qty: 1, material: 'AL6061-T6', heat: '흑색 아노다이징', step: 'shous', mass: annulusMass(L.ocIR, L.raceOut + .2, L.ocT, ALU) });
    out.push({ id: 'oshaft', name: '출력단 중공축', qty: 1, material: 'S45C', heat: '조질', step: 'shous', mass: annulusMass(L.oshaftIR, L.oshaftR, L.zOS[1] - L.zOS[0], STEEL) });
    out.push({ id: 'brgS1', name: '1단 썬기어 베어링', qty: 1, material: '베어링강', heat: '—', step: 'shous', mass: annulusMass(L.shaftR, L.shaftR + L.b1h, L.b1w, STEEL) * .6 });
    if (L.S.length > 1) out.push({ id: 'brgS2', name: '2단 썬기어 베어링', qty: 1, material: '베어링강', heat: '—', step: 'shous', mass: annulusMass(L.oshaftR, L.sunBoreR, L.b2w, STEEL) * .6 });
    out.push({ id: 'seal', name: '오일 실', qty: 2, material: 'NBR', heat: '—', step: 'shous', mass: .002 });
    out.push({ id: 'bolts', name: `볼트 M${L.sh.boltD}`, qty: L.sh.boltN * (partOn(D, 'cover') ? 2 : 1), material: 'SCM435', heat: '흑착색 12.9', step: 'shous', mass: Math.PI / 4 * L.sh.boltD ** 2 * 10 * STEEL });
    const shown = out.filter(p => partOn(D, p.id));
    shown.forEach((p, i) => { p.no = i + 1; const o = optOf(p.id); p.option = o?.key || null; p.locked = partLocked(D, p.id); });
    return shown;
  }

  // ------------------------------------------------------------------ environment (code-generated soft boxes)
  function makeEnv(renderer) {
    const TH = T(), env = new TH.Scene();
    // photo-studio HDR: dark room with bright, sharp-edged strip lights → crisp specular streaks on metal
    const room = new TH.Mesh(new TH.BoxGeometry(40, 20, 40), new TH.MeshBasicMaterial({ color: 0x262524, side: TH.BackSide }));
    env.add(room);
    const panel = (w, h, x, y, z, ry, rx, k, tint = [1, 1, 1]) => { const m = new TH.Mesh(new TH.PlaneGeometry(w, h), new TH.MeshBasicMaterial({ color: new TH.Color(k * tint[0], k * tint[1], k * tint[2]), side: TH.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); env.add(m); };
    panel(22, 4, 0, 9.5, 0, 0, Math.PI / 2, 14);              // overhead strip (main streak)
    panel(3, 16, -19.5, 2, 8, Math.PI / 2, 0, 12, [1, .97, .92]); // tall key strip left, warm
    panel(3, 16, -19.5, 2, -6, Math.PI / 2, 0, 7);            // second strip left
    panel(10, 12, 19.5, 1, -4, -Math.PI / 2, 0, 3.5, [.92, .96, 1]); // soft fill right, cool
    panel(2, 14, 14, 2, 19.5, 0, 0, 10);                      // front-side kicker
    panel(20, 1.6, 0, 4, -19.5, 0, 0, 9);                     // rim line back
    panel(30, 8, 0, -9.5, 0, 0, -Math.PI / 2, 1.4, [1, .96, .9]); // warm floor bounce
    const pm = new TH.PMREMGenerator(renderer);
    const tex = pm.fromScene(env, .02).texture; pm.dispose();
    env.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    return tex;
  }

  // ------------------------------------------------------------------ mount
  function mount(host, opt) {
    const TH = T(); if (!TH) return null;
    const { R, D, mode = 'full' } = opt;
    const full = mode === 'full';
    // only: 'sprc' → machined parts only (sun, planet, ring, carrier + its pins); bearings, housing, covers, shafts, seals, bolts left out for now
    const extras = full && opt.only !== 'sprc';
    const W0 = host.clientWidth, H0 = host.clientHeight;
    const mobile = Math.min(W0, window.innerWidth) < 760;
    const renderer = new TH.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    const DPR = mobile ? 1 : Math.min(1.5, window.devicePixelRatio || 1); renderer.setPixelRatio(DPR);
    renderer.setSize(W0, H0);
    renderer.outputEncoding = TH.sRGBEncoding; renderer.toneMapping = TH.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = full && !mobile; renderer.shadowMap.type = TH.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.localClippingEnabled = true;
    host.prepend(renderer.domElement);
    const scene = new TH.Scene();
    const prefs = Object.assign({ bg: '#1a130e', shade: 'pbr', light: 1, lightAz: 35 }, D.view || {});
    if (['#17181a', '#e8eaed', '#f3f0ea'].includes(prefs.bg)) prefs.bg = '#1a130e'; // older defaults → warm dark stage
    // studio backdrop: soft radial light falling off to a slightly deeper tone of the chosen colour
    const paintBg = () => {
      // dark stage: a warm amber glow behind the model; light colours keep the old studio falloff
      const c = new TH.Color(prefs.bg), dark = c.r + c.g + c.b < 1.2, hi = c.clone().lerp(new TH.Color(dark ? 0xd6a05a : 0xffffff), dark ? .22 : .55), lo = c.clone().multiplyScalar(dark ? .55 : .9);
      host.style.background = `radial-gradient(${dark ? '70% 60% at 52% 46%' : '120% 90% at 58% 38%'}, #${hi.getHexString()} 0%, #${c.getHexString()} ${dark ? 55 : 48}%, #${lo.getHexString()} 100%)`;
      host.classList.toggle('v3-dark', dark);
    };
    paintBg();
    scene.environment = makeEnv(renderer);
    const camera = new TH.PerspectiveCamera(30, W0 / H0, 1, 6000);
    const hemi = new TH.HemisphereLight(0xfffaf2, 0x6d6a64, .45); scene.add(hemi);
    const key = new TH.DirectionalLight(0xfff6ec, 2.2); key.castShadow = renderer.shadowMap.enabled;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; key.shadow.radius = 9; scene.add(key); scene.add(key.target);
    const fill = new TH.DirectionalLight(0xe6ecf5, .55); scene.add(fill);
    const rim = new TH.DirectionalLight(0xffffff, .8); scene.add(rim);

    const L = layout(R, D);
    const root = new TH.Group(); scene.add(root);
    const parts = new Map();          // id -> {objs:[], name, center:Vector3(local), explode}
    const movers = [];                // {obj, base:Vector3, dz, layer}
    const meshes = [];                // all pickable meshes
    const mats = [];                  // all part materials (clones)
    const MAT = {
      sun: { color: 0xc9ccd2, metalness: 1, roughness: .28 }, planet: { color: 0xb3b8bf, metalness: 1, roughness: .3 },
      sun1: { color: 0x2f62b4, metalness: 1, roughness: .12, clearcoat: .8, clearcoatRoughness: .06 }, planet1: { color: 0x4a86d8, metalness: 1, roughness: .14, clearcoat: .8, clearcoatRoughness: .06 },
      sun2: { color: 0xc8901c, metalness: 1, roughness: .12, clearcoat: .8, clearcoatRoughness: .06 }, planet2: { color: 0xdaa636, metalness: 1, roughness: .14, clearcoat: .8, clearcoatRoughness: .06 },
      ring: { color: 0xd6d8dc, metalness: 1, roughness: .18 }, pin: { color: 0xf4f5f7, metalness: 1, roughness: .06 },
      carrier: { color: 0x1a1c20, metalness: .9, roughness: .24 },
      housing: { color: 0xdcd8cf, metalness: 0, roughness: .26, envMapIntensity: .9 },
      flange: { color: 0xb8240a, metalness: .6, roughness: .24, envMapIntensity: .75 }, roller: { color: 0xf7f8fa, metalness: 1, roughness: .04 }, race: { color: 0xdadde1, metalness: 1, roughness: .1 },
      bolt: { color: 0x1d1e21, metalness: 1, roughness: .22 }, seal: { color: 0xc4290a, metalness: 0, roughness: .55 }, shaft: { color: 0xdcdee2, metalness: 1, roughness: .12 }
    };
    // procedural surface finish (no image assets): turning marks for lathe parts, fine grain for the rest.
    // Lathe/ring UVs run along the profile, so horizontal stripes become concentric marks on faces and
    // circumferential lines on cylinders — the look of a real turned part.
    const finish = (() => {
      const mk = (draw, rep) => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); draw(g); const tx = new TH.CanvasTexture(c); tx.wrapS = tx.wrapT = TH.RepeatWrapping; tx.repeat.set(...rep); tx.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 1; return tx; };
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const turned = mk(g => { for (let y = 0; y < 256; y++) { const v = 150 + (rnd() - .5) * 70 + 25 * Math.sin(y * .9); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, 256, 1); } }, [1, 18]);
      const grain = mk(g => { const im = g.createImageData(256, 256); for (let i = 0; i < im.data.length; i += 4) { const v = 140 + (rnd() - .5) * 90; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); }, [.08, .08]);
      return { turned, grain };
    })();
    const FIN = { ring: 'turned', race: 'turned', shaft: 'turned', flange: 'turned', pin: 'turned', housing: 'grain', carrier: 'grain', bolt: 'grain', sun1: 'grain', planet1: 'grain', sun2: 'grain', planet2: 'grain', roller: 'turned' };
    const mkMat = k => {
      const m = new TH.MeshPhysicalMaterial(Object.assign({ envMapIntensity: 1.1 }, MAT[k]));
      const f = FIN[k];
      if (f) { m.roughnessMap = finish[f]; m.roughness = Math.min(1, (MAT[k].roughness || .2) * 1.35); }
      m.userData.base = Object.assign({}, MAT[k], f ? { roughness: m.roughness } : {}); mats.push(m); return m;
    };
    function add(obj, partId, parent = root, layer = 0, dz = 0) {
      parent.add(obj);
      obj.traverse(o => { if (o.isMesh) { o.userData.partId = partId; o.castShadow = o.receiveShadow = renderer.shadowMap.enabled; meshes.push(o); } });
      if (!parts.has(partId)) parts.set(partId, { objs: [] });
      parts.get(partId).objs.push(obj);
      if (dz) movers.push({ obj, base: obj.position.clone(), dz, layer });
      return obj;
    }
    const unit = Math.max(14, L.S[0].b * 3);

    // ---- gears + carriers per stage
    const kin = [];
    let ringBody = null, ringBodyPhase = 0;
    L.S.forEach((x, i) => {
      const g = x.g, st = x.st, b = st.b, at = g.at, zb = x.z0;
      const zs = g.parts[0].z, zp = g.parts[1].z, zr = g.parts[2].z, a = x.a;
      const rho0 = (zp % 2) ? Math.PI / zr : 0;
      const tb = Math.tan(st.beta * Math.PI / 180), rr = g.parts[2].d / 2;
      const sid = i + 1;
      // explode layers: input side negative, output side positive; stage 1 → toward input, stage 2 → toward output
      const dzStage = (i === 0 ? -1 : 1) * unit * (i === 0 ? 1.4 : 1.4);
      let psi = 0, ring;
      if (L.shared && i > 0) { ring = ringBody; psi = (ringBodyPhase - zb * tb / rr) - rho0; }
      else {
        const depth = L.shared ? L.gearEnd : b;
        ring = new TH.Mesh(gearGeometry(g.parts[2], at, depth, -st.beta, true, x.ringOD), mkMat('ring'));
        ring.position.z = zb; ring.rotation.z = rho0;
        add(ring, L.shared ? 'ring' : `ring${sid}`, root, 0, 0);
        if (L.shared) { ringBody = ring; ringBodyPhase = rho0; }
      }
      const sun = new TH.Mesh(gearGeometry(g.parts[0], at, b, st.beta, false, x.sunBore), mkMat(i === 0 ? 'sun1' : 'sun2'));
      sun.position.z = zb; add(sun, `sun${sid}`, root, 2, i === 0 ? dzStage * 1.9 : 0);
      const pg = []; const pMat = mkMat(i === 0 ? 'planet1' : 'planet2');
      const pGeo = gearGeometry(g.parts[1], at, b, -st.beta, false, x.planetBore);
      for (let j = 0; j < st.n; j++) { const pm = new TH.Mesh(pGeo, pMat); pm.position.z = zb; add(pm, `planet${sid}`, root, 1, dzStage); pg.push(pm); }
      // Carrier holes and pin stock are positioned from the same resolved geometry.
      const car = new TH.Group(); car.userData.stage = i;
      const shape = x.carrier;
      const body = new TH.Mesh(carrierBody(shape).translate(0, 0, zb), mkMat('carrier'));
      // feature lines from the shape without the pocket R, minus the circles where plate face meets the web on Ø outer / Ø inner (no real edge there)
      body.userData.edgeLines = () => {
        const sp = {}, g = carrierBody(shape, { fillets: false, spans: sp }), eg = new TH.EdgesGeometry(g, 28); g.dispose();
        if (!sp.z) { eg.translate(0, 0, zb); return eg; }
        const a = eg.attributes.position.array, out = [];
        for (let i = 0; i < a.length; i += 6) {
          const r0 = Math.hypot(a[i], a[i + 1]), r1 = Math.hypot(a[i + 3], a[i + 4]), z0 = a[i + 2], z1 = a[i + 5], t = Math.atan2(a[i + 1] + a[i + 4], a[i] + a[i + 3]);
          const atZ = Math.abs(z0 - z1) < 1e-4 && sp.z.some(z => Math.abs(z - z0) < 1e-4);
          const seam = atZ && ((Math.abs(r0 - sp.RO) < 2e-3 && Math.abs(r1 - sp.RO) < 2e-3 && sp.inSpan(t, sp.ro)) || (Math.abs(r0 - sp.RI) < 2e-3 && Math.abs(r1 - sp.RI) < 2e-3 && sp.inSpan(t, sp.ri)));
          if (!seam) for (let o = 0; o < 6; o++) out.push(a[i + o]);
        }
        eg.dispose(); const lg = new TH.BufferGeometry(); lg.setAttribute('position', new TH.Float32BufferAttribute(out, 3)); lg.translate(0, 0, zb); return lg;
      };
      car.add(body);
      const pinMat = mkMat('pin'), pinGeo = new TH.CylinderGeometry(shape.diameter / 2, shape.diameter / 2, shape.pinLength, 72).rotateX(Math.PI / 2);
      const pins = new TH.Group(), pinZ = zb + (shape.stock[0] + shape.stock[1]) / 2;
      for (const center of shape.pins) {
        const pin = new TH.Mesh(pinGeo, pinMat);
        pin.position.set(center.x, center.y, pinZ);
        pins.add(pin);
      }
      // needle rollers (instanced) between pin and planet bore
      let needles = null;
      if (extras && partOn(D, `needle${sid}`) && x.planetBore > st.pin.d + .6) {
        const rIn = st.pin.d / 2, rOut = x.planetBore / 2, nd = (rOut - rIn) * .92, rc = (rIn + rOut) / 2;
        const cnt = Math.max(6, Math.floor(2 * Math.PI * rc / (nd * 1.08)));
        needles = new TH.InstancedMesh(new TH.CylinderGeometry(nd / 2, nd / 2, b * .9, 10).rotateX(Math.PI / 2), mkMat('roller'), cnt * st.n);
        const m4 = new TH.Matrix4(); let k = 0;
        for (const pin of shape.pins) {
          for (let q = 0; q < cnt; q++) { const t = 2 * Math.PI * q / cnt; m4.makeTranslation(pin.x + rc * Math.cos(t), pin.y + rc * Math.sin(t), zb + b / 2); needles.setMatrixAt(k++, m4); }
        }
      }
      root.add(car);
      if (needles) needles.frustumCulled = false;
      if (partOn(D, `pin${sid}`)) add(pins, `pin${sid}`, car, 1, 0); if (needles) add(needles, `needle${sid}`, car, 1, 0);
      car.children.filter(c => c.isMesh && !c.userData.partId).forEach(c => { c.userData.partId = `carrier${sid}`; c.castShadow = c.receiveShadow = renderer.shadowMap.enabled; meshes.push(c); });
      if (!parts.has(`carrier${sid}`)) parts.set(`carrier${sid}`, { objs: [] }); parts.get(`carrier${sid}`).objs.push(car);
      movers.push({ obj: car, base: car.position.clone(), dz: dzStage, layer: 1 });
      const phase = Array.from({ length: st.n }, (_, j) => {
        const phi = 2 * Math.PI * j / st.n, pitchS = 2 * Math.PI / zs, delta = ((phi % pitchS) + pitchS) % pitchS;
        return Math.PI - Math.PI / zp + delta * zs / zp;
      });
      kin.push({ sun, planets: pg, car, a, zs, zp, ratio: g.ratio, n: st.n, phase, psi, dzStage, ownRing: !(L.shared && i > 0), ring });
    });

    // ---- housing, cover, input shaft, output bearing, flange, seals, bolts (full mode)
    let outRot = null, cage = null, inRot = null;
    if (extras) {
      const sh = L.sh;
      if (partOn(D, 'housing')) add(new TH.Mesh(lathe(housingProfile(L), 128), mkMat('housing')), 'housing', root, 0, 0);
      if (partOn(D, 'cover')) add(new TH.Mesh(lathe(coverProfile(L), 128), mkMat('housing')), 'cover', root, 3, -unit * 3.2);
      const ballBearing = (ri, ro, z0, z1, parent, id, dz) => {
        const g = new TH.Group(), h = ro - ri, rm = (ri + ro) / 2, d = Math.min(h * .55, (z1 - z0) * .7);
        g.add(new TH.Mesh(ringSolid(ri, rm - d * .35, z0, z1, .2), mkMat('race')), new TH.Mesh(ringSolid(rm + d * .35, ro, z0, z1, .2), mkMat('race')));
        const nb = Math.max(6, Math.floor(2 * Math.PI * rm / (d * 1.25))), im = new TH.InstancedMesh(new TH.SphereGeometry(d / 2, 14, 10), mkMat('roller'), nb), mm = new TH.Matrix4();
        for (let j = 0; j < nb; j++) { const a = 2 * Math.PI * j / nb; mm.makeTranslation(rm * Math.cos(a), rm * Math.sin(a), (z0 + z1) / 2); im.setMatrixAt(j, mm); }
        im.frustumCulled = false; g.add(im); add(g, id, parent, 3, dz);
      };
      // input hollow shaft + stage-1 sun ride together
      inRot = new TH.Group(); root.add(inRot);
      const shaft = new TH.Mesh(ringSolid(L.hollowR, L.shaftR, L.zIn - L.shaftExt, L.S[0].z0 + L.S[0].b, .4), mkMat('shaft'));
      add(shaft, 'inshaft', inRot, 4, -unit * 4.2);
      if (L.s1on) ballBearing(L.shaftR, L.shaftR + L.b1h, L.zB1[0], L.zB1[1], root, 'brgS1', -unit * 3.4);
      const sealMat = mkMat('seal');
      add(new TH.Mesh(ringSolid(L.shaftR, L.shaftR + L.sealH, L.zIn - .1, L.zIn - .1 + L.sealW, .3), sealMat), 'seal', root, 3, -unit * 3.6);
      // output: cross roller races + rollers (cage at half speed) + flange
      outRot = new TH.Group(); root.add(outRot);
      const obOn = partOn(D, 'xroller');
      if (partOn(D, 'oshaft')) add(new TH.Mesh(ringSolid(L.oshaftIR, L.oshaftR, L.zOS[0], L.zOS[1], .3), mkMat('shaft')), 'oshaft', outRot, 4, unit * 4.2);
      if (L.s2on && L.sunBoreR - L.oshaftR > .5) ballBearing(L.oshaftR, L.sunBoreR, L.zB2[0], L.zB2[1], root, 'brgS2', unit * 1.9);
      if (partOn(D, 'ocover')) add(new TH.Mesh(ringSolid(L.ocIR, L.raceOut + .2, L.zOC[0], L.zOC[1], .3), mkMat('housing')), 'ocover', root, 3, unit * 3.0);
      const raceMat = mkMat('race');
      if (obOn) add(new TH.Mesh(ringSolid(L.raceIn, L.dp / 2 - L.Dw * .35, L.zBear[0], L.zBear[1], .3), raceMat), 'xroller', outRot, 3, unit * 2.6);
      if (obOn) add(new TH.Mesh(ringSolid(L.dp / 2 + L.Dw * .35, L.raceOut, L.zBear[0], L.zBear[1], .3), raceMat), 'xroller', root, 3, unit * 2.6);
      const Z = Math.max(8, Math.round(L.ob.Z || 40)), Dw = L.Dw, Lw = L.ob.Lw || Dw * .9;
      const rollers = new TH.InstancedMesh(new TH.CylinderGeometry(Dw / 2, Dw / 2, Lw, 16), mkMat('roller'), Z);
      const m4 = new TH.Matrix4(), q = new TH.Quaternion(), e = new TH.Euler(), sc = new TH.Vector3(1, 1, 1), p = new TH.Vector3();
      for (let j = 0; j < Z; j++) {
        const ang = 2 * Math.PI * j / Z, s = j % 2 ? 1 : -1;
        // roller axis in the (radial, axial) plane at ±45°
        const axis = new TH.Vector3(Math.cos(ang) * Math.SQRT1_2, Math.sin(ang) * Math.SQRT1_2, s * Math.SQRT1_2).normalize();
        q.setFromUnitVectors(new TH.Vector3(0, 1, 0), axis);
        p.set(L.dp / 2 * Math.cos(ang), L.dp / 2 * Math.sin(ang), (L.zBear[0] + L.zBear[1]) / 2);
        m4.compose(p, q, sc); rollers.setMatrixAt(j, m4);
      }
      rollers.frustumCulled = false;
      cage = new TH.Group(); root.add(cage); if (obOn) add(rollers, 'xroller', cage, 3, unit * 2.6);
      const flange = new TH.Mesh(ringSolid(L.hollowR + .6, L.raceIn + .4, L.zFlange[0], L.zFlange[1], .5), mkMat('flange'));
      const hub = new TH.Mesh(ringSolid(L.hollowR + .6, Math.max(L.hollowR + 1.2, L.hubR), L.zEnd - .2, L.zFlange[0] + .1, .4), flange.material);
      add(flange, 'oflange', outRot, 4, unit * 3.6); add(hub, 'oflange', outRot, 4, unit * 3.6);
      // bolts: cover ring + output flange ring (instanced hex heads)
      const boltMat = mkMat('bolt'), bd = sh.boltD;
      const head = new TH.CylinderGeometry(bd * .85, bd * .85, bd * .7, 6).rotateX(Math.PI / 2);
      const mkBolts = (n, R0, z0, parent, dz) => {
        const im = new TH.InstancedMesh(head, boltMat, n), mm = new TH.Matrix4(); im.frustumCulled = false;
        for (let j = 0; j < n; j++) { const ang = 2 * Math.PI * (j + .5) / n; mm.makeRotationZ(ang); mm.setPosition(R0 * Math.cos(ang), R0 * Math.sin(ang), z0); im.setMatrixAt(j, mm); }
        add(im, 'bolts', parent, 4, dz);
      };
      if (partOn(D, 'cover')) mkBolts(sh.boltN, L.coverBoltR, L.zIn - bd * .35, root, -unit * 3.2);
      mkBolts(sh.boltN, L.flangeBoltR, L.zFlange[1] + bd * .35, outRot, unit * 3.6);
    }

    // ---- crisp feature edges (thin graphite lines) on non-gear solids
    const edgeMats = [];
    const EDGE = /^(housing|cover|ocover|oflange|carrier\d|xroller|inshaft|oshaft|pin\d|brgS\d|seal)$/;
    meshes.slice().forEach(ms => {
      if (ms.isInstancedMesh || !EDGE.test(ms.userData.partId || '')) return;
      const n = ms.geometry.attributes.position?.count || 0; if (!n || n > 120000) return;
      const dark = /^(carrier|bolt)/.test(ms.userData.partId);
      const lm = new TH.LineBasicMaterial({ color: dark ? 0x6b6f76 : 0x2a2724, transparent: true, opacity: dark ? .5 : .42, toneMapped: false });
      lm.userData.op = lm.opacity; edgeMats.push(lm);
      const ln = new TH.LineSegments(ms.userData.edgeLines ? ms.userData.edgeLines() : new TH.EdgesGeometry(ms.geometry, 28), lm); ln.raycast = () => { }; ln.userData.edge = true; ms.add(ln);
    });
    // ---- centre, ground, camera
    const box = new TH.Box3().setFromObject(root), ctr = box.getCenter(new TH.Vector3()), size = box.getSize(new TH.Vector3());
    root.position.sub(ctr);
    const maxR = Math.max(size.x, size.y) / 2, len = size.z;
    const ground = new TH.Mesh(new TH.PlaneGeometry(maxR * 30, maxR * 30), new TH.ShadowMaterial({ opacity: .4 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -maxR * 1.35 - 2; ground.receiveShadow = true; ground.visible = renderer.shadowMap.enabled; scene.add(ground);
    // soft contact shadow (works without shadow maps, e.g. on phones): radial gradient texture under the model
    const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(214,160,90,.26)'); gr.addColorStop(.5, 'rgba(214,160,90,.09)'); gr.addColorStop(1, 'rgba(214,160,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const tx = new TH.CanvasTexture(c); tx.encoding = TH.sRGBEncoding; return tx; })();
    const blob = new TH.Mesh(new TH.PlaneGeometry(1, 1), new TH.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = ground.position.y + .05; blob.scale.set(maxR * 7, len * 2.4 + maxR * 4, 1); blob.renderOrder = -1; scene.add(blob);
    // floor grid: fine amber lines fading with distance, a lit patch under the model
    const gridSize = Math.ceil(maxR * 14 / 10) * 10, grid = new TH.GridHelper(gridSize, gridSize / 5, 0xd6a05a, 0xd6a05a);
    grid.material.transparent = true; grid.material.opacity = .13; grid.material.depthWrite = false; grid.material.toneMapped = false; grid.position.y = ground.position.y + .02; grid.renderOrder = -2; grid.raycast = () => { }; scene.add(grid);
    scene.fog = new TH.Fog(new TH.Color(prefs.bg).multiplyScalar(.7).getHex(), Math.max(maxR * 2, len) * 5, Math.max(maxR * 2, len) * 14);
    // construction axis: thin dash-dot centre line through the whole assembly (stretches with the explode)
    const axisMat = new TH.LineDashedMaterial({ color: 0xd6a05a, dashSize: 3, gapSize: 1.6, transparent: true, opacity: .5, toneMapped: false });
    const axisGeo = new TH.BufferGeometry().setFromPoints([new TH.Vector3(0, 0, box.min.z - ctr.z - unit * 6), new TH.Vector3(0, 0, box.max.z - ctr.z + unit * 6)]);
    const axisLine = new TH.Line(axisGeo, axisMat); axisLine.computeLineDistances(); axisLine.raycast = () => { }; scene.add(axisLine);
    // world: reducer axis = z, y up. Part centres (local to root) for focus / leader anchors
    root.updateMatrixWorld(true);
    parts.forEach((p, id) => { const bb = new TH.Box3(); p.objs.forEach(o => bb.expandByObject(o)); p.center = bb.getCenter(new TH.Vector3()); p.radius = bb.getSize(new TH.Vector3()).length() / 2; });
    const S0 = Math.max(maxR * 2, len);
    const fitDist = () => S0 * 2.7 / Math.min(1, (host.clientWidth / Math.max(1, host.clientHeight)) / 1.25);
    const view = { target: new TH.Vector3(), az: Math.PI / 4, el: Math.atan(1 / Math.SQRT2), dist: fitDist() };
    const home = { az: view.az, el: view.el, dist: view.dist, target: new TH.Vector3() };
    if (opt.initialView) { const iv = opt.initialView; view.az = iv.az; view.el = iv.el; view.dist = iv.dist; view.target.fromArray(iv.target); }
    const goal = { target: view.target.clone(), az: view.az, el: view.el, dist: view.dist };
    const placeLights = () => {
      const a = (prefs.lightAz || 35) * Math.PI / 180, I = prefs.light ?? 1;
      key.position.set(S0 * 2 * Math.cos(a), S0 * 2.6, S0 * 2 * Math.sin(a) + S0); key.intensity = 2.2 * I;
      key.shadow.camera.left = key.shadow.camera.bottom = -S0 * 1.4; key.shadow.camera.right = key.shadow.camera.top = S0 * 1.4; key.shadow.camera.near = 1; key.shadow.camera.far = S0 * 10; key.shadow.camera.updateProjectionMatrix();
      fill.position.set(-S0 * 2, S0, S0); fill.intensity = .45 * I; rim.position.set(0, S0, -S0 * 3); rim.intensity = .8 * I; hemi.intensity = .25 * I;
      mats.forEach(m => m.envMapIntensity = (m.userData.base.envMapIntensity ?? 1.1) * (.5 + .5 * I));
    };
    placeLights();
    const place = () => {
      const t = view.target, ce = Math.cos(view.el);
      camera.position.set(t.x + view.dist * ce * Math.sin(view.az), t.y + view.dist * Math.sin(view.el), t.z + view.dist * ce * Math.cos(view.az));
      camera.lookAt(t);
    };
    place();

    // ---- state: explode, section, opacity, visibility, shading
    const st = { explodeTarget: 0, explode: 0, playing: true, theta: 0, section: false, secAngle: 0, hover: null, selected: null, issues: [] };
    if (opt.initialView) { st.explodeTarget = st.explode = opt.initialView.explode || 0; st.theta = opt.initialView.theta || 0; st.playing = opt.initialView.playing !== false; st.secAngle = opt.initialView.secAngle || 0; }
    const plane = new TH.Plane(new TH.Vector3(1, 0, 0), 0);
    const caps = [];
    function applyShade() {
      mats.forEach(m => {
        const b = m.userData.base;
        m.wireframe = prefs.shade === 'wire';
        if (prefs.shade === 'matte') { m.metalness = 0; m.roughness = .85; m.clearcoat = 0; }
        else { m.metalness = b.metalness; m.roughness = b.roughness; m.clearcoat = b.clearcoat || 0; }
        m.needsUpdate = true;
      });
    }
    function setSection(on, angDeg) {
      st.section = on; if (angDeg != null) st.secAngle = angDeg;
      mats.forEach(m => { m.clippingPlanes = on ? [plane] : null; m.clipShadows = on; m.side = on ? TH.DoubleSide : TH.FrontSide; m.needsUpdate = true; });
      edgeMats.forEach(m => { m.clippingPlanes = on ? [plane] : null; m.needsUpdate = true; });
      caps.splice(0).forEach(c => { c.parent?.remove(c); c.material.dispose(); });
      if (on) meshes.forEach(ms => {
        if (ms.isInstancedMesh || !ms.visible) return;
        const cm = new TH.MeshBasicMaterial({ color: 0xc8320e, side: TH.BackSide, clippingPlanes: [plane], toneMapped: false });
        const c = new TH.Mesh(ms.geometry, cm); c.raycast = () => { }; c.renderOrder = 1; ms.add(c); caps.push(c);
      });
    }
    function setOpacity(id, v) {
      const list = id ? meshesOf(id) : meshes;
      list.forEach(ms => { const m = ms.material; m.opacity = v; m.transparent = v < .999; m.depthWrite = v >= .95; m.needsUpdate = true;
        ms.children.forEach(c => { if (c.userData.edge) c.material.opacity = c.material.userData.op * v; }); });
    }
    function meshesOf(id) { return meshes.filter(m => m.userData.partId === id); }
    function setVisible(id, v) { meshesOf(id).forEach(m => m.visible = v); }
    function isolate(id) { meshes.forEach(m => m.visible = m.userData.partId === id); }
    function showAll() { meshes.forEach(m => m.visible = true); }
    applyShade();
    if (opt.initialView?.section) setSection(true);

    // ---- highlight
    const HL = { hover: new TH.Color(0x1a1612), sel: new TH.Color(0x5c2208) };
    function paint() {
      meshes.forEach(ms => { const m = ms.material; if (!m.emissive) return; m.emissive.setRGB(0, 0, 0); });
      if (st.hover) meshesOf(st.hover).forEach(ms => ms.material.emissive?.copy(HL.hover));
      if (st.selected) meshesOf(st.selected).forEach(ms => ms.material.emissive?.copy(HL.sel));
    }
    // shared materials across a part are fine; planets share one material per stage (by design: highlight together)

    // ---- focus
    function focus(id) {
      const p = parts.get(id); if (!p) return;
      const wc = p.center.clone().applyMatrix4(root.matrixWorld);
      goal.target.copy(wc); goal.dist = Math.max(S0 * 1.1, p.radius * 4.2); goal.az = view.az; goal.el = view.el;
    }
    function resetView() { st.zoomed = false; goal.target.copy(home.target); goal.az = home.az; goal.el = home.el; goal.dist = home.dist = fitDist() * (1 + .75 * st.explodeTarget); }

    // ---- pointer: orbit with inertia, pan (shift / middle), wheel zoom, pick, context menus
    const cv = renderer.domElement, ray = new TH.Raycaster(), ndc = new TH.Vector2();
    let drag = null, vel = { az: 0, el: 0 }, lastHover = 0;
    const pick = (cx, cy) => {
      const r = cv.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(meshes.filter(m => m.visible), false).find(h => !st.section || plane.distanceToPoint(h.point) >= -1e-6);
      return hit ? hit.object.userData.partId : null;
    };
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      closeMenu();
      if (e.button === 2) return;
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pan: e.shiftKey || e.button === 1, t: performance.now() };
      cv.setPointerCapture(e.pointerId); vel.az = vel.el = 0;
    });
    cv.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        if (drag.pan) {
          const k = view.dist * .0012, right = new TH.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new TH.Vector3().setFromMatrixColumn(camera.matrix, 1);
          goal.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k); view.target.copy(goal.target);
        } else { vel.az = -dx * .006; vel.el = dy * .006; goal.az += vel.az; goal.el = clamp(goal.el + vel.el, -1.45, 1.45); view.az = goal.az; view.el = goal.el; }
        return;
      }
      const now = performance.now(); if (now - lastHover < 40) return; lastHover = now;
      const id = pick(e.clientX, e.clientY); if (id !== st.hover) { st.hover = id; paint(); showTip(id, e); } else if (id) moveTip(e);
    });
    cv.addEventListener('pointerleave', () => { st.hover = null; paint(); hideTip(); });
    cv.addEventListener('pointerup', e => {
      if (!drag) return;
      const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4; drag = null;
      if (!moved) { const id = pick(e.clientX, e.clientY); select(id, false); opt.onPick?.(id); vel.az = vel.el = 0; }
    });
    cv.addEventListener('dblclick', () => resetView());
    cv.addEventListener('wheel', e => { e.preventDefault(); goal.dist = clamp(goal.dist * (1 + Math.sign(e.deltaY) * .1), S0 * .5, S0 * 12); st.zoomed = true; }, { passive: false });
    cv.addEventListener('pointerdown', e => { if (e.button === 2) { const id = pick(e.clientX, e.clientY); openMenu(e, id); } });

    // ---- tooltip, menus, overlay (DOM)
    const ui = document.createElement('div'); ui.className = 'v3-ui'; host.appendChild(ui);
    const tip = document.createElement('div'); tip.className = 'v3-tip'; ui.appendChild(tip);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'v3-lead'); ui.appendChild(svg);
    const labels = document.createElement('div'); labels.className = 'v3-labels'; ui.appendChild(labels);
    const nameOf = id => (opt.names && opt.names[id]) || id;
    function showTip(id, e) { if (!id) return hideTip(); tip.textContent = nameOf(id); tip.style.display = 'block'; moveTip(e); }
    function moveTip(e) { const r = host.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px'; }
    function hideTip() { tip.style.display = 'none'; }
    let menu = null;
    function closeMenu() { menu?.remove(); menu = null; }
    function openMenu(e, id) {
      closeMenu(); hideTip();
      const r = host.getBoundingClientRect();
      menu = document.createElement('div'); menu.className = 'v3-menu';
      menu.style.left = Math.min(e.clientX - r.left, r.width - 250) + 'px'; menu.style.top = Math.min(e.clientY - r.top, r.height - 300) + 'px';
      if (id) {
        const op = meshesOf(id)[0]?.material.opacity ?? 1;
        menu.innerHTML = `<div class="h">${nameOf(id)}</div>
          <label>투명도<input type="range" min="0.05" max="1" step="0.05" value="${op}" data-a="op"></label>
          <label>전체 투명도<input type="range" min="0.05" max="1" step="0.05" value="${meshes[0].material.opacity}" data-a="opAll"></label>
          <button data-a="explode">${st.explodeTarget > .5 ? '조립' : '분해도'}</button>
          <button data-a="section">${st.section ? '단면 끄기' : '단면도'}</button>
          <button data-a="hide">숨기기</button><button data-a="iso">이것만 보기</button><button data-a="all">모두 보이기</button>
          <button data-a="detail">상세 설계 보기</button>`;
      } else {
        menu.innerHTML = `<div class="h">보기 설정</div>
          <label>1단 썬 입력 rpm<input type="number" value="${D.anim.rpm}" step="any" data-a="rpm"></label>
          <label>재생 배속<select data-a="slow">${[[1, '1× 실속도'], [.2, '0.2×'], [.05, '0.05×'], [.02, '0.02×'], [.005, '0.005×']].map(([v, l]) => `<option value="${v}" ${+D.anim.slow === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>배경색<input type="color" value="${prefs.bg}" data-a="bg"></label>
          <label>음영<select data-a="shade">${[['pbr', '금속 (PBR)'], ['matte', '매트'], ['wire', '와이어프레임']].map(([v, l]) => `<option value="${v}" ${prefs.shade === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>광원 세기<input type="range" min="0.2" max="2" step="0.05" value="${prefs.light}" data-a="light"></label>
          <label>광원 방향<input type="range" min="0" max="360" step="5" value="${prefs.lightAz}" data-a="lightAz"></label>
          <button data-a="${st.playing ? 'pause' : 'play'}">${st.playing ? '회전 정지' : '회전 재생'}</button><button data-a="home">기본 시점</button>`;
      }
      ui.appendChild(menu);
      menu.addEventListener('pointerdown', ev => ev.stopPropagation());
      menu.querySelectorAll('[data-a]').forEach(el => {
        const a = el.dataset.a, ev = el.tagName === 'BUTTON' ? 'click' : 'input';
        el.addEventListener(ev, () => {
          const v = el.value;
          if (a === 'op') setOpacity(id, +v); else if (a === 'opAll') setOpacity(null, +v);
          else if (a === 'explode') { setExplode(st.explodeTarget > .5 ? 0 : 1); closeMenu(); }
          else if (a === 'section') { setSection(!st.section); opt.onState?.(); closeMenu(); }
          else if (a === 'hide') { setVisible(id, false); closeMenu(); } else if (a === 'iso') { isolate(id); focus(id); closeMenu(); }
          else if (a === 'all') { showAll(); closeMenu(); } else if (a === 'detail') { closeMenu(); opt.onDetail?.(id); }
          else if (a === 'rpm') { D.anim.rpm = Math.max(0, +v || 0); opt.save?.(); }
          else if (a === 'slow') { D.anim.slow = +v; opt.save?.(); }
          else if (a === 'bg') { prefs.bg = v; paintBg(); savePrefs(); }
          else if (a === 'shade') { prefs.shade = v; applyShade(); savePrefs(); }
          else if (a === 'light') { prefs.light = +v; placeLights(); savePrefs(); }
          else if (a === 'lightAz') { prefs.lightAz = +v; placeLights(); savePrefs(); }
          else if (a === 'pause' || a === 'play') { st.playing = a === 'play'; closeMenu(); }
          else if (a === 'home') { resetView(); closeMenu(); }
        });
      });
    }
    function savePrefs() { D.view = Object.assign({}, prefs); opt.save?.(); }
    function onDocDown(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
    document.addEventListener('pointerdown', onDocDown);

    // ---- leader lines (issues → part anchors, labels stacked on the right edge)
    function setIssues(list) {
      st.issues = (list || []).filter(x => parts.has(x.partId));
      labels.innerHTML = st.issues.map((x, k) => `<button class="v3-lab ${x.sev || 'bad'}" data-k="${k}"><b>${k + 1}</b><span>${x.title}</span></button>`).join('');
      labels.querySelectorAll('.v3-lab').forEach(b => b.onclick = () => { const it = st.issues[+b.dataset.k]; select(it.partId, true); opt.onIssue?.(it); });
    }
    const v3 = new TH.Vector3();
    function layoutLeaders() {
      const W = host.clientWidth, H = host.clientHeight; svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      if (!st.issues.length) { svg.innerHTML = ''; return; }
      const pts = st.issues.map((x, k) => { const p = parts.get(x.partId); v3.copy(p.center).applyMatrix4(root.matrixWorld).project(camera); return { k, x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H, z: v3.z }; });
      const col = W - 236, gap = 46, ord = pts.slice().sort((a, b) => a.y - b.y);
      let y = 24; ord.forEach(p => { p.ly = Math.max(y, Math.min(p.y, H - 24 - gap * (ord.length - 1 - ord.indexOf(p)))); y = p.ly + gap; });
      svg.innerHTML = ord.map(p => `<polyline points="${p.x},${p.y} ${col - 24},${p.ly} ${col},${p.ly}" /><circle cx="${p.x}" cy="${p.y}" r="3.5" />`).join('');
      const els = labels.children; ord.forEach(p => { const el = els[p.k]; if (el) { el.style.left = col + 'px'; el.style.top = (p.ly - 15) + 'px'; } });
    }

    function select(id, doFocus) { st.selected = id; paint(); if (id && doFocus) focus(id); }
    // keep the exploded assembly in frame unless the user has zoomed by hand
    function setExplode(v) { st.explodeTarget = clamp(v, 0, 1); if (!st.zoomed) goal.dist = fitDist() * (1 + .75 * st.explodeTarget); }

    // ---- animation loop
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now(), raf;
    const nLayers = 5, stagger = .12;
    let onScreen = true, slowFrames = 0, shadowTick = 0, curDPR = DPR, wasActive = true;
    const io = new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }, { threshold: 0 }); io.observe(host);
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!onScreen || document.hidden) { last = now; return; }
      const rawDt = (now - last) / 1000, dt = Math.min(.05, rawDt); last = now;
      // adaptive resolution: drop pixel ratio when frames stay slow, restore when fast again
      if (rawDt > .034) slowFrames++; else if (rawDt < .02) slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 20 && curDPR > 1) { curDPR = Math.max(1, curDPR - .25); renderer.setPixelRatio(curDPR); slowFrames = 0; }
      const moving = Math.abs(st.explodeTarget - st.explode) > 1e-4;
      if (st.playing && !reduce) st.theta += dt * (+D.anim.rpm || 0) * (+D.anim.slow || 0) * 2 * Math.PI / 60;
      // explode easing (0.8 s for the full travel, staggered by layer)
      const sp = dt / .8; st.explode += clamp(st.explodeTarget - st.explode, -sp, sp);
      const span = 1 + stagger * (nLayers - 1);
      const eLayer = l => ease(clamp(st.explode * span - stagger * l, 0, 1));
      movers.forEach(m => { m.obj.position.z = m.base.z + m.dz * eLayer(m.layer); });
      // camera damping + inertia
      if (!drag) { goal.az += vel.az; goal.el = clamp(goal.el + vel.el, -1.45, 1.45); vel.az *= .9; vel.el *= .9; if (Math.abs(vel.az) < 1e-5) vel.az = 0; if (Math.abs(vel.el) < 1e-5) vel.el = 0; }
      const k = 1 - Math.pow(.0008, dt);
      view.az += (goal.az - view.az) * k; view.el += (goal.el - view.el) * k; view.dist += (goal.dist - view.dist) * k; view.target.lerp(goal.target, k);
      place();
      // kinematics: sun → carrier, ring fixed (verified phasing)
      let sunAng = st.theta;
      kin.forEach((p, i) => {
        const carA = sunAng / p.ratio;
        p.sun.rotation.z = sunAng + p.psi;
        p.car.rotation.z = carA + p.psi;
        const er = eLayer(1) * (full ? p.a * .35 : 0);
        p.planets.forEach((pm, j) => {
          const phi = 2 * Math.PI * j / p.n + carA + p.psi;
          pm.position.x = (p.a + er) * Math.cos(phi); pm.position.y = (p.a + er) * Math.sin(phi);
          pm.rotation.z = p.phase[j] + phi - (sunAng - carA) * p.zs / p.zp;
        });
        sunAng = carA;
      });
      if (inRot) inRot.rotation.z = st.theta + (kin[0]?.psi || 0);
      if (outRot) outRot.rotation.z = sunAng; if (cage) cage.rotation.z = sunAng / 2;
      // section plane through the axis (world)
      if (st.section) { const a = st.secAngle * Math.PI / 180; plane.normal.set(-Math.cos(a), -Math.sin(a), 0); plane.constant = 0; plane.applyMatrix4(root.matrixWorld); }
      const active = moving || st.playing;   // gear spin barely moves the shadow: refresh every 6th frame, once more on stop
      if (renderer.shadowMap.enabled && (active ? ++shadowTick % 6 === 1 : wasActive)) renderer.shadowMap.needsUpdate = true;
      wasActive = active;
      renderer.render(scene, camera);
      layoutLeaders();
    }
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); });
    ro.observe(host);
    function dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('pointerdown', onDocDown);
      scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => m.dispose?.()); });
      scene.environment?.dispose?.(); renderer.dispose(); renderer.domElement.remove(); ui.remove();
    }
    return {
      dispose, select, focus, resetView, setExplode, setSection, setIssues, setOpacity, showAll, setVisible, isolate,
      get state() { return st; }, getView: () => ({ az: goal.az, el: goal.el, dist: goal.dist, target: goal.target.toArray(), explode: st.explodeTarget, theta: st.theta, playing: st.playing, section: st.section, secAngle: st.secAngle, selected: st.selected }), setSectionAngle: a => { st.secAngle = a; }, togglePlay: () => (st.playing = !st.playing),
      partIds: () => [...parts.keys()]
    };
  }

  // per-part dimension schema: engine inputs (path into D) and geometry-only overrides (D.geom.part.key)
  function partSchema(R, D, id) {
    const L = layout(R, D), A = L.auto, out = [];
    const E = (path, label, val, o = {}) => out.push({ path, label, value: val, engine: true, ...o });
    const Gm = (part, key, label, o = {}) => { const v = D.geom?.[part]?.[key]; out.push({ path: `geom.${part}.${key}`, label, value: Number.isFinite(v) && v > 0 ? v : null, auto: A[part]?.[key], engine: false, ...o }); };
    const m = /^(sun|planet|ring|pin|needle|carrier)(\d?)$/.exec(id);
    if (m) {
      const i = m[2] ? +m[2] - 1 : 0, s = D.stages[i], g = R.ctx.stages[i]?.geo, lock = i === 1 && D.config.sharedRing;
      if (m[1] === 'sun') { E(`stages.${i}.s`, '잇수', s.s, { step: 1 }); E(`stages.${i}.m`, '모듈', s.m, { lock }); E(`stages.${i}.b`, '치폭', s.b); E(`stages.${i}.beta`, '비틀림각 °', s.beta, { lock }); E(`stages.${i}.xs`, '전위계수', s.xs); E(`stages.${i}.sunBore`, '보어 (0=중실)', s.sunBore, { auto: g?.rims?.[0]?.diameter }); Gm(`sun${i + 1}`, 'hubInOD', '입력측 축(허브) 외경'); Gm(`sun${i + 1}`, 'hubInL', '입력측 축(허브) 길이'); Gm(`sun${i + 1}`, 'hubOutOD', '출력측 축 외경'); Gm(`sun${i + 1}`, 'hubOutL', '출력측 축 길이'); }
      if (m[1] === 'planet') { E(`stages.${i}.p`, lock ? '잇수 (링 공유 → 자동 = (R − S2)/2)' : '잇수', s.p, { step: 1, lock }); E(`stages.${i}.n`, '개수', s.n, { step: 1 }); E(`stages.${i}.xp`, '전위계수', s.xp); E(`stages.${i}.b`, '치폭 (썬과 공통)', s.b); E(`stages.${i}.planetBore`, '보어 (0=중실)', s.planetBore, { auto: g?.rims?.[1]?.diameter }); }
      if (m[1] === 'ring') { E('stages.0.ringOD', '외경', D.stages[0].ringOD, { auto: g?.rims?.[2]?.diameter }); E('stages.0.xr', '전위계수', D.stages[0].xr, { lock: D.stages[0].autoRingShift, note: D.stages[0].autoRingShift ? '자동 (4단계)' : '' }); }
      const shape = R.ctx.stages[i]?.carrier;
      if (m[1] === 'pin') {
        E(`stages.${i}.pin.d`, '핀 지름 (mm)', s.pin.d);
        E(`stages.${i}.pin.holeMode`, '홀 가공', s.pin.holeMode, { options: [['through', '관통'], ['blind', '깊이 지정']] });
        if (s.pin.holeMode === 'blind') E(`stages.${i}.pin.depth`, '원통 깊이 (mm)', s.pin.depth, { auto: shape?.hole?.autoDepth });
        E('', '핀 산출 길이 (mm)', shape?.pinLength?.toFixed(3), { readonly: true });
      }
      if (m[1] === 'needle') { E(`stages.${i}.bearing.C`, '동정격 C N', s.bearing.C); E(`stages.${i}.bearing.C0`, '정정격 C0 N', s.bearing.C0); E(`stages.${i}.bearing.count`, '유성당 개수', s.bearing.count, { step: 1 }); }
      if (m[1] === 'carrier') {
        E(`stages.${i}.pin.type`, '지지 형식', s.pin.type, { options: [['double', '양단 지지'], ['single', '편단 지지']] });
        E(`stages.${i}.carrier.width`, '캐리어 두께 (mm, 보스 제외)', s.carrier?.width, { auto: shape?.widthAuto ? shape.width : undefined });
        E('', '판 두께 (자동, mm)', shape ? shape.wallShort ? '부족 (두께 ≤ 안착 폭) · 0.3으로 표시' : (shape.double ? `${shape.wall.toFixed(2)} × 2` : shape.wall.toFixed(2)) : '—', { readonly: true });
        E(`stages.${i}.carrier.outerD`, '캐리어 최대외경 (mm)', s.carrier?.outerD, { auto: shape?.outerD });
        E(`stages.${i}.carrier.innerD`, '캐리어 내경 (mm)', s.carrier?.innerD, { auto: shape?.innerD });
        E(`stages.${i}.carrier.bossD`, '보스 외경 (mm)', s.carrier?.bossD, { auto: shape?.bossD });
        E(`stages.${i}.carrier.bossT`, '보스 두께 (mm, 0=없음)', s.carrier?.bossT);
        E(`stages.${i}.pin.d`, '유성 핀 지름 (mm)', s.pin.d);
        E(`stages.${i}.pin.holeMode`, '핀 홀 가공', s.pin.holeMode || 'through', { options: [['through', '관통'], ['blind', '깊이 지정 (막힌 홀)']] });
        if (s.pin.holeMode === 'blind') E(`stages.${i}.pin.depth`, '핀 홀 원통 깊이 (mm, 118° 끝 제외)', s.pin.depth, { auto: shape?.hole?.autoDepth });
        E('', '핀 길이 (자동, mm)', shape?.pinLength != null ? shape.pinLength.toFixed(2) : '—', { readonly: true });
        if (shape?.double) {
          E(`stages.${i}.carrier.groove`, '양단 중앙 홈의 축방향 폭 (mm)', s.carrier?.groove, { auto: shape.groove });
          E(`stages.${i}.carrier.pocket`, '유성 포켓 (mm)', s.carrier?.pocket, { auto: shape.pocket });
          E(`stages.${i}.carrier.pocketR`, '포켓 모서리 R (엔드밀 반경, mm)', s.carrier?.pocketR, { auto: shape.pocketR ?? undefined, step: .5 });
        } else E(`stages.${i}.carrier.axialClearance`, '지지판과 기어 사이 간격 (mm)', s.carrier?.axialClearance);
      }
    } else if (id === 'xroller') {
      E('outBearing.dp', '롤러 피치원 dp', D.outBearing.dp); E('outBearing.Z', '롤러 수', D.outBearing.Z, { step: 1 }); E('outBearing.Dw', '롤러 지름', D.outBearing.Dw); E('outBearing.Lw', '롤러 길이', D.outBearing.Lw);
      E('outBearing.preload', '예압 µm', D.outBearing.preload); E('outBearing.C', 'C N', D.outBearing.C); E('outBearing.C0', 'C0 N', D.outBearing.C0); Gm('xroller', 'width', '궤도륜 폭');
    } else if (id === 'oflange') { E('housing.flangeT', '두께', D.housing?.flangeT); Gm('oflange', 'hubD', '허브 외경'); Gm('oflange', 'boltPCD', '볼트 PCD'); }
    else if (id === 'housing') { E('housing.wall', '몸체 벽 두께', D.housing?.wall); Gm('housing', 'flangeD', '출력부 외경'); }
    else if (id === 'cover') { E('housing.coverT', '두께', D.housing?.coverT); Gm('cover', 'boltPCD', '볼트 PCD'); }
    else if (id === 'inshaft') { Gm('inshaft', 'od', '외경'); Gm('inshaft', 'id', '내경 (중공)'); Gm('inshaft', 'ext', '커버 밖 돌출 길이'); }
    else if (id === 'seal') { Gm('seal', 'w', '폭'); Gm('seal', 'h', '반경 높이'); }
    else if (id === 'bolts') { E('housing.boltN', '수 (커버·플랜지 각각)', D.housing?.boltN, { step: 1 }); E('housing.boltD', '호칭 M', D.housing?.boltD); }
    else if (id === 'ocover') { Gm('ocover', 'id', '내경'); Gm('ocover', 't', '두께'); }
    else if (id === 'oshaft') { Gm('oshaft', 'od', '외경'); Gm('oshaft', 'id', '내경 (중공)'); }
    else if (id === 'brgS1') { Gm('brgS1', 'h', '반경 단면 높이'); Gm('brgS1', 'w', '폭'); }
    else if (id === 'brgS2') { Gm('brgS2', 'h', '반경 단면 높이'); Gm('brgS2', 'w', '폭'); }
    if (partLocked(D, id)) out.forEach(r => r.lock = true);
    return out;
  }


  // ------------------------------------------------------------------ part studio: one machined part (S · P · R · C) with live dimensions
  // opt: { R, D, id, dims: [{ a:[x,y,z], b:[x,y,z], text, path?, value?, lock?, kind? }], onEdit(path, value), view, section }
  // dims are in part coordinates (gear face 0 … b along +Z, axis = Z), the same frame the geometry is built in.
  function mountPart(host, opt) {
    const TH = T(); if (!TH || !host) return null;
    const { R, D, id } = opt, L = layout(R, D);
    const m = /^(sun|planet|ring|carrier)(\d?)$/.exec(id); if (!m) return null;
    const i = m[2] ? +m[2] - 1 : 0, x = L.S[i], g = x.g, st = x.st, b = st.b;
    const W0 = host.clientWidth || 640, H0 = host.clientHeight || 420;
    const renderer = new TH.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.setSize(W0, H0);
    renderer.outputEncoding = TH.sRGBEncoding; renderer.toneMapping = TH.ACESFilmicToneMapping; renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;
    host.prepend(renderer.domElement);
    const scene = new TH.Scene(); scene.environment = makeEnv(renderer);
    scene.add(new TH.HemisphereLight(0xfffaf2, 0x5d5a54, .55));
    const key = new TH.DirectionalLight(0xfff3e4, 2.1); key.position.set(70, 90, 140); scene.add(key);
    const rim = new TH.DirectionalLight(0xd6a05a, .9); rim.position.set(-90, -40, -80); scene.add(rim);
    const camera = new TH.PerspectiveCamera(28, W0 / H0, .5, 5000);
    const clip = new TH.Plane(new TH.Vector3(0, -1, 0), 0);
    let section = !!opt.section;
    const mats = [];
    const mat = (c, metal = .95, rough = .26) => { const mm = new TH.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, envMapIntensity: 1.15, side: TH.DoubleSide, clippingPlanes: section ? [clip] : [] }); mats.push(mm); return mm; };
    const COL = { sun: 0xc89b4a, planet: 0x4f7fc4, ring: 0xd2d4d8, carrier: 0x3a3c42, pin: 0xf2f3f5 };
    const root = new TH.Group(); scene.add(root);
    const lathe = (ri, ro, z0, z1, c) => new TH.Mesh(new TH.LatheGeometry([new TH.Vector2(ri, z0), new TH.Vector2(ro, z0), new TH.Vector2(ro, z1), new TH.Vector2(ri, z1), new TH.Vector2(ri, z0)].map(v => new TH.Vector2(Math.max(v.x, .01), v.y)), 96).rotateX(Math.PI / 2), mat(c));
    const G = D.geom || {};
    if (m[1] === 'sun') {
      root.add(new TH.Mesh(gearGeometry(g.parts[0], g.at, b, st.beta, false, x.sunBore), mat(COL.sun)));
      const h = G['sun' + (i + 1)] || {}, rb = (x.sunBore || 0) / 2;
      if (h.hubInOD > 0 && h.hubInL > 0) root.add(lathe(rb, h.hubInOD / 2, -h.hubInL, 0, COL.sun));
      if (h.hubOutOD > 0 && h.hubOutL > 0) root.add(lathe(rb, h.hubOutOD / 2, b, b + h.hubOutL, COL.sun));
    } else if (m[1] === 'planet') {
      root.add(new TH.Mesh(gearGeometry(g.parts[1], g.at, b, -st.beta, false, x.planetBore), mat(COL.planet)));
    } else if (m[1] === 'ring') {
      const depth = L.shared ? L.gearEnd - (L.S[0].z0 || 0) : b;
      root.add(new TH.Mesh(gearGeometry(g.parts[2], g.at, depth, -st.beta, true, x.ringOD), mat(COL.ring, .9, .2)));
    } else {
      const shape = x.carrier;
      root.add(new TH.Mesh(carrierBody(shape), mat(COL.carrier, .85, .3)));
      if (opt.pins !== false) {
        const pg = new TH.CylinderGeometry(shape.diameter / 2, shape.diameter / 2, shape.pinLength, 48).rotateX(Math.PI / 2), pm = mat(COL.pin, 1, .08);
        shape.pins.forEach(pp => { const q = new TH.Mesh(pg, pm); q.position.set(pp.x, pp.y, (shape.stock[0] + shape.stock[1]) / 2); root.add(q); });
      }
    }
    const box = new TH.Box3().setFromObject(root), ctr = box.getCenter(new TH.Vector3()), size = box.getSize(new TH.Vector3()).length();
    root.position.sub(ctr);
    const fitD = () => { const r = size / 2, v = Math.tan(14 * Math.PI / 180), asp = Math.max(.4, (host.clientWidth || W0) / (host.clientHeight || H0)); return r / Math.min(v, v * asp) * 1.12; };
    const view = Object.assign({ az: .75, el: .42, dist: fitD() }, opt.view || {});
    const place = () => { const ce = Math.cos(view.el); camera.position.set(view.dist * ce * Math.sin(view.az), view.dist * Math.sin(view.el), view.dist * ce * Math.cos(view.az)); camera.lookAt(0, 0, 0); };
    // the part axis (Z) lies horizontally on screen: rotate the part so +Z (output side) points to the right
    root.rotation.y = Math.PI / 2; root.position.applyAxisAngle(new TH.Vector3(0, 1, 0), Math.PI / 2);
    // ---- overlay: dimension lines + editable labels
    const ui = document.createElement('div'); ui.className = 'pv-ui'; host.appendChild(ui);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'pv-dim'); ui.appendChild(svg);
    const labs = document.createElement('div'); labs.className = 'pv-labs'; ui.appendChild(labs);
    let dims = opt.dims || [], showDims = opt.showDims !== false, editing = null;
    const drawLabels = () => {
      labs.innerHTML = dims.map((d, k) => `<button class="pv-lab ${d.path && !d.lock ? 'ed' : 'ro'} ${d.kind || ''}" data-k="${k}" title="${d.path && !d.lock ? '클릭해서 수정' : '계산값'}">${d.text}</button>`).join('');
      labs.querySelectorAll('.pv-lab').forEach(btn => btn.onclick = e => {
        e.stopPropagation(); const d = dims[+btn.dataset.k]; opt.onFocus?.(d);
        if (!d.path || d.lock) return;
        editing = +btn.dataset.k;
        const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any'; inp.className = 'pv-in'; inp.value = d.value ?? ''; inp.placeholder = d.auto != null ? '자동 ' + (+d.auto).toFixed(2) : '';
        inp.style.left = btn.style.left; inp.style.top = btn.style.top; labs.appendChild(inp); inp.focus(); inp.select();
        const done = ok => { if (editing === null) return; editing = null; const v = inp.value === '' ? null : Number(inp.value); inp.remove(); if (ok && (v === null || Number.isFinite(v))) opt.onEdit?.(d.path, v); };
        inp.onkeydown = ev => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); };
        inp.onblur = () => done(true);
      });
    };
    drawLabels();
    const v3 = new TH.Vector3(), toScreen = p => { v3.set(p[0], p[1], p[2]).applyMatrix4(root.matrixWorld).project(camera); return { x: (v3.x + 1) / 2 * host.clientWidth, y: (1 - v3.y) / 2 * host.clientHeight, ok: v3.z < 1 }; };
    function layoutDims() {
      if (!showDims) { svg.innerHTML = ''; labs.style.display = 'none'; return; }
      labs.style.display = '';
      let out = '';
      const els = labs.querySelectorAll('.pv-lab');
      dims.forEach((d, k) => {
        const A = toScreen(d.a), B = toScreen(d.b), el = els[k]; if (!el) return;
        if (!A.ok || !B.ok) { el.style.display = 'none'; return; }
        el.style.display = '';
        const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len * 5, ny = dx / len * 5;
        const tick = P => `M${P.x - nx} ${P.y - ny}L${P.x + nx} ${P.y + ny}`;
        out += `<path class="${d.kind || ''}" d="M${A.x} ${A.y}L${B.x} ${B.y}${tick(A)}${tick(B)}"/>`;
        const ax = d.at === 'b' ? B.x : (A.x + B.x) / 2, ay = d.at === 'b' ? B.y : (A.y + B.y) / 2;
        const mx = ax + (d.off?.[0] || 0), my = ay + (d.off?.[1] || 0);
        el.style.left = mx + 'px'; el.style.top = my + 'px';
      });
      svg.innerHTML = out;
    }
    // ---- pointer orbit
    const cv = renderer.domElement; let drag = null;
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, az: view.az, el: view.el }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; view.az = drag.az - (e.clientX - drag.x) * .008; view.el = Math.max(-1.45, Math.min(1.45, drag.el + (e.clientY - drag.y) * .008)); });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('wheel', e => { e.preventDefault(); view.dist = Math.max(size * .6, Math.min(size * 8, view.dist * (1 + Math.sign(e.deltaY) * .1))); }, { passive: false });
    cv.addEventListener('dblclick', () => setView('iso'));
    function setView(name) {
      const V = { iso: [.75, .42], front: [-Math.PI / 2, 0], side: [0, 0], top: [0, 1.45] }[name] || [.75, .42];   // front = looking along the axis from the input side
      view.az = V[0]; view.el = V[1]; view.dist = fitD();
    }
    function setSection(on) { section = !!on; mats.forEach(mm => { mm.clippingPlanes = section ? [clip] : []; mm.needsUpdate = true; }); }
    let raf = 0;
    const frame = () => { raf = requestAnimationFrame(frame); place(); root.updateMatrixWorld(); renderer.render(scene, camera); layoutDims(); };
    frame();
    const ro = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); });
    ro.observe(host);
    return {
      dispose() { cancelAnimationFrame(raf); ro.disconnect(); scene.traverse(o => { o.geometry?.dispose?.(); }); mats.forEach(mm => mm.dispose()); scene.environment?.dispose?.(); renderer.dispose(); renderer.domElement.remove(); ui.remove(); },
      getView: () => ({ az: view.az, el: view.el, dist: view.dist }), setView, setSection,
      setDims(list) { dims = list || []; drawLabels(); }, showDims(on) { showDims = !!on; }
    };
  }

  globalThis.PGD3D = { mount, mountPart, partsList, partSchema, layout, outline, gearGeometry, carrierBody, OPTIONS, optOf, partOn, partLocked, housingProfile, coverProfile, compName };
})();
