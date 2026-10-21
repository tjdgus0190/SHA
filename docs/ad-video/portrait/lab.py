"""SHA Paint 인물 광고용 프레임 소스 생성.

source/portrait-blue.jpg(갈색 한 톤으로 칠한 얼굴)에 포인트 색을 더한다.
  - SHA Paint식: 그 자리의 명도(L*)는 그대로, 색(a*, b*)만 보라/빨강/금색/청록 쪽으로 → 4단계 누적
  - 보통 피커식: 같은 자리에 피커에서 고른 고정 색(자기 명도를 가진 색)을 칠함
  - 각 버전의 흑백(L*만), 보통 피커 버전은 명도가 달라진 곳을 빨갛게 표시
를 frames-src/ 에 PNG로 저장한다. 색 변환 상수는 app/colorMath.js와 같다(sRGB D65).
인물 영역 마스크는 같은 그림의 흰 배경판(source/portrait-white.jpg)에서 얻는다.

  python docs/ad-video/portrait/lab.py
"""
import json
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source", "portrait-blue.jpg")
SRC_WHITE = os.path.join(HERE, "source", "portrait-white.jpg")
CROP = (150, 40, 730, 720)   # 얼굴~목 (x0, y0, x1, y1), 2배 확대해서 사용
SCALE = 2
OUT = os.path.join(HERE, "frames-src")

M = np.array([[0.4124564, 0.3575761, 0.1804375],
              [0.2126729, 0.7151522, 0.0721750],
              [0.0193339, 0.1191920, 0.9503041]])
MI = np.array([[3.2404542, -1.5371385, -0.4985314],
               [-0.9692660, 1.8760108, 0.0415560],
               [0.0556434, -0.2040259, 1.0572252]])
WHITE = np.array([0.95047, 1.0, 1.08883])
EPS, KAPPA = 216 / 24389, 24389 / 27


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def rgb2lab(rgb):
    xyz = to_lin(rgb / 255.0) @ M.T / WHITE
    f = np.where(xyz > EPS, np.cbrt(xyz), (KAPPA * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def lab2lin(lab):
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    inv = lambda f: np.where(f ** 3 > EPS, f ** 3, (116 * f - 16) / KAPPA)
    xyz = np.stack([inv(fx), np.where(L > KAPPA * EPS, fy ** 3, L / KAPPA), inv(fz)], -1) * WHITE
    return xyz @ MI.T


def lab2rgb_keepL(lab):
    """L*를 정확히 유지하면서 sRGB 밖이면 채도(a,b)만 줄여서 넣는다."""
    lo = np.zeros(lab.shape[:-1])
    hi = np.ones(lab.shape[:-1])
    ok = np.all((lambda v: (v >= -1e-4) & (v <= 1 + 1e-4))(lab2lin(lab)), -1)
    k = np.where(ok, 1.0, 0.0)
    lo = k.copy()
    for _ in range(18):
        mid = (lo + hi) / 2
        t = lab.copy(); t[..., 1:] *= mid[..., None]
        good = np.all((lambda v: (v >= -1e-4) & (v <= 1 + 1e-4))(lab2lin(t)), -1)
        lo = np.where(good | ok, np.maximum(lo, mid), lo)
        hi = np.where(good | ok, hi, mid)
    t = lab.copy(); t[..., 1:] *= np.where(ok, 1.0, lo)[..., None]
    return np.clip(np.round(to_srgb(lab2lin(t)) * 255), 0, 255).astype(np.uint8)


def gray_of(rgb):
    lab = rgb2lab(rgb.astype(float))
    lab[..., 1:] = 0
    return lab2rgb_keepL(lab)


def blur(m, r):
    from PIL import ImageFilter
    return np.array(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))) / 255.0


def sstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blobs(shape, pts):
    """(x, y, r) 원본 800px 좌표 → 크롭·확대 좌표의 부드러운 원 합"""
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    m = np.zeros(shape)
    for x, y, r in pts:
        cx, cy, rr_ = (x - CROP[0]) * SCALE, (y - CROP[1]) * SCALE, r * SCALE
        m = np.maximum(m, np.clip(1 - np.hypot(xx - cx, yy - cy) / rr_, 0, 1) ** 0.8)
    return m


