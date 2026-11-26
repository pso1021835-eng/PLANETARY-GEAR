// 설계 의뢰 흐름: 엑셀 의뢰서 불러오기(빈 양식 → 오류) → 예시 → 자동 설계 → 결과(제원표·BOM·판정) → 결과 엑셀 → DB 저장 → 사이트 적용
// three.js는 운영과 같은 r128 (테스트 전용 npm 패키지). 실행: NODE_PATH=... node tests/dim-drag-browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

async function run() {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer(async (request, response) => {
    const file = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1)) || 'index.html';
    if (!/^(?:[\w-]+\.(?:html|js|css)|designs\/[\w-]+\.json|templates\/[^/]+\.xlsx)$/.test(file)) { response.writeHead(404).end(); return; }
    try {
      const body = await fs.readFile(path.join(root, file));
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xlsx': 'application/octet-stream' };
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] + '; charset=utf-8' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const executable = process.env.PGD_TEST_CHROME;
    browser = await chromium.launch({ ...(executable ? { executablePath: executable } : { channel: 'chrome' }), headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const three = process.env.PGD_TEST_THREE || require.resolve('three/build/three.min.js');
    await page.route('**/three.min.js', route => route.fulfill({ path: three, contentType: 'text/javascript' }));
    await page.goto('http://127.0.0.1:' + server.address().port + '/#req');
    await page.evaluate(() => PGDApp.go('req'));
    await page.locator('#rqRun').waitFor();
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);   // 초기 계산·DB 목록 로드가 끝난 뒤
    // 빈 양식(PGD-REQ-3) 불러오기 → 필수 3칸 오류, 실행 불가
    await page.setInputFiles('#rqFile', { name: '설계의뢰서_PGD-REQ-3.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await fs.readFile(path.join(root, 'templates', '설계의뢰서_PGD-REQ-3.xlsx')) });
    await page.waitForFunction(() => /불러옴/.test(document.querySelector('#rqFileMsg')?.textContent || ''), null, { timeout: 20000 }).catch(async e => { console.log('msg:', await page.locator('#rqFileMsg').innerText(), errors); throw e; });
    assert.match(await page.locator('#rqFileMsg').innerText(), /확인 필요 3건/);
    assert.equal(await page.locator('#rqRun').isDisabled(), true);
    // 예시 (i 25 · THK RU42) + 전위 탐색 → 자동 설계 → 5안 비교
    await page.locator('#rqExample').click();
    await page.locator('#rqCheck', { hasText: '목표 출력 토크' }).waitFor();
    await page.locator('[data-rqyn="O1"]').check();
    await page.locator('#rqRun').click();
    await page.locator('.rq-res').waitFor({ timeout: 240000 });
    const picks = await page.locator('[data-rqpick]').count();
    assert.ok(picks >= 3 && picks <= 5, `비교안 ${picks}`);
    await page.locator('[data-rqpick="1"]').click();
    await page.locator('.rq-res h3', { hasText: '2안' }).waitFor();
    const gears = await page.locator('.rq-res table').nth(0).locator('tr').count(), bom = await page.locator('.rq-res table').nth(1).locator('tr').count();
    assert.ok(gears >= 7 && bom >= 10, `제원표 ${gears} · BOM ${bom}`);
    // 결과 엑셀
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#rqXlsx').click()]);
    const buf = await fs.readFile(await dl.path());
    const Q = require(path.join(root, 'request.js'));
    const sum = await Q.readSheet(buf, '요약'), cmp = await Q.readSheet(buf, '비교 5안');
    assert.equal(sum.A2, '출력 베어링'); assert.equal(sum.B2, 'THK RU42'); assert.equal(cmp.A1, '안'); assert.equal(cmp.A3, 2);
    const mc = await Q.readSheet(buf, '가공 데이터 (선택안)'); assert.equal(mc.L1, '걸치기 잇수 k'); assert.ok(mc.L2 >= 2 && mc.M2 > 0, '걸치기 이두께');
    globalThis.PGDBearings = require(path.join(root, 'bearings.js')); require(path.join(root, 'bearing-first.js'));
    const again = await Q.readXlsx(buf, { format: 'bf' }); assert.ok(again.ok, '결과 파일 의뢰서 시트 재불러오기 ' + JSON.stringify(again.errors)); assert.equal(again.ratio, 25); assert.equal(again.shift, true);
    assert.ok(await page.locator('#rqPrev canvas').count() === 1, '선택안 3D 미리보기');
    // DB 저장 → 사이트 적용 (고른 안)
    await page.locator('#rqSave').click();
    assert.ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('pgd-db-v1') || '[]')).length >= 1), '설계 DB 저장');
    await page.locator('#rqApply').click();
    await page.waitForFunction(() => PGDApp.view() === 'overview');
    assert.equal(await page.evaluate(() => PGDApp.state().D.outBearing.model), 'RU42');
    assert.match(await page.evaluate(() => PGDApp.state().D.name), /베어링 기준/);
    assert.deepEqual(errors, []);
    console.log(`설계 의뢰 흐름: 제원표 ${gears - 1}행 · BOM ${bom - 1}행 · 결과 엑셀 · DB 저장 · 적용 ok`);
  } finally {
    await browser?.close();
    server.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
