/* Planetary Gear Designer — UI */
{
const E = window.PGD;
const $ = s => document.querySelector(s);
const fmt = (x, n = 2) => Number.isFinite(x) ? x.toFixed(n) : (x === Infinity ? '∞' : '—');
const fmtH = h => !Number.isFinite(h) ? (h === Infinity ? '∞' : '—') : h >= 1e6 ? (h / 1e6).toFixed(1) + 'M' : h >= 1e4 ? (h / 1e3).toFixed(0) + 'k' : h.toFixed(0);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'pgd-design-v1';
let D = load(), R = null, MC = null, SENS = null, view = 'overview', worker = null, jobId = 0;

function fillMissing(dst, src) { for (const k in src) { if (dst[k] === undefined || dst[k] === null && src[k] !== null && typeof src[k] === 'object') dst[k] = JSON.parse(JSON.stringify(src[k])); else if (Array.isArray(src[k]) && Array.isArray(dst[k])) { dst[k].forEach((v, i) => { if (v && typeof v === 'object' && src[k][i] && typeof src[k][i] === 'object' && !Array.isArray(v)) fillMissing(v, src[k][i]); }); } else if (src[k] && typeof src[k] === 'object' && dst[k] && typeof dst[k] === 'object') fillMissing(dst[k], src[k]); } return dst; }
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.schema === 'pgd/1') { s.config.floatingSun = false; return fillMissing(s, E.defaultDesign()); } } catch (e) { } return E.defaultDesign(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { } }
const get = p => p.split('.').reduce((o, k) => o?.[k], D);
const set = (p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), D)[last] = v; };

function compute() {
  ensureD();
  if (window.PGDChecks) { PGDChecks.ensure(D); PGDChecks.applyNeedles(D); }
  try { R = E.analyze(D); } catch (e) { R = { errors: ['계산 오류: ' + e.message], warns: [] }; console.error(e); }
  MC = null; SENS = null;
}

