/* Planetary Gear Designer — UI */
{
const E = window.PGD;
const $ = s => document.querySelector(s);
const fmt = (x, n = 2) => Number.isFinite(x) ? x.toFixed(n) : (x === Infinity ? '∞' : '—');
const fmtN0 = x => Number.isFinite(x) ? Math.round(x).toLocaleString('ko-KR') : '—';
const fmtH = h => !Number.isFinite(h) ? (h === Infinity ? '∞' : '—') : h >= 1e6 ? (h / 1e6).toFixed(1) + 'M' : h >= 1e4 ? (h / 1e3).toFixed(0) + 'k' : h.toFixed(0);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'pgd-design-v1';
let D = load(), R = null, MC = null, SENS = null, view = 'map', GOOD = null;
const analysisJobs = window.createAnalysisJobs(E, () => new Worker('worker.js?v=ring-duty-1'));

function fillMissing(dst, src) { for (const k in src) { if (dst[k] === undefined || dst[k] === null && src[k] !== null && typeof src[k] === 'object') dst[k] = JSON.parse(JSON.stringify(src[k])); else if (Array.isArray(src[k]) && Array.isArray(dst[k])) { dst[k].forEach((v, i) => { if (v && typeof v === 'object' && src[k][i] && typeof src[k][i] === 'object' && !Array.isArray(v)) fillMissing(v, src[k][i]); }); } else if (src[k] && typeof src[k] === 'object' && dst[k] && typeof dst[k] === 'object') fillMissing(dst[k], src[k]); } return dst; }
let LOADNOTES = [];
// pgd/1 files: duty modes, legacy shared-ring values (stage 2 may hold its own) and needle bearing sources are migrated
// here; anything that changed the file's meaning is listed in LOADNOTES and shown with the warnings.
function migrateLoaded(d) {
  d = fillMissing(E.migrateDuty(d), E.defaultDesign());
  const diff = E.syncSharedRing(d);
  LOADNOTES = diff.length ? [`불러온 파일의 공용 링: 2단에 1단과 다른 값이 있어 1단 값을 채택했습니다 — ${diff.map(x => `${x.label} ${JSON.stringify(x.was ?? '빈칸')} → ${JSON.stringify(x.now ?? '빈칸')}`).join(' · ')}`] : [];
  if (window.PGDChecks) LOADNOTES.push(...PGDChecks.migrateNeedles(d));
  return d;
}
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.schema === 'pgd/1') { s.config.floatingSun = false; return migrateLoaded(s); } } catch (e) { } return E.defaultDesign(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { } }
const get = p => p.split('.').reduce((o, k) => o?.[k], D);
const set = (p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), D)[last] = v; };

function compute() {
  analysisJobs.cancel();
  ensureD();
  // Shared ring = one part: stage 1 holds its teeth/shift/allowance/material; copy them into the stored stage-2 inputs and
  // write back the stage-2 values the engine derives (planet teeth, fitted planet shift) so JSON, 3D and recommendations agree.
  if (D.config.sharedRing && D.config.stages > 1 && D.stages[1]) {
    E.syncSharedRing(D);
    const b = D.stages[1], stage = E.sharedStage(D.stages[0], b);
    for (const key of ['p','m','beta','alpha']) b[key] = stage[key];
    if (stage.sharedRing.auto && Number.isFinite(stage.sharedRing.xpFit)) b.xp = +stage.sharedRing.xpFit.toFixed(4);
  }
  E.syncDutyTorque(D);
  if (window.PGDChecks) { PGDChecks.ensure(D); PGDChecks.applyNeedles(D); }
  try { R = E.analyze(D); } catch (e) { R = { errors: ['계산 오류: ' + e.message], warns: [] }; console.error(e); }
  if (LOADNOTES.length && R) R.warns = [...LOADNOTES, ...(R.warns || [])];
  if (R?.ctx && !R.errors?.length) GOOD = { R, D: JSON.parse(JSON.stringify(D)) };
  MC = null; SENS = null; XC = null;
}

