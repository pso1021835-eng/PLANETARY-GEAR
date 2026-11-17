/* 유성감속기 설계실 — 설계 공정 (globalThis.PGDProc)
   화이트보드 '유성감속기 설계 프로세스'의 12단계 · 93개 세부 항목 + 가공·원가 병행 트랙을 데이터로 옮긴 것.
   각 항목: 번호, 이름, 사이트에서의 상태(kind), 다루는 화면(view), 현재 값(val), 판정(ok).
   kind  in   = 사이트에 입력이 있음 (사용자가 정함)
         calc = 사이트가 계산·검사함
         man  = 사람이 판단 (사이트에 근거 기록만)
         none = 아직 사이트에 없음
   val/ok 함수는 (R, D, X)를 받는다. X = { MC, parts } (앱이 넘기는 부가 결과). 실패하면 값 없음으로 둔다. */
(function () {
  'use strict';
  const f = (x, d = 2) => Number.isFinite(x) ? (+x.toFixed(d)).toLocaleString('ko-KR') : '—';
  const st = R => R?.ctx?.stages || [];
  const chk = (R, name) => st(R).map(s => s.geo.checks.find(c => c.k === name)).filter(Boolean);
  const chkVal = (R, name, d = 2) => chk(R, name).map((c, i) => `${i + 1}단 ${typeof c.v === 'number' ? f(c.v, d) : c.v}`).join(' · ');
  const chkOk = (R, ...names) => { const cs = names.flatMap(n => chk(R, n)); return cs.length ? cs.every(c => c.ok) : null; };
  const vd = (R, k) => R?.verdict?.find(x => x.k === k);
  const vdOk = (R, ...ks) => { const xs = ks.map(k => vd(R, k)).filter(Boolean); return xs.length ? xs.every(x => x.ok) : null; };
  const vdVal = (R, k) => { const x = vd(R, k); return x ? (x.unit === 'h' ? f(x.value, 0) + ' h' : f(x.value, x.unit === '%' ? 1 : 2) + (x.unit ? ' ' + x.unit : '')) : null; };
  const rows = R => R?.rated?.rows || [];
  const minOf = (R, key) => Math.min(...rows(R).map(r => r[key]));
  const perStage = (R, fn) => st(R).map((s, i) => `${i + 1}단 ${fn(s, i)}`).join(' · ');
  const rs = R => R?.rated?.stages || [];

  const STAGES = [
    { n: 1, name: '요구사양', views: ['s1'], items: [
      ['1-1', '관절 케이스 선택', 'in', 's1', (R, D) => D.req.case === 'custom' ? '사용자 정의' : D.req.case],
      ['1-2', '정격·피크·비상 토크', 'in', 's1', (R, D) => `${D.req.Trated} / ${D.req.Tpeak} / ${D.req.Temerg} N·m`],
      ['1-3', '입력 회전수·관절 속도', 'in', 's1', (R, D) => `${D.req.rpm} rpm`],
      ['1-4', '부하 스펙트럼·목표 수명', 'in', 's1', (R, D) => `${D.req.lifeH} h · ${D.req.duty?.length || 0}구간`],
      ['1-5', '외부하중 Fr·Fa·M', 'in', 's1', (R, D) => D.req.ext ? `${D.req.ext.Fr} N · ${D.req.ext.Fa} N · ${D.req.ext.M} N·m` : null],
      ['1-6', '외경·길이 한계', 'none', 's1'],
      ['1-7', '중공 지름', 'in', 'shous', (R, D) => D.geom?.inshaft?.id ? `Ø${D.geom.inshaft.id}` : '자동'],
      ['1-8', '백래시·강성 목표', 'in', 's1', (R, D) => `백래시 ≤ ${D.req.backlashMax} arcmin · 강성 목표 없음`],
      ['1-9', '효율·소음·온도 목표', 'in', 's1', (R, D) => `효율 ≥ ${D.req.effMin} %`],
    ], gate: ['판정 토크 정의 합의', (R, D) => D.req.Trated > 0 && D.req.Tpeak >= D.req.Trated && D.req.Temerg >= D.req.Tpeak] },
    { n: 2, name: '구조 개념', views: ['s2'], items: [
      ['2-1', '단수 결정', 'in', 's2', (R, D) => `${D.config.stages}단`],
      ['2-2', '감속비 분배', 'calc', 's2', R => `${f(R.ratio, 3)} : 1 (${st(R).map(s => f(1 + (s.st.s + 2 * s.st.p) / s.st.s, 3)).join(' × ')})`],
      ['2-3', '링 1·2단 공유', 'in', 's2', (R, D) => D.config.sharedRing ? '공유 (R1-2)' : '단별'],
      ['2-4', '링–하우징 결합', 'none', 's2'],
      ['2-5', 'C1–S2 결합 방식', 'none', 's2'],
      ['2-6', 'S1–모터축 결합', 'none', 's2'],
      ['2-7', 'S1·C1 지지 베어링', 'in', 's7', (R, D) => (D.loads.sunSupport || []).map((s, i) => `S${i + 1} ${s.mode === 'structure' ? `베어링 ${s.bearingK} N/µm` : `${s.k} N/µm`}`).join(' · ')],
      ['2-8', 'C2·출력 베어링 배치', 'man', 's9', (R, D) => D.outBearing?.name],
      ['2-9', '유성 수 (3·4·5)', 'in', 's3', (R, D) => D.stages.map(s => s.n).join(' / ') + '개'],
      ['2-10', '하중 경로도 작성', 'none', 's2'],
    ], gate: ['모든 부품 구속 확인', () => null] },
    { n: 3, name: '기어 제원', views: ['s3'], items: [
      ['3-1', '링 잇수 후보', 'calc', 's3', R => perStage(R, s => `R ${s.st.s + 2 * s.st.p}`)],
      ['3-2', '썬·유성 잇수 탐색', 'in', 's3', R => perStage(R, s => `S${s.st.s}/P${s.st.p}`)],
      ['3-3', '조립 조건 (zs+zr)/n', 'calc', 's3', R => chkVal(R, '등간격 조립 (S+R)/Np', 2), R => chkOk(R, '등간격 조립 (S+R)/Np')],
      ['3-4', '인접 간섭 검사', 'calc', 's3', R => chkVal(R, '인접 유성 이끝 간격 (mm)') + ' mm', R => chkOk(R, '인접 유성 이끝 간격 (mm)')],
      ['3-5', '감속비 오차 ≤ 1%', 'none', 's2'],
      ['3-6', '모듈 역산 (피팅)', 'in', 's3', R => perStage(R, s => `m ${s.st.m}`) + ' · 역산 없음'],
      ['3-7', '치폭비 b/d', 'in', 's3', R => perStage(R, s => `${s.st.b} mm (b/d ${f(s.st.b / (s.st.m * s.st.s / Math.cos(s.st.beta * Math.PI / 180)), 2)})`)],
      ['3-8', '비틀림각 (εβ)', 'calc', 's3', R => perStage(R, s => `β ${s.st.beta}°`) + ' · εβ ' + chkVal(R, '축방향 물림률 εβ'), R => chkOk(R, '축방향 물림률 εβ')],
      ['3-9', '전위 배분·림·보어', 'in', 's3', R => chkVal(R, '외접·내접 중심거리 차 (mm)', 3) + ' mm', R => chkOk(R, '외접·내접 중심거리 차 (mm)')],
    ], gate: ['기하 조건 통과', R => chkOk(R, '등간격 조립 (S+R)/Np', '외접·내접 중심거리 차 (mm)', '인접 유성 이끝 간격 (mm)')] },
    { n: 4, name: '치형·정밀도', views: ['s4', 's5'], items: [
      ['4-1', '언더컷·이끝 첨예', 'calc', 's4', R => '이끝 두께 ' + chkVal(R, '썬 이끝 두께 (mm)') + ' mm', R => chkOk(R, '외접 언더컷', '썬 이끝 두께 (mm)', '유성 이끝 두께 (mm)', '링 이끝 두께 (mm)')],
      ['4-2', '물림률 εα·εβ', 'calc', 's4', R => 'S–P ' + chkVal(R, '썬–유성 εα'), R => chkOk(R, '썬–유성 εα', '유성–링 εα')],
      ['4-3', '헌팅 투스', 'calc', 's4', R => chk(R, '헌팅 투스 (공약수 없음)').every(c => c.ok) ? '공약수 없음' : '공약수 있음', R => chkOk(R, '헌팅 투스 (공약수 없음)')],
      ['4-4', '내접 간섭 (트로코이드)', 'calc', 's4', R => chkVal(R, '내접 인볼류트 간섭 여유', 3), R => chkOk(R, '내접 인볼류트 간섭 여유', '이끝·이뿌리 최소 간극 (mm)')],
      ['4-5', '정밀도 등급 ISO 1328', 'in', 's5', (R, D) => D.stages.map(s => `${s.grade}급`).join(' / ')],
      ['4-6', '치형·리드 수정', 'in', 's5', (R, D) => D.stages.map(s => `크라우닝 ${s.mod?.crown ?? 0} µm`).join(' / ')],
      ['4-7', '백래시·공차', 'calc', 's5', R => `출력 ${f(R.backlash?.arcmin, 1)} arcmin`],
    ], gate: ['치형 경고 없음', R => st(R).length ? st(R).every(s => !s.geo.warns.length) : null] },
    { n: 5, name: '하중계수·기어 강도', views: ['s7', 's8'], items: [
      ['5-1', '단별 토크·상대 회전수', 'calc', 's7', R => rs(R).map((s, i) => `${i + 1}단 캐리어 기준 ${f(s.rel, 0)} rpm`).join(' · ')],
      ['5-2', '사용계수 KA', 'in', 's7', (R, D) => f(D.loads.KA, 2)],
      ['5-3', '동하중 Kv', 'calc', 's7', R => f(Math.max(...rows(R).map(r => r.f.Kv)), 3) + ' (최대)'],
      ['5-4', '치폭 분포 KHβ', 'calc', 's7', R => f(Math.max(...rows(R).map(r => r.f.KHb)), 2) + ' (최대)', R => Math.max(...rows(R).map(r => r.f.KHb)) <= 2 ? true : false],
      ['5-5', '정면 분포 KHα', 'calc', 's7', R => f(Math.max(...rows(R).map(r => r.f.KHa)), 2) + ' (최대)'],
      ['5-6', '유성 하중분배 Kγ', 'calc', 's7', R => rs(R).map((s, i) => `${i + 1}단 ${f(s.Kg, 2)}`).join(' · '), R => rs(R).every(s => s.Kg <= 1.3)],
      ['5-7', '치면 피팅 SH', 'calc', 's8', R => f(minOf(R, 'SH'), 2) + ' (최소)', (R, D) => minOf(R, 'SH') >= D.req.SH],
      ['5-8', '이뿌리 굽힘 SF', 'calc', 's8', R => f(minOf(R, 'SF'), 2) + ' (최소)', (R, D) => minOf(R, 'SF') >= D.req.SF],
      ['5-9', '스커핑 (섬광 온도)', 'calc', 'smat', R => vdVal(R, '스커핑 안전율 (피크, 섬광온도)'), R => vdOk(R, '스커핑 안전율 (피크, 섬광온도)')],
      ['5-10', '윤활 유막 λ', 'calc', 'smat', R => f(R.lube?.lambdaMin, 2) + ' (최소)', R => R.lube?.lambdaMin >= 1],
      ['5-11', '스펙트럼 누적 손상', 'calc', 's8', R => vdVal(R, '부하 스펙트럼 수명 (기어)'), R => vdOk(R, '부하 스펙트럼 수명 (기어)')],
      ['5-12', '피크 정적 안전율', 'calc', 's8', R => vdVal(R, '피크 토크 정적 안전율'), R => vdOk(R, '피크 토크 정적 안전율', '비상 토크 정적 안전율')],
    ], gate: ['SH·SF 목표 통과', R => vdOk(R, '정격 토크 · 목표 수명 (기어)')] },
    { n: 6, name: '캐리어·핀', views: ['scar'], items: [
      ['6-1', '양단·편단 지지', 'in', 'scar', (R, D) => D.stages.map(s => s.pin.type === 'single' ? '편단' : '양단').join(' / ')],
      ['6-2', '판 두께·외경·통과 구멍', 'calc', 'scar', R => (R.carrierPin || []).map((c, i) => `${i + 1}단 판 ${f(c.geometry?.wall, 1)} · Ø${f(c.geometry?.outerD, 1)}`).join(' · ')],
      ['6-3', '기둥 수·폭·위치', 'in', 'scar', (R, D) => D.stages.map(s => `${s.n}개 × ${s.carrier.webW} mm`).join(' / ')],
      ['6-4', '핀 지름·끼움', 'in', 'scar', (R, D) => D.stages.map(s => `Ø${s.pin.d}`).join(' / ')],
      ['6-5', '핀 굽힘·처짐', 'calc', 'scar', R => (R.bearings || []).map((b, i) => `${i + 1}단 ${f(b.pinSigmaPeak, 0)} MPa`).join(' · ') + ' (피크)'],
      ['6-6', '캐리어 비틀림 강성', 'calc', 'scar', R => (R.stiffness?.stages || []).map(s => `${s.stage}단 ${f(s.Kcar / 1000, 0)} N·m/mrad`).join(' · ')],
      ['6-7', 'C1–S2 결합부 강도', 'none', 'scar'],
    ], gate: ['정적 안전율 ≥ 2', R => vdOk(R, '유성 핀·캐리어 정적 (피크)')] },
    { n: 7, name: '베어링', views: ['s9'], items: [
      ['7-1', '유성 베어링 방식', 'in', 's9', (R, D) => D.stages.map(s => s.bearing.name).join(' / ')],
      ['7-2', '니들 Dw·Lw·Z', 'none', 's9'],
      ['7-3', '유성 L10·s0', 'calc', 's9', R => vdVal(R, '유성 베어링 L10 (스펙트럼)'), R => vdOk(R, '유성 베어링 L10 (스펙트럼)', '유성 베어링 정적 s0 (피크)')],
      ['7-4', '썬 지지 베어링', 'in', 's7', (R, D) => (D.loads.sunSupport || []).map((s, i) => `S${i + 1} Ø${s.od}×${s.id}`).join(' · ')],
      ['7-5', '출력 dp·Dw·Z', 'in', 's9', (R, D) => `dp ${D.outBearing.dp} · Dw ${D.outBearing.Dw} · Z ${D.outBearing.Z}`],
      ['7-6', '출력 L10·모멘트 강성', 'calc', 's9', R => vdVal(R, '출력 베어링 L10'), R => vdOk(R, '출력 베어링 L10', '출력 베어링 정적 s0 (피크)', '출력 베어링 롤러 접촉 s0 (피크)')],
      ['7-7', '축방향 유격·예압', 'in', 's9', (R, D) => `예압 ${D.outBearing.preload ?? 0} µm`],
    ], gate: ['전 베어링 수명 통과', R => vdOk(R, '유성 베어링 L10 (스펙트럼)', '유성 베어링 정적 s0 (피크)', '출력 베어링 L10', '출력 베어링 정적 s0 (피크)', '출력 베어링 롤러 접촉 s0 (피크)')] },
    { n: 8, name: '하우징·체결', views: ['shous'], items: [
      ['8-1', '하우징 벽 두께', 'in', 'shous', (R, D) => `${D.housing?.wall ?? '자동'} mm`],
      ['8-2', '링 고정 (압입·볼트)', 'none', 'shous'],
      ['8-3', '탭 수·볼트 호칭', 'in', 'shous', (R, D) => D.housing ? `M${D.housing.boltD} × ${D.housing.boltN} · 체결 강도 계산 없음` : null],
      ['8-4', '입력·출력 커버', 'in', 'shous', (R, D) => D.housing ? `커버 ${D.housing.coverT} mm` : null],
      ['8-5', '출력 플랜지·중공축', 'in', 'shous', (R, D) => D.housing ? `플랜지 ${D.housing.flangeT} mm` : null],
      ['8-6', '오일 실', 'in', 'shous', () => '형상만 · 마찰 손실은 기타 손실로'],
      ['8-7', '조립 순서·공차 체인', 'none', 'shous'],
    ], gate: ['체결 여유 1.5배', () => null] },
    { n: 9, name: '재료·열처리', views: ['smat'], items: [
      ['9-1', '기어 재료·열처리', 'in', 'smat', (R, D) => [...new Set(D.materials.map(m => m.family))].join(' · ')],
      ['9-2', '품질 등급 (MQ)', 'in', 'smat', (R, D) => D.design?.quality || 'MQ'],
      ['9-3', '경도·유효 경화층', 'calc', 'smat', R => `경화층/필요 깊이 ${f(Math.min(...(R.caseDepth || []).map(c => c.ratio)), 2)} (최소)`, R => (R.caseDepth || []).every(c => c.ratio >= 1)],
      ['9-4', '핀·궤도면 경도', 'in', 'scar', (R, D) => D.stages.map(s => s.pin.material).join(' / ') + ' · 경도 보정 없음'],
      ['9-5', '하우징·캐리어 재료', 'in', 'scar', (R, D) => D.stages.map(s => s.carrier.material).join(' / ')],
      ['9-6', '허용응력 확정', 'calc', 'smat', R => { const g = R.govRated?.row?.f; return g ? `σHlim ${g.Hlim} · σFlim ${g.Flim} MPa` : null; }],
    ], gate: ['재료 사양 확정', R => st(R).length ? st(R).every(s => s.mats.every(m => !m.warnings.length)) : null] },
    { n: 10, name: '성능 예측', views: ['s10'], items: [
      ['10-1', '정격토크 (최소값)', 'calc', 'overview', (R, D) => `${f(R.reducerCap, 2)} N·m (목표 ${D.req.Trated})`, (R, D) => R.reducerCap >= D.req.Trated],
      ['10-2', '스펙트럼 수명', 'calc', 's8', R => vdVal(R, '부하 스펙트럼 수명 (기어)'), R => vdOk(R, '부하 스펙트럼 수명 (기어)')],
      ['10-3', '비틀림 강성', 'calc', 's10', R => `${f(R.stiffness?.NmPerArcmin, 1)} N·m/arcmin`],
      ['10-4', '백래시·로스트 모션', 'calc', 's10', R => vdVal(R, '출력 백래시 (추정)'), R => vdOk(R, '출력 백래시 (추정)')],
      ['10-5', '효율 (치합·베어링·실)', 'calc', 's10', R => vdVal(R, '효율 (정격, 추정)'), R => vdOk(R, '효율 (정격, 추정)')],
      ['10-6', '발열·온도', 'in', 'smat', (R, D) => `운전 온도 ${D.lube.temp} °C 가정 · 열평형 계산 없음`],
      ['10-7', '중량·관성', 'calc', 'overview', (R, D, X) => X?.mass ? `약 ${f(X.mass, 0)} g` : null],
    ], gate: ['요구사양 충족', R => R?.verdict?.length ? R.verdict.every(x => x.ok) : null] },
    { n: 11, name: '검증', views: ['s11', 'reg'], items: [
      ['11-1', '공차 몬테카를로', 'calc', 's11', (R, D, X) => X?.MC ? `P50 ${f(X.MC.capacity.p50, 1)} N·m` : '실행 전', (R, D, X) => X?.MC ? X.MC.passLife >= .9 : null],
      ['11-2', 'FEA 캐리어·핀 강성', 'none', 's11'],
      ['11-3', 'FEA 이뿌리 응력', 'none', 's11'],
      ['11-4', '시험값 비교', 'none', 's11'],
      ['11-5', '가정 역산·보정', 'none', 's11'],
      ['11-6', '가정 대장 갱신', 'calc', 'reg', R => `${R.register?.length || 0}개 가정`],
    ], gate: ['차이 원인 규명', () => null] },
    { n: 12, name: '출력물', views: ['out'], items: [
      ['12-1', '부품 도면', 'calc', 'shous', () => '정면도·단면도 (사이트)'],
      ['12-2', 'STEP 조립체', 'none', 'overview'],
      ['12-3', 'BOM·중량', 'calc', 'overview', (R, D, X) => X?.parts ? `${X.parts}종` : null],
      ['12-4', '성능 데이터시트', 'none', 'overview'],
      ['12-5', '설계 근거 기록', 'none', 'reg'],
      ['12-6', '검토·승인', 'man', 'overview'],
    ], gate: ['출시 승인', () => null] },
  ];
  const DFM = { n: 'D', name: '가공·원가 (병행)', views: ['out'], items: [
    ['D1', '가공 방식 후보 (2단계와)', 'none', 's2'],
    ['D2', '공구·공정 제약 (3·4단계와)', 'none', 's3'],
    ['D3', '공차 배분 (4·6단계와)', 'in', 's7', (R, D) => `유성 위치오차 ${D.loads.posError} µm · 정밀도 ${D.stages.map(s => s.grade).join('/')}급`],
    ['D4', '가공 가능 검사 (6·8단계와)', 'none', 'shous'],
    ['D5', '원가 추정 (10단계와)', 'none', 'overview'],
    ['D6', '원가 절감 대안 (11단계와)', 'none', 'overview'],
  ], gate: ['원가 목표 충족', () => null] };

  const KIND = { in: '입력', calc: '계산', man: '판단', none: '미구현' };
  const safe = (fn, ...a) => { if (!fn) return null; try { const v = fn(...a); return v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? null : v; } catch (e) { return null; } };

  // evaluate every item against a result
  function evaluate(R, D, X) {
    const ok = !!(R && !R.errors?.length);
    return [...STAGES, DFM].map(g => {
      const items = g.items.map(([id, t, kind, view, val, chkFn]) => {
        const ck = ok ? X?.CK?.[id] : null, fm = globalThis.PGDChecks?.FORMS?.[id];
        if (ck) return { id, t, kind: ck.kind || 'calc', view: fm?.view || view, val: ck.val ?? null, ok: ck.ok ?? null };
        return { id, t, kind, view: fm?.view || view, val: ok ? safe(val, R, D, X) : null, ok: ok ? safe(chkFn, R, D, X) : null };
      });
      const gck = ok ? X?.CK?.['gate-' + g.n] : null;
      const gate = { t: g.gate[0], ok: gck ? gck.ok ?? null : ok ? safe(g.gate[1], R, D, X) : null };
      const done = items.filter(i => i.kind === 'in' || i.kind === 'calc').length;
      return { n: g.n, name: g.name, views: g.views, items, gate, done, total: items.length };
    });
  }
  const viewItems = (E, view) => E.flatMap(g => g.items.filter(i => i.view === view));

  globalThis.PGDProc = { STAGES, DFM, KIND, evaluate, viewItems };
})();