// ------------------------------------------------------------------ inputs
function num(path, label, opt = {}) {
  const v = get(path);
  return `<label class="f">${label}<input type="number" step="${opt.step ?? 'any'}" ${opt.min != null ? `min="${opt.min}"` : ''} data-p="${path}" data-t="num" value="${v ?? ''}" ${opt.disabled ? 'disabled' : ''}></label>`;
}
function sel(path, label, options, opt = {}) {
  const v = String(get(path));
  return `<label class="f">${label}<select data-p="${path}" data-t="${opt.type || 'str'}" ${opt.disabled ? 'disabled' : ''}>${options.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}
function chk(path, label) { return `<label class="c"><input type="checkbox" data-p="${path}" data-t="bool" ${get(path) ? 'checked' : ''}> ${label}</label>`; }
function bindInputs(root) {
  root.querySelectorAll('[data-p]').forEach(elm => elm.addEventListener('change', () => {
    const t = elm.dataset.t; let v = elm.value;
    if (t === 'num') { v = elm.value === '' ? null : Number(elm.value); }
    else if (t === 'int') v = parseInt(v, 10);
    else if (t === 'bool') v = elm.checked;
    else if (t === 'numsel') v = Number(v);
    set(elm.dataset.p, v);
    changed();
  }));
}
function changed() { save(); compute(); renderRail(); renderVerdict(); render(true); }

// ------------------------------------------------------------------ rail & verdict
const STEPS = [
  ['overview', '', '1. 종합판정'], ['proc', '', '설계 공정'], ['map', '', '설계 지도'],
  ['s1', '정의', '2. 요구사양'], ['s2', '', '3. 구성–감속비'],
  ['s3', '기어설계', '4. 제원–형상'], ['s4', '', '5. 치형 검사'], ['s5', '', '6. 정밀도–치형 수정'],
  ['s7', '구조 해석–강도', '7. 하중 계수'], ['s8', '', '8. 기어 강도'], ['s9', '', '9. 베어링'], ['scar', '', '10. 캐리어–핀'],
  ['shous', '', '11. 하우징–커버·부품 형상'], ['smat', '', '12. 소재'],
  ['s10', '검증', '13. 성능 예측'], ['s11', '', '14. 가상 검증'], ['reg', '', '15. 가정 대장'], ['out', '', '출력물·가공·원가']
];
function status(id) {
  if (!R || R.errors?.length) return ['s3', 's4', 'overview'].includes(id) ? 'bad' : '';
  const v = Object.fromEntries(R.verdict.map(x => [x.k, x.ok]));
  const geoWarn = R.ctx.stages.some(s => s.geo.warns.length || s.geo.checks.some(c => !c.ok));
  switch (id) {
    case 'overview': return R.verdict.every(x => x.ok) ? 'ok' : 'bad';
    case 's4': return geoWarn ? 'warn' : 'ok';
    case 'smat': return !v['스커핑 안전율 (피크, 섬광온도)'] ? 'bad' : (R.lube.lambdaMin < 1 || R.ctx.stages.some(s => s.mats.some(m => m.warnings.length))) ? 'warn' : 'ok';
    case 's8': return v['정격 토크 · 목표 수명 (기어)'] && v['부하 스펙트럼 수명 (기어)'] && v['피크 토크 정적 안전율'] ? 'ok' : 'bad';
    case 's9': return v['유성 베어링 L10 (스펙트럼)'] && v['유성 베어링 정적 s0 (피크)'] && v['출력 베어링 L10'] && v['출력 베어링 정적 s0 (피크)'] && v['출력 베어링 롤러 접촉 s0 (피크)'] !== false ? 'ok' : 'bad';
    case 'scar': return v['유성 핀·캐리어 정적 (피크)'] ? 'ok' : 'bad';
    case 's10': return v['효율 (정격, 추정)'] && v['출력 백래시 (추정)'] ? 'ok' : 'warn';
    case 's11': return MC ? (MC.passLife >= .9 ? 'ok' : 'bad') : '';
    default: return '';
  }
}
// ------------------------------------------------------------------ design process (PGDProc)
const VIEW_TITLE = { s1: '요구사양', s2: '구성–감속비', s3: '제원–형상', s4: '치형 검사', s5: '정밀도–치형 수정', s7: '하중 계수', s8: '기어 강도',
  scar: '캐리어–핀', s9: '베어링', shous: '하우징–커버·부품 형상', smat: '소재', s10: '성능 예측', s11: '가상 검증', reg: '가정 대장', out: '출력물·가공·원가' };
function procExtra() {
  const X = { MC };
  try { if (window.PGDChecks && R && !R.errors?.length) X.CK = PGDChecks.compute(R, D, { MC }); } catch (e) { console.error(e); }
  try { if (window.PGD3D && R && !R.errors?.length) { ensureD(); const pl = PGD3D.partsList(R, D); X.parts = pl.length; X.mass = pl.reduce((s, p) => s + (p.mass || 0) * (p.qty || 1), 0) * 1000; } } catch (e) { }
  return X;
}
function procEval() { return window.PGDProc ? PGDProc.evaluate(R, D, procExtra()) : []; }
const gateCls = ok => ok === true ? 'ok' : ok === false ? 'bad' : '';
// one page per process stage: the stage's input/result screens + its item cards, items in order
const STAGE_VIEWS = { 1: ['s1'], 2: ['s2'], 3: ['s3'], 4: ['s4', 's5'], 5: ['s7', 's8'], 6: ['scar'], 7: ['s9'], 8: ['shous'], 9: ['smat'], 10: ['s10'], 11: ['s11', 'reg'], 12: [], D: [] };
const VIEW_STAGE = Object.fromEntries(Object.entries(STAGE_VIEWS).flatMap(([k, vs]) => vs.map(v => [v, k])));
const STAGE_KEYS = Object.keys(STAGE_VIEWS);
const itemStage = id => id.startsWith('D') ? 'D' : id.split('-')[0];
let ANCHOR = null;
function renderRail() {
  const E = procEval(), cur = view.startsWith('st-') ? view.slice(3) : null;
  const top = (id, t) => `<button data-v="${id}" aria-current="${view === id}"><span class="dot ${status(id)}"></span>${t}</button>`;
  $('#rail').innerHTML = top('overview', '종합판정') + top('map', '설계 지도') + top('proc', '설계 공정 전체') + '<div class="grp">설계 단계</div>' +
    E.map(g => { const k = String(g.n), open = k === cur;
      return `<button data-v="st-${k}" class="stg" aria-current="${open}" aria-expanded="${open}"><span class="dot ${gateCls(g.gate.ok)}"></span><span class="sn">${k === 'D' ? 'D' : k}</span>${esc(k === 'D' ? '가공·원가' : g.name)}<small>${g.done}/${g.total}</small></button>` +
        (open ? `<div class="its">${g.items.map(i => `<button data-v="st-${k}" data-a="${i.id}" class="it ${ANCHOR === i.id ? 'on' : ''}"><span class="dot ${i.ok === true ? 'ok' : i.ok === false ? 'bad' : i.kind === 'none' ? '' : 'in'}"></span><span class="iid">${i.id}</span>${esc(i.t)}</button>`).join('')}</div>` : ''); }).join('');
  const items = Object.fromEntries(E.flatMap(g => g.items).map(i => [i.id, i]));
  $('#rail').querySelectorAll('button').forEach(b => b.onclick = () => {
    const a = b.dataset.a, it = a && items[a], k = b.dataset.v.slice(3);
    // an item whose content lives on another stage's screen opens that screen (e.g. 5-9 scuffing → 9 소재)
    if (it && !window.PGDChecks?.FORMS?.[a] && !(STAGE_VIEWS[k] || []).includes(it.view) && it.view) return go(it.view, VIEW_STAGE[it.view] ? a : undefined);
    go(b.dataset.v, a);
  });
}
// legacy screen ids (s1…reg) open their stage page at that screen
function go(id, anchor) {
  if (id === 'out') id = 'st-12';
  if (VIEW_STAGE[id]) { anchor = anchor || 'vw-' + id; id = 'st-' + VIEW_STAGE[id]; }
  view = id; ANCHOR = anchor || null;
  try { history.replaceState(null, '', '#' + id + (anchor ? '/' + anchor : '')); } catch (e) { }
  renderRail(); render(); scrollToAnchor();
}
function scrollToAnchor() {
  if (!ANCHOR) { window.scrollTo(0, 0); return; }
  let el = document.getElementById(ANCHOR.startsWith('vw-') ? ANCHOR : 'it-' + ANCHOR);
  if (!el && !ANCHOR.startsWith('vw-')) { const it = procEval().flatMap(g => g.items).find(i => i.id === ANCHOR); if (it) el = document.getElementById('vw-' + it.view); }
  if (!el) { window.scrollTo(0, 0); return; }
  el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12);
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400);
}
function renderVerdict() {
  const el = $('#verdict');
  if (!R || R.errors?.length) { el.innerHTML = `<div class="kpi"><div class="label">계산 불가</div></div><ul class="warns">${(R?.errors || []).map(e => `<li>${esc(e)}</li>`).join('')}</ul>`; return; }
  const ok = R.verdict.every(x => x.ok);
  el.innerHTML = `
   <div class="kpi"><div class="label">감속기 한계 · ISO 설계 판정 (${D.req.lifeH} h)</div><div class="big ${R.reducerCap < D.req.Trated ? 'bad' : ''}">${fmt(R.reducerCap, 1)}<small> N·m</small></div><div class="note">${esc(R.reducerGov)}</div></div>
   ${MC ? `<div class="kpi"><div class="label">현실 예측 · 중앙값 (P10–P90)</div><div class="big">${fmt(MC.capacity.p50, 1)}<small> N·m</small></div><div class="note">${fmt(MC.capacity.p10, 1)} – ${fmt(MC.capacity.p90, 1)} N·m · 몬테카를로 ${MC.n}회</div></div>` : `<div class="kpi"><div class="label">현실 예측</div><div class="note">11단계 검증에서 가상 검증을 실행하면 표시됩니다.</div></div>`}
   <div class="kpi"><div class="label">목표 정격 ${D.req.Trated} N·m · 판정</div><div class="big ${ok ? 'good' : 'bad'}" style="font-size:28px">${ok ? '전 항목 충족' : R.verdict.filter(x => !x.ok).length + '개 항목 미달'}</div></div>
   <ul>${R.verdict.map(x => `<li><span>${esc(x.k)}</span><b class="${x.ok ? 'good' : 'bad'}">${x.ok ? '✓' : '✗'} ${fmtV(x)}</b></li>`).join('')}</ul>`;
}
function fmtV(x) { return x.unit === 'h' ? fmtH(x.value) + ' h' : fmt(x.value, x.unit === '%' ? 1 : 2) + (x.unit ? ' ' + x.unit : ''); }

// ------------------------------------------------------------------ views
function render(keepScroll) {
  const m = $('#main');
  const y = window.scrollY;
  if (VIEW3D) { if (VIEW3D.full) OVSTATE.view = VIEW3D.getView(); VIEW3D.dispose(); VIEW3D = null; }
  if (MAPV) { MAPSTATE = MAPV.state(); MAPV.dispose(); MAPV = null; }
  m.className = view === 'overview' || view === 'map' ? 'wide' : '';
  document.body.classList.toggle('mapmode', view === 'map');
  if (!keepScroll) { void m.offsetWidth; m.classList.add('pg-enter'); }
  if (view.startsWith('st-')) {
    const k = view.slice(3);
    m.innerHTML = stagePage(k);
    bindInputs(m); bindProcCards(m); bindStagePage(m);
    (STAGE_VIEWS[k] || []).forEach(v => (AFTER[v] || (() => { }))(m));
    if (keepScroll) window.scrollTo(0, y);
    return;
  }
  m.innerHTML = (VIEWS[view] || VIEWS.overview)();
  bindInputs(m);
  (AFTER[view] || (() => { }))(m);
  if (keepScroll) window.scrollTo(0, y);
}
const head = (t, lead) => `<h2>${t}</h2><p class="lead">${lead}</p>`;
const KIND_CLS = { in: 'k-in', calc: 'k-calc', man: 'k-man', none: 'k-none' };
const okMark = ok => ok === true ? '<b class="good">✓</b>' : ok === false ? '<b class="bad">✗</b>' : '<span class="x">–</span>';
// compact list of the process items this screen covers
function procStrip(v) {
  const E = procEval(); if (!E.length) return '';
  const its = PGDProc.viewItems(E, v); if (!its.length) return '';
  return `<details class="pstrip"><summary>이 화면의 설계 공정 항목 <b>${its.map(i => i.id).join(' · ')}</b></summary>
    <ul>${its.map(i => `<li><span class="pid">${i.id}</span>${esc(i.t)}<span class="kchip ${KIND_CLS[i.kind]}">${PGDProc.KIND[i.kind]}</span><span class="pval">${i.val != null ? esc(String(i.val)) : ''}</span>${okMark(i.ok)}</li>`).join('')}</ul></details>`;
}
// ------------------------------------------------------------------ process item cards (checks.js)
function fldHTML([type, path, label, opts, t2], i) {
  const p = path.replace('{i}', i), l = label.replace('{s}', i + 1);
  if (type === 'num') return num(p, l);
  if (type === 'sel') return sel(p, l, opts, t2 ? { type: t2 } : {});
  if (type === 'chk') return chk(p, l);
  if (type === 'str') return `<label class="f">${l}<input type="text" data-p="${p}" data-t="str" value="${esc(get(p) ?? '')}"></label>`;
  return '';
}
function procCards(v) {
  if (!window.PGDChecks || !R || R.errors?.length) return '';
  const F = PGDChecks.FORMS, X = procExtra(), CK = X.CK || {}, E = PGDProc.evaluate(R, D, X);
  const items = Object.fromEntries(E.flatMap(g => g.items).map(i => [i.id, i]));
  const ids = Object.keys(F).filter(id => F[id].view === v);
  if (!ids.length) return '';
  const nst = R.ctx.stages.length;
  return `<h3 style="margin:28px 0 8px">설계 공정 항목 (이 화면)</h3>` + ids.map(id => procCard(id)).join('');
}
function procCard(id) {
  const F = PGDChecks.FORMS, X = procExtra(), CK = X.CK || {}, E = PGDProc.evaluate(R, D, X);
  const it = E.flatMap(g => g.items).find(i => i.id === id) || {}, fm = F[id], ck = CK[id] || {}, nst = R.ctx.stages.length;
  const fields = fm.stage ? Array.from({ length: nst }, (_, i) => fm.f.map(x => fldHTML(x, i)).join('')).join('') : fm.f.map(x => fldHTML(x, 0)).join('');
  return `<div class="card pcx" id="it-${id}"><div class="ph"><h3><span class="pid">${id}</span> ${esc(fm.title)}</h3><span>${it.kind ? `<span class="kchip ${KIND_CLS[it.kind]}">${PGDProc.KIND[it.kind]}</span>` : ''} ${okMark(it.ok ?? ck.ok)}</span></div>
    ${fields ? `<div class="grid g4">${fields}</div>` : ''}
    <p class="pres">${esc(ck.val ?? it.val ?? '—')}</p>${ck.html || ''}${extraHTML(id, ck)}</div>`;
}
function extraHTML(id, ck) {
  const tbl = (head, rows) => `<table class="ptbl"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
  if (id === '3-6' && ck.req) return tbl(['단', '현재 m', '필요 m', '지배', '규격'], ck.req.filter(Boolean).map((q, i) => [`${i + 1}단`, q.m, fmt(q.mr, 3), q.mode, `<b class="${q.m >= q.mr ? 'good' : 'bad'}">${q.std}</b>`]));
  if (id === '7-2' && ck.res) return tbl(['단', 'Dw×Lw', 'Z (최대)', 'C / C0 N', '경도 보정', '유성 보어', '유성 림'], ck.res.map((r, i) => r ? [`${i + 1}단`, `${r.Dw}×${fmt(r.Lw, 1)}`, `${r.Z} (${r.Zmax})`, `${fmt(r.C, 0)} / ${fmt(r.C0, 0)}`, `×${fmt(r.fH, 2)}`, `Ø${fmt(r.bore, 2)}`, `<b class="${r.rimOk ? 'good' : 'bad'}">${fmt(r.rim, 2)}</b>`] : [`${i + 1}단`, '기성', '', '', '', '', '']));
  if (id === 'D4' && ck.th) return tbl(['부위', '두께 mm', '최소 mm', ''], ck.th.map(([n, v, mn]) => [n, fmt(v, 2), fmt(mn, 2), v >= mn - 1e-3 ? '<b class="good">✓</b>' : '<b class="bad">✗</b>']));
  if (id === 'D5' && ck.cost) return tbl(['부품', '소재', '가공', '열처리', '합계 원'], ck.cost.items.map(x => [esc(x.name), Math.round(x.material).toLocaleString('ko-KR'), Math.round(x.mach).toLocaleString('ko-KR'), Math.round(x.heat).toLocaleString('ko-KR'), `<b>${Math.round(x.total).toLocaleString('ko-KR')}</b>`])) + '<p class="note">가공 시간·셋업·열처리 단가는 가정값입니다. 견적 단가로 바꾸면 순위와 합계가 바로 갱신됩니다.</p>';
  if (id === 'D6' && ck.sug) return ck.sug.length ? `<ul class="sug">${ck.sug.map(s => `<li>${esc(s.t)} <span class="x">약 ${s.v.toLocaleString('ko-KR')} 원/대 절감</span></li>`).join('')}</ul><p class="note">절감안을 적용하면 강도·공차가 바뀔 수 있으니 해당 단계로 돌아가 재검토하세요.</p>` : '';
  if (id === '12-2') return `<div class="row"><button class="btn" data-copy="sw">솔리드웍스 전역변수 복사</button><button class="btn" data-copy="cq">CadQuery 스크립트 복사</button><span class="x" id="copyMsg"></span></div><details><summary class="x">미리보기</summary><pre class="code">${esc(swVars())}</pre></details>`;
  if (id === '12-4') return datasheetHTML();
  if (id === '12-5') return `<ul class="sug">${Object.entries({ '링–하우징': D.struct.ringHousing, 'C1–S2': D.struct.c1s2, 'S1–모터축': D.struct.s1motor, 'C1 지지': D.struct.c1Support, '출력 베어링 위치': D.struct.obPos }).map(([k, v]) => `<li>${k}: <b>${esc(v)}</b></li>`).join('')}<li>가정 대장 ${R.register?.length || 0}개 — <a href="#reg">가정 대장 화면</a></li></ul>`;
  return '';
}
function datasheetHTML() {
  const X = procExtra(), ck = X.CK || {}, v = k => R.verdict.find(x => x.k === k);
  const rows = [['감속비', `${fmt(R.ratio, 3)} : 1`], ['정격 토크 (ISO 설계 판정)', `${fmt(R.reducerCap, 2)} N·m`], ['현실 예측 P50', MC ? `${fmt(MC.capacity.p50, 1)} N·m` : '가상 검증 실행 후'], ['피크 정적 안전율', fmtV(v('피크 토크 정적 안전율'))],
    ['효율 (정격)', fmtV(v('효율 (정격, 추정)'))], ['백래시', fmtV(v('출력 백래시 (추정)'))], ['비틀림 강성', `${fmt(R.stiffness?.NmPerArcmin, 1)} N·m/arcmin`], ['출력 베어링 L10', fmtV(v('출력 베어링 L10'))],
    ['외경 × 길이', ck['1-6'] ? `Ø${fmt(ck['1-6'].Dout, 1)} × ${fmt(ck['1-6'].Lt, 1)} mm` : '—'], ['중량', X.mass ? `${fmt(X.mass, 0)} g` : '—'], ['정격 운전 온도', ck['10-6'] ? `${fmt(ck['10-6'].T, 1)} °C` : '—'], ['추정 원가', ck.D5?.cost ? `${Math.round(ck.D5.cost.total).toLocaleString('ko-KR')} 원/대` : '—']];
  return `<table class="ptbl ds">${rows.map(([k, x]) => `<tr><th>${k}</th><td>${x}</td></tr>`).join('')}</table>`;
}
function swVars() {
  const L = window.PGD3D ? PGD3D.layout(R, D) : null, out = [];
  R.ctx.stages.forEach((s, i) => { const n = i + 1, st = s.st; out.push(`"m${n}" = ${st.m}`, `"zs${n}" = ${st.s}`, `"zp${n}" = ${st.p}`, `"zr${n}" = ${st.s + 2 * st.p}`, `"b${n}" = ${st.b}`, `"beta${n}" = ${st.beta}`, `"np${n}" = ${st.n}`, `"xs${n}" = ${st.xs}`, `"xp${n}" = ${st.xp}`, `"pin_d${n}" = ${st.pin.d}`); if (L) out.push(`"orbit_r${n}" = ${fmt(L.S[i].a, 4)}`, `"sun_bore${n}" = ${fmt(L.S[i].sunBore, 3)}`, `"planet_bore${n}" = ${fmt(L.S[i].planetBore, 3)}`); });
  if (L) out.push(`"ring_od" = ${fmt(L.ringOD, 3)}`, `"housing_od" = ${fmt(2 * L.housR, 3)}`, `"flange_od" = ${fmt(2 * L.flangeR, 3)}`, `"hollow_d" = ${fmt(2 * L.hollowR, 3)}`, `"xroller_dp" = ${D.outBearing.dp}`, `"bolt_n" = ${D.housing.boltN}`, `"bolt_m" = ${D.housing.boltD}`);
  return out.join('\n');
}
function cqScript() {
  const L = PGD3D.layout(R, D), S = R.ctx.stages, n = x => fmt(x, 4);
  const g = [];
  g.push('# 유성감속기 설계실에서 생성한 CadQuery 스크립트 (기어는 피치원 원통 근사, 치형은 cq_gears로 교체 가능)', 'import cadquery as cq', 'parts = {}');
  S.forEach((s, i) => { const k = i + 1, st = s.st, x = L.S[i]; g.push(
    `# ${k}단`, `parts["S${k}"] = cq.Workplane("XY").workplane(offset=${n(x.z0)}).circle(${n(st.m * st.s / 2)}).circle(${n((x.sunBore || 0) / 2 || 0.01)}).extrude(${n(st.b)})`,
    `for j in range(${st.n}):`, `    a = j * 360 / ${st.n}`,
    `    parts[f"P${k}_{j+1}"] = (cq.Workplane("XY").workplane(offset=${n(x.z0)}).center(${n(x.a)}, 0).circle(${n(st.m * st.p / 2)}).circle(${n(x.planetBore / 2)}).extrude(${n(st.b)}).rotate((0,0,0),(0,0,1),a))`); });
  g.push(`parts["R"] = cq.Workplane("XY").circle(${n(L.ringOD / 2)}).circle(${n(S[0].st.m * (S[0].st.s + 2 * S[0].st.p) / 2)}).extrude(${n(L.gearEnd)})`,
    `parts["housing"] = cq.Workplane("XY").workplane(offset=${n(L.zIn)}).circle(${n(L.housR)}).circle(${n(L.ringOD / 2)}).extrude(${n(L.zFlange[1] - L.zIn)})`,
    'asm = cq.Assembly()', 'for k, v in parts.items(): asm.add(v, name=k)', 'asm.save("reducer.step")');
  return g.join('\n');
}
function bindProcCards(m) {
  m.querySelectorAll('.pcx [data-copy]').forEach(b => b.onclick = async () => {
    const txt = b.dataset.copy === 'sw' ? swVars() : cqScript(), msg = m.querySelector('#copyMsg');
    try { await navigator.clipboard.writeText(txt); if (msg) msg.textContent = '복사됨'; }
    catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); if (msg) msg.textContent = '복사됨'; } catch (e2) { if (msg) msg.textContent = '복사 실패 — 미리보기에서 선택해 복사하세요'; } ta.remove(); }
  });
  m.querySelectorAll('.pcx [data-p]').forEach(elm => { if (!elm.dataset.bound) { elm.dataset.bound = 1; } });
}
function stagePage(k) {
  const E = procEval(), g = E.find(x => String(x.n) === k);
  if (!g) return head('설계 단계', '단계를 찾을 수 없습니다.');
  const idx = STAGE_KEYS.indexOf(k), prev = STAGE_KEYS[idx - 1], next = STAGE_KEYS[idx + 1];
  const nameOf = key => { const x = E.find(y => String(y.n) === key); return key === 'D' ? '가공·원가' : x?.name || ''; };
  const F = window.PGDChecks?.FORMS || {}, views = STAGE_VIEWS[k] || [];
  // where each item is shown on this page: its own card, or the screen block that holds it
  const target = i => F[i.id] ? 'it-' + i.id : views.includes(i.view) ? 'vw-' + i.view : null;
  const nav = `<div class="card snav"><ol>${g.items.map(i => { const tg = target(i), ext = !tg && i.view ? i.view : '', extName = ext === 'overview' ? '종합판정' : VIEW_STAGE[ext] ? VIEW_STAGE[ext] + '단계' : '';
      return `<li><button data-jump="${tg || ''}" data-ext="${ext ? i.view : ''}" data-id="${i.id}"><span class="pid">${i.id}</span><span class="pt">${esc(i.t)}</span><span class="kchip ${KIND_CLS[i.kind]}">${PGDProc.KIND[i.kind]}</span><span class="pval">${i.val != null ? esc(String(i.val)) : ''}${extName ? ` <i class="x">→ ${extName}</i>` : ''}</span>${okMark(i.ok)}</button></li>`; }).join('')}</ol>
    <div class="pgate ${gateCls(g.gate.ok)}">게이트 · ${esc(g.gate.t)} — ${g.gate.ok === true ? '통과' : g.gate.ok === false ? '미달' : '판정 기준 없음'}</div></div>`;
  const legacy = views.map(v => `<section class="vw" id="vw-${v}">${(VIEWS[v] ? VIEWS[v]() : '').replace(/<h2>\s*\d+\.\s*/g, '<h2>')}</section>`).join('');
  const cards = stageCards(k);
  const pager = `<div class="pager">${prev ? `<button class="btn" data-v="st-${prev}">← ${prev === 'D' ? 'D' : prev} ${esc(nameOf(prev))}</button>` : '<span></span>'}${next ? `<button class="btn primary" data-v="st-${next}">${next === 'D' ? 'D' : next} ${esc(nameOf(next))} →</button>` : ''}</div>`;
  return `<div class="shead"><span class="snum">${k === 'D' ? 'D' : k}</span><div><h2>${esc(k === 'D' ? '가공·원가 (병행 트랙)' : g.name)}</h2><p class="lead">세부 항목 ${g.total}개 · 사이트 처리 ${g.done}개 · 항목을 누르면 해당 위치로 이동합니다.</p></div></div>${nav}${legacy}${cards}${pager}`;
}
function stageCards(k) {
  if (!window.PGDChecks || !R || R.errors?.length) return '';
  const ids = Object.keys(PGDChecks.FORMS).filter(id => itemStage(id) === k);
  if (!ids.length) return '';
  return `<h3 class="cardsh">설계 공정 항목</h3>` + ids.map(id => procCard(id)).join('');
}
function bindStagePage(m) {
  m.querySelectorAll('.snav [data-id]').forEach(b => b.onclick = () => {
    if (b.dataset.jump) { ANCHOR = b.dataset.jump.startsWith('vw-') ? b.dataset.jump : b.dataset.id; try { history.replaceState(null, '', '#' + view + '/' + ANCHOR); } catch (e) { } scrollToAnchor(); renderRail(); }
    else if (b.dataset.ext) go(b.dataset.ext, VIEW_STAGE[b.dataset.ext] ? b.dataset.id : undefined);
  });
  m.querySelectorAll('.pager [data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
}
function procView() {
  const E = procEval();
  if (!E.length) return head('설계 공정', '공정 데이터를 불러오지 못했습니다.');
  const all = E.flatMap(g => g.items), cnt = k => all.filter(i => i.kind === k).length;
  const bar = ['calc', 'in', 'man', 'none'].map(k => `<span class="pbar ${KIND_CLS[k]}" style="flex:${cnt(k)}">${PGDProc.KIND[k]} ${cnt(k)}</span>`).join('');
  const card = g => `<div class="card pcard"><div class="ph"><h3>${g.n} ${esc(g.name)}</h3><span class="x">${g.done}/${g.total}</span></div>
    <ul class="plist">${g.items.map(i => `<li data-go="1" data-id="${i.id}" tabindex="0" role="button" title="${i.id} 항목으로"><span class="pid">${i.id}</span><span class="pt">${esc(i.t)}</span><span class="kchip ${KIND_CLS[i.kind]}">${PGDProc.KIND[i.kind]}</span><span class="pval">${i.val != null ? esc(String(i.val)) : ''}</span>${okMark(i.ok)}</li>`).join('')}</ul>
    <div class="pgate ${gateCls(g.gate.ok)}">게이트 · ${esc(g.gate.t)} ${g.gate.ok === true ? '통과' : g.gate.ok === false ? '미달' : '판정 기준 없음'}</div></div>`;
  return head('설계 공정 체크리스트', '화이트보드의 설계 순서(12단계 · 세부 항목)를 그대로 따릅니다. 항목을 누르면 해당 화면으로 갑니다. 상태: <b>계산</b> = 사이트가 계산·검사, <b>입력</b> = 값을 넣는 곳만 있음, <b>판단</b> = 사람이 정함, <b>미구현</b> = 아직 사이트에 없음.') +
    `<div class="pbars">${bar}</div><div class="pgrid">${E.map(card).join('')}</div>`;
}
const errBox = () => R?.errors?.length ? `<div class="card"><h3 class="bad">계산할 수 없습니다</h3><ul class="warns">${R.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '';
const tag = s => `<span class="tag ${s}">${s}</span>`;
const partLabel = r => `${r.stage}단 ${r.mesh} · ${r.partName}`;

const VIEWS = {
  smat() { return VIEWS.s6() + '<div style="height:28px"></div>' + VIEWS.slub(); },
  shous() { return housingView(); },
  overview() { return overviewView(); },
  proc() { return procView(); },
  map() { return `<div class="maphead"><h2>설계 지도</h2><p class="lead">모든 단계와 세부 항목을 한 평면에 펼쳤습니다. 단계를 누르면 항목이 펼쳐지고, 항목을 누르면 연관 항목이 이어집니다. 주황 화살표 = 상호작용, 회색 = 단계 흐름.</p></div><div id="mapHost" class="maphost"></div>`; },
  outLegacy() { return head('출력물 · 가공 · 원가', '12단계 출력물과 가공·원가 병행 트랙(D1~D6)입니다. 원가는 가정 단가로 계산한 추정치이며, 실제 견적 단가로 바꿔 넣으면 그대로 반영됩니다.'); },
  overviewOld() {
    if (!R || R.errors?.length) return head('종합 판정', '입력에 오류가 있어 계산하지 못했습니다.') + errBox();
    const tgt = D.req.Trated, cap = R.capacityLife;
    const maxV = Math.max(tgt, cap, MC ? MC.capacity.p90 : 0, R.capacityInf) * 1.15 || 1;
    const pct = v => clampPct(v / maxV * 100);
    const gov = R.govRated;
    return head('종합 판정', '실측값 없이, 규격식·물리 모델·명시된 가정만으로 계산합니다. 왼쪽 단계 순서대로 입력을 확정하고, 오른쪽 판정에서 미달 항목을 확인하세요.') +
      `<div class="card"><h3>정격 출력토크 · 목표 수명 ${D.req.lifeH} h, ${D.req.rpm} rpm 일정 운전</h3>
       <div class="range" aria-hidden="true">
        ${MC ? `<div class="bar" style="left:${pct(MC.capacity.p10)}%;width:${pct(MC.capacity.p90) - pct(MC.capacity.p10)}%"></div><div class="mid" style="left:${pct(MC.capacity.p50)}%"></div>` : ''}
        <div class="iso" style="left:${pct(cap)}%"></div><div class="tgt" style="left:${pct(tgt)}%"></div></div>
       <div class="legend"><span><i style="background:var(--ink)"></i>ISO 설계 판정 ${fmt(cap, 1)} N·m</span><span><i style="background:var(--brick)"></i>목표 ${tgt} N·m</span>${MC ? `<span><i style="background:var(--accent2)"></i>현실 예측 P10–P90 ${fmt(MC.capacity.p10, 1)}–${fmt(MC.capacity.p90, 1)}, 중앙 ${fmt(MC.capacity.p50, 1)} N·m</span>` : '<span>현실 예측: 14단계에서 실행</span>'}</div>
       <p class="note">ISO 설계 판정은 피로강도 99 % 신뢰도, 공차 상한(제곱합), 목표 안전율 SH ${D.req.SH} · SF ${D.req.SF} 기준입니다. 현실 예측은 공차·하중분배·재료 산포를 무작위로 뽑아 중앙값 강도로 계산한 분포입니다.</p></div>
      <div class="two">
       <div class="card"><h3>지배 부위</h3><p class="big" style="font-size:24px">${gov ? esc(partLabel(gov.row)) + ' ' + gov.mode : '—'}</p>
        <table><tr><th>항목</th><th>값</th></tr>
        <tr><td>무한 수명(10¹⁰회) 한계</td><td>${fmt(R.capacityInf)} N·m</td></tr>
        <tr><td>정적 한계 (피크)</td><td>${fmt(R.staticCap)} N·m</td></tr>
        <tr><td>출력 베어링 L10</td><td>${fmtH(R.outBearing.L10h)} h</td></tr>
        <tr><td>유성 베어링 한계 (목표 수명)</td><td>${R.bearingCap.map(v => fmt(v, 1)).join(' / ')} N·m</td></tr>
        <tr><td>스펙트럼 수명 (기어 최소)</td><td>${fmtH(R.spectrum.minLife)} h</td></tr></table></div>
       <div class="card"><h3>먼저 손댈 것</h3>${advice()}</div></div>
      ${R.warns.length ? `<div class="card"><h3>주의</h3><ul class="warns">${R.warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}`;
  },
  s1() {
    const d = D.req.duty;
    const cs = E.CASES, cur = cs[D.req.case], has = !!cur;
    const pos_ = has ? D.req.case.split('-')[0] : 'lower', axis = has ? D.req.case.split('-')[1] : 'pitch';
    return head('2. 요구사양', '로봇 관절 위치(상체·하체)와 축(롤·피치·요)을 골라 적용하면 피크·비상 토크 비, 부하 스펙트럼, 관절 속도, 수명, 출력 베어링 외부 하중이 정격 토크에 비례해 채워집니다. 채운 값은 대표 가정값이므로 아래에서 고칠 수 있습니다.') +
      `<div class="card"><h3>관절 케이스</h3><div class="grid">
        ${num('req.Trated', '정격 출력토크 N·m')}
        <label class="f">관절 위치<select id="cPos"><option value="lower" ${pos_ === 'lower' ? 'selected' : ''}>하체</option><option value="upper" ${pos_ === 'upper' ? 'selected' : ''}>상체</option></select></label>
        <label class="f">관절 축<select id="cAxis">${['roll', 'pitch', 'yaw'].map(a => `<option value="${a}" ${axis === a ? 'selected' : ''}>${{ roll: '롤', pitch: '피치', yaw: '요' }[a]}</option>`).join('')}</select></label>
        <label class="f">&nbsp;<button class="btn primary" id="cApply" type="button">케이스 적용</button></label></div>
        <p class="note">현재: <b>${has ? esc(cur.label) : '사용자 정의'}</b>${has ? ' · ' + esc(cur.note) : ''}. 적용 뒤 아래 값을 고치면 고친 값이 쓰입니다. 정격 토크를 바꾼 뒤에는 다시 적용해야 비례값이 갱신됩니다.</p>
        <div class="scroll"><table><tr><th class="l">케이스</th><th>피크 ×</th><th>비상 ×</th><th>관절 rpm</th><th>수명 h</th><th>Fr/T</th><th>Fa/T</th><th>M/T</th><th class="l">특징</th></tr>
        ${Object.entries(cs).map(([k, c]) => `<tr class="${k === D.req.case ? 'gov' : ''}"><td class="l">${esc(c.label)}</td><td>${c.peak}</td><td>${c.emerg}</td><td>${c.outRpm}</td><td>${c.life}</td><td>${c.ext[0]}</td><td>${c.ext[1]}</td><td>${c.ext[2]}</td><td class="l note">${esc(c.note)}</td></tr>`).join('')}</table></div>
        <p class="note">Fr·Fa는 정격 토크 1 N·m당 N, M은 1 N·m당 N·m. 링크 길이·자중으로 실제 하중을 알면 아래 출력 베어링 외부 하중에 직접 넣으세요.</p></div>
      <div class="card"><h3>토크·속도·수명</h3><div class="grid">
        ${num('req.Tpeak', '반복 피크 토크 N·m')}${num('req.Temerg', '비상·충돌 토크 N·m')}
        ${num('req.rpm', '정격 입력 회전수 rpm')}${num('req.lifeH', '목표 수명 h')}</div></div>
       <div class="card"><h3>목표 안전율·성능</h3><div class="grid">
        ${num('req.SH', '피로 접촉 SH')}${num('req.SF', '피로 굽힘 SF')}${num('req.SHstat', '정적 접촉 SH')}${num('req.SFstat', '정적 굽힘 SF')}
        ${num('req.s0', '베어링 정적 s0')}${num('req.effMin', '최소 효율 %')}${num('req.backlashMax', '최대 백래시 arcmin')}</div></div>
       <div class="card"><h3>출력 베어링 외부 하중 (정격 토크 구간)</h3><div class="grid">${num('req.ext.Fr', '반경 하중 Fr N')}${num('req.ext.Fa', '축 하중 Fa N')}${num('req.ext.M', '모멘트 M N·m')}</div>
        <p class="note">스펙트럼 구간마다 토크 비율만큼 비례한다고 봅니다. 피크·비상 정적 검토는 토크 비를 곱합니다.</p></div>
       <div class="card"><h3>부하 스펙트럼 (정격 대비 %, 시간 비율 %)</h3>
        <div class="scroll"><table><tr><th>구간</th><th>토크 %</th><th>토크 N·m</th><th>시간 %</th><th>입력 rpm (0=정격)</th><th></th></tr>
        ${d.map((l, i) => `<tr><td>${i + 1}</td><td><input type="number" data-p="req.duty.${i}.torque" data-t="num" value="${l.torque}" style="width:80px"></td><td>${fmt(D.req.Trated * l.torque / 100, 1)}</td><td><input type="number" data-p="req.duty.${i}.time" data-t="num" value="${l.time}" style="width:80px"></td><td><input type="number" data-p="req.duty.${i}.rpm" data-t="num" value="${l.rpm || 0}" style="width:90px"></td><td><button class="btn" data-del="${i}">삭제</button></td></tr>`).join('')}
        </table></div><p><button class="btn" id="addDuty">구간 추가</button> <span class="note">시간 합 ${fmt(d.reduce((s, l) => s + (l.time || 0), 0), 1)} % (합이 100이 아니어도 비율로 계산)</span></p>
        ${dutyChart()}</div>`;
  },
  s2() {
    const st = R?.ctx?.stages || [];
    return head('3. 구성·감속비', '단수와 링 공유를 정합니다. 썬은 축에 고정(플로팅 아님)으로 보며, 유성 간 하중분배(Kγ)는 7단계에서 유성 위치 공차와 강성으로 계산합니다.') +
      `<div class="card"><div class="grid">${sel('config.stages', '단수', [[1, '1단'], [2, '2단']], { type: 'numsel' })}</div>
       ${chk('config.sharedRing', '1·2단 링기어 공유 (2단 유성 잇수·모듈·비틀림각은 1단 링 기준 자동)')}
</div>
       ${componentsHTML()}
       <div class="card"><h3>감속비</h3><table><tr><th>단</th><th>S / P / R</th><th>단 감속비</th></tr>
        ${st.map(s => `<tr><td>${s.i + 1}단</td><td>${s.st.s} / ${s.st.p} / ${s.geo.r}</td><td>${fmt(s.geo.ratio, 4)}</td></tr>`).join('')}
        <tr><td><b>총</b></td><td></td><td><b>${fmt(R?.ratio, 4)} : 1</b></td></tr></table></div>
       <div class="card"><h3>잇수 조합 탐색기</h3><div class="grid">
        <label class="f">목표 단 감속비<input type="number" id="fRatio" value="${fmt(st[0]?.geo.ratio || 3, 3)}" step="any"></label>
        <label class="f">유성 개수<input type="number" id="fN" value="${D.stages[0].n}"></label>
        <label class="f">썬 잇수 범위<input id="fS" value="12-60"></label>
        <label class="f">최대 링 잇수<input type="number" id="fR" value="140"></label></div>
        <p><button class="btn" id="fGo">탐색</button> <span class="note">조립 조건 · 인접 간섭 · 헌팅 투스를 만족하는 조합 (모듈 ${D.stages[0].m} mm 기준)</span></p><div id="fOut"></div></div>`;
  },
  s3() {
    if (!R?.ctx) return '';
    const cards = D.stages.slice(0, D.config.stages).map((s, i) => {
      const locked = i === 1 && D.config.sharedRing;
      const g = R.ctx.stages[i]?.geo;
      return `<div class="card"><h3>${i + 1}단</h3><div class="grid">
        ${num(`stages.${i}.s`, '썬 잇수', { step: 1 })}${num(`stages.${i}.p`, '유성 잇수', { step: 1, disabled: locked })}
        <label class="f">링 잇수<input value="${g?.r ?? ''}" disabled></label>
        ${sel(`stages.${i}.n`, '유성 개수', [2, 3, 4, 5, 6].map(v => [v, v + '개']), { type: 'numsel' })}
        ${num(`stages.${i}.m`, '치직각 모듈 mm', { disabled: locked })}${num(`stages.${i}.beta`, '비틀림각 °', { disabled: locked })}
        ${num(`stages.${i}.b`, '치폭 mm')}${num(`stages.${i}.alpha`, '압력각 °', { disabled: locked })}
        ${num(`stages.${i}.xs`, '썬 전위계수')}${num(`stages.${i}.xp`, '유성 전위계수')}${num(`stages.${i}.xr`, '링 전위계수', { disabled: s.autoRingShift })}</div>
        ${chk(`stages.${i}.autoRingShift`, '링 전위 자동 (외접·내접 중심거리 일치)')}
        ${g?.parts?.length ? `<div class="scroll"><table><tr><th>기어</th><th>잇수</th><th>PCD</th><th>이끝원</th><th>이뿌리원</th><th>기초원</th><th>전위</th><th>이끝 두께</th></tr>
        ${g.parts.map(p => `<tr><td>${p.name}</td><td>${p.z}</td><td>${fmt(p.d, 3)}</td><td>${fmt(p.da, 3)}</td><td>${fmt(p.df, 3)}</td><td>${fmt(p.db, 3)}</td><td>${fmt(p.x, 3)}</td><td>${fmt(p.tipThickness, 3)}</td></tr>`).join('')}</table></div>
        <p class="note">캐리어 핀 PCD Ø${fmt(2 * g.meshes[0].center, 3)} mm · 작용 압력각 외접 ${fmt(g.meshes[0].aw / Math.PI * 180, 2)}° / 내접 ${fmt(g.meshes[1].aw / Math.PI * 180, 2)}° · 단 감속비 ${fmt(g.ratio, 4)}</p>` : ''}</div>`;
    }).join('');
    return head('4. 제원·형상', '잇수·모듈·비틀림각·치폭과 전위를 정합니다. 표의 지름은 축직각 기준입니다.') + errBox() +
      `<div class="card" style="padding:10px"><div id="viewer"><div class="ctl"><button class="btn" id="vPlay">일시정지</button><button class="btn" id="vRing">링 숨기기</button></div><div class="hud">드래그: 회전 · Shift+드래그: 이동 · 휠: 확대 · 더블클릭: 기본 시점 · 우클릭: 메뉴</div></div>
       <div class="grid" style="margin-top:10px"><label class="f">1단 썬 입력 회전수 rpm<input type="number" id="aRpm" value="${D.anim.rpm}" step="any"></label>
        <label class="f">재생 배속 (1 = 실속도)<select id="aSlow">${[[1, '1× 실속도'], [.2, '0.2×'], [.05, '0.05×'], [.02, '0.02×'], [.005, '0.005×']].map(([v, l]) => `<option value="${v}" ${+D.anim.slow === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="f" id="aOut" style="font-size:13px;line-height:1.5"></div></div></div>` + cards;
  },
  s4() {
    if (!R?.ctx) return '';
    return head('5. 치형 검사', '조립·간섭·물림률·이끝 두께·림 두께를 확인합니다. 권장 범위를 벗어난 항목은 붉게 표시합니다.') + errBox() +
      R.ctx.stages.map(s => `<div class="card"><h3>${s.i + 1}단</h3><table><tr><th class="l">항목</th><th>값</th><th>판정</th><th class="l">기준</th></tr>
      ${s.geo.checks.map(c => `<tr class="${c.ok ? '' : 'bad'}"><td class="l">${esc(c.k)}</td><td>${typeof c.v === 'number' ? fmt(c.v, 3) : esc(c.v)}</td><td>${c.ok ? '통과' : '확인'}</td><td class="l note">${esc(c.note || '')}</td></tr>`).join('')}
      ${(s.geo.rims || []).map((r, k) => `<tr class="${r.YB > 1.001 || r.error ? 'bad' : ''}"><td class="l">${E.NAMES[k]} 림 두께 sR / 기준 (${r.solid ? '중실' : (r.assumed ? '자동' : '입력') + ' Ø' + fmt(r.diameter, 2)})</td><td>${r.solid ? '중실' : fmt(r.sR, 3) + ' mm'}</td><td>YB ${fmt(r.YB, 3)}</td><td class="l note">${k === 2 ? 'sR/m ≥ 3.5면 YB = 1' : 'sR/ht ≥ 1.2면 YB = 1'}</td></tr>`).join('')}
      </table></div>`).join('') +
      `<div class="card"><h3>림 지름 입력</h3><div class="grid">${D.stages.slice(0, D.config.stages).map((s, i) => num(`stages.${i}.sunBore`, `${i + 1}단 썬 보어 mm (0=중실, 빈칸=자동)`) + num(`stages.${i}.planetBore`, `${i + 1}단 유성 보어 mm (0=중실, 빈칸=자동)`) + (i === 1 && D.config.sharedRing ? '' : num(`stages.${i}.ringOD`, `${i + 1}단 링 외경 mm (빈칸=자동)${D.config.sharedRing ? ' · 공유 링' : ''}`))).join('')}</div>
       <p class="note">입력한 보어·외경은 4단계 3D 모델에도 반영됩니다. 썬·유성 보어 0은 중실(구멍 없음, YB = 1)입니다. 빈칸이면 림 두께 계수 YB = 1이 되는 최소 림(썬·유성 sR = 1.2·h, 링 sR = 4·m)으로 그립니다.</p></div>
      <div class="card"><h3>헌팅 투스란</h3><p style="font-size:14px;line-height:1.65">맞물리는 두 기어의 잇수에 공약수가 없으면(최대공약수 1), 한 기어의 특정 이가 상대 기어의 모든 이와 한 번씩 만난 뒤에야 같은 이와 다시 만납니다. 이것을 헌팅 투스라고 합니다. 공약수가 있으면 같은 이 쌍끼리만 반복해서 만나므로, 어느 한 이의 가공 오차·흠·이물이 상대 기어의 일부 이에만 계속 전달돼 마모·피팅·소음이 국부적으로 커질 수 있습니다.</p>
       <p style="font-size:14px;line-height:1.65">유성기어는 썬–유성, 유성–링 두 쌍을 봅니다. 예: S46 · P23은 공약수 23이 있어 썬의 한 이는 유성의 같은 이 하나와만 계속 만납니다 (P23 · R92도 같음). 다만 조립 조건((S+R)/유성 수 = 정수)과 감속비가 먼저이고, 연삭·표면경화한 정밀 기어나 그리스 윤활 저속 관절에서는 영향이 작아 <b>권장 조건</b>으로만 표시합니다. 이 검사는 강도 계산에 들어가지 않습니다.</p></div>`;
  },
  s5() {
    if (!R?.ctx) return '';
    return head('6. 정밀도·치형 수정', '정밀도 등급은 KHβ·Kv·KHα의 공차 입력이 됩니다. 크라우닝은 유성기어에 주어 두 치합 모두에 작용한다고 봅니다.') +
      D.stages.slice(0, D.config.stages).map((s, i) => `<div class="card"><h3>${i + 1}단</h3><div class="grid">
        ${sel(`stages.${i}.grade`, '정밀도 등급 (ISO 1328 / JIS N)', [3, 4, 5, 6, 7, 8].map(v => [v, 'N' + v]), { type: 'numsel' })}
        ${num(`stages.${i}.mod.crown`, '리드 크라우닝 µm (유성)')}${num(`stages.${i}.mod.tip`, '치끝 수정 µm')}
        ${sel(`stages.${i}.mod.verified`, '치형 수정 근거 수준 (fZCa)', [['none', '근거 없음 · 1.20'], ['qualified', '하중 하 적합 계산 · 1.07'], ['uniform', '3D 균일 접촉 확인 · 1.00']])}</div>
        <div class="scroll"><table><tr><th>기어</th><th>단일 피치 fp</th><th>치형 형상 ffα</th><th>잇줄 기울기 fHβ</th><th>잇줄 형상</th></tr>
        ${(R.ctx.stages[i]?.geo.tol || []).map((t, k) => `<tr><td>${E.NAMES[k]}</td><td>${fmt(t.pitch, 1)}</td><td>${fmt(t.profileForm, 1)}</td><td>${fmt(t.helixSlope, 1)}</td><td>${fmt(t.helixForm, 1)}</td></tr>`).join('')}</table></div>
        <p class="note">공차 단위 µm · ISO 1328-1:2013 식(= JIS B 1702-1:2016). "하중 하 적합 계산"은 수정량을 하중 변형으로 계산해 정한 경우를 뜻합니다.</p></div>`).join('');
  },
  s6() {
    if (!R?.ctx) return '';
    const rows = [];
    for (let i = 0; i < D.config.stages; i++) for (let k = 0; k < 3; k++) {
      const idx = i * 3 + k, shared = i === 1 && k === 2 && D.config.sharedRing;
      const m = R.ctx.stages[i]?.mats[k];
      rows.push(`<tr><td>${i + 1}단 ${E.NAMES[k]}</td>
       <td>${shared ? '1단 링과 공유' : `<select data-p="materials.${idx}.family">${Object.entries(E.FAMILY).map(([f, v]) => `<option value="${f}" ${D.materials[idx].family === f ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`}</td>
       <td>${shared ? '' : `<input type="number" step="any" data-t="num" data-p="materials.${idx}.surfaceHRC" value="${D.materials[idx].surfaceHRC}" style="width:70px">`}</td>
       <td>${shared ? '' : `<input type="number" step="any" data-t="num" data-p="materials.${idx}.coreHRC" value="${D.materials[idx].coreHRC}" style="width:70px">`}</td>
       <td>${shared ? '' : `<input type="number" step="any" data-t="num" data-p="materials.${idx}.depth" value="${D.materials[idx].depth}" style="width:70px">`}</td>
       <td>${fmt(m?.hv, 0)}</td><td>${fmt(m?.HlimISO, 0)}</td><td>${fmt(m?.FlimISO, 0)}</td></tr>`);
    }
    const cd = R.caseDepth || [];
    return head('12. 소재 — 재료·열처리', '경도는 HRC로 입력합니다. 허용응력은 ISO 6336-5 재료선과 품질 등급으로 정합니다. 경화 깊이는 피크 토크에서의 최대 전단 깊이와 비교합니다.') +
      `<div class="card"><div class="grid">${sel('design.quality', '재료 품질 등급', [['ML', 'ML · 최소 품질'], ['MQ', 'MQ · 일반 양산 품질'], ['ME', 'ME · 고품질 (증빙 필요)']])}
       ${num('lube.rzFlank', '치면 Rz µm')}${num('lube.rzRoot', '치근 Rz µm')}</div></div>
       <div class="card scroll"><table><tr><th>부품</th><th class="l">재료</th><th>표면 HRC</th><th>심부 HRC</th><th>경화 깊이 mm</th><th>표면 HV</th><th>σHlim</th><th>σFlim</th></tr>${rows.join('')}</table>
       <p class="note">σHlim·σFlim은 1 % 파손확률 기준값(MPa). 질화강(NV)은 ISO 표가 650 HV까지라 그 이상은 650 HV 값을 씁니다.</p></div>
       <div class="card"><h3>경화 깊이 검토 · 피크 ${D.req.Tpeak} N·m</h3><table><tr><th>부위</th><th>최대 전단 깊이 mm</th><th>경화 깊이 mm</th><th>비율</th></tr>
       ${cd.map(c => `<tr class="${c.ratio != null && c.ratio < 2 ? 'bad' : ''}"><td>${c.stage}단 ${c.mesh} · ${c.partName}</td><td>${fmt(c.zMax, 3)}</td><td>${fmt(c.depth, 2)}</td><td>${fmt(c.ratio, 2)}</td></tr>`).join('')}</table>
       <p class="note">비율 2 미만이면 케이스 크러싱(심부 파손) 검토를 권합니다 (간이 기준).</p></div>`;
  },
  s7() {
    if (!R?.ctx) return '';
    const rs = R.rated;
    return head('7. 하중 계수', '실측 없이 계수를 정하는 단계입니다. Kγ는 유성 위치오차·치합 강성·핀 강성로, KHβ는 공차 제곱합·핀 처짐·크라우닝으로 계산합니다.') + errBox() +
      `<div class="card"><div class="grid">${num('loads.KA', '사용계수 KA')}
        ${sel('loads.kgMode', 'Kγ 산정', [['model', '물리 모델 (권장)'], ['agma', 'AGMA 6123 표'], ['fixed', '직접 입력']])}
        ${num('loads.kgFixed', 'Kγ 직접 입력값')}${num('loads.posError', '유성 위치 공차 ± µm')}</div></div>
       <div class="card"><h3>썬 반경 지지 (플로팅 아님)</h3><div class="grid">${D.stages.slice(0, D.config.stages).map((s, i) => { const ss = D.loads.sunSupport[i] || {}; const k = E.sunSupportK(D, i);
         return sel(`loads.sunSupport.${i}.mode`, `${i + 1}단 지지 산정`, [['structure', '구조 (베어링 ⊕ 축)'], ['direct', '직접 입력']]) +
         (ss.mode === 'structure' ? num(`loads.sunSupport.${i}.bearingK`, `${i + 1}단 지지 베어링 반경 강성 N/µm`) + num(`loads.sunSupport.${i}.od`, `${i + 1}단 축 외경 mm`) + num(`loads.sunSupport.${i}.id`, `${i + 1}단 축 내경 mm (중공)`) + num(`loads.sunSupport.${i}.overhang`, `${i + 1}단 베어링→치폭 중앙 mm`)
           : num(`loads.sunSupport.${i}.k`, `${i + 1}단 썬 지지 반경 강성 N/µm`)) + num(`loads.sunSupport.${i}.play`, `${i + 1}단 반경 유격 µm (베어링 틈새)`) +
         `<div class="f note">→ ${i + 1}단 지지 강성 <b>${fmt(k.k, 1)} N/µm</b>${k.kShaft ? ` (축 ${fmt(k.kShaft, 0)})` : ''}</div>`; }).join('')}</div>
        <p class="note">1단 썬은 입력축(중공축) 지지 베어링, 2단 썬은 1단 캐리어를 받치는 베어링에 해당합니다. 반경 유격은 베어링 내부 틈새의 절반 정도이며, 클수록 썬이 자리를 잡아 Kγ가 작아집니다. 기본값은 가정입니다.</p></div>
       <div class="card"><div class="grid">
        ${sel('loads.fmaMode', '잇줄 오차 결합', [['rss', '제곱합 · ISO 식 66'], ['worst', '최악합 · ISO 식 64']])}
        ${num('loads.carrierParallel', '캐리어 핀 구멍 평행도 µm')}</div>${chk('loads.reverse', '썬·링 매 주기 하중 반전 (YM 0.7)')}</div>
       <div class="card scroll"><h3>정격 ${D.req.Trated} N·m에서의 계수</h3><table><tr><th>부위</th><th>Kγ</th><th>Kv</th><th>fma µm</th><th>fsh 핀 / 캐리어 / 출력베어링 µm</th><th>접촉폭</th><th>KHβ</th><th>KHα</th><th class="l">근거</th></tr>
       ${rs.rows.filter(r => r.part === (r.mesh === '썬–유성' ? 0 : 2)).map(r => `<tr><td>${r.stage}단 ${r.mesh}</td><td>${fmt(r.f.Kg, 3)}</td><td>${fmt(r.f.Kv, 3)}</td><td>${fmt(r.f.fma, 2)}</td><td>${fmt(r.f.fshPin, 2)} / ${fmt(r.f.fshCar, 2)} / ${fmt(r.f.fshOB, 2)}</td><td>${fmt(r.f.frac * 100, 0)} %</td><td>${fmt(r.f.KHb, 3)}</td><td>${fmt(r.f.KHa, 3)}</td><td class="l">${tag(r.f.KgSrc)} ${esc(r.f.KgNote)}</td></tr>`).join('')}</table>
       <p class="note">KHβ는 부하가 낮을수록 커집니다(부분 접촉). 썬은 플로팅이 아니지만 축·베어링으로 지지되어 반경 방향으로 조금 밀립니다. Kγ는 유성 위치 공차, 치합·핀 경로 강성, 썬 지지 강성·유격의 힘 평형(에너지 최소)으로 계산합니다. 썬 지지 강성이 무한대면 완전 고정, 0이면 플로팅과 같습니다. 지지 강성·유격은 위 입력에서 정합니다.</p></div>`;
  },
  s8() {
    if (!R?.ctx || R.errors?.length) return head('8. 기어 강도', '') + errBox();
    const gid = R.govRated?.row.id;
    return head('8. 기어 강도', 'ISO 6336-2/-3 방법 B. 허용응력은 목표 수명의 반복수로 수명계수(ZNT·YNT)와 환경계수를 보간합니다. 피크·비상 토크는 정적 강도로 따로 봅니다.') +
      `<div class="two"><div class="card"><h3>정격 한계</h3><table>
        <tr><td>목표 수명 ${D.req.lifeH} h · ${D.req.rpm} rpm</td><td><b>${fmt(R.capacityLife)} N·m</b></td></tr>
        <tr><td>무한 수명 (10¹⁰회)</td><td>${fmt(R.capacityInf)} N·m</td></tr>
        <tr><td>정적 (피크 기준 SH ${D.req.SHstat} · SF ${D.req.SFstat})</td><td>${fmt(R.staticCap)} N·m</td></tr>
        <tr><td>피크 ${D.req.Tpeak} N·m 최소 안전율</td><td class="${R.peakS < 1 ? 'bad' : ''}">${fmt(R.peakS, 3)}</td></tr>
        <tr><td>비상 ${D.req.Temerg} N·m 최소 안전율</td><td class="${R.emergS < 1 ? 'bad' : ''}">${fmt(R.emergS, 3)}</td></tr></table></div>
       <div class="card"><h3>부하 스펙트럼 수명 (Miner)</h3><table><tr><th>부위</th><th>수명 h</th><th>모드</th></tr>
        ${R.spectrum.list.slice(0, 6).map(p => `<tr class="${p.lifeH < D.req.lifeH ? 'bad' : ''}"><td>${p.stage}단 ${p.mesh} · ${p.partName}</td><td>${fmtH(p.lifeH)}</td><td>${p.mode}</td></tr>`).join('')}</table></div></div>
       <div class="card scroll"><h3>정격 ${D.req.Trated} N·m · 목표 수명에서의 응력</h3><table><tr><th>부위</th><th>반복수</th><th>σH</th><th>σHP</th><th>SH</th><th>σF</th><th>σFP</th><th>SF</th><th>ZNT</th><th>YNT</th><th>ZB/ZD</th><th>YF</th><th>YS</th></tr>
       ${R.rated.rows.map(r => `<tr class="${r.id === gid ? 'gov' : ''} ${r.SH < D.req.SH || r.SF < D.req.SF ? 'bad' : ''}"><td>${partLabel(r)}</td><td>${r.N.toExponential(1)}</td><td>${fmt(r.H, 0)}</td><td>${fmt(r.HP, 0)}</td><td>${fmt(r.SH, 3)}</td><td>${fmt(r.F, 0)}</td><td>${fmt(r.FP, 0)}</td><td>${fmt(r.SF, 3)}</td><td>${fmt(r.f.ZNT, 3)}</td><td>${fmt(r.f.YNT, 3)}</td><td>${fmt(r.f.ZBD, 3)}</td><td>${fmt(r.f.YF, 3)}</td><td>${fmt(r.f.YS, 3)}</td></tr>`).join('')}</table>
       <p class="note">응력 MPa. 유성 굽힘은 양방향 하중으로 YM 0.7. 강조 행이 정격 한계를 정하는 부위입니다.</p></div>`;
  },
  slub() {
    if (!R?.ctx || R.errors?.length) return head('12. 소재 — 윤활·스커핑', '') + errBox();
    const L = R.lube, g = D.lube.type === 'grease';
    return head('12. 소재 — 윤활·스커핑', '운전 온도에서의 점도로 유막 두께·마찰계수·섬광온도를 계산합니다. 윤활제 데이터시트의 ν40·ν100(그리스는 기유)과 FZG 하중 단계를 넣고, 운전 온도는 가정으로 둡니다.') +
      `<div class="card"><div class="grid">${sel('lube.type', '윤활 방식', [['grease', '그리스 (기유 점도 입력)'], ['oil', '오일']])}
        ${num('lube.nu40', '기유 ν40 mm²/s')}${num('lube.nu100', '기유 ν100 mm²/s')}${num('lube.temp', '운전 온도 °C (가정)')}
        ${num('lube.alphaP', '압력-점도 계수 ×10⁻⁸ /Pa')}${g ? num('lube.starvation', '그리스 유막 결핍 계수 (0–1)') : ''}${num('lube.fzg', 'FZG 스커핑 하중 단계')}${num('lube.XL', '윤활제 계수 XL (광유 1)')}${num('lube.XW', '조직 계수 XW')}${num('req.SBmin', '요구 스커핑 안전율')}</div>
        <p class="note">운전 점도 ν(${D.lube.temp} °C) = <b>${fmt(L.nuOp, 1)} mm²/s</b> (Walther 식, ν40·ν100 사이 직선 보간). 치면 조도는 12단계 위쪽 Rz를 Ra ≈ Rz/6으로 씁니다.</p></div>
       <div class="card scroll"><h3>정격 ${D.req.Trated} N·m · ${D.req.rpm} rpm</h3><table><tr><th>단</th><th>치합</th><th>피치선 속도 m/s</th><th>선하중 N/mm</th><th>최소 유막 µm</th><th>λ</th><th>윤활 영역</th><th>μ</th><th>섬광온도 K</th></tr>
       ${L.meshes.map(m => `<tr class="${m.lambda < 1 ? 'bad' : ''}"><td>${m.stage}단</td><td>${m.mesh}</td><td>${fmt(m.vt, 2)}</td><td>${fmt(m.wline, 1)}</td><td>${fmt(m.hmin, 3)}</td><td>${fmt(m.lambda, 2)}</td><td>${m.regime}</td><td>${fmt(m.mu, 3)}</td><td>${fmt(m.flash, 1)}</td></tr>`).join('')}</table>
       <p class="note">유막: Dowson–Higginson 선접촉식, 피치점·치직각 곡률반경${g ? `, 그리스는 기유 유막 × ${D.lube.starvation} (결핍 가정)` : ''}. λ = 최소 유막 / √(Ra₁² + Ra₂²). λ < 1 경계 윤활, 1–3 혼합, > 3 완전 유막. 마찰계수: ISO/TR 14179-2 식 (0.02–0.12로 제한).</p></div>
       <div class="card scroll"><h3>스커핑 · 피크 ${D.req.Tpeak} N·m</h3><table><tr><th>단</th><th>치합</th><th>최대 섬광온도 K</th><th>접촉 온도 θB °C</th><th>스커핑 온도 θS °C</th><th>안전율 SB</th></tr>
       ${L.peak.map(m => `<tr class="${m.SB < (D.req.SBmin || 1.5) ? 'bad' : ''}"><td>${m.stage}단</td><td>${m.mesh}</td><td>${fmt(m.flash, 1)}</td><td>${fmt(m.thetaB, 1)}</td><td>${fmt(m.thetaS, 0)}</td><td>${Number.isFinite(m.SB) ? fmt(m.SB, 1) : '∞'}</td></tr>`).join('')}</table>
       <p class="note">Blok 섬광온도를 물림 시작·피치점·물림 끝에서 계산하고 최댓값을 씁니다. θS = 80 + (0.85 + 1.4·XW)·XL·FZG² (ISO/TR 13989-1 형태), 벌크 온도 = 운전 온도로 가정. SB = (θS − θ운전) / 섬광온도. 저속 관절에서는 스커핑보다 λ가 낮은 경계 윤활 마모·마이크로피팅이 실제 위험입니다 (마이크로피팅 정량 판정은 시험 등급 데이터가 필요해 λ로만 표시).</p></div>`;
  },
  s9() {
    if (!R?.ctx || R.errors?.length) return head('9. 베어링 (유성·출력)', '') + errBox();
    const ob = R.outBearing;
    return head('9. 베어링 (유성·출력)', '유성 베어링은 치합 하중을, 출력 메인 베어링은 관절의 외부 하중·모멘트를 받습니다. 수명은 ISO 281 기본 수명(L10)으로 보고 중앙 수명(L50)은 참고로 둡니다.') +
      `<div class="card"><h3>유성 베어링</h3><div class="grid">${D.stages.slice(0, D.config.stages).map((s, i) =>
        `<label class="f">${i + 1}단 베어링 이름<input data-p="stages.${i}.bearing.name" value="${esc(s.bearing.name)}"></label>` + num(`stages.${i}.bearing.C`, `${i + 1}단 동정격 C N`) + num(`stages.${i}.bearing.C0`, `${i + 1}단 정정격 C0 N`) + num(`stages.${i}.bearing.count`, `${i + 1}단 유성당 개수`)).join('')}</div>
        <p class="note">카탈로그 C·C0를 넣으세요. 기본값은 예시입니다.</p></div>
       <div class="card scroll"><table><tr><th>단</th><th>등가 하중 Peq N</th><th>L10 h</th><th>L50 h (추정)</th><th>s0 피크</th><th>s0 비상</th><th>유성 상대 rpm</th><th>목표 수명 토크 한계</th></tr>
       ${R.bearings.map((b, i) => `<tr class="${b.L10h < D.req.lifeH || b.s0peak < D.req.s0 ? 'bad' : ''}"><td>${b.stage}단</td><td>${fmt(b.Peq, 0)}</td><td>${fmtH(b.L10h)}</td><td>${fmtH(b.L50h)}</td><td>${fmt(b.s0peak, 2)}</td><td>${fmt(b.s0emerg, 2)}</td><td>${fmt(b.planetRpm, 0)}</td><td>${fmt(R.bearingCap[i], 1)} N·m</td></tr>`).join('')}</table>
       <p class="note">유성 1개당 반경 하중 = 두 치합 접선력 합 × Kγ × Kv. L50은 와이블 기울기 1.5 가정.</p></div>
       <div class="card"><h3>출력 메인 베어링</h3><div class="grid">
        <label class="f">이름<input data-p="outBearing.name" data-t="str" value="${esc(D.outBearing.name)}"></label>
        ${sel('outBearing.type', '형식', [['roller', '크로스 롤러 (p = 10/3)'], ['ball', '4점 접촉 볼 (p = 3)']])}
        ${num('outBearing.C', '동정격 C N')}${num('outBearing.C0', '정정격 C0 N')}${num('outBearing.dp', '롤러 피치원 dp mm')}${num('outBearing.Z', '롤러 수 Z (0=분포 계산 끔)')}${num('outBearing.Dw', '롤러 지름 Dw mm')}${num('outBearing.Lw', '롤러 유효 길이 Lw mm')}${num('outBearing.preload', '예압 µm (음수=틈새)')}${num('outBearing.Km', '카탈로그 모멘트 강성 N·m/arcmin (비교용)')}</div>
        <div class="scroll"><table><tr><th>출력 rpm</th><th>Fr / Fa / M (정격)</th><th>등가 하중 Peq N</th><th>L10 h</th><th>s0 피크</th><th>s0 비상</th><th>기울기 정격</th><th>기울기 피크</th></tr>
        <tr class="${ob.L10h < D.req.lifeH || ob.s0peak < D.req.s0 ? 'bad' : ''}"><td>${fmt(ob.outRpm, 1)}</td><td>${fmt(ob.ext.Fr, 0)} N / ${fmt(ob.ext.Fa, 0)} N / ${fmt(ob.ext.M, 2)} N·m</td><td>${fmt(ob.Peq, 0)}</td><td>${fmtH(ob.L10h)}</td><td>${fmt(ob.s0peak, 2)}</td><td>${fmt(ob.s0emerg, 2)}</td><td>${fmt(ob.tiltRated, 3)}′</td><td>${fmt(ob.tiltPeak, 3)}′</td></tr></table></div>
        ${ob.roll ? `<h3 style="margin-top:14px">롤러 하중분포 (모델)</h3><div class="scroll"><table><tr><th>조건</th><th>Fr / Fa / M</th><th>최대 롤러 하중 N</th><th>평균 N</th><th>하중 받는 롤러</th><th>최대 접촉응력 MPa</th><th>접촉 s0</th><th>기울기</th><th>모멘트 강성 (모델)</th></tr>
        ${['rated', 'peak', 'emerg'].map(k => { const q = ob.roll[k], M = ob.ext.M * q.k; return `<tr class="${q.s0 < D.req.s0 ? 'bad' : ''}"><td>${{ rated: '정격', peak: '피크', emerg: '비상' }[k]}</td><td>${fmt(ob.ext.Fr * q.k, 0)} / ${fmt(ob.ext.Fa * q.k, 0)} N / ${fmt(M, 2)} N·m</td><td>${fmt(q.Qmax, 0)}</td><td>${fmt(q.Qmean, 0)}</td><td>${q.loaded} / ${q.Z}</td><td>${fmt(q.p0, 0)}</td><td>${fmt(q.s0, 2)}</td><td>${fmt(q.tiltArcmin, 3)}′</td><td>${q.tiltArcmin > 1e-6 ? fmt(M / q.tiltArcmin, 0) + ' N·m/′' : '—'}</td></tr>`; }).join('')}</table></div>
        <p class="note">교차 배열 롤러(접촉각 45°)를 반경·축·기울기 3자유도로 풀고, 롤러 강성은 Palmgren 선접촉식(δ = 2·3.84×10⁻⁵·Q^0.9/L^0.8)입니다. 접촉 s0 = (4000 MPa / 최대 접촉응력)². 모델 기울기는 마지막 단 기어의 치폭 방향 오정렬(fsh)로 들어갑니다 (7단계 표의 '출력베어링' 값). 링 하우징·캐리어 판의 변형은 포함하지 않습니다.</p>` : ''}
        <p class="note">등가 하중 P = X(Fr + 2000·M/dp) + Y·Fa. Fa/(Fr + 2000M/dp) ≤ 1.5이면 X 1, Y 0.45, 넘으면 X·Y 0.67 (크로스 롤러 카탈로그 식). 정적 P0 = Fr + 2000M/dp + 0.44Fa. 외부 하중은 2단계 관절 케이스에서 오며, 기울기 = M / 모멘트 강성. 기본 C·C0·강성은 예시값입니다.</p></div>
       <div class="card"><h3>감속기 한계</h3><p class="big">${fmt(R.reducerCap, 1)}<small> N·m · ${esc(R.reducerGov)}</small></p></div>`;
  },
  scar() {
    const fields = D.stages.slice(0, D.config.stages).map((s, i) => {
      const pin = `stages.${i}.pin`, carrier = `stages.${i}.carrier`, double = s.pin.type !== 'single';
      const shape = R?.ctx?.stages[i]?.carrier;
      const auto = (label, value) => Number.isFinite(value) ? `${label} · 적용 ${fmt(value, 2)}` : label;
      return `<div class="card"><h3>${i + 1}단 캐리어·유성 핀</h3><div class="grid">
        ${sel(pin + '.type', '지지 형식', [['double', '양단 지지'], ['single', '편단 지지']])}
        ${num(carrier + '.outerD', auto('캐리어 최대외경 (mm)', shape?.outerD))}
        ${num(carrier + '.innerD', auto('캐리어 내경 (mm)', shape?.innerD))}
        ${num(pin + '.wall', '지지판 한 장 두께 (mm)')}
        ${double ? num(carrier + '.groove', auto('중앙 홈 축방향 폭 (mm)', shape?.groove)) + num(carrier + '.pocket', auto('유성 안착부 폭 (mm)', shape?.pocket)) : num(carrier + '.axialClearance', '지지판·유성기어 사이 간격 (mm)', { min: 0 })}
        ${num(carrier + '.bossD', auto('보스 외경 (mm)', shape?.bossD))}${num(carrier + '.bossT', '보스 두께 (mm, 0=없음)', { min: 0 })}
        ${num(pin + '.d', '핀·조립홀 명목 지름 (mm)')}
        ${sel(pin + '.holeMode', '핀 조립홀', [['through', '관통'], ['blind', '깊이 지정']])}
        ${s.pin.holeMode === 'blind' ? num(pin + '.depth', auto('원통 깊이 (mm)', shape?.hole?.autoDepth)) : ''}
        ${sel(pin + '.material', '핀 소재', [['SUJ2', 'SUJ2'], ['SCM440', 'SCM440'], ['S45C', 'S45C']])}
        ${sel(carrier + '.material', '캐리어 소재', [['S45C', 'S45C'], ['SCM440', 'SCM440'], ['SUJ2', 'SUJ2']])}
        ${num(pin + '.allow', '핀 허용 굽힘 (MPa)')}
        ${double ? num(carrier + '.webW', '등가 기둥 원주 폭 (mm)') + num(carrier + '.webH', '등가 기둥 반경 두께 (mm)') : ''}
      </div></div>`;
    }).join('');
    const header = head('10. 캐리어·핀', '유성기어 작용 중심거리에서 핀 PCD와 홀 좌표를 결정합니다. 같은 지지판·핀 치수를 3D, BOM, 굽힘·면압 계산에 사용합니다.');
    if (!R?.ctx || R.errors?.length) return header + fields + errBox();
    return header + fields + `
       <div class="card scroll"><h3>조립·가공 치수 (mm)</h3>
       <table><tr><th>단</th><th>핀 배치 PCD</th><th>캐리어 내 / 외경</th><th>중앙 홈 / 안착부</th><th>보스 외경 × 높이</th><th>홀 원통 길이</th><th>드릴 끝</th><th>핀 전체 길이</th><th>판 내 체결 길이</th><th>지지 스팬 / 외팔 길이</th></tr>
       ${R.carrierPin.map(({ stage, geometry: g }) => `<tr><td>${stage}단</td><td>Ø${fmt(g.drivePCD, 3)}</td><td>Ø${fmt(g.innerD)} / Ø${fmt(g.outerD)}</td><td>${g.double ? fmt(g.groove) + ' / ' + fmt(g.pocket) : '—'}</td><td>${g.boss ? 'Ø' + fmt(g.bossD) + ' × ' + fmt(g.bossT) : '—'}</td><td>${fmt(g.hole.depth, 3)}</td><td>${g.hole.mode === 'blind' ? '118° · ' + fmt(Math.abs(g.hole.tip - g.hole.end), 3) : '관통'}</td><td>${fmt(g.pinLength, 3)}</td><td>${g.engagement.map(v => fmt(v, 3)).join(' / ')}</td><td>${fmt(g.span, 3)}</td></tr>`).join('')}
       </table><p class="note">1단 보스는 입력측, 2단 보스는 출력측입니다. 핀 홀이 보스 안에 있으면 관통 길이에 보스 두께를 더합니다. 막힌 홀의 118° 끝은 핀 삽입 길이에서 제외합니다. 편단 핀 전체 길이에는 기어를 지나는 돌출부를 포함합니다.</p></div>
       <div class="card"><div class="grid">${num('carrier.allowP', '캐리어 구멍 허용 면압 MPa')}${num('carrier.allowB', '캐리어 기둥 허용 굽힘 MPa')}</div></div>
       <div class="card scroll"><h3>캐리어 강성 (양단 지지 캐리어)</h3><table><tr><th>단</th><th>기둥 강성 N/mm</th><th>비틀림 와인드업 정격 µrad</th><th>핀 기울기 정격 µrad</th><th>fsh 기여 µm</th><th>기둥 굽힘 피크 MPa</th><th>안전율</th><th>캐리어 비틀림 강성 N·m/rad</th></tr>
       ${R.carrierPin.map((c, i) => { const r = c.car.rated, pk = c.car.peak; return r.double ? `<tr class="${c.Sweb < 1 ? 'bad' : ''}"><td>${c.stage}단</td><td>${fmt(r.kweb, 0)}</td><td>${fmt(r.windup * 1e6, 1)}</td><td>${fmt(r.slope * 1e6, 1)}</td><td>${fmt(R.rated.rows.find(x => x.stage === c.stage)?.f.fshCar, 2)}</td><td>${fmt(pk.sigma, 0)}</td><td>${fmt(c.Sweb, 2)}</td><td>${fmt(r.ktor, 0)}</td></tr>` : `<tr><td>${c.stage}단</td><td colspan="7" class="l note">편단 지지: 기둥 없음 · 핀 외팔보 처짐만 반영 (판은 강체)</td></tr>`; }).join('')}</table>
       <p class="note">양단 지지 캐리어는 핀 하중의 절반이 반대쪽 판에서 기둥(유성 사이, 핀 PCD 위치, 길이는 중앙 홈의 축방향 폭)을 거쳐 출력 판으로 갑니다. 중앙 연결부를 사용자 지정 등가 단면의 양단 고정 보(굽힘 + 전단)로 보고 두 판 사이 비틀림 와인드업을 구하며, 이것이 핀을 원주 방향으로 기울여 두 치합의 fsh에 더해집니다. 캐리어 비틀림 강성은 13단계 비틀림 강성에도 들어갑니다. 판 자체 굽힘은 포함하지 않습니다.</p></div>
       <div class="card scroll"><table><tr><th>단</th><th>조건</th><th>핀 하중 N</th><th>굽힘 σ MPa</th><th>전단 τ MPa</th><th>구멍 면압 MPa</th><th>처짐 µm</th><th>치폭 기울기 µm</th></tr>
       ${R.carrierPin.map(c => ['rated', 'peak', 'emerg'].map(k => `<tr class="${k !== 'rated' && (c[k].sigma > c.allow || c[k].p > c.carrierAllowP) ? 'bad' : ''}"><td>${c.stage}단</td><td>${{ rated: '정격', peak: '피크', emerg: '비상' }[k]}</td><td>${fmt(c[k].F, 0)}</td><td>${fmt(c[k].sigma, 0)}</td><td>${fmt(c[k].tau, 1)}</td><td>${fmt(c[k].p, 1)}</td><td>${k === 'rated' ? fmt(c.rated.defl, 2) : ''}</td><td>${k === 'rated' ? fmt(Math.abs(c.rated.tilt), 3) : ''}</td></tr>`).join('')).join('')}</table>
       <p class="note">핀 보 모델에는 위 표의 지지 스팬 또는 외팔 길이를 씁니다. 구멍 면압은 각 판 반력과 해당 원통 체결 길이로 구한 값 중 최대값입니다. 피크 기준 굽힘 안전율 ${R.carrierPin.map(c => fmt(c.Sbend, 2)).join(' / ')}, 구멍 면압 안전율 ${R.carrierPin.map(c => fmt(c.Spress, 2)).join(' / ')} (1단 / 2단). 피크 시 캐리어 전달 토크 ${R.carrierPin.map(c => fmt(c.carrierTorque, 1)).join(' / ')} N·m. 핀 지지판은 강체로 가정합니다.</p></div>`;
  },
  s10() {
    if (!R?.ctx || R.errors?.length) return head('13. 성능 예측', '') + errBox();
    return head('13. 성능 예측', '효율·백래시·강성을 모델로 추정합니다. 모두 가정이 들어간 추정값이며 범위를 함께 보세요.') +
      `<div class="card"><div class="grid">${sel('perf.muMode', '마찰계수', [['model', 'ISO/TR 14179-2 식 (윤활 조건 반영)'], ['fixed', '고정값']])}${D.perf.muMode === 'fixed' ? num('perf.mu', '치면 마찰계수 μ') : ''}${num('perf.otherLoss', '기타 손실 %/단 (베어링·씰·교반)')}
        ${D.stages.slice(0, D.config.stages).map((s, i) => num(`stages.${i}.jt.0`, `${i + 1}단 썬–유성 백래시 µm`) + num(`stages.${i}.jt.1`, `${i + 1}단 유성–링 백래시 µm`)).join('')}</div></div>
       <div class="two"><div class="card"><h3>효율 (정격)</h3><p class="big">${fmt(R.eff.total * 100, 1)}<small> %</small></p>
        <table><tr><th>단</th><th>썬–유성</th><th>유성–링</th><th>기어만</th><th>단 효율</th></tr>${R.eff.stages.map(s => `<tr><td>${s.stage}단</td><td>${fmt(s.etaMesh[0] * 100, 2)}</td><td>${fmt(s.etaMesh[1] * 100, 2)}</td><td>${fmt(s.gear * 100, 2)}</td><td>${fmt(s.eta * 100, 2)}</td></tr>`).join('')}</table>
        <p class="note">치합 손실: Ohlendorf 손실계수 × μ, μ는 ${D.perf.muMode === 'fixed' ? '고정값' : '12단계 윤활 조건(운전 점도·속도·하중·조도)에서 ISO/TR 14179-2 식'}. 고정 링·썬 입력 유성 효율식.</p></div>
       <div class="card"><h3>백래시 · 강성</h3><table>
        <tr><td>출력 백래시 (치합만)</td><td><b>${fmt(R.backlash.arcmin, 2)} arcmin</b></td></tr>
        ${R.backlash.stages.map(s => `<tr><td>${s.stage}단 기여 (출력축 환산)</td><td>${fmt(s.arcminOut, 2)} arcmin</td></tr>`).join('')}
        <tr><td>비틀림 강성 (치합 + 핀 + 캐리어)</td><td>${fmt(R.stiffness.NmPerArcmin, 2)} N·m/arcmin</td></tr>
        ${R.stiffness.stages.map(s => `<tr><td>${s.stage}단 캐리어 기준 · 치합+핀 / 캐리어</td><td>${fmt(s.Kmesh * Math.PI / 10800, 1)} / ${Number.isFinite(s.Kcar) ? fmt(s.Kcar * Math.PI / 10800, 1) : '강체'} N·m/′</td></tr>`).join('')}</table>
        <p class="note">하우징·출력 베어링 비틀림·백래시 영역(저토크 비선형)은 뺀 값입니다. 정격 근처의 접선 강성에 해당합니다.</p></div></div>`;
  },
  s11() {
    return head('14. 가상 검증', '실측 대신 불확실성을 계산합니다. 공차(잇줄·피치·유성 위치)를 공정 분포로, 재료 피로강도를 대수정규 산포로 뽑아 수명과 정격 한계의 분포를 구합니다. 민감도는 어떤 결정이 결과를 가장 크게 바꾸는지 보여 줍니다.') +
      `<div class="card"><div class="grid">${num('mc.samples', '표본 수')}${num('mc.utilization', '공차 활용률 (3σ / 공차)')}${num('reliability.covH', '접촉 피로 산포 σln')}${num('reliability.covF', '굽힘 피로 산포 σln')}</div>
       <p><button class="btn primary" id="runMC">가상 검증 실행</button> <button class="btn" id="runSens">민감도 계산</button></p><div class="prog"><i id="prog"></i></div><div id="mcOut">${mcHTML()}</div></div>
       <div class="card"><h3>민감도 · ISO 설계 정격 기준</h3><div id="sensOut">${sensHTML()}</div></div>`;
  },
  reg() {
    if (!R?.register) return head('15. 가정 대장', '') + errBox();
    return head('15. 가정 대장', '계산에 들어간 모든 계수와 그 근거 등급입니다. 규격 = ISO·AGMA 식, 모델 = 물리 모델 계산, 가정 = 사람이 고른 값. 가정 항목이 결과의 신뢰도를 정합니다.') +
      `<div class="card scroll"><table><tr><th class="l">구분</th><th class="l">항목</th><th class="l">값</th><th class="l">근거</th><th class="l">설명</th></tr>
      ${R.register.map(r => `<tr><td class="l">${r.group}</td><td class="l">${esc(r.item)}</td><td class="l">${esc(String(r.value))}</td><td class="l">${tag(r.src)}</td><td class="l note">${esc(r.basis)}</td></tr>`).join('')}</table></div>`;
  }
};

function clampPct(x) { return Math.max(0, Math.min(100, x)); }
function dutyChart() {
  const d = D.req.duty, tot = d.reduce((s, l) => s + (l.time || 0), 0) || 1, maxT = Math.max(...d.map(l => l.torque), 100);
  return `<div style="display:flex;align-items:flex-end;height:110px;gap:2px;border-bottom:1px solid var(--rule);margin-top:10px">${d.map(l => `<div title="${l.torque}% × ${l.time}%" style="flex:${Math.max(l.time, .5) / tot};height:${l.torque / maxT * 100}%;background:var(--accent2);opacity:.6"></div>`).join('')}</div><p class="note">가로 = 시간 비율, 세로 = 토크</p>`;
}
function advice() {
  const out = [];
  const g = R.govRated;
  if (R.capacityLife < D.req.Trated && g) {
    if (g.mode.includes('피팅')) out.push('지배는 치면 피팅입니다. 재료(침탄)·치폭·크라우닝·정밀도 순으로 효과가 큽니다. 14단계 민감도로 확인하세요.');
    else out.push('지배는 치근 굽힘입니다. 모듈·전위·림 두께를 먼저 보세요.');
  }
  R.ctx.stages.forEach(s => { if (s.geo.meshes[0].eb > 0 && s.geo.meshes[0].eb < 1) out.push(`${s.i + 1}단 εβ ${fmt(s.geo.meshes[0].eb)} → 비틀림각이나 치폭으로 1 이상 또는 스퍼(0)로.`); });
  if (R.ctx.stages.some(s => s.mats.some(m => m.warnings.length))) out.push('표면경도가 ISO 재료표 범위를 넘습니다. 허용응력은 표 끝점으로 제한됩니다.');
  if (R.bearings.some(b => b.L10h < D.req.lifeH)) out.push('유성 베어링 수명이 부족합니다. 핀·베어링 크기를 키우세요.');
  if (R.rated?.stages?.some(s => s.Kg > 1.25)) out.push(`Kγ ${R.rated.stages.map(s => fmt(s.Kg, 2)).join(' / ')}: 유성 위치 공차(7단계)를 줄이거나 핀·치합 강성을 낮춰(유연 핀 등) 하중분배를 개선하세요.`);
  if (!out.length) out.push('모든 항목이 목표를 만족합니다. 14단계 가상 검증으로 분포까지 확인하세요.');
  return `<ul class="warns">${out.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`;
}
function mcHTML() {
  if (!MC) return '<p class="note">아직 실행하지 않았습니다. 표본 200개 기준 수 초 걸립니다.</p>';
  if (MC.error) return `<p class="bad">${esc(MC.error)}</p>`;
  const caps = MC.capacity.all.filter(Number.isFinite), lo = Math.min(...caps), hi = Math.max(...caps), nb = 24, bins = Array(nb).fill(0);
  caps.forEach(c => bins[Math.min(nb - 1, Math.floor((c - lo) / ((hi - lo) || 1) * nb))]++);
  const mx = Math.max(...bins);
  return `<div class="two"><div><h3>정격 한계 분포 · 목표 수명 ${D.req.lifeH} h</h3><div class="hist">${bins.map(b => `<i style="height:${b / mx * 100}%"></i>`).join('')}</div>
      <div class="legend"><span>${fmt(lo, 1)} N·m</span><span style="margin-left:auto">${fmt(hi, 1)} N·m</span></div>
      <table><tr><td>P10</td><td>${fmt(MC.capacity.p10, 2)} N·m</td></tr><tr><td><b>P50 (중앙값)</b></td><td><b>${fmt(MC.capacity.p50, 2)} N·m</b></td></tr><tr><td>P90</td><td>${fmt(MC.capacity.p90, 2)} N·m</td></tr></table></div>
    <div><h3>스펙트럼 수명 분포</h3><table><tr><td>P10</td><td>${fmtH(MC.life.p10)} h</td></tr><tr><td><b>P50</b></td><td><b>${fmtH(MC.life.p50)} h</b></td></tr><tr><td>P90</td><td>${fmtH(MC.life.p90)} h</td></tr>
      <tr><td>목표 ${D.req.lifeH} h 달성 확률</td><td class="${MC.passLife < .9 ? 'bad' : 'good'}"><b>${fmt(MC.passLife * 100, 0)} %</b></td></tr>
      <tr><td>Kγ 중앙 / P90</td><td>${fmt(MC.Kg.p50, 3)} / ${fmt(MC.Kg.p90, 3)}</td></tr><tr><td>KHβ 중앙 / P90</td><td>${fmt(MC.KHb.p50, 3)} / ${fmt(MC.KHb.p90, 3)}</td></tr></table>
      <p class="note">ISO 설계 판정 ${fmt(R?.capacityLife, 2)} N·m와의 차이는 99 % 신뢰도·공차 상한 대신 중앙값·공정 분포를 쓴 효과입니다.</p></div></div>`;
}
function sensHTML() {
  if (!SENS) return '<p class="note">"민감도 계산"을 누르세요.</p>';
  if (SENS.error) return `<p class="bad">${esc(SENS.error)}</p>`;
  const mx = Math.max(...SENS.cases.map(c => Math.abs(c.delta || 0)), 1);
  return `<p class="note">기준 ${fmt(SENS.base, 2)} N·m (목표 수명 정격). 막대는 하나만 바꿨을 때의 변화.</p>` + SENS.cases.map(c => {
    const w = Math.abs(c.delta || 0) / mx * 50, up = (c.delta || 0) >= 0;
    return `<div class="hbar"><span class="lab">${esc(c.label)}</span><span class="track"><i style="${up ? 'left:50%' : 'right:50%'};width:${w}%;background:${up ? 'var(--accent2)' : 'var(--brick)'}"></i><i style="left:50%;width:1px;background:var(--rule)"></i></span><span class="num">${fmt(c.value, 2)} (${up ? '+' : ''}${fmt(c.delta, 0)}%)</span></div>`;
  }).join('');
}

// ------------------------------------------------------------------ after-render hooks
let MAPV = null, MAPSTATE = null;
const AFTER = {
  map(m) {
    if (!window.PGDMap) return;
    const E = procEval(); if (!E.length) return;
    MAPV = PGDMap.mount(m.querySelector('#mapHost'), { E, focus: ANCHOR || MAPSTATE?.sel || MAPSTATE?.focus, onOpen: (st, a) => go(st, a) });
  },
  proc(m) { m.querySelectorAll('[data-go]').forEach(li => { const g = () => go('st-' + itemStage(li.dataset.id), li.dataset.id); li.onclick = g; li.onkeydown = e => { if (e.key === 'Enter') g(); }; }); },
  s1(m) {
    m.querySelector('#cApply').onclick = () => { E.applyCase(D, m.querySelector('#cPos').value + '-' + m.querySelector('#cAxis').value, R?.ratio); D.anim.rpm = D.req.rpm; changed(); };
    m.querySelector('#addDuty').onclick = () => { D.req.duty.push({ torque: 50, time: 10, rpm: 0 }); changed(); };
    m.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { D.req.duty.splice(+b.dataset.del, 1); changed(); });
  },
  s2(m) {
    m.querySelector('#fGo').onclick = () => {
      const target = +m.querySelector('#fRatio').value, n = +m.querySelector('#fN').value, [s0, s1] = m.querySelector('#fS').value.split('-').map(Number), rmax = +m.querySelector('#fR').value;
      const g = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
      const res = [];
      for (let s = s0; s <= s1; s++) for (let p = 9; p <= 120; p++) {
        const r = s + 2 * p; if (r > rmax || (s + r) % n) continue;
        const ratio = 1 + r / s, a = (s + p) / 2, gap = 2 * a * Math.sin(Math.PI / n) - (p + 2);
        if (gap <= 0.5) continue;
        res.push({ s, p, r, ratio, err: Math.abs(ratio - target) / target, hunt: g(s, p) === 1 && g(p, r) === 1 });
      }
      res.sort((a, b) => a.err - b.err || b.hunt - a.hunt);
      m.querySelector('#fOut').innerHTML = `<div class="scroll"><table><tr><th>S</th><th>P</th><th>R</th><th>감속비</th><th>오차</th><th>헌팅</th><th></th></tr>${res.slice(0, 12).map(x => `<tr><td>${x.s}</td><td>${x.p}</td><td>${x.r}</td><td>${fmt(x.ratio, 4)}</td><td>${fmt(x.err * 100, 2)} %</td><td>${x.hunt ? '예' : ''}</td><td><button class="btn" data-ap="${x.s},${x.p},${n}">1단에 적용</button></td></tr>`).join('')}</table></div>`;
      m.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => { const [s, p, nn] = b.dataset.ap.split(',').map(Number); Object.assign(D.stages[0], { s, p, n: nn }); if (D.config.sharedRing) { D.stages[1].s = s; D.stages[1].n = nn; } changed(); });
    };
  },
  s3(m) {
    mountViewer(m.querySelector('#viewer'), 'gears');
    const out = m.querySelector('#aOut'), rd = () => {
      if (!out || !R?.ctx) return; let n = +D.anim.rpm || 0; const lines = [];
      R.ctx.stages.forEach((s, i) => { const nc = n / s.geo.ratio, np = (n - nc) * s.geo.parts[0].z / s.geo.parts[1].z; lines.push(`${i + 1}단 썬 ${fmt(n, 1)} → 캐리어 ${fmt(nc, 2)} rpm · 유성 자전 ${fmt(np, 1)} rpm`); n = nc; });
      out.innerHTML = lines.join('<br>') + `<br><b>출력 ${fmt(n, 2)} rpm</b> · 화면 ${fmt(D.anim.rpm * D.anim.slow, 2)} rpm`;
    };
    rd();
    const r = m.querySelector('#aRpm'), s = m.querySelector('#aSlow');
    if (r) r.onchange = () => { D.anim.rpm = Math.max(0, +r.value || 0); save(); rd(); };
    if (s) s.onchange = () => { D.anim.slow = +s.value; save(); rd(); };
    const p = m.querySelector('#vPlay'), g = m.querySelector('#vRing'); let ringOn = true;
    if (p) p.onclick = () => { const on = VIEW3D?.togglePlay(); p.textContent = on ? '일시정지' : '재생'; };
    if (g) g.onclick = () => { ringOn = !ringOn; VIEW3D?.setOpacity(D.config.sharedRing ? 'ring' : null, 1); ['ring', 'ring1', 'ring2'].forEach(id => VIEW3D?.setVisible(id, ringOn)); g.textContent = ringOn ? '링 숨기기' : '링 보이기'; };
  },
  overview(m) { mountOverview(m); },
  shous(m) { bindDrawing(m); const b = m.querySelector('#geoReset'); if (b) b.onclick = () => { D.geom = {}; changed(); }; },
  smat(m) { (AFTER.s6 || (() => { }))(m); (AFTER.slub || (() => { }))(m); },
  s11(m) {
    m.querySelector('#runMC').onclick = () => runJob('mc', r => { MC = r; renderVerdict(); renderRail(); const o = m.querySelector('#mcOut'); if (o) o.innerHTML = mcHTML(); });
    m.querySelector('#runSens').onclick = () => runJob('sens', r => { SENS = r; const o = m.querySelector('#sensOut'); if (o) o.innerHTML = sensHTML(); });
  }
};
function runJob(type, done) {
  const id = ++jobId, bar = $('#prog');
  if (bar) bar.style.width = '2%';
  const finish = (r) => { if (bar) bar.style.width = '100%'; done(r); };
  try {
    if (!worker) worker = new Worker('worker.js?v=carrier-pin-1');
    worker.onmessage = e => { if (e.data.id !== id) return; if (e.data.progress && bar) bar.style.width = (e.data.progress * 100) + '%'; if (e.data.done) finish(e.data.error ? { error: e.data.error } : e.data.result); };
    worker.onerror = () => { worker = null; inline(); };
    worker.postMessage({ id, type, design: JSON.parse(JSON.stringify(D)) });
  } catch (e) { inline(); }
  function inline() { setTimeout(() => { try { finish(type === 'mc' ? E.monteCarlo(D, D.mc.samples) : E.sensitivity(D)); } catch (err) { finish({ error: err.message }); } }, 30); }
}

