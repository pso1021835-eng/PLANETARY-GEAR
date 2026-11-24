/* Controls and results for the reduced-order assembly predictions. */
(function (root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (x, n = 3) => Number.isFinite(x) ? Number(x.toFixed(n)).toLocaleString('ko-KR') : '—';
  const triplet = (v, scale = 1) => v.map(value => value == null ? '—' : fmt(value / scale)).join(' / ');
  function support(out) {
    if (out.errors?.length) return `<p class="bad">${out.errors.map(esc).join(' · ')}</p>`;
    return `<p>하중점 (X/Y/Z) <b>${triplet(out.load.p)} mm</b> · 힘 <b>${triplet(out.load.f)} N</b></p>
      <div class="scroll"><table><thead><tr><th>지지부</th><th>위치 X/Y/Z (mm)</th><th>반력 X/Y/Z (N)</th><th>반력 모멘트 X/Y (N·m)</th></tr></thead><tbody>
        ${out.reactions.map(s => `<tr><th>${esc(s.name)}</th><td>${triplet(s.p)}</td><td>${triplet(s.f)}</td><td>${triplet(s.m.slice(0, 2), 1000)}</td></tr>`).join('')}
      </tbody></table></div>
      <p>하중점 변위 X/Y/Z <b>${triplet(out.shift)} µm</b> · 기울기 X/Y <b>${triplet(out.tilt)}′</b></p>
      <p>하중점 접선 강성 X/Y/Z <b>${triplet(out.stiffness)} N/µm</b> · 모멘트 강성 X/Y <b>${triplet(out.momentStiffness)} N·m/arcmin</b></p>
      <p class="note">평형 잔차 · 힘 ${triplet(out.residual.f)} N · 전복모멘트 ${triplet(out.residual.m.slice(0, 2), 1000)} N·m · 이 모델의 범위 밖인 축 비틀림 잔차 ${fmt(out.residual.m[2] / 1000)} N·m.
      ‘—’는 해당 지지 정보나 접촉 강성이 없음을 뜻합니다. 강체 출력축과 동축 스프링 모델입니다. 미입력 유격은 0 µm, 출력 베어링의 미입력 전복 강성은 기존 카탈로그 입력값을 사용합니다.</p>`;
  }

  function clearance(out, inViewer) {
    const risk = out.hits.slice(0, 12);
    return `<p>${out.count}개 형상 외곽 · 검사한 부품 쌍 ${out.tested}개 · ${fmt(out.cycle)} 입력축 회전 구간${out.truncated ? ' (전체 반복주기 일부)' : ''}.</p>
      ${!out.tested ? '<p>부품을 추가하거나 배치를 바꾸면 변경된 형상의 간섭을 확인합니다.</p>' : risk.length ? `<ol class="iss">${risk.map((x, i) => `<li class="warn">
        ${inViewer ? `<button type="button" data-analysis-contact="${i}">${x.names.map(esc).join(' ↔ ')}</button>` : x.names.map(esc).join(' ↔ ')}
        <small>${x.initial < -1e-6 ? '정지 상태부터 후보' : x.between ? '샘플 사이 추가 확인 필요' : '운전 중 후보'} · 입력축 ${fmt(x.angle, 1)}° · 외곽 간극 ${fmt(x.margin)} mm</small></li>`).join('')}</ol>` : '<p>검사한 형상 외곽에서 간섭 후보가 발견되지 않았습니다.</p>'}
      ${out.excluded.length ? `<p class="warn">외곽 미지원 형상 · ${out.excluded.map(esc).join(', ')}</p>` : ''}
      ${out.meshMoved ? '<p class="warn">치합·유성 지지 위치가 바뀌었습니다. 기존 기어 강도는 기준 자세에서 계산되며 변경된 치면 접촉은 별도 확인이 필요합니다.</p>' : ''}
      <p class="note">치끝·직육면체·기울어진 형상은 보수적인 원통 외곽으로 검사합니다. 정상 치합·핀 구속은 제외합니다. 수치가 음수면 외곽이 겹칩니다.</p>`;
  }

  const pathTable = rows => `<div class="scroll"><table><thead><tr><th>단</th><th>캐리어측 (N·m)</th><th>썬측 (N·m)</th><th>고정 링 (N·m)</th></tr></thead><tbody>
    ${rows.map(row => `<tr><th>${row.stage}단</th><td>${fmt(row.output)}</td><td>${fmt(row.input)}</td><td>${fmt(row.ring)}</td></tr>`).join('')}</tbody></table></div>`;
  function reverse(out, inViewer) {
    if (out.error) return `<p class="bad">${esc(out.error)}</p>`;
    return `<h4>입력축 고정</h4><p>입력축 유지 반력 <b>${fmt(out.shaftTorque)} N·m</b> · 정지 토크 평형</p>${pathTable(out.held)}
      ${out.commonRing ? `<p>공용 링 합산 반력 <b>${fmt(out.held.reduce((m, s) => m + s.ring, 0))} N·m</b></p>` : ''}
      <h4>입력축 회전 허용</h4><p>역구동 시작 토크 <b>${fmt(out.start)} N·m</b> · ${out.canStart == null ? '기동 저항 입력 필요' : out.canStart ? '지정 토크에서 기동 여유 있음' : '지정 토크에서 기동 여유 없음'}</p>
      <p>입력축 속도 <b>${fmt(out.rpmIn, 1)} rpm</b> · 유효 토크 <b>${fmt(out.usable)} N·m</b> · 지정 운전점 효율 <b>${out.efficiency == null ? '—' : fmt(out.efficiency * 100, 2) + '%'}</b></p>
      ${out.loadDrag !== undefined ? `<p>지지 반력에 따른 출력측 추가 저항 <b>${fmt(out.loadDrag)} N·m</b> · 입력한 등가 마찰계수 사용</p>` : ''}
      ${out.byStage.length ? pathTable(out.byStage) : '<p class="note">효율을 보려면 양의 출력 토크·속도와 양단 운전 저항이 필요합니다.</p>'}
      ${inViewer ? '<div class="placement-actions"><button type="button" class="btn" data-analysis-flow="held">고정 하중 경로</button><button type="button" class="btn" data-analysis-flow="free">역구동 하중 경로</button><button type="button" class="btn" data-analysis-flow="clear">경로 숨기기</button></div>' : ''}
      <p class="note">기동은 양단 정지 저항을 출력축으로 환산합니다. 단별 역방향 치합 효율이 비어 있으면 기존 정구동 치합 효율을 대용한 추정입니다.</p>`;
  }

  function render(R, D, inViewer) {
    const current = { ...(D.assemblyPhysics || {}), ...Object.fromEntries(['Fr', 'Fa', 'M'].map(key => ['ext-' + key, D.req.ext?.[key]])) };
    const number = (name, label, { min, max, hint } = {}) => `<label class="f">${label}<input name="${name}" type="number" step="any"${min == null ? '' : ` min="${min}"`}${max == null ? '' : ` max="${max}"`} value="${esc(current[name] ?? '')}" placeholder="${esc(hint || '미입력')}"></label>`;
    const cases = R?.assembly;
    return `<section class="sc card assembly-analysis" data-assembly-analysis>
      <h3>배치에 따른 조립 해석</h3>
      <form data-analysis-settings>
        <div class="grid">
          ${number('ext-Fr', '반경 하중 (N)', { min: 0 })}
          ${number('ext-Fa', '축 하중 (N)', { min: 0 })}
          ${number('ext-M', '전복모멘트 (N·m)', { min: 0 })}
          ${number('loadZ', '출력 하중점 Z (mm)', { hint: '출력 플랜지 끝면' })}
          ${number('forceAz', '반경 하중 방향 (°)', { hint: '0 = +X' })}
          ${number('momentAz', '전복모멘트 방향 (°)', { hint: '90 = +Y 중심' })}
        </div>
        <details><summary>역구동 토크·속도·손실</summary>
          <div class="grid">
            ${number('torque', '출력측 가하는 토크 (N·m)', { min: 0, hint: '요구 정격 토크' })}
            ${number('rpm', '출력측 속도 (rpm)', { min: 0, hint: '정격 속도 / 감속비' })}
            ${number('inputStart', '입력측 기동 저항 (N·m)', { min: 0 })}
            ${number('outputStart', '출력측 기동 저항 (N·m)', { min: 0 })}
            ${number('inputDrag', '입력측 운전 저항 (N·m)', { min: 0 })}
            ${number('outputDrag', '출력측 기본 운전 저항 (N·m)', { min: 0 })}
            ${number('loadMu', '지지부 등가 마찰계수 (선택)', { min: 0, max: 1 })}
            ${(R?.ctx?.stages || []).map((_, i) => `<label class="f">${i + 1}단 역방향 치합 효율 (%)<input type="number" name="gear-${i}" min="0" max="100" step="any" value="${esc(current.gearEff?.[i] ?? '')}" placeholder="정구동 대용"></label>`).join('')}
          </div>
        </details>
        <button class="btn primary" type="submit">해석 조건 적용</button>
      </form>
      <p role="status" data-analysis-status></p>
      ${cases?.error ? `<p class="bad">${esc(cases.error)}</p>` : ''}
      ${cases?.jointErrors?.length ? `<p class="bad">${cases.jointErrors.map(j => `${esc(j.id)} ${esc(j.message)}`).join(' · ')}</p>` : ''}
      ${cases?.supports && cases.clearance && cases.reverse ? `
        <details open><summary>베어링 반력·강성</summary>${support(cases.supports)}</details>
        <details open><summary>정지·운전 중 간섭 후보</summary>${clearance(cases.clearance, inViewer)}</details>
        <details open><summary>역구동</summary>${reverse(cases.reverse, inViewer)}</details>` : ''}
    </section>`;
  }
  function bind(node, actions) {
    const form = node.querySelector('[data-analysis-settings]');
    form.onsubmit = e => {
      e.preventDefault();
      const raw = new FormData(form), gearEff = [];
      const next = {}, ext = {};
      for (const [key, value] of raw) {
        if (key.startsWith('ext-')) { ext[key.slice(4)] = value === '' ? null : Number(value); continue; }
        if (value === '') continue;
        if (key.startsWith('gear-')) gearEff[Number(key.slice(5))] = Number(value);
        else next[key] = Number(value);
      }
      actions.apply({ ...next, gearEff }, ext);
    };
    node.querySelectorAll('[data-analysis-contact]').forEach(button => {
      button.onclick = () => actions.contact?.(Number(button.dataset.analysisContact));
    });
    node.querySelectorAll('[data-analysis-flow]').forEach(button => {
      button.onclick = () => {
        const message = actions.flow?.(button.dataset.analysisFlow);
        node.querySelector('[data-analysis-status]').textContent = message || '';
      };
    });
  }
  root.PGDAssemblyAnalysisView = { render, bind };
})(globalThis);