// ------------------------------------------------------------------ inputs
function num(path, label, opt = {}) {
  const v = get(path), fi = fieldInfo(path);
  return `<label class="f${fi.err ? ' ferr' : ''}">${label}<input type="number" step="${opt.step ?? 'any'}" ${opt.min != null ? `min="${opt.min}"` : ''} data-p="${path}" data-t="num" value="${v ?? ''}" ${opt.placeholder != null ? `placeholder="${esc(opt.placeholder)}"` : ''} ${opt.disabled || fi.lock ? 'disabled' : ''}>${fieldNote(fi)}</label>`;
}
function sel(path, label, options, opt = {}) {
  const v = String(get(path));
  return `<label class="f">${label}<select data-p="${path}" data-t="${opt.type || 'str'}" ${opt.disabled ? 'disabled' : ''}>${options.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}
function chk(path, label, opt = {}) { const fi = fieldInfo(path); return `<label class="c"><input type="checkbox" data-p="${path}" data-t="bool" ${get(path) ? 'checked' : ''} ${opt.disabled || fi.lock ? 'disabled' : ''}> ${label}${fieldNote(fi)}</label>`; }
// Per-field annotation shared by every place a field is drawn: where a linked value comes from (공용 링), which value the
// analysis actually uses (베어링 C·C0 출처), or why an entry cannot be used (출력 베어링 외력).
const fieldNote = fi => fi.err ? `<small class="fnote bad">${esc(fi.err)}</small>` : fi.note ? `<small class="fnote">${esc(fi.note)}</small>` : '';
function fieldInfo(path) {
  const m = /^stages\.1\.(r|xr|autoRingShift|m|beta|alpha|p|xp|tipChamfer\.2|asn\.2\.\d)$/.exec(path);
  if (m && D.config.sharedRing && D.config.stages > 1) {
    const sh = R?.ctx?.stages?.[1]?.st?.sharedRing, k = m[1];
    if (k === 'xp') {
      if (!sh) return {};
      if (sh.auto) return { note: `자동 조정 ${fmt(sh.xpUsed, 4)} (공용 링 고정 · 중심거리 ${fmt(sh.centreExt, 4)} mm 일치)${sh.adjusted ? ` · 입력 ${fmt(sh.xpIn, 4)}에서 조정` : ''}` };
      return Math.abs(sh.gap) >= 1e-4 ? { err: `입력 보존 · 중심거리 썬–유성 ${fmt(sh.centreExt, 4)} / 유성–링 ${fmt(sh.centreInt, 4)} mm (차 ${fmt(sh.gap, 4)} mm) — 성립하지 않음` } : { note: '입력값 사용 · 중심거리 일치' };
    }
    if (k === 'p') return D.stages[0].r == null ? { note: '공용 링 잇수(1단)에서 계산: (zr − zs) / 2' } : {};
    const src = { r: '링 잇수', xr: '링 전위', autoRingShift: '링 전위 자동', m: '모듈', beta: '비틀림각', alpha: '압력각', 'tipChamfer.2': '링 이끝 모따기' }[k] || '링 치두께 공차';
    const val = k === 'xr' && sh ? ` = ${fmt(sh.xr, 4)}` : k === 'r' && sh ? ` = ${sh.r}${sh.rAuto ? ' (자동)' : ''}` : '';
    return { lock: true, note: `공용 링 · 1단 ${src}${val} 값과 연동 (1단 입력에서 변경)` };
  }
  const b = /^stages\.(\d)\.bearing\.(C0?|name)$/.exec(path);
  if (b) {
    const br = D.stages[+b[1]]?.bearing, src = br?.src === 'needle';
    if (!br) return {};
    if (b[2] === 'name') return src ? { lock: true, note: `풀니들 계산 적용 중 · 직접 입력 "${br.manual?.name ?? '—'}" 보관` } : {};
    const lost = br.manualLost && !src;
    return src ? { lock: true, note: `현재 적용 ${b[2]} ${fmtN0(br[b[2]])} N · 풀니들 계산${br.manual ? ` (직접 입력 ${fmtN0(br.manual[b[2]])} N 보관 — 적용 해제 시 복원)` : ''}` }
      : lost ? { err: `현재 적용 ${b[2]} ${fmtN0(br[b[2]])} N · 직접 입력 — 이 파일에는 풀니들 적용 전 수동값이 없어 복원하지 못했습니다. 카탈로그 값을 다시 입력하세요.` }
      : { note: `현재 적용 ${b[2]} ${fmtN0(br[b[2]])} N · 직접 입력` };
  }
  const pb = /^stages\.(\d)\.planetBore$/.exec(path);
  if (pb) { const br = D.stages[+pb[1]]?.bearing; if (br?.src === 'needle') return { lock: true, note: `풀니들 계산 보어 Ø${fmt(br.calc?.planetBore, 3)} 적용 중 (직접 입력 ${br.manual?.planetBore ?? '빈칸'} 보관)` }; }
  const na = /^needle\.(\d)\.apply$/.exec(path);
  if (na) { const br = D.stages[+na[1]]?.bearing; if (!br) return {}; return { note: br.src === 'needle' ? `현재 적용: 풀니들 계산 C ${fmtN0(br.C)} / C0 ${fmtN0(br.C0)} N · 직접 입력 ${br.manual ? `C ${fmtN0(br.manual.C)} / C0 ${fmtN0(br.manual.C0)} N 보관` : '값 없음 (해제 시 복원 불가)'}` : `현재 적용: 직접 입력 C ${fmtN0(br.C)} / C0 ${fmtN0(br.C0)} N${br.calc ? ` · 풀니들 계산값 C ${fmtN0(br.calc.C)} N 보관` : ''}` }; }
  const x = /^req\.ext\.(Fr|Fa|M)$/.exec(path);
  if (x) { const v = E.validateExt(D.req.ext)[x[1]]; return v.ok ? { note: v.note } : { err: v.err }; }
  return {};
}
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
  const v = Object.fromEntries(R.verdict.map(x => [x.id || x.k, x.ok]));
  const geoWarn = R.ctx.stages.some(s => s.geo.warns.length || s.geo.checks.some(c => !c.ok));
  switch (id) {
    case 'overview': return R.verdict.every(x => x.ok) ? 'ok' : 'bad';
    case 's4': return geoWarn ? 'warn' : 'ok';
    case 'smat': return !v['스커핑 안전율 (피크, 섬광온도)'] ? 'bad' : (R.lube.lambdaMin < 1 || R.ctx.stages.some(s => s.mats.some(m => m.warnings.length))) ? 'warn' : 'ok';
    case 's8': return v['정격 토크 · 목표 수명 (기어)'] && v['부하 스펙트럼 수명 (기어)'] && v['피크 토크 정적 안전율'] ? 'ok' : 'bad';
    case 's9': return v['유성 베어링 L10 (스펙트럼)'] && v['유성 베어링 정적 s0 (최저)'] && v['출력 베어링 L10'] && v['출력 베어링 정적 s0 (최저)'] && v['출력 베어링 롤러 접촉 s0 (최저)'] !== false ? 'ok' : 'bad';
    case 'scar': return v['유성 핀·캐리어 정적 (듀티 전체)'] ? 'ok' : 'bad';
    case 's10': return v['효율 (정격, 추정)'] && R.backlash?.ok ? 'ok' : 'warn';
    case 's11': return MC ? (MC.passLife >= .9 ? 'ok' : 'bad') : '';
    default: return '';
  }
}
// ------------------------------------------------------------------ design process (PGDProc)
const VIEW_TITLE = { s1: '요구사양', s2: '구성–감속비', s3: '제원–형상', s4: '치형 검사', s5: '정밀도–치형 수정', s7: '하중 계수', s8: '기어 강도',
  scar: '캐리어–핀', s9: '베어링', shous: '하우징–커버·부품 형상', smat: '소재', s10: '성능 예측', s11: '가상 검증', reg: '가정 대장', out: '출력물·가공·원가' };
let XC = null, XC_MC;
function procExtra() {
  if (XC && XC_MC === MC) return XC;
  const X = { MC };
  try { if (window.PGDChecks && R && !R.errors?.length) X.CK = PGDChecks.compute(R, D, { MC }); } catch (e) { console.error(e); }
  try { if (window.PGD3D && R && !R.errors?.length) { ensureD(); const pl = PGD3D.partsList(R, D); X.parts = pl.length; X.mass = pl.reduce((s, p) => s + (p.mass || 0) * (p.qty || 1), 0) * 1000; } } catch (e) { }
  XC = X; XC_MC = MC; return X;
}
function procEval() { return window.PGDProc ? PGDProc.evaluate(R, D, procExtra()) : []; }
const gateCls = ok => ok === true ? 'ok' : ok === false ? 'bad' : '';
// ------------------------------------------------------------------ item pages (items.js) · review records · navigation
const IT = () => window.PGDItems?.I || {};
const SRCD = () => window.PGDItems?.SRC || {};
// legacy screen ids → the first item that now holds that content
const VIEW_ITEM = { s1: '1-1', s2: '2-1', s3: '3-2', s4: '4-1', s5: '4-5', s6: '9-1', slub: '5-10', s7: '5-2', s8: '5-7', scar: '6-1', s9: '7-1', shous: '8-1', smat: '9-1', s10: '10-1', s11: '11-1', reg: '11-6', out: '12-1' };
const STAGE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'D'];
const itemStage = id => id.startsWith('D') ? 'D' : id.split('-')[0];
let ANCHOR = null, LASTITEM = '1-1';
let ORDER = null;
const ord = () => ORDER || (ORDER = window.PGDProc ? [...PGDProc.STAGES, PGDProc.DFM].flatMap(g => g.items.map(i => i[0])) : []);
const sf = (fn, ...a) => { try { const v = fn(...a); return v == null || v === '' ? '—' : v; } catch (e) { return '—'; } };
let EMC = null;
function evalMap() {
  if (EMC && EMC.X === procExtra()) return EMC.m;
  const X = procExtra(), E2 = window.PGDProc ? PGDProc.evaluate(R, D, X) : [];
  const m = Object.fromEntries(E2.flatMap(g => g.items.map(i => [i.id, Object.assign({ stage: String(g.n), sname: g.name }, i)])));
  EMC = { X, m }; return m;
}
function ictx() { const X = procExtra(), EM = evalMap(); return { R, D, X, CK: X.CK || {}, it: id => EM[id], EM }; }
function expRows(id) {
  const sp = IT()[id] || (typeof gspec === 'function' ? gspec(id) : null); if (!sp) return [];
  const n = D.config.stages, out = [];
  for (const r of sp.rows || []) {
    if (r[0] === 'D' || r[0] === 'M' || r[0] === 'A') {
      const [g, type, path, label, o = {}] = r;
      for (const i of (o.st ? Array.from({ length: n }, (_, k) => k) : [0])) {
        if (o.if && !o.if(D, i)) continue;
        out.push({ g, kind: 'in', type, path: path && path.replace('{i}', i), label: label.replace('{s}', i + 1), o, dis: !!(o.lk && i === 1 && D.config.sharedRing && n > 1 && (typeof o.lk !== 'function' || o.lk(D))) });
      }
    } else if (r[0] === 'J') out.push({ g: 'D', kind: 'chk', key: r[1], label: r[2] });
    else out.push({ g: r[0] === 'P' ? 'A' : 'C', kind: r[0] === 'P' ? 'pred' : 'calc', label: r[1], fn: r[2], basis: r[3] });
  }
  return out;
}
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
// what the reviewer saw: every input value and every computed value on the page
function sigOf(id, c) {
  return hash(expRows(id).map(r => r.kind === 'in' ? JSON.stringify(r.path ? get(r.path) : D.req.duty) : r.kind === 'chk' || (id === '11-1' && r.kind === 'pred') ? '' : String(sf(r.fn, c))).join('|'));
}
function rv(id) { D.itemReview = D.itemReview || {}; return D.itemReview[id] || (D.itemReview[id] = {}); }
function rvState(id, c) { const r = D.itemReview?.[id]; if (!r?.st) return ''; if (r.sig && r.sig !== sigOf(id, c || ictx())) return 'stale'; return r.st; }
const RV = { done: ['✓', '검토 완료'], stale: ['↻', '재검토 필요'], hold: ['⏸', '보류'], ng: ['!', '문제 있음'], '': ['○', '검토 전'] };
const rvBadge = s => `<span class="rv rv-${s || 'none'}" title="${RV[s][1]}">${RV[s][0]}</span>`;
function itemOk(id, c) { const sp = IT()[id], it = c.it(id); if (sp?.ok) { const v = sf(sp.ok, c); return v === '—' ? null : v; } return it?.ok ?? null; }
function rels(id) {
  const REL = window.PGDMap?.REL || [], I = IT(), up = new Map(), down = new Map();
  REL.forEach(([a, b, t]) => { if (b === id) up.set(a, t); if (a === id) down.set(b, t); });
  (I[id]?.up || []).forEach(u => { if (!up.has(u)) up.set(u, '먼저 정해야 하는 값'); });
  Object.entries(I).forEach(([k, s]) => { if ((s.up || []).includes(id) && !down.has(k)) down.set(k, '이 항목의 값을 씀'); });
  up.delete(id); down.delete(id);
  const o = ord(); const by = (a, b) => o.indexOf(a[0]) - o.indexOf(b[0]);
  return { up: [...up].sort(by), down: [...down].sort(by) };
}
function srcCounts(id) { const rs = expRows(id), c = { D: 0, C: 0, M: 0, A: 0 }; rs.forEach(r => c[r.g]++); return c; }
const srcChips = id => { const c = srcCounts(id), S = SRCD(); return ['D', 'C', 'M', 'A'].filter(g => c[g]).map(g => `<span class="srcchip ${S[g].c}" title="${S[g].t}">${S[g].t.split('·')[0].split(' ')[0]} ${c[g]}</span>`).join(''); };
function inHTML(r) {
  if (r.type === 'duty') return `<div class="f note wide">${esc(r.label)}</div>`;
  if (r.type === 'num') return num(r.path, r.label, { step: r.o.step, disabled: r.dis });
  if (r.type === 'sel') return sel(r.path, r.label, r.o.o, { type: r.o.t, disabled: r.dis });
  if (r.type === 'chk') return chk(r.path, r.label, { disabled: r.dis });
  if (r.type === 'str') return `<label class="f">${r.label}<input type="text" data-p="${r.path}" data-t="str" value="${esc(get(r.path) ?? '')}"></label>`;
  return '';
}
function itemSections(id, c) {
  const rs = expRows(id), S = SRCD(), ch = rv(id).chk || {};
  return ['D', 'C', 'M', 'A'].map(g => {
    const xs = rs.filter(r => r.g === g); if (!xs.length) return '';
    const ins = xs.filter(r => r.kind === 'in'), cks = xs.filter(r => r.kind === 'chk'), outs = xs.filter(r => r.kind === 'calc' || r.kind === 'pred');
    return `<section class="isec ${S[g].c}"><h4><i></i>${S[g].t}<small>${S[g].s}</small></h4>
      ${ins.length ? `<div class="grid">${ins.map(inHTML).join('')}</div>` : ''}
      ${cks.length ? `<ul class="ichk">${cks.map(r => `<li><label><input type="checkbox" data-ck="${r.key}" ${ch[r.key] ? 'checked' : ''}> ${esc(r.label)}</label></li>`).join('')}</ul>` : ''}
      ${outs.length ? `<table class="iout">${outs.map(r => `<tr><th>${esc(r.label)}${r.kind === 'pred' ? ' <span class="pm">예측</span>' : ''}</th><td>${esc(String(sf(r.fn, c)))}</td><td class="note">${esc(r.basis || '')}</td></tr>`).join('')}</table>` : ''}
    </section>`;
  }).join('');
}
function wwwHTML(sp) {
  return `<div class="www"><div class="w w1"><b>무엇을</b><p>${esc(sp.what)}</p></div><div class="w w2"><b>어떻게</b><p>${esc(sp.how)}</p></div><div class="w w3"><b>왜</b><p>${esc(sp.why)}</p></div></div>`;
}
function judgeHTML(id, c) {
  const ok = itemOk(id, c), sp = IT()[id], it = c.it(id);
  return `<div class="ijud ${ok === true ? 'ok' : ok === false ? 'bad' : ''}"><span class="jm">${ok === true ? '통과' : ok === false ? '미달' : '판정 없음'}</span><span class="jv">${esc(String(it?.val ?? '—'))}</span><span class="jk">기준 · ${esc(sp?.k || '—')}</span></div>`;
}
const relChip = (id, t, c, fb) => { const it = c.it(id); if (!it) return ''; const ok = itemOk(id, c); return `<button class="rchip" data-goit="${id}"><span class="dot ${ok === true ? 'ok' : ok === false ? 'bad' : ''}"></span><b>${id}</b> ${esc(it.t)}${rvBadge(rvState(id, c))}<small>${fb ? '<i class="fbk">되먹임</i> ' : ''}${esc(t)}</small></button>`; };
function nextUnreviewed(from, c) { const o = ord(), i = o.indexOf(from); for (let k = 1; k <= o.length; k++) { const x = o[(i + k) % o.length]; if (rvState(x, c) !== 'done') return x; } return null; }
function itemPage(id) {
  const c = ictx(), sp = IT()[id], it = c.it(id);
  if (!sp || !it) return head('항목', '항목을 찾을 수 없습니다.');
  const O = ord(), idx = O.indexOf(id), prev = O[idx - 1], next = O[idx + 1], k = itemStage(id);
  const st = rvState(id, c), r = rv(id), rl = rels(id);
  const fb = u => O.indexOf(u) > idx;   // a later item feeding back (verification → earlier decision) is not a prerequisite
  const pend = rl.up.filter(([u]) => c.it(u) && !fb(u) && rvState(u, c) !== 'done');
  const states = Object.fromEntries(O.map(x => [x, rvState(x, c)]));
  const stale = O.filter(x => states[x] === 'stale');
  const nu = nextUnreviewed(id, c);
  const prog = `<div class="iprog">${O.map(x => `<i class="${states[x] || 'none'} ${x === id ? 'cur' : ''}" data-goit="${x}" title="${x} ${esc(c.it(x)?.t || '')} · ${RV[states[x]][1]}"></i>`).join('')}</div>`;
  const alerts = (pend.length ? `<div class="ialert up"><b>선행 항목 ${pend.length}개가 아직 검토 전입니다</b> — 이 항목의 값이 그 결정에 달려 있습니다. ${pend.map(([u]) => `<button class="lnk" data-goit="${u}">${u} ${esc(c.it(u).t)}</button>`).join('')}</div>` : '') +
    (stale.length ? `<div class="ialert re"><b>회귀 검토 ${stale.length}개</b> — 검토 후 값이 바뀐 항목입니다. ${stale.slice(0, 8).map(u => `<button class="lnk" data-goit="${u}">${u}</button>`).join('')}${stale.length > 8 ? ` 외 ${stale.length - 8}` : ''}</div>` : '');
  const g = c.EM && Object.values(c.EM).length ? (procEval().find(x => String(x.n) === k)) : null;
  const ext = c.CK[id] ? (c.CK[id].html || '') + extraHTML(id, c.CK[id]) : '';
  const wid = (sp.w || []).map(widgetHTML).join('');
  return `${prog}
    <div class="ihead"><span class="iid">${id}</span><div class="ittl"><div class="ist"><button class="lnk" data-v="st-${k}">${k === 'D' ? 'D 가공·원가' : k + '단계 · ' + esc(it.sname)}</button> · ${idx + 1} / ${O.length}</div><h2>${esc(it.t)}</h2><div class="isrc">${srcChips(id)}</div></div>
      <div class="ibadge">${rvBadge(st)}<span>${RV[st][1]}</span></div></div>
    ${errBox()}${alerts}
    ${window.PGDStructure?.render(id, c) || ''}
    ${wwwHTML(sp)}
    ${judgeHTML(id, c)}
    <div class="isecs">${itemSections(id, c)}</div>
    ${ext || wid ? `<h3 class="cardsh">상세 계산·표</h3>${ext ? `<div class="card pcx">${ext}</div>` : ''}${wid}` : ''}
    <div class="irel"><div><h4>선행 — 먼저 확인할 항목</h4>${rl.up.map(([u, t]) => relChip(u, t, c, fb(u))).join('') || '<p class="note">없음</p>'}</div>
      <div><h4>영향 — 이 값을 바꾸면 다시 볼 항목</h4>${rl.down.map(([u, t]) => relChip(u, t, c, O.indexOf(u) < idx)).join('') || '<p class="note">없음</p>'}</div></div>
    <div class="card irev"><h3>검토 기록</h3>
      <div class="rvb">${[['done', '✓ 검토 완료'], ['hold', '⏸ 보류'], ['ng', '! 문제 있음']].map(([s, t]) => `<button class="btn ${r.st === s ? 'on' : ''}" data-rv="${s}">${t}</button>`).join('')}${r.st ? '<button class="btn x" data-rv="">기록 지우기</button>' : ''}</div>
      <textarea data-rvnote rows="2" placeholder="검토 메모 — 결정 근거, 확인한 자료, 남은 문제">${esc(r.note || '')}</textarea>
      <p class="note">${r.at ? `마지막 기록 ${esc(r.at)} · ` : ''}검토 완료 뒤 이 페이지의 값(입력·계산·예측)이 바뀌면 자동으로 <b>재검토 필요</b>로 바뀝니다.</p>
      <button class="btn primary" data-rvnext>검토 완료하고 다음 →</button></div>
    <div class="pager ipager">${prev ? `<button class="btn" data-goit="${prev}">← ${prev} ${esc(c.it(prev)?.t || '')}</button>` : '<span></span>'}
      ${nu && nu !== next ? `<button class="btn" data-goit="${nu}">다음 미검토 ${nu}</button>` : ''}
      ${next ? `<button class="btn primary" data-goit="${next}">${next} ${esc(c.it(next)?.t || '')} →</button>` : ''}</div>`;
}
function setReview(id, st) {
  const r = rv(id);
  if (!st) { delete r.st; delete r.sig; delete r.at; }
  else { r.st = st; r.sig = sigOf(id, ictx()); const d = new Date(); r.at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  save();
}
function bindItemCommon(m, id) {
  m.querySelectorAll('[data-goit]').forEach(b => b.onclick = () => go('it-' + b.dataset.goit));
  m.querySelectorAll('[data-ck]').forEach(b => b.onchange = e => { e.stopPropagation(); const r = rv(id); r.chk = r.chk || {}; r.chk[b.dataset.ck] = b.checked; save(); });
}
function bindItemPage(m, id) {
  bindItemCommon(m, id);
  m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
  m.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { setReview(id, b.dataset.rv); renderRail(); render(true); });
  const note = m.querySelector('[data-rvnote]'); if (note) note.onchange = e => { e.stopPropagation(); rv(id).note = note.value; save(); };
  const nx = m.querySelector('[data-rvnext]'); if (nx) nx.onclick = () => { if (note) rv(id).note = note.value; setReview(id, 'done'); const n = nextUnreviewed(id, ictx()); go('it-' + (n || id)); };
  bindProcCards(m);
  (IT()[id]?.w || []).forEach(w => (WB[wName(w)] || (() => { }))(m));
}
// stage overview: the stage's items in order with their state; every item opens its own page
function stagePage(k) {
  const E2 = procEval(), g = E2.find(x => String(x.n) === k);
  if (!g) return head('설계 단계', '단계를 찾을 수 없습니다.');
  const c = ictx(), idx = STAGE_KEYS.indexOf(k), prev = STAGE_KEYS[idx - 1], next = STAGE_KEYS[idx + 1];
  const nameOf = key => key === 'D' ? '가공·원가' : E2.find(y => String(y.n) === key)?.name || '';
  const sts = g.items.map(i => rvState(i.id, c)), done = sts.filter(s => s === 'done').length, stale = sts.filter(s => s === 'stale').length;
  const first = g.items.find((i, n) => sts[n] !== 'done')?.id || g.items[0].id;
  return `<div class="shead"><span class="snum">${k}</span><div><h2>${esc(k === 'D' ? '가공·원가 (병행 트랙)' : g.name)}</h2><p class="lead">항목 ${g.total}개 · 검토 완료 ${done}${stale ? ` · <b class="bad">재검토 ${stale}</b>` : ''} · 항목을 누르면 전용 페이지로 갑니다.</p></div><button class="btn primary" data-goit="${first}">${first}부터 검토 →</button></div>
    <div class="pgate ${gateCls(g.gate.ok)}">단계 게이트 · ${esc(g.gate.t)} — ${g.gate.ok === true ? '통과' : g.gate.ok === false ? '미달' : '판정 기준 없음 (설계자 확인)'}</div>
    ${k === '2' ? window.PGDStructure?.render('overview', c) || '' : ''}
    <ol class="slist">${g.items.map((i, n) => { const sp = IT()[i.id] || {}, ok = itemOk(i.id, c); return `<li><button data-goit="${i.id}"><span class="pid">${i.id}</span><span class="st"><b>${esc(i.t)}</b><small>${esc(sp.what || '')}</small></span><span class="srcs">${srcChips(i.id)}</span><span class="pval">${esc(String(i.val ?? ''))}</span>${okMark(ok)}${rvBadge(sts[n])}</button></li>`; }).join('')}</ol>
    <div class="pager">${prev ? `<button class="btn" data-v="st-${prev}">← ${prev} ${esc(nameOf(prev))}</button>` : '<span></span>'}${next ? `<button class="btn primary" data-v="st-${next}">${next} ${esc(nameOf(next))} →</button>` : ''}</div>`;
}
function bindStagePage(m) { bindItemCommon(m, null); m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => go(b.dataset.v)); }
// ------------------------------------------------------------------ core review (groups.js): 99 items folded into ~20 linked groups
const GR = () => window.PGDGroups;
let GSPEC = {}, GRELC = null;
function gspec(id) {
  const g = GR()?.G[id]; if (!g) return null;
  if (GSPEC[id]) return GSPEC[id];
  const I = window.PGDItems?.I || {}, rows = [], seen = new Set(), w = [], ws = new Set(), checks = [];
  for (const m of g.m) {
    const sp = I[m]; if (!sp) continue;
    for (const r of sp.rows || []) {
      if (r[0] === 'J') { rows.push(['J', m + ':' + r[1], r[2]]); continue; }
      const key = (r[0] === 'D' || r[0] === 'M' || r[0] === 'A') ? r[0] + '|' + (r[2] || r[3]) : r[0] + '|' + r[1];
      if (seen.has(key)) continue; seen.add(key); rows.push(r);
    }
    for (const x of sp.w || []) { if (Array.isArray(x) && x[0] === 'checks') { checks.push(...x.slice(1)); continue; } const k = JSON.stringify(x); if (!ws.has(k)) { ws.add(k); w.push(x); } }
  }
  if (checks.length) w.push(['checks', ...new Set(checks)]);
  return (GSPEC[id] = { what: g.what, how: g.how, why: g.why, rows, w, t: g.t, m: g.m, k: '포함 항목 판정 모두 통과' });
}
function gOk(id, c) { const ok = (GR().G[id]?.m || []).map(m => itemOk(m, c)); return ok.includes(false) ? false : ok.includes(true) ? true : null; }
function grels(id) {
  if (!GRELC) {
    const OF = GR().OF, map = new Map(), add = (a, b, t) => { const ga = OF[a], gb = OF[b]; if (!ga || !gb || ga === gb) return; const k = ga + '>' + gb; if (!map.has(k)) map.set(k, [ga, gb, t]); };
    (window.PGDMap?.REL || []).forEach(([a, b, t]) => add(a, b, t));
    Object.entries(window.PGDItems?.I || {}).forEach(([k, s]) => (s.up || []).forEach(u => add(u, k, '먼저 정해야 하는 값')));
    GRELC = [...map.values()];
  }
  const O = GR().ORDER, by = (a, b) => O.indexOf(a[0]) - O.indexOf(b[0]);
  return { up: GRELC.filter(r => r[1] === id).map(r => [r[0], r[2]]).sort(by), down: GRELC.filter(r => r[0] === id).map(r => [r[1], r[2]]).sort(by) };
}
const gnum = id => id.slice(1);
const gChip = (id, t, c, fb) => { const g = GR().G[id], ok = gOk(id, c); return `<button class="rchip" data-gocg="${id}"><span class="dot ${ok === true ? 'ok' : ok === false ? 'bad' : ''}"></span><b>${gnum(id)}</b> ${esc(g.t)}${rvBadge(rvState(id, c))}<small>${fb ? '<i class="fbk">되먹임</i> ' : ''}${esc(t)}</small></button>`; };
function nextUnreviewedG(from, c) { const o = GR().ORDER, i = o.indexOf(from); for (let k = 1; k <= o.length; k++) { const x = o[(i + k) % o.length]; if (rvState(x, c) !== 'done') return x; } return null; }
function corePage() {
  const c = ictx(), Gs = GR(), O = Gs.ORDER, sts = Object.fromEntries(O.map(x => [x, rvState(x, c)])), done = O.filter(x => sts[x] === 'done').length, stale = O.filter(x => sts[x] === 'stale').length;
  const first = O.find(x => sts[x] !== 'done') || O[0];
  return `<div class="shead"><span class="snum">핵심</span><div><h2>핵심 검토 ${O.length}</h2><p class="lead">99개 공정 항목을 서로 얽힌 것끼리 ${O.length}개로 묶은 축소 흐름입니다. 검토 완료 ${done} / ${O.length}${stale ? ` · <b class="bad">재검토 ${stale}</b>` : ''}. 묶음 페이지에서 입력·계산·판정을 한 번에 보고, 세부 항목은 99개 항목 페이지로 바로 갈 수 있습니다.</p></div><button class="btn primary" data-gocg="${first}">${gnum(first)}부터 검토 →</button></div>` +
    (errBox() || '') +
    Gs.PH.map(p => `<h3 class="cardsh">${p.n}. ${esc(p.name)}</h3><ol class="slist">${p.items.map(id => { const g = Gs.G[id]; return `<li><button data-gocg="${id}"><span class="pid">${gnum(id)}</span><span class="st"><b>${esc(g.t)}</b><small>${esc(g.what)}</small></span><span class="srcs">${srcChips(id)}</span><span class="pval">세부 ${g.m.length}</span>${okMark(gOk(id, c))}${rvBadge(sts[id])}</button></li>`; }).join('')}</ol>`).join('') +
    `<p class="note" style="margin-top:16px">묶음에 넣지 않은 공정 항목(출력물 12-1~12-6, 커버·플랜지 형상 8-4·8-5, 조립 순서 8-7, 가공·원가 D1·D2·D5·D6)은 '전체 항목'에 그대로 있습니다.</p>`;
}
function groupPage(id) {
  const c = ictx(), Gs = GR(), g = Gs.G[id], sp = gspec(id);
  if (!g) return head('핵심 검토', '묶음을 찾을 수 없습니다.');
  const O = Gs.ORDER, idx = O.indexOf(id), prev = O[idx - 1], next = O[idx + 1], ph = Gs.PH.find(p => p.n === g.ph);
  const st = rvState(id, c), r = rv(id), rl = grels(id), fb = u => O.indexOf(u) > idx;
  const pend = rl.up.filter(([u]) => !fb(u) && rvState(u, c) !== 'done');
  const states = Object.fromEntries(O.map(x => [x, rvState(x, c)])), stale = O.filter(x => states[x] === 'stale');
  const ok = gOk(id, c), oks = g.m.map(m => itemOk(m, c)), nu = nextUnreviewedG(id, c);
  const prog = `<div class="iprog">${O.map(x => `<i class="${states[x] || 'none'} ${x === id ? 'cur' : ''}" data-gocg="${x}" title="${gnum(x)} ${esc(Gs.G[x].t)} · ${RV[states[x]][1]}"></i>`).join('')}</div>`;
  const alerts = (pend.length ? `<div class="ialert up"><b>앞 묶음 ${pend.length}개가 아직 검토 전입니다</b> — 이 묶음의 값이 그 결정에 달려 있습니다. ${pend.map(([u]) => `<button class="lnk" data-gocg="${u}">${gnum(u)} ${esc(Gs.G[u].t)}</button>`).join('')}</div>` : '') +
    (stale.length ? `<div class="ialert re"><b>회귀 검토 ${stale.length}개</b> — 검토 후 값이 바뀐 묶음입니다. ${stale.map(u => `<button class="lnk" data-gocg="${u}">${gnum(u)} ${esc(Gs.G[u].t)}</button>`).join('')}</div>` : '');
  const subs = g.m.map((m, k) => { const it = c.it(m), o = window.PGDItems?.I?.[m] || {}; return it ? `<tr class="${oks[k] === false ? 'bad' : ''}"><td><button class="lnk" data-goit="${m}">${m}</button></td><td class="l"><b>${esc(it.t)}</b><small class="note" style="display:block">${esc(o.k || '')}</small></td><td class="l">${esc(String(it.val ?? '—'))}</td><td>${okMark(oks[k])}</td></tr>` : ''; }).join('');
  const ext = g.m.map(m => c.CK[m] ? (c.CK[m].html || '') + extraHTML(m, c.CK[m]) : '').join('');
  const wid = (sp.w || []).map(widgetHTML).join('');
  const np = oks.filter(x => x === true).length, nf = oks.filter(x => x === false).length;
  return `${prog}
    <div class="ihead"><span class="iid">${gnum(id)}</span><div class="ittl"><div class="ist"><button class="lnk" data-v="core">핵심 검토</button> · ${ph.n}. ${esc(ph.name)} · ${idx + 1} / ${O.length}</div><h2>${esc(g.t)}</h2><div class="isrc">${srcChips(id)}</div></div>
      <div class="ibadge">${rvBadge(st)}<span>${RV[st][1]}</span></div></div>
    ${errBox()}${alerts}
    ${g.m.map(x => window.PGDStructure?.render(x, c) || '').join('')}
    ${wwwHTML(sp)}
    <div class="ijud ${ok === true ? 'ok' : ok === false ? 'bad' : ''}"><span class="jm">${ok === true ? '통과' : ok === false ? '미달' : '판정 없음'}</span><span class="jv">세부 ${g.m.length}개 · 통과 ${np} · 미달 ${nf} · 판정 없음 ${g.m.length - np - nf}</span><span class="jk">기준 · 포함된 공정 항목의 판정이 모두 통과</span></div>
    <div class="card scroll gsub"><h3>세부 확인 <span class="note">— 번호를 누르면 99개 항목 페이지로</span></h3><table><tr><th>항목</th><th class="l">내용 · 기준</th><th class="l">현재 값</th><th>판정</th></tr>${subs}</table></div>
    <div class="isecs">${itemSections(id, c)}</div>
    ${ext || wid ? `<h3 class="cardsh">상세 계산·표</h3>${ext ? `<div class="card pcx">${ext}</div>` : ''}${wid}` : ''}
    <div class="irel"><div><h4>앞 묶음 — 먼저 확인</h4>${rl.up.map(([u, t]) => gChip(u, t, c, fb(u))).join('') || '<p class="note">없음</p>'}</div>
      <div><h4>뒤 묶음 — 바꾸면 다시 볼 것</h4>${rl.down.map(([u, t]) => gChip(u, t, c, O.indexOf(u) < idx)).join('') || '<p class="note">없음</p>'}</div></div>
    <div class="card irev"><h3>검토 기록</h3>
      <div class="rvb">${[['done', '✓ 검토 완료'], ['hold', '⏸ 보류'], ['ng', '! 문제 있음']].map(([s, t]) => `<button class="btn ${r.st === s ? 'on' : ''}" data-rv="${s}">${t}</button>`).join('')}${r.st ? '<button class="btn x" data-rv="">기록 지우기</button>' : ''}</div>
      <textarea data-rvnote rows="2" placeholder="검토 메모 — 결정 근거, 확인한 자료, 남은 문제">${esc(r.note || '')}</textarea>
      <p class="note">${r.at ? `마지막 기록 ${esc(r.at)} · ` : ''}검토 완료 뒤 이 페이지의 값(입력·계산·예측)이 바뀌면 자동으로 <b>재검토 필요</b>로 바뀝니다.</p>
      <button class="btn primary" data-rvnext>검토 완료하고 다음 →</button></div>
    <div class="pager ipager">${prev ? `<button class="btn" data-gocg="${prev}">← ${gnum(prev)} ${esc(Gs.G[prev].t)}</button>` : '<button class="btn" data-v="core">← 핵심 검토 목록</button>'}
      ${nu && nu !== next ? `<button class="btn" data-gocg="${nu}">다음 미검토 ${gnum(nu)}</button>` : ''}
      ${next ? `<button class="btn primary" data-gocg="${next}">${gnum(next)} ${esc(Gs.G[next].t)} →</button>` : ''}</div>`;
}
function bindCore(m) { m.querySelectorAll('[data-gocg]').forEach(b => b.onclick = () => go('cg-' + b.dataset.gocg)); m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => go(b.dataset.v)); }
function bindGroupPage(m, id) {
  bindItemCommon(m, id); bindCore(m);
  m.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { setReview(id, b.dataset.rv); renderRail(); render(true); });
  const note = m.querySelector('[data-rvnote]'); if (note) note.onchange = e => { e.stopPropagation(); rv(id).note = note.value; save(); };
  const nx = m.querySelector('[data-rvnext]'); if (nx) nx.onclick = () => { if (note) rv(id).note = note.value; setReview(id, 'done'); const n = nextUnreviewedG(id, ictx()); go('cg-' + (n || id)); };
  bindProcCards(m);
  (gspec(id)?.w || []).forEach(w => (WB[wName(w)] || (() => { }))(m));
}
function renderCoreRail(c) {
  const Gs = GR(), O = Gs.ORDER, cur = view.startsWith('cg-') ? view.slice(3) : null, sts = Object.fromEntries(O.map(x => [x, rvState(x, c)])), nd = O.filter(x => sts[x] === 'done').length, ns = O.filter(x => sts[x] === 'stale').length;
  $('#rail').innerHTML = `<div class="rprog"><div><b>${nd}</b> / ${O.length} 검토${ns ? ` · <span class="bad">재검토 ${ns}</span>` : ''}</div><i style="width:${nd / O.length * 100}%"></i></div>
    <button data-v="core" class="stg" aria-current="${view === 'core'}"><span class="sn">≡</span>핵심 검토 목록</button>` +
    Gs.PH.map(p => `<div class="grp">${p.n}. ${esc(p.name)}</div><div class="its core">${p.items.map(id => { const ok = gOk(id, c); return `<button data-v="cg-${id}" class="it ${cur === id ? 'on' : ''}"><span class="dot ${ok === true ? 'ok' : ok === false ? 'bad' : ''}"></span><span class="iid">${gnum(id)}</span><span class="itt">${esc(Gs.G[id].t)}</span>${rvBadge(sts[id])}</button>`; }).join('')}</div>`).join('');
  $('#rail').querySelectorAll('button[data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
  $('#rail').querySelector('.it.on')?.scrollIntoView({ block: 'nearest' });
}
// ------------------------------------------------------------------ part studio: machined parts S · P · R · C, one at a time in 3D with editable dimensions
const STUDIO = { id: null, view: null, section: false, dims: true };
let PARTV = null;   // GOOD (declared at the top): last error-free result + design, used to keep drawing the part while the current design has a calculation error
// geometry source for the studio: the current result when it is clean, otherwise the last clean one (or the current one if there never was one)
function studioSrc() {
  if (R?.ctx && !R.errors?.length) return { R, D, stale: false };
  // geometry first: even with calculation errors, draw from the dimensions entered now whenever the shape itself can be built
  if (R?.ctx?.stages?.length && R.ctx.stages.every(s => s.geo?.parts?.length === 3 && s.carrier?.plates)) { try { PGD3D.layout(R, D); return { R, D, stale: false, live: true }; } catch (e) { } }
  if (GOOD) return { R: GOOD.R, D: GOOD.D, stale: true, from: 'last' };
  // no clean result yet in this session (e.g. the saved design already had an error when the page opened):
  // try the same design with the carrier sizes back on automatic, otherwise the built-in example
  const key = JSON.stringify(D);
  if (STUDIO.fbKey !== key) {
    STUDIO.fbKey = key; STUDIO.fb = null;
    const tries = [['auto', () => { const d = JSON.parse(key); d.stages.forEach(st => { if (st.carrier) ['width', 'groove', 'pocket', 'outerD', 'innerD', 'bossD'].forEach(k => st.carrier[k] = null); }); return d; }], ['example', () => E.defaultDesign()]];
    for (const [from, mk] of tries) { try { const d = mk(); if (window.PGDChecks) { PGDChecks.ensure(d); PGDChecks.applyNeedles(d); } const r = E.analyze(d); if (r?.ctx && !r.errors?.length) { STUDIO.fb = { R: r, D: d, stale: true, from }; break; } } catch (e) { } }
  }
  return STUDIO.fb;
}
function studioParts() {
  const S = studioSrc(); if (!S) return [];
  const n = S.R.ctx.stages.length, out = [];
  for (let i = 1; i <= n; i++) out.push(`sun${i}`, `planet${i}`, `carrier${i}`);
  out.push(...(S.D.config.sharedRing && n > 1 ? ['ring'] : Array.from({ length: n }, (_, i) => `ring${i + 1}`)));
  const order = id => ({ sun: 0, planet: 1, ring: 2, carrier: 3 })[id.replace(/\d/g, '')] * 10 + (+id.replace(/\D/g, '') || 0);
  return out.sort((a, b) => order(a) - order(b));
}
const sName = id => { try { return PGD3D.compName(R, D, id); } catch (e) { return id; } };
const sLetter = id => ({ sun: 'S', planet: 'P', ring: 'R', carrier: 'C' })[id.replace(/\d/g, '')] + (id.replace(/\D/g, '') || (D.config.sharedRing ? '1-2' : ''));
function studioVerdict(id) {
  const m = /^(sun|planet|ring|carrier)(\d?)$/.exec(id); if (!m || !R?.rated) return [];
  const st = m[2] ? +m[2] : null, part = { sun: 0, planet: 1, ring: 2 }[m[1]], out = [];
  const chip = (t, v, ok) => out.push({ t, v, ok });
  if (part != null) {
    const rows = R.rated.rows.filter(r => r.part === part && (st == null || r.stage === st));
    if (rows.length) {
      const sh = Math.min(...rows.map(r => r.SH)), sf = Math.min(...rows.map(r => r.SF));
      chip('피팅 SH', fmt(sh, 2), sh >= D.req.SH); chip('굽힘 SF', fmt(sf, 2), sf >= D.req.SF);
      const kh = Math.max(...rows.map(r => r.f.KHb)); chip('KHβ', fmt(kh, 2), kh <= 2);
      const pk = R.peak?.rows?.filter(r => r.part === part && (st == null || r.stage === st)) || [];
      if (pk.length) { const s = Math.min(...pk.map(r => Math.min(r.SH / D.req.SHstat, r.SF / D.req.SFstat))); chip('피크 정적 (S/목표)', fmt(s, 2), s >= 1); }
    }
    if (part === 1 && R.bearings?.[st - 1]) { const bb = R.bearings[st - 1]; chip('니들 L10', fmtH(bb.L10h) + ' h', bb.L10h >= D.req.lifeH); }
    if (part === 0 && R.rated.stages?.[st - 1]) chip('Kγ', fmt(R.rated.stages[st - 1].Kg, 2), R.rated.stages[st - 1].Kg <= 1.3);
  } else if (m[1] === 'carrier' && R.carrierPin?.[st - 1]) {
    const c = R.carrierPin[st - 1];
    const at = k => c.modes[k].case ? ` · ${c.modes[k].kind} ${fmt(c.modes[k].T, 1)} N·m` : '';
    chip('핀 굽힘', fmt(c.Sbend, 2) + (c.Sbend < 1 ? ' · 미달' : '') + at('bend'), c.Sbend >= 1); chip('구멍 면압', fmt(c.Spress, 2) + at('press'), c.Spress >= 1);
    if (Number.isFinite(c.Sweb)) chip('기둥', fmt(c.Sweb, 2) + at('web'), c.Sweb >= 1);
    chip('핀 처짐', fmt(c.rated.defl, 2) + ' µm', null);
  }
  const p = bomList().find(x => x.id === id); if (p) chip('중량', fmt(p.mass * 1000, 1) + ' g' + (p.qty > 1 ? ` × ${p.qty}` : ''), null);
  return out;
}
// dimension lines in part coordinates (axis Z, gear face 0…b, input side negative)
function studioDims(id, S = studioSrc()) {
  const m = /^(sun|planet|ring|carrier)(\d?)$/.exec(id); if (!m || !S) return [];
  const { R, D } = S;
  let L; try { L = PGD3D.layout(R, D); } catch (e) { return []; }
  const i = m[2] ? +m[2] - 1 : 0, x = L.S[i], g = x.g, st = D.stages[i], b = x.b ?? st.b, out = [];
  const A = (deg, r, z) => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180), z];
  const dia = (deg, r, z, text, path, extra = {}) => out.push(Object.assign({ a: A(deg + 180, r, z), b: A(deg, r, z), at: 'b', text, path, value: path ? get(path) : null }, extra));
  const axial = (deg, r, z0, z1, text, path, extra = {}) => out.push(Object.assign({ a: A(deg, r, z0), b: A(deg, r, z1), text, path, value: path ? get(path) : null }, extra));
  const sch = (() => { try { return PGD3D.partSchema(R, D, id); } catch (e) { return []; } })(), autoOf = p => sch.find(r => r.path === p)?.auto;
  if (m[1] === 'sun' || m[1] === 'planet') {
    const P = g.parts[m[1] === 'sun' ? 0 : 1], ra = P.da / 2, bore = m[1] === 'sun' ? x.sunBore : x.planetBore, bp = `stages.${i}.${m[1] === 'sun' ? 'sunBore' : 'planetBore'}`;
    dia(90, ra, b, `이끝원 Ø${fmt(P.da, 2)}`, null, { kind: 'ref', off: [0, -14] });
    if (bore > 0) dia(35, bore / 2, b, `보어 Ø${fmt(bore, 2)}`, bp, { auto: autoOf(bp), off: [0, 0] });
    axial(-90, ra + 1.5, 0, b, `치폭 ${fmt(b, 2)}`, `stages.${i}.b`, { off: [0, 14] });
    if (m[1] === 'sun') {
      const h = D.geom?.[`sun${i + 1}`] || {};
      if (h.hubInOD > 0 && h.hubInL > 0) {
        axial(-90, h.hubInOD / 2 + 1.5, -h.hubInL, 0, `축 길이 ${fmt(h.hubInL, 2)}`, `geom.sun${i + 1}.hubInL`, { off: [0, 14] });
        dia(120, h.hubInOD / 2, -h.hubInL, `축 Ø${fmt(h.hubInOD, 2)}`, `geom.sun${i + 1}.hubInOD`, { off: [-10, -12] });
      }
    }
    out.push({ a: [0, 0, b], b: A(150, P.d / 2, b), text: `z${P.z} · m${fmt(st.m, 2)} · β${fmt(st.beta, 0)}°`, kind: 'ref', off: [-26, -8] });
  } else if (m[1] === 'ring') {
    const P = g.parts[2], depth = L.shared ? L.gearEnd - (L.S[0].z0 || 0) : b;
    dia(90, x.ringOD / 2, depth, `링 외경 Ø${fmt(x.ringOD, 2)}`, 'stages.0.ringOD', { auto: autoOf('stages.0.ringOD'), off: [0, -14] });
    dia(35, P.da / 2, depth, `이끝원 Ø${fmt(P.da, 2)}`, null, { kind: 'ref', off: [0, 0] });
    axial(-90, x.ringOD / 2 + 1.5, 0, depth, `치부 길이 ${fmt(depth, 2)}`, null, { kind: 'ref', off: [0, 14] });
    out.push({ a: [0, 0, depth], b: A(150, P.d / 2, depth), text: `z${P.z} · 림 ${fmt((x.ringOD - P.df) / 2, 2)}`, kind: 'ref', off: [-26, -8] });
  } else {
    const sh = x.carrier, ro = sh.outerD / 2, ri = sh.innerD / 2, pl = sh.plates, z0 = Math.min(...pl.map(p => p[0])), z1 = Math.max(...pl.map(p => p[1])), pin0 = sh.pins[0], c = `stages.${i}.carrier`;
    dia(90, ro, z1, `외경 Ø${fmt(sh.outerD, 2)}`, `${c}.outerD`, { auto: sh.outerD, off: [0, -14] });
    dia(200, ri, z1, `내경 Ø${fmt(sh.innerD, 2)}`, `${c}.innerD`, { auto: sh.innerD, off: [0, 0] });
    axial(150, ro + 1.5, z0, z1, `캐리어 두께 ${fmt(sh.width, 2)}`, `${c}.width`, { auto: sh.widthAuto ? sh.width : undefined, off: [0, -14] });
    out.push({ a: [0, 0, z1], b: [pin0.x, pin0.y, z1], text: `핀 PCD Ø${fmt(sh.drivePCD, 3)}`, kind: 'ref', off: [0, -12] });
    const pn = sh.pins[1 % sh.pins.length], pk = sh.pins[2 % sh.pins.length], tA = Math.atan2(pn.y, pn.x), tK = Math.atan2(pk.y, pk.x);
    // pin Ø: across the pin end, tangential direction
    out.push({ a: [pn.x + Math.sin(tA) * sh.diameter / 2, pn.y - Math.cos(tA) * sh.diameter / 2, z1 + .2], b: [pn.x - Math.sin(tA) * sh.diameter / 2, pn.y + Math.cos(tA) * sh.diameter / 2, z1 + .2], at: 'b', text: `핀 Ø${fmt(sh.diameter, 2)}`, path: `stages.${i}.pin.d`, value: get(`stages.${i}.pin.d`), off: [0, -14] });
    if (sh.hole?.mode === 'blind') {
      const p0 = sh.pins[0], deg = Math.atan2(p0.y, p0.x) * 180 / Math.PI;
      axial(deg, sh.orbit + sh.diameter / 2 + .8, Math.min(sh.hole.entry, sh.hole.end), Math.max(sh.hole.entry, sh.hole.end), `핀 홀 깊이 ${fmt(sh.hole.depth, 2)}`, `stages.${i}.pin.depth`, { auto: sh.hole.autoDepth, off: [0, 14] });
    }
    if (sh.double) {
      const zm = (pl[0][1] + pl[1][0]) / 2;
      axial(0, ro + 1.2, pl[0][1], pl[1][0], `안착 폭 ${fmt(sh.groove, 2)}`, `${c}.groove`, { auto: sh.groove, off: [0, 14] });
      out.push({ a: [pk.x + Math.sin(tK) * sh.pocket / 2, pk.y - Math.cos(tK) * sh.pocket / 2, zm], b: [pk.x - Math.sin(tK) * sh.pocket / 2, pk.y + Math.cos(tK) * sh.pocket / 2, zm], text: `유성 포켓 ${fmt(sh.pocket, 2)}`, path: `${c}.pocket`, value: get(`${c}.pocket`), auto: sh.pocket, off: [0, -14] });
      // end-mill corner R: leader from the corner of the pocket on the next pin
      const fi = sh.fillets?.[((3 % sh.pins.length) * 4) % sh.fillets.length];
      if (fi && sh.pocketR > 0) {
        const t = .5, P = [fi.A[0] + (fi.B[0] - fi.A[0]) * t, fi.A[1] + (fi.B[1] - fi.A[1]) * t], k = sh.pocketR * (1 - Math.SQRT1_2);
        out.push({ a: [P[0] + fi.n[0] * k, P[1] + fi.n[1] * k, fi.z + fi.dir * k], b: [P[0] + fi.n[0] * sh.pocketR * 1.6, P[1] + fi.n[1] * sh.pocketR * 1.6, fi.z + fi.dir * sh.pocketR * 1.6], at: 'b',
          text: `모서리 R${fmt(sh.pocketR, 2)}`, path: `${c}.pocketR`, value: get(`${c}.pocketR`), auto: sh.pocketRAuto ? sh.pocketR : undefined, off: [8, 10] });
      }
    }
  }
  // drawn from an older clean shape: editable labels show the value now entered, so the edit you just made is visible even though the shape could not be rebuilt
  if (S.stale) out.forEach(d => { if (d.path) { const v = get(d.path); if (Number.isFinite(v)) d.text = d.text.replace(/[\d.]+$/, fmt(v, 2)); d.value = v; } });
  return out;
}
function studioPage() {
  const ids = studioParts(), S = studioSrc();
  if (!ids.length) return head('부품 편집', '부품 형상을 만들 수 있는 계산 결과가 아직 없습니다. 잇수·모듈·치폭부터 확인하세요.') + errBox();
  if (!ids.includes(STUDIO.id)) STUDIO.id = ids[0];
  const id = STUDIO.id, err = R?.errors?.length ? R.errors : null, chips = err ? [] : studioVerdict(id), p = err ? null : bomList().find(x => x.id === id);
  const stN = +(id.replace(/\D/g, '') || 0), mine = e => stN ? e.startsWith(stN + '단') || !/^\d단/.test(e) : true;
  const errHTML = err ? `<div class="st-err"><b>판정 보류 — 형상 편집은 계속됩니다</b>
      <ul>${err.map(e => `<li class="${mine(e) ? 'me' : ''}">${esc(e)}</li>`).join('')}</ul>
      <p class="note">${S.live ? '3D는 지금 입력한 치수 그대로 그린 형상입니다. 강도·수명 판정만 멈춰 있습니다.' : ({ last: '3D는 마지막으로 계산이 성립한 형상입니다.', auto: '3D는 캐리어 치수를 자동값으로 돌렸을 때의 형상입니다.', example: '3D는 기본 예제의 형상입니다.' }[S.from] || '') + ' (지금 입력으로는 형상 자체를 만들 수 없습니다.) 밝은 치수와 입력칸에는 지금 값이 표시되고, 오류가 풀리면 형상이 바로 갱신됩니다.'} 판정 칩은 오류가 풀리면 다시 나타납니다.</p></div>` : '';
  const grp = k => ids.filter(x => x.startsWith(k));
  const list = [['sun', '썬 S'], ['planet', '유성 P'], ['ring', '링 R'], ['carrier', '캐리어 C']].map(([k, t]) => `<div class="st-g">${t}</div>${grp(k).map(x => { const v = studioVerdict(x), bad = v.some(c => c.ok === false); return `<button class="st-it ${x === id ? 'on' : ''}" data-part="${x}"><span class="dot ${bad ? 'bad' : v.length ? 'ok' : ''}"></span><b>${sLetter(x)}</b><span>${esc(sName(x).replace(/^\S+\s/, ''))}</span></button>`; }).join('')}`).join('');
  return `<div class="studio">
    <aside class="st-list"><div class="st-h">가공 부품</div>${list}<p class="note">S·P·R·C 4종. 부품을 고르면 그 부품만 3D로 띄웁니다.</p></aside>
    <section class="st-stage">
      <div class="st-tools"><b>${esc(sLetter(id))} · ${esc(sName(id))}</b><span class="sp"></span>
        ${[['iso', '기본'], ['front', '정면 (축방향)'], ['side', '측면']].map(([v, t]) => `<button class="btn" data-pv="${v}">${t}</button>`).join('')}
        <label class="tg"><input type="checkbox" id="pvSec" ${STUDIO.section ? 'checked' : ''}> 단면</label>
        <label class="tg"><input type="checkbox" id="pvDim" ${STUDIO.dims ? 'checked' : ''}> 치수</label></div>
      <div id="partView" class="pv"><div class="pv-hint">드래그: 회전 · 휠: 확대 · 더블클릭: 기본 시점 · <b>밝은 치수</b>를 누르면 바로 수정</div></div>
    </section>
    <aside class="st-panel">
      ${errHTML}<div class="st-vd">${chips.map(c => `<span class="vchip2 ${c.ok === true ? 'ok' : c.ok === false ? 'bad' : ''}"><small>${esc(c.t)}</small><b>${esc(c.v)}</b></span>`).join('')}</div>
      <div class="st-sec"><h4>치수 · 형상 <span class="note">빈칸 = 자동</span></h4>${dimsHTML(id, S) || '<p class="note">편집할 치수가 없습니다.</p>'}</div>
      ${p ? `<p class="note">${esc(p.material)} · ${esc(p.heat)} · 수량 ${p.qty}</p>` : ''}
    </aside>
  </div>
  ${drawingHTML(id)}`;
}
function bindStudio(m) {
  m.querySelectorAll('[data-part]').forEach(b => b.onclick = () => { if (PARTV) STUDIO.view = null; STUDIO.id = b.dataset.part; render(true); });
  const host = m.querySelector('#partView');
  if (host && window.THREE && window.PGD3D?.mountPart) {
    try {
      const S = studioSrc();
      PARTV = PGD3D.mountPart(host, { R: S.R, D: S.D, id: STUDIO.id, dims: studioDims(STUDIO.id, S), view: STUDIO.viewFor === STUDIO.id ? STUDIO.view : null, section: STUDIO.section, showDims: STUDIO.dims,
        onEdit: (path, v) => { set(path, v); changed(); },
        onFocus: d => { if (!d.path) return; const el = m.querySelector(`.st-panel [data-p="${d.path}"]`); if (el) { el.scrollIntoView({ block: 'nearest' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); } } });
      if (PARTV) PARTV.partId = STUDIO.id;
    } catch (e) { console.error(e); host.insertAdjacentHTML('beforeend', `<p class="note" style="padding:12px">3D 생성 오류: ${esc(e.message)}</p>`); }
  } else if (host) host.insertAdjacentHTML('beforeend', '<p class="note" style="padding:12px">3D 라이브러리(three.js)를 불러오지 못했습니다.</p>');
  m.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => PARTV?.setView(b.dataset.pv));
  const sec = m.querySelector('#pvSec'); if (sec) sec.onchange = e => { e.stopPropagation(); STUDIO.section = sec.checked; PARTV?.setSection(sec.checked); };
  const dm = m.querySelector('#pvDim'); if (dm) dm.onchange = e => { e.stopPropagation(); STUDIO.dims = dm.checked; PARTV?.showDims(dm.checked); };
  bindDrawing(m, id => { if (studioParts().includes(id)) { STUDIO.id = id; STUDIO.view = null; render(true); } else { const dw = m.querySelector('#dwg'); if (dw) { dw.outerHTML = drawingHTML(id); bindDrawing(m); } } });
}
function renderRail() {
  const E2 = procEval(), c = ictx(), cur = view.startsWith('st-') ? view.slice(3) : view.startsWith('it-') ? itemStage(view.slice(3)) : null, curItem = view.startsWith('it-') ? view.slice(3) : null;
  const tab = (id, t, on) => `<button data-v="${id}" aria-current="${on}">${t}</button>`;
  const coreOn = view === 'core' || view.startsWith('cg-');
  $('#tabs').innerHTML = tab('db', '설계 DB', view === 'db') + tab('map', '설계 지도', view === 'map') + tab('core', '핵심 검토', coreOn) + tab('it-' + LASTITEM, '전체 항목', !!cur) + tab('studio', '부품 편집', view === 'studio') + tab('overview', '3D · 종합판정', view === 'overview') + tab('proc', '체크리스트', view === 'proc');
  $('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.v));
  // 모바일: 현재 탭이 가로 스크롤 밖에 있으면 보이게
  const curTab = $('#tabs').querySelector('[aria-current=true]'); if (curTab && $('#tabs').scrollWidth > $('#tabs').clientWidth) curTab.scrollIntoView({ block: 'nearest', inline: 'center' });
  if (coreOn && window.PGDGroups) return renderCoreRail(c);
  const all = ord(), sts = Object.fromEntries(all.map(x => [x, rvState(x, c)])), nd = all.filter(x => sts[x] === 'done').length, ns = all.filter(x => sts[x] === 'stale').length;
  $('#rail').innerHTML = `<div class="rprog"><div><b>${nd}</b> / ${all.length} 검토${ns ? ` · <span class="bad">재검토 ${ns}</span>` : ''}</div><i style="width:${nd / all.length * 100}%"></i></div><div class="grp">설계 단계</div>` +
    E2.map(g => { const k = String(g.n), open = k === cur, d = g.items.filter(i => sts[i.id] === 'done').length, s = g.items.some(i => sts[i.id] === 'stale');
      return `<button data-v="st-${k}" class="stg" aria-current="${open && !curItem}" aria-expanded="${open}"><span class="dot ${gateCls(g.gate.ok)}"></span><span class="sn">${k}</span>${esc(k === 'D' ? '가공·원가' : g.name)}<small class="${s ? 'bad' : ''}">${d}/${g.total}</small></button>` +
        (open ? `<div class="its">${g.items.map(i => { const ok = itemOk(i.id, c); return `<button data-v="it-${i.id}" class="it ${curItem === i.id ? 'on' : ''}"><span class="dot ${ok === true ? 'ok' : ok === false ? 'bad' : ''}"></span><span class="iid">${i.id}</span><span class="itt">${esc(i.t)}</span>${rvBadge(sts[i.id])}</button>`; }).join('')}</div>` : ''); }).join('');
  $('#rail').querySelectorAll('button[data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
  $('#rail').querySelector('.it.on')?.scrollIntoView({ block: 'nearest' });
}
// 모바일 목록 서랍 (≤ 760px에서 목록을 화면 전체로 열고 닫는다)
function setRail(open) { document.body.classList.toggle('rail-open', !!open); const b = document.getElementById('railBtn'); if (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.textContent = open ? '✕ 닫기' : '☰ 목록'; } if (open) { const c = document.querySelector('#rail [aria-current=true], #rail .on'); c?.scrollIntoView({ block: 'center' }); } }
document.getElementById('railBtn')?.addEventListener('click', () => setRail(!document.body.classList.contains('rail-open')));
function go(id, anchor) {
  if (VIEW_ITEM[id]) id = 'it-' + VIEW_ITEM[id];
  if (id.startsWith('st-') && anchor && IT()[anchor]) id = 'it-' + anchor;
  if (id.startsWith('it-') && !IT()[id.slice(3)]) id = 'map';
  if (id.startsWith('cg-') && !window.PGDGroups?.G[id.slice(3)]) id = 'core';
  view = id; ANCHOR = null; setRail(false);
  try { history.replaceState(null, '', '#' + id); } catch (e) { }
  renderRail(); render(); window.scrollTo(0, 0); applyFocus();
}
function renderVerdict() {
  const el = $('#verdict'), chip = $('#vchip');
  if (chip) {
    if (!R || R.errors?.length) chip.innerHTML = '<b class="bad">계산 불가</b>';
    else { const nb = R.verdict.filter(x => !x.ok).length; chip.innerHTML = `<span>정격 <b class="${R.reducerCap < D.req.Trated ? 'bad' : 'good'}">${fmt(R.reducerCap, 1)}</b> / 목표 ${D.req.Trated} N·m</span><span class="vb ${nb ? 'bad' : 'good'}">${nb ? nb + '개 미달' : '전 항목 충족'}</span><i>▾</i>`; }
  }
  if (!R || R.errors?.length) { el.innerHTML = `<div class="kpi"><div class="label">계산 불가</div></div><ul class="warns">${(R?.errors || []).map(e => `<li>${esc(e)}</li>`).join('')}</ul>`; return; }
  const ok = R.verdict.every(x => x.ok);
  el.innerHTML = `
   <div class="kpi"><div class="label">감속기 한계 · ${BASIS()} (${D.req.lifeH} h)</div><div class="big ${R.reducerCap < D.req.Trated ? 'bad' : ''}">${fmt(R.reducerCap, 1)}<small> N·m</small></div><div class="note">${esc(R.reducerGov)}</div><button type="button" class="btn" data-torque-trace>한계 근거 · 기준안 비교</button></div>
   ${MC ? `<div class="kpi"><div class="label">시편 예측 · 중앙값 (P10–P90)</div><div class="big">${fmt(MC.capacity.p50, 1)}<small> N·m</small></div><div class="note">${fmt(MC.capacity.p10, 1)} – ${fmt(MC.capacity.p90, 1)} N·m · 몬테카를로 ${MC.n}회</div></div>` : `<div class="kpi"><div class="label">시편 예측</div><div class="note">11단계 검증에서 가상 검증을 실행하면 표시됩니다.</div></div>`}
   <div class="kpi"><div class="label">목표 정격 ${D.req.Trated} N·m · 판정</div><div class="big ${ok ? 'good' : 'bad'}" style="font-size:28px">${ok ? '전 항목 충족' : R.verdict.filter(x => !x.ok).length + '개 항목 미달'}</div></div>
   <ul>${R.verdict.map(x => `<li><span>${esc(x.k)}${verdictLinks(x)}</span><b class="${x.ok ? 'good' : 'bad'}">${x.ok ? '✓' : '✗'} ${fmtV(x)}</b></li>`).join('')}</ul>`;
  bindVerdictLinks(el);
}
// Links from a verdict line to the inputs that decide it (governing duty row, pin entries, external loads).
function verdictLinks(x) {
  const id = x.id || x.k, out = [];
  if (id.startsWith('유성 핀') && R.carrierPin?.length) {
    const c = R.carrierPin.reduce((m, q) => q.gov.S < m.gov.S ? q : m), g = c.gov;
    if (g.duty != null) out.push(`<button type="button" class="lnk" data-vgo="duty:${g.duty}">듀티 ${g.duty + 1}행</button>`);
    out.push(`<button type="button" class="lnk" data-vgo="pin:${c.stage}">${c.stage}단 핀 입력</button>`);
  }
  if (x.na && id.startsWith('출력 베어링')) out.push('<button type="button" class="lnk" data-vgo="ext:0">외력 입력</button>');
  return out.length ? ` <span class="vlinks">${out.join('')}</span>` : '';
}
let FOCUS = null;   // { duty: row } or { path } — highlighted once on the next render of that page
function bindVerdictLinks(root) {
  root.querySelectorAll('[data-vgo]').forEach(b => b.onclick = e => {
    e.stopPropagation(); const [k, v] = b.dataset.vgo.split(':');
    if (k === 'duty') { FOCUS = { duty: +v }; go('it-1-4'); }
    else if (k === 'pin') { FOCUS = { path: `stages.${+v - 1}.pin.allow` }; go('it-6-4'); }
    else if (k === 'ext') { FOCUS = { path: 'req.ext.Fr' }; go('it-1-5'); }
  });
}
function applyFocus() {
  if (!FOCUS) return; const f = FOCUS; FOCUS = null;
  const el = f.duty != null ? document.querySelector(`[data-duty-row="${f.duty}"]`) : document.querySelector(`[data-p="${f.path}"]`);
  if (!el) return; const row = el.closest('tr, label') || el;
  row.classList.add('focus-hl'); row.scrollIntoView({ block: 'center' }); setTimeout(() => row.classList.remove('focus-hl'), 4000);
  if (el.matches?.('input, select')) el.focus({ preventScroll: true });
}
let torqueBaseline = null;
function torqueSummary() {
  const gear = R.govRated, stage = gear.row.stage;
  const after = R.ctx.stages.slice(stage).reduce((v, s) => v * s.geo.ratio, 1);
  const sizes = R.ctx.stages.map(({st}) => `${fmt(st.b, 2)} mm / ${st.n}개`).join(' · ');
  return { sizes, gear: R.capacityLife, total: R.reducerCap, gov: R.reducerGov,
    part: `${stage}단 · ${gear.row.mesh} · ${gear.row.partName} · ${gear.mode}`, after,
    loadFactors: `Kγ ${fmt(gear.row.f.Kg,3)} · Kv ${fmt(gear.row.f.Kv,3)}`, life: D.req.lifeH, rpm: D.req.rpm, basis: BASIS(),
    L10: Math.min(...R.bearings.map(b => b.L10h)),
    brg: R.ctx.stages.map(({st}) => ({ C: st.bearing.C, C0: st.bearing.C0, src: st.bearing.src === 'needle' ? '풀니들 계산' : '직접 입력' })),
    share: `${BASIS()} · Kγ ${(R.rated?.stages || []).map(x => `${fmt(x.Kg, 3)} (${x.KgSrc || '—'})`).join(' / ')}`,
    duty: E.dutyLevels(D).map(l => `${fmt(l.T, 1)} N·m×${fmt(l.frac * 100, 0)}%${l.rotating ? '' : ' 정지'}`).join(', ') };
}
// What changed between the saved baseline and the current design, in the words of the inputs (for the trace table).
function traceCauses(ref, cur) {
  if (!ref) return { brg: '', any: '' };
  const c = [];
  if (ref.sizes !== cur.sizes) c.push(`치폭·유성 개수 ${ref.sizes} → ${cur.sizes}`);
  cur.brg.forEach((b, i) => { const a = ref.brg?.[i]; if (!a) return;
    if (a.C !== b.C) c.push(`${i + 1}단 동정격하중 ${fmtN0(a.C)} → ${fmtN0(b.C)} N`);
    if (a.C0 !== b.C0) c.push(`${i + 1}단 정정격하중 ${fmtN0(a.C0)} → ${fmtN0(b.C0)} N`);
    if (a.src !== b.src) c.push(`${i + 1}단 베어링 출처 ${a.src} → ${b.src}`); });
  if (ref.share !== cur.share) c.push(`하중분배 ${ref.share} → ${cur.share}`);
  if (ref.life !== cur.life) c.push(`목표 수명 ${fmtN0(ref.life)} → ${fmtN0(cur.life)} h`);
  if (ref.rpm !== cur.rpm) c.push(`정격 회전수 ${fmtN0(ref.rpm)} → ${fmtN0(cur.rpm)} rpm`);
  if (ref.duty !== cur.duty) c.push(`부하 스펙트럼 ${ref.duty} → ${cur.duty}`);
  return { brg: c.filter(t => /정격하중|베어링 출처|목표 수명|정격 회전수|스펙트럼/.test(t)).join(' · '), any: c.join(' · ') };
}
function showTorqueTrace() {
  if (!R?.govRated || R.errors?.length) return;
  const cur = torqueSummary(), ref = torqueBaseline, row = R.govRated.row, f = row.f, causes = traceCauses(ref, cur);
  const tr = (label, a, b) => `<tr><th scope="row">${label}</th><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;
  const diff = (key) => fmt(cur[key], 2) + (ref ? ` (Δ ${fmt(cur[key]-ref[key],2)})` : '');
  const bending = row.SF / D.req.SF < row.SH / D.req.SH;
  const renderCase = v => v ? `${v.life} h · ${v.rpm} rpm · ${v.basis}` : '—';
  const bearingStage = R.bearingCap.indexOf(R.reducerCap);
  let support = '';
  if (bearingStage >= 0) {
    const bearing = R.ctx.stages[bearingStage].st.bearing;
    const op = E.evaluate(R.ctx, { Tout: R.reducerCap, rpm: D.req.rpm, cycles: E.cyclesFor(D.req.lifeH) }).stages[bearingStage];
    const load = op.pinForce / Math.max(1, bearing.count || 1);
    support = `<p>감속기 지배 부품 · ${bearingStage + 1}단 유성 베어링 · 한계점의 개당 하중 ${fmt(load,2)} N · 동정격 C ${fmt(bearing.C,0)} N · 목표 L10 ${fmt(D.req.lifeH,0)} h</p>`;
  }
  $('#traceBody').innerHTML = `<p><b>${esc(cur.part)}</b></p>
    <p>한계점에서 SH ${fmt(row.SH,3)} / 목표 ${fmt(D.req.SH,2)} · SF ${fmt(row.SF,3)} / 목표 ${fmt(D.req.SF,2)}</p>
    <p>KA ${fmt(f.KA,3)} · Kγ ${fmt(f.Kg,3)} · Kv ${fmt(f.Kv,3)} · ${bending ? 'KFβ '+fmt(f.KFb,3)+' · KFα '+fmt(f.KFa,3) : 'KHβ '+fmt(f.KHb,3)+' · KHα '+fmt(f.KHa,3)}</p>
    <p>제한 단 캐리어 ${fmt(cur.gear/cur.after,3)} N·m × 후속 단 감속비 ${fmt(cur.after,4)} = 출력축 ${fmt(cur.gear,3)} N·m (엔진의 기어 한계 환산 기준)</p>
    ${support}<div class="scroll"><table><tr><th>비교 항목</th><th>기준안</th><th>현재안</th></tr>
    ${tr('단별 유성 치폭 / 개수',ref?.sizes || '—',cur.sizes)}${tr('운전 기준',renderCase(ref),renderCase(cur))}
    ${tr('기어 한계 N·m',ref ? fmt(ref.gear,2) : '—',diff('gear'))}${tr('기어 지배 부위',ref?.part || '—',cur.part)}${tr('지배점 하중계수',ref?.loadFactors || '—',cur.loadFactors)}
    ${tr('감속기 한계 N·m',ref ? fmt(ref.total,2) : '—',diff('total'))}${tr('감속기 지배 부위',ref?.gov || '—',cur.gov)}
    ${tr('유성 베어링 L10 (최저)', ref ? (ref.L10 < 1e4 ? fmtN0(ref.L10) : fmtH(ref.L10)) + ' h' : '—', (cur.L10 < 1e4 ? fmtN0(cur.L10) : fmtH(cur.L10)) + ' h' + (ref && Math.abs(ref.L10 - cur.L10) > 1e-6 * Math.max(1, ref.L10) ? ` — ${causes.brg || '베어링 입력 변화 없음 (하중 변화)'}` : ''))}
    ${tr('유성 베어링 C / C0 · 출처', ref ? ref.brg.map((b, i) => `${i + 1}단 ${fmtN0(b.C)} / ${fmtN0(b.C0)} N · ${b.src}`).join(' · ') : '—', cur.brg.map((b, i) => `${i + 1}단 ${fmtN0(b.C)} / ${fmtN0(b.C0)} N · ${b.src}`).join(' · '))}
    ${tr('하중분배 방식', ref?.share || '—', cur.share)}${tr('목표 수명', ref ? fmt(ref.life, 0) + ' h' : '—', fmt(cur.life, 0) + ' h' + (ref && ref.life !== cur.life ? ' (변경)' : ''))}
    ${tr('부하 스펙트럼', ref?.duty || '—', cur.duty)}
    ${ref ? tr('바뀐 입력', '', causes.any || '없음') : ''}</table></div>`;
  const dlg = $('#torqueTrace');
  if (!dlg.open) dlg.showModal();
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-torque-trace]')) showTorqueTrace();
});
$('#traceSave').onclick = () => { torqueBaseline = torqueSummary(); showTorqueTrace(); };
function bearingCaseHTML(c) {
  return `<b>${fmt(c.s0, 2)}</b><br>${esc(c.label)} · ${fmt(c.load, 1)} N<br>${fmt(c.torque, 1)} N·m · ${fmt(c.rpm, 0)} rpm`;
}
function fmtV(x) { if (x.na) return '계산 불가'; return x.unit === 'h' ? fmtH(x.value) + ' h' : fmt(x.value, x.unit === '%' ? 1 : 2) + (x.unit ? ' ' + x.unit : ''); }