// ------------------------------------------------------------------ 3D (viewer3d.js) glue
let VIEW3D = null;
const OVSTATE = { view: null, sel: null };
const HOUS_DEF = { wall: 3, coverT: 4, boltN: 8, boltD: 3, flangeT: 5 };
function ensureD() {
  D.housing = Object.assign({}, HOUS_DEF, D.housing || {});
  D.view = D.view || {};
  D.anim = D.anim || { rpm: 1000, slow: .02 };
  D.options = D.options || {};
  for (const o of (window.PGD3D?.OPTIONS || [])) D.options[o.key] = Object.assign({ on: true, lock: false }, D.options[o.key] || {});
}
// ------------------------------------------------------------------ components & optional parts
function componentsHTML() {
  const n = R?.ctx?.stages?.length || D.config.stages, shared = D.config.sharedRing && n > 1;
  const rows = Array.from({ length: n }, (_, i) => `<tr><td>${i + 1}단</td><td>S${i + 1} 썬기어</td><td>P${i + 1} 유성기어</td><td>${shared ? (i ? '〃 (공유)' : 'R1-2 링기어') : `R${i + 1} 링기어`}</td><td>C${i + 1} 캐리어${i === n - 1 ? ' (출력)' : ''}</td></tr>`).join('');
  const opts = (window.PGD3D?.OPTIONS || []).filter(o => !(o.key === 's2brg' && n < 2)).map(o => `<tr><td class="l">${esc(o.label)}</td>
    <td><label class="sw"><input type="checkbox" data-p="options.${o.key}.on" data-t="bool" ${D.options?.[o.key]?.on !== false ? 'checked' : ''}> 표시</label></td>
    <td><label class="sw"><input type="checkbox" data-p="options.${o.key}.lock" data-t="bool" ${D.options?.[o.key]?.lock ? 'checked' : ''}> 잠금</label></td></tr>`).join('');
  return `<div class="card"><h3>기본 구성요소</h3><p class="note" style="margin-top:0">링기어 고정 · 썬 입력 · 캐리어 출력. S·P·R은 4단계 기어 제원에서, C는 10단계 캐리어–핀에서 형상이 정해집니다.</p>
    <table class="comp"><tr><th>단</th><th>썬</th><th>유성</th><th>링</th><th>캐리어</th></tr>${rows}</table></div>
    <div class="card"><h3>옵션 부품</h3><p class="note" style="margin-top:0">표시를 끄면 3D·BOM·도면에서 빠집니다. 잠금은 치수 입력을 고정합니다. 강도 계산(유성 베어링·출력 베어링·핀 판정)은 표시 여부와 관계없이 그대로 수행합니다.</p>
    <table class="comp opt"><tr><th class="l">부품</th><th>표시</th><th>잠금</th></tr>${opts}</table></div>`;
}
// ------------------------------------------------------------------ part drawings
const DWSTATE = { id: null };
function drawingHTML(sel) {
  const bl = bomList(); if (!bl.length || !window.PGDDraw) return '';
  const id = bl.some(p => p.id === sel) ? sel : bl.some(p => p.id === DWSTATE.id) ? DWSTATE.id : bl[0].id;
  DWSTATE.id = id;
  return `<div class="card dw" id="dwg"><div class="dw-h"><h3>부품 도면</h3><label class="f">부품<select id="dwSel">${bl.map(p => `<option value="${p.id}" ${p.id === id ? 'selected' : ''}>${p.no}. ${esc(p.name)}${p.locked ? ' 🔒' : ''}</option>`).join('')}</select></label></div>
    <div class="dw-body">${PGDDraw.render(R, D, id)}</div></div>`;
}
function bindDrawing(root, onSel) {
  const card = root.querySelector('#dwg'); if (!card) return;
  card.querySelector('#dwSel').onchange = e => { DWSTATE.id = e.target.value; if (onSel) onSel(DWSTATE.id); else card.outerHTML = drawingHTML(DWSTATE.id), bindDrawing(root, onSel); };
  const edit = g => {
    if (g.classList.contains('lk')) return;
    card.querySelector('.dw-in')?.remove();
    const body = card.querySelector('.dw-body'), br = body.getBoundingClientRect(), gr = g.getBoundingClientRect();
    const box = document.createElement('div'); box.className = 'dw-in';
    box.style.left = Math.max(0, Math.min(br.width - 180, gr.left - br.left + gr.width / 2 - 90)) + 'px';
    box.style.top = (gr.top - br.top + gr.height + 4) + 'px';
    box.innerHTML = `<label>${esc(g.dataset.l)} (mm)<input type="number" step="any" value="${g.dataset.v}"></label><span class="note">Enter 적용 · Esc 취소 · 빈칸 = 자동</span>`;
    body.appendChild(box);
    const inp = box.querySelector('input'); inp.focus(); inp.select();
    let done = false;
    const apply = ok => {
      if (done) return; done = true; box.remove();
      if (!ok || inp.value === g.dataset.v) return;
      const v = inp.value === '' ? null : Number(inp.value);
      if (v != null && !(Number.isFinite(v) && v >= 0)) return;
      set(g.dataset.p, v); changed();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') apply(true); else if (e.key === 'Escape') apply(false); };
    inp.onblur = () => apply(true);
  };
  card.querySelectorAll('.dm.ed').forEach(g => { g.onclick = () => edit(g); g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(g); } }; });
}
function partNames() { try { return Object.fromEntries(PGD3D.partsList(R, D).map(p => [p.id, p.name])); } catch (e) { return {}; } }
function mountViewer(host, mode = 'gears', extra = {}) {
  if (VIEW3D) { VIEW3D.dispose(); VIEW3D = null; }
  if (!host) return;
  if (!window.THREE || !window.PGD3D || !R?.ctx || R.errors?.length) {
    host.insertAdjacentHTML('beforeend', `<p class="note" style="padding:12px">${!window.THREE ? '3D 라이브러리(three.js)를 불러오지 못했습니다. 인터넷 연결을 확인하세요.' : '3D 표시는 계산 오류가 없을 때 나타납니다.'}</p>`);
    return;
  }
  ensureD();
  try {
    VIEW3D = PGD3D.mount(host, Object.assign({ R, D, mode, names: partNames(), save, initialView: mode === 'full' ? OVSTATE.view : null, onDetail: id => { const p = bomList().find(x => x.id === id); if (p) go(p.step); } }, extra));
    if (VIEW3D) VIEW3D.full = mode === 'full';
  } catch (e) { console.error(e); host.insertAdjacentHTML('beforeend', `<p class="note" style="padding:12px">3D 생성 오류: ${esc(e.message)}</p>`); }
}
function bomList() { try { return PGD3D.partsList(R, D); } catch (e) { return []; } }
const partOf = (stage, part) => part === 2 ? (D.config.sharedRing && R.ctx.stages.length > 1 ? 'ring' : `ring${stage}`) : `${['sun', 'planet'][part]}${stage}`;

