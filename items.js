/* 유성감속기 설계실 — 항목별 검토 페이지 정의 (globalThis.PGDItems)
   설계 공정 99개 항목(1-1 … 12-6, D1 … D6) 각각의 전용 페이지 내용.
   what / how / why : 이 항목에서 무엇을 정하는지, 어떻게(식·규격·절차) 정하는지, 왜 중요한지(틀리면 어디가 바뀌는지)
   rows : 데이터 출처별 행
     ['D', type, path, label, opt]  설계자 결정 입력 (type num|sel|chk|str)
     ['J', key, text]               설계자가 직접 확인할 사항 (체크)
     ['C', label, fn, basis]        수식 자동 계산 결과 (basis = 식·규격)
     ['M', type, path, label, opt]  실측·외부 데이터 입력 (시험·측정·카탈로그·데이터시트)
     ['A', type, path, label, opt]  가정값 입력
     ['P', label, fn, basis]        예측 모델 결과 (물리 모델·경험식 추정)
   opt : { st: 단별 반복({i}→단 번호, {s}→1부터), lk: 공유 링이면 2단 잠금, o: 선택지, t: 'numsel', if(D,i): 표시 조건, step }
   w : 이 페이지에 붙는 상세 표·도구 (app.js의 WIDGETS)
   up : 먼저 검토해야 할 선행 항목 (설계 지도의 상호작용과 합쳐서 씀)
   k : 판정 기준 설명 */
