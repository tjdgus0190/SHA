/**
 * colorMath.js
 * ------------------------------------------------------------------
 * sRGB <-> Linear RGB <-> XYZ(D65) <-> CIE Lab 변환과,
 * "휘도 고정" 상태에서 색상(Hue)/채도(Chroma or Saturation)만 바꾼
 * 컬러 타일 그리드를 생성하는 순수 함수 모음.
 *
 * 두 가지 휘도 정의를 모두 지원한다:
 *  1) LAB  모드: CIE Lab의 L* (지각적 명도, 실제로 사람이 "밝기가 같다"고
 *     느끼는 것과 가장 가까움). TourBox / 대부분의 "동명도 팔레트" 도구가
 *     이 방식을 사용한다.
 *  2) LUMA 모드: ITU-R BT.709 상대휘도 Y (선형 RGB 가중합, WCAG에서
 *     쓰는 그 공식). 모니터 물리 휘도 기준으로 맞추고 싶을 때 사용.
 * ------------------------------------------------------------------
 */

// ---------- sRGB <-> Linear ----------

function srgbToLinear(c) {
  // c: 0-1
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  // c: 0-1 (linear)
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v;
}

// ---------- Linear RGB <-> XYZ (D65) ----------
// sRGB / D65 표준 행렬

const M_RGB2XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041]
];

const M_XYZ2RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.9692660, 1.8760108, 0.0415560],
  [0.0556434, -0.2040259, 1.0572252]
];

function linearRgbToXyz(r, g, b) {
  return {
    x: M_RGB2XYZ[0][0] * r + M_RGB2XYZ[0][1] * g + M_RGB2XYZ[0][2] * b,
    y: M_RGB2XYZ[1][0] * r + M_RGB2XYZ[1][1] * g + M_RGB2XYZ[1][2] * b,
    z: M_RGB2XYZ[2][0] * r + M_RGB2XYZ[2][1] * g + M_RGB2XYZ[2][2] * b
  };
}

function xyzToLinearRgb(x, y, z) {
  return {
    r: M_XYZ2RGB[0][0] * x + M_XYZ2RGB[0][1] * y + M_XYZ2RGB[0][2] * z,
    g: M_XYZ2RGB[1][0] * x + M_XYZ2RGB[1][1] * y + M_XYZ2RGB[1][2] * z,
    b: M_XYZ2RGB[2][0] * x + M_XYZ2RGB[2][1] * y + M_XYZ2RGB[2][2] * z
  };
}

// D65 reference white
const WHITE = { x: 0.95047, y: 1.0, z: 1.08883 };

function fLab(t) {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}

function fLabInv(t) {
  const d = 6 / 29;
  return t > d ? t * t * t : 3 * d * d * (t - 4 / 29);
}

function xyzToLab(x, y, z) {
  const fx = fLab(x / WHITE.x);
  const fy = fLab(y / WHITE.y);
  const fz = fLab(z / WHITE.z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function labToXyz(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return {
    x: WHITE.x * fLabInv(fx),
    y: WHITE.y * fLabInv(fy),
    z: WHITE.z * fLabInv(fz)
  };
}

// ---------- Public: RGB(0-255) <-> Lab ----------

function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);
  const { x, y, z } = linearRgbToXyz(lr, lg, lb);
  return xyzToLab(x, y, z);
}

/**
 * Lab -> RGB(0-255). sRGB 색역을 벗어나면 null을 반환한다(엄격 모드),
 * 또는 clamp=true 이면 0-255로 클리핑해서 반환한다(근사값, 색이 약간
 * 틀어질 수 있음을 감안).
 */
function labToRgb(L, a, b, clamp = false) {
  const { x, y, z } = labToXyz(L, a, b);
  const lin = xyzToLinearRgb(x, y, z);
  const r = linearToSrgb(lin.r);
  const g = linearToSrgb(lin.g);
  const bch = linearToSrgb(lin.b);

  const inGamut =
    r >= -0.001 && r <= 1.001 &&
    g >= -0.001 && g <= 1.001 &&
    bch >= -0.001 && bch <= 1.001;

  if (!inGamut && !clamp) return null;

  const clip = (v) => Math.min(255, Math.max(0, Math.round(v * 255)));
  return { r: clip(r), g: clip(g), b: clip(bch), inGamut };
}

