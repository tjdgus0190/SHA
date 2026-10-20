#!/usr/bin/env node
// render.js — ad.html 을 프레임 단위로 캡처해 MP4로 만든다.
//
// 사용법 (프로젝트 package.json 을 건드리지 않도록 의존성은 별도 작업 폴더에 설치):
//   mkdir <작업폴더> && cd <작업폴더> && npm init -y && npm i puppeteer-core ffmpeg-static
//   set AD_RENDER_DEPS=<작업폴더>            (PowerShell: $env:AD_RENDER_DEPS="<작업폴더>")
//   node "docs/ad-video/render/render.js" --ar 9x16
//   node "docs/ad-video/render/render.js" --ar 16x9
//   옵션: --fps 30  --out <파일.mp4>  --chrome <chrome.exe 경로>  --stills 1,5,10,14 (해당 초의 PNG만 저장)
//         --cta "지금 체험하기"  --url "shapaint.com"   (엔드카드 문구 교체)
//         --no-audio  (효과음 없이)
//         --lang en   (영문판 → sha-paint-ad-15s-<비율>-en.mp4)
"use strict";

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { createRequire } = require("module");
const { buildWav } = require("./sfx.js");

const depsDir = process.env.AD_RENDER_DEPS;
const req = depsDir ? createRequire(path.join(path.resolve(depsDir), "package.json")) : require;
const puppeteer = req("puppeteer-core");
const ffmpegPath = req("ffmpeg-static");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}

const AR = arg("ar", "9x16") === "16x9" ? "16x9" : "9x16";
const LANG = arg("lang", "ko") === "en" ? "en" : "ko";
const FPS = Number(arg("fps", 30));
const W = AR === "9x16" ? 1080 : 1920;
const H = AR === "9x16" ? 1920 : 1080;
const AD_DIR = path.resolve(__dirname, "..");
const OUT = path.resolve(arg("out", path.join(AD_DIR, `sha-paint-ad-15s-${AR}${LANG === "en" ? "-en" : ""}.mp4`)));
const CHROME = arg("chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const STILLS = arg("stills", null);
const NO_AUDIO = arg("no-audio", false) === true;
const CTA = arg("cta", null), URLT = arg("url", null);

(async () => {
  const qs = new URLSearchParams({ ar: AR, render: "1" });
  if (LANG === "en") qs.set("lang", "en");
  if (CTA && CTA !== true) qs.set("cta", CTA);
  if (URLT && URLT !== true) qs.set("url", URLT);
  const url = "file:///" + path.join(AD_DIR, "ad.html").replace(/\\/g, "/") + "?" + qs.toString();

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars", "--disable-lcd-text", "--font-render-hinting=none"]
  });
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.error("[page]", m.text()); });
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction("window.__adReady === true", { timeout: 60000 });
  const info = await page.evaluate(() => window.AD_INFO);
  console.log("ad info:", JSON.stringify(info));
  const duration = info.DURATION;

  if (STILLS && STILLS !== true) {
    const outDir = path.join(AD_DIR, "frames");
    fs.mkdirSync(outDir, { recursive: true });
    for (const s of String(STILLS).split(",").map(Number)) {
      await page.evaluate((t) => window.renderAt(t), s);
      const file = path.join(outDir, `${AR}${LANG === "en" ? "-en" : ""}-t${s.toFixed(2).replace(".", "_")}.png`);
      await page.screenshot({ path: file, type: "png" });
      console.log("still:", file);
    }
    await browser.close();
    return;
  }

  // 오디오 (코드 합성 효과음)
  let wavPath = null;
  if (!NO_AUDIO) {
    const cues = await page.evaluate(() => window.SFX_CUES);
    wavPath = path.join(AD_DIR, "render", `sfx-${AR}.wav`);
    fs.writeFileSync(wavPath, buildWav(cues, duration));
    console.log("audio:", wavPath, cues.length, "cues");
  }

  const total = Math.round(duration * FPS);
  const ffArgs = ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-"];
  if (wavPath) ffArgs.push("-i", wavPath);
  ffArgs.push("-map", "0:v");
  if (wavPath) ffArgs.push("-map", "1:a", "-c:a", "aac", "-b:a", "192k");
  ffArgs.push("-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-frames:v", String(total), "-movflags", "+faststart", OUT);
  const ff = spawn(ffmpegPath, ffArgs, { stdio: ["pipe", "inherit", "pipe"] });
  let ffErr = "";
  ff.stderr.on("data", (d) => { ffErr += d.toString(); if (ffErr.length > 20000) ffErr = ffErr.slice(-10000); });
  const ffDone = new Promise((res) => ff.on("close", res));

  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.renderAt(t), i / FPS);
    const buf = await page.screenshot({ type: "png", optimizeForSpeed: true });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 30 === 0) process.stdout.write(`\rframe ${i + 1}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  const code = await ffDone;
  await browser.close();
  console.log(`\nffmpeg exit ${code}`);
  if (code !== 0) { console.error(ffErr.slice(-3000)); process.exit(1); }
  console.log("done:", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
