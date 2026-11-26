/* 설계 의뢰 화면 (globalThis.PGDRequestUI) — 베어링 기준 자동 설계 (사용자 결정 2026-11-26 AD-2)
   감속비 → 출력 베어링 형번 → 목표 출력 토크 (C0) → 2단 링 피치원 ≈ 롤러 피치원 → 2단 → 1단 → 1·2단 토크 밸런스 → 5안 비교 → 고른 안을 사이트에서 편집.
   판정 기준: ISO 6336:2019 (KISSsoft 방식) 기본, 오차 0은 옵션. 기본 안전율 SH ≥ 1.0 · SF ≥ 1.4 (SF-1). */
(function (root) {
  'use strict';
  const KEY = 'pgd-request-v2';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fx = (x, d = 1) => Number.isFinite(+x) && x !== null && x !== '' ? (+x).toFixed(d) : '—';
  const EXAMPLE = { M1: '예시', I7: 25, B1: 'THK RU42', G1: 3, O1: 'N', O2: 'N', I3: 3000, I11: 20000 };
  const GROUPS = [['의뢰 정보', ['M1', 'M2', 'M3', 'M4']], ['감속비 · 출력 베어링 · 구조', ['I7', 'B1', 'G1', 'O1', 'O2', 'O3']],
    ['운전 · 수명 · 외력', ['I3', 'I10', 'I11', 'I12a', 'I12b', 'I12c']], ['토크 산출 계수 (보통 빈칸)', ['K1', 'K2']]];
  const S = { cells: null, basis: 'iso', run: null, pick: 0, busy: false, msg: '' };
  const load = () => { try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.cells) { S.cells = j.cells; S.basis = j.basis || 'iso'; } } catch (e) { } if (!S.cells) S.cells = { ...EXAMPLE }; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ cells: S.cells, basis: S.basis })); } catch (e) { } };
  load();
  const Q = () => root.PGDRequest, BF = () => root.PGDBearingFirst, AD = () => root.PGDAutoDesign;
  const parse = () => Q().parseBF(S.cells);
  const yes = v => /^(y|yes|예|true|1)$/i.test(String(v ?? '').trim());

  function bearingSelect(f, v) {
    const L = BF().bearingList().filter(b => b.C0 > 0), cur = BF().findBearing(v);
    const groups = {}; L.forEach(b => { (groups[`${b.maker} ${b.series}`] ||= []).push(b); });
    return `<select data-rq="${f.id}"><option value="">형번 선택</option>${Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(b => { const k = BF().bearingKey(b); return `<option value="${esc(k)}"${cur && BF().bearingKey(cur) === k ? ' selected' : ''}>${esc(k)} · Ø${b.d}×Ø${b.D}×${b.B} · C0 ${b.C0}</option>`; }).join('')}</optgroup>`).join('')}</select>`;
  }
  function fieldHTML(f, q) {
    const v = S.cells[f.id] ?? '', err = q.errors.find(e => e.id === f.id);
    const ph = f.blank ? `빈칸 = ${f.blank}` : f.need === 'Y' ? '필수' : '';
    const lab = `${esc(f.label)}${f.unit && f.type !== 'yn' ? ` <small>${esc(f.unit)}</small>` : ''} <small class="note">${f.id}${f.need === 'Y' ? ' · 필수' : ''}</small>`;
    if (f.type === 'yn') return `<label class="f sw${err ? ' ferr' : ''}"><span>${lab}</span><input type="checkbox" data-rqyn="${f.id}"${yes(v) ? ' checked' : ''}> ${yes(v) ? '켬' : '끔'}${err ? `<small class="bad">${esc(err.msg)}</small>` : ''}</label>`;
    const input = f.type === 'bearing' ? bearingSelect(f, v)
      : `<input data-rq="${f.id}" type="text" inputmode="${f.type === 'num' ? 'decimal' : 'text'}" value="${esc(v)}" placeholder="${esc(ph)}">`;
    return `<label class="f${err ? ' ferr' : ''}">${lab}${input}${err ? `<small class="bad">${esc(err.msg)}</small>` : ''}</label>`;
  }
  function formHTML(q) {
    const by = Object.fromEntries(Q().FIELDS_BF.map(f => [f.id, f]));
    return GROUPS.map(([t, ids]) => `<h4 class="rq-g">${t}</h4><div class="grid">${ids.map(id => fieldHTML(by[id], q)).join('')}</div>`).join('');
  }
  function checkHTML(q) {
    if (!q.ok) return `<p class="bad"><b>의뢰서 확인 필요 ${q.errors.length}건</b> — ${q.errors.map(x => esc(x.msg)).join(' · ')}</p>`;
    const b = q.bearing, d = q.derived;
    return `<p class="good"><b>의뢰서 정상</b> — ${esc(BF().bearingKey(b))} (Ø${b.d}×Ø${b.D}×${b.B}, dp ${fx(d.dp, 2)}, C0 ${b.C0} N) → 허용 모멘트 M0 ${fx(d.M0, 1)} N·m → <b>목표 출력 토크 ${fx(d.T, 2)} N·m</b> (κ ${q.kappa}) · 출력 ${fx(d.nOut, 1)} rpm</p>
      ${q.assumptions.length ? `<details><summary class="note">빈칸으로 둔 항목의 가정 ${q.assumptions.length}건</summary><ul class="note">${q.assumptions.map(a => `<li>${a.id}: ${esc(a.msg)}</li>`).join('')}</ul></details>` : ''}`;
  }

  // ---- 결과: 5안 비교 → 선택 → 상세
  const TYPE = { one: '1단', shared: '2단 링 공유', sep: '2단 링 분리' };
  const zs = o => `m${o.m} · ${o.s}/${o.p}/${o.R}`;
  const xs = o => o.profile ? `${fx(o.profile.xs, 2)}/${fx(o.profile.xp, 2)}/${fx(o.profile.xr, 2)}` : '0';
  function compareHTML(r) {
    const T = r.spec.T;
    return `<div class="card scroll"><h3>비교 ${r.top.length}안 <small class="note">목표 출력 토크 ${fx(T, 2)} N·m · ${fx(r.ms / 1000, 1)} s · 조합 ${r.searched}개 → 정밀 계산 ${r.checked}개 · 판정 기준 ${r.spec.basis === 'ideal' ? '오차 0 (옵션)' : 'ISO 6336:2019'}</small></h3>
      <table class="dbt rq-cmp"><tr><th></th><th class="l">구성</th><th class="l">1단 (m · S/P/R)</th><th class="l">2단 (m · S/P/R)</th><th>전위 S/P/R</th><th>치폭 b1 / b2</th><th>외경 (2단 링)</th><th>1단 링 외경</th><th>길이</th><th>감속비</th><th>한계 토크</th><th>목표 대비</th><th>단별 한계 1 / 2</th><th>밸런스</th><th>질량 g</th><th class="l">지배</th><th></th></tr>
      ${r.top.map((x, k) => { const st = x.stages, two = st.length > 1; return `<tr class="${k === S.pick ? 'gov' : ''}"><td><b>${x.rank}</b></td><td class="l">${TYPE[x.type]}</td><td class="l">${two ? zs(st[0]) : '—'}</td><td class="l">${zs(st[st.length - 1])}</td>
        <td>${st.map(xs).join(' · ')}</td><td>${x.bs.join(' / ')}</td><td>Ø${fx(x.OD, 1)}</td><td>${two ? 'Ø' + fx(x.ring1, 1) : '—'}</td><td>${fx(x.L, 1)}</td><td>${fx(x.ratio, 3)}</td>
        <td><b>${fx(x.cap, 2)}</b></td><td class="${x.cap >= T ? 'good' : 'bad'}">${fx(100 * x.cap / T, 0)} %</td><td>${x.stageCap.map(v => fx(v, 2)).join(' / ')}</td><td>${fx(x.balance, 2)}</td><td>${fx(x.mass * 1000, 0)}</td>
        <td class="l note rq-gov" title="${esc(x.gov || '')}">${esc(x.gov || '')}</td><td><button class="btn${k === S.pick ? ' primary' : ''}" data-rqpick="${k}">${k === S.pick ? '선택됨' : '선택'}</button></td></tr>`; }).join('')}</table>
      <p class="note">외경 = 2단 링기어 림 포함 외경 · 길이 = 1단 치폭 + 캐리어 간격 ${r.spec.gap} mm + 2단 치폭 · 한계 토크 = 기어 · 베어링 · 핀 중 최소 (정격 수명 ${r.spec.lifeH} h, ${r.spec.rpm} rpm) · 밸런스 = 단별 한계 최소 / 최대 (1에 가까울수록 고름).
      목표 출력 토크는 출력 베어링 허용 모멘트 × κ로 정한 값이며, ISO 6336 판정은 소형 저하중 영역에서 실물보다 낮게 나옵니다 (실물 RH065: ISO 2.31 / 시험 28 N·m).</p></div>`;
  }
  function detailHTML(r) {
    const x = r.top[S.pick]; if (!x) return '';
    const gears = AD() ? AD().gearTable(x.R, x.D) : [], bom = AD() ? AD().bom(root.PGD3D, { R: x.R }, x.D) : [];
    const gearRows = gears.map(g => `<tr><td>${g.stage}</td><td class="l">${esc(g.part)}</td><td>${g.z}</td><td>${g.mn}</td><td>${g.beta}</td><td>${fx(g.x, 3)}</td><td>${fx(g.d, 3)}</td><td>${fx(g.da, 3)}</td><td>${fx(g.df, 3)}</td><td>${g.b}</td><td>${g.grade}</td><td>${g.qty}</td><td>${fx(g.SH, 3)}</td><td>${fx(g.SF, 3)}</td></tr>`).join('');
    const bomRows = bom.map(b => `<tr class="${b.ok === false ? 'bad' : ''}"><td>${b.no ?? ''}</td><td class="l">${esc(b.name)}</td><td>${b.qty}</td><td class="l">${esc(b.material || '')}</td><td>${fx(b.massG, 1)}</td><td class="l">${esc(b.verdict)}</td></tr>`).join('');
    const fails = x.fails || [];
    return `<div class="card rq-res"><h3>${esc(x.tag)}</h3>
      <p class="rq-act"><button class="btn primary" id="rqApply">이 안으로 사이트 편집 → 3D · 항목</button> <button class="btn" id="rqXlsx">비교·결과 엑셀 내보내기</button> <button class="btn" id="rqSave">설계 DB에 저장</button> <span class="note" id="rqSaved"></span></p>
      ${fails.length ? `<p class="bad">판정 미달 ${fails.length}건: ${fails.map(esc).join(' · ')}</p>` : '<p class="good">판정 항목 모두 충족</p>'}
      <div class="scroll"><h4 class="rq-g">기어 제원</h4><table class="dbt"><tr><th>단</th><th class="l">부품</th><th>z</th><th>mn</th><th>β°</th><th>x</th><th>d</th><th>da</th><th>df</th><th>b</th><th>등급</th><th>수량</th><th>SH</th><th>SF</th></tr>${gearRows}</table></div>
      <div class="scroll"><h4 class="rq-g">BOM</h4><table class="dbt"><tr><th>No</th><th class="l">부품</th><th>수량</th><th class="l">재질</th><th>질량 g</th><th class="l">판정</th></tr>${bomRows}</table></div></div>`;
  }
  function resultHTML(r) {
    if (!r) return '';
    if (r.status === 'input') return `<div class="card"><h3 class="bad">의뢰서 오류</h3><p>${esc((r.errors || []).map(e => e.msg).join(' · '))}</p></div>`;
    if (r.status === 'none') return `<div class="card"><h3 class="bad">설계안 없음</h3><p>${esc(r.error)}</p></div>`;
    const log = (r.log || []).map(l => `<tr><td>${esc(l.kind)}</td><td class="l">${esc(l.key)}</td><td class="l">${esc(l.value)}</td><td class="l">${esc(l.why || '')}</td><td class="l note">${esc(l.basis || '')}</td></tr>`).join('');
    return compareHTML(r) + detailHTML(r) + `<details class="card"><summary><b>결정 기록 ${(r.log || []).length}건</b></summary><div class="scroll"><table class="dbt"><tr><th>구분</th><th class="l">항목</th><th class="l">값</th><th class="l">이유</th><th class="l">근거</th></tr>${log}</table></div></details>`;
  }

  function html() {
    const q = parse();
    return `<h2>설계 의뢰 → 자동 설계 (베어링 기준)</h2><p class="lead">감속비와 출력 베어링을 정하면, 베어링에 맞는 출력 토크를 정하고 2단 링기어를 베어링 롤러 피치원에 맞춘 뒤 2단 → 1단 제원과 1·2단 토크 밸런스를 잡아 5안을 비교합니다. 고른 안은 사이트에서 바로 편집합니다.</p>
      <div class="card"><h3>1. 의뢰서</h3>
        <p><a class="btn" href="templates/${encodeURIComponent('설계의뢰서_' + Q().FORMAT_BF + '.xlsx')}" download>엑셀 의뢰서 양식 받기</a>
          <label class="btn" for="rqFile">엑셀 의뢰서 불러오기</label><input type="file" id="rqFile" accept=".xlsx" class="rq-file">
          <button class="btn" id="rqExample">예시로 채우기</button> <button class="btn" id="rqClear">비우기</button> <span class="note" id="rqFileMsg">${esc(S.msg)}</span></p>
        ${formHTML(q)}
        <div id="rqCheck">${checkHTML(q)}</div></div>
      <div class="card"><h3>2. 자동 설계</h3>
        <div class="grid"><label class="f">판정 기준<select id="rqBasis"><option value="iso"${S.basis === 'iso' ? ' selected' : ''}>ISO 6336:2019 (KISSsoft 방식) · 기본</option><option value="ideal"${S.basis === 'ideal' ? ' selected' : ''}>이론 (오차 0) · 옵션</option></select></label></div>
        <p><button class="btn primary" id="rqRun" ${q.ok && !S.busy ? '' : 'disabled'}>자동 설계 실행</button> <span class="note" id="rqProg">${S.busy ? '계산 중…' : '보통 5~30초'}</span></p>
        <p class="note">설계 규칙: 모듈 ${BF().RULE.mods.join('·')} · β ${BF().RULE.beta}° · 유성 ${BF().RULE.n}개 · 단 감속비 ${BF().RULE.stageRatio.join('~')} · 2단 링 피치원 ≥ 롤러 피치원 근처 · 치폭 ${BF().RULE.bMin} mm ~ 작은 기어 피치원 × ${BF().RULE.bPerD1} · ${BF().RULE.grade}급 (미달 시 5급) · 침탄 연삭 (이온질화 옵션) · 2단 링 외경 ≤ 베어링 외경 · SH ≥ 1.0 · SF ≥ 1.4</p></div>
      <div id="rqResult">${resultHTML(S.run)}</div>`;
  }

  function sheetsOf(r) {
    const q = r.q, F = Q().FIELDS_BF, T = r.spec.T;
    const req = F.map(f => [f.id, f.label, f.type === 'bearing' ? (q.bearing ? BF().bearingKey(q.bearing) : '') : f.type === 'yn' ? (q.input[f.key] ? 'Y' : 'N') : (q.input[f.key] ?? ''), f.unit, q.given[f.key] ? '입력' : '가정']);
    const cmp = [['안', '구성', '1단', '2단', '전위 S/P/R', 'b1', 'b2', '외경 (2단 링)', '1단 링 외경', '길이', '감속비', '한계 토크 N·m', '목표 대비 %', '1단 한계', '2단 한계', '밸런스', '질량 g', '지배'],
      ...r.top.map(x => { const st = x.stages, two = st.length > 1; return [x.rank, TYPE[x.type], two ? zs(st[0]) : '', zs(st[st.length - 1]), st.map(xs).join(' · '), two ? x.bs[0] : '', x.bs[x.bs.length - 1], +fx(x.OD, 2), two ? +fx(x.ring1, 2) : '', +fx(x.L, 2), +fx(x.ratio, 4), +fx(x.cap, 3), +fx(100 * x.cap / T, 1), +fx(x.stageCap[0], 3), two ? +fx(x.stageCap[1], 3) : '', +fx(x.balance, 3), +fx(x.mass * 1000, 0), x.gov || '']; })];
    const sum = [['항목', '값', '단위', '비고'], ['출력 베어링', BF().bearingKey(q.bearing), '', `d ${q.bearing.d} × D ${q.bearing.D} × B ${q.bearing.B} · C0 ${q.bearing.C0} N`],
      ['허용 모멘트 M0', +fx(r.bt.M0, 2), 'N·m', `C0·dp/(2000·s0), s0 ${r.bt.s0}`], ['목표 출력 토크', +fx(T, 3), 'N·m', `κ ${r.bt.kappa} × M0`], ['선택안', r.top[S.pick]?.tag || '', '', ''],
      ['판정 기준', r.spec.basis === 'ideal' ? '이론 (오차 0, 옵션)' : 'ISO 6336:2019 (KISSsoft 방식)', '', 'SH ≥ 1.0 · SF ≥ 1.4'], [], ['의뢰 조건', '', '', ''], ['ID', '항목', '값', '단위 · 구분'], ...req.map(x => [x[0], x[1], x[2], [x[3], x[4]].filter(Boolean).join(' · ')]),
      [], ['가정 (빈칸)', '', '', ''], ...(q.assumptions || []).map(a => [a.id, a.msg])];
    const x = r.top[S.pick], gears = x && AD() ? AD().gearTable(x.R, x.D) : [], bom = x && AD() ? AD().bom(root.PGD3D, { R: x.R }, x.D) : [];
    const g = [['단', '부품', '잇수 z', '모듈 mn', '비틀림각 β °', '전위 x', '기준원 d', '이끝원 da', '이뿌리원 df', '치폭 b', '정밀도', '수량', 'SH (정격)', 'SF (정격)'], ...gears.map(e => [e.stage, e.part, e.z, e.mn, e.beta, e.x, e.d, e.da, e.df, e.b, e.grade, e.qty, e.SH, e.SF])];
    const b = [['No', '부품', '수량', '재질', '질량 g', '판정'], ...bom.map(e => [e.no ?? '', e.name, e.qty, e.material || '', e.massG, e.verdict || ''])];
    const log = [['구분', '항목', '값', '이유', '근거'], ...(r.log || []).map(l => [l.kind, l.key, String(l.value ?? ''), l.why || '', l.basis || ''])];
    return [{ name: '요약', rows: sum, widths: [22, 44, 10, 44], head: [0, 7, 8] }, { name: '비교 5안', rows: cmp, widths: [5, 12, 18, 18, 20, 6, 6, 10, 10, 8, 9, 11, 10, 9, 9, 8, 8, 40] },
      { name: '기어 제원 (선택안)', rows: g, widths: [5, 8, 7, 8, 11, 8, 10, 10, 10, 8, 7, 6, 9, 9] }, { name: 'BOM (선택안)', rows: b, widths: [5, 32, 6, 14, 9, 40] }, { name: '결정 기록', rows: log, widths: [8, 24, 60, 40, 40] }];
  }
  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function bind(m, hooks) {
    S.hooks = hooks;
    const refreshCheck = () => { const q = parse(); m.querySelector('#rqCheck').innerHTML = checkHTML(q); const b = m.querySelector('#rqRun'); if (b) b.disabled = !q.ok || S.busy;
      m.querySelectorAll('[data-rq],[data-rqyn]').forEach(el => { const id = el.dataset.rq || el.dataset.rqyn, e = q.errors.find(x => x.id === id), lab = el.closest('label'); lab.classList.toggle('ferr', !!e); const sm = lab.querySelector('small.bad'); if (sm) sm.remove(); if (e) lab.insertAdjacentHTML('beforeend', `<small class="bad">${esc(e.msg)}</small>`); }); };
    m.querySelectorAll('[data-rq]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { const v = el.value.trim(); if (v === '') delete S.cells[el.dataset.rq]; else S.cells[el.dataset.rq] = v; save(); refreshCheck(); }));
    m.querySelectorAll('[data-rqyn]').forEach(el => el.addEventListener('change', () => { S.cells[el.dataset.rqyn] = el.checked ? 'Y' : 'N'; save(); el.nextSibling.textContent = el.checked ? ' 켬' : ' 끔'; refreshCheck(); }));
    m.querySelector('#rqExample').onclick = () => { S.cells = { ...EXAMPLE }; S.msg = ''; save(); hooks.render(); };
    m.querySelector('#rqClear').onclick = () => { S.cells = {}; S.msg = ''; save(); hooks.render(); };
    m.querySelector('#rqBasis').onchange = e => { S.basis = e.target.value; save(); };
    m.querySelector('#rqFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const res = await Q().readXlsx(await f.arrayBuffer(), { format: 'bf' }); const c = {}; Q().FIELDS_BF.forEach(x => { if (res.cells[x.id] !== undefined && res.cells[x.id] !== '') c[x.id] = res.cells[x.id]; });
        S.cells = c; S.msg = `${f.name} 불러옴 · ${res.ok ? '정상' : '확인 필요 ' + res.errors.length + '건'}${res.errors.find(x => x.id === 'FORMAT') ? ' (양식 버전 확인)' : ''}`; }
      catch (err) { S.msg = `${f.name}: ${err.message}`; }
      save(); hooks.render();
    };
    m.querySelector('#rqRun').onclick = async () => {
      const q = parse(); if (!q.ok || S.busy) return;
      S.busy = true; const btn = m.querySelector('#rqRun'), prog = m.querySelector('#rqProg'); btn.disabled = true;
      const t0 = Date.now();
      try {
        const r = await BF().run(q, Object.assign({ basis: S.basis }, hooks.env()), (msg, pct) => { if (prog) prog.textContent = `${msg} · ${Math.round(pct || 0)} % · ${((Date.now() - t0) / 1000).toFixed(0)} s`; });
        r.q = q; S.run = r; S.pick = 0;
      } catch (err) { S.run = { status: 'none', error: '계산 오류: ' + err.message, ms: Date.now() - t0 }; }
      S.busy = false; hooks.render();
      const res = document.querySelector('#rqResult'); if (res) res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const r = S.run; if (!r || !r.top) return;
    m.querySelectorAll('[data-rqpick]').forEach(b => b.onclick = () => { S.pick = +b.dataset.rqpick; hooks.render(); });
    const x = r.top[S.pick]; if (!x) return;
    m.querySelector('#rqApply').onclick = () => hooks.apply(JSON.parse(JSON.stringify(x.D)));
    m.querySelector('#rqXlsx').onclick = () => { const name = (r.q.meta.client || '자동설계').replace(/[\\/:*?"<>|]/g, '_'); download(Q().writeXlsx(sheetsOf(r)), `자동설계결과_${name}_${new Date().toISOString().slice(0, 10)}.xlsx`); };
    m.querySelector('#rqSave').onclick = () => { hooks.saveCase(x.D, x.R); m.querySelector('#rqSaved').textContent = '설계 DB(내 케이스)에 저장했습니다.'; };
  }
  root.PGDRequestUI = { html, bind, sheetsOf, state: () => S };
})(typeof globalThis !== 'undefined' ? globalThis : this);
