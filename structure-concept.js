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

  let figureId = 0;
  function figure(art, title, { compact = false, w = 720, h = 230 } = {}) {
    const id = `sc-dw-${++figureId}`;
    const hatches = [['a', 36, 5], ['b', -38, 6], ['c', 54, 3.5]].map(([key, angle, pitch]) =>
      `<pattern id="${id}-${key}" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><rect width="${pitch}" height="${pitch}" class="sc-paper"/><path d="M0 0V${pitch}" class="sc-hatch"/></pattern>`).join('');
    const defs = `<defs>${hatches}<marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 2L10 5L0 8Z" class="sc-arrow"/></marker></defs>`;
    const styles = ['a', 'b', 'c', 'arrow'].map(key => `--sc-${key}:url(#${id}-${key})`).join(';');
    return `<div class="sc-viewport${compact ? ' sc-compact' : ''}" tabindex="0" aria-label="${escape(title)}"><svg class="sc-diagram${w < 720 ? ' sc-local-view' : ''}" viewBox="0 0 ${w} ${h}" style="${styles}" role="img" aria-label="${escape(title)}">${defs}${art}</svg></div>`;
  }
  const dim = (a, b, edge, y, text) => line(a, edge, a, y - 4) + line(b, edge, b, y - 4)
    + line(a, y, b, y, 'dimension') + label((a + b) / 2, y - 7, text, 'middle');
  const diameter = (x, y, mid, x2, text) => line(x, y, x2 + 5, y) + line(x, mid * 2 - y, x2 + 5, mid * 2 - y)
    + line(x2, y, x2, mid * 2 - y, 'dimension') + `<g transform="translate(${x2 - 5} ${mid}) rotate(-90)">${label(0, 0, text, 'middle')}</g>`;
  const mirror = (shape, y) => shape + `<g transform="translate(0 ${2 * y}) scale(1 -1)">${shape}</g>`;
  const centerCross = (x, y, r) => line(x - r, y, x + r, y, 'axis') + line(x, y - r, x, y + r, 'axis');
  const cutTrace = (x, y, r) => line(x, y - r, x, y + r, 'section')
    + line(x + 18, y - r + 4, x, y - r + 4, 'assembly') + label(x + 22, y - r + 9, 'A')
    + line(x + 18, y + r - 4, x, y + r - 4, 'assembly') + label(x + 22, y + r + 1, 'A');
  const balloon = (x, y, x2, y2, n) => line(x, y, x2, y2) + circle(x2, y2, 11, 'bubble') + label(x2, y2 + 5, n, 'middle');
  function optionKey(group, value) { return Object.hasOwn(group, value) ? value : Object.keys(group)[0]; }

  const ringOptions = {
    integral: ['일체 가공', '하우징 안쪽에 내치를 직접 가공합니다. 링과 하우징이 한 부품이며, 링 반력은 하우징으로 바로 전달됩니다.', '내치 가공 공구의 진입과 도피 공간을 확인합니다.'],
    press: ['원통 압입', '별도 링을 하우징 원통 보어에 축방향으로 눌러 넣습니다. 링 외경과 보어의 죔새가 만드는 원통 접촉면에서 마찰로 반력 토크를 전달합니다.', '죔새, 링 수축, 조립 후 백래시를 확인합니다.'],
    bolt: ['플랜지 볼트 체결', '링의 플랜지를 하우징 턱에 대고 축방향 볼트로 조입니다. 기준 보어·턱이 중심을 잡고 접합면 마찰로 반력 토크를 전달하는 개념입니다.', '센터링 맞춤과 볼트 예압을 확인합니다.']
  };
  const jointOptions = {
    spline: ['스플라인', '축 외주와 허브 보어에 여러 줄의 축방향 이빨을 둡니다. 서로 맞닿는 이 옆면으로 토크를 전달합니다.', '도면의 스플라인 이 형상과 개수는 예시입니다. 유효 맞물림 길이, 반경 유격, 턱이나 스냅링의 축방향 고정을 확인합니다.'],
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

  function ringFront(type, boltN) {
    const x = 121, y = 110, radius = 68;
    const n = type === 'bolt' && Number.isInteger(boltN) && boltN >= 2 && boltN <= 48 ? boltN : 0;
    const holes = Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return circle(x + radius * Math.cos(a), y + radius * Math.sin(a), 3.8, 'outline');
    }).join('');
    return circle(x, y, 80, 'outline') + circle(x, y, 61, 'outline')
      + circle(x, y, 55, 'outline') + circle(x, y, 52, 'outline')
      + (n ? circle(x, y, radius, 'axis') + holes : '') + centerCross(x, y, 84) + cutTrace(x, y, 101);
  }

  function ringArt(type, fit = {}) {
    const mid = 123, integral = type === 'integral', bolted = type === 'bolt';
    const shape = integral
      ? path('M114 40H423V76H399V89H147V78H114Z', 'fixed')
      : bolted
        ? path('M170 38H420V75H381V66H193V77H170Z', 'fixed')
          + path('M135 39H170V66H381V89H157V76H135Z', 'ring')
          + line(170, 40, 170, 64, 'contact')
          + rect(116, 46, 19, 15, 'shaft') + rect(135, 50, 60, 7, 'shaft') + line(168, 52, 197, 52, 'axis')
        : path('M142 40H420V77H389V65H142Z', 'fixed')
          + path('M164 65H389V89H164Z', 'ring') + line(164, 65, 389, 65, 'contact');
    const toothEnds = line(166, 91, 382, 91, 'outline') + line(166, 94, 382, 94, 'axis');
    const notes = integral ? leader(291, 78, 304, 119, '하우징에 내치 가공')
      : bolted ? leader(124, 51, 32, 24, Number.isFinite(fit.boltD) ? `M${fmt(fit.boltD)} 체결` : '볼트 체결')
        + leader(171, 63, 33, 103, '플랜지 접합면')
        : leader(284, 66, 264, 113, '원통 압입면');
    return mirror(shape + toothEnds, mid) + line(17, mid, 459, mid, 'axis') + notes
      + (integral ? '' : label(23, 155, bolted ? '볼트 삽입' : '링 삽입') + line(28, 165, 115, 165, 'assembly'))
      + (!integral && !bolted && Number.isFinite(fit.delta) ? label(246, 233, `지름 죔새 ΔØ ${fmt(fit.delta)}`, 'middle') : '');
  }

  function splineOutline(x, y) {
    const count = 12, step = 2 * Math.PI / count;
    const points = Array.from({ length: count }, (_, i) => [[-.5, 43], [-.26, 43], [-.17, 51], [.17, 51], [.26, 43]].map(([offset, r]) => {
      const a = (i + offset) * step;
      return `${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`;
    })).flat();
    return path(`M${points.join('L')}Z`, 'shaft');
  }

  function jointFront(type) {
    const x = 121, y = 110;
    const core = type === 'spline' ? splineOutline(x, y) : circle(x, y, 46, 'shaft');
    const key = type === 'key' ? rect(x - 11, y - 58, 22, 19, 'fastener') : '';
    const slit = type === 'clamp' ? rect(x - 3, y - 76, 6, 30, 'slot')
      + rect(x - 25, y - 62, 50, 7, 'fastener') : '';
    return circle(x, y, 75, 'outline') + circle(x, y, 68, 'outline')
      + (type === 'integral' ? '' : core + key + slit) + centerCross(x, y, 79) + cutTrace(x, y, 101);
  }

  function jointArt(type, input, dims = {}) {
    const a = input ? '모터축' : 'C1 허브축', b = input ? 'S1 썬기어' : 'S2 썬기어';
    const mid = 113, integral = type === 'integral';
    const solid = path('M49 96H150V88H178V70H346V83H412V113H49Z', 'shaft');
    const male = path('M49 96H142V87H181V91H355V113H49Z', input ? 'shaft' : 'carrier');
    const female = path('M181 91V73H208V64H346V76H394V89H369V91Z', 'sun');
    const lowerCase = (type === 'spline' || type === 'press') ? line(184, 91, 355, 91, 'contact') : '';
    const key = type === 'key' ? rect(199, 85, 121, 12, 'fastener') : '';
    const cap = integral ? mirror(solid, mid) : mirror(male + female + lowerCase, mid) + key;
    const size = integral ? '' : dim(181, 355, 62, 40, `L = ${fmt(dims.length)}`)
      + diameter(395, 91, mid, 434, Number.isFinite(dims.d) ? `Ø${fmt(dims.d)}` : 'Ø —');
    const insertion = integral ? '' : label(121, 202, '축 삽입 방향', 'middle') + line(69, 213, 176, 213, 'assembly');
    const point = type === 'key' ? '키 접촉부' : type === 'spline' ? '스플라인 맞물림' : type === 'press' ? '압입 접촉면' : type === 'clamp' ? '보어 조임면' : '연속 재료';
    return cap + line(23, mid, 457, mid, 'axis') + size + insertion
      + leader(116, 95, 51, 67, a) + leader(325, 70, 369, 58, b)
      + leader(263, type === 'key' ? 87 : 135, 246, 192, point);
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

  const assemblyKey = ['입력 커버', '고정 링기어', '1단 썬기어', '1단 유성기어·핀', '1단 캐리어', '2단 썬기어', '2단 유성기어·핀', '2단 캐리어', '출력 베어링'];

  function assemblyFront(d) {
    const hollow = d.stages[0]?.sunBore !== 0;
    return circle(122, 116, 83, 'outline') + circle(122, 116, 72, 'axis')
      + circle(122, 116, 57, 'outline') + circle(122, 116, 37, 'outline')
      + circle(122, 116, 30, 'outline') + (hollow ? circle(122, 116, 18, 'outline') : '')
      + centerCross(122, 116, 88) + cutTrace(122, 116, 103);
  }

  function trainArt(d, focus, r) {
    const two = stageCount(d) === 2;
    const shared = two && d.config.sharedRing, integral = d.struct?.ringHousing === 'integral';
    const mid = 146;
    const first = { left: 178, right: two ? 282 : 392, lower: 119 };
    const second = { left: 332, right: 436, lower: 119 };
    const last = two ? second : first;
    const bearingX = { inside: last.right - 72, outside: last.right + 42, flange: 510 }[d.struct?.obPos] ?? 510;
    const cover = path('M96 42H131V57H144V84H124V111H111V133H88V116H96Z', 'fixed');
    const flange = path('M131 32H166V50H566V72H540V69H189V85H144V57H131Z', 'fixed');
    const ring = shared ? path('M144 69H461V85H436V94H332V85H282V94H178V85H144Z', integral ? 'fixed' : 'ring')
      : [first, ...(two ? [second] : [])].map(g => rect(g.left - 12, 69, g.right - g.left + 24, 25, integral ? 'fixed' : 'ring')).join('');
    const gear = (g, i) => {
      const hollow = d.stages[i]?.sunBore !== 0;
      const join = i === 1 && d.struct?.c1s2 === 'integral' ? 'carrier' : i === 0 && d.struct?.s1motor === 'integral' ? 'shaft' : 'sun';
      const pinLayout = d.stages[i]?.pin;
      const inputSupport = pinLayout?.type !== 'single' || i === 0;
      const outputSupport = pinLayout?.type !== 'single' || i === 1;
      const width = g.right - g.left;
      return rect(g.left, 94, width, 23, 'planet') + line(g.left, 96, g.right, 96, 'axis')
        + rect(g.left, g.lower, width, (hollow ? 134 : mid) - g.lower, join)
        + line(g.left, g.lower + 2, g.right, g.lower + 2, 'axis')
        + (inputSupport ? rect(g.left - 12, 100, 12, 23, 'carrier') : '')
        + (outputSupport ? rect(g.right, 100, 12, 23, 'carrier') : '')
        + rect(g.left - (inputSupport ? 11 : 0), 103, width + (inputSupport ? 11 : 0) + (outputSupport ? 11 : 0), 5, 'pin')
        + (i === 0 ? rect(77, 134, hollow ? 211 : 101, hollow ? 4 : 12, 'shaft') : '');
    };
    const c1 = two ? path('M294 97H308V118H336V130H308V136H282V117H294Z', 'carrier') : '';
    const c2 = path(`M${last.right + 12} 95H${last.right + 30}V86H${bearingX + 28}V79H568V138H535V118H${last.right + 27}V126H${last.right + 12}Z`, 'carrier');
    const mainBearing = rect(bearingX - 5, 51, 35, 21, 'fixed') + bearing(bearingX, 71, 19)
      + rect(bearingX, 90, 28, 5, 'carrier');
    const c1Bearing = two && d.struct?.c1Support !== 'none' ? bearing(305, 78, 16)
      + (d.struct?.c1Support === 'both' ? bearing(150, 110, 17) : '') : '';
    const closing = d.struct?.ringHousing === 'bolt' ? rect(89, 46, 17, 10, 'shaft') + rect(106, 49, 51, 4, 'shaft') : '';
    const boltOrFit = d.struct?.ringHousing === 'press' ? line(165, 69, 451, 69, 'contact') : '';
    const spin = mirror(cover + flange + ring + gear(first, 0) + (two ? gear(second, 1) : '') + c1 + c2
      + mainBearing + c1Bearing + bearing(123, 111, 20) + closing + boltOrFit, mid);
    const x = position => 176 + position * .56;
    const mark = (px, py, fx, fy, n) => balloon(x(px), py, fx, fy, n);
    const partCallouts = mark(115, 74, 190, 27, '1') + mark(207, 76, 262, 24, '2')
      + mark(216, 127, 233, 273, '3') + mark(237, 106, 328, 25, '4')
      + mark(two ? 303 : 409, 121, two ? 316 : 359, 273, '5')
      + (two ? mark(367, 128, 401, 272, '6') + mark(376, 106, 420, 27, '7') : '')
      + mark(553, 117, 510, 272, two ? '8' : '6') + mark(bearingX + 18, 77, 517, 27, two ? '9' : '7');
    const ratio = (i, x) => label(x, 307, `${i + 1}단${focus === '2-2' ? '  ' + fmt(r?.ctx?.stages?.[i]?.geo?.ratio) + ':1' : ''}`, 'middle');
    const ringLabel = focus !== '2-3' ? '' : shared ? label(360, 62, '공유 링 R1–2', 'middle')
      : label(285, 62, '고정 링 R1', 'middle') + (two ? label(413, 62, '고정 링 R2', 'middle') : '');
    return `<g transform="translate(176 0) scale(.56 1)">${spin}</g>` + line(91, mid, 627, mid, 'axis')
      + partCallouts + ringLabel + ratio(0, x(228)) + (two ? ratio(1, x(383)) : '')
      + label(108, mid - 10, '입력') + line(107, mid + 13, 203, mid + 13, 'assembly')
      + label(570, mid - 10, '출력') + line(516, mid + 13, 601, mid + 13, 'assembly');
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
    '2-4': { title: '링–하우징 결합 단면', values: ringOptions, get: d => d.struct?.ringHousing ?? 'press', draw: ringArt, front: (key, fit) => ringFront(key, fit?.boltN) },
    '2-5': { title: '1단 캐리어–2단 썬 결합 단면', values: Object.fromEntries(Object.entries(jointOptions).filter(([k]) => k !== 'clamp')), get: d => d.struct?.c1s2 ?? 'spline', draw: (key, dims) => jointArt(key, false, dims), front: jointFront, onlyTwo: true },
    '2-6': { title: '모터축–1단 썬 결합 단면', values: jointOptions, get: d => d.struct?.s1motor ?? 'key', draw: (key, dims) => jointArt(key, true, dims), front: jointFront },
    '2-7': { title: 'C1 축의 반경 지지', values: supportOptions, get: d => d.struct?.c1Support ?? 'none', draw: supportArt, onlyTwo: true },
    '2-8': { title: '출력 메인 베어링 배치', values: outputOptions, get: d => d.struct?.obPos ?? 'flange', draw: outputArt }
  };

  function compare(spec, current) {
    const alternatives = Object.entries(spec.values).filter(([key]) => key !== current);
    return `<details class="sc-details"><summary>다른 구조 ${alternatives.length}가지 비교</summary><div class="sc-alternatives">${alternatives.map(([key, [name, summary]]) =>
      `<div><h4>${name}</h4>${figure(spec.draw(key), name, { compact: true, w: spec.front ? 480 : 720, h: spec.front ? 245 : 230 })}<p>${summary}</p></div>`).join('')}</div></details>`;
  }
  function jointSize(id, c) {
    const intermediate = id === '2-5';
    const dims = intermediate ? c.D.struct?.c1s2Dim : c.D.struct?.s1Dim;
    const stage = c.R?.ctx?.stages?.[intermediate ? 1 : 0];
    const bore = stage?.geo?.rims?.[0]?.diameter;
    return { d: dims?.d ?? (bore > 0 ? bore : null), length: dims?.L ?? (intermediate ? stage?.st?.b : null) };
  }
  function sheet(front, section, title, assembly = false) {
    return `<div class="sc-sheet">
      <div class="sc-sheet-views"><figure>${figure(front, '정면도 · A–A 절단 위치', { w: 245, h: 225 })}<figcaption>정면도</figcaption></figure>
      <figure>${figure(section, 'SECTION A–A', { w: assembly ? 720 : 480, h: assembly ? 318 : 245 })}<figcaption>SECTION A–A</figcaption></figure></div>
      <footer><strong>${escape(title)}</strong><span>개념도 · 비례 생략 · mm</span></footer></div>`;
  }
  function render(id, c) {
    const spec = variants[id];
    if (spec) {
      if (spec.onlyTwo && stageCount(c.D) === 1) return `<section class="sc card"><h3>${spec.title}</h3><p>2단 구조에서 1단 캐리어와 2단 썬을 연결하는 항목입니다.</p></section>`;
      const current = optionKey(spec.values, spec.get(c.D));
      const [name, text, check] = spec.values[current];
      const sizes = id === '2-4' ? c.D.struct?.ringFit : id === '2-5' || id === '2-6' ? jointSize(id, c) : undefined;
      const size = id === '2-4' && current === 'bolt' ? `플랜지 체결 M${fmt(sizes?.boltD)} × ${fmt(sizes?.boltN)}개` : id === '2-8' ? `롤러 피치원 지름 ${fmt(c.D.outBearing?.dp)} mm` : '';
      const art = spec.draw(current, sizes);
      return `<section class="sc card"><h3>${spec.title} <span class="sc-choice">${name}</span></h3>
        ${spec.front ? sheet(spec.front(current, sizes), art, name) : figure(art, `${spec.title} · ${name}`)}
        ${size ? `<p class="sc-size">${size}</p>` : ''}<p>${text}</p><p class="sc-check">${check}</p>
        ${compare(spec, current)}</section>`;
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
    const two = stageCount(d) === 2;
    const key = two ? assemblyKey : [...assemblyKey.slice(0, 5), '출력 플랜지', assemblyKey[8]];
    const names = key.map((name, i) => `<li><b>${i + 1}</b>${name}</li>`).join('');
    const views = pcd ? figure(art, title) : sheet(assemblyFront(d), art, '유성감속기 조립 단면', true);
    return `<section class="sc card"><h3>${title}</h3>${views}
      ${pcd ? '' : `<ul class="sc-parts">${names}</ul>`}<p>${note}</p>${shortcuts}</section>`;
  }

  root.PGDStructure = { render };
})(globalThis);
