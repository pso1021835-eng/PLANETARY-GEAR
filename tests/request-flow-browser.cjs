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
    // 빈 양식 불러오기 → 필수 6칸 오류, 실행 불가
    // 한글 경로는 일부 환경에서 파일이 붙지 않아 내용(buffer)으로 전달
    await page.setInputFiles('#rqFile', { name: '설계의뢰서_PGD-REQ-2.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await fs.readFile(path.join(root, 'templates', '설계의뢰서_PGD-REQ-2.xlsx')) });
    await page.waitForFunction(() => /불러옴/.test(document.querySelector('#rqFileMsg')?.textContent || ''), null, { timeout: 20000 }).catch(async e => { console.log('msg:', await page.locator('#rqFileMsg').innerText(), errors); throw e; });
    assert.match(await page.locator('#rqFileMsg').innerText(), /확인 필요 6건/);
    assert.equal(await page.locator('#rqRun').isDisabled(), true);
    // 예시(표준 DB) → 자동 설계
    await page.locator('#rqExample').click();
    await page.locator('#rqCheck', { hasText: '의뢰서 정상' }).waitFor();
    await page.locator('#rqRun').click();
    await page.locator('.rq-res').waitFor({ timeout: 240000 });
    const gears = await page.locator('#rqResult table').nth(1).locator('tr').count(), bom = await page.locator('#rqResult table').nth(2).locator('tr').count();
    assert.ok(gears >= 7 && bom >= 10, `제원표 ${gears} · BOM ${bom}`);
    assert.match(await page.locator('.rq-res h3').innerText(), /ISO 6336:2019/);
    // 결과 엑셀
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#rqXlsx').click()]);
    const buf = await fs.readFile(await dl.path());
    const Q = require(path.join(root, 'request.js'));
    const sum = await Q.readSheet(buf, '요약'), g = await Q.readSheet(buf, '기어 제원');
    assert.equal(sum.A2, '결과'); assert.equal(sum.A3, '요구 정격 토크'); assert.equal(sum.B3, 25); assert.equal(g.A1, '단');
    // DB 저장 → 사이트 적용
    await page.locator('#rqSave').click();
    assert.ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('pgd-db-v1') || '[]')).length >= 1), '설계 DB 저장');
    await page.locator('#rqApply').click();
    await page.waitForFunction(() => PGDApp.view() === 'overview');
    assert.equal(await page.evaluate(() => PGDApp.state().D.loads.basis), 'iso');
    assert.deepEqual(errors, []);
    console.log(`설계 의뢰 흐름: 제원표 ${gears - 1}행 · BOM ${bom - 1}행 · 결과 엑셀 · DB 저장 · 적용 ok`);
  } finally {
    await browser?.close();
    server.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
