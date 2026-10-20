#!/usr/bin/env node
// profile.html을 1080x1080 PNG로 캡처하고, 원형 크롭 미리보기도 함께 만든다.
//   set AD_RENDER_DEPS=<puppeteer-core가 설치된 폴더>
//   node docs/brand/instagram/render-profile.js
const path = require("path");
const { createRequire } = require("module");
const depsDir = process.env.AD_RENDER_DEPS;
const req = depsDir ? createRequire(path.join(path.resolve(depsDir), "package.json")) : require;
const puppeteer = req("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--allow-file-access-from-files", "--force-color-profile=srgb"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
  await page.goto("file:///" + path.join(__dirname, "profile.html").replace(/\\/g, "/"), { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true");
  const out = path.join(__dirname, "sha-studio-profile-1080.png");
  await page.screenshot({ path: out, type: "png" });
  console.log("->", out);
  // 인스타그램처럼 원형으로 잘린 모습 미리보기 (작은 크기 가독성 확인용)
  await page.addStyleTag({ content: "body{clip-path:circle(50% at 50% 50%);background:#1c1a1f} html{background:#fff}" });
  const prev = path.join(__dirname, "preview-circle.png");
  await page.screenshot({ path: prev, type: "png" });
  console.log("->", prev);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
