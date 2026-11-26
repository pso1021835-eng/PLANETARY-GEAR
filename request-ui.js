/* 설계 의뢰 화면 (globalThis.PGDRequestUI) — 최종 목적 흐름: 의뢰서(엑셀 / 화면 13칸) → 자동 설계(AI 없음) → 결과(판정 · 기어 제원표 · BOM ·
   결정 기록) → 결과 엑셀 내보내기 · 사이트에 적용 · 설계 DB 저장 · 유사 사례.
   판정 기준: ISO 6336:2019 (KISSsoft 방식) 기본, 오차 0은 옵션 (사용자 결정 2026-11-26). 기본 안전율 SH ≥ 1.0 · SF ≥ 1.4 (SF-1). */
(function (root) {
  'use strict';
  const KEY = 'pgd-request-v1';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fx = (x, d = 1) => Number.isFinite(+x) && x !== null && x !== '' ? (+x).toFixed(d) : '—';
  // 표준 DB(사용자 지정 기준 사례) 의뢰 조건을 처음 예시로 채운다
  const EXAMPLE = { M1: '예시 (표준 DB)', I3: 3000, I5: 25, I6: '정격', I7: 25, I8: 100, I9: 100, I11: 20000, I12c: 15, I13: 62.5, I14: 87.5 };
  const GROUPS = [['의뢰 정보', ['M1', 'M2', 'M3', 'M4']], ['모터', ['I1', 'I2', 'I3', 'I4']], ['요구 성능', ['I5', 'I6', 'I7']],
    ['외형 (절대 고정)', ['I8', 'I9', 'I10']], ['수명 · 출력 외력', ['I11', 'I12a', 'I12b', 'I12c']], ['정격 직접 지정 (모터 대신)', ['I13', 'I14']]];
  // 실물 기준 사례 (보정 근거 · 같은 엔진으로 계산한 값) — docs/DESIGN-ALGORITHM.md §8, #73
  const REF = [
    { name: 'PI82 (HDS 82pi 1단 스퍼 · KISSsoft 보고서)', real: 16.2, realNote: '보고서 하중', iso: 4.34, ideal: 15.9 },
    { name: 'RH065 (9:1 2단 공용 링)', real: 28, realNote: '성능 시험', iso: 2.31, ideal: 22.2 }];
  const S = { cells: null, basis: 'iso', run: null, busy: false, msg: '' };
  const load = () => { try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.cells) { S.cells = j.cells; S.basis = j.basis || 'iso'; } } catch (e) { } if (!S.cells) S.cells = { ...EXAMPLE }; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ cells: S.cells, basis: S.basis })); } catch (e) { } };
  load();
  const Q = () => root.PGDRequest, A = () => root.PGDAutoDesign;
  const parse = () => Q().parse(S.cells);

  function fieldHTML(f, q) {
    const v = S.cells[f.id] ?? '', err = q.errors.find(e => e.id === f.id);
    const ph = f.blank ? `빈칸 = ${f.blank}` : f.need === 'Y' ? '필수' : '';
    const lab = `${esc(f.label)}${f.unit ? ` <small>${esc(f.unit)}</small>` : ''} <small class="note">${f.id}${f.need === 'Y' ? ' · 필수' : f.need === 'C' ? ' · 조건부' : ''}</small>`;
    const input = f.type === 'kind'
      ? `<select data-rq="${f.id}"><option value=""${v === '' ? ' selected' : ''}>선택</option>${Q().KINDS.map(k => `<option${k === v ? ' selected' : ''}>${k}</option>`).join('')}</select>`
      : `<input data-rq="${f.id}" type="${f.type === 'num' ? 'text' : 'text'}" inputmode="${f.type === 'num' ? 'decimal' : 'text'}" value="${esc(v)}" placeholder="${esc(ph)}">`;
    return `<label class="f${err ? ' ferr' : ''}">${lab}${input}${err ? `<small class="bad">${esc(err.msg)}</small>` : ''}</label>`;
  }
  function formHTML(q) {
    const by = Object.fromEntries(Q().FIELDS.map(f => [f.id, f]));
    return GROUPS.map(([t, ids]) => `<h4 class="rq-g">${t}</h4><div class="grid">${ids.map(id => fieldHTML(by[id], q)).join('')}</div>`).join('');
  }
  function checkHTML(q) {
    const e = q.errors.filter(x => x.id === 'FORMAT' || !Q().FIELDS.some(f => f.id === x.id) || true);
    return `${q.ok ? `<p class="good"><b>의뢰서 정상</b> — 요구 정격 ${fx(q.derived.TR, 2)} / 반복 피크 ${fx(q.derived.TA, 2)} / 순간 최대 ${fx(q.derived.TM, 2)} N·m · 출력 ${fx(q.derived.nOut, 1)} rpm · 수명 ${q.derived.lifeH} h</p>`
      : `<p class="bad"><b>의뢰서 확인 필요 ${e.length}건</b> — ${e.map(x => esc(x.msg)).join(' · ')}</p>`}
      ${q.assumptions.length ? `<details><summary class="note">빈칸으로 둔 항목의 가정 ${q.assumptions.length}건</summary><ul class="note">${q.assumptions.map(a => `<li>${a.id}: ${esc(a.msg)}</li>`).join('')}</ul></details>` : ''}`;
  }

  // ---- 결과
  const statusText = { pass: ['충족', 'good', '요구 성능을 만족하는 설계안입니다.'], short: ['미달 — 가장 가까운 안', 'bad', '외형 안에서 전 항목을 만족하는 안이 없어, 미달이 가장 적은 안과 부족분을 냅니다.'],
    none: ['조합 없음', 'bad', ''], input: ['의뢰서 오류', 'bad', ''] };
  function similar(r, hooks) {
    const q = r.q, T = q.engineReq, list = [];
    const add = (key, x, kind) => {
      const rq = x.request || {}, sm = x.summary || {};
      const ratio = rq.ratio || sm.ratio, Dm = rq.Dmax || sm.OD, Lm = rq.Lmax || sm.L, Tr = rq.Trated;
      if (!(ratio > 0 && Dm > 0 && Lm > 0 && Tr > 0)) return;
      const d = Math.abs(Math.log(ratio / T.ratio)) + Math.abs(Dm - T.Dmax) / T.Dmax + Math.abs(Lm - T.Lmax) / T.Lmax + Math.abs(Math.log(Tr / T.Trated));
      list.push({ key, name: x.name || '', kind, sim: Math.exp(-d), ratio, Dm, Lm, Tr, cap: sm.reducerCap, gears: sm.gears });
    };
    (hooks.lib() || []).forEach((x, i) => add('lib:' + i, x, '기본 설계'));
    (hooks.mine() || []).forEach((x, i) => add('mine:' + i, x, '내 케이스'));
    return list.sort((a, b) => b.sim - a.sim).slice(0, 3);
  }
  function resultHTML(r, hooks) {
    if (!r) return '';
    if (r.status === 'input') return `<div class="card"><h3 class="bad">의뢰서 오류</h3><p>${esc((r.errors || []).map(e => e.msg).join(' · '))}</p></div>`;
    if (r.status === 'none') return `<div class="card"><h3 class="bad">조합 없음</h3><p>${esc(r.error)}</p><p class="note">탐색 조합 ${r.searched ?? '—'}개 · ${fx(r.ms / 1000, 1)} s</p></div>`;
    const [st, cls, sub] = statusText[r.status], sc = r.score, q = r.q, band = r.band;
    const gov = r.R?.reducerGov || r.R?.govRated?.row?.partName || '';
    const ratioBand = band && band.ideal > 0 ? band.iso / band.ideal : null;
    const sims = similar(r, hooks);
    const verdict = (r.R?.verdict || []).map(v => `<tr class="${v.ok ? '' : 'bad'}"><td class="l">${esc(v.k)}</td><td>${esc(typeof v.value === 'number' ? fx(v.value, 2) : v.val ?? '')}</td><td>${esc(v.target != null ? fx(v.target, 2) : '')}</td><td>${v.ok ? '충족' : '미달'}</td></tr>`).join('');
    const gears = (r.gears || []).map(g => `<tr><td>${g.stage}</td><td class="l">${esc(g.part)}</td><td>${g.z}</td><td>${g.mn}</td><td>${g.alpha}</td><td>${g.beta}</td><td>${fx(g.x, 3)}</td><td>${fx(g.d, 3)}</td><td>${fx(g.da, 3)}</td><td>${fx(g.df, 3)}</td><td>${fx(g.b, 1)}</td><td>${g.grade}</td><td>${g.qty}</td><td class="l">${esc(g.material)}</td><td>${fx(g.SH, 2)}</td><td>${fx(g.SF, 2)}</td></tr>`).join('');
    const bom = (r.bom || []).map(b => `<tr class="${b.ok === false ? 'bad' : ''}"><td>${b.no ?? ''}</td><td class="l">${esc(b.name)}</td><td>${b.qty}</td><td class="l">${esc(b.material || '')}</td><td class="l">${esc(b.heat || '')}</td><td>${fx(b.massG, 1)}</td><td class="l">${esc(b.verdict || '')}</td></tr>`).join('');
    const log = (r.log || []).map(l => `<tr><td>${esc(l.kind)}</td><td class="l">${esc(l.key)}</td><td class="l">${esc(l.value)}</td><td class="l">${esc(l.why || '')}</td><td class="l note">${esc(l.basis || '')}</td></tr>`).join('');
    return `<div class="card rq-res"><h3>결과 <span class="${cls}">${st}</span> <small class="note">${fx(r.ms / 1000, 1)} s · 조합 ${r.searched}개 탐색 · 후보 ${r.pool}개 수정 · 판정 기준 ${r.basis === 'ideal' ? '오차 0 (옵션)' : 'ISO 6336:2019 (KISSsoft 방식)'}</small></h3>
      <p>${sub}</p>
      <div class="rq-kpi">
        <div><small>요구 정격</small><b>${fx(T(q).Trated, 2)} N·m</b></div>
        <div><small>예측 정격 (판정 기준)</small><b class="${sc.cap >= T(q).Trated ? 'good' : 'bad'}">${fx(sc.cap, 2)} N·m</b></div>
        <div><small>기어 정격 ISO / 오차 0</small><b>${band ? `${fx(band.iso, 2)} / ${fx(band.ideal, 2)}` : '—'}</b></div>
        <div><small>외형 Ø × 길이 (한계)</small><b class="${sc.envOk ? '' : 'bad'}">${fx(sc.OD, 1)} × ${fx(sc.L, 1)}</b><small>(${T(q).Dmax} × ${T(q).Lmax})</small></div>
        <div><small>질량 (추정)</small><b>${fx(sc.mass * 1000, 0)} g</b></div>
        <div><small>수명 (요구 정격)</small><b class="${r.life?.ok ? 'good' : 'bad'}">${r.life?.ok ? '충족' : '미달'}</b></div></div>
      ${gov ? `<p class="note">지배 부위: ${esc(gov)}</p>` : ''}
      ${r.short?.length ? `<p class="bad"><b>남은 미달 ${r.short.length}건</b> — ${r.short.map(s => esc(s.k)).join(' · ')}</p>` : ''}
      ${r.advice?.length ? `<p class="note">권장 미충족 (판정에 세지 않음): ${r.advice.map(s => esc(s.k)).join(' · ')}</p>` : ''}
      <p class="rq-act"><button class="btn primary" id="rqApply">사이트에 적용 → 3D · 항목에서 수정</button> <button class="btn" id="rqXlsx">결과 엑셀 내보내기</button> <button class="btn" id="rqSave">설계 DB에 저장</button> <span class="note" id="rqSaved"></span></p></div>
      <div class="card"><h3>판정 근거 — 실물 사례 대비 위치</h3>
        <p class="note">판정은 ISO 6336:2019 (KISSsoft 방식)입니다. 소형 저하중 영역(치폭당 하중 &lt; 100 N/mm)에서는 ISO가 가공 오차를 크게 반영해 실물보다 낮게 나옵니다. 같은 엔진으로 계산한 실물 사례는 아래와 같습니다.</p>
        <table class="dbt"><tr><th class="l">사례</th><th>실물</th><th>ISO</th><th>오차 0</th><th>실물 / 오차 0</th></tr>
          ${REF.map(x => `<tr><td class="l">${esc(x.name)}</td><td>${x.real} N·m <small class="note">${esc(x.realNote)}</small></td><td>${x.iso}</td><td>${x.ideal}</td><td>${fx(x.real / x.ideal, 2)}</td></tr>`).join('')}
          ${band ? `<tr class="gov"><td class="l">이번 설계</td><td>—</td><td>${fx(band.iso, 2)}</td><td>${fx(band.ideal, 2)}</td><td>ISO / 오차 0 = ${fx(ratioBand, 2)}${band.lowLoad ? ' · 저하중' : ''}</td></tr>` : ''}</table>
        <p class="note">두 실물 사례 모두 오차 0 값 이상에서 운전됐습니다(1.02 · 1.26배). 오차 0 값은 실물 근거가 3건 이상 쌓이기 전까지 참고값입니다 (docs/DESIGN-ALGORITHM.md §8).</p></div>
      <div class="card scroll"><h3>기어 제원표</h3><table class="dbt"><tr><th>단</th><th class="l">부품</th><th>z</th><th>mn</th><th>αn°</th><th>β°</th><th>x</th><th>d</th><th>da</th><th>df</th><th>b</th><th>등급</th><th>수량</th><th class="l">재료·열처리</th><th>SH</th><th>SF</th></tr>${gears}</table></div>
      <div class="card scroll"><h3>부품 BOM</h3><table class="dbt"><tr><th>No</th><th class="l">부품</th><th>수량</th><th class="l">재질</th><th class="l">열처리</th><th>질량 g</th><th class="l">판정</th></tr>${bom}</table></div>
      <details class="card"><summary><b>판정 항목 ${(r.R?.verdict || []).length}개</b></summary><table class="dbt"><tr><th class="l">항목</th><th>값</th><th>기준</th><th>판정</th></tr>${verdict}</table></details>
      <details class="card"><summary><b>결정 기록 ${(r.log || []).length}건</b> — 항목 · 값 · 이유 · 근거</summary><div class="scroll"><table class="dbt"><tr><th>구분</th><th class="l">항목</th><th class="l">값</th><th class="l">이유</th><th class="l">근거</th></tr>${log}</table></div></details>
      ${sims.length ? `<div class="card"><h3>유사 사례 (설계 DB)</h3><table class="dbt"><tr><th class="l">사례</th><th>유사도</th><th>감속비</th><th>외경 × 길이</th><th>요구 정격</th><th>감속기 한계</th><th></th></tr>${sims.map(x => `<tr><td class="l">${esc(x.name)} <small class="note">${x.kind}</small></td><td>${fx(x.sim * 100, 0)} %</td><td>${fx(x.ratio, 2)}</td><td>${fx(x.Dm, 0)} × ${fx(x.Lm, 0)}</td><td>${fx(x.Tr, 1)}</td><td>${fx(x.cap, 1)}</td><td><button class="btn" data-rqopen="${x.key}">불러오기</button></td></tr>`).join('')}</table></div>` : ''}`;
  }
  const T = q => q.engineReq;

  function html() {
    const q = parse();
    return `<h2>설계 의뢰 → 자동 설계</h2><p class="lead">의뢰 조건만 넣으면 사이트가 AI 없이 기어 제원 · 부품 구성(BOM) · 판정 근거를 만들어 냅니다. 엑셀 의뢰서를 불러오거나 아래 칸에 직접 입력하세요.</p>
      <div class="card"><h3>1. 의뢰서</h3>
        <p><a class="btn" href="templates/${encodeURIComponent('설계의뢰서_PGD-REQ-2.xlsx')}" download>엑셀 의뢰서 양식 받기</a>
          <label class="btn" for="rqFile">엑셀 의뢰서 불러오기</label><input type="file" id="rqFile" accept=".xlsx" class="rq-file">
          <button class="btn" id="rqExample">예시로 채우기</button> <button class="btn" id="rqClear">비우기</button> <span class="note" id="rqFileMsg">${esc(S.msg)}</span></p>
        ${formHTML(q)}
        <div id="rqCheck">${checkHTML(q)}</div></div>
      <div class="card"><h3>2. 자동 설계</h3>
        <div class="grid"><label class="f">판정 기준<select id="rqBasis"><option value="iso"${S.basis === 'iso' ? ' selected' : ''}>ISO 6336:2019 (KISSsoft 방식) · 기본</option><option value="ideal"${S.basis === 'ideal' ? ' selected' : ''}>이론 (오차 0) · 옵션</option></select></label></div>
        <p><button class="btn primary" id="rqRun" ${q.ok && !S.busy ? '' : 'disabled'}>자동 설계 실행</button> <span class="note" id="rqProg">${S.busy ? '계산 중…' : '보통 1~30초 걸립니다. 잇수·모듈·치폭 조합을 탐색하고, 후보마다 판정 → 수정을 반복합니다.'}</span></p>
        <p class="note">설계 규칙: 모듈 0.4·0.5·0.6·0.7·0.8·1.0 · β 12° · 유성 3개 · 전위 0 우선 · 6급 (강도 미달 시 마지막 수단으로 5급) · SCM440 이온질화 · 크라우닝 없음 · SH ≥ 1.0 · SF ≥ 1.4 · 외경·길이 절대 고정</p></div>
      <div id="rqResult">${resultHTML(S.run, S.hooks || {})}</div>`;
  }

  function sheetsOf(r) {
    const q = r.q, F = Q().FIELDS, given = q.given || {};
    const req = F.map(f => [f.id, f.label, q.input[f.key] ?? '', f.unit, given[f.key] ? '입력' : (q.input[f.key] != null ? '가정' : '')]);
    const sum = [['항목', '값', '단위', '비고'],
      ['결과', statusText[r.status][0], '', r.basis === 'ideal' ? '판정 기준: 이론 (오차 0, 옵션)' : '판정 기준: ISO 6336:2019 (KISSsoft 방식)'],
      ['요구 정격 토크', T(q).Trated, 'N·m', '반복 피크 ' + T(q).Tpeak + ' · 순간 최대 ' + T(q).Temerg],
      ['예측 정격 (판정 기준)', +fx(r.score.cap, 3), 'N·m', '감속기 한계 (기어·베어링·핀·결합 중 최소)'],
      ['기어 정격 ISO', r.band ? +fx(r.band.iso, 3) : '', 'N·m', ''], ['기어 정격 오차 0', r.band ? +fx(r.band.ideal, 3) : '', 'N·m', '참고값'],
      ['외경', +fx(r.score.OD, 2), 'mm', '한계 ' + T(q).Dmax], ['길이', +fx(r.score.L, 2), 'mm', '한계 ' + T(q).Lmax],
      ['질량 (추정)', +fx(r.score.mass * 1000, 0), 'g', ''], ['수명 확인', r.life?.text || '', '', ''],
      ['남은 미달', (r.short || []).map(s => s.k).join(' · ') || '없음', '', ''], ['권장 미충족', (r.advice || []).map(s => s.k).join(' · ') || '없음', '', ''],
      ['안전율 기준', 'SH ≥ 1.0 · SF ≥ 1.4 · 정적 1.0 / 1.2', '', '사용자 결정 SF-1'], ['계산 시간', +fx(r.ms / 1000, 1), 's', ''],
      [], ['의뢰 조건', '', '', ''], ['ID', '항목', '값', '단위 · 구분'], ...req.map(x => [x[0], x[1], x[2], [x[3], x[4]].filter(Boolean).join(' · ')]),
      [], ['가정 (빈칸)', '', '', ''], ...(q.assumptions || []).map(a => [a.id, a.msg])];
    const gearHead = ['단', '부품', '잇수 z', '모듈 mn', '압력각 αn °', '비틀림각 β °', '전위 x', '기준원 d', '이끝원 da', '이뿌리원 df', '치폭 b', '정밀도', '수량', '재료 · 열처리', 'SH (정격)', 'SF (정격)'];
    const gears = [gearHead, ...(r.gears || []).map(g => [g.stage, g.part, g.z, g.mn, g.alpha, g.beta, g.x, g.d, g.da, g.df, g.b, g.grade, g.qty, g.material, g.SH, g.SF])];
    const bom = [['No', '부품', '수량', '재질', '열처리', '질량 g', '판정'], ...(r.bom || []).map(b => [b.no ?? '', b.name, b.qty, b.material || '', b.heat || '', b.massG, b.verdict || ''])];
    const ver = [['판정 항목', '값', '기준', '판정'], ...(r.R?.verdict || []).map(v => [v.k, typeof v.value === 'number' ? +v.value.toFixed(4) : (v.val ?? ''), v.target ?? '', v.ok ? '충족' : '미달'])];
    const log = [['구분', '항목', '값', '이유', '근거'], ...(r.log || []).map(l => [l.kind, l.key, String(l.value ?? ''), l.why || '', l.basis || ''])];
    return [{ name: '요약', rows: sum, widths: [22, 44, 10, 40], head: [0, 15, 16, 16 + req.length + 2] },
      { name: '기어 제원', rows: gears, widths: [5, 8, 7, 8, 10, 11, 8, 10, 10, 10, 8, 7, 6, 18, 9, 9] },
      { name: 'BOM', rows: bom, widths: [5, 28, 6, 14, 14, 9, 40] }, { name: '판정', rows: ver, widths: [40, 12, 10, 8] },
      { name: '결정 기록', rows: log, widths: [8, 30, 40, 50, 40] }];
  }
  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function bind(m, hooks) {
    S.hooks = hooks;
    const refreshCheck = () => { const q = parse(); m.querySelector('#rqCheck').innerHTML = checkHTML(q); const b = m.querySelector('#rqRun'); if (b) b.disabled = !q.ok || S.busy;
      m.querySelectorAll('[data-rq]').forEach(el => { const e = q.errors.find(x => x.id === el.dataset.rq), lab = el.closest('label'); lab.classList.toggle('ferr', !!e); const sm = lab.querySelector('small.bad'); if (sm) sm.remove(); if (e) lab.insertAdjacentHTML('beforeend', `<small class="bad">${esc(e.msg)}</small>`); }); };
    m.querySelectorAll('[data-rq]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { const v = el.value.trim(); if (v === '') delete S.cells[el.dataset.rq]; else S.cells[el.dataset.rq] = v; save(); refreshCheck(); }));
    m.querySelector('#rqExample').onclick = () => { S.cells = { ...EXAMPLE }; S.msg = ''; save(); hooks.render(); };
    m.querySelector('#rqClear').onclick = () => { S.cells = {}; S.msg = ''; save(); hooks.render(); };
    m.querySelector('#rqBasis').onchange = e => { S.basis = e.target.value; save(); };
    m.querySelector('#rqFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const res = await Q().readXlsx(await f.arrayBuffer()); const c = {}; Q().FIELDS.forEach(x => { if (res.cells[x.id] !== undefined && res.cells[x.id] !== '') c[x.id] = res.cells[x.id]; });
        S.cells = c; S.msg = `${f.name} 불러옴 · ${res.ok ? '정상' : '확인 필요 ' + res.errors.length + '건'}${res.errors.find(x => x.id === 'FORMAT') ? ' (양식 버전 확인)' : ''}`; }
      catch (err) { S.msg = `${f.name}: ${err.message}`; }
      save(); hooks.render();
    };
    m.querySelector('#rqRun').onclick = async () => {
      const q = parse(); if (!q.ok || S.busy) return;
      S.busy = true; const btn = m.querySelector('#rqRun'), prog = m.querySelector('#rqProg'); btn.disabled = true;
      const t0 = Date.now();
      try {
        const r = await A().run(q, Object.assign({ basis: S.basis }, hooks.env()), (msg, pct) => { if (prog) prog.textContent = `${msg} · ${Math.round(pct || 0)} % · ${((Date.now() - t0) / 1000).toFixed(0)} s`; });
        r.q = q; r.basis = S.basis; S.run = r;
      } catch (err) { S.run = { status: 'none', error: '계산 오류: ' + err.message, ms: Date.now() - t0 }; }
      S.busy = false; hooks.render();
      const res = document.querySelector('#rqResult'); if (res) res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const r = S.run; if (!r || !r.D) return;
    m.querySelector('#rqApply').onclick = () => hooks.apply(JSON.parse(JSON.stringify(r.D)));
    m.querySelector('#rqXlsx').onclick = () => { const name = (r.q.meta.client || r.D.name || '자동설계').replace(/[\\/:*?"<>|]/g, '_'); download(Q().writeXlsx(sheetsOf(r)), `자동설계결과_${name}_${new Date().toISOString().slice(0, 10)}.xlsx`); };
    m.querySelector('#rqSave').onclick = () => { hooks.saveCase(r.D, r.R); m.querySelector('#rqSaved').textContent = '설계 DB(내 케이스)에 저장했습니다.'; };
    m.querySelectorAll('[data-rqopen]').forEach(b => b.onclick = () => hooks.open(b.dataset.rqopen));
  }
  root.PGDRequestUI = { html, bind, sheetsOf, state: () => S };
})(typeof globalThis !== 'undefined' ? globalThis : this);
