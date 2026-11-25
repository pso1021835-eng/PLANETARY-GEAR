// 3D 종합판정 치수 드래그: 부품 선택 → 치수선·노트·화살표 → 화살표를 끌면 0.5 mm 단위로 값 반영 → 재계산 후 같은 부품 유지
// three.js는 운영과 같은 r128 (테스트 전용 npm 패키지). 실행: NODE_PATH=... node tests/dim-drag-browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

async function run() {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer(async (request, response) => {
    const file = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!/^(?:[\w-]+\.(?:html|js|css)|designs\/[\w-]+\.json)$/.test(file)) { response.writeHead(404).end(); return; }
    try {
      const body = await fs.readFile(path.join(root, file));
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] + '; charset=utf-8' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const executable = process.env.PGD_TEST_CHROME;
    browser = await chromium.launch({ ...(executable ? { executablePath: executable } : { channel: 'chrome' }), headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const three = process.env.PGD_TEST_THREE || require.resolve('three/build/three.min.js');
    await page.route('**/three.min.js', route => route.fulfill({ path: three, contentType: 'text/javascript' }));
    await page.goto('http://127.0.0.1:' + server.address().port + '/#overview');
    await page.evaluate(() => PGDApp.go('overview'));
    await page.locator('#viewer canvas').waitFor();
    // 캐리어(출력) 선택 → 보스 두께·외경 치수와 화살표
    await page.locator('[data-cad-part="carrier1"]').click();
    const grip = page.locator('.v3-dimgrip[title*="보스 두께"]');
    await grip.waitFor();
    assert.ok(await page.locator('.v3-dimed .pv-lab', { hasText: '보스 외경' }).count());
    const before = await page.evaluate(() => PGDApp.state().D.stages[0].carrier.bossT ?? 4);
    // 화살표 방향으로 60 px 끌기 (드래그 중 "이전 → 새값" 표시)
    await page.waitForFunction(() => { const el = document.querySelector('.v3-dimgrip[title*="보스 두께"]'); return el && el.dataset.ang !== undefined && el.style.display !== 'none'; });
    await page.waitForTimeout(300);   // 시점 감쇠가 멈출 때까지
    const g = await grip.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, a: +el.dataset.ang }; });
    await page.mouse.move(g.x, g.y); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(g.x + Math.cos(g.a) * 6 * i, g.y + Math.sin(g.a) * 6 * i);
    assert.ok(await page.locator('.v3-dimed .pv-lab', { hasText: '→' }).count(), '드래그 중 미리보기');
    await page.mouse.up();
    await page.waitForFunction(b => (PGDApp.state().D.stages[0].carrier.bossT ?? 4) !== b, before);
    const after = await page.evaluate(() => PGDApp.state().D.stages[0].carrier.bossT);
    assert.ok(after > before && Math.abs(after * 2 - Math.round(after * 2)) < 1e-9, `${before} → ${after}`);
    // 재계산 후에도 같은 부품 선택·치수 표시 유지, 보스 두께 노트가 새 값
    await page.locator('.v3-dimed .pv-lab', { hasText: `보스 두께 ${after.toFixed(2)}` }).waitFor();
    // 끄기
    await page.locator('#ovDims').click();
    assert.equal(await page.locator('.v3-dimgrip').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`치수 드래그: 보스 두께 ${before} → ${after} mm · ok`);
  } finally {
    await browser?.close();
    server.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