// failing verdict items → parts on the model
function buildIssues() {
  if (!R?.verdict) return [];
  const list = [], push = (partId, item, sev = 'bad', kind = 'gear') => {
    let g = list.find(x => x.partId === partId);
    if (!g) { g = { partId, items: [], sev, kind }; list.push(g); }
    g.items.push(item); if (sev === 'bad') g.sev = 'bad';
  };
  const gov = R.govRated?.row, govId = gov ? partOf(gov.stage, gov.part) : 'sun1';
  for (const v of R.verdict) {
    if (v.ok) continue;
    let id = govId, kind = 'gear';
    if (v.k.startsWith('부하 스펙트럼')) { const s = R.spectrum.gov; if (s) id = partOf(s.stage, s.part); }
    else if (v.k.startsWith('유성 베어링')) { const b = R.bearings.reduce((m, x) => (Math.min(x.L10h / D.req.lifeH, x.s0peak / D.req.s0) < Math.min(m.L10h / D.req.lifeH, m.s0peak / D.req.s0) ? x : m)); id = `needle${b.stage}`; kind = 'bearing'; }
    else if (v.k.startsWith('출력 베어링')) { id = 'xroller'; kind = 'obearing'; }
    else if (v.k.startsWith('유성 핀')) { const c = R.carrierPin.reduce((m, x) => Math.min(x.Sbend, x.Spress, x.Sweb) < Math.min(m.Sbend, m.Spress, m.Sweb) ? x : m); id = Math.min(c.Sbend, c.Spress) <= c.Sweb ? `pin${c.stage}` : `carrier${c.stage}`; kind = 'carrier'; }
    else if (v.k.startsWith('스커핑')) { const l = R.lube.peak.reduce((m, x) => x.SB < m.SB ? x : m); id = `sun${l.stage}`; kind = 'lube'; }
    else if (v.k.startsWith('효율') || v.k.startsWith('출력 백래시')) { id = 'planet1'; kind = 'perf'; }
    push(id, v, 'bad', kind);
  }
  if (R.lube && R.lube.lambdaMin < 1) { const l = R.lube.meshes.reduce((m, x) => x.lambda < m.lambda ? x : m); push(`sun${l.stage}`, { k: '유막비 λ (경계 윤활)', value: l.lambda, target: 1, unit: '', note: '마모·마이크로피팅 주의' }, 'warn', 'lube'); }
  const names = partNames();
  list.forEach(g => g.title = `${names[g.partId] || g.partId} · ${g.items[0].k}${g.items.length > 1 ? ` 외 ${g.items.length - 1}` : ''}`);
  return list;
}