/**
 * ITU-R BT.709 상대휘도 Y (0-1). 선형화된 RGB의 가중합.
 * WCAG "relative luminance" 공식과 동일.
 */
function relativeLuminance(r, g, b) {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function rgbToHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ==========================================================================
// 타일 그리드 생성
// ==========================================================================

/**
 * 주어진 L*, hue에서 sRGB 색역 안에 들어오는 "가장 진한(최대) chroma"를
 * 이진 탐색으로 찾는다. L*이 0/100에 가까우면 이 값 자체가 매우 작아지는데,
 * 그게 정상이다 (극단적으로 어둡거나 밝은 색은 원래 채도를 많이 못 낸다).
 *
 * @returns {number} 0 이상, searchCeiling 이하의 최대 in-gamut chroma
 */
function findMaxChromaForHue(L, hueDeg, searchCeiling = 160) {
  const rad = (hueDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // 우선 색역 안에 들어오는지 빠르게 확인
  if (!labToRgb(L, searchCeiling * cos, searchCeiling * sin, false)) {
    // ceiling 자체가 색역 밖이면 정상적인 경우 (거의 항상 그렇다) -> 이진 탐색
    let lo = 0, hi = searchCeiling;
    for (let iter = 0; iter < 18; iter++) {
      const mid = (lo + hi) / 2;
      const res = labToRgb(L, mid * cos, mid * sin, false);
      if (res) lo = mid; else hi = mid;
    }
    return lo;
  }
  // ceiling까지도 색역 안이면 (이론상 거의 없음) ceiling 그대로 반환
  return searchCeiling;
}

/**
 * 주어진 hue와 chroma(=지금 색의 채도)를 그대로 유지한 채 표현 가능한
 * L*의 범위 [Lmin, Lmax]를 찾는다. 검은색/흰색이나 다른 색으로 새지 않고
 * "이 색 자체"가 존재할 수 있는 명도 구간만 찾는 것.
 *
 * 원리: 어떤 hue에서 "L*별 최대 chroma" 함수는 L*=0과 100 근처에서 0에
 * 가깝고 중간 어딘가(피크)에서 최댓값을 갖는 단봉(unimodal) 형태다. 이
 * 함수가 요청한 chroma 이상인 구간이 곧 [Lmin, Lmax]다. 좌우 경계를 각각
 * 이진 탐색으로 정밀하게 찾는다.
 *
 * @returns {{Lmin:number, Lmax:number}}
 */
function findLightnessRangeForChroma(hueDeg, chroma, sampleSteps = 40) {
  if (chroma <= 0) return { Lmin: 0, Lmax: 100 }; // 무채색은 항상 전 구간에서 존재

  // 1) 성긴 샘플링으로 피크(최대 chroma) 위치를 찾는다
  const samples = [];
  let bestIdx = 0, bestVal = -1;
  for (let i = 0; i <= sampleSteps; i++) {
    const L = (i / sampleSteps) * 100;
    const m = findMaxChromaForHue(L, hueDeg);
    samples.push(m);
    if (m > bestVal) { bestVal = m; bestIdx = i; }
  }

  // 요청한 chroma가 이 hue에서 아예 도달 불가능하면(피크보다 큼, 부동소수점
  // 오차 등으로 발생 가능) 안전하게 전 구간을 반환
  if (bestVal < chroma) return { Lmin: 0, Lmax: 100 };

  // 2) 왼쪽 경계: 피크에서 왼쪽으로 가며 처음 chroma 밑으로 내려가는 구간을
  //    찾고, 그 사이를 이진 탐색으로 정밀화
  let leftIdx = bestIdx;
  while (leftIdx > 0 && samples[leftIdx - 1] >= chroma) leftIdx--;
  let Lmin;
  if (leftIdx === 0 && samples[0] >= chroma) {
    Lmin = 0;
  } else {
    let lo = ((leftIdx - 1) / sampleSteps) * 100;
    let hi = (leftIdx / sampleSteps) * 100;
    for (let iter = 0; iter < 14; iter++) {
      const mid = (lo + hi) / 2;
      if (findMaxChromaForHue(mid, hueDeg) >= chroma) hi = mid; else lo = mid;
    }
    Lmin = hi;
  }

  // 3) 오른쪽 경계도 동일하게
  let rightIdx = bestIdx;
  while (rightIdx < sampleSteps && samples[rightIdx + 1] >= chroma) rightIdx++;
  let Lmax;
  if (rightIdx === sampleSteps && samples[sampleSteps] >= chroma) {
    Lmax = 100;
  } else {
    let lo = (rightIdx / sampleSteps) * 100;
    let hi = ((rightIdx + 1) / sampleSteps) * 100;
    for (let iter = 0; iter < 14; iter++) {
      const mid = (lo + hi) / 2;
      if (findMaxChromaForHue(mid, hueDeg) >= chroma) lo = mid; else hi = mid;
    }
    Lmax = lo;
  }

  return { Lmin, Lmax };
}

/**
 * LAB 모드: 전경색의 L*을 고정한 채, hue(0-360)를 스캔하고, 각 hue마다
 * "그 hue에서 실제로 도달 가능한 최대 chroma"를 먼저 구한 뒤 그 범위 안에서
 * chroma 행을 나눈다. (고정 maxChroma를 쓰면 L*이 아주 낮거나 높을 때
 * 대부분의 hue가 색역 밖이라 타일이 전부 회색으로 뭉개지는 문제가 있었음)
 *
 * @param {number} L        고정할 L* (0-100)
 * @param {number} hueSteps 표시할 hue 열 개수
 * @param {number} chromaSteps 표시할 chroma 행 개수
 * @param {number} hueOffsetDeg 휠 스크롤로 회전된 hue 시작 각도
 * @param {number} chromaScale Shift+휠로 조정하는 배율(0.25~2.0).
 *        1.0 = 각 hue의 실제 최대 chroma까지 균등 분할.
 *        1.0보다 작으면 최대치 근처 촘촘한 구간만, 크면 최대치를 넘어가려는
 *        시도를 하되 자동으로 clamp된다(그 이상은 어차피 색역 밖이라 동일한
 *        색이 반복될 수 있음 — 이 경우 UI에서 "포화" 상태로 보임).
 */
function generateLabTiles(L, { hueSteps = 12, chromaSteps = 5, hueOffsetDeg = 0, chromaScale = 1 } = {}) {
  const rows = [];
  const perHueMax = [];
  for (let hi = 0; hi < hueSteps; hi++) {
    const hueDeg = (hueOffsetDeg + (360 * hi) / hueSteps) % 360;
    perHueMax.push(findMaxChromaForHue(L, hueDeg));
  }

  for (let ci = chromaSteps - 1; ci >= 0; ci--) {
    // ci=0 -> 무채색(회색)에 가까움, 위로 갈수록(ci 큼) 채도 높음
    const row = [];
    for (let hi = 0; hi < hueSteps; hi++) {
      const hueDeg = (hueOffsetDeg + (360 * hi) / hueSteps) % 360;
      const rad = (hueDeg * Math.PI) / 180;

      const hueMax = perHueMax[hi];
      // chromaScale > 1 이면 hueMax를 넘어서려는 목표치가 생기는데,
      // clamp(true)로 안전하게 처리하면 자동으로 hueMax 근처에서 잘린다.
      const targetChroma = (hueMax * chromaScale * (ci + 1)) / chromaSteps;
      const clampedTarget = Math.min(targetChroma, hueMax * Math.max(chromaScale, 1));

      const a = clampedTarget * Math.cos(rad);
      const b = clampedTarget * Math.sin(rad);
      let best = labToRgb(L, a, b, false);
      if (!best) {
        // 부동소수점 오차로 경계에서 살짝 밀려난 경우 대비
        best = labToRgb(L, a, b, true);
      }
      row.push({
        hex: rgbToHex(best.r, best.g, best.b),
        r: best.r, g: best.g, b: best.b,
        hueDeg, chroma: clampedTarget, hueMaxChroma: hueMax,
        saturated: clampedTarget >= hueMax - 0.5
      });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * 픽셀 단위 색상 필드(비정형 블롭) 렌더링을 위한 헬퍼.
 * 필드 캔버스 위의 각 픽셀은 (a,b) 평면(또는 luma 모드에선 극좌표 hue/sat
 * 평면)의 한 점이며, 이 함수는 그 점이 sRGB 색역 안이면 실제 RGB를,
 * 밖이면 null을 반환한다. 캔버스 쪽에서 그대로 픽셀 색 or 투명 처리하면
 * 자동으로 "그 밝기에서 실제 표현 가능한 색의 진짜 경계 모양"이 그려진다
 * (TourBox의 비정형 블롭 UI가 바로 이것과 동일한 원리).
 */
function labFieldPixel(L, a, b, clamp = false) {
  return labToRgb(L, a, b, clamp);
}

/**
 * luma 모드에서 (hueDeg, sat 0~1)에 대해 목표 Y를 만족하는 RGB를 구한다.
 * sat이 1을 넘으면 null(범위 밖)을 반환해서 labFieldPixel과 동일한
 * 인터페이스로 쓸 수 있게 한다.
 */
function lumaFieldPixel(targetY, hueDeg, sat) {
  if (sat < 0 || sat > 1) return null;
  const rgb = hslToRgb(hueDeg, sat, 0.5);
  // 아래 이진 탐색은 generateLumaTiles와 동일한 방식
  let lo = 0, hi = 1, best = rgb;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    const c = hslToRgb(hueDeg, sat, mid);
    const y = relativeLuminance(c.r, c.g, c.b);
    best = c;
    if (y < targetY) lo = mid; else hi = mid;
  }
  return best;
}

/** 극좌표(chroma, hueDeg) -> 직교좌표(a,b) */
function polarToAB(chroma, hueDeg) {
  const rad = (hueDeg * Math.PI) / 180;
  return { a: chroma * Math.cos(rad), b: chroma * Math.sin(rad) };
}

/** 직교좌표(a,b) -> 극좌표(chroma, hueDeg, 0~360) */
function abToPolar(a, b) {
  const chroma = Math.hypot(a, b);
  let hueDeg = (Math.atan2(b, a) * 180) / Math.PI;
  if (hueDeg < 0) hueDeg += 360;
  return { chroma, hueDeg };
}

/**
 * HSL -> RGB(0-255). generateLumaTiles와 lumaFieldPixel에서 공용으로 쓴다.
 */
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1, g1, b1;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
}

function generateLumaTiles(targetY, { hueSteps = 12, satSteps = 5, hueOffsetDeg = 0, satScale = 1 } = {}) {
  const rows = [];
  for (let si = satSteps - 1; si >= 0; si--) {
    const sat = Math.min(1, (satScale * (si + 1)) / satSteps); // 0-1
    const row = [];
    for (let hi = 0; hi < hueSteps; hi++) {
      const hueDeg = (hueOffsetDeg + (360 * hi) / hueSteps) % 360;

      // targetY에 맞는 lightness를 이진 탐색 (Y는 l에 대해 단조 증가)
      let lo = 0, hiL = 1, bestRgb = hslToRgb(hueDeg, sat, 0.5);
      for (let iter = 0; iter < 20; iter++) {
        const mid = (lo + hiL) / 2;
        const rgb = hslToRgb(hueDeg, sat, mid);
        const y = relativeLuminance(rgb.r, rgb.g, rgb.b);
        bestRgb = rgb;
        if (y < targetY) lo = mid; else hiL = mid;
      }
      row.push({
        hex: rgbToHex(bestRgb.r, bestRgb.g, bestRgb.b),
        r: bestRgb.r, g: bestRgb.g, b: bestRgb.b,
        hueDeg, sat
      });
    }
    rows.push(row);
  }
  return rows;
}

const ColorMath = {
  rgbToLab,
  labToRgb,
  relativeLuminance,
  rgbToHex,
  findMaxChromaForHue,
  findLightnessRangeForChroma,
  generateLabTiles,
  generateLumaTiles,
  labFieldPixel,
  lumaFieldPixel,
  polarToAB,
  abToPolar,
  hslToRgb
};

if (typeof module !== "undefined" && module.exports) {
  // Node / UXP (CommonJS)
  module.exports = ColorMath;
}
if (typeof window !== "undefined") {
  // 브라우저 <script src="colorMath.js"> 로 바로 로드하는 경우
  window.ColorMath = ColorMath;
}
