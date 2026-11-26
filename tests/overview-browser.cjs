// Run against the same Three.js revision as production. Browser and npm packages are test-only.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

async function run() {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer(async (request, response) => {
    const file = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!/^[\w.-]+\.(html|js|css)$/.test(file)) { response.writeHead(404).end(); return; }
    try {
      const body = await fs.readFile(path.join(root, file));
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] + '; charset=utf-8' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
      route => route.fulfill({ path: require.resolve('three/build/three.min.js'), contentType: 'text/javascript' }));
    await page.goto('http://127.0.0.1:' + server.address().port + '/#overview');
    await page.locator('#viewer canvas').waitFor();
    const tool = name => page.locator('[data-cad-open="'+name+'"]');
    const viewport = page.viewportSize();
    const canvas = page.locator('#viewer canvas');
    await page.locator('#main').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    const bounds = await canvas.boundingBox();
    assert.ok(bounds.width >= viewport.width * .75 && bounds.height >= viewport.height * .65, JSON.stringify(bounds));
    assert.ok(bounds.y + bounds.height <= viewport.height + 1);
    assert.equal(await page.locator('#cadDrawer').isVisible(), false);
    await page.locator('[data-cad-part="planet1"]').click();
    assert.ok(await page.locator('#pcard').isVisible());
    await page.locator('#pcX').click();
    for (const key of ['drawing','spec','results','display']) {
      await tool(key).click();
      assert.ok(await page.locator('[data-cad-panel="'+key+'"]').isVisible());
      assert.ok(await page.locator('#cadClose').isVisible());
    }
    await page.locator('#tExpR').press('End');
    assert.equal(await page.locator('#tExpR').inputValue(),'100');
    await page.locator('#ovCarrier').click();
    await page.locator('#cadClose').click();
    await page.locator('#tHome').click();
    await page.locator('#tBom').click();
    assert.ok(await page.locator('#bom').isVisible());
    await page.locator('#tBom').click();
    await tool('edit').click();
    const topic = page.locator('#ovTopic');
    for (const key of await topic.locator('option').evaluateAll(opts => opts.map(o => o.value).filter(Boolean))) {
      await topic.selectOption(key);
      assert.ok((await page.locator('#ovInputs').innerText()).trim(), key);
    }
    await topic.selectOption('other');
    assert.equal(await page.locator('#ovOtherItem option[value="8-1"]').count(), 0);   // BOM-1: 하우징 항목 삭제
    await page.locator('#ovOtherItem').selectOption('6-4');
    assert.ok(await page.locator('#ovInputs [data-p]').count() > 0);
    await topic.selectOption('duty');
    const dutyCount = () => page.evaluate(() => PGDApp.state().D.req.duty.length);
    const originalCount = await dutyCount();
    await page.locator('#ovInputs #addDuty').click();
    assert.equal(await dutyCount(), originalCount + 1);

    async function edit(locator, value) {
      await locator.fill(String(value));
      await locator.press('Tab');
    }
    await topic.selectOption('run');
    await edit(page.locator('#ovInputs [data-p="req.rpm"]'), 1234);
    assert.equal(await page.evaluate(() => PGDApp.state().D.req.rpm), 1234);

    await page.locator('#ovPickPart').selectOption('planet1');
    const width = page.locator('#pcard [data-p="stages.0.b"]');
    const initialWidth = Number(await width.inputValue());
    await edit(width, initialWidth - 0.2);
    assert.equal(await page.locator('#ovPickPart').inputValue(), 'planet1');
    assert.match(await page.locator('#ovCompare').innerText(), /변경한 입력/);
    await page.locator('#pcRelated').click();
    assert.equal(await topic.inputValue(), 'material');

    await topic.selectOption('share');
    await page.locator('#ovInputs [data-p="loads.basis"]').selectOption('iso');
    const mode = page.locator('#ovInputs [data-p="loads.kgMode"]');
    await mode.selectOption('model');
    const stages = await page.evaluate(() => PGDApp.state().R.rated.stages);
    for (const stage of stages) {
      const forces = stage.planetLoads;
      assert.ok(forces.every(Number.isFinite));
      assert.ok(Math.abs(Math.max(...forces) - stage.Ft * stage.Kg) < 1e-5);
    }
    assert.equal(await page.locator('#ovInputs meter').count(), stages.flatMap(s => s.planetLoads).length);
    await mode.selectOption('fixed');
    assert.equal(await page.locator('#ovInputs meter').count(), 0);
    await page.locator('[data-ov-baseline]').click();
    assert.deepEqual(await page.locator('#ovCompare tbody tr td:last-child').allTextContents(), Array(4).fill('변화 없음'));

    await tool('spec').click();
    await edit(page.locator('.ov-spec [data-p="stages.0.b"]'), initialWidth + 1);
    assert.equal(await page.locator('#ovCompare tbody').count(), 0);
    await page.locator('[data-ov-recover]').click();
    await page.locator('#viewer canvas').waitFor();
    await page.reload();
    await tool('edit').click();
    await topic.waitFor();
    assert.equal(await page.evaluate(() => PGDApp.state().D.req.rpm), 1234);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok((await page.locator('#ovEditor').boundingBox()).width <= 390);
    await page.locator('#cadClose').click();
    assert.equal(await page.locator('#cadTree').isVisible(), false);
    const mobileCanvas = await canvas.boundingBox();
    assert.ok(mobileCanvas.width >= 380 && mobileCanvas.y + mobileCanvas.height <= 845);
    await page.locator('[data-cad-tree]').click();
    await page.locator('[data-cad-part="planet1"]').click();
    assert.ok(await page.locator('#pcard').isVisible());
    assert.equal(await page.locator('#cadTree').isVisible(), false);
    await page.evaluate(() => PGDApp.go('map'));
    assert.equal(await page.locator('body.cad-mode').count(), 0);
    assert.deepEqual(errors, []);
    console.log('3D 종합판정 브라우저 회귀 통과');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
