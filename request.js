// 설계의뢰서 (엑셀) 형식 · 검증 · 요구 정격 산출 — docs/DESIGN-ALGORITHM.md §1 · §2-1 · §3
// 외부 라이브러리 없이 .xlsx(zip + XML)를 읽는다. 브라우저·Node 18+의 DecompressionStream 사용.
// 사용자가 입력한 값은 바꾸지 않는다. 빈칸을 기본값으로 채우면 assumptions에 남긴다. 빈칸과 0은 구분한다.
(function (root) {
  'use strict';
  const FORMAT = 'PGD-REQ-2';
  const SHEET = '의뢰서';
  const ETA0 = 0.95;           // §2-1 정격 효율 가정 (계산 후 반복으로 대체 예정)
  const MARGIN = 1.0;          // §3: 여유는 기본 안전율 SH ≥ 1.0 · SF ≥ 1.4로 둔다 (토크 배수 없음, 사용자 결정 2026-11-26 SF-1)
  const LIFE0 = 20000;         // §2 기본 정격 수명 (ALG-2)
  const TM_PER_TA = 1.5;       // §2-1 순간 최대 / 반복 피크 가정 (ALG-3)
  const NMAX_PER_NR = 1.5;     // §1 I4 빈칸 가정
  const KINDS = ['정격', '반복 피크', '순간 최대', '모름'];

  // id · key · 항목 · 단위 · need(필수 'Y' / 선택 '' / 조건부 'C') · type · 빈칸일 때
  const FIELDS = [
    ['M1', 'client', '의뢰처', '', '', 'text', ''],
    ['M2', 'requester', '의뢰자', '', '', 'text', ''],
    ['M3', 'date', '의뢰일', '', '', 'text', ''],
    ['M4', 'application', '용도', '', '', 'text', ''],
    ['I1', 'Tmr', '모터 정격 토크', 'N·m', 'C', 'num', 'I13·I14를 직접 지정하면 생략 가능'],
    ['I2', 'Tmx', '모터 최대 토크', 'N·m', 'C', 'num', 'I13·I14를 직접 지정하면 생략 가능'],
    ['I3', 'nr', '모터 정격 회전수 (정격 입력 회전수)', 'rpm', 'Y', 'num', ''],
    ['I4', 'nmax', '모터 최대 회전수', 'rpm', '', 'num', '정격 회전수 × 1.5 (가정)'],
    ['I5', 'Treq', '필요 출력 토크', 'N·m', 'Y', 'num', ''],
    ['I6', 'kind', '필요 출력 토크의 종류', '', 'Y', 'kind', ''],
    ['I7', 'ratio', '감속비', '', 'Y', 'num', ''],
    ['I8', 'Dmax', '최대 외경 (절대 고정)', 'mm', 'Y', 'num', ''],
    ['I9', 'Lmax', '최대 길이 (입력 커버 ~ 출력 플랜지, 절대 고정)', 'mm', 'Y', 'num', ''],
    ['I10', 'hollow', '중공 지름 (0 = 중실)', 'mm', '', 'num', '가능한 최대 중공'],
    ['I11', 'lifeH', '정격 수명', 'h', '', 'num', '20,000 h'],
    ['I12a', 'Fr', '출력 외력 — 반경 하중 Fr', 'N', '', 'num', '0 (출력 베어링은 "외력 입력 필요")'],
    ['I12b', 'Fa', '출력 외력 — 축 하중 Fa', 'N', '', 'num', '0 (출력 베어링은 "외력 입력 필요")'],
    ['I12c', 'M', '출력 외력 — 모멘트 M', 'N·m', '', 'num', '0 (출력 베어링은 "외력 입력 필요")'],
    ['I13', 'TA', '반복 피크 토크 직접 지정', 'N·m', '', 'num', '모터 최대 토크 × 감속비 × 효율'],
    ['I14', 'TM', '순간 최대 토크 직접 지정', 'N·m', '', 'num', '반복 피크 × 1.5 또는 모터 기준 (§2-1)'],
  ].map(([id, key, label, unit, need, type, blank]) => ({ id, key, label, unit, need, type, blank }));
  const BY_ID = Object.fromEntries(FIELDS.map(f => [f.id, f]));

  const isBlank = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  function toNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const s = String(v).trim().replace(/,/g, '');
    return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) ? Number(s) : NaN;
  }
  const r6 = x => Math.round(x * 1e6) / 1e6;
  const minD = (...a) => { const v = a.filter(x => x !== undefined); return v.length ? Math.min(...v) : undefined; };
  const maxD = (...a) => { const v = a.filter(x => x !== undefined); return v.length ? Math.max(...v) : undefined; };

  // cells: { 'I1': 값, ... } (엑셀 C열 또는 화면 입력) → { ok, input, req, derived, target, engineReq, errors, assumptions }
  function parse(cells, opt = {}) {
    const eta = opt.eta || ETA0, errors = [], assumptions = [], q = {}, given = {};
    const err = (id, msg) => errors.push({ id, msg: (BY_ID[id] ? BY_ID[id].label + ': ' : '') + msg });
    const asm = (id, msg) => assumptions.push({ id, msg });
    for (const f of FIELDS) {
      const raw = cells[f.id];
      given[f.key] = !isBlank(raw);
      if (!given[f.key]) { q[f.key] = undefined; if (f.need === 'Y') err(f.id, '필수 항목이 비어 있음'); continue; }
      if (f.type === 'text') { q[f.key] = String(raw).trim(); continue; }
      if (f.type === 'kind') {
        const s = String(raw).trim();
        if (!KINDS.includes(s)) err(f.id, `"${s}" — ${KINDS.join(' / ')} 중 하나`); else q[f.key] = s;
        continue;
      }
      const x = toNum(raw);
      if (Number.isNaN(x)) { err(f.id, `숫자가 아님 ("${raw}")`); continue; }
      if (x < 0) { err(f.id, '음수 불가'); continue; }
      q[f.key] = x;
    }
    // 범위 · 상호 관계 (§1 · §4)
    const pos = ['Tmr', 'Tmx', 'nr', 'nmax', 'Treq', 'ratio', 'Dmax', 'Lmax', 'lifeH', 'TA', 'TM'];
    for (const k of pos) if (q[k] === 0) err(FIELDS.find(f => f.key === k).id, '0보다 커야 함');
    if (q.ratio !== undefined && q.ratio > 0 && (q.ratio < 3 || q.ratio > 50)) err('I7', '3 ~ 50 범위 (1단 3~10, 2단 ≤ 50)');
    if (q.Tmr > 0 && q.Tmx > 0 && q.Tmx < q.Tmr) err('I2', '모터 정격 토크보다 작음');
    if (q.nr > 0 && q.nmax > 0 && q.nmax < q.nr) err('I4', '모터 정격 회전수보다 작음');
    if (q.hollow > 0 && q.Dmax > 0 && q.hollow >= q.Dmax / 2) err('I10', `최대 외경의 절반(${q.Dmax / 2} mm) 이상`);
    if (q.kind === '반복 피크' && given.TA && q.TA !== q.Treq) err('I13', `필요 출력 토크(반복 피크 ${q.Treq})와 다름`);
    if (q.kind === '순간 최대' && given.TM && q.TM !== q.Treq) err('I14', `필요 출력 토크(순간 최대 ${q.Treq})와 다름`);

    // 빈칸 기본값 (가정 표시)
    if (!given.nmax && q.nr > 0) { q.nmax = q.nr * NMAX_PER_NR; asm('I4', `모터 최대 회전수 = 정격 × ${NMAX_PER_NR} = ${r6(q.nmax)} rpm`); }
    if (!given.lifeH) { q.lifeH = LIFE0; asm('I11', `정격 수명 ${LIFE0.toLocaleString('en-US')} h (유성 감속기 카탈로그 관례)`); }
    const extGiven = given.Fr || given.Fa || given.M;
    for (const k of ['Fr', 'Fa', 'M']) if (!given[k]) q[k] = 0;
    if (!extGiven) asm('I12', '출력 외력 미입력 → 0, 출력 베어링 판정은 "외력 입력 필요"');
    if (!given.hollow) asm('I10', '중공 지름 미입력 → 구조 한계 안 최대 중공');

    // 요구 정격 (§2-1)
    let derived;
    if (!errors.length) {
      const i = q.ratio, mr = q.Tmr !== undefined ? q.Tmr * i * eta : undefined, mx = q.Tmx !== undefined ? q.Tmx * i * eta : undefined;
      const T = q.Treq, A = given.TA ? q.TA : undefined, M = given.TM ? q.TM : undefined;
      let TR, TA, TM;
      if (q.kind === '정격') { TR = T; TA = A !== undefined ? A : (mx !== undefined ? maxD(mx, T) : undefined); }
      else if (q.kind === '반복 피크') { TR = minD(mr, T); TA = T; }
      else if (q.kind === '순간 최대') { TR = minD(mr, T / 2); TA = A !== undefined ? A : minD(mx, T); TM = T; }
      else { TR = mr; TA = A !== undefined ? A : mx; }
      if (q.kind !== '순간 최대') TM = M !== undefined ? M : (TA !== undefined ? maxD(TA * TM_PER_TA, mx) : undefined);
      if (TR === undefined) err('I1', '정격 토크를 정할 수 없음 — 모터 정격 토크 필요');
      if (TA === undefined) err('I2', '반복 피크를 정할 수 없음 — 모터 최대 토크 또는 I13 필요');
      if (!errors.length) {
        if (mr === undefined && q.kind === '반복 피크') asm('I1', '모터 정격 토크 미입력 → 정격 토크 = 필요 출력 토크 (보수적)');
        if (mr === undefined && q.kind === '순간 최대') asm('I1', '모터 정격 토크 미입력 → 정격 토크 = 필요 출력 토크 ÷ 2 (가정)');
        if (q.kind === '모름') asm('I6', `토크 종류 모름 → 모터 토크 × 감속비 × 효율 ${eta} 전부를 감속기가 받는다고 가정`);
        if (M === undefined && q.kind !== '순간 최대') asm('I14', `순간 최대 = max(반복 피크 × ${TM_PER_TA}${mx !== undefined ? ', 모터 최대 × 감속비 × 효율' : ''}) (가정)`);
        if (A === undefined && q.kind !== '반복 피크') asm('I13', '반복 피크 = 모터 최대 토크 × 감속비 × 효율' + (q.kind === '정격' ? ' (필요 출력 토크 이상)' : ''));
        if (!(TR <= TA + 1e-9)) err('I13', `반복 피크 ${r6(TA)} < 정격 ${r6(TR)}`);
        if (!(TA <= TM + 1e-9)) err('I14', `순간 최대 ${r6(TM)} < 반복 피크 ${r6(TA)}`);
      }
      if (!errors.length) derived = { TR: r6(TR), TA: r6(TA), TM: r6(TM), nIn: q.nr, nInMax: r6(q.nmax), nOut: r6(q.nr / i), nOutMax: r6(q.nmax / i), lifeH: q.lifeH, eta };
    }
    const ok = !errors.length;
    const target = ok ? { TR: r6(derived.TR * MARGIN), TA: r6(derived.TA * MARGIN), TM: r6(derived.TM * MARGIN), lifeH: r6(derived.lifeH * MARGIN), margin: MARGIN } : null;
    const engineReq = ok ? {
      Trated: derived.TR, Tpeak: derived.TA, Temerg: derived.TM, rpm: q.nr, lifeH: q.lifeH, ratio: q.ratio,
      Dmax: q.Dmax, Lmax: q.Lmax, ext: { Fr: q.Fr, Fa: q.Fa, M: q.M }, basis: 'iso',
    } : null;
    const meta = { client: q.client, requester: q.requester, date: q.date, application: q.application };
    return { ok, format: FORMAT, input: q, given, extGiven, meta, derived: derived || null, target, engineReq, hollow: given.hollow ? q.hollow : null, errors, assumptions };
  }

  // ---- 베어링 기준 의뢰서 (PGD-REQ-3, 사용자 결정 2026-11-26 AD-2)
  // 감속비 · 출력 베어링 형번 · 1·2단 캐리어 간격 · 전위 탐색 / 링 공유 선택. 요구 토크 · 외경 · 길이는 입력하지 않는다
  // (토크는 베어링 C0로 산출, 외경 = 2단 링기어 림 포함 외경, 길이 = b1 + 캐리어 간격 + b2 자동 산출).
  const FORMAT_BF = 'PGD-REQ-3';
  const FIELDS_BF = [
    ['M1', 'client', '의뢰처', '', '', 'text', ''],
    ['M2', 'requester', '의뢰자', '', '', 'text', ''],
    ['M3', 'date', '의뢰일', '', '', 'text', ''],
    ['M4', 'application', '용도', '', '', 'text', ''],
    ['I7', 'ratio', '감속비', '', 'Y', 'num', ''],
    ['B1', 'bearing', '출력 베어링 형번 (카탈로그, 예: THK RU42)', '', 'Y', 'bearing', ''],
    ['G1', 'gap', '1·2단 캐리어 축방향 간격 (2단일 때)', 'mm', '', 'num', '3 mm'],
    ['O1', 'shift', '전위 탐색', 'Y/N', '', 'yn', 'N (전위 0)'],
    ['O2', 'shared', '1·2단 링기어 공유', 'Y/N', '', 'yn', 'N (링 분리 — 1단 링 외경은 2단 링 외경 안에서 자유)'],
    ['I3', 'nr', '정격 입력 회전수', 'rpm', 'Y', 'num', ''],
    ['I10', 'hollow', '중공 지름 (0 = 중실)', 'mm', '', 'num', '0'],
    ['I11', 'lifeH', '정격 수명', 'h', '', 'num', '20,000 h'],
    ['I12a', 'Fr', '출력 외력 — 반경 하중 Fr', 'N', '', 'num', '0'],
    ['I12b', 'Fa', '출력 외력 — 축 하중 Fa', 'N', '', 'num', '0'],
    ['I12c', 'M', '출력 외력 — 모멘트 M', 'N·m', '', 'num', '0'],
    ['K1', 'kappa', '토크 계수 κ (출력 토크 / 베어링 허용 모멘트)', '', '', 'num', '0.2 (실물 RH065 0.18 · PI82 0.25 보정, 가정)'],
    ['K2', 's0', '베어링 허용 모멘트 정적 안전율 s0', '', '', 'num', '1.0'],
  ].map(([id, key, label, unit, need, type, blank]) => ({ id, key, label, unit, need, type, blank }));
  const BY_BF = Object.fromEntries(FIELDS_BF.map(f => [f.id, f]));
  const YES = /^(y|yes|예|true|1|o|on|사용|공유)$/i, NO = /^(n|no|아니오|아니요|false|0|x|off|미사용|분리)$/i;
  function parseBF(cells, opt = {}) {
    const errors = [], assumptions = [], q = {}, given = {};
    const err = (id, msg) => errors.push({ id, msg: (BY_BF[id] ? BY_BF[id].label + ': ' : '') + msg });
    const asm = (id, msg) => assumptions.push({ id, msg });
    const findB = opt.findBearing || (root.PGDBearingFirst && root.PGDBearingFirst.findBearing);
    for (const f of FIELDS_BF) {
      const raw = cells[f.id];
      given[f.key] = !isBlank(raw);
      if (!given[f.key]) { q[f.key] = undefined; if (f.need === 'Y') err(f.id, '필수 항목이 비어 있음'); continue; }
      if (f.type === 'text') { q[f.key] = String(raw).trim(); continue; }
      if (f.type === 'yn') { const v = String(raw).trim(); if (raw === true || YES.test(v)) q[f.key] = true; else if (raw === false || NO.test(v)) q[f.key] = false; else err(f.id, `"${v}" — Y 또는 N`); continue; }
      if (f.type === 'bearing') { const name = String(raw).trim(), b = findB ? findB(name) : null; if (!b) err(f.id, `"${name}" — 카탈로그에 없는 형번`); else if (!(b.C0 > 0)) err(f.id, `${name}: 정정격 C0 없음`); else q.bearing = b; q.bearingName = name; continue; }
      const x = toNum(raw);
      if (Number.isNaN(x)) { err(f.id, `숫자가 아님 ("${raw}")`); continue; }
      if (x < 0) { err(f.id, '음수 불가'); continue; }
      q[f.key] = x;
    }
    for (const k of ['ratio', 'nr', 'lifeH', 'kappa', 's0']) if (q[k] === 0) err(FIELDS_BF.find(f => f.key === k).id, '0보다 커야 함');
    if (q.ratio > 0 && (q.ratio < 3 || q.ratio > 100)) err('I7', '3 ~ 100 범위 (1단 3~10, 2단 9~100)');
    if (q.kappa > 1) err('K1', '1 이하 (토크 계수)');
    if (q.hollow > 0 && q.bearing && q.hollow >= q.bearing.d) err('I10', `출력 베어링 내경 Ø${q.bearing.d} 이상`);
    if (!given.gap) { q.gap = 3; if (q.ratio > 10) asm('G1', '1·2단 캐리어 간격 3 mm (가정)'); }
    if (!given.shift) { q.shift = false; asm('O1', '전위 탐색 안 함 (전위 0)'); }
    if (!given.shared) { q.shared = false; asm('O2', '링 분리 (1단 링 외경은 2단 링 외경 안에서 자유)'); }
    if (!given.hollow) q.hollow = 0;
    if (!given.lifeH) { q.lifeH = LIFE0; asm('I11', `정격 수명 ${LIFE0.toLocaleString('en-US')} h`); }
    for (const k of ['Fr', 'Fa', 'M']) if (!given[k]) q[k] = 0;
    if (!given.kappa) { q.kappa = 0.2; asm('K1', '토크 계수 κ 0.2 (가정 — 실물 2건 보정)'); }
    if (!given.s0) q.s0 = 1;
    const ok = !errors.length;
    let derived = null;
    if (ok) { const dp = q.bearing.dp ?? (q.bearing.d + q.bearing.D) / 2, M0 = q.bearing.C0 * dp / (2000 * q.s0); derived = { dp: r6(dp), M0: r6(M0), T: r6(M0 * q.kappa), nOut: r6(q.nr / q.ratio) }; }
    const meta = { client: q.client, requester: q.requester, date: q.date, application: q.application };
    return { ok, format: FORMAT_BF, input: q, given, meta, derived, errors, assumptions,
      bearing: q.bearing, ratio: q.ratio, gap: q.gap, shift: q.shift, shared: q.shared, hollow: q.hollow, rpm: q.nr, lifeH: q.lifeH, ext: { Fr: q.Fr, Fa: q.Fa, M: q.M }, kappa: q.kappa, s0: q.s0 };
  }

  // ---- .xlsx 읽기 (zip 중앙 디렉터리 + deflate-raw) ----
  const u16 = (b, o) => b[o] | (b[o + 1] << 8), u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const utf8 = b => new TextDecoder('utf-8').decode(b);
  async function inflateRaw(data) {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) return new Uint8Array(require('zlib').inflateRawSync(data));
    const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function unzip(buf) {
    const b = new Uint8Array(buf); let e = -1;
    for (let o = b.length - 22; o >= Math.max(0, b.length - 65557); o--) if (u32(b, o) === 0x06054b50) { e = o; break; }
    if (e < 0) throw new Error('xlsx 파일이 아님 (zip 끝 레코드 없음)');
    const n = u16(b, e + 10); let p = u32(b, e + 16); const out = {};
    for (let k = 0; k < n; k++) {
      if (u32(b, p) !== 0x02014b50) throw new Error('zip 디렉터리 손상');
      const method = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lo = u32(b, p + 42);
      const name = utf8(b.subarray(p + 46, p + 46 + nl));
      const ds = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28), raw = b.subarray(ds, ds + csize);
      out[name] = { method, raw };
      p += 46 + nl + xl + cl;
    }
    return { async text(name) {
      const f = out[name]; if (!f) return null;
      if (f.method === 0) return utf8(f.raw);
      if (f.method === 8) return utf8(await inflateRaw(f.raw));
      throw new Error('지원하지 않는 압축 방식 ' + f.method);
    } };
  }
  const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
  const tText = x => { let s = ''; x.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (_, t) => { s += t; }); return unesc(s); };
  const attr = (tag, a) => { const m = new RegExp('\\s' + a + '="([^"]*)"').exec(tag); return m ? unesc(m[1]) : null; };

  // 시트 이름 → { 'A1': 값 }
  async function readSheet(buf, sheetName) {
    const z = await unzip(buf);
    const wb = await z.text('xl/workbook.xml'); if (!wb) throw new Error('xlsx 파일이 아님 (workbook 없음)');
    const rels = (await z.text('xl/_rels/workbook.xml.rels')) || '';
    let rid = null, names = [];
    wb.replace(/<sheet\b[^>]*>/g, t => { const nm = attr(t, 'name'); names.push(nm); if (nm === sheetName) rid = attr(t, 'r:id'); });
    if (!rid) throw new Error(`"${sheetName}" 시트 없음 (있는 시트: ${names.join(', ')})`);
    let target = null; rels.replace(/<Relationship\b[^>]*>/g, t => { if (attr(t, 'Id') === rid) target = attr(t, 'Target'); });
    if (!target) throw new Error('시트 연결 정보 없음');
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const ssx = await z.text('xl/sharedStrings.xml'), ss = [];
    if (ssx) ssx.replace(/<si>([\s\S]*?)<\/si>/g, (_, x) => { ss.push(tText(x)); });
    const sx = await z.text(path), cells = {};
    sx.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (_, a, body) => {
      const r = attr(' ' + a, 'r'), t = attr(' ' + a, 't'); if (!r || body === undefined) return;
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      let val;
      if (t === 's') val = v ? ss[+v[1]] : undefined;
      else if (t === 'inlineStr') val = tText(body);
      else if (t === 'str' || t === 'e') val = v ? unesc(v[1]) : undefined;
      else if (t === 'b') val = v ? v[1] === '1' : undefined;
      else val = v ? Number(v[1]) : undefined;
      if (val !== undefined && val !== '') cells[r] = val;
    });
    return cells;
  }

  // 의뢰서 시트: A열 ID, C열 값. 행 위치가 아니라 ID로 찾으므로 행을 끼워 넣어도 읽힌다.
  async function readXlsx(buf, opt = {}) {
    const bf = opt.format === 'bf', BY = bf ? BY_BF : BY_ID, FMT = bf ? FORMAT_BF : FORMAT;
    const grid = await readSheet(buf, opt.sheet || SHEET), cells = {}, dup = [];
    for (const ref in grid) {
      const m = /^A(\d+)$/.exec(ref); if (!m) continue;
      const id = String(grid[ref]).trim();
      if (id === 'FORMAT') { cells.FORMAT = grid['C' + m[1]]; continue; }
      if (!BY[id]) continue;
      if (id in cells) dup.push(id);
      cells[id] = grid['C' + m[1]];
    }
    const res = bf ? parseBF(cells, opt) : parse(cells, opt);
    if (cells.FORMAT !== FMT) res.errors.unshift({ id: 'FORMAT', msg: `양식 버전 불일치 ("${cells.FORMAT ?? '없음'}", 필요 ${FMT}) — 최신 의뢰서 양식 사용` });
    for (const id of dup) res.errors.unshift({ id, msg: BY[id].label + ': ID가 두 번 나옴' });
    res.ok = !res.errors.length; if (!res.ok) { res.engineReq = null; res.target = null; }
    res.cells = cells;
    return res;
  }

  // ---- .xlsx 쓰기 (외부 라이브러리 없음): 무압축 zip + 인라인 문자열. 결과 시트 내보내기용.
  // sheets: [{ name, rows: [[셀, ...], ...], widths: [열 너비...], head: [굵게 할 행 번호(0부터)...] }]
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  function zipStore(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    const u16b = v => [v & 255, (v >>> 8) & 255], u32b = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const [name, text] of files) {
      const nm = enc.encode(name), data = enc.encode(text), c = crc32(data);
      const head = [0x50, 0x4b, 3, 4, ...u16b(20), ...u16b(0x0800), ...u16b(0), ...u16b(0), ...u16b(0x21), ...u32b(c), ...u32b(data.length), ...u32b(data.length), ...u16b(nm.length), ...u16b(0)];
      parts.push(new Uint8Array(head), nm, data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16b(20), ...u16b(20), ...u16b(0x0800), ...u16b(0), ...u16b(0), ...u16b(0x21), ...u32b(c), ...u32b(data.length), ...u32b(data.length), ...u16b(nm.length), ...u16b(0), ...u16b(0), ...u16b(0), ...u16b(0), ...u32b(0), ...u32b(off)]), nm);
      off += head.length + nm.length + data.length;
    }
    const cdSize = central.reduce((s, x) => s + x.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16b(files.length), ...u16b(files.length), ...u32b(cdSize), ...u32b(off), 0, 0]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, x) => s + x.length, 0)); let p = 0;
    for (const x of all) { out.set(x, p); p += x.length; }
    return out;
  }
  function writeXlsx(sheets) {
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', rns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const files = [];
    files.push(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
    files.push(['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
    files.push(['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}" xmlns:r="${rns}"><sheets>${sheets.map((sh, i) => `<sheet name="${esc(sh.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`]);
    files.push(['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
    files.push(['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
    sheets.forEach((sh, i) => {
      const head = new Set(sh.head || [0]);
      const cols = (sh.widths || []).length ? `<cols>${sh.widths.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
      const rows = sh.rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
        if (v === null || v === undefined || v === '') return '';
        const ref = colName(c) + (r + 1), st = head.has(r) ? ' s="1"' : '';
        return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('')}</row>`).join('');
      files.push([`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}" xmlns:r="${rns}">${cols}<sheetData>${rows}</sheetData></worksheet>`]);
    });
    return zipStore(files);
  }

  const api = { FORMAT, FORMAT_BF, FIELDS_BF, parseBF, SHEET, FIELDS, KINDS, ETA0, MARGIN, LIFE0, TM_PER_TA, parse, readXlsx, readSheet, writeXlsx };
  root.PGDRequest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