def load(path):
    im = Image.open(path).convert("RGB").crop(CROP)
    return np.array(im.resize((im.width * SCALE, im.height * SCALE), Image.LANCZOS)).astype(float)


# 포인트 색: (이름, 목표 색조°, 목표 채도, 보통 피커에서 고른 색)
ACCENTS = [
    ("shadow", 286, 52, (108, 76, 208)),   # 그림자에 보라
    ("flush", 0, 64, (226, 72, 72)),       # 볼·코·귀·입술에 마젠타빛 혈색
    ("light", 68, 78, (242, 196, 67)),     # 하이라이트에 금빛
    ("rim", 228, 56, (47, 170, 200)),      # 턱 아래·목 반사광에 청록(배경 파랑의 반사)
    ("hair", 325, 58, (200, 60, 170)),     # 머리카락·귀 테두리에 핫핑크 포인트
]


def main():
    os.makedirs(OUT, exist_ok=True)
    rgb = load(SRC)
    white = load(SRC_WHITE)
    fig = blur((white.min(-1) < 232).astype(float), 2)
    lab = rgb2lab(rgb)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    shp = L.shape

    masks = {
        "shadow": sstep(L, 28, 11) * fig,
        "flush": blur(blobs(shp, [(300, 330, 80), (455, 330, 115), (560, 295, 70), (330, 392, 60), (275, 215, 55)]) * sstep(L, 12, 24), 28) * fig,
        "light": blur(sstep(L, 31, 45) * blobs(shp, [(330, 200, 160), (300, 300, 75), (450, 300, 100), (560, 560, 130), (330, 440, 70)]), 5) * fig,
        "rim": blur(blobs(shp, [(420, 500, 105), (395, 585, 70), (615, 575, 60), (250, 330, 45)]) * sstep(L, 8, 20) * (1 - sstep(L, 36, 46)), 18) * fig,
        "hair": blur(blobs(shp, [(340, 95, 120), (575, 255, 40), (555, 330, 30)]) * sstep(L, 34, 18), 6) * fig,
    }
    for k, m in masks.items():
        Image.fromarray((m * 255).astype(np.uint8)).save(os.path.join(OUT, f"mask-{k}.png"))

    def save(name, arr):
        Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + ".png"))

    save("orig", rgb)
    save("gray", gray_of(rgb.astype(np.uint8)))

    # SHA Paint식: L 고정, (a,b)를 목표 색 쪽으로 — 단계별 누적
    ca, cb = a.copy(), b.copy()
    info = {}
    for i, (name, hue, chroma, _) in enumerate(ACCENTS, 1):
        w = np.clip(masks[name] * 0.95, 0, 1)
        C0 = np.hypot(ca, cb)
        tc = np.maximum(C0, chroma)
        ta, tb = tc * np.cos(np.radians(hue)), tc * np.sin(np.radians(hue))
        ca, cb = ca + (ta - ca) * w, cb + (tb - cb) * w
        out = lab2rgb_keepL(np.stack([L, ca, cb], -1))
        save(f"sha-{i}", out)
        info[f"sha-{i}"] = round(float(np.abs(rgb2lab(out.astype(float))[..., 0] - L)[fig > 0.5].mean()), 3)

    # 보통 피커식: 같은 마스크에 고정 RGB 색을 그대로 칠함(색마다 명도가 제각각)
    nv = rgb.copy()
    for name, _, _, col in ACCENTS:
        w = np.clip(masks[name] * 0.75, 0, 1)[..., None]
        nv = nv * (1 - w) + np.array(col, float) * w
    nv = np.clip(np.round(nv), 0, 255)
    save("naive", nv)
    ng = gray_of(nv.astype(np.uint8))
    save("naive-gray", ng)
    dl = np.abs(rgb2lab(nv)[..., 0] - L)
    w = np.clip((dl - 5) / 8, 0, 1)[..., None] * 0.75
    save("naive-diff", ng * (1 - w) + np.array([226, 64, 48]) * w)
    info["naive"] = round(float(dl[fig > 0.5].mean()), 2)
    with open(os.path.join(OUT, "info.json"), "w") as f:
        json.dump({"meanAbsDeltaL_in_figure": info}, f, indent=1)
    print(json.dumps(info, indent=1))


if __name__ == "__main__":
    main()
