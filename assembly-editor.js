/* Assembly placement form used by the individual structure page and 3D. */
(function (root) {
  'use strict';

  const P = root.PGDPlacement;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const options = (rows, value) => rows.map(([key, text]) => `<option value="${esc(key)}" ${key === value ? 'selected' : ''}>${esc(text)}</option>`).join('');
  const values = pose => pose.map((v, i) => `${P.AXES[i]} ${v > 0 ? '+' : ''}${Number(v.toFixed(3))}${i < 3 ? ' mm' : '°'}`).join(' · ');
  const bounds = (i) => i < 3 ? 500 : 360;
  const fits = [
    ['gapRadial', '반경 유격 (µm)'], ['gapAxial', '축 유격 (µm)'],
    ['kRadial', '반경 강성 (N/µm)'], ['kAxial', '축 강성 (N/µm)'], ['kMoment', '전복 강성 (N·m/arcmin)']
  ];

  function render(D, parts, selected, inViewer) {
    const state = P.read(D);
    const catalog = [...parts, ...state.bodies];
    const ids = catalog.map(part => part.id);
    const id = ids.includes(selected) ? selected : ids.includes('xroller') ? 'xroller' : ids[0];
    const body = state.bodies.find(b => b.id === id);
    const { offset, joint } = P.entry(state, id);
    const result = P.solve(state, ids);
    const issue = result.errors.get(id);
    return `<section class="sc card placement-editor" data-placement data-part="${esc(id)}">
      <h3>부품 배치·구속</h3>
      <p class="note">기준 위치에서 이동할 거리와 각도를 지정합니다. 위치를 먼저 맞춘 뒤 기준 부품과 함께 움직일 축을 지정하세요. 구속은 조립 자세 편집에 적용됩니다.</p>
      <form data-placement-new class="placement-actions">
        <label class="f">추가 부품 이름 <input name="name" maxlength="40" required></label>
        <label class="f">형상 <select name="shape"><option value="ring">원통·링</option><option value="box">직육면체</option></select></label>
        <button type="submit" class="btn">부품 추가</button>
      </form>
      ${catalog.length ? `<label class="f">편집할 부품 <select data-placement-select>${options(catalog.map(p => [p.id, p.name]), id)}</select></label>
      <form data-placement-edit>
        ${body ? `<div class="grid">${(body.shape === 'ring' ? [['width', '외경', .1], ['bore', '내경 (0이면 중실)', 0]] : [['width', '폭', .1], ['depth', '높이', .1]]).concat([['length','길이',.1]]).map(([key, label, min]) => `<label class="f">${label} (mm)<input name="${key}" type="number" min="${min}" max="1000" step="any" required value="${body[key]}"></label>`).join('')}</div>` : ''}
        <div class="grid">${P.AXES.map((axis, i) => `<label class="f">${axis} ${i < 3 ? '(mm)' : '(°)'}<input name="pose-${i}" type="number" step="any" min="-${bounds(i)}" max="${bounds(i)}" value="${offset[i]}" required></label>`).join('')}</div>
        ${inViewer ? `<div class="placement-actions"><label class="f">드래그 방향<select data-placement-axis>${options(P.AXES.slice(0, 3).map((axis, i) => [String(i), axis]), '2')}</select></label><button type="button" class="btn" data-placement-drag aria-pressed="false">모델에서 이동</button></div>` : ''}
        <div class="grid">
          <label class="f">구속 방식 <select name="mode">${options(P.JOINTS, joint.mode)}</select></label>
          <label class="f">기준 부품 <select name="reference">${options([[P.datum, '조립 기준 좌표'], ...catalog.filter(p => p.id !== id).map(p => [p.id, p.name])], joint.reference)}</select></label>
        </div>
        <fieldset data-placement-locks ${joint.mode === 'custom' ? '' : 'hidden'}><legend>기준 부품에 구속할 자유도</legend>${P.AXES.map((axis, i) => `<label class="c"><input type="checkbox" name="lock-${i}" ${joint.locks[i] ? 'checked' : ''}> ${axis}</label>`).join('')}</fieldset>
        <details><summary>유격·지지 강성</summary><div class="grid">${fits.map(([key, label]) => `<label class="f">${label}<input type="number" step="any" min="0" name="${key}" value="${joint[key] ?? ''}" placeholder="미입력"></label>`).join('')}</div></details>
        <div class="placement-actions"><button type="submit" class="btn primary">배치·구속 적용</button><button type="button" class="btn" data-placement-reset>배치·구속 초기화</button>${body ? '<button type="button" class="btn" data-placement-remove>추가 부품 삭제</button>' : ''}</div>
      </form>
      <p class="note" data-placement-pose>${issue ? esc(issue) : '표시 위치 변화 · ' + values(result.poses.get(id) || offset)}</p>` : ''}
      <p role="status" data-placement-status></p>
      <p class="note">지지 강성·유격은 해석 입력값입니다. 연결된 해석 결과가 있을 때 반력·강성·간섭·역구동을 표시합니다.</p>
    </section>`;
  }

  function bind(box, { design, parts, choose, commit, preview, drag }) {
    const id = box.dataset.part;
    const input = box.querySelector('[data-placement-edit]');
    const status = box.querySelector('[data-placement-status]');
    const placement = () => P.read(design());
    const known = state => [...parts.map(p => p.id), ...state.bodies.map(b => b.id)];
    const change = box.querySelector('[data-placement-select]');
    if (change) change.onchange = () => choose(change.value);
    box.querySelector('[data-placement-new]').onsubmit = e => {
      e.preventDefault();
      const form = e.currentTarget, state = placement(), name = form.elements.name.value.trim();
      if (!name) { status.textContent = '부품 이름을 입력하세요.'; return; }
      if (state.bodies.length >= 32) { status.textContent = '추가 부품은 32개까지 편집할 수 있습니다.'; return; }
      let number = 1;
      while (state.bodies.some(b => b.id === `added-${number}`)) number++;
      const next = `added-${number}`;
      state.bodies = [...state.bodies, { id: next, name, shape: form.elements.shape.value, width: 12, depth: 12, length: 6, bore: 0 }];
      state.edits[next] = { ...P.entry(state, next), offset: [12, 0, 0, 0, 0, 0] };
      commit(state, next);
    };
    if (!input) return;
    const axis = box.querySelector('[data-placement-axis]');
    const arm = box.querySelector('[data-placement-drag]');
    const mode = input.elements.mode;
    const poseFields = P.AXES.map((_, i) => input.elements[`pose-${i}`]);
    const poseReadout = box.querySelector('[data-placement-pose]');
    const getDraft = () => {
      const state = placement(), previous = P.entry(state, id);
      const joint = { ...previous.joint, mode: mode.value, reference: input.elements.reference.value,
        locks: P.AXES.map((_, i) => input.elements[`lock-${i}`].checked) };
      for (const [key] of fits) joint[key] = input.elements[key].value === '' ? null : input.elements[key].valueAsNumber;
      const offset = poseFields.map(field => field.valueAsNumber);
      state.edits[id] = { offset, joint };
      if (state.bodies.some(b => b.id === id)) state.bodies = state.bodies.map(b => b.id === id ? {
        ...b, width: input.elements.namedItem("width").valueAsNumber, length: input.elements.namedItem("length").valueAsNumber,
        depth: input.elements.namedItem("depth")?.valueAsNumber ?? b.depth, bore: input.elements.namedItem("bore")?.valueAsNumber ?? b.bore
      } : b);
      return state;
    };
    const update = () => {
      if (!poseFields.every(field => field.validity.valid)) return;
      const state = getDraft(), result = P.solve(state, known(state));
      const issue = result.errors.get(id);
      poseReadout.textContent = issue || '표시 위치 변화 · ' + values(result.poses.get(id));
      if (!issue) preview?.(result.poses, id);
    };
    input.addEventListener('input', update);
    mode.onchange = () => { box.querySelector('[data-placement-locks]').hidden = mode.value !== 'custom'; };
    input.onsubmit = e => {
      e.preventDefault();
      const state = getDraft(), result = P.solve(state, known(state));
      const saved = placement(), existing = P.solve(saved, known(saved)).errors;
      const conflict = result.errors.get(id) || [...result.errors].find(([part]) => !existing.has(part))?.[1];
      if (conflict) { status.textContent = conflict; return; }
      if (state.bodies.some(b => b.shape === 'ring' && b.bore >= b.width)) { status.textContent = '내경은 외경보다 작아야 합니다.'; return; }
      commit(state, id);
    };
    box.querySelector('[data-placement-reset]').onclick = () => {
      const state = placement();
      delete state.edits[id];
      commit(state, id);
    };
    const remove = box.querySelector('[data-placement-remove]');
    if (remove) remove.onclick = () => {
      const state = placement();
      if (Object.values(state.edits).some(row => row.joint.reference === id)) {
        status.textContent = '이 부품을 기준으로 삼는 구속을 먼저 해제하세요.';
        return;
      }
      state.bodies = state.bodies.filter(body => body.id !== id);
      delete state.edits[id];
      commit(state);
    };
    if (arm) arm.onclick = () => {
      const active = arm.getAttribute('aria-pressed') !== 'true';
      if (!active) { drag(null); arm.setAttribute('aria-pressed', 'false'); return; }
      const index = Number(axis.value), initialValue = poseFields[index].valueAsNumber;
      if (!drag({ id, axis: index, onMove(delta) {
        const value = Math.max(-500, Math.min(500, initialValue + delta));
        poseFields[index].value = Number(value.toFixed(2));
        update();
      }, onEnd(message) {
        arm.setAttribute('aria-pressed', 'false');
        status.textContent = message || '이동값을 확인한 뒤 배치·구속 적용을 누르세요.';
      } })) {
        status.textContent = '전체 조립 보기에서 해당 부품을 표시한 뒤 이동하세요.';
        return;
      }
      arm.setAttribute('aria-pressed', 'true');
      status.textContent = '모델 영역에서 드래그하세요.';
    };
  }

  root.PGDAssemblyEditor = { render, bind };
})(globalThis);
