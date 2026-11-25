/* Assembly edit data shared by the 3D viewer and the structural analysis input. */
(function (root) {
  'use strict';

  const AXES = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'];
  const JOINTS = [
    ['free', '자유 배치', [false, false, false, false, false, false]],
    ['fixed', '고정', [true, true, true, true, true, true]],
    ['cylindrical', '동축 (축 이동·회전 허용)', [true, true, false, true, true, false]],
    ['revolute', '회전 (축 이동 고정)', [true, true, true, true, true, false]],
    ['slider', '직동 (축 회전 고정)', [true, true, false, true, true, true]],
    ['plane', '평면 (면 안에서 이동)', [false, false, true, true, true, false]],
    ['custom', '자유도 직접 지정', []]
  ];
  const zero = () => AXES.map(() => 0);
  const datum = 'datum';
  const safeId = id => typeof id === 'string' && /^[a-zA-Z][a-zA-Z0-9-]{0,40}$/.test(id) && !['constructor', 'prototype'].includes(id);
  const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const defaultJoint = () => ({ mode: 'free', reference: datum, locks: [], outputSupport: false, gapRadial: null, gapAxial: null, kRadial: null, kAxial: null, kMoment: null });

  function read(D) {
    const state = D.assemblyPlacement;
    const bodies = Array.isArray(state?.bodies) ? state.bodies.filter(b => b && /^added-[1-9][0-9]*$/.test(b.id) &&
      typeof b.name === 'string' && ['box', 'ring'].includes(b.shape) && [b.width, b.depth, b.length].every(v => finite(v, 0) > 0) &&
      finite(b.bore, -1) >= 0 && (b.shape !== 'ring' || b.bore < b.width)) : [];
    const edits = {};
    for (const [id, row] of Object.entries(state?.edits || {})) {
      if (!safeId(id) || !row || typeof row !== 'object') continue;
      const raw = row.joint;
      const mode = JOINTS.some(([key]) => key === raw?.mode) ? raw.mode : 'free';
      const joint = { ...defaultJoint(), mode, reference: safeId(raw?.reference) ? raw.reference : datum };
      joint.outputSupport = raw?.outputSupport === true;
      joint.locks = mode === 'custom' ? AXES.map((_, i) => raw?.locks?.[i] === true) : [];
      for (const key of ['gapRadial', 'gapAxial', 'kRadial', 'kAxial', 'kMoment']) joint[key] = finite(raw?.[key], null);
      edits[id] = { offset: AXES.map((_, i) => finite(row.offset?.[i], 0)), joint };
    }
    return { schema: 'pgd-placement/1', bodies, edits };
  }

  function solve(state, ids) {
    const known = new Set(ids), poses = new Map(), stack = new Set(), errors = new Map();
    const visit = id => {
      if (poses.has(id)) return poses.get(id);
      if (errors.has(id)) return null;
      const entry = state.edits[id], joint = entry?.joint || defaultJoint();
      const locks = joint.mode === 'custom' ? joint.locks : JOINTS.find(([mode]) => mode === joint.mode)[2];
      const ref = locks.some(Boolean) ? joint.reference : datum;
      if (stack.has(id)) { errors.set(id, '구속의 기준 부품이 순환합니다.'); return null; }
      if (ref !== datum && !known.has(ref)) { errors.set(id, '현재 구조에 기준 부품이 없습니다.'); return null; }
      stack.add(id);
      const parent = ref === datum ? zero() : visit(ref);
      stack.delete(id);
      if (!parent) {
        if (!errors.has(id)) errors.set(id, '기준 부품의 구속을 먼저 수정하세요.');
        return null;
      }
      const offset = entry?.offset || zero();
      const pose = offset.map((v, i) => v + (locks[i] ? parent[i] : 0));
      poses.set(id, pose);
      return pose;
    };
    ids.forEach(visit);
    return { poses, errors };
  }

  function entry(state, id) {
    return state.edits[id] || { offset: zero(), joint: defaultJoint() };
  }

  const api = { AXES, JOINTS, datum, read, solve, entry };
  root.PGDPlacement = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