(function () {
  'use strict';
  const f = (x, d = 2) => Number.isFinite(x) ? (+x.toFixed(d)).toLocaleString('ko-KR') : (x === Infinity ? '∞' : '—');
  const fh = h => !Number.isFinite(h) ? (h === Infinity ? '∞' : '—') : h >= 1e6 ? f(h / 1e6, 1) + 'M' : h >= 1e4 ? f(h / 1e3, 0) + 'k' : f(h, 0);
  const S = c => c.R?.ctx?.stages || [];
  const per = (c, fn) => S(c).map((s, i) => `${i + 1}단 ${fn(s, i)}`).join(' · ') || '—';
  const chk = (c, name) => S(c).map(s => s.geo.checks.find(x => x.k === name)).filter(Boolean);
  const chv = (c, name, d = 3) => chk(c, name).map((x, i) => `${i + 1}단 ${typeof x.v === 'number' ? f(x.v, d) : x.v}`).join(' · ') || '—';
  const vd = (c, k) => { const x = c.R?.verdict?.find(v => (v.id || v.k) === k); return x ? (x.unit === 'h' ? fh(x.value) + ' h' : f(x.value, x.unit === '%' ? 1 : 2) + (x.unit ? ' ' + x.unit : '')) : '—'; };
  const rows = c => c.R?.rated?.rows || [];
  const mx = (c, k) => Math.max(...rows(c).map(r => r.f[k]));
  const mn = (c, k) => Math.min(...rows(c).map(r => r[k]));
  const ck = (c, id) => c.CK?.[id]?.val ?? c.it(id)?.val ?? '—';
  const rat = s => 1 + s.geo.r / s.st.s;
  const dsun = s => s.st.m * s.st.s / Math.cos(s.st.beta * Math.PI / 180);
  // 단별 토크 (출력 토크 T에서 거꾸로): 캐리어 i, 썬 i
  const trq = (c, T) => { const st = S(c), car = [], sun = []; let t = T; for (let i = st.length - 1; i >= 0; i--) { car[i] = t; sun[i] = t / rat(st[i]); t = sun[i]; } return { car, sun }; };
  const lay = c => { try { return globalThis.PGD3D ? PGD3D.layout(c.R, c.D) : null; } catch (e) { return null; } };
  const JO = [['integral', '일체'], ['spline', '스플라인'], ['key', '키'], ['press', '압입']];
  const yn = v => v ? '예' : '아니오';

  const I = {};
  // ============================================================== 1 요구사양
  I['1-1'] = { what: '로봇 관절 위치(상체·하체)와 축(롤·피치·요)에 맞는 하중 케이스를 고른다.',
    how: '케이스 표를 정격 토크에 비례해 적용 → 피크·비상 배수, 부하 스펙트럼, 관절 속도, 수명, 출력 베어링 외부 하중이 한 번에 채워진다. 이후 개별 값은 1-2~1-5에서 고친다.',
    why: '모든 강도·수명 판정의 하중 정의가 여기서 시작된다. 케이스가 실제와 다르면 뒤의 99개 판정이 모두 다른 하중으로 계산된다.',
    rows: [['D', 'num', 'req.Trated', '정격 출력토크 N·m'],
      ['P', '적용된 케이스', c => c.D.req.case && globalThis.PGD?.CASES?.[c.D.req.case] ? PGD.CASES[c.D.req.case].label : '사용자 정의', '케이스 표의 대표값 (로봇 관절 일반 비율)'],
      ['J', 'real', '실제 관절의 링크 길이·자중·가반하중으로 케이스 값이 맞는지 확인했다']],
    w: ['case'], k: '정격 토크가 0보다 크면 통과 (케이스 값의 타당성은 설계자 확인)' };
  I['1-2'] = { what: '정격·반복 피크·비상(충돌) 토크 세 가지 하중 수준을 정한다.',
    how: '정격 = 연속 운전 토크(피로 수명 판정), 피크 = 반복 가감속 최대(정적 안전율), 비상 = 충돌·급정지(1회 정적). 모터 정격 토크 × 감속비 × 효율이 감속기 정격 토크의 기준이다.',
    why: '정격은 기어·베어링 수명을, 피크·비상은 이 부러짐·핀·볼트·결합부를 정한다. 피크를 낮게 잡으면 정적 파손을, 높게 잡으면 과설계를 부른다.',
    rows: [['D', 'num', 'req.Trated', '정격 토크 N·m'], ['D', 'num', 'req.Tpeak', '반복 피크 토크 N·m'], ['D', 'num', 'req.Temerg', '비상·충돌 토크 N·m'],
      ['C', '피크 / 정격 · 비상 / 정격', c => `×${f(c.D.req.Tpeak / c.D.req.Trated, 2)} · ×${f(c.D.req.Temerg / c.D.req.Trated, 2)}`, '배수'],
      ['C', '모터축 환산 (정격 / 비상)', c => c.R?.ratio ? `${f(c.D.req.Trated / c.R.ratio, 3)} / ${f(c.D.req.Temerg / c.R.ratio, 3)} N·m` : '—', 'T / i (효율 무시)'],
      ['M', 'num', 'req.motorTmax', '모터 정격 토크 N·m (모터 데이터시트)'],
      ['C', '모터 정격 × 감속비', c => c.D.req.motorTmax && c.R?.ratio ? `${f(c.D.req.motorTmax * c.R.ratio, 1)} N·m (정격 ${c.D.req.Trated})` : '모터 정격 토크 미입력', 'Tmotor·i — 비상 토크가 이보다 작으면 모터가 감속기를 깰 수 있음'],
      ['J', 'emerg', '충돌·급정지 시 토크(모터 최대 × 감속비 또는 시험값)로 비상 토크를 정했다']],
    k: '정격 > 0, 피크 ≥ 정격, 비상 ≥ 피크', ok: c => c.D.req.Trated > 0 && c.D.req.Tpeak >= c.D.req.Trated && c.D.req.Temerg >= c.D.req.Tpeak && (!c.D.req.motorTmax || !c.R?.ratio || c.D.req.Temerg >= c.D.req.motorTmax * c.R.ratio * .9) };
  I['1-3'] = { what: '정격 입력 회전수(모터 rpm)와 그때의 관절 속도를 정한다.',
    how: '출력 rpm = 입력 rpm / 감속비. 반복수 N = 수명(h) × 60 × rpm 이 기어 수명계수(ZNT·YNT)와 베어링 L10 판정에 들어간다.',
    why: '회전수가 반복수를 정해 허용응력(수명계수)을 바꾸고, 피치선 속도로 Kv·유막·발열을 바꾼다.',
    rows: [['D', 'num', 'req.rpm', '정격 입력 회전수 rpm'],
      ['C', '출력 회전수 · 관절 속도', c => c.R?.ratio ? `${f(c.D.req.rpm / c.R.ratio, 2)} rpm · ${f(c.D.req.rpm / c.R.ratio * 6, 1)} °/s` : '—', 'n_out = n_in / i, ω = 6·n_out °/s'],
      ['C', '1단 썬 반복수 (목표 수명)', c => `${(c.D.req.lifeH * 60 * c.D.req.rpm).toExponential(2)} 회`, 'N = Lh × 60 × n'],
      ['J', 'duty', '관절 최대 속도와 정격 속도를 구분했다 (정격 = 수명 계산용 평균 속도)']],
    up: ['1-1'], k: '판정 없음 (요구값)' };
  I['1-4'] = { what: '운전 중 토크가 어떤 비율로 얼마나 오래 걸리는지(부하 스펙트럼)와 목표 수명을 정한다.',
    how: 'Miner 누적 손상: 구간별 토크 비율·시간 비율로 기어·베어링 수명을 합산한다. 등가 토크 Teq = (Σ tᵢ·Tᵢ³ / Σ tᵢ)^(1/3)로 대표 하중을 본다.',
    why: '정격 토크 일정 운전보다 실제 관절은 저부하 시간이 길다. 스펙트럼이 실제보다 가혹하면 과설계, 가벼우면 조기 파손이다.',
    rows: [['D', 'num', 'req.lifeH', '목표 수명 h'],
      ['A', 'duty', null, '부하 스펙트럼 (아래 표, 케이스 대표값 — 실제 운전 로그로 교체 권장)'],
      ['C', '등가 토크 (3승 평균)', c => { const d = c.D.req.duty || [], tt = d.reduce((s, l) => s + (l.time || 0), 0) || 1; return `${f(c.D.req.Trated * Math.cbrt(d.reduce((s, l) => s + (l.time || 0) * Math.pow(Math.abs(l.torque) / 100, 3), 0) / tt), 2)} N·m`; }, 'Teq = Trated·(Σ tᵢ·(Tᵢ/Trated)³ / Σ tᵢ)^(1/3)'],
      ['C', '스펙트럼 수명 (기어 최소)', c => vd(c, '부하 스펙트럼 수명 (기어)'), 'Miner 합, ISO 6336 S-N 기울기'],
      ['M', 'str', 'req.dutySrc', '실측 운전 로그 출처 (파일명·측정일)'],
      ['J', 'log', '모터 전류 로그 또는 동작 시뮬레이션으로 스펙트럼을 확인했다']],
    w: ['duty'], up: ['1-1', '1-2'], k: '판정은 5-11·10-2에서' };
  I['1-5'] = { what: '출력 플랜지에 걸리는 외부 하중 — 반경 Fr, 축 Fa, 모멘트 M — 을 정한다.',
    how: '케이스 비율(정격 토크 1 N·m당 N, N·m) 또는 링크 길이·가반하중 정역학으로 구한다. 스펙트럼 구간마다 토크 비율만큼 비례한다고 본다.',
    why: '출력 베어링 수명·정적 안전율·기울기(→ 2단 KHβ)를 정한다. 관절에서 모멘트가 가장 큰 하중일 때가 많다.',
    rows: [['A', 'num', 'req.ext.Fr', '반경 하중 Fr N'], ['A', 'num', 'req.ext.Fa', '축 하중 Fa N'], ['A', 'num', 'req.ext.M', '모멘트 M N·m'],
      ['C', '등가 하중 · L10', c => c.R?.outBearing ? `${f(c.R.outBearing.Peq, 0)} N · ${fh(c.R.outBearing.L10h)} h` : '—', 'P = X(Fr + 2000M/dp) + Y·Fa'],
      ['P', '출력 기울기 (정격)', c => c.R?.outBearing ? `${f(c.R.outBearing.tiltRated, 3)}′` : '—', 'M / 모멘트 강성 (롤러 분포 모델)'],
      ['J', 'link', '링크 길이·자중·가반하중으로 외부 하중을 계산해 케이스 값을 대체했다']],
    up: ['1-1'], k: '판정은 7-6에서' };
  I['1-6'] = { what: '감속기가 들어갈 공간의 최대 외경과 길이를 정하고, 현재 설계가 들어가는지 본다.',
    how: '3D 배치에서 외경 = max(플랜지, 하우징) × 2, 길이 = 입력 커버 ~ 출력 플랜지. 한계값과 비교.',
    why: '외경 한계가 링 외경 → 모듈·잇수, 출력 베어링 dp를 묶는다. 넘으면 3·7·8단계를 다시 해야 한다.',
    rows: [['D', 'num', 'req.Dmax', '외경 한계 Dmax mm'], ['D', 'num', 'req.Lmax', '길이 한계 mm'],
      ['C', '현재 외경 · 길이', c => c.CK['1-6'] ? `Ø${f(c.CK['1-6'].Dout, 1)} × ${f(c.CK['1-6'].Lt, 1)} mm` : '—', '3D 배치 (하우징·플랜지·커버)']],
    up: ['7-5', '8-1'], k: '외경 ≤ Dmax, 길이 ≤ Lmax (한계 입력 시)' };
  I['1-7'] = { what: '케이블이 지나갈 중공 지름을 정한다.',
    how: '중공 = 입력 중공축 내경. 입력 중공축 외경은 1단 썬 보어에 맞물리므로, 중공을 키우면 S1 보어 → S1 림 두께가 줄어든다.',
    why: '중공이 S1 림(4-1, D4)과 썬 지지 베어링 크기(7-4)를 묶는다.',
    rows: [['D', 'num', 'geom.inshaft.id', '중공 지름 mm (빈칸 = 자동)'],
      ['C', '적용 중공 지름', c => { const L = lay(c); return L ? `Ø${f(L.hollowR * 2, 1)} mm` : '—'; }, '1단 썬 보어 − 2 × 중공축 두께 1.8'],
      ['C', '1단 썬 보어', c => { const L = lay(c); return L ? `Ø${f(L.S[0].sunBore, 2)} mm` : '—'; }, '3D 배치'],
      ['J', 'cable', '통과 케이블·커넥터 최대 지름 + 여유로 중공을 정했다']],
    k: '판정은 D4(림 두께)에서' };
  I['1-8'] = { what: '허용 백래시와 비틀림 강성 목표를 정한다.',
    how: '백래시 = 치합 원주 유격을 출력축 각도(arcmin)로 환산한 모델값. 강성 = 치합 + 핀 + 캐리어 비틀림 직렬 합 (N·m/arcmin).',
    why: '로봇 위치 정밀도·제어 대역폭을 정한다. 강성 목표가 높으면 모듈·치폭·캐리어 형상이 커진다.',
    rows: [['D', 'num', 'req.backlashMax', '최대 백래시 arcmin'], ['D', 'num', 'req.stiffMin', '비틀림 강성 목표 N·m/arcmin'],
      ['P', '예측 백래시', c => c.R?.backlash ? `${f(c.R.backlash.arcmin, 2)} arcmin` : '—', '치합 유격 모델 (4-7 입력)'],
      ['P', '예측 비틀림 강성', c => c.R?.stiffness ? `${f(c.R.stiffness.NmPerArcmin, 1)} N·m/arcmin` : '—', '치합·핀·캐리어 직렬 강성 모델']],
    k: '예측 백래시 ≤ 목표, 예측 강성 ≥ 목표', ok: c => { const a = c.R?.backlash?.ok, b = c.D.req.stiffMin ? c.R?.stiffness?.NmPerArcmin >= c.D.req.stiffMin : true; return c.R?.backlash ? a && b : null; } };
  I['1-9'] = { what: '효율·소음·최고 온도 목표를 정한다.',
    how: '효율은 10-5 모델, 온도는 10-6 열평형과 비교한다. 소음은 계산 모델이 없어 정밀도 등급·물림률로 간접 관리한다.',
    why: '효율 목표가 모터 선정과 발열을, 온도가 윤활(5-10)과 실 수명을 정한다.',
    rows: [['D', 'num', 'req.effMin', '최소 효율 %'], ['D', 'num', 'req.noiseMax', '소음 목표 dB(A)'], ['D', 'num', 'req.Tmax', '최고 허용 표면 온도 °C'],
      ['P', '예측 효율 · 온도', c => `${vd(c, '효율 (정격, 추정)')} · ${c.CK['10-6'] ? f(c.CK['10-6'].T, 1) + ' °C' : '—'}`, '10-5 효율 모델 · 10-6 열평형'],
      ['J', 'noise', '소음은 시험으로만 판정 — 정밀도 등급(4-5)과 물림률(4-2)로 관리하기로 했다']],
    k: '효율 ≥ 목표 (온도 목표 입력 시 온도도)', ok: c => { const e = c.R?.verdict?.find(v => v.k === '효율 (정격, 추정)'); if (!e) return null; return e.ok && (!c.D.req.Tmax || !c.CK['10-6'] || c.CK['10-6'].T <= c.D.req.Tmax); } };

  // ============================================================== 2 구조 개념
  I['2-1'] = { what: '감속 단수(1단·2단)를 정한다.',
    how: '1단 유성은 실용 감속비 3~10, 9:1 이상은 2단이 부피·효율에서 유리. 단수가 정해지면 구성 부품(S·P·R·C)이 정해진다.',
    why: '단수가 부품 수·길이·효율·원가를 크게 바꾼다. 2단이면 C1–S2 결합(2-5)과 C1 지지(2-7) 문제가 생긴다.',
    rows: [['D', 'sel', 'config.stages', '단수', { o: [[1, '1단'], [2, '2단']], t: 'numsel' }],
      ['C', '총 감속비', c => c.R?.ratio ? `${f(c.R.ratio, 4)} : 1` : '—', 'i = Π (1 + zr/zs)'],
      ['J', 'one', '1단으로 목표 감속비·외경을 만족할 수 있는지 먼저 검토했다']],
    w: ['components'], k: '판정 없음 (구조 결정)' };
  I['2-2'] = { what: '총 감속비를 1·2단에 어떻게 나눌지 본다.',
    how: '단 감속비 i = 1 + zr/zs (링 고정·썬 입력·캐리어 출력). 1단에 큰 비를 주면 2단 토크가 작아져 2단 부품이 작아진다. 공유 링이면 두 단 링 잇수가 같다.',
    why: '감속비 분배가 단별 토크(5-1)와 단별 부품 크기를 정한다.',
    rows: [['C', '단별 감속비', c => per(c, s => f(rat(s), 3)), 'iᵢ = 1 + zrᵢ/zsᵢ'], ['C', '총 감속비', c => c.R?.ratio ? `${f(c.R.ratio, 4)} : 1` : '—', 'Π iᵢ']],
    w: ['ratio'], up: ['2-1', '3-2'], k: '판정 없음 (3-5에서 오차 판정)' };
  I['2-3'] = { what: '1·2단이 링기어 하나(R1-2)를 같이 쓸지 정한다.',
    how: '공유하면 2단의 모듈·비틀림각·압력각·유성 잇수가 1단 링에 맞춰 고정되고(2단 zs만 다름), 링 가공이 1회로 줄고 하우징이 짧아진다.',
    why: '공유 링은 원가·길이에서 유리하지만 2단 설계 자유도가 줄고, 링 응력이 두 단 반력 합이 된다. 공유 링은 분할하지 않는다.',
    rows: [['D', 'chk', 'config.sharedRing', '1·2단 링기어 공유'],
      ['C', '링 반력 토크 (피크)', c => { const t = trq(c, c.D.req.Tpeak); return S(c).map((s, i) => `${i + 1}단 ${f(t.car[i] - t.sun[i], 1)}`).join(' · ') + ' N·m'; }, 'T_ring = T_carrier − T_sun']],
    up: ['2-1'], k: '판정 없음 (구조 결정)' };
  I['2-4'] = { what: '링기어를 하우징에 어떻게 붙일지(일체·압입·볼트) 정한다.',
    how: '일체 = 강 하우징에 링 직접 가공. 압입 = Lamé 두꺼운 원통 식으로 면압·전달 토크 계산(치수는 8-2). 볼트 = 마찰 전달.',
    why: '링 반력 토크를 하우징이 받는 경로다. 압입은 링을 수축시켜 백래시를 줄이고(4-7), 하우징 재질·가공 방식(D1)을 정한다.',
    rows: [['D', 'sel', 'struct.ringHousing', '링–하우징 결합', { o: [['integral', '일체 (강 하우징)'], ['press', '압입'], ['bolt', '볼트']] }],
      ['C', '전달 능력', c => ck(c, '2-4'), '압입: T = μ·p·π·d·L·d/2 · 볼트: n·F·μ·r'],
      ['C', '링 반력 → 요구 토크', c => { const J = c.CK?.['8-2']?.J || c.CK?.['2-4']?.J, RR = c.CK?.['8-2']?.RR; if (!RR) return '—'; const sg = x => (x >= 0 ? '+' : '−') + f(Math.abs(x), 2); return `단별 ${RR.stages.map(x => `${x.stage}단 ${sg(x.ring)}`).join(' · ')} N·m` + (J ? ' · ' + J.map(j => `${j.name} ${j.shared ? '합계 ' : ''}${sg(j.T)} × 1.5 = 요구 ${f(j.need, 2)} / 전달 ${f(j.Tcap, 2)} N·m`).join(' · ') : ''); }, 'T_ring,i = T_car,i − T_sun,i (피크, 부호 유지) · 공용 링 = 단별 반력의 합 · 분리 링 = 링마다 · 요구 = 1.5 × |합계|'],
      ['J', 'path', '링 반력이 하우징 → 고정부로 가는 경로를 확인했다']],
    k: '전달 토크 ≥ 1.5 × |링 반력| (공용 링은 1·2단 반력을 부호대로 더한 값)' };
  I['2-5'] = { what: '1단 캐리어(C1)와 2단 썬(S2)을 어떻게 연결할지 정한다.',
    how: '일체 / 스플라인 / 키 / 압입. 전달 능력을 피크 S2 토크와 비교한다. 스플라인 유격은 S2가 유성 사이에서 자리 잡게 해 2단 Kγ를 낮춘다.',
    why: '2단 입력 토크가 전부 이 결합부를 지난다. 유격 유무가 2단 하중분배(5-6)를 바꾼다.',
    rows: [['D', 'sel', 'struct.c1s2', '결합 방식', { o: [...JO, ['pin', '핀 결합 (다웰 + 파일럿)']] }], ['D', 'num', 'struct.c1s2Dim.d', '결합(파일럿) 지름 mm (빈칸 = S2 보어)'], ['D', 'num', 'struct.c1s2Dim.L', '결합 길이 mm (빈칸 = 치폭)'],
      ['D', 'num', 'struct.c1s2Dim.n', '핀 수', { if: D => D.struct.c1s2 === 'pin', step: 1 }], ['D', 'num', 'struct.c1s2Dim.dp', '핀 지름 mm', { if: D => D.struct.c1s2 === 'pin' }], ['D', 'num', 'struct.c1s2Dim.pcd', '핀 PCD mm', { if: D => D.struct.c1s2 === 'pin' }],
      ['A', 'num', 'struct.c1s2Dim.p', '압입 면압 MPa (압입 시)', { if: D => D.struct.c1s2 === 'press' }],
      ['C', '전달 능력 / 피크', c => ck(c, '2-5'), '핀: n·(π/4)dp²·τ150·PCD/2, 스플라인: (π/8)d²L·0.75·τ, 키: 전단 60·면압 100 MPa, 압입: μpπdL·d/2']],
    up: ['2-1'], k: '전달 토크 ≥ 피크 S2 토크' };
  I['2-6'] = { what: '1단 썬(S1)을 모터축에 어떻게 연결할지 정한다.',
    how: '일체(모터축에 직접 치형) / 키 / 압입 / 클램프 / 스플라인. 전달 능력을 피크 S1 토크와 비교.',
    why: '일체는 가장 작지만 모터축 가공·호브 도피(D2)가 필요하다. 키·클램프는 S1 보어 → 중공(1-7)·S1 림을 묶는다.',
    rows: [['D', 'sel', 'struct.s1motor', '결합 방식', { o: [...JO, ['clamp', '클램프'], ['flange', '볼트 플랜지']] }],
      ['D', 'num', 'struct.s1Dim.n', '볼트 수', { if: D => D.struct.s1motor === 'flange', step: 1 }], ['D', 'num', 'struct.s1Dim.bd', '볼트 호칭 M', { if: D => D.struct.s1motor === 'flange' }], ['D', 'num', 'struct.s1Dim.pcd', '볼트 PCD mm', { if: D => D.struct.s1motor === 'flange' }], ['D', 'num', 'struct.s1Dim.d', '축 지름 mm (빈칸 = S1 보어)'], ['D', 'num', 'struct.s1Dim.L', '결합 길이 mm'],
      ['A', 'num', 'struct.s1Dim.p', '면압 MPa (압입·클램프)', { if: D => ['press', 'clamp'].includes(D.struct.s1motor) }],
      ['C', '전달 능력 / 피크', c => ck(c, '2-6'), '볼트 플랜지: n·0.6σy·As·μ0.15·PCD/2 (12.9 가정), 그 외 2-5와 같은 식']],
    k: '전달 토크 ≥ 피크 S1 토크' };
  I['2-7'] = { what: '썬과 1단 캐리어(C1)를 반경 방향으로 무엇이 받치는지 정한다.',
    how: '썬은 플로팅이 아니라 지지 베어링(7-4)으로 받친다. 2단에서 C1에 지지 베어링이 없으면 S2 위치가 유성 맞물림에만 의존 = 사실상 플로팅이 된다.',
    why: '지지 강성·유격이 유성 하중분배 Kγ(5-6)를 직접 정한다. 플로팅 불가 조건이므로 C1 지지 없음은 게이트 2 미달이다.',
    rows: [['D', 'sel', 'struct.c1Support', 'C1 지지 베어링', { o: [['none', '없음 (유성 위에 얹힘)'], ['out', '출력측 1개'], ['both', '양측'], ['nested', 'S2 양측 (S1 보어·C2 보어 안 베어링)']] }],
      ['D', 'sel', 'loads.sunSupport.{i}.mode', '{s}단 썬 지지 산정 방식', { st: 1, o: [['structure', '구조 (베어링 ⊕ 축)'], ['direct', '직접 입력']] }],
      ['P', '썬 지지 강성', c => S(c).map((s, i) => { try { return `S${i + 1} ${f(globalThis.PGD.sunSupportK(c.D, i).k, 1)} N/µm`; } catch (e) { return ''; } }).join(' · '), '베어링 반경 강성 ⊕ 중공축 굽힘 (7-4 입력)'],
      ['C', '구속 상태', c => c.CK['gate-2']?.val || '—', '모든 회전 부품에 반경 지지가 있는가']],
    up: ['2-1'], k: '2단이면 C1 지지 필요 (없으면 플로팅)' };
  I['2-8'] = { what: '출력 메인 베어링(크로스 롤러)을 축방향 어디에 두고, 마지막 캐리어(C2)를 출력 플랜지·내륜에 어떻게 결합할지 정한다.',
    how: '위치: 2단 기어 폭 안 / 출력측 바깥 / 출력 플랜지 쪽. 외부 모멘트 → 베어링 기울기 → C2 기울기 → 2단 KHβ 경로를 본다. 결합: 일체 / 볼트 / 다웰 핀 / 압입 — 출력 토크 전부(피크 × 1.5)를 전달하고, 볼트는 외부 모멘트·축하중(비상 비율)에 벌어지지 않아야 한다(체결력 / 볼트당 하중 ≥ 1.5).',
    why: '베어링이 2단 치폭 중심에서 멀수록 외부 모멘트가 2단 치합 정렬을 더 흔든다(5-4). 길이(1-6)도 바뀐다.',
    rows: [['D', 'sel', 'struct.obPos', '출력 베어링 위치', { o: [['inside', '2단 기어 폭 안'], ['outside', '2단 출력측 바깥'], ['flange', '출력 플랜지 쪽']] }],
      ['D', 'sel', 'struct.c2out', 'C2 ↔ 출력 플랜지·내륜 결합', { o: [['integral', '일체 (C2 = 내륜·플랜지)'], ['flange', '볼트 체결'], ['pin', '다웰 핀'], ['press', '압입']] }],
      ['D', 'num', 'struct.c2outDim.n', '볼트·핀 수', { if: D => ['flange', 'pin'].includes(D.struct.c2out), step: 1 }], ['D', 'num', 'struct.c2outDim.bd', '볼트 호칭 M', { if: D => D.struct.c2out === 'flange' }], ['D', 'num', 'struct.c2outDim.dp', '핀 지름 mm', { if: D => D.struct.c2out === 'pin' }],
      ['D', 'num', 'struct.c2outDim.pcd', 'PCD mm (빈칸 = 베어링 dp − 2.5·Dw)', { if: D => ['flange', 'pin'].includes(D.struct.c2out) }], ['D', 'num', 'struct.c2outDim.d', '압입 지름 mm', { if: D => D.struct.c2out === 'press' }], ['D', 'num', 'struct.c2outDim.L', '압입 길이 mm', { if: D => D.struct.c2out === 'press' }],
      ['D', 'str', 'struct.obFit.inner', '내륜–보스(출력축) 공차 (빈칸 = 기준 h7)'], ['D', 'str', 'struct.obFit.outer', '외륜–하우징 보어 공차 (빈칸 = 기준 H7)'],
      ['C', '출력 베어링 결합 (내륜 · 외륜)', c => { const F = c.CK?.['2-8']?.fit; if (!F) return '—'; const SL = { ok: '충족', fail: '미달', input: '입력 필요', na: '해당 없음' }; return [['내륜–' + F.inner.part, F.inner], ['외륜–하우징', F.outer]].map(([n, g]) => `${n} ${SL[g.status]}: ` + g.checks.map(x => `${x.label} ${SL[x.status]}`).join(', ')).join(' · ') + ` · ${F.rotation}`; }, '안착 지름·길이 = 베어링 내경·폭, 벽 두께 ≥ 하우징 벽, 축방향 어깨·커버 걸림 ≥ 0.5 mm, 끼워맞춤 공차는 입력값'],
      ['C', 'C2 결합 전달·벌어짐', c => ck(c, '2-8'), '볼트: n·0.6σy·As·μ0.15·PCD/2 ≥ 1.5·Tpeak, 체결력 / (4M/(n·PCD) + Fa/n) ≥ 1.5 · 핀: n·(π/4)dp²·150·PCD/2'],
      ['P', '출력 베어링 기울기 → fsh', c => rows(c).length ? `${f(c.R.outBearing?.tiltRated, 3)}′ → ${f(Math.max(...rows(c).map(r => r.f.fshOB || 0)), 2)} µm` : '—', '롤러 분포 모델 기울기 × 치폭'],
      ['J', 'asm', '선택한 위치에서 조립 순서(8-7)가 성립하는지 확인했다']],
    up: ['1-5'], k: 'C2 결합 전달 ≥ 1.5 × 피크 · 볼트 벌어짐 여유 ≥ 1.5 (베어링 판정은 7-6·5-4)' };
  I['2-9'] = { what: '단별 유성기어 개수(3·4·5…)를 정한다.',
    how: '개수가 많을수록 유성당 하중은 줄지만 하중분배 Kγ가 커지고, 조립 조건 (zs+zr)/n = 정수와 인접 간섭이 까다로워진다.',
    why: '강도(하중 분할)와 Kγ(5-6), 조립 조건(3-3), 인접 간섭(3-4)이 동시에 바뀐다.',
    rows: [['D', 'sel', 'stages.{i}.n', '{s}단 유성 개수', { st: 1, o: [2, 3, 4, 5, 6].map(v => [v, v + '개']), t: 'numsel' }],
      ['C', '조립 조건 (zs+zr)/n', c => chv(c, '등간격 조립 (S+R)/Np', 2), '정수여야 등간격 조립'], ['P', 'Kγ', c => (c.R?.rated?.stages || []).map((s, i) => `${i + 1}단 ${f(s.Kg, 3)}`).join(' · ') || '—', '하중분배 모델 (5-6)']],
    k: '판정은 3-3·3-4에서' };
  I['2-10'] = { what: '토크·반력·반경 지지·외부 모멘트가 어떤 부품을 거쳐 가는지 하중 경로를 그린다.',
    how: '2-4~2-8의 구조 선택으로 경로를 자동 작성한다. 모든 회전 부품이 반경·축방향으로 구속되는지 본다.',
    why: '빠진 지지(플로팅)나 이중 구속(과구속)을 여기서 잡지 못하면 강도 계산 전제가 틀린다.',
    rows: [['C', '구속 판정', c => ck(c, '2-10'), '경로 자동 작성'],
      ['J', 'dof', '각 부품의 반경·축방향·기울기 구속을 하나씩 확인했다 (과구속 없음)'], ['J', 'axial', '헬리컬 추력(3-8)의 축방향 경로를 확인했다']],
    up: ['2-4', '2-5', '2-6', '2-7', '2-8'], k: '모든 회전 부품에 반경 지지' };

  // ============================================================== 3 기어 제원
  I['3-1'] = { what: '링 잇수 후보를 본다.',
    how: '표준 잇수는 zr = zs + 2·zp로 계산한다. 링 잇수를 직접 지정한 경우 전위와 중심거리 일치를 확인한다. 링 피치원 = m·zr / cosβ 가 외경 한계(1-6)를 정한다.',
    why: '링 잇수가 감속비와 외경을 동시에 정한다.',
    rows: [['D', 'num', 'stages.{i}.r', '{s}단 링 잇수 (빈칸 = 자동)', { st: 1, lk: 1, step: 1 }],
      ['C', '링 잇수', c => per(c, s => `R ${s.geo.r}`), '직접 입력 또는 zr = zs + 2zp'], ['C', '링 피치원', c => per(c, s => `Ø${f(s.geo.parts[2]?.d, 2)}`), 'd = m·z / cosβ']],
    w: ['finder'], up: ['1-6'], k: '판정 없음' };
  I['3-2'] = { what: '단별 썬·유성 잇수를 정한다.',
    how: '목표 단 감속비에 맞는 (zs, zp) 조합을 조립 조건·인접 간섭과 함께 탐색기로 찾는다. 공유 링을 자동으로 계산하면 2단 유성 잇수도 연동된다. 링 잇수를 직접 지정한 경우 단별 유성 잇수를 입력한다.',
    why: '잇수가 감속비·조립·간섭·물림률·언더컷을 모두 정한다. 3·4단계 검사가 전부 잇수에 걸려 있다.',
    rows: [['D', 'num', 'stages.{i}.s', '{s}단 썬 잇수', { st: 1, step: 1 }], ['D', 'num', 'stages.{i}.p', '{s}단 유성 잇수', { st: 1, step: 1, lk: D => D.stages[0].r == null }],
      ['C', 'S / P / R', c => per(c, s => `${s.st.s}/${s.st.p}/${s.geo.r}`), '']],
    w: ['finder', 'gear3d'], up: ['2-2', '2-9'], k: '판정은 3-3·3-4·4-x에서' };
  I['3-3'] = { what: '유성을 등간격으로 조립할 수 있는지 본다.',
    how: '(zs + zr) / n 이 정수여야 모든 유성이 같은 위상으로 썬·링에 물린다.',
    why: '정수가 아니면 등간격 배치가 불가능해 조립이 안 되거나 비등간격 배치(진동)가 된다.',
    rows: [['C', '(zs+zr)/n', c => chv(c, '등간격 조립 (S+R)/Np', 2), '정수 판정']], w: [['checks', '등간격 조립 (S+R)/Np']], up: ['3-2', '2-9'], k: '정수' };
  I['3-4'] = { what: '이웃한 유성기어끼리 이끝이 부딪히지 않는지 본다.',
    how: '이끝 간격 = 2·a·sin(π/n) − da_p. a = 작용 중심거리, da_p = 유성 이끝원.',
    why: '간격이 0 이하면 조립 불가, 작으면 윤활제 교반 손실이 커진다.',
    rows: [['C', '인접 이끝 간격', c => chv(c, '인접 유성 이끝 간격 (mm)') + ' mm', '2a·sin(π/n) − da']], w: [['checks', '인접 유성 이끝 간격 (mm)']], up: ['3-2', '2-9'], k: '간격 > 0 (권장 ≥ 0.5 mm)' };
  I['3-5'] = { what: '실제 감속비가 목표에 맞는지 본다.',
    how: '오차 = |i − i_target| / i_target.',
    why: '모터 속도·제어 게인이 감속비 기준이다. 1 % 넘으면 제어 측과 합의가 필요하다.',
    rows: [['D', 'num', 'req.ratio', '목표 감속비 i'], ['C', '감속비 오차', c => ck(c, '3-5'), '|i − i₀| / i₀']], up: ['2-2'], k: '오차 ≤ 1 %' };
  I['3-6'] = { what: '모듈을 정하고, 필요 안전율을 맞추는 최소 모듈을 역산한다.',
    how: '피팅: σH ∝ 1/d → SH ∝ m, 굽힘: σF ∝ 1/(m·b) → SF ∝ m² 근사. 필요 m = max(m·SH목표/SH, m·√(SF목표/SF)) → ISO 54 규격 모듈로 올림.',
    why: '모듈이 강도·외경·호브 공구(D2)를 동시에 정한다. 필요 모듈이 현재보다 크면 재료(9-1)나 치폭(3-7)으로 메워야 한다.',
    rows: [['D', 'num', 'stages.{i}.m', '{s}단 치직각 모듈 mm', { st: 1, lk: 1 }], ['C', '필요 모듈', c => ck(c, '3-6'), 'SH ∝ m, SF ∝ m² 근사 역산']],
    up: ['5-7', '5-8', '9-1'], k: '현재 모듈 ≥ 필요 모듈' };
  I['3-7'] = { what: '치폭을 정한다.',
    how: '치폭비 b/d(썬 피치원 기준)를 0.5~1.2 범위로 본다. 치폭이 클수록 강도는 늘지만 치폭 방향 하중 분포(KHβ)가 나빠진다.',
    why: '치폭이 강도·핀 길이(6-5 처짐)·감속기 길이(1-6)를 정한다.',
    rows: [['D', 'num', 'stages.{i}.b', '{s}단 치폭 mm', { st: 1 }], ['C', 'b/d', c => per(c, s => f(s.st.b / dsun(s), 2)), 'b / d_sun']],
    up: ['5-7'], k: 'b/d ≤ 1.2 (0.3 미만이면 외경 대비 치폭이 작아 강도 여유가 적음 — 참고)', ok: c => S(c).length ? S(c).every(s => s.st.b / dsun(s) <= 1.2) : null };
  I['3-8'] = { what: '비틀림각(헬리컬)을 정한다.',
    how: '축방향 물림률 εβ = b·sinβ / (π·m). εβ ≥ 1이면 물림이 매끄럽고, 0 < εβ < 1은 이점이 적다. 헬리컬은 축방향 추력을 만든다.',
    why: '소음·강도(εβ)를 올리지만 추력(7-7·6-6)과 헬리컬 링 가공 공구(D2) 부담이 생긴다.',
    rows: [['D', 'num', 'stages.{i}.beta', '{s}단 비틀림각 °', { st: 1, lk: 1 }], ['C', 'εβ', c => chv(c, '축방향 물림률 εβ', 3), 'εβ = b·sinβ / (π·mn)'],
      ['C', '축방향 추력 (정격, 썬–유성)', c => { const t = trq(c, c.D.req.Trated); return per(c, (s, i) => `${f(2000 * t.sun[i] / dsun(s) * Math.tan(s.st.beta * Math.PI / 180), 0)} N`); }, 'Fa = Ft·tanβ']],
    k: 'εβ = 0 또는 ≥ 1' };
  I['3-9'] = { what: '전위계수·압력각과 썬·유성 보어, 링 외경(림)을 정한다.',
    how: '외접(S–P)과 내접(P–R) 작용 중심거리가 같아야 한다. 링 전위 자동이면 일치시키도록 계산. 공용 링이면 링(잇수·전위·치두께·모따기·재료)은 1단에서만 정하고, 2단은 그 링에 맞춰 유성 전위를 자동 조정하거나(입력 보존 시) 중심거리 차를 보여준다. 전위 지도에서 가능 영역(언더컷·이끝 두께 0.4m·내접 간섭·간극·유성 간격·εα ≥ 1.2)을 보고, 미끄럼률 균형 / 허용 토크 최대 / 굽힘 균형으로 자동 추천받을 수 있다. 림 두께가 이 높이 대비 부족하면 YB > 1로 굽힘 응력이 커진다.',
    why: '전위가 언더컷·이끝 두께(4-1)·내접 간섭(4-4)·굽힘 강도(5-8)를, 보어가 림(D4)·핀(6-4)·니들(7-2)을 묶는다.',
    rows: [['D', 'num', 'stages.{i}.alpha', '{s}단 압력각 °', { st: 1, lk: 1 }], ['D', 'num', 'stages.{i}.xs', '{s}단 썬 전위', { st: 1 }], ['D', 'num', 'stages.{i}.xp', '{s}단 유성 전위', { st: 1, lk: D => D.stages[1]?.autoPlanetShift !== false }],
      ['D', 'chk', 'stages.{i}.autoPlanetShift', '{s}단 유성 전위 자동 (공용 링 치형 고정, 중심거리 일치)', { st: 1, if: (D, i) => i === 1 && D.config.sharedRing && D.config.stages > 1 }],
      ['D', 'chk', 'stages.{i}.autoRingShift', '{s}단 링 전위 자동', { st: 1, lk: 1 }], ['D', 'num', 'stages.{i}.xr', '{s}단 링 전위', { st: 1, lk: 1, if: (D, i) => !D.stages[i].autoRingShift }],
      ['D', 'num', 'stages.{i}.sunBore', '{s}단 썬 보어 mm (0 중실, 빈칸 자동)', { st: 1 }], ['D', 'num', 'stages.{i}.planetBore', '{s}단 유성 보어 mm (빈칸 자동)', { st: 1 }],
      ['D', 'num', 'stages.{i}.ringOD', '{s}단 링 외경 mm (빈칸 자동)', { st: 1, if: (D, i) => !(i === 1 && D.config.sharedRing) }],
      ['C', '외접·내접 중심거리 차', c => chv(c, '외접·내접 중심거리 차 (mm)', 4) + ' mm', 'a_w(S–P) − a_w(P–R)']],
    w: ['geo', 'shiftmap', 'rims'], up: ['3-2', '6-4'], k: '중심거리 차 ≈ 0' };

  // ============================================================== 4 치형·정밀도
  I['4-1'] = { what: '언더컷과 이끝 첨예(이끝이 뾰족해짐)를 검사한다.',
    how: '언더컷 한계 잇수 = 2(1 − x)/sin²α, 이끝 두께 sa ≥ 0.25·m 권장 (ISO 21771 인볼류트 기하).',
    why: '언더컷은 이뿌리를 약하게 하고 물림률을 줄이며, 뾰족한 이끝은 열처리 때 깨진다.',
    rows: [['C', '이끝 두께', c => ['썬', '유성', '링'].map(n => `${n} ${chv(c, n + ' 이끝 두께 (mm)')}`).join(' / ') + ' mm', 'sa = da·(s/d + inv αt − inv αa)']],
    w: [['checks', '외접 언더컷', '썬 이끝 두께 (mm)', '유성 이끝 두께 (mm)', '링 이끝 두께 (mm)']], up: ['3-9'], k: '언더컷 없음, sa ≥ 0.25m' };
  I['4-2'] = { what: '정면 물림률 εα를 검사한다.',
    how: 'εα = 작용선 물림 길이 / 기초 피치. 외접·내접 각각. 이끝 모따기 hK(45°)가 있으면 이끝원 대신 유효 이끝원 dFa = da ∓ 2·hK로 계산한다 (KISSsoft 동일).',
    why: 'εα < 1.2면 하중이 한 이에 몰리는 구간이 길어 강도·소음이 나빠진다. 링 이끝 모따기는 εα·Zε·cγα와 유성 링쪽 하중점(YF)을 바꾼다.',
    rows: [['D', 'num', 'stages.{i}.tipChamfer.0', '{s}단 썬 이끝 모따기 hK mm (45°, 빈칸 = 0)', { st: 1 }], ['D', 'num', 'stages.{i}.tipChamfer.1', '{s}단 유성 이끝 모따기 hK mm', { st: 1 }], ['D', 'num', 'stages.{i}.tipChamfer.2', '{s}단 링 이끝 모따기 hK mm', { st: 1, lk: 1 }],
      ['C', 'εα (S–P · P–R)', c => `${chv(c, '썬–유성 εα')} / ${chv(c, '유성–링 εα')}`, 'εα = (√(rFa₁²−rb₁²) ± √(rFa₂²−rb₂²) − a·sinαw) / pbt']],
    w: [['checks', '썬–유성 εα', '유성–링 εα']], up: ['3-9'], k: 'εα ≥ 1.2' };
  I['4-4'] = { what: '내접(유성–링) 치합의 간섭을 검사한다.',
    how: '내접 인볼류트 간섭·트로코이드 간섭 여유, 이끝·이뿌리 최소 간극을 본다.',
    why: '내접 간섭은 조립 자체를 막거나 링 이끝을 깎는다. 전위·잇수 차로 조정한다.',
    rows: [['C', '간섭 여유', c => chv(c, '내접 인볼류트 간섭 여유'), 'ISO 21771 내접 조건'], ['C', '최소 간극', c => chv(c, '이끝·이뿌리 최소 간극 (mm)') + ' mm', 'c ≥ 0.1·m 권장'],
      ['D', 'num', 'stages.{i}.cutter.z0', '{s}단 링 가공 피니언 커터 잇수 z0 (빈칸 = 링 잇수 × 0.33)', { st: 1, step: 1 }], ['D', 'num', 'stages.{i}.cutter.x0', '{s}단 커터 전위 x0 (빈칸 = 0)', { st: 1 }],
      ['C', '링 치근 형상 (커터 생성)', c => rows(c).filter(r => r.part === 2).map(r => `${r.stage}단 YF ${f(r.f.YF, 3)} · YS ${f(r.f.YS, 3)} · sFn ${f(r.f.sFn, 3)} · ρF ${f(r.f.rhoF, 3)} · hFe ${f(r.f.hFe, 3)} mm`).join(' / ') || '—', 'ISO 6336-3:2019 내치, 60° 접선']],
    w: [['checks', '내접 인볼류트 간섭 여유', '이끝·이뿌리 최소 간극 (mm)']], up: ['3-9'], k: '여유 > 0, 간극 > 0' };
  I['4-5'] = { what: '기어 정밀도 등급(ISO 1328, JIS N)을 정한다.',
    how: '강도 계산(이론)은 오차 0인 완전한 기어로 한다. 등급에서 나오는 공차(fp, ffα, fHβ)는 11-1 시편 시뮬레이션에서 시편마다 무작위 오차로 뽑혀 Kv·KHβ·KHα·Kγ에 들어간다. 등급 입력도 11-1에 있다.',
    why: '등급 한 단계가 실제 시편의 강도 분포와 가공 원가(D3)를 바꾼다. 가공처가 달성할 수 있는 등급이어야 한다.',
    rows: [['C', '정밀도 등급 (입력은 11-1)', c => c.D.stages.slice(0, c.D.config.stages).map((s, i) => `${i + 1}단 N${s.grade}`).join(' · '), '이론 계산에는 영향 없음 · 시편 시뮬레이션 공차'],
      ['M', 'str', 'dfm.capability', '가공처 공정능력 (측정 성적서 등급)'], ['J', 'cap', '가공처 기어 측정 성적서로 등급 달성을 확인했다']],
    w: ['tol'], k: '판정 없음 (5단계 계수로 반영)' };
  I['4-6'] = { what: '치형·리드 수정(크라우닝, 치끝 수정)을 정한다.',
    how: '리드 크라우닝은 잇줄 오정렬을 흡수해 KHβ를 줄인다. 근거 수준(fZCa)은 수정량이 하중 변형 해석으로 정해졌는지에 따라 1.20 / 1.07 / 1.00.',
    why: '크라우닝이 과하면 접촉 폭이 줄어 응력이 오르고, 부족하면 끝단 접촉이 생긴다.',
    rows: [['D', 'num', 'stages.{i}.mod.crown', '{s}단 리드 크라우닝 µm', { st: 1 }], ['D', 'num', 'stages.{i}.mod.tip', '{s}단 치끝 수정 µm', { st: 1 }],
      ['A', 'sel', 'stages.{i}.mod.verified', '{s}단 수정 근거 수준 (헬리컬 ZB·ZD의 fZCa)', { st: 1, if: (D, i) => D.stages[i].beta > 0, o: [['none', '근거 없음 · 1.20'], ['qualified', '하중 하 적합 계산 · 1.07'], ['uniform', '3D 균일 접촉 확인 · 1.00']] }],
      ['C', 'fZCa → ZB / ZD (썬–유성)', c => (c.R?.ctx?.stages || []).map((s, i) => { const ms = s.geo.meshes[0]; return s.st.beta > 0 ? `${i + 1}단 fZCa ${f(ms.fZCa, 2)} → ZB ${f(ms.ZB, 3)} / ZD ${f(ms.ZD, 3)}` : `${i + 1}단 스퍼 — 적용 안 됨`; }).join(' · ') || '—', 'ISO 6336-2:2019 6.2: 헬리컬(εα ≤ 2)의 단일 맞물림 계수에만 들어감'],
      ['C', 'KHβ (최대)', c => rows(c).length ? f(mx(c, 'KHb'), 3) : '—', 'ISO 6336-1 부록 E']],
    up: ['4-5'], k: '판정은 5-4에서' };
  I['4-7'] = { what: '치두께 공차로 백래시를 정하고, 가공 검사용 걸치기 이두께·오버볼 치수를 낸다.',
    how: '치두께 공차(Asn 상·하한)와 중심거리 공차로 치합 백래시 범위를 계산하거나 직접 입력하고, 출력축 각도로 환산해 합산한다. 같은 치두께로 걸치기 이두께 Wk와 오버볼 치수 MdK를 계산한다 (KISSsoft 11.2–11.5와 같은 식). 링 압입 수축(8-2)은 백래시를 줄인다.',
    why: '백래시 0은 열팽창·편심에서 걸림을, 과대는 위치 정밀도 저하(1-8)를 부른다.',
    rows: [['D', 'num', 'stages.{i}.asn.0.1', '{s}단 썬 치두께 하한 치수차 Asn.i mm (예 −0.084, 빈칸 = 0)', { st: 1 }], ['D', 'num', 'stages.{i}.asn.1.1', '{s}단 유성 Asn.i mm', { st: 1 }], ['D', 'num', 'stages.{i}.asn.2.1', '{s}단 링 Asn.i mm', { st: 1, lk: 1 }],
      ['C', '치근 계산 전위 xE (가장 얇은 이)', c => rows(c).filter((r, k, a) => a.findIndex(q => q.stage === r.stage && q.part === r.part) === k).map(r => `${r.stage}단 ${r.partName} ${f(r.f.xE, 4)}`).join(' · ') || '—', 'xE = x + Asn.i / (2·mn·tan αn) · KISSsoft와 같음'],
      ['D', 'sel', 'stages.{i}.blMode', '{s}단 백래시 산출', { st: 1, o: [['jt', '직접 입력 (µm)'], ['asn', '치두께 공차 + 중심거리 공차로 계산']] }],
      ['D', 'num', 'stages.{i}.jt.0', '{s}단 썬–유성 백래시 µm (직접 입력)', { st: 1 }], ['D', 'num', 'stages.{i}.jt.1', '{s}단 유성–링 백래시 µm (직접 입력)', { st: 1 }],
      ['D', 'num', 'stages.{i}.aTol.0', '{s}단 썬–유성 중심거리 공차 ± µm (핀 위치)', { st: 1 }], ['D', 'num', 'stages.{i}.aTol.1', '{s}단 유성–링 중심거리 공차 ± µm', { st: 1 }],
      ['C', '치합 백래시 jt (작동 피치원 원주)', c => (c.R?.backlash?.stages || []).map(x => x.mode === 'asn' ? `${x.stage}단 S–P ${f(x.jtRange[0][0], 1)}–${f(x.jtRange[0][1], 1)} · P–R ${f(x.jtRange[1][0], 1)}–${f(x.jtRange[1][1], 1)} µm` : `${x.stage}단 ${f(x.jt[0], 0)} / ${f(x.jt[1], 0)} µm (입력)`).join(' · ') || '—', 'jt = −(Ast₁ + Ast₂)·cos αt / cos αwt ± 2·Δa·tan αwt (KISSsoft 11.5와 동일)'],
      ['P', '출력 백래시', c => { const b = c.R?.backlash; if (!b) return '—'; return b.stages.some(x => x.mode === 'asn') ? `${f(b.range[0], 2)} – ${f(b.range[1], 2)} arcmin (평균 ${f(b.arcmin, 2)})` : `${f(b.arcmin, 2)} arcmin`; }, '단별 → 출력축 환산 합 (입력 고정 시 캐리어 회전각)'],
      ['D', 'num', 'stages.{i}.ballD.0', '{s}단 썬 측정 볼·핀 지름 mm (빈칸 = 이론값)', { st: 1 }], ['D', 'num', 'stages.{i}.ballD.1', '{s}단 유성 측정 볼 지름 mm', { st: 1 }], ['D', 'num', 'stages.{i}.ballD.2', '{s}단 링 측정 볼 지름 mm', { st: 1 }],
      ['C', '걸치기 이두께 Wk (상한 / 하한)', c => (c.R?.tooth || []).flatMap(t => t.parts.filter(p => !p.internal).map(p => `${t.stage}단 ${p.name} k=${p.k} ${f(p.Wk[0], 3)} / ${f(p.Wk[1], 3)}${p.WkOK ? '' : ` ⚠ 치폭 ${f(p.WkNeedB, 1)} 필요`}`)).join(' · ') || '—', 'Wk = mn·cos αn·[(k−1)π + z·inv αt] + sn·cos αn. 헬리컬은 치폭 ≥ Wk·sin βb + 5 mm일 때만 측정 가능'],
      ['C', '오버볼 치수 MdK (상한 / 하한)', c => (c.R?.tooth || []).flatMap(t => t.parts.map(p => `${t.stage}단 ${p.name} Ø${f(p.DM, 3)}${p.DMset ? '' : '(이론)'} ${p.internal ? '내측 ' : ''}${f(p.Md[0], 3)} / ${f(p.Md[1], 3)}`)).join(' · ') || '—', 'DIN 3960: inv αMt = inv αt ± sn(en)/(mn·z) ± DM/(mn·z·cos αn) − π/z. 링은 볼 사이 내측 치수'],
      ['M', 'num', 'verify.blMeas', '측정 백래시 arcmin (시제품)']],
    w: ['bl'], up: ['8-2', '4-5'], k: '백래시 ≤ 목표 (1-8)', ok: c => c.R?.backlash ? c.R.backlash.ok : null };

  // ============================================================== 5 하중계수·기어 강도
  I['5-1'] = { what: '단별 썬·캐리어 토크, 유성당 접선력, 상대 회전수를 확인한다.',
    how: '출력 토크에서 거꾸로: T_sun = T_carrier / iᵢ. 유성당 접선력 Ft = 2000·T_sun / (d_sun·n). 상대 회전수는 캐리어 기준 썬 회전수.',
    why: '모든 강도 계산의 하중 입력이다. 반복수(수명계수)는 상대 회전수로 센다.',
    rows: [['C', '정격 토크 (썬 / 캐리어)', c => { const t = trq(c, c.D.req.Trated); return per(c, (s, i) => `${f(t.sun[i], 2)} / ${f(t.car[i], 2)} N·m`); }, 'T_sun = T_car / i'],
      ['C', '유성당 접선력 (정격)', c => { const t = trq(c, c.D.req.Trated); return per(c, (s, i) => `${f(2000 * t.sun[i] / dsun(s) / s.st.n, 0)} N`); }, 'Ft = 2000·T_sun / (d·n)'],
      ['C', '상대 회전수', c => (c.R?.rated?.stages || []).map((s, i) => `${i + 1}단 ${f(s.rel, 0)} rpm`).join(' · ') || '—', 'n_sun − n_carrier']],
    up: ['1-2', '1-3', '2-2'], k: '판정 없음 (하중 입력)' };
  I['5-2'] = { what: '사용계수 KA를 정한다.',
    how: 'ISO 6336-6 표: 구동기(전동기 = 균일)와 피동기 충격 정도로 1.0~2.0. 부하 스펙트럼을 따로 쓰면 1.0에 가깝게 둔다.',
    why: '모든 응력에 그대로 곱해진다. 스펙트럼(1-4)과 이중 반영되지 않게 해야 한다.',
    rows: [['A', 'num', 'loads.KA', '사용계수 KA'], ['J', 'dbl', '부하 스펙트럼과 KA가 같은 충격을 두 번 반영하지 않음을 확인했다']], up: ['1-4'], k: '판정 없음 (가정값)' };
  I['5-3'] = { what: '동하중계수 Kv를 확인한다.',
    how: 'ISO 6336-1 방법 B: 피치선 속도·공진 회전수 비·정밀도 등급(fpb, ffα)으로 계산.',
    why: '고속·저정밀일수록 커진다. 저속 관절에서는 1에 가깝다.',
    rows: [['C', 'Kv (최대)', c => rows(c).length ? f(mx(c, 'Kv'), 3) : '—', 'ISO 6336-1 방법 B']], w: ['kf'], up: ['4-5', '1-3'], k: '판정 없음' };
  I['5-4'] = { what: '치폭 방향 하중분포계수 KHβ를 확인한다.',
    how: 'ISO 6336:2019 판정: Fβx = max(|1.33·B1·fsh − B2·fHβ5|, 0.5·fHβ) (fHβ5 = 5급 잇줄 기울기 공차, B1·B2 = 리드 수정별), 길들임 yβ를 뺀 Fβy로 KHβ (KISSsoft와 같은 방법 C). 이론 판정: 오차 0, 탄성 변형 fsh(썬 비틀림·핀·캐리어·출력 베어링)만. 공차의 무작위 영향은 11-1 시편 시뮬레이션.',
    why: '강도 계산에서 가장 큰 계수가 되는 경우가 많다. 핀(6-5)·캐리어(6-6)·출력 베어링(2-8)·크라우닝(4-6)이 모두 여기로 모인다.',
    rows: [['D', 'sel', 'loads.basis', '판정 기준', { o: [['iso', 'ISO 6336:2019 (KISSsoft 방식) · 기본'], ['ideal', '이론 (오차 0) · 옵션']] }],
      ['C', 'Fβx → Fβy (µm, 최대)', c => rows(c).length ? `${f(mx(c, 'fbx'), 2)} → ${f(mx(c, 'fby'), 2)}` : '—', 'ISO 2019: max(|1.33·B1·fsh − B2·fHβ5|, 0.5·fHβ), yβ = 0.15·Fβx'],
      ['C', 'KHβ (최대)', c => rows(c).length ? f(mx(c, 'KHb'), 3) : '—', 'ISO 6336-1 부록 E'], ['P', 'fsh 핀 / 캐리어 / 출력베어링 (최대)', c => rows(c).length ? `${f(mx(c, 'fshPin'), 2)} / ${f(mx(c, 'fshCar'), 2)} / ${f(mx(c, 'fshOB'), 2)} µm` : '—', '보 처짐·비틀림·롤러 분포 모델']],
    w: ['kf'], up: ['6-5', '6-6', '2-8', '4-6', '4-5'], k: 'KHβ ≤ 2', ok: c => rows(c).length ? mx(c, 'KHb') <= 2 : null };
  I['5-5'] = { what: '정면 하중분포계수 KHα를 확인한다.',
    how: 'ISO 6336-1: 기초 피치 오차와 물림률 εγ, 치합 강성으로 계산.',
    why: '정밀도가 낮고 물림률이 클수록 커진다.',
    rows: [['C', 'KHα (최대)', c => rows(c).length ? f(mx(c, 'KHa'), 3) : '—', 'ISO 6336-1 §8']], w: ['kf'], up: ['4-5', '4-2'], k: '판정 없음' };
  I['5-6'] = { what: '유성 간 하중분배계수 Kγ를 확인한다.',
    how: '이론 계산: 유성 위치 오차 0 → 유성 하중 균등, Kγ = 1. 시편 시뮬레이션(11-1)에서 유성 위치 오차를 무작위로 뽑아 치합·핀 강성, 썬 지지 강성·유격의 힘 평형(에너지 최소)으로 시편마다 Kγ를 구한다.',
    why: '가장 많이 걸린 유성이 강도를 정한다. 유성 수(2-9)·지지(2-7)·공차(D3)가 모두 여기로 모인다.',
    rows: [['A', 'sel', 'loads.kgMode', 'Kγ 산정 (ISO 판정일 때)', { if: D => D.loads.basis !== 'ideal', o: [['model', '물리 모델 (유성 위치 공차·강성)'], ['agma', 'AGMA 6123 표'], ['fixed', '직접 입력']] }],
      ['A', 'num', 'loads.kgFixed', 'Kγ 직접 입력값', { if: D => D.loads.basis !== 'ideal' && D.loads.kgMode === 'fixed' }],
      ['C', '시편 Kγ 중앙 / P90', c => c.X?.MC ? `${f(c.X.MC.Kg.p50, 3)} / ${f(c.X.MC.Kg.p90, 3)}` : '11-1 실행 전', '시편 시뮬레이션'],
      ['P', 'Kγ (이론)', c => (c.R?.rated?.stages || []).map((s, i) => `${i + 1}단 ${f(s.Kg, 3)}`).join(' · ') || '—', '힘 평형 모델 / AGMA 표']],
    w: ['kf'], up: ['2-7', '2-9', '2-5', 'D3'], k: 'Kγ ≤ 1.3', ok: c => (c.R?.rated?.stages || []).length ? c.R.rated.stages.every(s => s.Kg <= 1.3) : null };
  I['5-7'] = { what: '치면 피팅 안전율 SH를 목표와 비교한다.',
    how: 'ISO 6336-2 방법 B: σH = ZH·ZE·Zε·Zβ·√(Ft/(d·b)·(u+1)/u)·√(KA·Kv·KHβ·KHα·Kγ). 허용 σHP = σHlim·ZNT·ZL·Zv·ZR·ZW·ZX / SHmin.',
    why: '대부분의 유성감속기에서 정격 토크를 정하는 모드다.',
    rows: [['D', 'num', 'req.SH', '목표 SH (피로 접촉)'], ['C', '최소 SH', c => rows(c).length ? f(mn(c, 'SH'), 3) : '—', 'σHP / σH'], ['C', '지배 부위', c => c.R?.govRated ? `${c.R.govRated.row.stage}단 ${c.R.govRated.row.mesh} · ${c.R.govRated.mode}` : '—', '']],
    w: ['stress', 'iso'], up: ['5-4', '5-6', '9-1', '3-7'], k: 'SH ≥ 목표', ok: c => rows(c).length ? mn(c, 'SH') >= c.D.req.SH : null };
  I['5-8'] = { what: '이뿌리 굽힘 안전율 SF를 목표와 비교한다.',
    how: 'ISO 6336-3 방법 B: σF = Ft/(b·m)·YF·YS·Yβ·YB·YDT·K. 유성은 양방향 하중이라 YM 0.7. 썬·링도 매 주기 반전이면 YM 0.7.',
    why: '굽힘 파손은 이가 부러지는 치명 파손이다. 모듈(3-6)·전위(3-9)·림(YB)이 지배한다.',
    rows: [['D', 'num', 'req.SF', '목표 SF (피로 굽힘)'], ['A', 'chk', 'loads.reverse', '썬·링 매 주기 하중 반전 (YM 0.7)'], ['C', '최소 SF', c => rows(c).length ? f(mn(c, 'SF'), 3) : '—', 'σFP / σF']],
    w: ['stress', 'iso'], up: ['3-6', '3-9', '9-1'], k: 'SF ≥ 목표', ok: c => rows(c).length ? mn(c, 'SF') >= c.D.req.SF : null };
  I['5-9'] = { what: '스커핑(섬광 온도) 안전율을 확인한다.',
    how: 'Blok 섬광 온도를 물림 경로 41점에서 계산 (ISO/TS 6336-20). 단위하중 wBt·KBγ·XΓ — KBγ = 1 + 0.2·√((εγ−2)(5−εγ)) (헬리컬), XΓ = 평기어 1/3→2/3→1, 넓은 헬리컬(εβ ≥ 1) 1/εα, 물림 시작·끝 지지 계수 1 + 0.3·εβ. θS = 80 + (0.85 + 1.4·XW)·XL·FZG². SB = (θS − θ오일) / (θB − θ오일).',
    why: '고하중·고속에서 치면이 용착한다. 저속 관절에서는 여유가 크지만 피크 토크에서 확인한다.',
    rows: [['D', 'num', 'req.SBmin', '요구 스커핑 안전율'], ['M', 'num', 'lube.fzg', 'FZG 스커핑 하중 단계 (윤활제 데이터시트)'], ['A', 'num', 'lube.XL', '윤활제 계수 XL (광유 1)'], ['A', 'num', 'lube.XW', '조직 계수 XW'],
      ['C', '스커핑 안전율 (피크)', c => vd(c, '스커핑 안전율 (피크, 섬광온도)'), 'Blok 섬광 온도']],
    w: ['scuff'], up: ['5-10'], k: 'SB ≥ 요구값', ok: c => c.R?.verdict?.find(v => v.k === '스커핑 안전율 (피크, 섬광온도)')?.ok ?? null };
  I['5-10'] = { what: '윤활 방식과 유막 두께비 λ를 확인한다.',
    how: '운전 온도에서 Walther 식으로 점도 → Dowson–Higginson 선접촉 유막 → λ = h_min / √(Ra₁² + Ra₂²). 그리스는 기유 유막 × 결핍 계수.',
    why: 'λ < 1 경계 윤활이면 마모·마이크로피팅이 실제 수명을 정한다. 운전 온도(10-6)와 서로 맞물린다.',
    rows: [['D', 'sel', 'lube.type', '윤활 방식', { o: [['grease', '그리스 (기유 점도 입력)'], ['oil', '오일']] }],
      ['M', 'num', 'lube.nu40', '기유 ν40 mm²/s (데이터시트)'], ['M', 'num', 'lube.nu100', '기유 ν100 mm²/s (데이터시트)'], ['M', 'num', 'lube.alphaP', '압력-점도 계수 ×10⁻⁸ /Pa'],
      ['M', 'num', 'lube.rzFlank', '치면 조도 Rz µm (측정)'], ['M', 'num', 'lube.rzRoot', '치근 조도 Rz µm (측정)'],
      ['A', 'num', 'lube.temp', '운전 온도 °C (가정 — 10-6과 비교)'], ['A', 'num', 'lube.starvation', '그리스 유막 결핍 계수 (0~1)', { if: D => D.lube.type === 'grease' }],
      ['C', '운전 점도', c => c.R?.lube ? `${f(c.R.lube.nuOp, 1)} mm²/s` : '—', 'Walther (ν40·ν100 보간)'], ['P', 'λ 최소', c => c.R?.lube ? f(c.R.lube.lambdaMin, 2) : '—', 'Dowson–Higginson 유막 / 합성 조도']],
    w: ['lube'], up: ['10-6'], k: 'λ ≥ 1', ok: c => c.R?.lube ? c.R.lube.lambdaMin >= 1 : null };
  I['5-11'] = { what: '부하 스펙트럼 전체에 대한 누적 손상 수명을 확인한다.',
    how: '구간별 응력으로 S-N 선도의 반복수를 구해 Miner 합 Σ nᵢ/Nᵢ = 1 이 되는 시간을 수명으로 본다.',
    why: '정격 일정 운전 판정(5-7·5-8)보다 실제에 가깝다. 고부하 짧은 구간이 수명을 깎는 정도를 본다.',
    rows: [['C', '스펙트럼 수명 (기어 최소)', c => vd(c, '부하 스펙트럼 수명 (기어)'), 'Miner 선형 누적'], ['C', '목표 수명', c => `${c.D.req.lifeH} h`, '1-4']],
    w: ['spectrum'], up: ['1-4', '5-7', '5-8'], k: '수명 ≥ 목표', ok: c => c.R?.verdict?.find(v => v.k === '부하 스펙트럼 수명 (기어)')?.ok ?? null };
  I['5-12'] = { what: '피크·비상 토크에서 정적 안전율을 확인한다.',
    how: '정적 허용응력(수명계수 정적값)과 피크·비상 토크 응력을 비교한다.',
    why: '피로가 아니라 한 번에 부러지거나 소성 변형하는지를 본다. 비상 토크(1-2)가 지배하는 경우가 많다.',
    rows: [['D', 'num', 'req.SHstat', '정적 접촉 SH 목표'], ['D', 'num', 'req.SFstat', '정적 굽힘 SF 목표'],
      ['C', '피크 · 비상 최소 안전율', c => c.R ? `${f(c.R.peakS, 3)} · ${f(c.R.emergS, 3)}` : '—', 'min(SH/SH목표, SF/SF목표) · 1 이상 합격'], ['C', '정적 한계 토크', c => c.R ? `${f(c.R.staticCap, 2)} N·m` : '—', '']],
    w: ['limits'], up: ['1-2'], k: '피크·비상 안전율 ≥ 1', ok: c => c.R?.verdict ? ['피크 토크 정적 안전율', '비상 토크 정적 안전율'].every(k => c.R.verdict.find(v => v.k === k)?.ok !== false) : null };

  // ============================================================== 6 캐리어·핀
  I['6-1'] = { what: '유성 핀을 양단 지지할지 편단(외팔) 지지할지 정한다.',
    how: '양단 = 캐리어 판 두 장 + 기둥, 처짐이 작다. 편단 = 판 한 장, 짧고 싸지만 핀 기울기가 KHβ를 키운다.',
    why: '핀 처짐·기울기(6-5)가 KHβ(5-4)에 바로 들어간다.',
    rows: [['D', 'sel', 'stages.{i}.pin.type', '{s}단 지지 형식', { st: 1, o: [['double', '양단 지지'], ['single', '편단 지지']] }]], up: ['3-7'], k: '판정은 6-5·5-4에서' };
  I['6-2'] = { what: '캐리어 두께·외경·내경·유성 안착 폭·보스 형상을 정한다 (판 두께는 두께와 안착 폭에서 자동).',
    how: '캐리어 두께(축방향 전체)를 정하면 양단 지지는 유성 안착 축방향 폭의 중심(= 유성 치폭 중심)에서 양쪽으로 판이 (두께 − 안착 폭)/2씩 놓인다. 핀 PCD = 작용 중심거리 × 2. 판 두께가 핀 체결 길이와 면압을, 외경이 링 이뿌리와의 간격을 정한다.',
    why: '캐리어 강성(6-6)·가공(D4)·길이(1-6)·중량(10-7)을 정한다.',
    rows: [['D', 'num', 'stages.{i}.carrier.outerD', '{s}단 캐리어 최대외경 mm (빈칸 자동)', { st: 1 }], ['D', 'num', 'stages.{i}.carrier.innerD', '{s}단 캐리어 내경 mm', { st: 1 }],
      ['D', 'num', 'stages.{i}.carrier.width', '{s}단 캐리어 두께 mm (축방향 전체, 보스 제외 · 빈칸 자동)', { st: 1 }],
      ['D', 'num', 'stages.{i}.carrier.groove', '{s}단 중앙 홈 축방향 폭 mm', { st: 1, if: (D, i) => D.stages[i].pin.type !== 'single' }], ['D', 'num', 'stages.{i}.carrier.pocket', '{s}단 유성 포켓 mm (유성 이끝원 + 여유, 빈칸 자동)', { st: 1, if: (D, i) => D.stages[i].pin.type !== 'single' }],
      ['D', 'num', 'stages.{i}.carrier.axialClearance', '{s}단 지지판·유성 간격 mm', { st: 1, if: (D, i) => D.stages[i].pin.type === 'single' }],
      ['D', 'num', 'stages.{i}.carrier.bossD', '{s}단 보스 외경 mm', { st: 1 }], ['D', 'num', 'stages.{i}.carrier.bossT', '{s}단 보스 두께 mm (0 없음)', { st: 1 }],
      ['C', '캐리어 두께 → 판 두께 · 외경', c => (c.R?.carrierPin || []).map((x, i) => { const g = x.geometry || {}; return `${i + 1}단 ${f(g.width, 1)}${g.double ? ` − 안착 ${f(g.seat, 1)} → 판 ${f(g.wall, 2)} × 2` : ` (판 1장)`} · Ø${f(g.outerD, 1)}`; }).join(' · ') || '—', '양단: 판 = (캐리어 두께 − 유성 안착 축방향 폭) / 2, 안착 폭 중심(= 유성 치폭 중심) 기준 대칭']],
    w: ['carGeo'], up: ['6-1', '3-9'], k: '판정은 D4·6-6에서' };
  I['6-3'] = { what: '양단 캐리어의 기둥(유성 포켓 사이에 남는 연결부) 형상과 강도를 확인한다.',
    how: '일체 가공 캐리어의 유성 포켓은 반경방향으로 세운 엔드밀로 평행 홈 가공하고, 포켓 벽과 판 사이 모서리에 엔드밀 R이 남는다. 포켓 사이에 남는 기둥 단면은 내경~외경 사이 평행 홈 사이 영역이다. 그 단면의 I·A를 형상에서 계산하고, 핀 하중의 절반이 반대쪽 판에서 기둥을 지나 출력 판으로 간다고 보아 양단 고정 보(굽힘 + 전단)로 응력·와인드업을 구한다.',
    why: '기둥이 약하면 캐리어 비틀림 → 핀 기울기 → KHβ가 커지고, 피크에서 기둥이 부러진다.',
    rows: [['D', 'num', 'stages.{i}.carrier.pocketR', '{s}단 포켓 모서리 R mm (엔드밀 반경, 빈칸 = 안착 폭에 들어가는 최대 정수 mm 공구)', { st: .5, if: (D, i) => D.stages[i].pin.type !== 'single' }],
      ['C', '기둥 단면 (형상에서 자동)', c => S(c).map((s, i) => { const w = s.carrier?.web; return w ? `${i + 1}단 평행 홈 · R${f(w.rmin, 1)}~${f(w.rmax, 1)} · A ${f(w.A, 0)} mm² · I ${f(w.I, 0)} mm⁴` : `${i + 1}단 편단 (기둥 없음)`; }).join(' / '), 'I = ∫y²dA (기둥 대칭축 기준, 단면 다각형 적분)'],
      ['A', 'num', 'carrier.allowB', '기둥 허용 굽힘 MPa (재료 근거)'],
      ['C', '기둥 굽힘 안전율 (듀티 전체 최저)', c => (c.R?.carrierPin || []).map((x, i) => `${i + 1}단 ${x.car?.rated?.double ? `${f(x.Sweb, 2)} (${x.modes.web.kind} ${f(x.modes.web.T, 1)} N·m)` : '편단'}`).join(' · ') || '—', '양단 고정 보, σ = M/Z']],
    w: ['carStiff'], up: ['6-1', '2-9'], k: '기둥 안전율 ≥ 1', ok: c => (c.R?.carrierPin || []).length ? c.R.carrierPin.every(x => !x.car?.rated?.double || x.Sweb >= 1) : null };
  I['6-4'] = { what: '유성 핀 지름·조립홀·소재와 허용응력을 정한다.',
    how: '핀 지름은 굽힘·면압과 유성 보어(= 핀 + 2·Dw, 니들일 때)·유성 림 사이의 절충이다. 막힌 홀은 깊이 지정.',
    why: '핀이 굵으면 처짐은 줄지만 유성 림(3-9, D4)과 니들 공간(7-2)이 줄어든다.',
    rows: [['D', 'num', 'stages.{i}.pin.d', '{s}단 핀 지름 mm', { st: 1 }], ['D', 'sel', 'stages.{i}.pin.holeMode', '{s}단 조립홀', { st: 1, o: [['through', '관통'], ['blind', '깊이 지정']] }],
      ['D', 'num', 'stages.{i}.pin.depth', '{s}단 원통 깊이 mm', { st: 1, if: (D, i) => D.stages[i].pin.holeMode === 'blind' }],
      ['D', 'sel', 'stages.{i}.pin.material', '{s}단 핀 소재', { st: 1, o: [['SUJ2', 'SUJ2'], ['SCM440', 'SCM440'], ['S45C', 'S45C']] }],
      ['A', 'num', 'stages.{i}.pin.allow', '{s}단 핀 허용 굽힘 MPa', { st: 1 }], ['A', 'num', 'carrier.allowP', '캐리어 구멍 허용 면압 MPa'],
      ['C', '굽힘 / 면압 안전율 (듀티 전체 최저)', c => (c.R?.carrierPin || []).map((x, i) => `${i + 1}단 굽힘 ${f(x.Sbend, 2)} (${x.modes.bend.kind} ${f(x.modes.bend.T, 1)} N·m) / 면압 ${f(x.Spress, 2)} (${x.modes.press.kind} ${f(x.modes.press.T, 1)} N·m)`).join(' · ') || '—', 'σ = M/Z, p = F/(d·L)']],
    up: ['1-2', '3-9'], k: '안전율 ≥ 1 (회전·정지 유지·지정 피크·비상 중 최저)', ok: c => c.R?.verdict?.find(v => (v.id || v.k) === '유성 핀·캐리어 정적 (듀티 전체)')?.ok ?? null };
  I['6-5'] = { what: '핀의 굽힘 응력·처짐·치폭 방향 기울기를 확인한다.',
    how: '핀을 지지 스팬(양단) 또는 외팔 길이(편단)의 보로 보고, 유성 1개 반경 하중으로 처짐 δ와 치폭 끝 기울기를 구한다.',
    why: '기울기가 fsh로 KHβ(5-4)에 들어간다. 강도뿐 아니라 하중 분포를 정한다.',
    rows: [['C', '핀 굽힘 (피크)', c => (c.R?.bearings || []).map((b, i) => `${i + 1}단 ${f(b.pinSigmaPeak, 0)} MPa`).join(' · ') || '—', 'σ = M/Z'],
      ['C', '처짐 · 치폭 기울기 (정격)', c => (c.R?.carrierPin || []).map((x, i) => `${i + 1}단 ${f(x.rated.defl, 2)} µm · ${f(Math.abs(x.rated.tilt), 3)} µm`).join(' · ') || '—', '보 처짐식']],
    w: ['pinLoad'], up: ['6-4', '3-7'], k: '판정은 6-4·5-4에서' };
  I['6-6'] = { what: '캐리어 비틀림 강성과 그로 인한 핀 기울기를 확인한다.',
    how: '두 판 사이 비틀림 와인드업을 기둥 보 모델로 구해 핀 원주 기울기(fsh)와 감속기 비틀림 강성(10-3)에 넣는다. 판 자체 굽힘은 제외.',
    why: '캐리어가 비틀리면 핀이 기울어 KHβ가 커지고 출력 강성이 떨어진다. FEA(11-2)로 검증할 대상이다.',
    rows: [['P', '캐리어 비틀림 강성', c => (c.R?.stiffness?.stages || []).map(s => `${s.stage}단 ${Number.isFinite(s.Kcar) ? f(s.Kcar / 1000, 0) + ' N·m/mrad' : '강체'}`).join(' · ') || '—', '기둥 보 모델 (판 강체 가정)'],
      ['P', 'fsh 캐리어 기여', c => rows(c).length ? `${f(mx(c, 'fshCar'), 2)} µm` : '—', '와인드업 × 치폭']],
    w: ['carStiff'], up: ['6-3', '3-8'], k: '판정은 11-2(FEA 비교)에서' };
  I['6-7'] = { what: 'C1–S2 결합부가 피크 토크를 여유 있게 견디는지 본다.',
    how: '2-5에서 정한 결합 방식·치수로 전달 능력을 피크 S2 토크 × 1.2와 비교한다.',
    why: '결합부 파손은 2단 전체 동력 상실이다.',
    rows: [['C', '전달 능력', c => ck(c, '6-7'), '2-5 식'], ['J', 'fit', '스플라인·키 치수를 규격(KS·DIN 5480 등)으로 맞췄다']], up: ['2-5'], k: '전달 ≥ 피크 × 1.2' };

  // ============================================================== 7 베어링
  I['7-1'] = { what: '유성 베어링 종류와 정격하중(카탈로그)을 정한다.',
    how: '니들 케이지·풀니들·볼 등. 카탈로그의 기본 동정격 C, 정정격 C0를 넣는다 (직접 설계는 7-2).',
    why: '유성 베어링은 상대 회전수가 높아 수명(7-3)이 가장 먼저 부족해지는 부위다.',
    rows: [['D', 'str', 'stages.{i}.bearing.name', '{s}단 베어링 이름', { st: 1 }], ['D', 'num', 'stages.{i}.bearing.count', '{s}단 유성당 개수', { st: 1 }],
      ['M', 'num', 'stages.{i}.bearing.C', '{s}단 동정격 C N (카탈로그)', { st: 1 }], ['M', 'num', 'stages.{i}.bearing.C0', '{s}단 정정격 C0 N (카탈로그)', { st: 1 }]],
    up: ['6-4'], k: '판정은 7-3에서' };
  I['7-2'] = { what: '외륜 없는 풀니들(핀 = 내륜, 유성 보어 = 외륜)을 직접 설계한다.',
    how: 'ISO 281 롤러 식: C = bm·fc·Lw^(7/9)·Z^(3/4)·Dw^(29/27), 궤도면 경도 보정 (HRC/58)^3.6. Z 최대 = π·Dpw/Dw − 0.5 (원주 틈 합 ≥ 0.5·Dw).',
    why: '공간 대비 정격이 가장 크지만 핀·유성 보어가 궤도면이 되어 경도(9-4)·림(3-9)이 같이 묶인다.',
    rows: [['D', 'chk', 'needle.{i}.use', '{s}단 풀니들 사용', { st: 1 }], ['D', 'num', 'needle.{i}.Dw', '{s}단 니들 Dw mm', { st: 1, if: (D, i) => D.needle?.[i]?.use }], ['D', 'num', 'needle.{i}.Lw', '{s}단 길이 Lw (빈칸 = 치폭−0.4)', { st: 1, if: (D, i) => D.needle?.[i]?.use }],
      ['D', 'num', 'needle.{i}.Z', '{s}단 개수 Z (빈칸 = 최대)', { st: 1, if: (D, i) => D.needle?.[i]?.use }], ['D', 'chk', 'needle.{i}.apply', '{s}단 계산값을 베어링 계산에 적용', { st: 1, if: (D, i) => D.needle?.[i]?.use }],
      ['C', '정격 C · C0', c => ck(c, '7-2'), 'ISO 281 식']],
    up: ['6-4', '9-4'], k: '유성 림 ≥ 1.2·h' };
  I['7-3'] = { what: '유성 베어링 수명 L10과 정적 안전율 s0를 확인한다.',
    how: '유성 1개 반경 하중 = 두 치합 접선력 합 × Kγ × Kv. L10 = (C/P)^(10/3) × 10⁶ / (60·n_rel), 스펙트럼 합산. s0 = C0 / P0(회전·정지·피크·비상 중 최저).',
    why: '감속기 수명을 베어링이 정하는 경우가 많다.',
    rows: [['D', 'num', 'req.s0', '베어링 정적 s0 목표'], ['C', 'L10 (스펙트럼)', c => vd(c, '유성 베어링 L10 (스펙트럼)'), 'ISO 281'], ['C', 's0 (최저)', c => vd(c, '유성 베어링 정적 s0 (최저)'), 'C0/P0']],
    w: ['brgPlanet'], up: ['7-1', '7-2', '5-6'], k: 'L10 ≥ 목표 수명, s0 ≥ 목표', ok: c => { const v = c.R?.verdict; if (!v) return null; return ['유성 베어링 L10 (스펙트럼)', '유성 베어링 정적 s0 (최저)'].every(k => v.find(x => x.k === k)?.ok !== false); } };
  I['7-4'] = { what: '썬을 받치는 지지 베어링과 축 치수를 정한다.',
    how: '1단 = 입력 중공축 지지 베어링, 2단 = C1을 받치는 베어링. 지지 강성 = 베어링 반경 강성 ⊕ 축 굽힘 강성 (직렬), 유격 포함.',
    why: '지지 강성·유격이 Kγ(5-6)를 정한다. 강성이 무한이면 완전 고정, 0이면 플로팅.',
    rows: [['M', 'num', 'loads.sunSupport.{i}.bearingK', '{s}단 지지 베어링 반경 강성 N/µm (카탈로그·측정)', { st: 1, if: (D, i) => D.loads.sunSupport?.[i]?.mode === 'structure' }],
      ['D', 'num', 'loads.sunSupport.{i}.od', '{s}단 축 외경 mm', { st: 1, if: (D, i) => D.loads.sunSupport?.[i]?.mode === 'structure' }], ['D', 'num', 'loads.sunSupport.{i}.id', '{s}단 축 내경 mm (중공)', { st: 1, if: (D, i) => D.loads.sunSupport?.[i]?.mode === 'structure' }],
      ['D', 'num', 'loads.sunSupport.{i}.overhang', '{s}단 베어링 → 치폭 중앙 mm', { st: 1, if: (D, i) => D.loads.sunSupport?.[i]?.mode === 'structure' }],
      ['A', 'num', 'loads.sunSupport.{i}.k', '{s}단 썬 지지 반경 강성 N/µm (직접)', { st: 1, if: (D, i) => D.loads.sunSupport?.[i]?.mode !== 'structure' }], ['C', '반경 유격 (입력은 11-1)', c => (c.D.loads.sunSupport || []).slice(0, c.D.config.stages).map((s, i) => `S${i + 1} ${s.play ?? 0} µm`).join(' · '), '오차가 있을 때만 Kγ에 영향 → 시편 시뮬레이션'],
      ['P', '지지 강성', c => S(c).map((s, i) => { try { const k = globalThis.PGD.sunSupportK(c.D, i); return `S${i + 1} ${f(k.k, 1)}${k.kShaft ? ` (축 ${f(k.kShaft, 0)})` : ''} N/µm`; } catch (e) { return ''; } }).join(' · '), '직렬 강성 1/k = 1/k_brg + 1/k_shaft']],
    up: ['2-7', '1-7'], k: '판정은 5-6에서' };
  I['7-5'] = { what: '출력 메인 베어링(크로스 롤러)의 형식·크기·정격을 정한다.',
    how: '베어링 선택(제조사 → 시리즈 → 형번)으로 카탈로그 치수·C·C0를 넣는다. 롤러 피치원 dp, 롤러 지름 Dw·길이 Lw·수 Z로 하중분포 모델을 풀고, 카탈로그 C·C0로 수명을 본다.',
    why: 'dp가 외경(1-6)·하우징(8-1)·중공(1-7)을 정하고, 모멘트 강성이 출력 기울기(7-6)를 정한다.',
    rows: [['D', 'str', 'outBearing.name', '이름'], ['D', 'sel', 'outBearing.type', '형식', { o: [['roller', '크로스 롤러 (p = 10/3)'], ['ball', '4점 접촉 볼 (p = 3)']] }],
      ['D', 'num', 'outBearing.dp', '롤러 피치원 dp mm'], ['D', 'num', 'outBearing.Z', '롤러 수 Z (0 = 분포 계산 끔)'], ['D', 'num', 'outBearing.Dw', '롤러 지름 Dw mm'], ['D', 'num', 'outBearing.Lw', '롤러 유효 길이 Lw mm'],
      ['M', 'num', 'outBearing.C', '동정격 C N (카탈로그)'], ['M', 'num', 'outBearing.C0', '정정격 C0 N (카탈로그)']],
    w: ['obpick'], up: ['8-1', '1-6'], k: '판정은 7-6에서' };
  I['7-6'] = { what: '출력 베어링 수명·정적 안전율·모멘트 강성·기울기를 확인한다.',
    how: 'P = X(Fr + 2000M/dp) + Y·Fa (카탈로그 식) → L10. 롤러 하중분포는 반경·축·기울기 3자유도와 Palmgren 선접촉 강성으로 풀어 최대 접촉응력·기울기를 구한다.',
    why: '관절의 외부 모멘트를 받는 유일한 부품이다. 기울기가 2단 KHβ(5-4)로 들어간다.',
    rows: [['C', 'L10 · s0 (최저)', c => `${vd(c, '출력 베어링 L10')} · ${vd(c, '출력 베어링 정적 s0 (최저)')}`, 'ISO 281 / 카탈로그 식'],
      ['P', '롤러 접촉 s0 (최저)', c => vd(c, '출력 베어링 롤러 접촉 s0 (최저)'), '롤러 분포 모델, (4000/p0)²'],
      ['M', 'num', 'outBearing.Km', '카탈로그 모멘트 강성 N·m/arcmin (비교용)'], ['P', '모델 기울기 (정격 / 피크)', c => c.R?.outBearing ? `${f(c.R.outBearing.tiltRated, 3)}′ / ${f(c.R.outBearing.tiltPeak, 3)}′` : '—', 'M / 모멘트 강성']],
    w: ['ob', 'roll'], up: ['1-5', '7-5'], k: 'L10 ≥ 목표, s0 ≥ 목표', ok: c => { const v = c.R?.verdict; if (!v) return null; return ['출력 베어링 L10', '출력 베어링 정적 s0 (최저)', '출력 베어링 롤러 접촉 s0 (최저)'].every(k => v.find(x => x.k === k)?.ok !== false); } };
  I['7-7'] = { what: '출력 베어링 예압과 유성·캐리어 축방향 유격을 정한다.',
    how: '예압(+) 은 강성을 올리고 기울기를 줄이지만 마찰·발열을 키운다. 틈새(−)는 반대. 헬리컬 추력(3-8)이 축방향 하중을 더한다.',
    why: '예압이 모멘트 강성(7-6)·효율(10-5)·온도(10-6)를 동시에 바꾼다.',
    rows: [['D', 'num', 'outBearing.preload', '예압 µm (음수 = 틈새)'], ['C', '유성 축방향 유격', c => (c.R?.carrierPin || []).map((x, i) => `${i + 1}단 ${f(x.geometry?.gap, 2)} mm`).join(' · ') || '—', '안착부 폭 − 치폭'],
      ['J', 'thrust', '헬리컬 추력을 받는 와셔·턱 위치를 확인했다']],
    up: ['3-8', '7-5'], k: '유격 0.1 ~ 1 mm', ok: c => (c.R?.carrierPin || []).length ? c.R.carrierPin.every(x => x.geometry?.gap == null || (x.geometry.gap >= .1 && x.geometry.gap <= 1)) : null };

  // ============================================================== 8 하우징·체결
  I['8-1'] = { what: '하우징 벽 두께와 바깥 치수를 정한다.',
    how: '하우징 안지름 = 링 외경, 몸체 외경 = 링 외경 + 2·벽. 출력부는 크로스 롤러 외륜을 감싼다.',
    why: '벽이 얇으면 압입(8-2) 응력이 넘고, 두꺼우면 외경(1-6)·중량(10-7)이 늘어난다.',
    rows: [['D', 'num', 'housing.wall', '하우징 벽 두께 mm', { if: D => D.struct.ringHousing !== 'integral' }], ['C', '일체형', c => c.D.struct.ringHousing === 'integral' ? '링기어가 하우징에 직접 가공됨 · 벽 = 링 림 (링 외경 3-9에서)' : '별도 하우징', '2-4 결합 방식'], ['C', '하우징 외경 · 전체 길이', c => { const L = lay(c); return L ? `Ø${f(L.housR * 2, 1)} · ${f(L.zFlange[1] - L.zIn, 1)} mm` : '—'; }, '링 외경 + 2·벽']],
    w: ['housingDims'], up: ['3-6', '3-9'], k: '판정은 8-2·D4에서' };
  I['8-2'] = { what: '링 압입 죔새(또는 볼트)를 정하고 전달 토크·하우징 응력·링 수축을 본다.',
    how: 'Lamé 두꺼운 원통: p = δ / (d·[(1/Eo)((c²+b²)/(c²−b²)+νo) + (1/Ei)((b²+a²)/(b²−a²)−νi)]). 전달 T = μ·p·π·d·L·d/2. 링 내경 수축 → 원주 백래시 감소.',
    why: '죔새가 작으면 링이 돌고, 크면 하우징이 항복하고 링이 줄어 백래시(4-7)가 없어진다.',
    rows: [['D', 'num', 'struct.ringFit.delta', '압입 죔새 (지름) mm', { if: D => D.struct.ringHousing === 'press' }], ['A', 'num', 'struct.ringFit.mu', '마찰계수', { if: D => D.struct.ringHousing !== 'integral' }],
      ['M', 'num', 'struct.ringFit.E', '하우징 탄성계수 E MPa (재료 시험서)', { if: D => D.struct.ringHousing === 'press' }], ['M', 'num', 'struct.ringFit.Sy', '하우징 항복 MPa (재료 시험서)', { if: D => D.struct.ringHousing === 'press' }],
      ['D', 'num', 'struct.ringFit.boltN', '볼트 수', { if: D => D.struct.ringHousing === 'bolt' }], ['D', 'num', 'struct.ringFit.boltD', '볼트 호칭 M', { if: D => D.struct.ringHousing === 'bolt' }],
      ['C', '링 반력 → 요구 토크', c => { const J = c.CK?.['8-2']?.J || c.CK?.['2-4']?.J, RR = c.CK?.['8-2']?.RR; if (!RR) return '—'; const sg = x => (x >= 0 ? '+' : '−') + f(Math.abs(x), 2); return `단별 ${RR.stages.map(x => `${x.stage}단 ${sg(x.ring)}`).join(' · ')} N·m` + (J ? ' · ' + J.map(j => `${j.name} ${j.shared ? '합계 ' : ''}${sg(j.T)} × 1.5 = 요구 ${f(j.need, 2)} / 전달 ${f(j.Tcap, 2)} N·m`).join(' · ') : ''); }, 'T_ring,i = T_car,i − T_sun,i (피크, 부호 유지) · 공용 링 = 단별 반력의 합 · 분리 링 = 링마다 · 요구 = 1.5 × |합계|'],
      ['C', '면압 · 전달 · 수축 · 응력', c => ck(c, '8-2'), 'Lamé']],
    up: ['2-4', '8-1'], k: '전달 ≥ 필요 (= 1.5 × |링 반력 합|, 공용 링은 1·2단 부호 합), 하우징 응력 ≤ 항복/1.5' };
  I['8-3'] = { what: '출력 플랜지 볼트의 수·호칭·등급을 정하고 마찰 전달 토크를 본다.',
    how: '축력 F = 이용률 × 항복 × 유효 단면적, 전달 T = n·F·μ·r_bolt. 피크 × 1.5와 비교.',
    why: '볼트 미끄럼은 위치 정밀도 상실, 볼트 파단은 관절 탈락이다.',
    rows: [['D', 'num', 'housing.boltN', '볼트 수 (커버·플랜지 각각)', { step: 1, if: D => D.struct.ringHousing !== 'integral' }], ['D', 'num', 'housing.boltD', '볼트 호칭 M', { if: D => D.struct.ringHousing !== 'integral' }],
      ['D', 'sel', 'bolts.grade', '강도 등급', { o: [['8.8', '8.8'], ['10.9', '10.9'], ['12.9', '12.9']], t: 'numsel', if: D => D.struct.ringHousing !== 'integral' }], ['A', 'num', 'bolts.mu', '접촉면 마찰계수', { if: D => D.struct.ringHousing !== 'integral' }], ['A', 'num', 'bolts.util', '체결력 / 항복 비', { if: D => D.struct.ringHousing !== 'integral' }],
      ['C', '마찰 전달', c => c.D.struct.ringHousing === 'integral' ? '링–하우징 일체형: 볼트 체결 검토 없음' : ck(c, '8-3'), 'T = n·F·μ·r']],
    up: ['1-2'], k: '전달 ≥ 피크 × 1.5' };
  I['8-4'] = { what: '입력 커버 두께와 형상을 정한다.',
    how: '커버는 입력 베어링·오일 실을 품고 하우징에 볼트로 붙는다. 두께는 볼트 자리·실 홈 깊이로 정한다.',
    why: '길이(1-6)·중량(10-7)·실 위치(8-6)를 정한다.',
    rows: [['D', 'num', 'housing.coverT', '입력 커버 두께 mm'], ['J', 'seal', '오일 실 홈·베어링 자리가 커버 두께 안에 들어간다']], w: [['part', 'cover']], up: ['8-1'], k: '판정 없음 (형상)' };
  I['8-5'] = { what: '출력 플랜지 두께와 중공축 형상을 정한다.',
    how: '플랜지는 크로스 롤러 내륜과 C2를 잇고 출력 볼트(8-3)를 받는다.',
    why: '플랜지 강성이 출력 기울기와 볼트 체결 품질을 정한다.',
    rows: [['D', 'num', 'housing.flangeT', '출력 플랜지 두께 mm']], w: [['part', 'oflange']], up: ['7-5'], k: '판정 없음 (형상)' };
  I['8-6'] = { what: '오일 실을 정하고 실 마찰 손실을 반영한다.',
    how: '립 실 마찰은 별도 모델 없이 단당 기타 손실(베어링·실·교반) %로 효율(10-5)에 넣는다.',
    why: '저부하 관절에서는 실 마찰이 치합 손실보다 클 수 있다.',
    rows: [['A', 'num', 'perf.otherLoss', '기타 손실 %/단 (베어링·실·교반)'], ['M', 'num', 'verify.sealTorque', '실 마찰 토크 N·m (카탈로그·측정)'], ['J', 'lip', '실 립 속도·온도 범위가 카탈로그 허용 안이다']],
    k: '판정은 10-5에서' };
  I['8-7'] = { what: '조립 순서와 축방향 유격, 공차 체인을 확인한다.',
    how: '구조 선택(2-4~2-8)으로 조립 순서를 자동 작성하고, 안착부 폭 − 치폭으로 유성 축방향 유격을 본다.',
    why: '조립이 안 되는 순서나 유격 0(걸림)·과대(소음)를 도면 전에 잡는다.',
    rows: [['C', '유격 · 조립 단계', c => ck(c, '8-7'), '자동 작성'], ['J', 'chain', '축방향 치수 체인(커버~플랜지)의 누적 공차를 확인했다'], ['J', 'tool', '압입·베어링 장착 치공구가 들어갈 공간을 확인했다']],
    up: ['2-4', '2-5', '2-7', '2-8'], k: '유격 0.1 ~ 1 mm' };

  // ============================================================== 9 재료·열처리
  I['9-1'] = { what: '기어별 재료·열처리(침탄·질화·고주파·조질)와 경도·경화 깊이를 정한다.',
    how: 'ISO 6336-5 재료선: 재료군·표면 경도·품질 등급으로 σHlim·σFlim이 정해진다. 아래 표에서 부품별로 입력.',
    why: '허용응력이 SH·SF(5-7·5-8)와 필요 모듈(3-6)을 바로 바꾼다. 원가(D5)도 크게 바뀐다.',
    rows: [['J', 'spec', '열처리 사양서(경도·유효 경화층·심부 경도)를 재료 표 값과 대조했다'], ['M', 'str', 'verify.hardMeas', '시제품 경도 측정값 (HRC, 부위별)']],
    w: ['mat'], k: '재료 경고 없음' , ok: c => S(c).length ? S(c).every(s => s.mats.every(m => !m.warnings.length)) : null };
  I['9-2'] = { what: '재료 품질 등급(ML·MQ·ME)을 정한다.',
    how: 'ISO 6336-5: 같은 경도라도 품질 관리(청정도·결정립·경화층 관리) 수준에 따라 허용응력이 다르다. ME는 증빙이 필요하다.',
    why: 'MQ→ME 한 단계로 σHlim이 10~15 % 바뀐다.',
    rows: [['D', 'sel', 'design.quality', '재료 품질 등급', { o: [['ML', 'ML · 최소 품질'], ['MQ', 'MQ · 일반 양산 품질'], ['ME', 'ME · 고품질 (증빙 필요)']] }], ['J', 'proof', '선택 등급의 품질 증빙(소재 성적서·열처리 기록)을 받을 수 있다']], k: '판정 없음' };
  I['9-3'] = { what: '유효 경화층 깊이가 충분한지 본다.',
    how: '피크 토크에서 Hertz 접촉 최대 전단응력 깊이 z_max와 경화 깊이를 비교한다. 비율 2 미만이면 케이스 크러싱 위험.',
    why: '경화층이 얕으면 표면 아래에서 균열이 시작된다(심부 파손).',
    rows: [['C', '경화층 / 최대 전단 깊이 (최소)', c => (c.R?.caseDepth || []).length ? f(Math.min(...c.R.caseDepth.map(x => x.ratio)), 2) : '—', 'z_max = 0.78·b_H (Hertz)']],
    w: ['caseDepth'], up: ['9-1', '1-2'], k: '비율 ≥ 1 (권장 ≥ 2)', ok: c => (c.R?.caseDepth || []).length ? c.R.caseDepth.every(x => x.ratio >= 1) : null };
  I['9-4'] = { what: '핀·유성 보어가 니들 궤도면이 될 때 경도를 정한다.',
    how: '궤도면 HRC가 58 미만이면 정격을 (HRC/58)^3.6 로 깎는다 (ISO 281 경도 보정).',
    why: '풀니들(7-2)에서 궤도면 경도가 베어링 수명(7-3)을 정한다.',
    rows: [['D', 'num', 'needle.{i}.HRCpin', '{s}단 핀 HRC', { st: 1, if: (D, i) => D.needle?.[i]?.use }], ['D', 'num', 'needle.{i}.HRCbore', '{s}단 유성 보어 HRC', { st: 1, if: (D, i) => D.needle?.[i]?.use }],
      ['C', '경도 보정', c => ck(c, '9-4'), 'fH = (HRC/58)^3.6']], up: ['7-2'], k: 'fH ≥ 0.9' };
  I['9-5'] = { what: '캐리어·하우징 재료를 정한다.',
    how: '캐리어는 강(S45C·SCM440), 하우징은 알루미늄 또는 링 일체면 강. 탄성계수·항복이 압입(8-2)·강성(6-6)에 들어간다.',
    why: '재료가 강성·중량·원가·압입 응력을 정한다.',
    rows: [['D', 'sel', 'stages.{i}.carrier.material', '{s}단 캐리어 소재', { st: 1, o: [['S45C', 'S45C'], ['SCM440', 'SCM440'], ['SUJ2', 'SUJ2']] }], ['J', 'hous', '하우징 재료가 링 결합 방식(2-4)과 맞는다 (일체 = 강)']], up: ['2-4'], k: '판정 없음' };
  I['9-6'] = { what: '최종 허용응력(σHlim, σFlim)을 확정한다.',
    how: '9-1·9-2의 결과를 표로 확인한다. 지배 부위의 값이 정격 토크를 정한다.',
    why: '이 값이 바뀌면 5단계 판정이 모두 바뀐다.',
    rows: [['C', '지배 부위 허용응력', c => { const g = c.R?.govRated?.row?.f; return g ? `σHlim ${g.Hlim} · σFlim ${g.Flim} MPa` : '—'; }, 'ISO 6336-5']], w: ['mat'], up: ['9-1', '9-2'], k: '판정 없음' };

  // ============================================================== 10 성능 예측
  I['10-1'] = { what: '감속기 정격 토크(목표 수명 기준 최소 한계)를 확인한다.',
    how: '기어 피팅·굽힘, 유성 베어링, 출력 베어링, 핀 한계 중 최솟값. ISO 설계 판정(99 % 신뢰도, 공차 상한).',
    why: '이 감속기의 대표 성능이다. 목표 미달이면 지배 부위를 고쳐야 한다.',
    rows: [['C', '정격 토크', c => c.R ? `${f(c.R.reducerCap, 2)} N·m (목표 ${c.D.req.Trated})` : '—', 'min(각 부위 한계)'], ['C', '지배 부위', c => c.R?.reducerGov || '—', '']],
    w: ['limits'], up: ['5-7', '5-8', '7-3', '7-6'], k: '정격 ≥ 목표', ok: c => c.R ? c.R.reducerCap >= c.D.req.Trated : null };
  I['10-2'] = { what: '부하 스펙트럼 기준 감속기 수명을 정리한다 (기어 + 베어링).',
    how: '5-11 기어 Miner 수명과 7-3 베어링 스펙트럼 L10 중 작은 값.',
    why: '데이터시트(12-4)의 수명 값이다.',
    rows: [['C', '기어 · 유성 베어링', c => `${vd(c, '부하 스펙트럼 수명 (기어)')} · ${vd(c, '유성 베어링 L10 (스펙트럼)')}`, '5-11 · 7-3']], up: ['5-11', '7-3'], k: '두 값 모두 ≥ 목표', ok: c => { const v = c.R?.verdict; if (!v) return null; return ['부하 스펙트럼 수명 (기어)', '유성 베어링 L10 (스펙트럼)'].every(k => v.find(x => x.k === k)?.ok !== false); } };
  I['10-3'] = { what: '감속기 비틀림 강성을 예측하고 실측과 비교한다.',
    how: '단별 (치합 + 핀) 강성과 캐리어 강성을 직렬로 합해 출력축으로 환산한다. 하우징·출력 베어링 비틀림, 저토크 비선형 영역은 제외.',
    why: '로봇 제어 대역폭과 위치 정밀도를 정한다.',
    rows: [['P', '비틀림 강성', c => c.R?.stiffness ? `${f(c.R.stiffness.NmPerArcmin, 1)} N·m/arcmin` : '—', '직렬 강성 모델'], ['M', 'num', 'verify.stiffMeas', '측정 비틀림 강성 N·m/arcmin (시제품)'],
      ['C', '측정 / 예측', c => c.D.verify.stiffMeas && c.R?.stiffness ? `×${f(c.D.verify.stiffMeas / c.R.stiffness.NmPerArcmin, 2)}` : '측정값 미입력', '']],
    w: ['bl'], up: ['6-6', '5-4'], k: '목표 강성 (1-8)', ok: c => c.D.req.stiffMin && c.R?.stiffness ? c.R.stiffness.NmPerArcmin >= c.D.req.stiffMin : null };
  I['10-4'] = { what: '백래시·로스트 모션을 예측하고 실측과 비교한다.',
    how: '4-7의 치합 유격 모델. 로스트 모션(저토크 강성 영역)은 모델에 없어 측정으로 본다.',
    why: '위치 정밀도의 직접 지표다.',
    rows: [['P', '출력 백래시', c => c.R?.backlash ? `${f(c.R.backlash.range[1], 2)} arcmin` : '—', '4-7 모델'], ['M', 'num', 'verify.lostMotion', '측정 로스트 모션 arcmin (시제품)']],
    up: ['4-7'], k: '백래시 ≤ 목표', ok: c => c.R?.backlash?.ok ?? null };
  I['10-5'] = { what: '효율(치합·베어링·실)을 예측하고 실측과 비교한다.',
    how: '치합 손실 = Ohlendorf 손실계수 × μ, μ는 ISO/TR 14179-2 식(윤활 조건 반영) 또는 고정값. 단당 기타 손실 % 더함. 링 고정·썬 입력 유성 효율식.',
    why: '모터 크기·발열(10-6)·배터리 소모를 정한다.',
    rows: [['A', 'sel', 'perf.muMode', '마찰계수 산정', { o: [['model', 'ISO/TR 14179-2 식'], ['fixed', '고정값']] }], ['A', 'num', 'perf.mu', '치면 마찰계수 μ', { if: D => D.perf.muMode === 'fixed' }],
      ['P', '효율 (정격)', c => vd(c, '효율 (정격, 추정)'), '유성 효율식 + 손실계수'], ['M', 'num', 'verify.effMeas', '측정 효율 % (시제품)']],
    w: ['eff'], up: ['5-10', '8-6', '10-6'], k: '효율 ≥ 목표 (1-9)', ok: c => c.R?.verdict?.find(v => v.k === '효율 (정격, 추정)')?.ok ?? null };
  I['10-6'] = { what: '정격 연속 운전의 발열과 표면 온도를 예측한다.',
    how: '손실 P = T·ω·(1/η − 1)·운전률, 온도 상승 ΔT = P / (h·A), A = 하우징 표면적.',
    why: '예측 온도가 윤활 가정 온도(5-10)보다 높으면 유막·스커핑 판정이 낙관적이다.',
    rows: [['A', 'num', 'thermal.Tamb', '주변 온도 °C'], ['A', 'num', 'thermal.h', '방열 계수 W/m²K (자연 대류 8~15)'], ['A', 'num', 'thermal.duty', '연속 운전 비율 (0~1)'],
      ['P', '온도', c => ck(c, '10-6'), 'ΔT = P/(h·A)'], ['M', 'num', 'verify.tempMeas', '측정 표면 온도 °C (시제품)']],
    up: ['10-5', '5-10'], k: '예측 온도 ≤ 윤활 가정 + 5 °C' };
  I['10-7'] = { what: '중량과 관성을 확인한다.',
    how: '3D 형상 부피 × 밀도(강 7.85, AL 2.7 g/cm³) 합계. 형상 근사이므로 측정과 비교한다.',
    why: '로봇 관절 중량·관성은 상위 관절 토크를 바꾼다.',
    rows: [['C', '중량', c => c.X?.mass ? `${f(c.X.mass, 0)} g` : '—', 'Σ 부피 × 밀도'], ['M', 'num', 'verify.massMeas', '측정 중량 g (시제품)'], ['D', 'num', 'req.massMax', '중량 목표 g']],
    w: ['bom'], k: '중량 ≤ 목표 (입력 시)', ok: c => c.D.req.massMax && c.X?.mass ? c.X.mass <= c.D.req.massMax : null };

  // ============================================================== 11 검증
  I['11-1'] = { what: '공차 시편 시뮬레이션: 가공·조립·정렬 오차를 무작위로 넣은 시편 N개로 강도 분포를 구한다.',
    how: '이론 계산(오차 0) 위에, 시편마다 잇줄·피치·치형 오차(정밀도 등급), 유성 위치 오차, 캐리어 평행도를 공정 분포(3σ = 활용률 × 공차)로, 피로강도를 대수정규 산포로 뽑는다. 시편별 정격 한계를 모아 평균·P10·P50·P90을 본다.',
    why: '이론값은 상한(완전한 부품)이고, 실제 제품은 오차만큼 그 아래에 분포한다. 그 분포의 아래쪽(P10)이 양산 품질 기준이 된다.',
    rows: [['D', 'sel', 'stages.{i}.grade', '{s}단 정밀도 등급 (ISO 1328)', { st: 1, o: [3, 4, 5, 6, 7, 8].map(v => [v, 'N' + v]), t: 'numsel' }],
      ['D', 'num', 'loads.posError', '유성 위치 공차 ± µm (핀 구멍)'], ['D', 'num', 'loads.carrierParallel', '캐리어 핀 구멍 평행도 µm'],
      ['A', 'num', 'loads.sunSupport.{i}.play', '{s}단 썬 지지 반경 유격 µm (베어링 틈새)', { st: 1 }],
      ['A', 'num', 'mc.samples', '시편 수 N'], ['A', 'num', 'mc.utilization', '공차 활용률 (3σ / 공차)'], ['A', 'num', 'reliability.covH', '접촉 피로 산포 σln'], ['A', 'num', 'reliability.covF', '굽힘 피로 산포 σln'],
      ['C', '이론 정격 (오차 0)', c => c.R?.capacityLife != null ? `${f(c.R.capacityLife, 2)} N·m` : '—', '완전한 부품·조립'],
      ['P', '시편 정격 평균 · P10 / P50 / P90', c => c.X?.MC ? `${f(c.X.MC.capacity.mean, 1)} · ${f(c.X.MC.capacity.p10, 1)} / ${f(c.X.MC.capacity.p50, 1)} / ${f(c.X.MC.capacity.p90, 1)} N·m (N = ${c.X.MC.n})` : '실행 전', '몬테카를로 시편']],
    w: ['mc', 'sens'], k: '목표 수명 달성 확률 ≥ 90 %', ok: c => c.X?.MC ? c.X.MC.passLife >= .9 : null };
  I['11-2'] = { what: '캐리어 강성을 FEA 결과와 비교한다.',
    how: 'FEA(판 굽힘 포함) 비틀림 강성 / 모델 강성 비가 0.7~1.3 안이면 모델을 쓴다. 벗어나면 6-3 기둥 등가 단면을 조정한다.',
    why: '모델은 판을 강체로 본다. FEA로 그 가정이 맞는지 확인한다.',
    rows: [['M', 'num', 'verify.feaKcar.0', '1단 FEA 비틀림 강성 N·m/mrad'], ['M', 'num', 'verify.feaKcar.1', '2단 FEA 비틀림 강성 N·m/mrad', { if: D => D.config.stages > 1 }], ['C', 'FEA / 모델', c => ck(c, '11-2'), '비']],
    up: ['6-6'], k: '비 0.7 ~ 1.3' };
  I['11-3'] = { what: '이뿌리 응력을 FEA 결과와 비교한다.',
    how: 'FEA 최대 주응력(정격) / ISO σF 비. 1.3을 넘으면 림·필렛 형상을 다시 본다.',
    why: 'ISO 식은 얇은 림·내접 링에서 오차가 크다.',
    rows: [['M', 'num', 'verify.feaSigmaF', 'FEA 최대 이뿌리 응력 MPa (정격)'], ['C', 'FEA / ISO', c => ck(c, '11-3'), '비']], up: ['5-8', '3-9'], k: '비 < 1.3' };
  I['11-4'] = { what: '시제품 시험 정격 토크를 예측값과 비교한다.',
    how: '시험값을 ISO 판정(보수적)과 시편 예측 P50(11-1)에 각각 비교한다.',
    why: '모델이 실제를 얼마나 맞히는지 보는 유일한 근거다. 차이가 크면 11-5로 가정을 역산한다.',
    rows: [['M', 'num', 'verify.testT', '시험 정격 토크 N·m'], ['M', 'str', 'verify.testNote', '시험 조건 (수명 기준·판정 방법·시편 수)'], ['C', '시험 / 예측', c => ck(c, '11-4'), '비']],
    up: ['10-1', '11-1'], k: '시험 / P50 = 0.7 ~ 1.3' };
  I['11-5'] = { what: '시험과 예측의 차이를 어떤 가정이 만들었는지 역산한다.',
    how: '피팅 지배일 때 정격 ∝ 1/(Kγ·KHβ). 시험값에 맞추는 계수 곱을 구해, 1보다 작으면 계수가 아닌 재료 한도·하중 정의·수명 조건을 의심한다.',
    why: '역산 결과로 어느 단계(2-7 지지, 6-5 핀, 9-1 재료)로 돌아갈지 정한다.',
    rows: [['C', '필요 계수', c => ck(c, '11-5'), '정격 ∝ 1/(Kγ·KHβ)'], ['J', 'cause', '차이 원인을 가정 대장의 특정 항목으로 지목했다']], up: ['11-4'], k: '판정 없음 (원인 규명)' };
  I['11-6'] = { what: '계산에 들어간 모든 계수와 근거 등급(규격·모델·가정)을 정리한다.',
    how: '엔진이 쓴 계수를 자동으로 모아 근거를 표시한다. 가정 항목이 결과 신뢰도를 정한다.',
    why: '가정 항목을 실측으로 바꿀수록 예측이 실제에 가까워진다.',
    rows: [['C', '가정 개수', c => `${c.R?.register?.length || 0}개 · 가정 ${(c.R?.register || []).filter(r => r.src === '가정').length}개`, '']], w: ['register'], k: '판정 없음' };

  // ============================================================== 12 출력물
  I['12-1'] = { what: '부품별 형상 치수와 도면(정면·단면)을 확인한다.',
    how: '빈칸은 기어·베어링 치수에서 자동, 값을 넣으면 그 값을 쓴다. 3D·BOM·도면에 같이 반영된다.',
    why: '가공 의뢰의 기준이다. 자동값 그대로인지 확인한 치수인지 구분해야 한다.',
    rows: [['J', 'dims', '모든 부품 치수를 자동값/확정값으로 구분해 검토했다']], w: ['drawing', 'partDims'], k: '판정 없음' };
  I['12-2'] = { what: 'CAD로 넘길 치수 변수와 스크립트를 낸다.',
    how: '솔리드웍스 전역변수 또는 CadQuery 스크립트를 클립보드로 복사한다 (기어는 피치원 원통 근사).',
    why: '사이트 치수와 CAD 모델을 한 번에 맞춘다.',
    rows: [['C', '내보내기', () => '솔리드웍스 전역변수 · CadQuery 스크립트', '']], k: '판정 없음' };
  I['12-3'] = { what: '부품 목록(BOM)·옵션 부품·중량을 확인한다.',
    how: '3D 모델 부품 목록에서 수량·재료·중량을 집계한다. 옵션 부품은 표시를 끄면 BOM에서 빠진다.',
    why: '원가(D5)와 중량(10-7)의 기준이다.',
    rows: [['C', '부품 · 중량', c => `${c.X?.parts || 0}종 · ${f(c.X?.mass, 0)} g`, '']], w: ['components', 'bom'], k: '판정 없음' };
  I['12-4'] = { what: '성능 데이터시트를 만든다.',
    how: '정격·피크·효율·백래시·강성·수명·외경·중량·원가를 한 표로 모은다.',
    why: '고객·제어 측에 주는 최종 수치다. 예측값과 측정값을 구분해 표기해야 한다.',
    rows: [['J', 'mark', '데이터시트의 예측값·측정값 구분을 표기했다']], k: '판정 없음' };
  I['12-5'] = { what: '설계 근거(구조 선택·가정·덮어쓴 치수)를 기록한다.',
    how: '구조 선택, 가정 대장, 형상 덮어쓰기 개수를 모아 둔다.',
    why: '나중에 왜 이렇게 했는지를 추적한다.',
    rows: [['C', '근거 요약', c => ck(c, '12-5'), '']], k: '판정 없음' };
  I['12-6'] = { what: '검토자·승인 상태를 기록한다.',
    how: '모든 게이트 통과와 항목 검토 완료를 확인한 뒤 승인한다.',
    why: '출시 결정의 기록이다.',
    rows: [['D', 'sel', 'review.status', '상태', { o: [['draft', '검토 전'], ['review', '검토 중'], ['approved', '승인'], ['rejected', '반려']] }], ['D', 'str', 'review.by', '검토자'], ['D', 'str', 'review.date', '날짜'], ['D', 'str', 'review.note', '메모']],
    k: '승인' };

  // ============================================================== D 가공·원가 (병행)
  I['D1'] = { what: '부품별 가공 방식을 정한다 (구조 개념과 같이).',
    how: '썬·유성 = 호빙·셰이핑, 링 = 셰이핑·스카이빙·브로칭·와이어, 캐리어 = 일체 가공·판 조립·소결, 하우징 = 선삭·주조, 핀 = 구매·자체 연삭.',
    why: '가공 방식이 헬리컬 가능 여부(D2), 링 결합(2-4), 원가(D5)를 묶는다.',
    rows: [['D', 'sel', 'dfm.proc.sun', '썬', { o: [['hob', '호빙'], ['shape', '셰이핑']] }], ['D', 'sel', 'dfm.proc.planet', '유성', { o: [['hob', '호빙 (스택)'], ['shape', '셰이핑']] }],
      ['D', 'sel', 'dfm.proc.ring', '링', { o: [['shape', '셰이핑'], ['skive', '파워 스카이빙'], ['broach', '브로칭'], ['wire', '와이어컷']] }], ['D', 'sel', 'dfm.proc.carrier', '캐리어', { o: [['mill', '일체 선삭+밀링'], ['plate', '판 조립'], ['sinter', '소결·MIM']] }],
      ['D', 'sel', 'dfm.proc.housing', '하우징', { o: [['turn', '선삭'], ['cast', '주조+가공']] }], ['D', 'sel', 'dfm.proc.pin', '핀', { o: [['buy', '구매품'], ['grind', '자체 연삭']] }]],
    up: ['2-4'], k: '판정은 D2에서' };
  I['D2'] = { what: '공구·공정 제약을 검사한다.',
    how: '비규격 모듈 → 특수 호브, 헬리컬 링 셰이핑 → 나선 가이드, 와이어컷 헬리컬 불가, 모터축 일체 → 호브 도피 등.',
    why: '설계는 맞아도 가공이 안 되거나 공구비가 폭증하는 경우를 미리 잡는다.',
    rows: [['C', '제약', c => ck(c, 'D2'), '규칙 검사'], ['J', 'vendor', '가공처와 공구 보유 여부를 확인했다']], up: ['D1', '3-6', '3-8'], k: '불가·비규격 없음' };
  I['D3'] = { what: '공차 배분이 강도에 주는 영향을 확인한다.',
    how: '유성 위치 공차와 정밀도 등급이 시편 시뮬레이션(11-1)에서 Kγ·KHβ 분포를 얼마나 넓히는지 본다. 입력은 11-1에서 바꾼다.',
    why: '공차를 풀면 원가는 내려가지만 Kγ가 올라 강도가 떨어진다.',
    rows: [['C', '공차 → Kγ', c => ck(c, 'D3'), '5-6 모델'], ['C', '현재 공차', c => `유성 위치 ±${c.D.loads.posError} µm · 평행도 ${c.D.loads.carrierParallel} µm · 정밀도 ${c.D.stages.slice(0, c.D.config.stages).map(s => 'N' + s.grade).join('/')}`, '입력은 11-1']],
    up: ['11-1'], k: '시편 Kγ P90 ≤ 1.3' };
  I['D4'] = { what: '최소 두께(림·판·벽·포켓)로 가공 가능 여부를 검사한다.',
    how: '썬·유성 림 ≥ 1.2·h, 링 림 ≥ 3.5·m, 하우징 벽 ≥ 0.8, 캐리어 판 ≥ 1, 포켓 ≥ 2 mm.',
    why: '얇은 부위는 열처리 변형·가공 떨림으로 정밀도를 잃는다.',
    rows: [['C', '최소 두께', c => ck(c, 'D4'), '부위별 하한']], up: ['3-9', '6-2', '8-1'], k: '모든 부위 하한 이상' };
  I['D5'] = { what: '대당 원가를 추정한다.',
    how: '소재(중량 × 1.6 × 단가) + 가공(시간 × 임률 + 셋업/수량) + 열처리 + 구매품. 시간·단가는 가정이며 견적으로 바꾸면 실측이 된다.',
    why: '설계 대안의 원가 차이를 비교한다.',
    rows: [['D', 'num', 'dfm.qty', '생산 수량'], ['A', 'num', 'dfm.rate', '가공 임률 원/h'], ['A', 'num', 'dfm.steel', '강 소재 원/kg'], ['A', 'num', 'dfm.alu', '알루미늄 원/kg'], ['A', 'num', 'dfm.ht', '열처리 원/kg'],
      ['M', 'num', 'dfm.quote', '실제 견적 원/대'], ['P', '추정 원가', c => ck(c, 'D5'), '원가 모델']],
    up: ['D1', '12-3'], k: '판정 없음 (목표 원가 대비 설계자 판단)' };
  I['D6'] = { what: '원가 절감 대안을 본다.',
    how: '부품 공용화, 구매품 전환, 스퍼 전환, 수량별 공법 전환 등을 규칙으로 제안하고 절감액을 추정한다.',
    why: '절감안은 강도·공차를 바꿀 수 있어 해당 단계로 돌아가 회귀 검토가 필요하다.',
    rows: [['C', '제안', c => ck(c, 'D6'), '규칙 기반'], ['J', 'regress', '채택한 절감안의 영향 항목을 회귀 검토했다']], up: ['D5'], k: '판정 없음' };

  // ---------------------------------------------------------------- 출처 구분
  const SRC = {
    D: { t: '설계자 검토', s: '사람이 정하는 값·확인할 사항', c: 'sD' },
    C: { t: '자동 계산', s: '규격식·기하식으로 사이트가 계산', c: 'sC' },
    M: { t: '실측·외부 데이터', s: '시험·측정·카탈로그·데이터시트에서 가져올 값', c: 'sM' },
    A: { t: '가정·예측 모델', s: '근거가 약한 가정값과 물리 모델 추정', c: 'sA' },
  };
  const grp = r => r[0] === 'J' ? 'D' : r[0] === 'P' ? 'A' : r[0];
  globalThis.PGDItems = { I, SRC, grp };
})();
