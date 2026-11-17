/* 구조 개념의 조립 단면 및 결합부 예시. 선택된 설계값을 읽는다. */
(function (root) {
  'use strict';

  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rect = (x, y, w, h, part) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="sc-${part}"/>`;
  const line = (x, y, x2, y2, cls = 'guide') => `<path d="M${x} ${y}L${x2} ${y2}" class="sc-${cls}"/>`;
  const path = (d, part) => `<path d="${d}" class="sc-${part}"/>`;
  const circle = (x, y, r, part) => `<circle cx="${x}" cy="${y}" r="${r}" class="sc-${part}"/>`;
  const label = (x, y, str, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}">${escape(str)}</text>`;
  const horizontal = (x, y, x2) => line(x, y, x2, y, 'flow') + path(`M${x2 - 7} ${y - 4}L${x2} ${y}L${x2 - 7} ${y + 4}`, 'flow');
  const axis = y => line(32, y, 688, y, 'axis');
  const leader = (x, y, x2, y2, str) => line(x, y, x2, y2) + label(x2, y2 - 6, str);
  const fmt = value => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : '—';
  const stageCount = d => d.config.stages === 1 ? 1 : 2;

  function figure(art, title, compact = false) {
    return `<div class="sc-viewport${compact ? ' sc-compact' : ''}" tabindex="0" aria-label="${escape(title)}"><svg class="sc-diagram" viewBox="0 0 720 230" role="img" aria-label="${escape(title)}">${art}</svg></div>`;
  }
  function optionKey(group, value) { return Object.hasOwn(group, value) ? value : Object.keys(group)[0]; }

  const ringOptions = {
    integral: ['일체 가공', '하우징 안쪽에 내치를 직접 가공합니다. 링과 하우징이 한 부품이며, 링 반력은 하우징으로 바로 전달됩니다.', '내치 가공 공구의 진입과 도피 공간을 확인합니다.'],
    press: ['원통 압입', '별도 링을 하우징 원통 보어에 축방향으로 눌러 넣습니다. 링 외경과 보어의 죔새가 만드는 원통 접촉면에서 마찰로 반력 토크를 전달합니다.', '죔새, 링 수축, 조립 후 백래시를 확인합니다.'],
    bolt: ['플랜지 볼트 체결', '링의 플랜지를 하우징 턱에 대고 축방향 볼트로 조입니다. 기준 보어·턱이 중심을 잡고 접합면 마찰로 반력 토크를 전달하는 개념입니다.', '센터링 맞춤과 볼트 예압을 확인합니다.']
  };
  const jointOptions = {
    spline: ['스플라인', '축 외주와 허브 보어에 여러 줄의 축방향 이빨을 둡니다. 서로 맞닿는 이 옆면으로 토크를 전달합니다.', '유효 맞물림 길이와 반경 유격을 확인합니다. 필요하면 턱이나 스냅링으로 축방향 이동을 잡습니다.'],
    integral: ['일체 가공', '축 또는 캐리어 허브 끝에 썬 치형을 직접 가공합니다. 토크 경로는 단차를 지나는 연속 재료입니다.', '가공 공구 도피부, 단차 필렛, 축 조립 방향을 확인합니다.'],
    key: ['평행키', '축 홈과 허브 홈에 하나의 키를 끼웁니다. 키 옆면의 면압과 단면 전단으로 토크를 전달합니다.', '키홈 끝의 응력 집중과 썬기어 림의 남는 두께를 확인합니다.'],
    press: ['원통 압입', '축을 허브 보어에 억지끼움합니다. 유효 길이 전체의 원통 접촉 마찰로 토크를 전달합니다.', '맞춤 길이, 조립 죔새, 허브 면압을 확인합니다.'],
    clamp: ['분할 클램프', '슬릿이 있는 허브의 볼트를 조여 축을 감쌉니다. 허브가 축에 가하는 접촉 압력으로 마찰 토크를 전달합니다.', '슬릿 개방량, 조임 볼트 접근성, 조임 후 보어의 변형을 확인합니다.']
  };
  const supportOptions = {
    out: ['출력측 1개', 'C1 축의 S2 가까운 쪽에 베어링을 둡니다. 베어링 내륜은 회전하는 저널, 외륜은 하우징 쪽 지지부에 놓입니다.', '베어링 중심에서 S2 치폭 중앙까지의 돌출 길이를 확인합니다.'],
    both: ['양측 2개', 'C1 축을 서로 떨어진 두 베어링으로 받칩니다. 두 지지점과 S2 하중 위치가 축의 기울기를 결정합니다.', '두 지지점의 간격, 조립 방향, 유격 또는 예압을 확인합니다.'],
    none: ['C1 전용 지지 없음', '도식의 점선 구역에는 C1을 받치는 전용 베어링이 없습니다. C1과 S2의 반경 구속이 어떤 부품으로 닫히는지 확인해야 합니다.', '이 설계실의 플로팅 썬 금지 조건에서는 별도 반경 지지 경로 확인이 필요합니다.']
  };
  const outputOptions = {
    flange: ['출력 플랜지 쪽', '메인 베어링을 출력 플랜지 허브 가까이에 둡니다. 내륜은 회전하는 출력부, 외륜은 고정 하우징에 연결되는 예입니다.', '플랜지 하중면과 베어링 중심 사이의 거리를 확인합니다.'],
    outside: ['최종단 기어 폭 바깥', '최종단 기어 폭을 지난 뒤 캐리어의 출력측 어깨에 베어링을 둡니다. 출력 플랜지는 그보다 바깥에 놓입니다.', '어깨 위치, 베어링 폭, 플랜지 쪽 모멘트 암을 확인합니다.'],
    inside: ['최종단 기어 폭 안', '베어링 중심이 최종단 기어 치폭의 축방향 범위 안에 들어갑니다. 도식은 큰 직경의 베어링을 기어 바깥 반경에 둔 예입니다.', '링 외경과 지지부가 같은 축 위치에서 간섭하는지 확인합니다.']
  };

  function bearing(x, y, tall = 35) {
    return rect(x, y, 26, tall, 'bearing') + line(x + 3, y + 4, x + 23, y + tall - 4, 'bearingline')
      + line(x + 23, y + 4, x + 3, y + tall - 4, 'bearingline');
  }

  function ringArt(type) {
    const integral = type === 'integral', bolted = type === 'bolt';
    const body = integral
      ? path('M90 57H594V98H556V135H100V98H90Z', 'fixed')
      : rect(90, 57, 504, 41, 'fixed') + rect(116, 98, 440, 37, 'ring')
        + (bolted ? rect(90, 98, 26, 43, 'ring') + rect(554, 98, 36, 43, 'ring') + rect(490, 76, 132, 9, 'fastener') + rect(613, 66, 18, 30, 'fastener') : line(116, 98, 556, 98, 'contact'));
    const teeth = Array.from({ length: 11 }, (_, i) => rect(125 + i * 37, 135, 17, 13, integral ? 'fixed' : 'ring')).join('');
    return axis(197) + body + teeth + label(88, 44, '고정 하우징') +
      leader(340, 139, 362, 173, '링 내치') +
      (integral ? leader(514, 112, 528, 191, '연속 재료') : bolted ? leader(615, 76, 524, 42, '축방향 볼트') + leader(556, 103, 533, 183, '플랜지 접합면') : leader(205, 98, 161, 175, '원통 접촉면')) +
      horizontal(104, 215, 178) + label(189, 220, '축 방향');
  }

  function radialJoint(type) {
    const base = circle(583, 119, 55, 'carrier') + circle(583, 119, 34, 'shaft');
    if (type === 'spline') return base + Array.from({ length: 8 }, (_, i) => `<g transform="rotate(${i * 45} 583 119)">${rect(577, 80, 12, 14, 'shaft')}</g>`).join('');
    if (type === 'key') return base + rect(570, 77, 26, 14, 'fastener');
    if (type === 'clamp') return base + rect(579, 63, 8, 22, 'cut') + rect(558, 70, 52, 7, 'fastener');
    if (type === 'press') return base + circle(583, 119, 34, 'contact');
    return circle(583, 119, 55, 'shaft');
  }

  function jointArt(type, input) {
    const a = input ? '모터축' : 'C1 허브축', b = input ? 'S1 썬기어' : 'S2 썬기어';
    const integral = type === 'integral';
    const shaft = integral ? path('M58 106H232V77H433V153H232V130H58Z', 'shaft') : rect(58, 106, 310, 24, input ? 'shaft' : 'carrier');
    const hub = integral ? '' : path('M237 77H433V153H237V130H369V106H237Z', 'sun');
    const key = type === 'key' ? rect(244, 98, 102, 8, 'fastener')
      : type === 'spline' ? [106, 130].map(y => line(242, y, 365, y, 'contact')).join('')
        : type === 'press' ? line(242, 106, 365, 106, 'contact') + line(242, 130, 365, 130, 'contact')
          : type === 'clamp' ? rect(256, 78, 10, 55, 'fastener') + rect(249, 72, 24, 9, 'fastener') : '';
    const teeth = Array.from({ length: 7 }, (_, i) => rect(272 + 23 * i, 67, 13, 10, integral ? 'shaft' : 'sun')).join('');
    return line(37, 118, 459, 118, 'axis') + shaft + hub + key + teeth
      + label(58, 91, a) + label(271, 50, b) + horizontal(62, 184, 407) + label(62, 205, '토크 전달')
      + line(474, 42, 474, 196) + radialJoint(type) + label(583, 197, '축 직각 단면', 'middle');
  }

  function supportArt(mode) {
    const mount = x => rect(x - 11, 47, 48, 43, 'fixed') + bearing(x, 83, 39) + bearing(x, 144, 39) + rect(x - 11, 180, 48, 18, 'fixed');
    return axis(132) + rect(83, 120, 444, 24, 'carrier') + rect(158, 100, 32, 64, 'carrier') + rect(520, 95, 76, 74, 'sun')
      + (mode === 'both' ? mount(221) : '')
      + (mode === 'none' ? path('M330 57H409V110H330ZM330 154H409V197H330Z', 'empty') : mount(356))
      + label(132, 89, 'C1') + label(532, 86, 'S2') + label(363, 37, mode === 'none' ? '지지 베어링 없음' : '출력측 지지')
      + (mode === 'both' ? label(187, 37, '입력측 지지') : '')
      + line(553, 173, 553, 211, 'guide') + label(535, 225, 'S2 하중면') + horizontal(82, 214, 156) + label(164, 220, '출력 방향');
  }

  function outputArt(mode) {
    const x = { inside: 220, outside: 374, flange: 505 }[mode] ?? 505;
    return axis(157) + rect(72, 39, 541, 21, 'fixed') + rect(108, 96, 201, 22, 'ring')
      + rect(108, 118, 201, 29, 'planet') + rect(312, 96, 34, 58, 'carrier') + rect(306, 147, 270, 24, 'carrier')
      + rect(572, 101, 41, 102, 'shaft') + rect(x - 4, 84, 34, 13, 'carrier') + bearing(x, 60, 26)
      + label(80, 28, '고정 하우징') + label(105, 189, '최종단 기어 폭') + line(108, 147, 108, 176) + line(309, 147, 309, 176) + line(108, 174, 309, 174)
      + label(593, 223, '플랜지 하중면', 'middle') + line(613, 82, 613, 202, 'axis') + leader(x + 13, 75, x + 18, 29, '베어링 중심')
      + path(`M${x + 13} 199V205H613V196`, 'guide') + label((x + 626) / 2, 196, '레버암', 'middle');
  }

  function trainArt(d, focus, r) {
    const two = stageCount(d) === 2;
    const shared = two && d.config.sharedRing;
    const faceWidth = two ? 122 : 281;
    const sections = two ? [{ x: 135, w: faceWidth }, { x: 360, w: faceWidth }] : [{ x: 135, w: faceWidth }];
    const outX = two ? 610 : 555;
    const ringSpans = shared ? [[106, 514]] : sections.map(({ x, w }) => [x - 13, x + w + 13]);
    const part = (x, w, i) => {
      const pin = d.stages[i]?.pin;
      const last = i === sections.length - 1;
      const single = pin?.type === 'single';
      const p = single ? (i === 0 ? [x - 18] : [x + w]) : [x - 18, x + w];
      const pinStart = single && i !== 0 ? x : x - 18;
      const pinEnd = single && i === 0 ? x + w : x + w + 18;
      const stage = r?.ctx?.stages?.[i];
      const result = stage?.geo?.ratio;
      const tag = focus === '2-2' ? `${i + 1}단  ${fmt(result)}:1` : `${i + 1}단`;
      return rect(x, 109, w, 28, 'sun') + rect(x, 69, w, 38, 'planet')
        + p.map(px => rect(px, 72, 18, 49, 'carrier')).join('')
        + rect(pinStart, 84, pinEnd - pinStart, 7, 'shaft')
        + rect(x + w, 115, (last ? outX : sections[i + 1].x + 17) - x - w, 25, 'carrier')
        + label(x + w / 2, 94, `P${i + 1}`, 'middle') + label(x + w / 2, 130, `S${i + 1}`, 'middle')
        + label(x + w + 9, 159, `C${i + 1}`) + label(x + w / 2, 181, tag, 'middle');
    };
    const ob = { inside: two ? 421 : 275, outside: two ? 504 : 440, flange: outX - 37 }[d.struct?.obPos] ?? outX - 37;
    return rect(69, 23, outX - 43, 25, 'fixed') + ringSpans.map(([a, b]) => rect(a, 48, b - a, 20, 'ring')).join('')
      + label(80, 40, '고정 하우징')
      + (shared ? label(190, 63, '공유 링 R1–2') : ringSpans.map(([a, b], i) => label((a + b) / 2, 63, `고정 링 R${i + 1}`, 'middle')).join(''))
      + axis(137) + rect(44, 122, 104, 19, 'shaft') + sections.map(({ x, w }, i) => part(x, w, i)).join('')
      + rect(outX, 100, 22, 64, 'shaft') + bearing(ob, 48, 20) + rect(ob + 6, 68, 14, 47, 'carrier')
      + label(43, 165, '입력축') + label(outX - 24, 183, '출력 플랜지') + horizontal(44, 205, outX + 21)
      + label(44, 226, '입력 토크') + label(outX + 21, 226, '출력 토크', 'end');
  }

  function planetArt(d, r, i, cx) {
    const c = r?.ctx?.stages?.[i], s = c?.st ?? d.stages[i] ?? {}, g = c?.geo;
    const n = Number.isInteger(s.n) && s.n >= 2 && s.n <= 12 ? s.n : 3;
    const ringR = 68, zr = s.s + 2 * s.p;
    const ratio = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
    const rs = ringR * ratio(s.s / zr, .5), rp = ringR * ratio(s.p / zr, .25), a = ringR * ratio((s.s + s.p) / zr, .75);
    return circle(cx, 124, 78, 'ring') + circle(cx, 124, ringR, 'cut')
      + circle(cx, 124, rs, 'sun')
      + Array.from({ length: n }, (_, j) => {
        const t = -Math.PI / 2 + 2 * Math.PI * j / n, x = cx + a * Math.cos(t), y = 124 + a * Math.sin(t);
        return circle(x, y, rp, 'planet') + circle(x, y, 4, 'shaft');
      }).join('')
      + circle(cx, 124, a, 'axis')
      + label(cx, 129, `S${i + 1}`, 'middle') + label(cx, 27, `${i + 1}단 · 유성 ${n}개`, 'middle')
      + label(cx, 223, `핀 배치 PCD ${fmt(g?.meshes?.[0]?.center * 2)} mm`, 'middle');
  }

  const variants = {
    '2-4': { title: '링–하우징 결합 단면', values: ringOptions, get: d => d.struct?.ringHousing ?? 'press', draw: ringArt },
    '2-5': { title: '1단 캐리어–2단 썬 결합 단면', values: Object.fromEntries(Object.entries(jointOptions).filter(([k]) => k !== 'clamp')), get: d => d.struct?.c1s2 ?? 'spline', draw: key => jointArt(key, false), onlyTwo: true },
    '2-6': { title: '모터축–1단 썬 결합 단면', values: jointOptions, get: d => d.struct?.s1motor ?? 'key', draw: key => jointArt(key, true) },
    '2-7': { title: 'C1 축의 반경 지지', values: supportOptions, get: d => d.struct?.c1Support ?? 'none', draw: supportArt, onlyTwo: true },
    '2-8': { title: '출력 메인 베어링 배치', values: outputOptions, get: d => d.struct?.obPos ?? 'flange', draw: outputArt }
  };

  function compare(spec, current) {
    const alternatives = Object.entries(spec.values).filter(([key]) => key !== current);
    return `<details class="sc-details"><summary>다른 구조 ${alternatives.length}가지 비교</summary><div class="sc-alternatives">${alternatives.map(([key, [name, summary]]) =>
      `<div><h4>${name}</h4>${figure(spec.draw(key), name, true)}<p>${summary}</p></div>`).join('')}</div></details>`;
  }
  function currentSize(id, c, current) {
    if (id === '2-4' && current === 'press') {
      return `선택 설계의 지름 죔새 ${fmt(c.D.struct?.ringFit?.delta)} mm`;
    }
    if ((id === '2-5' || id === '2-6') && current !== 'integral') {
      const dims = id === '2-5' ? c.D.struct?.c1s2Dim : c.D.struct?.s1Dim;
      const stage = c.R?.ctx?.stages?.[id === '2-5' ? 1 : 0];
      const bore = stage?.geo?.rims?.[0]?.diameter;
      const length = dims?.L ?? (id === '2-5' ? stage?.st?.b : null);
      return `결합 기준 지름 ${fmt(dims?.d ?? (bore > 0 ? bore : null))} mm · 결합 길이 ${fmt(length)} mm`;
    }
    if (id === '2-8') return `롤러 피치원 지름 ${fmt(c.D.outBearing?.dp)} mm`;
    return '';
  }
  function render(id, c) {
    const spec = variants[id];
    if (spec) {
      if (spec.onlyTwo && stageCount(c.D) === 1) return `<section class="sc card"><h3>${spec.title}</h3><p>2단 구조에서 1단 캐리어와 2단 썬을 연결하는 항목입니다.</p></section>`;
      const current = optionKey(spec.values, spec.get(c.D));
      const [name, text, check] = spec.values[current];
      const size = currentSize(id, c, current);
      return `<section class="sc card"><h3>${spec.title} <span class="sc-choice">${name}</span></h3>
        ${figure(spec.draw(current), `${spec.title} · ${name}`)}
        ${size ? `<p class="sc-size">${size}</p>` : ''}<p>${text}</p><p class="sc-check">${check}</p>
        <p class="note">축 방향 개념 단면 · 개념 형상과 위치를 확대해 표시했습니다.</p>${compare(spec, current)}</section>`;
    }
    const titles = { overview: '현재 구조의 축 방향 배치', '2-1': '단수에 따른 부품 배치', '2-2': '단별 동력 전달', '2-3': '링기어 배치', '2-9': '유성기어와 핀 배치', '2-10': '토크와 반력 경로' };
    if (!titles[id]) return '';
    const d = c.D, title = titles[id], pcd = id === '2-9';
    const ring = stageCount(d) === 1 ? '단일 링' : d.config.sharedRing ? '1·2단 공통 링' : '단별 링 2개';
    const note = id === '2-3' ? `${ring}을 선택했습니다. ${stageCount(d) === 1 ? '한 개의 고정 링에 1단 유성이 맞물립니다.' : d.config.sharedRing ? '같은 링 몸체의 서로 다른 축 위치에서 두 단이 맞물립니다.' : '각 단의 유성이 해당 단의 별도 링에 맞물립니다.'}`
      : id === '2-10' ? '입력 토크는 썬 → 유성 → 캐리어로 흐릅니다. 링 반력은 고정 하우징으로, 출력 외력은 메인 베어링을 거쳐 하우징으로 전달됩니다.'
      : pcd ? '축 직각 도식입니다. 치형은 원으로 표시하고 점선은 핀 중심을 잇습니다.'
      : '썬(S) → 유성(P) → 캐리어(C) 순으로 토크가 흐릅니다. 2단 구조의 C1 출력은 S2에 연결됩니다.';
    const shortcuts = id === 'overview' ? `<div class="sc-links">${Object.entries(variants).filter(([, v]) => !v.onlyTwo || stageCount(d) === 2).map(([key, v]) => `<button class="btn" data-goit="${key}">${escape(v.title.replace(' 결합 단면', ''))} · ${escape(v.values[optionKey(v.values, v.get(d))][0])}</button>`).join('')}</div>` : '';
    const art = pcd ? (stageCount(d) === 1 ? [360] : [219, 501]).map((x, i) => planetArt(d, c.R, i, x)).join('') : trainArt(d, id, c.R);
    return `<section class="sc card"><h3>${title}</h3>${figure(art, title)}
      <p>${note}</p>${pcd ? '' : '<p class="note">축 방향 개념 단면 · 조립 치수와 유성 한 곳의 단면을 도식화했습니다.</p>'}${shortcuts}</section>`;
  }

  root.PGDStructure = { render };
})(globalThis);
