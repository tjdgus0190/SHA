#!/usr/bin/env node
// ad-v2.html → MP4 (1080x1350, 4:5, 30fps, 15s, 효과음 포함)
//   set AD_RENDER_DEPS=<puppeteer-core, ffmpeg-static 설치 폴더>
//   node docs/ad-video/v2/render-v2.js [--lang en] [--stills 1,5,8,10.8,13]
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { createRequire } = require("module");
const { buildWav } = require("../render/sfx.js");

const depsDir = process.env.AD_RENDER_DEPS;
const req = depsDir ? createRequire(path.join(path.resolve(depsDir), "package.json")) : require;
const puppeteer = req("puppeteer-core");
const ffmpegPath = req("ffmpeg-static");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i < 0 ? d : process.argv[i + 1]; };
const LANG = arg("lang", "ko") === "en" ? "en" : "ko";
const STILLS = arg("stills", null);
const FPS = 30;
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SFX = LANG === "en" ? "-en" : "";
const OUT = path.join(__dirname, `sha-paint-ad-v2-15s-4x5${SFX}.mp4`);

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
  const url = "file:///" + path.join(__dirname, "ad-v2.html").replace(/\\/g, "/") + `?render=1&lang=${LANG}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction("window.__adReady === true", { timeout: 60000 });
  const info = await page.evaluate(() => window.AD_INFO);

  if (STILLS) {
    const dir = path.join(__dirname, "frames"); fs.mkdirSync(dir, { recursive: true });
    for (const s of STILLS.split(",").map(Number)) {
      await page.evaluate((t) => window.renderAt(t), s);
      const f = path.join(dir, `v2${SFX}-t${s.toFixed(2).replace(".", "_")}.png`);
      await page.screenshot({ path: f, type: "png" });
      console.log("still:", f);
    }
    await browser.close(); return;
  }

  const wav = path.join(__dirname, `sfx-v2${SFX}.wav`);
  fs.writeFileSync(wav, buildWav(await page.evaluate(() => window.SFX_CUES), info.DURATION));
  const total = Math.round(info.DURATION * FPS);
  const ff = spawn(ffmpegPath, ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-i", wav,
    "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-frames:v", String(total), "-movflags", "+faststart", OUT], { stdio: ["pipe", "inherit", "inherit"] });
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.renderAt(t), i / FPS);
    const buf = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  fs.unlinkSync(wav);
  await browser.close();
  console.log("done:", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
