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
    browser = await chromium.launch({ ...(executable ? { executablePath: executable } : { channel: 'chrome' }), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
      route => route.fulfill({ path: require.resolve('three/build/three.min.js'), contentType: 'text/javascript' }));
    await page.goto('http://127.0.0.1:' + server.address().port + '/#st-2');
    await page.locator('#bMore').click();
    await page.locator('#dbPage').click();
    const standard = require('../designs/standard-d100-l100-i25.json');
    const dbRow = page.locator('#main tr', { hasText: '★ 표준 DB' });
    await dbRow.locator('td').nth(5).getByText('19.4', { exact: true }).waitFor();
    await dbRow.getByRole('button', { name: '불러오기' }).click();
    const db = await page.evaluate(() => {
      const { D, R } = PGDApp.state();
      return { name: D.name, ratio: R.ratio, cap: R.reducerCap, req: [D.req.Dmax, D.req.Lmax, D.req.Trated], ext: D.req.ext };
    });
    assert.equal(db.name, standard.name);
    assert.equal(db.ratio, 25);
    assert.deepEqual(db.req, [100, 100, 25]);
    assert.deepEqual([db.ext.Fr, db.ext.Fa, db.ext.M], [0, 0, 15]);
    assert.ok(Math.abs(db.cap - standard.summary.reducerCap) < 1e-8, JSON.stringify(db));
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
    await page.locator('#tExpR').press('Home');
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
    assert.equal(await page.locator('#ovOtherItem option[value="8-1"]').count(),
      await page.evaluate(() => Number(PGDApp.state().D.struct.ringHousing !== 'integral')));
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

    const form = page.locator('[data-structure-form]');
    const field = key => form.locator(`[data-p="${key}"]`);
    const group = key => form.locator(`[data-structure-group="${key}"]`);
    async function openGroup(key) {
      if (await group(key).getAttribute('open') === null) await group(key).locator('summary').click();
    }
    const state = () => page.evaluate(() => PGDApp.state().D);
    const apply = () => form.getByRole('button', { name: '구조 변경 적용' }).click();
    await tool('structure').click();
    const previous = await page.evaluate(() => {
      const { R, D } = PGDApp.state();
      return { z: PGD3D.layout(R, D).S[1].z0, Fr: D.req.ext.Fr };
    });
    await edit(field('geom.stageGap'), 2.6);
    await openGroup('2-10');
    await edit(field('req.ext.Fr'), 123);
    assert.equal((await state()).req.ext.Fr, previous.Fr);
    assert.match(await form.locator('[role="status"]').innerText(), /적용 대기 2개/);
    await apply();
    assert.equal((await state()).req.ext.Fr, 123);
    assert.equal((await state()).geom.stageGap, 2.6);
    const bearingS0 = await page.evaluate(() => PGDApp.state().R.outBearing.s0peak);
    const { C0, dp } = standard.D.outBearing;
    const peakLoad = (123 + 2 * 15000 / dp) * (62.5 / 25);
    assert.ok(Math.abs(bearingS0 - C0 / peakLoad) < 1e-8);

    const moved = await page.evaluate(() => {
      const { R, D } = PGDApp.state();
      return PGD3D.layout(R, D).S[1].z0;
    });
    assert.ok(Math.abs(moved - previous.z - 2) < 1e-7);
    await page.locator('.v3-structure-delta').waitFor();
    assert.match(await page.locator('.v3-structure-delta').textContent(), /2단 기어 시작면 \+2\.000 mm/);
    await page.locator('button[data-structure-home]').click();
    assert.match(await page.locator('#main h2').innerText(), /구조 개념/);
    assert.equal(await field('geom.stageGap').inputValue(), '2.6');

    await page.evaluate(() => PGDApp.go('it-2-10'));
    const directExternal = page.locator('#main [data-p="req.ext.Fr"]');
    assert.equal(await directExternal.inputValue(), '123');
    await edit(directExternal, 160);
    await page.locator('[data-structure-open]').click();
    assert.equal(await field('req.ext.Fr').inputValue(), '160');
    await edit(field('req.ext.Fr'), 180);
    await form.locator('[data-structure-reset]').click();
    assert.equal(await field('req.ext.Fr').inputValue(), '160');

    // Verify the structural drafts update the available controls before they touch the live model.
    await openGroup('2-1');
    const shared = field('config.sharedRing');
    assert.equal(await shared.isChecked(), true);
    await shared.uncheck();
    assert.equal((await state()).config.sharedRing, true);
    assert.equal(await field('stages.1.r').count(), 1);
    await apply();
    assert.equal((await state()).config.sharedRing, false);
    assert.equal(await page.locator('[data-cad-part="ring2"]').count(), 1);
    await field('config.stages').selectOption('1');
    assert.equal(await field('struct.c1s2').count(), 0);
    assert.equal((await state()).config.stages, 2);
    await apply();
    assert.equal((await state()).config.stages, 1);
    assert.equal(await page.locator('[data-cad-part="ring2"]').count(), 0);
    await field('config.stages').selectOption('2');
    await field('config.sharedRing').check();
    await apply();
    assert.equal((await state()).config.sharedRing, true);
    assert.equal(await page.locator('[data-cad-part="ring"]').count(), 1);

    await tool('display').click();
    await page.locator('#ovAssembly').click();
    await page.locator('[data-cad-part="housing"]').waitFor();
    await page.locator('[data-cad-part="needle1"]').click();
    await page.locator('#pcStructure').click();
    assert.ok(await group('2-9').locator('[data-p="needle.0.use"]').isVisible());
    await tool('display').click();
    await page.locator('#ovAssembly').click();
    assert.equal(await page.locator('[data-cad-part="housing"]').count(), 0);
    await tool('edit').click();

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
    // Placement edits use the standard DB assembly and the same data on the item page.
    await page.setViewportSize({ width: 1280, height: 720 });
    await tool('placement').click();
    const placement = page.locator('[data-placement]');
    await placement.locator('[name="name"]').fill('검증용 링');
    await placement.getByRole('button', { name: '부품 추가' }).click();
    const editPlacement = placement.locator('[data-placement-edit]');
    await editPlacement.locator('[data-placement-axis]').selectOption('0');
    await editPlacement.getByRole('button', { name: '모델에서 이동' }).click();
    const canvasRect = await canvas.boundingBox();
    const dragX = canvasRect.x + canvasRect.width / 2, dragY = canvasRect.y + canvasRect.height / 2;
    await page.mouse.move(dragX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragX + 70, dragY, { steps: 5 });
    await page.mouse.up();
    assert.ok(Math.abs(Number(await editPlacement.locator('[name="pose-0"]').inputValue()) - 12) > .1);
    assert.equal((await state()).assemblyPlacement.edits['added-1'].offset[0], 12);
    await editPlacement.locator('[name="pose-0"]').fill('17');
    await page.waitForFunction(() => Math.abs(PGDApp.placementPosition('added-1')?.[0] - 17) < .005);
    assert.equal((await state()).assemblyPlacement.edits['added-1'].offset[0], 12);
    await editPlacement.getByRole('button', { name: '배치·구속 적용' }).click();
    assert.equal((await state()).assemblyPlacement.edits['added-1'].offset[0], 17);
    await page.evaluate(() => PGDApp.go('it-2-8'));
    await placement.locator('[data-placement-select]').selectOption('added-1');
    assert.equal(await placement.locator('[name="pose-0"]').inputValue(), '17');
    await placement.locator('[name="mode"]').selectOption('custom');
    await placement.locator('[name="reference"]').selectOption('housing');
    await placement.locator('[name="lock-2"]').check();
    await placement.getByText('유격·지지 강성', { exact: true }).click();
    await placement.locator('[name="gapAxial"]').fill('10');
    await placement.getByRole('button', { name: '배치·구속 적용' }).click();
    const joint = (await state()).assemblyPlacement.edits['added-1'].joint;
    assert.equal(joint.reference, 'housing');
    assert.deepEqual(joint.locks, [false, false, true, false, false, false]);
    assert.equal(joint.gapAxial, 10);

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
