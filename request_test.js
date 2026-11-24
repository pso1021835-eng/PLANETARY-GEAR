// 설계의뢰서 (PGD-REQ-2) 읽기 · 검증 · 요구 정격 산출 (docs/DESIGN-ALGORITHM.md §1 · §2-1)
const assert = require('assert'), fs = require('fs');
const Q = require('./request.js');
const FILE = 'templates/설계의뢰서_' + Q.FORMAT + '.xlsx';
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-6, `${m}: ${a} ≠ ${b}`);
(async () => {
  const buf = fs.readFileSync(FILE);
  // 1) 예시 시트 = 표준 DB 의뢰 조건과 일치
  const std = JSON.parse(fs.readFileSync('designs/standard-d100-l100-i25.json', 'utf8')).request;
  let r = await Q.readXlsx(buf, { sheet: '예시 (표준 DB)' });
  assert(r.ok, JSON.stringify(r.errors));
  for (const k of ['Trated', 'Tpeak', 'Temerg', 'rpm', 'lifeH', 'ratio', 'Dmax', 'Lmax', 'basis']) assert.strictEqual(r.engineReq[k], std[k], k);
  assert.deepStrictEqual(r.engineReq.ext, std.ext);
  near(r.target.TR, 32.5, 'TR×1.3'); near(r.target.lifeH, 26000, 'life×1.3');
  assert.strictEqual(r.meta.client, '세라로보틱스'); assert.strictEqual(r.hollow, null);
  assert(r.assumptions.some(a => a.id === 'I10')); assert(!r.assumptions.some(a => a.id === 'I11'));  // 수명은 입력함
  // 2) 빈 양식: 필수 항목 6개 오류, 양식 버전은 정상
  r = await Q.readXlsx(buf);
  assert(!r.ok); assert.deepStrictEqual(r.errors.map(e => e.id).sort(), ['I3', 'I5', 'I6', 'I7', 'I8', 'I9']);
  // 3) 정격 체계 §2-1 (η 0.95)
  const base = { I1: 1, I2: 3, I3: 3000, I5: 20, I7: 25, I8: 100, I9: 100 };
  const P = (o) => Q.parse(Object.assign({}, base, o));
  r = P({ I6: '정격' });                       // TR=20, TA=max(3·25·.95=71.25, 20), TM=max(1.5·71.25, 71.25)
  near(r.derived.TR, 20, '정격 TR'); near(r.derived.TA, 71.25, '정격 TA'); near(r.derived.TM, 106.875, '정격 TM');
  near(r.derived.nOut, 120, 'nOut'); near(r.derived.nInMax, 4500, 'nmax 가정'); assert(r.assumptions.some(a => a.id === 'I4'));
  r = P({ I6: '반복 피크' });                  // TR=min(23.75, 20), TA=20, TM=max(30, 71.25)
  near(r.derived.TR, 20, '피크 TR'); near(r.derived.TA, 20, '피크 TA'); near(r.derived.TM, 71.25, '피크 TM');
  r = P({ I6: '순간 최대', I5: 80 });          // TR=min(23.75, 40), TA=min(71.25, 80), TM=80
  near(r.derived.TR, 23.75, '순간 TR'); near(r.derived.TA, 71.25, '순간 TA'); near(r.derived.TM, 80, '순간 TM');
  r = P({ I6: '모름' });                        // TR=23.75, TA=71.25, TM=106.875
  near(r.derived.TR, 23.75, '모름 TR'); near(r.derived.TM, 106.875, '모름 TM'); assert(r.assumptions.some(a => a.id === 'I6'));
  // 4) 직접 지정값은 그대로 (사용자 입력 불변)
  r = P({ I6: '정격', I13: 50, I14: 60 }); near(r.derived.TA, 50, 'I13'); near(r.derived.TM, 60, 'I14');
  // 5) 빈칸과 0 구분 · 오류 판정
  assert.strictEqual(P({ I6: '정격', I10: 0 }).hollow, 0); assert.strictEqual(P({ I6: '정격' }).hollow, null);
  assert(!P({ I6: '정격', I7: 60 }).ok); assert(!P({ I6: '정격', I7: 2 }).ok);
  assert(!P({ I6: '정격', I2: 0.5 }).ok);                       // 최대 < 정격
  assert(!P({ I6: '정격', I5: 'abc' }).ok); assert(!P({ I6: '정격', I5: 0 }).ok); assert(!P({ I6: '정격', I5: -1 }).ok);
  assert(!P({ I6: '평균' }).ok);
  assert(!P({ I6: '정격', I10: 50 }).ok);                       // 중공 ≥ 외경/2
  assert(!P({ I6: '반복 피크', I13: 30 }).ok);                  // 종류와 직접 지정 불일치
  assert(!P({ I6: '정격', I13: 10 }).ok);                       // 반복 피크 < 정격
  assert(!Q.parse({ I3: 3000, I5: 20, I6: '모름', I7: 25, I8: 100, I9: 100 }).ok);   // 모터 없이 '모름' 불가
  assert(P({ I6: '정격', I5: '1,000' }).ok);                    // 천 단위 쉼표 허용
  // 6) 손상 파일 · 시트 없음
  await assert.rejects(Q.readXlsx(Buffer.from('not a zip')), /xlsx 파일이 아님/);
  await assert.rejects(Q.readXlsx(buf, { sheet: '없는 시트' }), /시트 없음/);
  console.log('설계의뢰서 PGD-REQ-2: all ok');
})().catch(e => { console.error(e); process.exit(1); });
