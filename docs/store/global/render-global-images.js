#!/usr/bin/env node
// global/global-images.html을 Chrome으로 캡처해 Gumroad(글로벌)용 PNG를 만든다.
//   sha-paint-global-cover-1280x720.png (표지: 원본 → 같은 명도 색 추가, 흑백 동일)
//   sha-paint-global-ui-1280x720.png    (영어 앱 화면)
//   sha-paint-global-thumb-600x600.png  (썸네일)
// PNG에는 72 DPI(pHYs 2835 px/m) 메타데이터를 넣는다.
//
// 의존성: puppeteer-core (프로젝트 package.json에는 넣지 않음)
//   set AD_RENDER_DEPS=<puppeteer-core가 설치된 폴더>
//   node docs/store/global/render-global-images.js
// Noto Sans KR/Serif가 설치되지 않은 PC/Linux: AD_RENDER_DEPS에 @fontsource/noto-sans-kr, @fontsource/noto-serif를 같이 설치하면 주입한다.
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const { createRequire } = require("module");

const depsDir = process.env.AD_RENDER_DEPS;
const req = depsDir ? createRequire(path.join(path.resolve(depsDir), "package.json")) : require;
const puppeteer = req("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// IHDR 바로 뒤에 pHYs(72 DPI)를 넣고, 기존 pHYs가 있으면 제거한다.
function setDpi(png, dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const out = [png.subarray(0, 8)];
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("ascii", off + 4, off + 8);
    const whole = png.subarray(off, off + 12 + len);
    if (type !== "pHYs") out.push(whole);
    if (type === "IHDR") {
      const d = Buffer.alloc(9); d.writeUInt32BE(ppm, 0); d.writeUInt32BE(ppm, 4); d[8] = 1;
      out.push(chunk("pHYs", d));
    }
    off += 12 + len;
  }
  return Buffer.concat(out);
}

// @fontsource CSS를 이 페이지의 패밀리 이름(KR, Serif)으로 바꿔 주입(설치 폰트가 없을 때)
const fontCss = (() => {
  const out = [];
  const add = (pkg, weights, family) => {
    let dir; try { dir = path.dirname(req.resolve(`${pkg}/package.json`)); } catch { return; }
    for (const w of weights) {
      const f = path.join(dir, `${w}.css`); if (!fs.existsSync(f)) continue;
      out.push(fs.readFileSync(f, "utf8").replace(/font-family:\s*'[^']+'/g, `font-family: '${family}'`)
        .replace(/url\(\.\/files\/([^)]+)\)/g, (_, file) => `url(file://${path.join(dir, "files", file).replace(/\\/g, "/")})`));
    }
  };
  add("@fontsource/noto-sans-kr", [400, 500, 700, 800, 900], "KR");
  add("@fontsource/noto-serif", [700], "Serif");
  return out.join("\n");
})();

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--no-sandbox"] });
  const page = await browser.newPage();
  const html = "file:///" + path.join(__dirname, "global-images.html").replace(/\\/g, "/");
  const jobs = [
    { mode: "cover", w: 1280, h: 720, out: "sha-paint-global-cover-1280x720.png" },
    { mode: "ui", w: 1280, h: 720, out: "sha-paint-global-ui-1280x720.png" },
    { mode: "thumb", w: 600, h: 600, out: "sha-paint-global-thumb-600x600.png" }
  ];
  for (const j of jobs) {
    await page.setViewport({ width: j.w, height: j.h, deviceScaleFactor: 1 });
    await page.goto(html + "?mode=" + j.mode + (j.lang ? "&lang=" + j.lang : ""), { waitUntil: "load" });
    if (fontCss) await page.addStyleTag({ content: fontCss });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction("window.__ready === true");
    const shot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: j.w, height: j.h } });
    const outPath = path.join(__dirname, j.out);
    fs.writeFileSync(outPath, setDpi(Buffer.from(shot), 72));
    console.log("->", outPath);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