function overviewView() {
  if (!R || R.errors?.length) return head('1. 종합판정', '입력에 오류가 있어 계산하지 못했습니다.') + errBox();
  const issues = buildIssues();
  return `<div class="ov-head"><h2>1. 종합판정</h2><p class="lead">실측값 없이 규격식·물리 모델·명시된 가정으로 계산한 감속기입니다. 붉은 번호는 기준 미달 부위, 노란 번호는 주의 부위입니다. 부품을 누르면 상세가, 번호를 누르면 원인과 대책이 열립니다. 드래그 회전 · Shift+드래그 이동 · 휠 확대 · 더블클릭 기본 시점 · 우클릭 메뉴(배경: 보기 설정 / 부품: 투명·분해·단면·숨기기).</p></div>
    <div id="viewer" class="full">
      <div class="v3-bar" role="toolbar" aria-label="3D 보기">
        <button class="btn" id="tExp">분해</button>
        <label class="rng">분해 정도<input type="range" id="tExpR" min="0" max="100" value="0"></label>
        <span class="sep"></span>
        <button class="btn" id="tSec">단면</button>
        <label class="rng">단면 각도<input type="range" id="tSecA" min="0" max="180" value="0"></label>
        <span class="sep"></span>
        <button class="btn" id="tHome">기본 시점</button>
        <button class="btn" id="tPlay">회전 정지</button>
        <button class="btn" id="tBom" aria-expanded="true">BOM</button>
      </div>
      <div class="v3-bom" id="bom"></div>
      <div class="v3-card" id="pcard" hidden></div>
      <div class="v3-pop" id="ipop" hidden></div>
    </div>
    ${drawingHTML(OVSTATE.sel)}
    <div class="ov-sum">${issues.length ? `<div class="card"><h3>기준 미달·주의 ${issues.length}곳</h3><ol class="iss">${issues.map((g, k) => `<li class="${g.sev}"><button data-iss="${k}">${esc(g.title)}</button></li>`).join('')}</ol></div>` : '<div class="card"><h3 class="good">모든 항목이 기준을 만족합니다</h3></div>'}
    ${VIEWS.overviewOld().replace(/^<h2>.*?<\/h2><p class="lead">.*?<\/p>/s, '')}${componentsHTML()}</div>`;
}