// ------------------------------------------------------------------ views
function render(keepScroll) {
  const m = $('#main');
  const y = window.scrollY;
  if (VIEW3D) { if (VIEW3D.full) OVSTATE.view = VIEW3D.getView(); VIEW3D.dispose(); VIEW3D = null; }
  if (MAPV) { MAPSTATE = MAPV.state(); MAPV.dispose(); MAPV = null; }
  if (PARTV) { STUDIO.view = PARTV.getView(); STUDIO.viewFor = PARTV.partId; PARTV.dispose(); PARTV = null; }
  MAPKEEP = !!keepScroll && view === 'map';
  const core = view === 'core' || view.startsWith('cg-');
  const paged = core || view.startsWith('st-') || view.startsWith('it-');
  if (view.startsWith('it-')) LASTITEM = view.slice(3);
  document.body.classList.toggle('has-rail', paged);
  document.body.classList.toggle('structure-mode', view === 'st-2' || view.startsWith('it-2-'));
  m.className = view === 'overview' || view === 'map' || view === 'studio' || view === 'db' ? 'wide' : '';
  document.body.classList.toggle('mapmode', view === 'map');
  if (!keepScroll) { void m.offsetWidth; m.classList.add('pg-enter'); }
  if (core) {
    const gid = view.startsWith('cg-') ? view.slice(3) : null;
    m.innerHTML = gid ? groupPage(gid) : corePage();
    bindInputs(m);
    if (gid) bindGroupPage(m, gid); else bindCore(m);
    if (keepScroll) window.scrollTo(0, y);
    return;
  }
  if (paged) {
    const it = view.startsWith('it-');
    m.innerHTML = it ? itemPage(view.slice(3)) : stagePage(view.slice(3));
    bindInputs(m);
    if (it) bindItemPage(m, view.slice(3)); else bindStagePage(m);
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
  const X = procExtra(), ck = X.CK || {}, v = k => R.verdict.find(x => (x.id || x.k) === k);
  const rows = [['감속비', `${fmt(R.ratio, 3)} : 1`], [`정격 토크 (${BASIS()})`, `${fmt(R.reducerCap, 2)} N·m`], ['시편 예측 P50', MC ? `${fmt(MC.capacity.p50, 1)} N·m` : '가상 검증 실행 후'], ['피크 정적 안전율', fmtV(v('피크 토크 정적 안전율'))],
    ['효율 (정격)', fmtV(v('효율 (정격, 추정)'))], ['출력 최대 백래시 · 조립 판정', `${fmt(R.backlash.range[1],2)} arcmin · ${R.backlash.ok ? '충족' : '미달'}`], ['비틀림 강성', `${fmt(R.stiffness?.NmPerArcmin, 1)} N·m/arcmin`], ['출력 베어링 L10', fmtV(v('출력 베어링 L10'))],
    ['외경 × 길이', ck['1-6'] ? `Ø${fmt(ck['1-6'].Dout, 1)} × ${fmt(ck['1-6'].Lt, 1)} mm` : '—'], ['중량', X.mass ? `${fmt(X.mass, 0)} g` : '—'], ['정격 운전 온도', ck['10-6'] ? `${fmt(ck['10-6'].T, 1)} °C` : '—'], ['추정 원가', ck.D5?.cost ? `${Math.round(ck.D5.cost.total).toLocaleString('ko-KR')} 원/대` : '—']];
  return `<table class="ptbl ds">${rows.map(([k, x]) => `<tr><th>${k}</th><td>${x}</td></tr>`).join('')}</table>`;
}
function swVars() {
  const L = window.PGD3D ? PGD3D.layout(R, D) : null, out = [];
  R.ctx.stages.forEach((s, i) => { const n = i + 1, st = s.st; out.push(`"m${n}" = ${st.m}`, `"zs${n}" = ${st.s}`, `"zp${n}" = ${st.p}`, `"zr${n}" = ${s.geo.r}`, `"b${n}" = ${st.b}`, `"beta${n}" = ${st.beta}`, `"np${n}" = ${st.n}`, `"xs${n}" = ${st.xs}`, `"xp${n}" = ${st.xp}`, `"pin_d${n}" = ${st.pin.d}`); if (L) out.push(`"orbit_r${n}" = ${fmt(L.S[i].a, 4)}`, `"sun_bore${n}" = ${fmt(L.S[i].sunBore, 3)}`, `"planet_bore${n}" = ${fmt(L.S[i].planetBore, 3)}`); });
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
  g.push(`parts["R"] = cq.Workplane("XY").circle(${n(L.ringOD / 2)}).circle(${n(S[0].geo.parts[2].d / 2)}).extrude(${n(L.gearEnd)})`,
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
function procView() {
  const E2 = procEval();
  if (!E2.length) return head('설계 공정', '공정 데이터를 불러오지 못했습니다.');
  const c = ictx(), all = ord(), S = SRCD(), sts = Object.fromEntries(all.map(x => [x, rvState(x, c)]));
  const cnt = { D: 0, C: 0, M: 0, A: 0 }; all.forEach(id => { const k = srcCounts(id); for (const g in k) cnt[g] += k[g]; });
  const rvc = s => all.filter(x => (sts[x] || '') === s).length;
  const bar = ['D', 'C', 'M', 'A'].map(g => `<span class="pbar ${S[g].c}" style="flex:${cnt[g]}">${S[g].t} ${cnt[g]}</span>`).join('');
  const card = g => `<div class="card pcard"><div class="ph"><h3>${g.n} ${esc(g.n === 'D' ? '가공·원가' : g.name)}</h3><span class="x">${g.items.filter(i => sts[i.id] === 'done').length}/${g.total} 검토</span></div>
    <ul class="plist">${g.items.map(i => `<li data-goit="${i.id}" tabindex="0" role="button" title="${i.id} 전용 페이지로"><span class="pid">${i.id}</span><span class="pt">${esc(i.t)}</span><span class="srcs">${srcChips(i.id)}</span>${okMark(itemOk(i.id, c))}${rvBadge(sts[i.id])}</li>`).join('')}</ul>
    <div class="pgate ${gateCls(g.gate.ok)}">게이트 · ${esc(g.gate.t)} ${g.gate.ok === true ? '통과' : g.gate.ok === false ? '미달' : '판정 기준 없음'}</div></div>`;
  return head('설계 공정 체크리스트', `${all.length}개 항목 · 검토 완료 ${rvc('done')} · 재검토 필요 ${rvc('stale')} · 보류 ${rvc('hold')} · 문제 ${rvc('ng')} · 검토 전 ${rvc('')}. 항목을 누르면 전용 페이지로 갑니다. 아래 막대는 전체 데이터 행을 출처별로 센 것입니다.`) +
    `<div class="pbars">${bar}</div><div class="pgrid">${E2.map(card).join('')}</div>`;
}
const errBox = () => R?.errors?.length ? `<div class="card"><h3 class="bad">계산할 수 없습니다</h3><ul class="warns">${R.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '';
const tag = s => `<span class="tag ${s}">${s}</span>`;
const partLabel = r => `${r.stage}단 ${r.mesh} · ${r.partName}`;

const VIEWS = {
  // 설계 파일 DB: 케이스(요구 조건 · 설계 제원 · 결과 요약 · 전체 설계)를 쌓아 참고·학습에 쓴다. 초안 — 이 브라우저 저장 + 기본 설계.
  db() {
    const mine = dbMine(), q = (DBQ || '').trim().toLowerCase();
    const fN = (x, d = 1) => x == null || !Number.isFinite(+x) ? '—' : (+x).toFixed(d);
    const row = (k, x, kind, del) => { const sm = x.summary || {}, rq = x.request || {}; if (q && !JSON.stringify([x.name, sm, rq]).toLowerCase().includes(q)) return '';
      const cfg = sm.stages ? `${sm.stages}단${sm.sharedRing ? ' 공용 링' : ''} · ${(sm.gears || []).map(g => `m${g.m} ${g.s}/${g.p}/${g.r}×${g.n}`).join(' + ')}` : '—';
      return `<tr><td><b>${esc(x.name || '')}</b><br><small class="note">${kind}${x.saved ? ' · ' + new Date(x.saved).toLocaleString('ko-KR') : ''}</small></td><td>${esc(cfg)}</td><td>${fN(sm.ratio, 3)}</td><td>${sm.OD ? `Ø${fN(sm.OD)} × ${fN(sm.L)}` : '—'}</td>
        <td>${rq.Trated != null ? fN(rq.Trated) + ' N·m' : '—'}</td><td>${sm.reducerCap != null ? `<b>${fN(sm.reducerCap)}</b> N·m` : '—'}</td><td class="l note">${esc(sm.governing || '')}</td>
        <td>${sm.verdictFail ? (sm.verdictFail.length ? `<b class="bad">${sm.verdictFail.length}개 미달</b>` : '<b class="good">전 항목 충족</b>') : '—'}</td>
        <td><button class="btn" data-dbo="${k}">불러오기</button>${del != null ? ` <button class="btn" data-dbx="${del}">삭제</button>` : ''}</td></tr>`; };
    const lib = DBLIB.map((x, i) => row('lib:' + i, x, '기본 설계')).join(''), my = mine.map((x, i) => row('mine:' + i, x, '내 케이스', i)).join('');
    return head('설계 DB', '설계 케이스를 같은 형식(pgd-case/1: 요구 조건 · 설계 제원 · 결과 요약 · 전체 설계)으로 쌓아 두고 참고하거나 불러옵니다. 초안: 내 케이스는 이 브라우저에 저장되며, 내보낸 파일을 저장소 designs/ 에 모으면 기본 설계로 공유됩니다.') + `
      <div class="card"><div class="grid"><label class="f">검색 (이름 · 구성 · 지배 부위)<input type="text" id="dbQ" value="${esc(DBQ || '')}"></label></div>
      <p><button class="btn primary" id="dbSave2">현재 설계를 DB에 저장</button> <button class="btn" id="dbExp2">DB 내보내기 (케이스 JSON)</button> <button class="btn" id="dbImp2">케이스 JSON 가져오기</button>
      <span class="note">내 케이스 ${mine.length}건 · 기본 설계 ${DBLIB.length}건</span></p></div>
      <div class="card scroll"><table class="dbt"><tr><th class="l">이름</th><th>구성</th><th>감속비</th><th>외경 × 길이 mm</th><th>요구 정격</th><th>감속기 한계</th><th class="l">지배 부위</th><th>판정</th><th></th></tr>${my}${lib}</table>
      ${!my && !lib ? '<p class="note">케이스가 없습니다.</p>' : ''}</div>`;
  },
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
       <div class="legend"><span><i style="background:var(--ink)"></i>${BASIS()} ${fmt(cap, 1)} N·m</span><span><i style="background:var(--brick)"></i>목표 ${tgt} N·m</span>${MC ? `<span><i style="background:var(--accent2)"></i>시편 예측 P10–P90 ${fmt(MC.capacity.p10, 1)}–${fmt(MC.capacity.p90, 1)}, 중앙 ${fmt(MC.capacity.p50, 1)} N·m</span>` : '<span>시편 예측: 14단계에서 실행</span>'}</div>
       ${D.loads?.basis === 'ideal' ? `<p class="note">이론 판정은 오차 0인 완전한 부품·조립(Kγ = 1, 잇줄 오차 0, 탄성 변형만), 피로강도 99 % 신뢰도, 목표 안전율 SH ${D.req.SH} · SF ${D.req.SF} 기준의 상한입니다. 시편 예측은 공차 안의 무작위 오차를 받은 시편 N개의 분포입니다(11-1).</p>` : `<p class="note">ISO 6336:2019 판정은 KISSsoft와 같은 방법(KHβ 방법 C·fHβ5, 정밀도 등급 공차 기반 Kv·KHα, 치두께 공차를 넣은 치근 형상), 피로강도 99 % 신뢰도, 목표 안전율 SH ${D.req.SH} · SF ${D.req.SF} 기준입니다. 시편 예측은 공차·하중분배·재료 산포를 무작위로 뽑아 중앙값 강도로 계산한 분포입니다.</p>`}</div>
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
  overview() { return overviewView(); },
  proc() { return procView(); },
  map() { return `<div id="mapHost" class="maphost"></div>`; },
  studio() { return studioPage(); },
};

function clampPct(x) { return Math.max(0, Math.min(100, x)); }
function dutyChart() {
  const d = D.req.duty, tot = d.reduce((s, l) => s + (l.time || 0), 0) || 1, maxT = Math.max(...d.map(l => Math.abs(l.torque)), 100);
  return `<div style="display:flex;align-items:flex-end;height:110px;gap:2px;border-bottom:1px solid var(--rule);margin-top:10px">${d.map(l => { const m = E.dutyMode(l); return `<div title="${l.torque}% × ${l.time}% · ${m === 'stop' ? '정지' : m === 'set' ? l.rpm + ' rpm' : '정격 rpm'}" style="flex:${Math.max(l.time, .5) / tot};height:${Math.max(Math.abs(l.torque) / maxT * 100, 1.5)}%;background:${m === 'stop' ? 'var(--muted, #999)' : l.torque < 0 ? 'var(--bad, #c55)' : 'var(--accent2)'};opacity:.6"></div>`; }).join('')}</div><p class="note">가로 = 시간 비율, 세로 = |토크| · 회색 = 정지, 붉은색 = 역방향 토크</p>`;
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
const BASIS = () => D.loads?.basis === 'ideal' ? '이론 판정 (오차 0)' : D.loads?.basis === 'tolerance' ? '공차 한계 판정 (구)' : 'ISO 6336:2019 판정';
const lifeValue = h => h === Infinity ? '모델상 무손상' : Number.isFinite(h) ? fmtH(h) + ' h' : '판정 불가';
function mcHTML() {
  if (!MC) return '<p class="note">아직 실행하지 않았습니다. 표본 200개 기준 수 초 걸립니다.</p>';
  if (MC.error) return `<p class="bad">${esc(MC.error)}</p>`;
  const caps = MC.capacity.all.filter(Number.isFinite), lo = Math.min(...caps), hi = Math.max(...caps), nb = 24, bins = Array(nb).fill(0);
  caps.forEach(c => bins[Math.min(nb - 1, Math.floor((c - lo) / ((hi - lo) || 1) * nb))]++);
  const mx = Math.max(...bins);
  return `<div class="two"><div><h3>정격 한계 분포 · 목표 수명 ${D.req.lifeH} h</h3><div class="hist">${bins.map(b => `<i style="height:${b / mx * 100}%"></i>`).join('')}</div>
      <div class="legend"><span>${fmt(lo, 1)} N·m</span><span style="margin-left:auto">${fmt(hi, 1)} N·m</span></div>
      <table><tr><td>시편 수 N · 평균</td><td>${MC.n} · <b>${fmt(MC.capacity.mean, 2)} N·m</b></td></tr><tr><td>이론 (오차 0)</td><td>${fmt(R?.capacityLife, 2)} N·m</td></tr><tr><td>P10</td><td>${fmt(MC.capacity.p10, 2)} N·m</td></tr><tr><td><b>P50 (중앙값)</b></td><td><b>${fmt(MC.capacity.p50, 2)} N·m</b></td></tr><tr><td>P90</td><td>${fmt(MC.capacity.p90, 2)} N·m</td></tr></table></div>
    <div><h3>스펙트럼 수명 분포</h3><p>전체 ${MC.n}개 · 모델상 무손상 ${MC.life.noDamage}개 · 판정 불가 ${MC.life.invalid}개</p><table><tr><td>P10</td><td>${lifeValue(MC.life.p10)}</td></tr><tr><td><b>P50</b></td><td><b>${lifeValue(MC.life.p50)}</b></td></tr><tr><td>P90</td><td>${lifeValue(MC.life.p90)}</td></tr>
      <tr><td>목표 ${D.req.lifeH} h 달성 확률</td><td class="${MC.passLife >= .9 ? 'good' : 'bad'}"><b>${fmt(MC.passLife * 100, 0)} %</b></td></tr>
      <tr><td>Kγ 중앙 / P90</td><td>${fmt(MC.Kg.p50, 3)} / ${fmt(MC.Kg.p90, 3)}</td></tr><tr><td>KHβ 중앙 / P90</td><td>${fmt(MC.KHb.p50, 3)} / ${fmt(MC.KHb.p90, 3)}</td></tr></table>
      <p class="note">${D.loads?.basis === 'ideal' ? `이론 정격 ${fmt(R?.capacityLife, 2)} N·m는 오차 0인 완전한 부품의 상한입니다. 시편은 정밀도 등급·유성 위치·평행도 공차 안에서 오차를 무작위로 받아(3σ = 활용률 × 공차) 그 아래에 분포합니다.` : `ISO 6336:2019 판정 ${fmt(R?.capacityLife, 2)} N·m와의 차이는 99 % 신뢰도·규격 공차 대신 중앙값·공정 분포를 쓴 효과입니다.`}</p></div></div>`;
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

// ------------------------------------------------------------------ widgets: detail tables & tools placed on item pages (items.js 'w')
const nst = () => D.stages.slice(0, D.config.stages);
const W = {
  case() {
    const cs = E.CASES, cur = cs[D.req.case], has = !!cur;
    const pos_ = has ? D.req.case.split('-')[0] : 'lower', axis = has ? D.req.case.split('-')[1] : 'pitch';
    return `<div class="card"><h3>관절 케이스 표</h3><div class="grid">
        <label class="f">관절 위치<select id="cPos"><option value="lower" ${pos_ === 'lower' ? 'selected' : ''}>하체</option><option value="upper" ${pos_ === 'upper' ? 'selected' : ''}>상체</option></select></label>
        <label class="f">관절 축<select id="cAxis">${['roll', 'pitch', 'yaw'].map(a => `<option value="${a}" ${axis === a ? 'selected' : ''}>${{ roll: '롤', pitch: '피치', yaw: '요' }[a]}</option>`).join('')}</select></label>
        <label class="f">&nbsp;<button class="btn primary" id="cApply" type="button">케이스 적용</button></label></div>
      <p class="note">현재: <b>${has ? esc(cur.label) : '사용자 정의'}</b>${has ? ' · ' + esc(cur.note) : ''}. 적용하면 1-2 ~ 1-5의 값이 정격 토크 비례로 채워집니다. 정격 토크를 바꾼 뒤에는 다시 적용해야 비례값이 갱신됩니다.</p>
      <div class="scroll"><table><tr><th class="l">케이스</th><th>피크 ×</th><th>비상 ×</th><th>관절 rpm</th><th>수명 h</th><th>Fr/T</th><th>Fa/T</th><th>M/T</th><th class="l">특징</th></tr>
      ${Object.entries(cs).map(([k, c]) => `<tr class="${k === D.req.case ? 'gov' : ''}"><td class="l">${esc(c.label)}</td><td>${c.peak}</td><td>${c.emerg}</td><td>${c.outRpm}</td><td>${c.life}</td><td>${c.ext[0]}</td><td>${c.ext[1]}</td><td>${c.ext[2]}</td><td class="l note">${esc(c.note)}</td></tr>`).join('')}</table></div>
      <p class="note">Fr·Fa는 정격 토크 1 N·m당 N, M은 1 N·m당 N·m.</p></div>`;
  },
  duty() {
    const d = D.req.duty, U = dutyUnits(), tot = d.reduce((s, l) => s + (+l.time || 0), 0) || 1, Nm = U.torque === 'Nm', sec = U.time === 's';
    const tsel = `<select data-dunit="torque"><option value="pct" ${Nm ? '' : 'selected'}>정격 대비 %</option><option value="Nm" ${Nm ? 'selected' : ''}>N·m</option></select>`;
    const hsel = `<select data-dunit="time"><option value="pct" ${sec ? '' : 'selected'}>비율 (%)</option><option value="s" ${sec ? 'selected' : ''}>초 (s)</option></select>`;
    return `<div class="card"><h3>부하 스펙트럼</h3>
      <div class="grid"><label class="f">토크 입력 단위${tsel}</label><label class="f">시간 입력 단위${hsel}</label></div>
      <div class="scroll"><table><tr><th>구간</th><th>토크 ${Nm ? 'N·m' : '%'} (음수 = 역방향)</th><th>${Nm ? '정격 대비 %' : '토크 N·m'}</th><th>시간 ${sec ? '초' : '%'}</th><th>시간 비중</th><th>회전</th><th>입력 rpm</th><th>외부 하중 % (빈칸 = |토크 %|)</th><th></th></tr>
      ${d.map((l, i) => { const m = E.dutyMode(l), T = E.dutyTorque(l, D); return `<tr data-duty-row="${i}"><td>${i + 1}</td><td>${Nm ? `<input type="number" step="any" data-p="req.duty.${i}.Tnm" data-t="num" value="${l.Tnm ?? ''}" style="width:80px">` : `<input type="number" step="any" data-p="req.duty.${i}.torque" data-t="num" value="${l.torque}" style="width:80px">`}</td><td>${Nm ? fmt(T / D.req.Trated * 100, 2) + ' %' : fmt(T, 2)}</td><td><input type="number" step="any" data-p="req.duty.${i}.time" data-t="num" value="${l.time}" style="width:80px"></td><td>${fmt((+l.time || 0) / tot * 100, 1)} %</td>
        <td><select data-p="req.duty.${i}.mode" data-t="str">${[['rated', '정격 rpm 사용'], ['set', '지정 rpm으로 회전'], ['stop', '0 rpm 정지 (유지 토크)']].map(([k, t]) => `<option value="${k}" ${k === m ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td>${m === 'set' ? `<input type="number" data-p="req.duty.${i}.rpm" data-t="num" value="${l.rpm ?? ''}" style="width:90px">` : `<span class="note">${m === 'stop' ? '0' : `${D.req.rpm} (정격)`}</span>`}</td>
        <td><input type="number" data-p="req.duty.${i}.ext" data-t="num" value="${l.ext ?? ''}" placeholder="${fmt(Math.abs(T / D.req.Trated * 100), 1)}" style="width:80px"></td><td><button class="btn" data-del="${i}">삭제</button></td></tr>`; }).join('')}
      </table></div><p><button class="btn" id="addDuty">구간 추가</button> <span class="note">시간 합 ${fmt(tot, 2)} ${sec ? '초' : '%'} — 시간 비중 = 구간 시간 / 합 (정지·무부하 구간 포함 전체 경과 시간 기준) · ${Nm ? 'N·m로 입력한 값은 그대로 보관 (정격 토크를 바꿔도 유지)' : '% 값은 정격 토크 대비'} · 정지 구간은 회전수 0(피로 손상 없음), 유지 토크는 정적 판정 · 음수 rpm = 역회전</span></p>${dutyChart()}</div>`;
  },
  finder() {
    const st = R?.ctx?.stages || [];
    return `<div class="card"><h3>잇수 조합 탐색기</h3><div class="grid">
      <label class="f">목표 단 감속비<input type="number" id="fRatio" value="${fmt(st[0]?.geo.ratio || 3, 3)}" step="any"></label>
      <label class="f">유성 개수<input type="number" id="fN" value="${D.stages[0].n}"></label>
      <label class="f">썬 잇수 범위<input id="fS" value="12-60"></label>
      <label class="f">최대 링 잇수<input type="number" id="fR" value="140"></label></div>
      <p><button class="btn" id="fGo">탐색</button> <span class="note">조립 조건 · 인접 간섭을 만족하는 조합 (모듈 ${D.stages[0].m} mm 기준)</span></p><div id="fOut"></div></div>`;
  },
  ratio() {
    const st = R?.ctx?.stages || [];
    return `<div class="card"><h3>감속비</h3><table><tr><th>단</th><th>S / P / R</th><th>단 감속비</th></tr>
      ${st.map(s => `<tr><td>${s.i + 1}단</td><td>${s.st.s} / ${s.st.p} / ${s.geo.r}</td><td>${fmt(s.geo.ratio, 4)}</td></tr>`).join('')}
      <tr><td><b>총</b></td><td></td><td><b>${fmt(R?.ratio, 4)} : 1</b></td></tr></table></div>`;
  },
  components() { return componentsHTML(); },
  gear3d() {
    return `<div class="card" style="padding:10px"><div id="viewer"><div class="ctl"><button class="btn" id="vPlay">일시정지</button><button class="btn" id="vRing">링 숨기기</button></div><div class="hud">드래그: 회전 · Shift+드래그: 이동 · 휠: 확대 · 더블클릭: 기본 시점</div></div>
      <div class="grid" style="margin-top:10px"><label class="f">1단 썬 입력 회전수 rpm<input type="number" id="aRpm" value="${D.anim.rpm}" step="any"></label>
      <label class="f">재생 배속 (1 = 실속도)<select id="aSlow">${[[1, '1× 실속도'], [.2, '0.2×'], [.05, '0.05×'], [.02, '0.02×'], [.005, '0.005×']].map(([v, l]) => `<option value="${v}" ${+D.anim.slow === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="f" id="aOut" style="font-size:13px;line-height:1.5"></div></div></div>`;
  },
  geo() {
    if (!R?.ctx) return '';
    return R.ctx.stages.map((s, i) => { const g = s.geo; return g?.parts?.length ? `<div class="card scroll"><h3>${i + 1}단 기어 치수</h3><table><tr><th>기어</th><th>잇수</th><th>PCD</th><th>이끝원</th><th>이뿌리원</th><th>기초원</th><th>전위</th><th>이끝 두께</th></tr>
      ${g.parts.map(p => `<tr><td>${p.name}</td><td>${p.z}</td><td>${fmt(p.d, 3)}</td><td>${fmt(p.da, 3)}</td><td>${fmt(p.df, 3)}</td><td>${fmt(p.db, 3)}</td><td>${fmt(p.x, 3)}</td><td>${fmt(p.tipThickness, 3)}</td></tr>`).join('')}</table>
      <p class="note">핀 PCD Ø${fmt(2 * g.meshes[0].center, 3)} mm · 작용 압력각 외접 ${fmt(g.meshes[0].aw / Math.PI * 180, 2)}° / 내접 ${fmt(g.meshes[1].aw / Math.PI * 180, 2)}° · 지름은 축직각 기준</p></div>` : ''; }).join('');
  },
  checks(...names) {
    if (!R?.ctx) return '';
    return `<div class="card scroll"><h3>검사 상세</h3><table><tr><th>단</th><th class="l">항목</th><th>값</th><th>판정</th><th class="l">기준</th></tr>
      ${R.ctx.stages.map(s => s.geo.checks.filter(c => names.includes(c.k)).map(c => `<tr class="${c.ok ? '' : 'bad'}"><td>${s.i + 1}단</td><td class="l">${esc(c.k)}</td><td>${typeof c.v === 'number' ? fmt(c.v, 3) : esc(c.v)}</td><td>${c.ok ? '통과' : '확인'}</td><td class="l note">${esc(c.note || '')}</td></tr>`).join('')).join('')}</table></div>`;
  },
  rims() {
    if (!R?.ctx) return '';
    return `<div class="card scroll"><h3>림 두께</h3><table><tr><th>단</th><th class="l">부위</th><th>림 두께 sR</th><th>YB</th><th class="l">기준</th></tr>
      ${R.ctx.stages.map(s => (s.geo.rims || []).map((r, k) => `<tr class="${r.YB > 1.001 || r.error ? 'bad' : ''}"><td>${s.i + 1}단</td><td class="l">${E.NAMES[k]} (${r.solid ? '중실' : (r.assumed ? '자동' : '입력') + ' Ø' + fmt(r.diameter, 2)})</td><td>${r.solid ? '중실' : fmt(r.sR, 3) + ' mm'}</td><td>${fmt(r.YB, 3)}</td><td class="l note">${k === 2 ? 'sR/m ≥ 3.5면 YB = 1' : 'sR/ht ≥ 1.2면 YB = 1'}</td></tr>`).join('')).join('')}</table></div>`;
  },
  tol() {
    if (!R?.ctx) return '';
    return `<div class="card scroll"><h3>등급별 공차 (µm, ISO 1328-1:2013)</h3><table><tr><th>단</th><th>기어</th><th>단일 피치 fp</th><th>치형 형상 ffα</th><th>잇줄 기울기 fHβ</th><th>잇줄 형상</th></tr>
      ${R.ctx.stages.map((s, i) => (s.geo.tol || []).map((t, k) => `<tr><td>${i + 1}단</td><td>${E.NAMES[k]}</td><td>${fmt(t.pitch, 1)}</td><td>${fmt(t.profileForm, 1)}</td><td>${fmt(t.helixSlope, 1)}</td><td>${fmt(t.helixForm, 1)}</td></tr>`).join('')).join('')}</table></div>`;
  },
  kf() {
    if (!R?.rated) return '';
    return `<div class="card scroll"><h3>정격 ${D.req.Trated} N·m에서의 하중계수</h3><table><tr><th>부위</th><th>Kγ</th><th>Kv</th><th>fma µm</th><th>fsh 핀 / 캐리어 / 출력베어링 µm</th><th>접촉폭</th><th>KHβ</th><th>KHα</th><th class="l">근거</th></tr>
      ${R.rated.rows.filter(r => r.part === (r.mesh === '썬–유성' ? 0 : 2)).map(r => `<tr><td>${r.stage}단 ${r.mesh}</td><td>${fmt(r.f.Kg, 3)}</td><td>${fmt(r.f.Kv, 3)}</td><td>${fmt(r.f.fma, 2)}</td><td>${fmt(r.f.fshPin, 2)} / ${fmt(r.f.fshCar, 2)} / ${fmt(r.f.fshOB, 2)}</td><td>${fmt(r.f.frac * 100, 0)} %</td><td>${fmt(r.f.KHb, 3)}</td><td>${fmt(r.f.KHa, 3)}</td><td class="l">${tag(r.f.KgSrc)} ${esc(r.f.KgNote)}</td></tr>`).join('')}</table>
      <p class="note">KHβ는 부하가 낮을수록 커집니다(부분 접촉). Kγ는 유성 위치 공차, 치합·핀 경로 강성, 썬 지지 강성·유격의 힘 평형으로 계산합니다.</p></div>`;
  },
  // ISO 6336 detail per flank, laid out like a KISSsoft report so values can be checked line by line
  iso() {
    if (!R?.rated) return '';
    const rs = R.rated.rows, c = (k, d = 3) => rs.map(r => `<td>${fmt(r.f[k], d)}</td>`).join('');
    const row = (t, k, d, unit = '') => `<tr><td class="l">${t}${unit ? ` <span class="note">${unit}</span>` : ''}</td>${c(k, d)}</tr>`;
    return `<div class="card scroll"><h3>ISO 6336 상세 (KISSsoft 보고서 대조용) · 정격 ${D.req.Trated} N·m · ${BASIS()}</h3><table class="iso">
      <tr><th class="l">항목</th>${rs.map(r => `<th>${r.stage}단 ${esc(r.mesh)}<br>${esc(r.partName)}</th>`).join('')}</tr>
      <tr><td class="l" colspan="${rs.length + 1}"><b>하중 계수</b></td></tr>
      ${row('c′ 단일 강성', 'cp', 3, 'N/mm/µm')}${row('cγα 치합 강성', 'cg', 3, 'N/mm/µm')}${row('cγβ', 'cb', 3, 'N/mm/µm')}${row('공진비 N', 'Nres', 4)}
      ${row('Kv', 'Kv', 3)}${row('fsh 변형 합', 'fsh', 2, 'µm')}${row('fsh 썬 비틀림', 'fshSun', 2, 'µm')}${row('Fβx', 'fbx', 2, 'µm')}${row('Fβy (길들임 후)', 'fby', 2, 'µm')}
      ${row('KHβ', 'KHb', 3)}${row('KFβ', 'KFb', 3)}${row('KHα', 'KHa', 3)}${row('KFα', 'KFa', 3)}${row('Kγ', 'Kg', 3)}
      <tr><td class="l" colspan="${rs.length + 1}"><b>치면</b></td></tr>
      ${row('ZH', 'ZH', 3)}${row('ZE', 'ZE', 2)}${row('Zε', 'Zeps', 3)}${row('ZB / ZD', 'ZBD', 3)}${row('σH0', 'H0', 1, 'MPa')}
      <tr><td class="l">σH</td>${rs.map(r => `<td>${fmt(r.H, 1)}</td>`).join('')}</tr>${row('ZL', 'ZL', 3)}${row('ZV', 'ZV', 3)}${row('ZR', 'ZR', 3)}${row('ZNT', 'ZNT', 3)}
      <tr><td class="l">σHG (= σHP·SHmin)</td>${rs.map(r => `<td>${fmt(r.HP, 1)}</td>`).join('')}</tr><tr><td class="l"><b>SH</b></td>${rs.map(r => `<td><b>${fmt(r.SH, 3)}</b></td>`).join('')}</tr>
      <tr><td class="l" colspan="${rs.length + 1}"><b>치근</b></td></tr>
      ${row('xE (치두께 공차 포함)', 'xE', 4)}${row('YF', 'YF', 3)}${row('YS', 'YS', 3)}${row('sFn', 'sFn', 3, 'mm')}${row('ρF', 'rhoF', 3, 'mm')}${row('hFe', 'hFe', 3, 'mm')}
      ${row('σF0', 'F0', 1, 'MPa')}<tr><td class="l">σF</td>${rs.map(r => `<td>${fmt(r.F, 1)}</td>`).join('')}</tr>${row('YNT', 'YNT', 3)}${row('YδrelT', 'Ydel', 3)}${row('YRrelT', 'YR', 3)}${row('YM', 'YM', 2)}
      <tr><td class="l">σFG</td>${rs.map(r => `<td>${fmt(r.FP, 1)}</td>`).join('')}</tr><tr><td class="l"><b>SF</b></td>${rs.map(r => `<td><b>${fmt(r.SF, 3)}</b></td>`).join('')}</tr>
      </table><p class="note">유성은 썬쪽·링쪽 두 열입니다(하중점이 달라 YF가 다름). 링 YF·YS는 피니언 커터로 생성한 실제 치근 형상(60° 접선)에서 구합니다.</p></div>`;
  },
  stress() {
    if (!R?.rated) return '';
    const gid = R.govRated?.row.id;
    return `<div class="card scroll"><h3>정격 ${D.req.Trated} N·m · 목표 수명에서의 응력 (MPa)</h3><table><tr><th>부위</th><th>반복수</th><th>σH</th><th>σHP</th><th>SH</th><th>σF</th><th>σFP</th><th>SF</th><th>ZNT</th><th>YNT</th><th>ZB/ZD</th><th>YF</th><th>YS</th></tr>
      ${R.rated.rows.map(r => `<tr class="${r.id === gid ? 'gov' : ''} ${r.SH < D.req.SH || r.SF < D.req.SF ? 'bad' : ''}"><td>${partLabel(r)}</td><td>${r.N.toExponential(1)}</td><td>${fmt(r.H, 0)}</td><td>${fmt(r.HP, 0)}</td><td>${fmt(r.SH, 3)}</td><td>${fmt(r.F, 0)}</td><td>${fmt(r.FP, 0)}</td><td>${fmt(r.SF, 3)}</td><td>${fmt(r.f.ZNT, 3)}</td><td>${fmt(r.f.YNT, 3)}</td><td>${fmt(r.f.ZBD, 3)}</td><td>${fmt(r.f.YF, 3)}</td><td>${fmt(r.f.YS, 3)}</td></tr>`).join('')}</table>
      <p class="note">강조 행이 정격 한계를 정하는 부위입니다. 유성 굽힘은 양방향 하중으로 YM 0.7.</p></div>`;
  },
  spectrum() {
    if (!R?.spectrum) return '';
    return `<div class="card"><h3>부하 스펙트럼 수명 (Miner)</h3><table><tr><th>부위</th><th>수명 h</th><th>모드</th></tr>
      ${R.spectrum.list.slice(0, 6).map(p => `<tr class="${p.lifeH < D.req.lifeH ? 'bad' : ''}"><td>${p.stage}단 ${p.mesh} · ${p.partName}</td><td>${fmtH(p.lifeH)}</td><td>${p.mode}</td></tr>`).join('')}</table></div>`;
  },
  limits() {
    if (!R?.ctx || R.errors?.length) return '';
    return `<div class="card"><h3>한계 토크</h3><table>
      <tr><td>목표 수명 ${D.req.lifeH} h · ${D.req.rpm} rpm (기어)</td><td><button type="button" class="btn" data-torque-trace>${fmt(R.capacityLife)} N·m · 근거</button></td></tr>
      <tr><td>무한 수명 (10¹⁰회)</td><td>${fmt(R.capacityInf)} N·m</td></tr>
      <tr><td>정적 (피크 기준 SH ${D.req.SHstat} · SF ${D.req.SFstat})</td><td>${fmt(R.staticCap)} N·m</td></tr>
      <tr><td>유성 베어링 한계 (목표 수명)</td><td>${R.bearingCap.map(v => fmt(v, 1)).join(' / ')} N·m</td></tr>
      <tr><td>피크 ${D.req.Tpeak} N·m 지배 안전율</td><td class="${R.peakCheck.ok ? '' : 'bad'}">${fmt(R.peakCheck.S, 3)} / ${R.peakCheck.target} · ${R.peakCheck.label}</td></tr>
      <tr><td>비상 ${D.req.Temerg} N·m 지배 안전율</td><td class="${R.emergCheck.ok ? '' : 'bad'}">${fmt(R.emergCheck.S, 3)} / ${R.emergCheck.target} · ${R.emergCheck.label}</td></tr>
      <tr><td><b>감속기 한계</b></td><td><b>${fmt(R.reducerCap, 2)} N·m</b> · ${esc(R.reducerGov)}</td></tr></table></div>`;
  },
  lube() {
    if (!R?.lube) return '';
    const L = R.lube, g = D.lube.type === 'grease';
    return `<div class="card scroll"><h3>유막 · 정격 ${D.req.Trated} N·m · ${D.req.rpm} rpm</h3><table><tr><th>단</th><th>치합</th><th>피치선 속도 m/s</th><th>선하중 N/mm</th><th>최소 유막 µm</th><th>λ</th><th>윤활 영역</th><th>μ</th><th>섬광온도 K</th></tr>
      ${L.meshes.map(m => `<tr class="${m.lambda < 1 ? 'bad' : ''}"><td>${m.stage}단</td><td>${m.mesh}</td><td>${fmt(m.vt, 2)}</td><td>${fmt(m.wline, 1)}</td><td>${fmt(m.hmin, 3)}</td><td>${fmt(m.lambda, 2)}</td><td>${m.regime}</td><td>${fmt(m.mu, 3)}</td><td>${fmt(m.flash, 1)}</td></tr>`).join('')}</table>
      <p class="note">Dowson–Higginson 선접촉식${g ? `, 그리스는 기유 유막 × ${D.lube.starvation}` : ''}. λ < 1 경계 윤활, 1–3 혼합, > 3 완전 유막. 조도 Ra ≈ Rz/6.</p></div>`;
  },
  scuff() {
    if (!R?.lube) return '';
    return `<div class="card scroll"><h3>스커핑 · 피크 ${D.req.Tpeak} N·m</h3><table><tr><th>단</th><th>치합</th><th>최대 섬광온도 K</th><th>접촉 온도 θB °C</th><th>스커핑 온도 θS °C</th><th>안전율 SB</th></tr>
      ${R.lube.peak.map(m => `<tr class="${m.SB < (D.req.SBmin || 1.5) ? 'bad' : ''}"><td>${m.stage}단</td><td>${m.mesh}</td><td>${fmt(m.flash, 1)}</td><td>${fmt(m.thetaB, 1)}</td><td>${fmt(m.thetaS, 0)}</td><td>${Number.isFinite(m.SB) ? fmt(m.SB, 1) : '∞'}</td></tr>`).join('')}</table>
      <p class="note">벌크 온도 = 운전 온도(5-10 가정). 저속 관절에서는 스커핑보다 λ가 낮은 경계 윤활 마모가 실제 위험입니다.</p></div>`;
  },
  mat() {
    if (!R?.ctx) return '';
    const rows = [];
    for (let i = 0; i < D.config.stages; i++) for (let k = 0; k < 3; k++) {
      const idx = i * 3 + k, shared = i === 1 && k === 2 && D.config.sharedRing, m = R.ctx.stages[i]?.mats[k];
      rows.push(`<tr><td>${i + 1}단 ${E.NAMES[k]}</td>
       <td class="l">${shared ? '1단 링과 공유' : `<select data-p="materials.${idx}.family">${Object.entries(E.FAMILY).map(([f, v]) => `<option value="${f}" ${D.materials[idx].family === f ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`}</td>
       <td>${shared ? '' : `<input type="number" step="any" data-t="num" data-p="materials.${idx}.surfaceHRC" value="${D.materials[idx].surfaceHRC}" style="width:70px">`}</td>
       <td>${shared ? '' : `<input type="number" step="any" data-t="num" data-p="materials.${idx}.coreHRC" value="${D.materials[idx].coreHRC}" style="width:70px">`}</td>
       <td>${shared ? '' : `<input type="number" step="any" data-t="num" data-p="materials.${idx}.depth" value="${D.materials[idx].depth}" style="width:70px">`}</td>
       <td>${fmt(m?.hv, 0)}</td><td>${fmt(m?.HlimISO, 0)}</td><td>${fmt(m?.FlimISO, 0)}</td></tr>`);
    }
    return `<div class="card scroll"><h3>기어 재료 <span class="srcchip sD">설계자 결정</span></h3><table><tr><th>부품</th><th class="l">재료</th><th>표면 HRC</th><th>심부 HRC</th><th>경화 깊이 mm</th><th>표면 HV</th><th>σHlim</th><th>σFlim</th></tr>${rows.join('')}</table>
      <p class="note">σHlim·σFlim은 1 % 파손확률 기준값(MPa, ISO 6336-5). 질화강(NV)은 ISO 표가 650 HV까지라 그 이상은 650 HV 값을 씁니다.</p></div>`;
  },
  caseDepth() {
    const cd = R?.caseDepth || [];
    return `<div class="card"><h3>경화 깊이 검토 · 피크 ${D.req.Tpeak} N·m</h3><table><tr><th>부위</th><th>최대 전단 깊이 mm</th><th>경화 깊이 mm</th><th>비율</th></tr>
      ${cd.map(c => `<tr class="${c.ratio != null && c.ratio < 2 ? 'bad' : ''}"><td>${c.stage}단 ${c.mesh} · ${c.partName}</td><td>${fmt(c.zMax, 3)}</td><td>${fmt(c.depth, 2)}</td><td>${fmt(c.ratio, 2)}</td></tr>`).join('')}</table>
      <p class="note">비율 2 미만이면 케이스 크러싱(심부 파손) 검토를 권합니다 (간이 기준).</p></div>`;
  },
  brgPlanet() {
    if (!R?.bearings) return '';
    return `<div class="card scroll"><h3>유성 베어링</h3><table><tr><th>단</th><th>등가 하중 Peq N</th><th>L10 h</th><th>L50 h (추정)</th><th>최저 s0 · 지배 조건 · 하중</th><th>s0 비상</th><th>유성 상대 rpm</th><th>목표 수명 토크 한계</th></tr>
      ${R.bearings.map((b, i) => `<tr class="${b.L10h < D.req.lifeH || b.governing.s0 < D.req.s0 ? 'bad' : ''}"><td>${b.stage}단</td><td>${fmt(b.Peq, 0)}</td><td>${fmtH(b.L10h)}</td><td>${fmtH(b.L50h)}</td><td>${bearingCaseHTML(b.governing)}</td><td>${fmt(b.s0emerg, 2)}</td><td>${fmt(b.planetRpm, 0)}</td><td>${fmt(R.bearingCap[i], 1)} N·m</td></tr>`).join('')}</table>
      <p class="note">유성 1개당 반경 하중 = 두 치합 접선력 합 × Kγ × Kv. L50은 와이블 기울기 1.5 가정.</p></div>`;
  },
  obpick() {
    const o = D.outBearing || {}, cat = o.d > 0 && o.D > o.d;
    const row = cat ? `<tr><td>${esc(o.maker || '')}</td><td>${esc(o.series || '')}</td><td><b>${esc(o.model || '')}</b></td><td>${fmt(o.d, 1)}</td><td>${fmt(o.D, 1)}</td><td>${fmt(o.B, 1)}</td><td>${fmt(o.dp, 1)}${o.dpEst ? ' <span class="note">(추정)</span>' : ''}</td><td>${fmt(o.C / 1000, 2)}</td><td>${fmt(o.C0 / 1000, 2)}</td><td>${fmt(o.mass, 3)}</td><td>${rTxt(o)} <span class="note">(${esc(o.rSrc || '추정')})</span></td><td class="l">${esc(o.status || '')}</td><td class="l note">${esc(o.source || '')}</td></tr>` : '';
    return `<div class="card scroll"><h3>출력 베어링 형번</h3>
      <p><button class="btn primary" type="button" id="obPick">베어링 선택</button>${cat ? ' <button class="btn" type="button" id="obClear">카탈로그 선택 해제</button>' : ''}</p>
      ${cat ? `<table><tr><th>제조사</th><th>시리즈</th><th>형번</th><th>내경 d</th><th>외경 D</th><th>폭 B</th><th>롤러 피치원 dp</th><th>C kN</th><th>C0 kN</th><th>질량 kg</th><th>모서리 R</th><th class="l">상태</th><th class="l">출처</th></tr>${row}</table>
      <p class="note">3D는 카탈로그 내경·외경·폭으로 내륜·외륜 링을 그리고, 내륜 내경·외륜 외경 삽입부 모서리 R을 표현합니다.${o.holes ? ' 이 형번은 내·외륜 볼트 탭 취부형이며, 취부 구멍 표현은 후순위라 단순 링으로 표시합니다.' : ''} 롤러 지름·개수는 카탈로그에 없어 단면에서 추정합니다.</p>`
      : '<p class="note">제조사 → 시리즈 → 형번 순으로 고르면 치수·C·C0가 입력되고 3D가 카탈로그 치수로 바뀝니다. 선택 전에는 아래 dp·Dw 입력으로 추정 형상을 그립니다.</p>'}</div>`;
  },
  ob() {
    const ob = R?.outBearing; if (!ob) return '';
    return `<div class="card scroll"><h3>출력 베어링</h3><table><tr><th>출력 rpm</th><th>Fr / Fa / M (정격)</th><th>등가 하중 Peq N</th><th>L10 h</th><th>최저 s0 · 지배 조건 · 하중</th><th>s0 비상</th><th>기울기 정격</th><th>기울기 피크</th></tr>
      <tr class="${ob.L10h < D.req.lifeH || ob.governing.s0 < D.req.s0 ? 'bad' : ''}"><td>${fmt(ob.outRpm, 1)}</td><td>${fmt(ob.ext.Fr, 0)} N / ${fmt(ob.ext.Fa, 0)} N / ${fmt(ob.ext.M, 2)} N·m</td><td>${fmt(ob.Peq, 0)}</td><td>${fmtH(ob.L10h)}</td><td>${bearingCaseHTML(ob.governing)}</td><td>${fmt(ob.s0emerg, 2)}</td><td>${fmt(ob.tiltRated, 3)}′</td><td>${fmt(ob.tiltPeak, 3)}′</td></tr></table>
      <p class="note">P = X(Fr + 2000·M/dp) + Y·Fa. Fa/(Fr + 2000M/dp) ≤ 1.5이면 X 1, Y 0.45, 넘으면 X·Y 0.67 (크로스 롤러 카탈로그 식). 정적 P0 = Fr + 2000M/dp + 0.44Fa.</p></div>`;
  },
  roll() {
    const ob = R?.outBearing; if (!ob?.roll) return '';
    return `<div class="card scroll"><h3>롤러 하중분포 (모델)</h3><table><tr><th>조건</th><th>Fr / Fa / M</th><th>최대 롤러 하중 N</th><th>평균 N</th><th>하중 받는 롤러</th><th>최대 접촉응력 MPa</th><th>접촉 s0</th><th>기울기</th><th>모멘트 강성 (모델)</th></tr>
      ${['rated', 'peak', 'emerg', 'governing'].map(k => { const q = ob.roll[k], M = ob.ext.M * q.k; return `<tr class="${q.s0 < D.req.s0 ? 'bad' : ''}"><td>${{ rated: '정격', peak: '피크', emerg: '비상', governing: ob.governing.label }[k]}</td><td>${fmt(ob.ext.Fr * q.k, 0)} / ${fmt(ob.ext.Fa * q.k, 0)} N / ${fmt(M, 2)} N·m</td><td>${fmt(q.Qmax, 0)}</td><td>${fmt(q.Qmean, 0)}</td><td>${q.loaded} / ${q.Z}</td><td>${fmt(q.p0, 0)}</td><td>${fmt(q.s0, 2)}</td><td>${fmt(q.tiltArcmin, 3)}′</td><td>${q.tiltArcmin > 1e-6 ? fmt(M / q.tiltArcmin, 0) + ' N·m/′' : '—'}</td></tr>`; }).join('')}</table>
      <p class="note">교차 배열 롤러(접촉각 45°)를 반경·축·기울기 3자유도로 풀고, 롤러 강성은 Palmgren 선접촉식입니다. 하우징·캐리어 판 변형은 포함하지 않습니다.</p></div>`;
  },
  carGeo() {
    if (!R?.carrierPin) return '';
    return `<div class="card scroll"><h3>캐리어 조립·가공 치수 (mm)</h3><table><tr><th>단</th><th>핀 배치 PCD</th><th>캐리어 내 / 외경</th><th>중앙 홈 / 안착부</th><th>보스 외경 × 높이</th><th>홀 원통 길이</th><th>드릴 끝</th><th>핀 전체 길이</th><th>판 내 체결 길이</th><th>지지 스팬 / 외팔 길이</th></tr>
      ${R.carrierPin.map(({ stage, geometry: g }) => `<tr><td>${stage}단</td><td>Ø${fmt(g.drivePCD, 3)}</td><td>Ø${fmt(g.innerD)} / Ø${fmt(g.outerD)}</td><td>${g.double ? fmt(g.groove) + ' / ' + fmt(g.pocket) : '—'}</td><td>${g.boss ? 'Ø' + fmt(g.bossD) + ' × ' + fmt(g.bossT) : '—'}</td><td>${fmt(g.hole.depth, 3)}</td><td>${g.hole.mode === 'blind' ? '118° · ' + fmt(Math.abs(g.hole.tip - g.hole.end), 3) : '관통'}</td><td>${fmt(g.pinLength, 3)}</td><td>${g.engagement.map(v => fmt(v, 3)).join(' / ')}</td><td>${fmt(g.span, 3)}</td></tr>`).join('')}
      </table><p class="note">1단 보스는 입력측, 2단 보스는 출력측입니다. 막힌 홀의 118° 끝은 핀 삽입 길이에서 제외합니다.</p></div>`;
  },
  carStiff() {
    if (!R?.carrierPin) return '';
    return `<div class="card scroll"><h3>캐리어 강성 (양단 지지)</h3><table><tr><th>단</th><th>기둥 단면</th><th>기둥 강성 N/mm</th><th>와인드업 정격 µrad</th><th>핀 기울기 정격 µrad</th><th>fsh 기여 µm</th><th>기둥 굽힘 피크 MPa</th><th>안전율</th><th>비틀림 강성 N·m/rad</th></tr>
      ${R.carrierPin.map(c => { const r = c.car.rated, pk = c.car.peak; return r.double ? `<tr class="${c.Sweb < 1 ? 'bad' : ''}"><td>${c.stage}단</td><td>${r.fromShape ? `평행 홈 · I ${fmt(r.I, 0)} mm⁴` : `사각 ${r.w}×${r.h}`}</td><td>${fmt(r.kweb, 0)}</td><td>${fmt(r.windup * 1e6, 1)}</td><td>${fmt(r.slope * 1e6, 1)}</td><td>${fmt(R.rated.rows.find(x => x.stage === c.stage)?.f.fshCar, 2)}</td><td>${fmt(pk.sigma, 0)}</td><td>${fmt(c.Sweb, 2)}</td><td>${fmt(r.ktor, 0)}</td></tr>` : `<tr><td>${c.stage}단</td><td colspan="8" class="l note">편단 지지: 기둥 없음 · 핀 외팔보 처짐만 반영</td></tr>`; }).join('')}</table>
      <p class="note">기둥 단면은 캐리어 형상(포켓 마감)에서 계산하고, 양단 고정 보(굽힘 + 전단)로 두 판 사이 와인드업을 구합니다. 판 자체 굽힘은 모델에 없어 FEA(11-2)로 확인해야 합니다.</p></div>`;
  },
  pinLoad() {
    if (!R?.carrierPin) return '';
    const sc = v => `<td class="${v < 1 ? 'bad' : ''}">${Number.isFinite(v) ? fmt(v, 2) : '—'}</td>`;
    return `<div class="card scroll"><h3>핀 하중·응력 (운전 구간 전체)</h3><table><tr><th>단</th><th>운전 조건</th><th>출력 토크 N·m</th><th>핀 하중 N</th><th>굽힘 σ MPa</th><th>구멍 면압 MPa</th><th>S 핀 굽힘</th><th>S 구멍 면압</th><th>S 기둥</th></tr>
      ${R.carrierPin.map(c => c.cases.map(k => { const gov = c.gov.case === k.label && c.gov.S < 1; return `<tr class="${gov ? 'bad' : ''}"${k.duty != null ? ` data-vgo="duty:${k.duty}" style="cursor:pointer" title="듀티 ${k.duty + 1}행으로 이동"` : ''}><td>${c.stage}단</td><td>${esc(k.label)}</td><td>${fmt(k.T, 2)}</td><td>${fmt(Math.abs(k.F), 0)}</td><td>${fmt(k.sigma, 2)}</td><td>${fmt(k.p, 1)}</td>${sc(k.S.bend)}${sc(k.S.press)}${sc(k.S.web)}</tr>`; }).join('')).join('')}
      </table><p class="note">허용: 핀 굽힘 ${R.carrierPin.map(c => fmt(c.allow, 2)).join(' / ')} MPa · 구멍 면압 ${fmt(D.carrier.allowP, 0)} MPa · 기둥 ${fmt(D.carrier.allowB, 0)} MPa. 회전 구간은 동하중(Kv) 포함, 정지 유지·지정 피크·비상은 0 rpm 정적. 최저: ${R.carrierPin.map(c => `${c.stage}단 ${c.gov.name} ${fmt(c.gov.S, 2)} (${c.gov.case} ${fmt(c.gov.T, 1)} N·m)`).join(' · ')}. 정격 처짐 ${R.carrierPin.map(c => fmt(c.rated.defl, 2) + ' µm').join(' / ')}. 핀 지지판은 강체로 가정합니다.</p></div>`;
  },
  eff() {
    if (!R?.eff) return '';
    return `<div class="card"><h3>효율 (정격) ${fmt(R.eff.total * 100, 1)} %</h3>
      <table><tr><th>단</th><th>썬–유성</th><th>유성–링</th><th>기어만</th><th>단 효율</th></tr>${R.eff.stages.map(s => `<tr><td>${s.stage}단</td><td>${fmt(s.etaMesh[0] * 100, 2)}</td><td>${fmt(s.etaMesh[1] * 100, 2)}</td><td>${fmt(s.gear * 100, 2)}</td><td>${fmt(s.eta * 100, 2)}</td></tr>`).join('')}</table>
      <p class="note">치합 손실: Ohlendorf 손실계수 HV × μ. 고정 링·썬 입력 유성 효율식. '기어만'이 KISSsoft 치합 효율 ηz에 대응하고, '단 효율'은 기타 손실 ${fmt(D.perf.otherLoss, 1)} %/단(베어링·씰·교반)을 더 뺀 값입니다. HV는 KISSsoft와 같고 μ 모델(ISO/TR 14179-2)은 KISSsoft의 Niemann μ보다 낮게 나옵니다.</p></div>`;
  },
  bl() {
    if (!R?.backlash) return '';
    return `<div class="card"><h3>백래시 · 강성</h3><table>
      <tr><td>출력 백래시 (치합만)</td><td><b>${fmt(R.backlash.arcmin, 2)} arcmin</b></td></tr>
      ${R.backlash.meshMargins.map(m => `<tr class="${m.min < 0 ? 'bad' : ''}"><td>${m.stage}단 ${m.mesh} · 최소 여유</td><td>${fmt(m.min, 2)} µm · ${m.min < 0 ? '간섭 가능' : '충족'}</td></tr>`).join('')}
      <tr><td>출력축 최대 백래시</td><td>${fmt(R.backlash.range[1], 2)} / 허용 ${fmt(D.req.backlashMax, 2)} arcmin</td></tr>
      ${R.backlash.stages.map(s => `<tr><td>${s.stage}단 기여 (출력축 환산)</td><td>${fmt(s.arcminOut, 2)} arcmin</td></tr>`).join('')}
      <tr><td>비틀림 강성 (치합 + 핀 + 캐리어)</td><td>${fmt(R.stiffness.NmPerArcmin, 2)} N·m/arcmin</td></tr>
      ${R.stiffness.stages.map(s => `<tr><td>${s.stage}단 캐리어 기준 · 치합+핀 / 캐리어</td><td>${fmt(s.Kmesh * Math.PI / 10800, 1)} / ${Number.isFinite(s.Kcar) ? fmt(s.Kcar * Math.PI / 10800, 1) : '강체'} N·m/′</td></tr>`).join('')}</table>
      <p class="note">하우징·출력 베어링 비틀림, 저토크 비선형 영역은 뺀 값입니다.</p></div>`;
  },
  mc() {
    return `<div class="card"><h3>몬테카를로 실행</h3><p><button class="btn primary" id="runMC">가상 검증 실행</button></p><div class="prog"><i id="prog"></i></div><div id="mcOut">${mcHTML()}</div></div>`;
  },
  sens() { return `<div class="card"><h3>민감도 · ISO 설계 정격 기준</h3><p><button class="btn" id="runSens">민감도 계산</button></p><div id="sensOut">${sensHTML()}</div></div>`; },
  register() {
    if (!R?.register) return '';
    return `<div class="card scroll"><table><tr><th class="l">구분</th><th class="l">항목</th><th class="l">값</th><th class="l">근거</th><th class="l">설명</th></tr>
      ${R.register.map(r => `<tr><td class="l">${r.group}</td><td class="l">${esc(r.item)}</td><td class="l">${esc(String(r.value))}</td><td class="l">${tag(r.src)}</td><td class="l note">${esc(r.basis)}</td></tr>`).join('')}</table></div>`;
  },
  housingDims() {
    let L = null; try { L = PGD3D.layout(R, D); } catch (e) { }
    if (!L) return '';
    const bl = bomList(), w = id => bl.find(p => p.id === id);
    return `<div class="card scroll"><h3>계산된 치수</h3><table><tr><th class="l">항목</th><th>값</th><th class="l">근거</th></tr>
      <tr><td class="l">링 외경 (하우징 안지름)</td><td>Ø${fmt(L.ringOD, 2)}</td><td class="l note">3-9 링 외경 (빈칸이면 자동 림)</td></tr>
      <tr><td class="l">하우징 몸체 외경</td><td>Ø${fmt(L.housR * 2, 1)}</td><td class="l note">링 외경 + 2 × 벽</td></tr>
      <tr><td class="l">출력부 플랜지 외경</td><td>Ø${fmt(L.flangeR * 2, 1)}</td><td class="l note">크로스 롤러 외륜 + 벽 + 1.5</td></tr>
      <tr><td class="l">크로스 롤러 내·외륜</td><td>Ø${fmt(L.raceIn * 2, 1)} / Ø${fmt(L.raceOut * 2, 1)}</td><td class="l note">${L.cat ? `카탈로그 ${esc(D.outBearing.model || '')} (d × D × B)` : `dp ${L.dp} ± 1.1·Dw`}</td></tr>
      <tr><td class="l">중공 지름</td><td>Ø${fmt(L.hollowR * 2, 1)}</td><td class="l note">1단 썬 보어 − 3.6</td></tr>
      <tr><td class="l">전체 길이</td><td>${fmt(L.zFlange[1] - L.zIn, 1)} mm</td><td class="l note">캐리어·핀·보스 축방향 범위 반영</td></tr>
      <tr><td class="l">하우징 · 커버 · 플랜지 중량</td><td>${fmt(w('housing')?.mass * 1000, 0)} · ${fmt(w('cover')?.mass * 1000, 0)} · ${fmt(w('oflange')?.mass * 1000, 0)} g</td><td class="l note">AL6061 2.7, 강 7.85 g/cm³</td></tr></table></div>`;
  },
  drawing() { return drawingHTML(DWSTATE.id); },
  partDims() {
    const bl = bomList();
    return `<h3 class="cardsh">부품별 형상 치수</h3><p class="note" style="margin:0 0 12px">빈칸 = 자동값, 값을 넣으면 그 값을 씁니다. '형상' 태그는 3D·중량에만, 나머지는 강도 계산에도 들어갑니다.</p>
      <div class="dimgrid">${bl.map(p => `<div class="card"><h3>${p.no}. ${esc(p.name)} <span class="note">× ${p.qty}</span></h3>${dimsHTML(p.id) || '<p class="note">치수 입력 없음</p>'}</div>`).join('')}</div>
      <div class="card"><button class="btn" id="geoReset">형상 치수 모두 자동으로</button> <span class="note">'형상' 항목만 초기화합니다.</span></div>`;
  },
  part(pid) { const p = bomList().find(x => x.id === pid); const h = dimsHTML(pid); return h ? `<div class="card"><h3>${esc(p?.name || pid)} 형상 치수</h3>${h}</div>` : ''; },
  bom() { return `<div class="card">${bomHTML()}</div>`; },
  // 전위 지도: 단별 썬(가로)·유성(세로) 전위 평면. 색 = 미끄럼률 균형(초록 좋음), 회색 = 불가(이유는 마우스), ● 현재
  shiftmap() {
    const ns = D.config.stages, maps = [];
    for (let i = 0; i < ns; i++) maps.push(E.shiftMap(D, i));
    const card = (m, i) => {
      const N = m.vals.length, cs = 9, pad = 30, W_ = pad + N * cs + 6, idx = v => Math.round((v - m.lo) / m.step);
      const okb = m.pts.filter(p => p.ok).map(p => p.bal), bmin = Math.min(...okb), bmax = Math.max(...okb);
      const col = p => { if (!p.ok) return '#2b2a2f'; const t = okb.length > 1 ? (p.bal - bmin) / (bmax - bmin || 1) : 0; return `hsl(${Math.round(130 - 95 * Math.sqrt(t))},55%,${Math.round(44 - 8 * t)}%)`; };
      const cells = m.pts.map(p => `<rect x="${pad + idx(p.xs) * cs}" y="${6 + (N - 1 - idx(p.xp)) * cs}" width="${cs - 1}" height="${cs - 1}" fill="${col(p)}" data-sx="${p.xs}" data-sp="${p.xp}" data-st="${i}" class="smc"><title>xs ${p.xs} · xp ${p.xp} · xr ${fmt(p.xr, 3)}
${p.ok ? `εα ${fmt(p.ea[0], 2)} / ${fmt(p.ea[1], 2)} · 미끄럼률 S–P ${fmt(p.sl[0].z1A, 2)} / ${fmt(p.sl[0].z2E, 2)} · P–R ${fmt(p.sl[1].z1A, 2)} / ${fmt(p.sl[1].z2E, 2)} · 이끝 두께 ≥ ${fmt(p.san, 2)}m` : '불가: ' + p.why}</title></rect>`).join('');
      const ticks = m.vals.filter((v, k) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9).map(v => `<text x="${pad + idx(v) * cs + cs / 2}" y="${6 + N * cs + 12}" text-anchor="middle">${v}</text><text x="${pad - 4}" y="${6 + (N - 1 - idx(v)) * cs + cs / 2 + 3}" text-anchor="end">${v}</text>`).join('');
      const cu = m.cur, inR = cu.xs >= m.lo && cu.xs <= m.hi && cu.xp >= m.lo && cu.xp <= m.hi;
      const mark = inR ? `<circle cx="${pad + (cu.xs - m.lo) / m.step * cs + cs / 2}" cy="${6 + (N - 1 - (cu.xp - m.lo) / m.step) * cs + cs / 2}" r="5" fill="none" stroke="#fff" stroke-width="2"/>` : '';
      return `<div class="card smap"><h3>${i + 1}단 전위 지도 <span class="note">${m.mode === 'curve' ? '링 공유(잇수 지정): 링 전위 고정 → 가능한 점은 곡선 위' : '링 전위는 중심거리가 같도록 자동'}</span></h3>
        <svg viewBox="0 0 ${W_} ${N * cs + 26}" width="${W_}" style="max-width:100%;font-size:9px;fill:var(--mute)">${cells}${ticks}${mark}<text x="${pad + N * cs / 2}" y="${N * cs + 26}" text-anchor="middle">썬 전위 xs →</text></svg>
        <p class="note">세로 = 유성 전위 xp. 칸을 누르면 그 전위로 바꿉니다. 현재 xs ${fmt(cu.xs, 3)} · xp ${fmt(cu.xp, 3)} · xr ${fmt(cu.xr, 3)}. 표준 기준 랙(이뿌리 1.25m, 끝 R 0.38m) 기준.</p>
        <div class="sm-go"><button class="btn" type="button" data-sg="slide" data-st="${i}">미끄럼률 균형</button><button class="btn" type="button" data-sg="cap" data-st="${i}">허용 토크 최대</button><button class="btn" type="button" data-sg="bend" data-st="${i}">굽힘 균형 (썬=유성)</button></div>
        <div class="sm-out" id="smOut${i}"></div></div>`;
    };
    return `<div class="smaps">${maps.map(card).join('')}</div>`;
  },
};
// 출력 베어링 카탈로그 선택 (제조사 → 시리즈 → 형번)
const BRG = () => globalThis.PGDBearings?.crossRoller || [];
const uniq = a => [...new Set(a)];
const rTxt = b => { const i = b.rIn ?? b.r, o = b.rOut ?? b.r; return i === o ? fmt(i, 2) : `${fmt(i, 2)} / ${fmt(o, 2)}`; };
function obInfoHTML(b) {
  if (!b) return '';
  const dp = b.dp ?? (b.d + b.D) / 2;
  return `<div class="scroll"><table><tr><th>제조사</th><th>시리즈</th><th>형번</th><th>내경 d mm</th><th>외경 D mm</th><th>폭 B mm</th><th>롤러 피치원 dp mm</th><th>동정격 C kN</th><th>정정격 C0 kN</th><th>질량 kg</th><th class="l">상태</th><th class="l">출처</th></tr>
    <tr><td>${esc(b.maker)}</td><td>${esc(b.series)}</td><td><b>${esc(b.model)}</b></td><td>${fmt(b.d, 1)}</td><td>${fmt(b.D, 1)}</td><td>${fmt(b.B, 1)}</td><td>${fmt(dp, 1)}${b.dp == null ? ' (추정)' : ''}</td><td>${fmt(b.C / 1000, 2)}</td><td>${fmt(b.C0 / 1000, 2)}</td><td>${fmt(b.mass, 3)}</td><td class="l">${esc(b.status)}</td><td class="l note">${esc(b.source)}</td></tr></table></div>
    <p class="note">모서리 r min 내/외 ${rTxt(b)} mm (${esc(b.rSrc)})${b.da ? ` · 장착 치수 da ${b.da} / Da ${b.Da}` : ''}${b.mount ? ` · 취부 ${esc(b.mount)}` : ''}${b.dp == null ? ' · dp 미공개 → (d + D) / 2' : ''}${b.holes ? ' · 볼트 탭 취부형 (3D 취부 구멍은 후순위)' : ''} · 현재 링기어 PCD 대비 dp ${(() => { try { const L = R?.ctx?.stages; const g = L?.[L.length - 1]?.geo.parts[2]; return g ? (dp / g.d * 100 - 100).toFixed(1) + ' %' : '—'; } catch (e) { return '—'; } })()}</p>`;
}
function openObDlg() {
  const dl = $('#obDlg'), mk = $('#obMk'), sr = $('#obSr'), md = $('#obMd'), cur = D.outBearing || {};
  const opts = (sel, list, v) => { sel.innerHTML = list.map(x => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(x)}</option>`).join(''); };
  const pick = () => BRG().find(b => b.maker === mk.value && b.series === sr.value && b.model === md.value);
  const fillMd = v => { const L = BRG().filter(b => b.maker === mk.value && b.series === sr.value); md.innerHTML = L.map(b => `<option value="${esc(b.model)}"${b.model === v ? ' selected' : ''}>${esc(b.model)} — Ø${b.d} × Ø${b.D} × ${b.B}</option>`).join(''); $('#obInfo').innerHTML = obInfoHTML(pick()); };
  const fillSr = (v, m) => { opts(sr, uniq(BRG().filter(b => b.maker === mk.value).map(b => b.series)), v); fillMd(m); };
  opts(mk, uniq(BRG().map(b => b.maker)), cur.maker); fillSr(cur.series, cur.model);
  mk.onchange = () => fillSr(); sr.onchange = () => fillMd(); md.onchange = () => { $('#obInfo').innerHTML = obInfoHTML(pick()); };
  $('#obApply').onclick = () => { const b = pick(); if (!b) return; applyBearing(b); dl.close(); };
  dl.showModal();
}
function applyBearing(b) {
  const o = D.outBearing || (D.outBearing = {}), dp = b.dp ?? (b.d + b.D) / 2, sec = (b.D - b.d) / 2;
  // 롤러 지름·개수는 카탈로그에 없음: 단면 높이·폭에서 추정 (Z > 0으로 분포 계산을 켠 경우에만 계산에 쓰임)
  const Dw = Math.max(.5, Math.round(Math.min(sec * .3, b.B * .7) * 2) / 2);
  Object.assign(o, { name: `${b.maker} ${b.model}`, type: 'roller', maker: b.maker, series: b.series, model: b.model, d: b.d, D: b.D, B: b.B, dp, dpEst: b.dp == null,
    C: b.C, C0: b.C0, mass: b.mass, r: b.r, rIn: b.rIn ?? b.r, rOut: b.rOut ?? b.r, rSrc: b.rSrc, da: b.da, Da: b.Da, mount: b.mount, status: b.status, source: b.source, holes: !!b.holes, Dw, Lw: +(Dw * .9).toFixed(2), DwEst: true });
  if (o.Z > 0) o.Z = Math.max(8, Math.round(Math.PI * dp / (Dw * 1.3)));
  if (D.geom?.xroller) delete D.geom.xroller.width;     // 궤도륜 폭은 카탈로그 B
  changed();
}
function clearBearing() {
  const o = D.outBearing; if (!o) return;
  ['maker', 'series', 'model', 'd', 'D', 'B', 'dpEst', 'mass', 'r', 'rIn', 'rOut', 'da', 'Da', 'mount', 'rSrc', 'status', 'source', 'holes', 'DwEst'].forEach(k => delete o[k]);
  changed();
}

// Duty table units: torque as % of rated or N·m, time as % or seconds. Values are stored as entered (l.Tnm for N·m, l.time
// as a relative weight in either unit), so switching units or saving repeatedly never rescales them.
const dutyUnits = () => (D.req.dutyUnits ||= { torque: 'pct', time: 'pct' });
const setDutyUnit = (kind, v) => E.setDutyUnit(D, kind, v);
const WB = {
  pinLoad(m) { bindVerdictLinks(m); },
  obpick(m) { const p = m.querySelector('#obPick'); if (p) p.onclick = openObDlg; const c = m.querySelector('#obClear'); if (c) c.onclick = clearBearing; },
  shiftmap(m) {
    const setShift = (i, xs, xp, xr) => { const st = D.stages[i], fixed = i === 1 && D.config.sharedRing && D.config.stages > 1; if (fixed) st.autoPlanetShift = false;
      st.xs = +(+xs).toFixed(4); st.xp = +(+xp).toFixed(4); if (!fixed) { if (xr != null) { st.autoRingShift = false; st.xr = +(+xr).toFixed(4); } else st.autoRingShift = true; } changed(); };
    m.querySelectorAll('.smc').forEach(c => c.onclick = () => setShift(+c.dataset.st, c.dataset.sx, c.dataset.sp, null));
    m.querySelectorAll('[data-sg]').forEach(b => b.onclick = async () => {
      const i = +b.dataset.st, obj = b.dataset.sg, out = m.querySelector('#smOut' + i);
      m.querySelectorAll('[data-sg]').forEach(x => x.disabled = true);
      let list;
      if (obj === 'slide') list = E.shiftCandidates(D, i, 'slide').list;
      else {
        const cand = E.shiftCandidates(D, i, obj).list, res = [];
        for (let k = 0; k < cand.length; k++) { res.push(E.shiftScore(D, i, cand[k])); if (k % 4 === 3) { out.innerHTML = `<p class="note">정밀 계산 중… ${k + 1} / ${cand.length}</p>`; await new Promise(r => setTimeout(r, 0)); } }
        list = res.filter(p => p.cap > 0).sort(obj === 'cap' ? (a, b) => b.cap - a.cap : (a, b) => a.bendBal - b.bendBal || b.cap - a.cap).slice(0, 5);
      }
      m.querySelectorAll('[data-sg]').forEach(x => x.disabled = false);
      const name = { slide: '미끄럼률 균형', cap: '허용 토크 최대', bend: '굽힘 균형' }[obj];
      out.innerHTML = list.length ? `<div class="scroll"><table><tr><th>${name}</th><th>xs</th><th>xp</th><th>xr</th><th>εα S–P / P–R</th><th>미끄럼률 S–P</th>${obj === 'slide' ? '' : '<th>허용 토크 N·m</th><th>SF 썬 / 유성</th>'}<th></th></tr>
        ${list.map((p, k) => `<tr class="${k ? '' : 'gov'}"><td>${k + 1}</td><td>${fmt(p.xs, 2)}</td><td>${fmt(p.xp, 2)}</td><td>${fmt(p.xr, 3)}</td><td>${fmt(p.ea[0], 2)} / ${fmt(p.ea[1], 2)}</td><td>${fmt(p.sl[0].z1A, 2)} / ${fmt(p.sl[0].z2E, 2)}</td>${obj === 'slide' ? '' : `<td>${fmt(p.cap, 1)}</td><td>${fmt(p.sfS, 2)} / ${fmt(p.sfP, 2)}</td>`}<td><button class="btn" type="button" data-ap="${k}">적용</button></td></tr>`).join('')}</table></div>
        <p class="note">${obj === 'slide' ? '썬–유성 이뿌리 미끄럼률을 같게 (유성–링은 절반 가중). 강도 계산 없이 형상만으로 고릅니다.' : `가능 영역 ${E.shiftCandidates(D, i, obj).list.length}점(0.1 간격)을 엔진으로 계산. 허용 토크 = 이 단 기어 기준 출력축 환산.`}</p>` : '<p class="bad">가능한 전위가 없습니다.</p>';
      out.querySelectorAll('[data-ap]').forEach(x => x.onclick = () => { const p = list[+x.dataset.ap]; setShift(i, p.xs, p.xp, p.xr); });
    });
  },
  case(m) { const b = m.querySelector('#cApply'); if (b) b.onclick = () => { E.applyCase(D, m.querySelector('#cPos').value + '-' + m.querySelector('#cAxis').value, R?.ratio); D.anim.rpm = D.req.rpm; changed(); }; },
  duty(m) {
    const a = m.querySelector('#addDuty'); if (a) a.onclick = () => { const l = { torque: 50, time: 10, rpm: 0, mode: 'rated' }; if (dutyUnits().torque === 'Nm') l.Tnm = +(D.req.Trated * .5).toPrecision(12); D.req.duty.push(l); changed(); };
    m.querySelectorAll('[data-dunit]').forEach(sl => sl.onchange = () => { setDutyUnit(sl.dataset.dunit, sl.value); changed(); });
    m.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { D.req.duty.splice(+b.dataset.del, 1); changed(); });
  },
  finder(m) {
    const go_ = m.querySelector('#fGo'); if (!go_) return;
    go_.onclick = () => {
      const target = +m.querySelector('#fRatio').value, n = +m.querySelector('#fN').value, [s0, s1] = m.querySelector('#fS').value.split('-').map(Number), rmax = +m.querySelector('#fR').value;
      const res = [];
      for (let s = s0; s <= s1; s++) for (let p = 9; p <= 120; p++) {
        const r = s + 2 * p; if (r > rmax || (s + r) % n) continue;
        const ratio = 1 + r / s, a = (s + p) / 2, gap = 2 * a * Math.sin(Math.PI / n) - (p + 2);
        if (gap <= 0.5) continue;
        res.push({ s, p, r, ratio, err: Math.abs(ratio - target) / target });
      }
      res.sort((a, b) => a.err - b.err);
      m.querySelector('#fOut').innerHTML = `<div class="scroll"><table><tr><th>S</th><th>P</th><th>R</th><th>감속비</th><th>오차</th><th></th></tr>${res.slice(0, 12).map(x => `<tr><td>${x.s}</td><td>${x.p}</td><td>${x.r}</td><td>${fmt(x.ratio, 4)}</td><td>${fmt(x.err * 100, 2)} %</td><td><button class="btn" data-ap="${x.s},${x.p},${n}">1단에 적용</button></td></tr>`).join('')}</table></div>`;
      m.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => { const [s, p, nn] = b.dataset.ap.split(',').map(Number); Object.assign(D.stages[0], { s, p, n: nn }); if (D.config.sharedRing) { D.stages[1].s = s; D.stages[1].n = nn; } changed(); });
    };
  },
  gear3d(m) {
    mountViewer(m.querySelector('#viewer'), 'gears');
    const out = m.querySelector('#aOut'), rd = () => {
      if (!out || !R?.ctx || R.errors?.length) return; let n = +D.anim.rpm || 0; const lines = [];
      R.ctx.stages.forEach((s, i) => { const nc = n / s.geo.ratio, np = (n - nc) * s.geo.parts[0].z / s.geo.parts[1].z; lines.push(`${i + 1}단 썬 ${fmt(n, 1)} → 캐리어 ${fmt(nc, 2)} rpm · 유성 자전 ${fmt(np, 1)} rpm`); n = nc; });
      out.innerHTML = lines.join('<br>') + `<br><b>출력 ${fmt(n, 2)} rpm</b> · 화면 ${fmt(D.anim.rpm * D.anim.slow, 2)} rpm`;
    };
    rd();
    const r = m.querySelector('#aRpm'), s = m.querySelector('#aSlow');
    if (r) r.onchange = e => { e.stopPropagation(); D.anim.rpm = Math.max(0, +r.value || 0); save(); rd(); };
    if (s) s.onchange = e => { e.stopPropagation(); D.anim.slow = +s.value; save(); rd(); };
    const p = m.querySelector('#vPlay'), g = m.querySelector('#vRing'); let ringOn = true;
    if (p) p.onclick = () => { const on = VIEW3D?.togglePlay(); p.textContent = on ? '일시정지' : '재생'; };
    if (g) g.onclick = () => { ringOn = !ringOn; ['ring', 'ring1', 'ring2'].forEach(id => VIEW3D?.setVisible(id, ringOn)); g.textContent = ringOn ? '링 숨기기' : '링 보이기'; };
  },
  mc(m) { const b = m.querySelector('#runMC'); if (b) b.onclick = () => runJob('mc', r => { MC = r; XC = null; renderVerdict(); renderRail(); render(true); }); },
  sens(m) { const b = m.querySelector('#runSens'); if (b) b.onclick = () => runJob('sens', r => { SENS = r; const o = m.querySelector('#sensOut'); if (o) o.innerHTML = sensHTML(); }); },
  drawing(m) { bindDrawing(m); },
  partDims(m) { const b = m.querySelector('#geoReset'); if (b) b.onclick = () => { D.geom = {}; changed(); }; },
};
const wName = w => Array.isArray(w) ? w[0] : w;
function widgetHTML(w) { const n = wName(w), fn = W[n]; if (!fn) return ''; try { return Array.isArray(w) ? fn(...w.slice(1)) : fn(); } catch (e) { console.error(e); return ''; } }

// ------------------------------------------------------------------ after-render hooks
let MAPV = null, MAPSTATE = null, MAPKEEP = false;
// the selected item in the map's drawer: what/how/why, its data by source, the verdict, and a way to its own page
function mapDetail(id) {
  if (VIEW3D) { VIEW3D.dispose(); VIEW3D = null; }
  if (!R || R.errors?.length || !IT()[id]) return '';
  const c = ictx();
  return `<div class="mdx">${wwwHTML(IT()[id])}${judgeHTML(id, c)}<div class="isecs">${itemSections(id, c)}</div><button class="btn primary" data-goit="${id}">${id} 전용 페이지로 →</button></div>`;
}
function bindMapDetail(el) {
  if (!el) return;
  bindInputs(el);
  const id = el.querySelector('[data-goit]')?.dataset.goit;
  if (id) bindItemCommon(el, id);
}
const AFTER = {
  db(m) {
    const q = m.querySelector('#dbQ'); if (q) q.oninput = () => { DBQ = q.value; const pos = q.selectionStart; render(true); const n = $('#dbQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    m.querySelector('#dbSave2').onclick = () => { const l = dbMine(); l.unshift(caseRecord()); dbPut(l.slice(0, 200)); dbRender(); render(true); };
    m.querySelector('#dbExp2').onclick = () => $('#dbExport').click();
    m.querySelector('#dbImp2').onclick = () => dlg('케이스 JSON 가져오기', '', 'DB 내보내기로 받은 케이스 JSON(배열 또는 한 건)을 붙여 넣으세요. 내 케이스에 추가됩니다.', '가져오기', () => {
      try { let a = JSON.parse($('#dlgText').value); if (!Array.isArray(a)) a = [a]; a = a.filter(x => x && x.schema === 'pgd-case/1' && x.D); if (!a.length) throw new Error('pgd-case/1 케이스가 없습니다');
        dbPut([...a, ...dbMine()].slice(0, 200)); dbRender(); $('#dlg').close(); render(true); return null; } catch (e) { return '가져오기 실패: ' + e.message; } });
    m.querySelectorAll('[data-dbo]').forEach(b => b.onclick = () => dbOpen(b.dataset.dbo, true));
    m.querySelectorAll('[data-dbx]').forEach(b => b.onclick = () => { if (!confirm('이 케이스를 삭제할까요?')) return; const l = dbMine(); l.splice(+b.dataset.dbx, 1); dbPut(l); dbRender(); render(true); });
  },
  map(m) {
    if (!window.PGDMap) return;
    const E = procEval(); if (!E.length) return;
    MAPV = PGDMap.mount(m.querySelector('#mapHost'), { E, restore: MAPKEEP ? MAPSTATE : null, focus: ANCHOR || MAPSTATE?.sel || MAPSTATE?.focus, onOpen: (st, a) => go(a && IT()[a] ? 'it-' + a : st), detail: mapDetail, bindDetail: bindMapDetail });
  },
  proc(m) { m.querySelectorAll('[data-goit]').forEach(li => { const g = () => go('it-' + li.dataset.goit); li.onclick = g; li.onkeydown = e => { if (e.key === 'Enter') g(); }; }); },
  overview(m) { mountOverview(m); },
  studio(m) { bindStudio(m); },
};
function runJob(type, done) {
  const bar = $('#prog');
  if (bar) bar.style.width = '2%';
  analysisJobs.run(type, D, result => {
    if (bar) bar.style.width = '100%';
    done(result);
  }, fraction => { if (bar) bar.style.width = (fraction * 100) + '%'; });
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
    <div class="card"><h3>옵션 부품</h3><p class="note" style="margin-top:0"><b>3D 종합판정 모델은 지금 부품 편집에서 고칠 수 있는 가공 부품(S·P·R·C, 유성 핀)만 표시합니다. 아래 옵션 부품은 하나씩 다시 추가할 예정입니다.</b> 표시를 끄면 BOM·도면에서 빠집니다. 잠금은 치수 입력을 고정합니다. 강도 계산(유성 베어링·출력 베어링·핀 판정)은 표시 여부와 관계없이 그대로 수행합니다.</p>
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
    else if (v.k.startsWith('유성 베어링')) { const value = b => v.k.includes('정적') ? b.governing.s0 : b.L10h; const b = R.bearings.reduce((m, x) => value(x) < value(m) ? x : m); id = `needle${b.stage}`; kind = 'bearing'; }
    else if (v.k.startsWith('출력 베어링')) { id = 'xroller'; kind = 'obearing'; }
    else if ((v.id || v.k).startsWith('유성 핀')) { const c = R.carrierPin.reduce((m, x) => x.gov.S < m.gov.S ? x : m); id = c.gov.mode === 'web' ? `carrier${c.stage}` : `pin${c.stage}`; kind = 'carrier'; }
    else if (v.k.startsWith('스커핑')) { const l = R.lube.peak.reduce((m, x) => x.SB < m.SB ? x : m); id = `sun${l.stage}`; kind = 'lube'; }
    else if (v.k.endsWith('최소 백래시')) { id = 'planet' + parseInt(v.k, 10); kind = 'perf'; }
    else if (v.k.startsWith('효율') || v.k.startsWith('출력 백래시')) { id = 'planet1'; kind = 'perf'; }
    push(id, v, 'bad', kind);
  }
  if (R.lube && R.lube.lambdaMin < 1) { const l = R.lube.meshes.reduce((m, x) => x.lambda < m.lambda ? x : m); push(`sun${l.stage}`, { k: '유막비 λ (경계 윤활)', value: l.lambda, target: 1, unit: '', note: '마모·마이크로피팅 주의' }, 'warn', 'lube'); }
  const names = partNames();
  list.forEach(g => g.title = `${names[g.partId] || g.partId} · ${g.items[0].k}${g.items.length > 1 ? ` 외 ${g.items.length - 1}` : ''}`);
  return list;
}


function overviewStagePanel() {
  const stages = nst();
  const geometries = stages.map((st,i) => R?.ctx?.stages[i]?.geo || E.geometry(st));
  const cards = stages.map((st, i) => {
    const g = geometries[i], shared = i > 0 && D.config.sharedRing;
    const path = 'stages.' + i + '.';
    const candidates = Array.from({length: 7}, (_, j) => j + 2).filter(n =>
      g.parts.length && (st.s + g.r) % n === 0 &&
      2 * g.meshes[0].center * Math.sin(Math.PI / n) > g.parts[1].da);
    const ratio = Number.isFinite(g.ratio) ? fmt(g.ratio, 3) + ' : 1' : '—';
    return `<section class="card"><h3>${i + 1}단 기어 제원</h3><div class="ov-fields">
      ${num(path+'s','썬 잇수',{step:1,min:1})}${num(path+'p','유성 잇수',{step:1,min:1,disabled:shared && D.stages[0].r == null})}
      ${shared ? `<label class="f">링 잇수 (공유)<input readonly value="${fmt(E.ringTeeth(D.stages[0]),0)}"></label>`
        : num(path+'r','링 잇수 (빈칸 = 자동)',{step:1,min:1,placeholder:st.s + 2 * st.p})}
      ${num(path+'beta','비틀림각 (°)',{disabled:shared})}${num(path+'m','치직각 모듈 (mm)',{min:.01,disabled:shared})}
      ${num(path+'b','유성 치폭 (mm)',{min:.01})}${num(path+'n','유성 개수',{min:1,step:1})}</div>
      <p class="note">배치 가능 개수 (2~8개) · ${candidates.length ? candidates.map(n => `<button type="button" class="btn ${n===st.n?'on':''}" data-ov-count="${i}/${n}">${n}</button>`).join(' ') : '없음'}</p>
      <h4>단 감속비 ${ratio}</h4>
      ${g.parts.length ? `<div class="ov-scroll"><table><thead><tr><th>기어</th><th>잇수</th><th>PCD</th><th>이끝원경</th><th>이뿌리원경</th><th>리드</th></tr></thead>
      <tbody>${g.parts.map(p => `<tr><td>${esc(p.name)}</td><td>${p.z}</td><td>${fmt(p.d,3)}</td><td>${fmt(p.da,3)}</td><td>${fmt(p.df,3)}</td><td>${g.br ? fmt(Math.PI*p.d/Math.tan(g.br),3) : '∞'}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">직경 mm · 리드 mm/rev · 유성핀 배치 PCD Ø${fmt(2*g.meshes[0].center,3)} mm</p>` : ''}
      ${g.errors.map(e => `<p class="bad">${esc(e)}</p>`).join('')}</section>`;
  }).join('');
  return `<div class="ov-spec"><div class="card"><h3>단별 기어 제원</h3>
    ${stages.length > 1 ? chk('config.sharedRing','1·2단 링기어 공유') : ''}
    <p>총 감속비 <b>${fmt(geometries.reduce((r,g)=>r*g.ratio,1),3)} : 1</b></p></div>${cards}</div>`;
}
function bindOverviewSpecs(m) {
  m.querySelectorAll('[data-ov-count]').forEach(b => b.onclick = () => {
    const [i,n] = b.dataset.ovCount.split('/').map(Number); D.stages[i].n = n; changed();
  });
}
function overviewSpeedRows() {
  const stages = R.ctx.stages;
  const shared = stages.length > 1 && D.config.sharedRing;
  let sun = Number(D.anim.rpm) || 0;
  const rows = [];
  function add(part, motion, rpm, fixed = false) {
    const direction = fixed ? '고정' : rpm === 0 ? '정지' : rpm > 0 ? '정방향' : '역방향';
    const value = (rpm > 0 ? '+' : '') + fmt(rpm, 1);
    rows.push(`<tr><th scope="row">${part}</th><td>${motion}</td><td>${value}</td><td>${direction}</td></tr>`);
  }
  stages.forEach(({ st, geo }, i) => {
    const n = i + 1, carrier = sun / geo.ratio;
    const planet = carrier - (sun - carrier) * st.s / st.p;
    add(`S${n} 썬기어`, i ? '단간 입력' : '입력', sun);
    add(`P${n} 유성기어 ×${st.n}`, '자전', planet);
    if (!shared || !i) add(shared ? 'R1·2 공유 링기어' : `R${n} 링기어`, '고정 링', 0, true);
    add(`C${n} 캐리어`, n === stages.length ? '최종 출력' : '단간 출력', carrier);
    sun = carrier;
  });
  return rows.join('');
}

function overviewView() {
  if (!R || R.errors?.length) return head('3D · 종합판정', '기어 제원을 수정하면 3D 모델과 판정을 다시 계산합니다.') + '<div class="ov-workbench">' + overviewStagePanel() + '<div>' + errBox() + '</div></div>';
  const issues = buildIssues();
  return `<div class="ov-head"><h2>1. 종합판정</h2><button type="button" class="btn" data-torque-trace>허용토크 근거 · 기준안 비교</button><p class="lead">실측값 없이 규격식·물리 모델·명시된 가정으로 계산한 감속기입니다. 붉은 번호는 기준 미달 부위, 노란 번호는 주의 부위입니다. 부품을 누르면 상세가, 번호를 누르면 원인과 대책이 열립니다. 드래그 회전 · Shift+드래그 이동 · 휠 확대 · 더블클릭 기본 시점 · 우클릭 메뉴(배경: 보기 설정 / 부품: 투명·분해·단면·숨기기).</p></div>
    <div class="ov-workbench">${overviewStagePanel()}<section class="card ov-live"><h3>단별 유성 배치 3D</h3><div id="viewer" class="full">
      <div class="v3-bom closed" id="bom"></div>
      <div class="v3-card" id="pcard" hidden></div>
      <div class="v3-pop" id="ipop" hidden></div>
    </div>
      <div class="ov-console">
        <div class="ov-line" role="group" aria-label="모델 보기"><b>모델 보기</b><div class="ov-actions">
          <button class="btn" data-axial="1">상면</button><button class="btn" data-axial="-1">하면</button><button class="btn" id="tHome">기본 시점</button>
          <button class="btn" id="ovCarrier">캐리어·핀 숨기기</button><button class="btn" id="ovGrid">격자 ${D.view.grid === false ? 'OFF' : 'ON'}</button>
          <button class="btn" id="tBom" aria-expanded="false">BOM</button></div></div>
        <div class="ov-line" role="group" aria-label="조립 보기"><b>조립 보기</b><div class="ov-tools">
          <div class="ov-range"><button class="btn" id="tExp">분해</button><input aria-label="분해 정도" title="분해 정도" type="range" id="tExpR" min="0" max="100" value="0"></div>
          <div class="ov-range"><button class="btn" id="tSec">단면</button><input aria-label="단면 각도" title="단면 각도" type="range" id="tSecA" min="0" max="180" value="0"></div>
          ${nst().length>1 ? `<label class="f">단간 캐리어 간격 (mm)<input type="number" step="0.1" min="0" data-p="geom.stageGap" data-t="num" value="${D.geom?.stageGap ?? .6}"></label>` : ''}</div></div>
        <div class="ov-line" role="group" aria-label="구동 설정"><b>구동 설정</b><div>
          <div class="ov-tools"><label class="f">입력 속도 (rpm)<input type="number" id="tRpm" min="0" step="any" value="${D.anim.rpm}"></label>
          <label class="f">재생 배속<select id="tSlow">${[[1, '1× 실속도'], [.2, '0.2×'], [.05, '0.05×'], [.02, '0.02×'], [.005, '0.005×']].map(([v, l]) => `<option value="${v}" ${+D.anim.slow === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="f">프레임 제한<select id="ovFrame">${[[0,"최대"],[60,"60 FPS"],[30,"30 FPS"]].map(([v,t])=>`<option value="${v}" ${v===(D.view.frameCap||0)?"selected":""}>${t}</option>`).join("")}</select></label></div>
          <div class="ov-transport"><input aria-label="입력 속도 조절" type="range" id="ovSpeed" min="0" max="${Math.max(6000,D.anim.rpm)}" value="${D.anim.rpm}"><button class="btn" id="tPlay">회전 정지</button></div>
          <div class="ov-status note"><span id="tSpd"></span><span id="ovFps"></span></div></div></div>
      </div>
<details open><summary>부품별 투명도</summary><div class="ov-controls" id="ovParts"></div></details>
<details open><summary>기어·캐리어 절대 회전수</summary><p class="note">하우징 기준 · 입력 방향이 (+) · 유성기어의 공전 속도는 같은 단 캐리어와 같습니다.</p><table class="ov-rpm"><thead><tr><th>부품</th><th>운동·역할</th><th>절대 회전수 (rpm)</th><th>방향</th></tr></thead><tbody id="ovSpeedRows">${overviewSpeedRows()}</tbody></table></details>
</section></div>
    ${drawingHTML(OVSTATE.sel)}
    <div class="ov-sum">${issues.length ? `<div class="card"><h3>기준 미달·주의 ${issues.length}곳</h3><ol class="iss">${issues.map((g, k) => `<li class="${g.sev}"><button data-iss="${k}">${esc(g.title)}</button></li>`).join('')}</ol></div>` : '<div class="card"><h3 class="good">모든 항목이 기준을 만족합니다</h3></div>'}
    ${VIEWS.overviewOld().replace(/^<h2>.*?<\/h2><p class="lead">.*?<\/p>/s, '')}${componentsHTML()}</div>`;
}

// parts the 3D overview currently draws (machined S·P·R·C + planet pins); the rest return one by one
// 3D 종합판정에 그리는 부품: 가공 부품 + 카탈로그에서 고른 출력 베어링(구매 부품)
const IN3D = id => /^(sun|planet|ring|carrier|pin)\d?$/.test(id) || (id === 'xroller' && D?.outBearing?.d > 0 && D.outBearing.D > D.outBearing.d);
function bomHTML(sel, only3d = false) {
  const L = bomList().filter(p => !only3d || IN3D(p.id)), tot = L.reduce((s, p) => s + p.mass * p.qty, 0);
  return `<div class="bom-h"><b>BOM</b><span class="note">${L.length}종 · ${L.reduce((s, p) => s + p.qty, 0)}개 · 약 ${fmt(tot * 1000, 0)} g</span></div>
    <div class="bom-s"><table><tr><th>No</th><th class="l">부품</th><th>수량</th><th class="l">재료</th><th class="l">열처리</th><th>g</th><th>판정</th></tr>
    ${L.map((p, i) => `<tr data-id="${p.id}" class="${p.id === sel ? 'sel' : ''}"><td>${only3d ? i + 1 : p.no}</td><td class="l">${esc(p.name)}</td><td>${p.qty}</td><td class="l">${esc(p.material)}</td><td class="l">${esc(p.heat)}</td><td>${fmt(p.mass * 1000, 1)}</td><td>${p.verdict ? `<span class="${p.verdict.ok ? 'good' : 'bad'}">${p.verdict.ok ? '✓' : '✗'}</span>` : '—'}</td></tr>`).join('')}</table></div>`;
}
function dimsHTML(id, S) {
  let rows = []; try { rows = PGD3D.partSchema(R, D, id); } catch (e) { }
  // current result has no usable shape (calculation error): take the rows from the last clean shape, but show the values entered now
  if (!rows.length && S?.stale) { try { rows = PGD3D.partSchema(S.R, S.D, id).map(r => r.path && !r.readonly ? { ...r, value: r.options ? (get(r.path) ?? r.value) : get(r.path) } : r); } catch (e) { } }
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
  bindOverviewSpecs(m);
  const host = m.querySelector('#viewer'); if (!host) return;
  const issues = buildIssues();
  const card = m.querySelector('#pcard'), pop = m.querySelector('#ipop'), bom = m.querySelector('#bom');
  let sel = null;
  const showCard = id => {
    sel = id; bom.innerHTML = bomHTML(id, true); bindBom();
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
  bom.innerHTML = bomHTML(null, true); bindBom();
  const refreshOpacity = [];
  mountViewer(host, 'full', { only: 'sprc', onOpacity: () => refreshOpacity.forEach(fn => fn()), onFrameRate: fps => { m.querySelector("#ovFps").textContent = fps + " FPS"; }, onPick: id => showCard(id), onIssue: g => showIssue(g) });
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
  // speed panel: input rpm (1st sun) and playback scale; the viewer reads D.anim every frame
  const spd = m.querySelector('#tSpd'), spdTxt = () => { if (!spd || !R?.ratio) return; const out = (+D.anim.rpm || 0) / R.ratio; spd.textContent = `출력 ${fmt(out, 1)} rpm · 화면 입력 ${fmt(D.anim.rpm * D.anim.slow, 2)} rpm`; };
  const tr = m.querySelector('#tRpm'), ts = m.querySelector('#tSlow');
  if (tr) tr.onchange = e => { e.stopPropagation(); D.anim.rpm = Math.max(0, +tr.value || 0); tr.value = D.anim.rpm; save(); spdTxt(); };
  if (ts) ts.onchange = e => { e.stopPropagation(); D.anim.slow = +ts.value; save(); spdTxt(); };
  const speedSlider = m.querySelector('#ovSpeed');
  const updateSpeeds = () => {
    speedSlider.max = Math.max(6000,D.anim.rpm); speedSlider.value = D.anim.rpm;
    m.querySelector('#ovSpeedRows').innerHTML = overviewSpeedRows();
  };
  tr.addEventListener('change', updateSpeeds);
  speedSlider.oninput = () => { tr.value = speedSlider.value; tr.dispatchEvent(new Event('change')); };
  m.querySelectorAll('[data-axial]').forEach(b => b.onclick = () => VIEW3D?.axialView(+b.dataset.axial));
  const carrierButton = m.querySelector('#ovCarrier');
  let carriersVisible = true;
  carrierButton.onclick = () => {
    carriersVisible = !carriersVisible;
    VIEW3D?.partIds().filter(id => /^(carrier|pin)/.test(id)).forEach(id => VIEW3D.setVisible(id,carriersVisible));
    carrierButton.textContent = carriersVisible ? '캐리어·핀 숨기기' : '캐리어·핀 표시';
  };
  m.querySelector('#ovFrame').onchange = e => VIEW3D?.setFrameCap(+e.target.value);
  const grid = m.querySelector('#ovGrid');
  grid.onclick = () => { const on = D.view.grid === false; VIEW3D?.setGrid(on); grid.textContent = '격자 ' + (on?'ON':'OFF'); };
  const partBox = m.querySelector('#ovParts');
  // 부품 종류(행) × 단(열) 격자: 왼쪽 열 1단, 오른쪽 열 2단. 공유 링은 두 열에 걸친 버튼 하나(1·2단이 함께 투명)
  const TYPES = [['sun', '썬기어'], ['planet', '유성기어'], ['pin', '유성핀'], ['carrier', '캐리어'], ['ring', '링기어'], ['xroller', '출력 베어링']];
  const parts3d = bomList().filter(p => IN3D(p.id)), nSt = Math.max(1, ...parts3d.map(p => +(p.id.match(/\d$/)?.[0] || 1)));
  partBox.style.setProperty('--ov-cols', nSt);
  partBox.innerHTML = `<span class="ovp-corner"></span>${Array.from({ length: nSt }, (_, i) => `<span class="ovp-stage st${i + 1}" style="grid-column:${i + 2}">${i + 1}단</span>`).join('')}`
    + TYPES.map(([, t], r) => `<span class="ovp-head" style="grid-row:${r + 2}">${t}</span>`).join('');
  for (const part of parts3d) {
    const b = document.createElement('button'); b.className = 'btn';
    const type = TYPES.findIndex(([k]) => part.id.startsWith(k)), stg = +(part.id.match(/\d$/)?.[0] || 0);
    b.style.gridRow = String(type + 2);
    b.style.gridColumn = stg ? String(stg + 1) : `2 / span ${nSt}`;
    if (stg) b.classList.add('st' + stg);
    const transparent = () => (D.view.opacity?.[part.id] ?? (/^(ring|carrier)/.test(part.id) ? .28 : 1)) < 1;
    const refresh = () => {
      const on = transparent();
      b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); b.innerHTML = `<span>${esc(part.name)}</span><small>${on ? '투명' : '불투명'}</small>`;
    };
    b.onclick = () => { VIEW3D?.setOpacity(part.id,transparent() ? 1 : .28); refresh(); };
    refreshOpacity.push(refresh); refresh(); partBox.appendChild(b);
  }
  spdTxt();
  const pb = m.querySelector('#tPlay'); pb.onclick = () => { const on = VIEW3D?.togglePlay(); pb.textContent = on ? '회전 정지' : '회전 재생'; };
  const tb = m.querySelector('#tBom'); tb.onclick = () => { const hid = bom.classList.toggle('closed'); tb.setAttribute('aria-expanded', String(!hid)); };
}

// ------------------------------------------------------------------ 11. housing – cover
// ------------------------------------------------------------------ header actions
$('#dname').value = D.name || '';
$('#dname').onchange = e => { D.name = e.target.value; save(); };
$('#bExample').onclick = () => { D = E.defaultDesign(); $('#dname').value = D.name; changed(); };
$('#bExport').onclick = () => {
  const txt = JSON.stringify(D, null, 1);
  dlg('설계 JSON', txt, '아래 내용을 복사해 보관하세요. "복사"를 누르면 클립보드에 넣습니다.', '복사', async () => { try { await navigator.clipboard.writeText(txt); return '복사했습니다.'; } catch (e) { $('#dlgText').select(); return '자동 복사가 막혀 있어 내용을 선택해 두었습니다. Ctrl+C로 복사하세요.'; } });
};
$('#bImport').onclick = () => dlg('JSON 불러오기', '', '이 사이트에서 복사한 설계 JSON을 붙여 넣고 확인을 누르세요.', '불러오기', () => {
  try { const d = JSON.parse($('#dlgText').value); if (d.schema !== 'pgd/1') throw new Error('형식이 다릅니다'); d.config.floatingSun = false; D = migrateLoaded(d); $('#dname').value = D.name || ''; changed(); $('#dlg').close(); return null; } catch (e) { return '불러오지 못했습니다: ' + e.message; }
});
// 추천 제원: 외형·목표 감속비·입력축 조건 → 허용 토크 순
let REC = null, recDesign = '', recRevision = 0;
$('#bRecommend').onclick = () => {
  $('#moreMenu').hidden = true;
  const last = D.stages[D.stages.length - 1];
  let L = null; try { if (R?.ctx && !R.errors?.length) L = PGD3D.layout(R, D); } catch (e) { L = null; }
  const key = JSON.stringify(D), reset = key !== recDesign;
  const v = (id, x) => { const el = $('#' + id); if (reset || el.value === '') el.value = x; };
  if (reset) { recRevision++; REC = null; $('#recOut').textContent = ''; $('#trialOut').textContent = ''; }
  recDesign = key;
  const st = D.stages[0];
  for (const [id, val] of Object.entries({ trialS: st.s, trialP: st.p, trialR: E.ringTeeth(st), trialN: st.n, trialM: st.m, trialB: st.b, trialA: st.alpha })) v(id, val);
  v('rOD', L ? Math.round(2 * Math.max(L.housR, L.flangeR) * 10) / 10 : 68); v('rH', L ? Math.round((L.zFlange[1] - L.zIn) * 10) / 10 : 54);
  v('rRatio', R?.ratio || 9); v('rMods', [...new Set(D.stages.map(s => s.m))].join(', ')); v('rBeta', last.beta);
  $('#recDlg').showModal();
};
// 감속비 표시: 정확한 정수면 정수만, 아니면 기약분수와 오차 (소수 나열 없이)
const recRatioHTML = (r, spec) => {
  const g = (a, b) => b ? g(b, a % b) : a; let n = 1, d = 1;
  for (const t of r.stages) { n *= (t.R ?? t.r ?? (t.s + 2 * t.p)) + t.s; d *= t.s; const k = g(n, d); n /= k; d /= k; }
  return d === 1 ? `<b>${n}</b>` : `<b>${n}/${d}</b><br><small class="note">≈ ${fmt(n / d, 3)} (${n / d >= spec.ratio ? '+' : ''}${fmt(100 * (n / d - spec.ratio) / spec.ratio, 2)} %)</small>`;
};
$('#trialGo').onclick = () => {
  const value = id => $('#' + id).valueAsNumber;
  const st = { s: value('trialS'), p: value('trialP'), r: value('trialR'), n: value('trialN'),
    m: value('trialM'), b: value('trialB'), alpha: value('trialA'), beta: value('rBeta') };
  const out = $('#trialOut');
  if (![st.s, st.p, st.r, st.n].every(x => Number.isInteger(x) && x > 0) || st.n < 2 || !(st.r > st.p && st.m > 0 && st.b > 0 && st.alpha > 0 && st.alpha < 45 && st.beta >= 0 && st.beta < 45)) {
    out.textContent = '양의 정수 잇수, 유성 2개 이상, 링 잇수 > 유성 잇수, 양의 모듈·치폭과 유효한 각도를 입력하세요.'; return;
  }
  const result = PGDRecommend.inspectTeeth(E, st, $('#rShift').checked);
  const rows = result.candidates.map(({ profile: p, geo: g }) => `<tr><td>${[p.xs,p.xp,p.xr].map(x=>fmt(x,4)).join(' / ')}</td><td>${g.meshes.map(x=>fmt(x.center,4)).join(' / ')}</td><td>${g.parts.map(x=>fmt(x.tipThickness,3)).join(' / ')}</td></tr>`);
  out.innerHTML = `<p>감속비 ${fmt(result.ratio, 3)}:1 · 등간격 위상 ${fmt(result.phase, 3)} (${Number.isInteger(result.phase) ? '충족' : '불가'}) · 치형 통과 ${rows.length}개</p>
    ${rows.length ? '<div class="scroll"><table><tr><th>전위 S / P / R</th><th>작동 중심거리 S–P / P–R (mm)</th><th>이끝 두께 S / P / R (mm)</th></tr>'+rows.join('')+'</table></div>' : ''}
    <p class="note">링 전위 0.1, 외접 전위합 0.05 간격 · 링 전위별 첫 통과안. 제외 사유 (중복 집계) · ${result.reasons.map(([k,n])=>esc(k)+' '+n+'회').join(' · ') || '없음'}</p>`;
};
const recFrac = st => { const n = st.R + st.s, d = st.s, g = (a, b) => b ? g(b, a % b) : a, k = g(n, d); return d / k === 1 ? `${n / k}` : `${n / k}/${d / k}`; };
$('#recDlg').addEventListener('input', () => { recRevision++; REC = null; $('#recOut').textContent = ''; $('#trialOut').textContent = ''; });
$('#recGo').onclick = async () => {
  const num = id => +$('#' + id).value, out = $('#recOut');
  const mods = [...new Set($('#rMods').value.split(/[\s,;/]+/).map(Number).filter(x => x > 0))].sort((a, b) => a - b);
  const ns = [...$('#rNs').querySelectorAll('input:checked')].map(x => +x.value);
  const ns2 = [...$('#rNs2').querySelectorAll('input:checked')].map(x => +x.value);
  const modes = Object.fromEntries([...$('#rModes').querySelectorAll('input')].map(x => [x.value, x.checked]));
  const bIn = $('#rB').value.trim();
  const spec = { OD: num('rOD'), H: num('rH'), ratio: num('rRatio'), ratioTolPct: num('rRatioTol'), minSunPCD: num('rSunPCD'), mods, beta: num('rBeta'), b: bIn === '' ? null : +bIn, ns, ns2, modes, allowShift: $('#rShift').checked };
  const err = !(spec.OD > 0 && spec.H > 0) ? '외경과 높이를 넣어 주세요.' : !(spec.ratio > 2) ? '목표 감속비는 2보다 큰 값으로 넣어 주세요.'
    : !(spec.ratioTolPct >= 0 && spec.ratioTolPct <= 100) ? '감속비 허용 편차는 0~100%로 넣어 주세요.'
    : !(spec.minSunPCD >= 0) ? '1단 썬 PCD는 0 이상으로 넣어 주세요.'
    : !mods.length ? '모듈 후보를 하나 이상 넣어 주세요 (예: 0.5, 0.6, 0.8).' : !(spec.beta >= 0 && spec.beta < 45) ? '비틀림각은 0 ~ 45° 사이로 넣어 주세요.'
    : bIn !== '' && !(spec.b > 0) ? '치폭은 양수로 넣거나 비워 두세요 (자동 배분).' : !ns.length ? '유성 개수를 하나 이상 고르세요.' : !Object.values(modes).some(Boolean) ? '구성을 하나 이상 고르세요.' : '';
  if (err) { out.innerHTML = `<p class="bad">${err}</p>`; return; }
  const revision = ++recRevision, design = JSON.parse(JSON.stringify(D));
  const go_ = $('#recGo'); go_.disabled = true;
  out.innerHTML = '<p class="note">조건에 맞는 잇수 조합을 찾는 중…</p>';
  await new Promise(r => setTimeout(r, 0));
  let RS;
  try { RS = await PGDRecommend.run(design, spec, E, PGD3D.layout, (i, n) => { if (revision === recRevision) out.innerHTML = `<p class="note">정밀 계산 중… ${i} / ${n}</p>`; }); }
  catch (e) { if (revision === recRevision) out.innerHTML = `<p class="bad">계산 실패: ${esc(e.message)}</p>`; go_.disabled = false; return; }
  go_.disabled = false;
  if (revision !== recRevision || recDesign !== JSON.stringify(D)) return;
  REC = RS.res;
  const ok = REC.filter(r => r.ok), bad = REC.filter(r => !r.ok), c = RS.counts;
  const why = {}; bad.forEach(r => { const k = r.why.replace(/[\d.]+/g, '#'); (why[k] ||= { n: 0, ex: r.why }).n++; });
  const ratioCondition = `${spec.ratio}${spec.ratioTolPct ? ` ±${spec.ratioTolPct}%` : ' 일치'}`;
  const sunCondition = spec.minSunPCD ? ` · 1단 썬 PCD ≥ ${spec.minSunPCD} mm` : '';
  const sum = `<p class="note">감속비 ${ratioCondition}${sunCondition} · 조합 ${RS.total.toLocaleString()}개 (1단 ${c.one} · 2단 링 공유 ${c.shared} · 2단 링 분리 ${c.sep.toLocaleString()}) → 간이 강도 상위 ${RS.checked}개 정밀 계산 → 적합 ${ok.length}개.${bad.length ? ` 제외 ${bad.length}개: ${Object.values(why).map(w => `${esc(w.ex)}${w.n > 1 ? ` 외 ${w.n - 1}` : ''}`).join(' · ')}` : ''}</p>`;
  if (!RS.total) { out.innerHTML = `<p class="bad">감속비 ${ratioCondition}${sunCondition} 조건에 맞는 잇수 조합이 없습니다.</p>`; return; }
  if (!ok.length) { out.innerHTML = '<p class="bad">조합은 있으나 모두 외형·간섭 조건에서 제외됐습니다.</p>' + sum; return; }
  const typeName = { one: '1단', shared: '2단 링 공유', sep: '2단 링 분리' };
  const shiftLine = t => t.profile ? ` <small class="note">xS ${fmt(t.profile.xs, 4)} · xP ${fmt(t.profile.xp, 4)} · xR ${fmt(t.profile.xr, 4)}</small>` : '';
  const stg = r => r.stages.map((t, i) => `${r.stages.length > 1 ? `${i + 1}단 ` : ''}m${t.m} · S${t.s}/P${t.p}/R${t.R} ×${t.n} · b ${fmt(r.b[i], 1)} · i ${recFrac(t)}${shiftLine(t)}`).join('<br>');
  const caps = r => r.stageCap.map((cc, i) => `${r.stages.length > 1 ? `${i + 1}단 ` : ''}<b>${fmt(cc.out, 1)}</b>${r.stages.length > 1 ? ` <small class="note">(캐리어 ${fmt(cc.own, 1)})</small>` : ''}`).join('<br>');
  out.innerHTML = `<div class="scroll"><table><tr><th>순위</th><th>구성</th><th>실제 감속비<br><small>목표 대비</small></th><th class="l">모듈 · 잇수 · 유성 개수 · 치폭 · 단 감속비 · 전위</th><th>1단 썬 PCD<br><small>mm</small></th><th>단별 허용 토크<br><small>N·m · 출력축 환산</small></th><th>감속기 허용 토크<br><small>N·m · 출력</small></th><th class="l">지배 부위</th><th>외경 × 높이</th><th></th></tr>
    ${ok.map((r, k) => `<tr class="${k === 0 ? 'gov' : ''}"><td>${k + 1}</td><td>${typeName[r.type]}</td><td>${recRatioHTML(r, spec)}</td><td class="l">${stg(r)}</td><td>${fmt(r.stages[0].s * r.stages[0].m / Math.cos(spec.beta * Math.PI / 180), 3)}</td><td>${caps(r)}</td><td><b class="${r.cap < D.req.Trated ? 'bad' : 'good'}">${fmt(r.cap, 1)}</b>${r.fails ? `<br><small class="bad">미달 ${r.fails}</small>` : ''}</td><td class="l note">${esc(r.gov)}</td><td>Ø${fmt(r.OD, 1)} × ${fmt(r.H, 1)}</td><td><button class="btn" type="button" data-rec="${REC.indexOf(r)}">적용</button></td></tr>`).join('')}</table></div>
    <p class="note">요구 조건: 정격 ${D.req.Trated} N·m · 수명 ${D.req.lifeH} h · ${D.req.rpm} rpm · SH ${D.req.SH} · SF ${D.req.SF} · ${BASIS()}. 미달 = 판정 항목(효율·백래시·정적 등) 중 기준 미달 수. 단 감속비는 분수로 표시합니다.</p>${sum}`;
  out.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => { const r = REC[+b.dataset.rec]; D = JSON.parse(JSON.stringify(r.D)); $('#dname').value = D.name; $('#recDlg').close(); changed(); });
};
function dlg(title, text, note, okLabel, onOk) {
  $('#dlgTitle').textContent = title; $('#dlgText').value = text; $('#dlgNote').textContent = note; $('#dlgOk').textContent = okLabel;
  $('#dlgOk').onclick = async e => { e.preventDefault(); const msg = await onOk(); if (msg) $('#dlgNote').textContent = msg; };
  $('#dlg').showModal();
}
const validView = h => STEPS.some(s => s[0] === h) || h === 'core' || h === 'studio' || (h.startsWith('cg-') && !!window.PGDGroups?.G[h.slice(3)]) || !!VIEW_ITEM[h] || (h.startsWith('st-') && STAGE_KEYS.includes(h.slice(3))) || (h.startsWith('it-') && !!IT()[h.slice(3)]);
window.addEventListener('hashchange', () => { const [h, a] = location.hash.slice(1).split('/'); if (validView(h) && h !== view) go(h, a); });
{ const [h0, a0] = location.hash.slice(1).split('/'); if (validView(h0)) { view = VIEW_ITEM[h0] ? 'it-' + VIEW_ITEM[h0] : h0.startsWith('st-') && a0 && IT()[a0] ? 'it-' + a0 : h0; if (view.startsWith('it-')) LASTITEM = view.slice(3); } }
$('#vchip').onclick = () => document.body.classList.toggle('vopen');
document.addEventListener('click', e => { if (document.body.classList.contains('vopen') && !e.target.closest('#verdict,#vchip')) document.body.classList.remove('vopen'); });
// 설계 파일 DB (초안): 기본 설계(designs/index.json)와 이 브라우저에 저장한 내 설계. 누르면 JSON 불러오기와 같은 경로로 적용.
const DBKEY = 'pgd-db-v1';
const dbMine = () => { try { return JSON.parse(localStorage.getItem(DBKEY)) || []; } catch (e) { return []; } };
const dbPut = list => { try { localStorage.setItem(DBKEY, JSON.stringify(list)); } catch (e) { } };
let DBLIB = [];
let DBQ = '';
function dbApply(d, toOverview) { d = JSON.parse(JSON.stringify(d)); d.schema = 'pgd/1'; d.config.floatingSun = false; D = migrateLoaded(d); $('#dname').value = D.name || ''; $('#moreMenu').hidden = true; changed(); if (toOverview) go('overview'); }
async function dbOpen(key, toOverview) {
  const [k, i] = key.split(':');
  try {
    if (k === 'mine') return dbApply(dbMine()[+i].D, toOverview);
    const x = DBLIB[+i]; if (x.D) return dbApply(x.D, toOverview);
    if (x.builtin) return dbApply(E[x.builtin](), toOverview);
  } catch (err) { alert('불러오기 실패: ' + err.message); }
}
// 기본 설계: 설계와 결과 요약을 한 번 계산해 둔다 (DB 페이지 표시용)
async function dbLoadLib(list) {
  for (const x of list) {
    try {
      if (x.file) { const j = await (await fetch('designs/' + x.file + '?v=case3-1')).json(); x.D = j.schema === 'pgd-case/1' ? j.D : j; }
      else if (x.builtin) x.D = E[x.builtin]();
      if (x.D && !x.summary) { const d = JSON.parse(JSON.stringify(x.D)); if (window.PGDChecks) { PGDChecks.ensure(d); PGDChecks.applyNeedles(d); } const c = caseRecord(d, E.analyze(d)); x.summary = c.summary; x.request = c.request; }
    } catch (e) { console.error(e); }
  }
  return list;
}
function dbRender() {
  const mine = dbMine(), row = (k, name, sub) => `<div class="dbrow"><button type="button" class="dbload" data-db="${k}">${esc(name)} <small>${esc(sub)}</small></button></div>`;
  $('#dbList').innerHTML = DBLIB.map((x, i) => row('lib:' + i, x.name, '기본')).join('') + mine.slice(0, 5).map((x, i) => row('mine:' + i, x.name, `${x.summary?.reducerCap ? (+x.summary.reducerCap).toFixed(0) + ' N·m · ' : ''}${new Date(x.saved).toLocaleDateString('ko-KR')}`)).join('') || '<span class="note">없음</span>';
  $('#dbList').querySelectorAll('[data-db]').forEach(b => b.onclick = e => { e.stopPropagation(); dbOpen(b.dataset.db); });
}
fetch('designs/index.json?v=case3-1').then(r => r.json()).catch(() => [{ name: 'HDS 예제', builtin: 'defaultDesign' }, { name: 'RH065 템플릿', builtin: 'templateDesign' }])
  .then(l => { DBLIB = l; dbRender(); return dbLoadLib(l); }).then(() => { if (view === 'db') render(true); });
// 케이스 레코드 (pgd-case/1): 나중에 모아서 참고·학습에 쓰도록 요구 조건 · 설계 제원 · 결과 요약을 같은 형식으로 남긴다.
function caseRecord(D = PGDApp.state().D, R = PGDApp.state().R) {
  const ok = R && !R.errors?.length, S = ok ? R.ctx.stages : [];
  let L = null; try { if (ok) L = PGD3D.layout(R, D); } catch (e) { }
  return { schema: 'pgd-case/1', id: Date.now().toString(36), name: D.name || '이름 없음', saved: new Date().toISOString(), source: 'site',
    request: { Trated: D.req.Trated, Tpeak: D.req.Tpeak, Temerg: D.req.Temerg, rpm: D.req.rpm, lifeH: D.req.lifeH, ratio: D.req.ratio ?? null, Dmax: D.req.Dmax ?? null, Lmax: D.req.Lmax ?? null, ext: D.req.ext, duty: D.req.duty, basis: D.loads?.basis },
    summary: ok ? { stages: S.length, sharedRing: !!D.config.sharedRing, ratio: R.ratio,
      gears: S.map(x => ({ s: x.st.s, p: x.st.p, r: x.geo.r, n: x.st.n, m: x.st.m, beta: x.st.beta, b: x.st.b })),
      OD: L ? 2 * Math.max(L.housR, L.flangeR) : null, L: L ? (L.zFlange[1] + .4) - L.zIn : null, outBearing: D.outBearing?.name,
      gearCap: R.capacityLife, reducerCap: R.reducerCap, governing: R.reducerGov, eff: R.eff?.total, backlash: R.backlash?.arcmin,
      verdictFail: R.verdict.filter(v => !v.ok).map(v => v.k) } : { errors: R?.errors || [] },
    D: JSON.parse(JSON.stringify(D)) };
}
$('#dbPage').onclick = e => { e.stopPropagation(); $('#moreMenu').hidden = true; go('db'); };
$('#dbSave').onclick = e => { e.stopPropagation(); const l = dbMine(); l.unshift(caseRecord()); dbPut(l.slice(0, 200)); dbRender(); if (view === 'db') render(true); };
$('#dbExport').onclick = e => { e.stopPropagation(); const txt = JSON.stringify(dbMine(), null, 1); dlg('설계 DB 내보내기', txt, `케이스 ${dbMine().length}건 (pgd-case/1: 요구 조건 · 설계 제원 · 결과 요약 · 전체 설계). 저장소 designs/ 폴더에 모아 두면 기본 DB로 공유됩니다.`, '복사', async () => { try { await navigator.clipboard.writeText(txt); return '복사했습니다.'; } catch (err) { return '복사 실패: 직접 선택해 복사하세요.'; } }); };
$('#bMore').onclick = e => { e.stopPropagation(); $('#moreMenu').hidden = !$('#moreMenu').hidden; };
document.addEventListener('click', e => { if (!e.target.closest('#moreMenu')) $('#moreMenu').hidden = true; });
window.PGDApp = { go, state: () => ({ D, R }), view: () => view, rvState: id => rvState(id), sig: id => sigOf(id, ictx()), mapSelect: id => MAPV?.select(id), mapState: () => MAPV?.state(), items: () => procEval().flatMap(g => g.items.map(i => i.id)), groups: () => window.PGDGroups?.ORDER || [], studio: () => ({ id: STUDIO.id, parts: studioParts(), dims: studioDims(STUDIO.id).length, mounted: !!PARTV }), studioPick: id => { STUDIO.id = id; STUDIO.view = null; render(true); } };
compute(); renderRail(); renderVerdict(); render();
}
