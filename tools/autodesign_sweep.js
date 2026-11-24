// 자동 설계 반복 검증: tools/autodesign_cases.json 의 의뢰서마다 판정 기준(ISO · 오차 0 가정)별 결과를 표로 출력
// 실행: node tools/autodesign_sweep.js > 결과.md   (사례당 1~25 s)
const P = require('path').join(__dirname, '..') + '/';
const E = require(P + 'engine.js'); ['carrier-geometry', 'bearings', 'viewer3d', 'checks', 'process'].forEach(m => require(P + m + '.js'));
const REC = require(P + 'recommend.js'), Q = require(P + 'request.js'), A = require(P + 'autodesign.js');
const cases = require('./autodesign_cases.json'), f = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d) : '—';
const ST = { pass: '충족', short: '미달', none: '조합 없음', input: '입력 오류' };
(async () => {
  const tally = {};
  for (const basis of ['iso', 'ideal']) {
    console.log(`\n### 판정 기준: ${basis === 'iso' ? 'ISO 계산 조건 (§3 기본)' : '오차 0 가정 (참고)'}\n`);
    console.log('| 의뢰 | 결과 | 목표 정격 (×1.3) | 예측 정격 | 오차 0 / ISO | 외형 | 질량 | 남은 미달 | 권장 미충족 | 시간 |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    for (const c of cases) {
      const q = Q.parse(c), r = await A.run(q, { E, C: PGDChecks, P: PGDProc, REC, PG: PGD3D, basis });
      tally[basis] = tally[basis] || { pass: 0, n: 0 }; tally[basis].n++; if (r.status === 'pass') tally[basis].pass++;
      if (!r.score) { console.log(`| ${c.name} | ${ST[r.status]} | ${q.target ? q.target.TR : '—'} | — | — | — | — | ${(r.error || '').slice(0, 60)} | — | ${f(r.ms / 1000)} s |`); continue; }
      console.log(`| ${c.name} | ${ST[r.status]} | ${f(q.target.TR)} | ${f(r.score.cap)} | ${f(r.band && r.band.ideal)} / ${f(r.band && r.band.iso, 2)} | Ø${f(r.score.OD)}×${f(r.score.L)} | ${f(r.score.mass * 1000, 0)} g | ${r.short.map(s => s.k).join(', ') || '—'} | ${(r.advice || []).map(s => s.k).join(', ') || '—'} | ${f(r.ms / 1000)} s |`);
    }
  }
  console.log('\n충족: ' + Object.entries(tally).map(([b, t]) => `${b} ${t.pass}/${t.n}`).join(' · '));
})();