function bomHTML(sel) {
  const L = bomList(), tot = L.reduce((s, p) => s + p.mass * p.qty, 0);
  return `<div class="bom-h"><b>BOM</b><span class="note">${L.length}종 · ${L.reduce((s, p) => s + p.qty, 0)}개 · 약 ${fmt(tot * 1000, 0)} g</span></div>
    <div class="bom-s"><table><tr><th>No</th><th class="l">부품</th><th>수량</th><th class="l">재료</th><th class="l">열처리</th><th>g</th><th>판정</th></tr>
    ${L.map(p => `<tr data-id="${p.id}" class="${p.id === sel ? 'sel' : ''}"><td>${p.no}</td><td class="l">${esc(p.name)}</td><td>${p.qty}</td><td class="l">${esc(p.material)}</td><td class="l">${esc(p.heat)}</td><td>${fmt(p.mass * 1000, 1)}</td><td>${p.verdict ? `<span class="${p.verdict.ok ? 'good' : 'bad'}">${p.verdict.ok ? '✓' : '✗'}</span>` : '—'}</td></tr>`).join('')}</table></div>`;
}
function dimsHTML(id) {
  let rows = []; try { rows = PGD3D.partSchema(R, D, id); } catch (e) { }
  if (!rows.length) return '';
  const field = r => {
    if (r.readonly) return esc(r.value ?? '—');
    if (r.options) return `<select data-p="${r.path}" data-t="str" ${r.lock ? 'disabled' : ''}>${r.options.map(([value, label]) =>
      `<option value="${esc(value)}" ${value === r.value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    return `<input type="number" step="${r.step ?? 'any'}" data-p="${r.path}" data-t="num" value="${esc(r.value ?? '')}" placeholder="${r.auto != null ? '자동 ' + fmt(r.auto, 2) : ''}" ${r.lock ? 'disabled' : ''}>`;
  };
  return `<table class="dims">${rows.map(r => `<tr><td>${esc(r.label)}${r.engine ? '' : ' <span class="tag 가정">형상</span>'}</td><td>${field(r)}</td></tr>`).join('')}</table>
    <p class="note">빈칸 = 자동값. ${rows.some(r => r.engine) ? '태그 없는 항목은 강도 계산에도 들어갑니다.' : ''} '형상'은 3D·중량에만 쓰입니다.</p>`;
}
function partCardHTML(id) {
  const p = bomList().find(x => x.id === id); if (!p) return '';
  return `<div class="pc-h"><b>${esc(p.name)}</b><button class="x" id="pcX" aria-label="닫기">×</button></div>
    <table><tr><td>수량</td><td>${p.qty}</td></tr><tr><td>재료 · 열처리</td><td>${esc(p.material)} · ${esc(p.heat)}</td></tr><tr><td>중량 (추정)</td><td>${fmt(p.mass * 1000, 1)} g</td></tr>
    ${p.verdict ? `<tr><td>판정</td><td class="${p.verdict.ok ? 'good' : 'bad'}">${p.verdict.ok ? '통과' : '미달'} · ${esc(p.verdict.text)}</td></tr>` : ''}</table>
    <h4>치수 (mm)</h4>${dimsHTML(id)}
    <button class="btn primary" id="pcGo">상세 설계 보기</button>`;
}
function issueHTML(g) {
  const gov = R.govRated?.row, f = gov?.f || {};
  const cause = g.kind === 'gear' && gov ? `<p class="note">지배 부위 ${esc(partLabel(gov))} ${esc(R.govRated.mode || '')} · Kγ ${fmt(f.Kg, 2)} · KHβ ${fmt(f.KHb, 2)} · Kv ${fmt(f.Kv, 2)} · ZNT ${fmt(f.ZNT, 2)} · σH ${fmt(gov.H, 0)} / σHP ${fmt(gov.HP, 0)} MPa</p>` : '';
  const fixes = {
    bearing: ['유성 베어링 동정격 C 큰 것으로 (폭·지름 증가)', '유성 핀 지름 증가 → 베어링 크기 확보', 'Kγ 개선 (위치 공차 축소·썬 지지 유격)'],
    obearing: ['출력 베어링 형번 상향 (dp·롤러 크기)', '예압 조정 · 외부 모멘트 경로 재검토', '실제 링크 하중으로 Fr·Fa·M 확정'],
    carrier: ['핀 지름 증가 또는 양단 지지', '캐리어 기둥 단면 증가', '핀 재료 강도 상향'],
    lube: ['EP 그리스 · 고점도 기유', '치면 조도 개선 (연삭·래핑)', '운전 온도 낮추기'],
    perf: ['치면 조도 개선 · 저마찰 그리스', '백래시 공차 축소']
  }[g.kind];
  const sens = g.kind === 'gear' ? (SENS ? `<ol class="fx">${SENS.cases.filter(c => Number.isFinite(c.value) && c.value > SENS.base).sort((a, b) => b.value - a.value).slice(0, 3).map(c => `<li>${esc(c.label)} → <b>${fmt(c.value, 1)} N·m</b> <span class="good">+${fmt((c.value / SENS.base - 1) * 100, 0)}%</span></li>`).join('')}</ol>` : `<button class="btn" id="ipSens">대책 효과 계산 (민감도)</button>`) : `<ol class="fx">${fixes.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  return `<div class="pc-h"><b>${esc(g.title)}</b><button class="x" id="ipX" aria-label="닫기">×</button></div>
    <table>${g.items.map(v => `<tr class="${g.sev}"><td>${esc(v.k)}</td><td>${fmtV(v)}${v.target != null ? ` / ${v.unit === 'h' ? fmtH(v.target) + ' h' : fmt(v.target, 2)}` : ''}</td></tr>`).join('')}</table>
    ${cause}<h4>바로 해볼 대책</h4>${sens}`;
}
function mountOverview(m) {
  const host = m.querySelector('#viewer'); if (!host) return;
  const issues = buildIssues();
  const card = m.querySelector('#pcard'), pop = m.querySelector('#ipop'), bom = m.querySelector('#bom');
  let sel = null;
  const showCard = id => {
    sel = id; bom.innerHTML = bomHTML(id); bindBom();
    OVSTATE.sel = id;
    if (id && id !== DWSTATE.id) { const dw = m.querySelector('#dwg'); if (dw) { dw.outerHTML = drawingHTML(id); bindDrawing(m, onDwSel); } }
    if (!id) { card.hidden = true; return; }
    card.innerHTML = partCardHTML(id); card.hidden = false; bindInputs(card);
    card.querySelector('#pcX').onclick = () => { card.hidden = true; OVSTATE.sel = null; VIEW3D?.select(null); };
    card.querySelector('#pcGo').onclick = () => { const p = bomList().find(x => x.id === id); if (p) go(p.step); };
  };
  const showIssue = g => {
    pop.innerHTML = issueHTML(g); pop.hidden = false;
    pop.querySelector('#ipX').onclick = () => { pop.hidden = true; };
    const b = pop.querySelector('#ipSens'); if (b) b.onclick = () => { b.disabled = true; b.textContent = '계산 중…'; runJob('sens', r => { SENS = r; if (!pop.hidden) showIssue(g); }); };
  };
  const onDwSel = id => { VIEW3D?.select(id, true); showCard(id); const dw = m.querySelector('#dwg'); if (dw) { dw.outerHTML = drawingHTML(id); bindDrawing(m, onDwSel); } };
  bindDrawing(m, onDwSel);
  const bindBom = () => bom.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { VIEW3D?.select(tr.dataset.id, true); showCard(tr.dataset.id); });
  bom.innerHTML = bomHTML(null); bindBom();
  mountViewer(host, 'full', { onPick: id => showCard(id), onIssue: g => showIssue(g) });
  VIEW3D?.setIssues(issues);
  if (OVSTATE.sel && bomList().some(p => p.id === OVSTATE.sel)) { VIEW3D?.select(OVSTATE.sel, false); showCard(OVSTATE.sel); }
  const iv = OVSTATE.view;
  if (iv) { m.querySelector('#tExpR').value = Math.round((iv.explode || 0) * 100); m.querySelector('#tExp').textContent = iv.explode > .5 ? '조립' : '분해'; m.querySelector('#tSecA').value = iv.secAngle || 0; m.querySelector('#tSec').classList.toggle('on', !!iv.section); m.querySelector('#tPlay').textContent = iv.playing === false ? '회전 재생' : '회전 정지'; }
  m.querySelectorAll('[data-iss]').forEach(b => b.onclick = () => { const g = issues[+b.dataset.iss]; VIEW3D?.select(g.partId, true); showIssue(g); host.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const er = m.querySelector('#tExpR'), eb = m.querySelector('#tExp');
  eb.onclick = () => { const on = !(VIEW3D?.state.explodeTarget > .5); VIEW3D?.setExplode(on ? 1 : 0); er.value = on ? 100 : 0; eb.textContent = on ? '조립' : '분해'; };
  er.oninput = () => { VIEW3D?.setExplode(er.value / 100); eb.textContent = er.value > 50 ? '조립' : '분해'; };
  const sb = m.querySelector('#tSec'), sa = m.querySelector('#tSecA');
  sb.onclick = () => { const on = !VIEW3D?.state.section; VIEW3D?.setSection(on, +sa.value); sb.classList.toggle('on', on); };
  sa.oninput = () => VIEW3D?.setSectionAngle(+sa.value);
  m.querySelector('#tHome').onclick = () => VIEW3D?.resetView();
  const pb = m.querySelector('#tPlay'); pb.onclick = () => { const on = VIEW3D?.togglePlay(); pb.textContent = on ? '회전 정지' : '회전 재생'; };
  const tb = m.querySelector('#tBom'); tb.onclick = () => { const hid = bom.classList.toggle('closed'); tb.setAttribute('aria-expanded', String(!hid)); };
}

// ------------------------------------------------------------------ 11. housing – cover
function housingView() {
  ensureD();
  if (!R?.ctx || R.errors?.length) return head('11. 하우징–커버', '') + errBox();
  let L = null; try { L = PGD3D.layout(R, D); } catch (e) { }
  const bl = bomList(), w = id => bl.find(p => p.id === id);
  return head('11. 하우징–커버 · 부품 형상', '하우징·커버·출력 플랜지와 모든 부품의 형상 입력입니다. 링 외경·출력 베어링 dp 등 기어·베어링 치수에서 나머지를 비례로 정하고, 3D 모델과 BOM에 반영합니다. 캐리어·핀의 조립 치수는 10단계 강도 계산과 연동됩니다.') +
    `<div class="card"><div class="grid">${num('housing.wall', '하우징 벽 두께 mm')}${num('housing.coverT', '입력 커버 두께 mm')}${num('housing.flangeT', '출력 플랜지 두께 mm')}${num('housing.boltN', '볼트 수 (커버·플랜지 각각)', { step: 1 })}${num('housing.boltD', '볼트 호칭 지름 M')}</div></div>
     ${L ? `<div class="card scroll"><h3>계산된 치수</h3><table><tr><th class="l">항목</th><th>값</th><th class="l">근거</th></tr>
      <tr><td class="l">링 외경 (하우징 안지름)</td><td>Ø${fmt(L.ringOD, 2)}</td><td class="l note">5단계 링 외경 (빈칸이면 자동 림)</td></tr>
      <tr><td class="l">하우징 몸체 외경</td><td>Ø${fmt(L.housR * 2, 1)}</td><td class="l note">링 외경 + 2 × 벽</td></tr>
      <tr><td class="l">출력부 플랜지 외경</td><td>Ø${fmt(L.flangeR * 2, 1)}</td><td class="l note">크로스 롤러 외륜 + 벽 + 1.5</td></tr>
      <tr><td class="l">크로스 롤러 내·외륜</td><td>Ø${fmt(L.raceIn * 2, 1)} / Ø${fmt(L.raceOut * 2, 1)}</td><td class="l note">dp ${L.dp} ± 1.1·Dw</td></tr>
      <tr><td class="l">중공 지름</td><td>Ø${fmt(L.hollowR * 2, 1)}</td><td class="l note">1단 썬 보어 − 3.6 (입력 중공축 두께 1.8)</td></tr>
      <tr><td class="l">전체 길이 (커버 ~ 출력 플랜지)</td><td>${fmt(L.zFlange[1] - L.zIn, 1)} mm</td><td class="l note">캐리어·핀·보스의 축방향 최대 범위 반영</td></tr>
      <tr><td class="l">하우징 · 커버 · 플랜지 중량</td><td>${fmt(w('housing')?.mass * 1000, 0)} · ${fmt(w('cover')?.mass * 1000, 0)} · ${fmt(w('oflange')?.mass * 1000, 0)} g</td><td class="l note">AL6061 2.7 g/cm³, 강 7.85 g/cm³</td></tr>
      <tr><td class="l">감속기 총중량 (추정)</td><td><b>${fmt(bl.reduce((s, p) => s + p.mass * p.qty, 0) * 1000, 0)} g</b></td><td class="l note">BOM 합계 · 형상 근사</td></tr></table></div>` : ''}
     ${componentsHTML()}
     ${drawingHTML(DWSTATE.id)}
     <h3 style="margin:24px 0 8px">부품별 형상 치수</h3>
     <p class="note" style="margin:0 0 12px">모든 부품의 형상을 정하는 치수입니다. 빈칸은 기어·베어링 치수에서 자동으로 정한 값이고, 값을 넣으면 그 값을 씁니다. '형상' 태그는 3D·중량에만, 나머지는 강도 계산에도 들어갑니다. 종합판정 3D에서 부품을 눌러도 같은 입력이 열립니다.</p>
     <div class="dimgrid">${bl.map(p => `<div class="card"><h3>${p.no}. ${esc(p.name)} <span class="note">× ${p.qty}</span></h3>${dimsHTML(p.id) || '<p class="note">치수 입력 없음</p>'}</div>`).join('')}</div>
     <div class="card"><button class="btn" id="geoReset">형상 치수 모두 자동으로</button> <span class="note">'형상' 항목만 초기화합니다 (강도 계산 입력은 그대로).</span></div>`;
}

// ------------------------------------------------------------------ header actions
$('#dname').value = D.name || '';
$('#dname').onchange = e => { D.name = e.target.value; save(); };
$('#bExample').onclick = () => { D = E.defaultDesign(); $('#dname').value = D.name; changed(); };
$('#bExport').onclick = () => {
  const txt = JSON.stringify(D, null, 1);
  dlg('설계 JSON', txt, '아래 내용을 복사해 보관하세요. "복사"를 누르면 클립보드에 넣습니다.', '복사', async () => { try { await navigator.clipboard.writeText(txt); return '복사했습니다.'; } catch (e) { $('#dlgText').select(); return '자동 복사가 막혀 있어 내용을 선택해 두었습니다. Ctrl+C로 복사하세요.'; } });
};
$('#bImport').onclick = () => dlg('JSON 불러오기', '', '이 사이트에서 복사한 설계 JSON을 붙여 넣고 확인을 누르세요.', '불러오기', () => {
  try { const d = JSON.parse($('#dlgText').value); if (d.schema !== 'pgd/1') throw new Error('형식이 다릅니다'); d.config.floatingSun = false; D = fillMissing(d, E.defaultDesign()); $('#dname').value = D.name || ''; changed(); $('#dlg').close(); return null; } catch (e) { return '불러오지 못했습니다: ' + e.message; }
});
function dlg(title, text, note, okLabel, onOk) {
  $('#dlgTitle').textContent = title; $('#dlgText').value = text; $('#dlgNote').textContent = note; $('#dlgOk').textContent = okLabel;
  $('#dlgOk').onclick = async e => { e.preventDefault(); const msg = await onOk(); if (msg) $('#dlgNote').textContent = msg; };
  $('#dlg').showModal();
}
const validView = h => STEPS.some(s => s[0] === h) || (h.startsWith('st-') && STAGE_KEYS.includes(h.slice(3)));
window.addEventListener('hashchange', () => { const [h, a] = location.hash.slice(1).split('/'); if (validView(h) && (h !== view || (a || null) !== ANCHOR)) go(h, a); });
{ const [h0, a0] = location.hash.slice(1).split('/'); if (validView(h0)) { if (VIEW_STAGE[h0]) { view = 'st-' + VIEW_STAGE[h0]; ANCHOR = 'vw-' + h0; } else { view = h0; ANCHOR = a0 || null; } } }
compute(); renderRail(); renderVerdict(); render();
}
