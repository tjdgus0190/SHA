#!/usr/bin/env node
// ad-v3.html → MP4 (1080x1920, 9:16, 30fps, 15s, 효과음 포함)
//   set AD_RENDER_DEPS=<puppeteer-core, ffmpeg-static 설치 폴더>
//   node docs/ad-video/v3/render-v3.js [--lang en] [--stills 1,5,8,11,14]
// 선택: AD_RENDER_DEPS에 @fontsource/noto-sans-kr, @fontsource/noto-serif가 있으면 그 폰트를 주입한다
//       (Noto Sans KR이 설치되지 않은 PC/Linux용). CHROME_PATH, FFMPEG로 실행 파일 경로 지정 가능.
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { createRequire } = require("module");
const { pathToFileURL } = require("url");
const { buildWav } = require("../render/sfx.js");

const depsDir = process.env.AD_RENDER_DEPS;
const req = depsDir ? createRequire(path.join(path.resolve(depsDir), "package.json")) : require;
const puppeteer = req("puppeteer-core");
const ffmpegPath = process.env.FFMPEG || (() => { try { return req("ffmpeg-static"); } catch { return "ffmpeg"; } })();
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i < 0 ? d : process.argv[i + 1]; };
const LANG = arg("lang", "ko") === "en" ? "en" : "ko";
const STILLS = arg("stills", null);
const FPS = 30;
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SFX = LANG === "en" ? "-en" : "";
const OUT = path.join(__dirname, `sha-paint-ad-v3-15s-9x16${SFX}.mp4`);

// @fontsource CSS를 광고에서 쓰는 패밀리 이름(KR, Serif)으로 바꿔 주입할 CSS 만들기
function fontCss() {
  const out = [];
  const add = (pkg, weights, family) => {
    let dir;
    try { dir = path.dirname(req.resolve(`${pkg}/package.json`)); } catch { return; }
    for (const w of weights) {
      const f = path.join(dir, `${w}.css`);
      if (!fs.existsSync(f)) continue;
      out.push(fs.readFileSync(f, "utf8")
        .replace(/font-family:\s*'[^']+'/g, `font-family: '${family}'`)
        .replace(/url\(\.\/files\/([^)]+)\)/g, (_, file) => `url(${pathToFileURL(path.join(dir, "files", file)).href})`));
    }
  };
  add("@fontsource/noto-sans-kr", [500, 700, 800, 900], "KR");
  add("@fontsource/noto-serif", [700], "Serif");
  return out.join("\n");
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars", "--no-sandbox"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const url = pathToFileURL(path.join(__dirname, "ad-v3.html")).href + `?render=1&lang=${LANG}`;
  await page.goto(url, { waitUntil: "load" });
  const css = fontCss();
  if (css) await page.addStyleTag({ content: css });
  await page.evaluate(() => window.__start());
  await page.waitForFunction("window.__adReady === true", { timeout: 60000 });
  const info = await page.evaluate(() => window.AD_INFO);

  if (STILLS) {
    const dir = path.join(__dirname, "frames"); fs.mkdirSync(dir, { recursive: true });
    for (const s of STILLS.split(",").map(Number)) {
      await page.evaluate((t) => window.renderAt(t), s);
      const f = path.join(dir, `v3${SFX}-t${s.toFixed(2).replace(".", "_")}.png`);
      await page.screenshot({ path: f, type: "png" });
      console.log("still:", f);
    }
    await browser.close(); return;
  }

  const wav = path.join(__dirname, `sfx-v3${SFX}.wav`);
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
