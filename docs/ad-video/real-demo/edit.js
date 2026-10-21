#!/usr/bin/env node
// 실제 Photoshop + SHA Paint 화면 녹화(raw-take2.mkv)를 광고용으로 편집한다.
//   sha-paint-real-demo-16x9.mp4 (1920x1080)
//   sha-paint-real-demo-9x16.mp4 (1080x1920)
// 색 고르는 장면은 거의 실제 속도, 칠하는 장면은 빠르게. 한국어 자막 + 엔드카드.
//   set FFMPEG=<ffmpeg.exe 경로>   (없으면 PATH의 ffmpeg)
//   node docs/ad-video/real-demo/edit.js
//   node docs/ad-video/real-demo/edit.js --web   (랜딩페이지용 자막 없는 본편 → site/media/)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const FF = process.env.FFMPEG || "ffmpeg";
const DIR = __dirname;
const RAW = path.join(DIR, "raw-take2.mkv");
const FONT = "C\\:/Windows/Fonts/malgunbd.ttf";
const BG = "0x1c1a1f";
const GOLD = "0xe8a33d";

// [시작, 끝, 배속, 자막그룹] — 원본 시각은 raw-take2-marks.txt 기준
const SEG = [
  [0.6, 1.5, 1, 0],
  [1.5, 6.5, 1, 0],      // 중클릭 → 펜 옆 팝업 → 핑크
  [6.5, 8.25, 2.2, 0],   // 칠하기
  [8.25, 13.2, 1.25, 1], // 같은 밝기에서 라벤더로
  [13.2, 14.8, 2.2, 1],
  [14.8, 19.75, 1.4, 2], // 피치
  [19.75, 21.35, 2.2, 2],
  [21.35, 25.25, 1.5, 3], // 히스토리에서 핑크
  [25.25, 26.9, 2.2, 3],
  [26.9, 30.75, 2, 3],    // 히스토리에서 라벤더
  [30.75, 32.35, 2.2, 3],
  [32.35, 37.3, 2.2, 4],  // 중심 노랑
  [37.3, 38.5, 2.2, 4],
  [38.5, 43.45, 2.2, 4],  // 잎 초록
  [43.45, 49.5, 3, 4],
  [49.5, 54.3, 1, 5]      // L 채널: 전부 같은 회색
];
const CAPTIONS = [
  "펜 옆에서 바로 팔레트",
  "밝기는 그대로, 색만 바꾸기",
  "같은 명도의 어울리는 색만",
  "고른 색은 모아두고 다시 쓰기",
  "칠했다 지웠다 없이 바로 채색",
  "흑백으로 봐도 밝기가 똑같아요"
];
const END_SEC = 2.6;

// 출력 타임라인에서 자막 그룹별 구간 계산
let t = 0;
const groupRange = {};
for (const [a, b, sp, g] of SEG) {
  const dur = (b - a) / sp;
  if (!groupRange[g]) groupRange[g] = [t, t];
  groupRange[g][1] = t + dur;
  t += dur;
}
const MAIN_DUR = t;

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");

function build(kind) {
  const W = kind === "16x9" ? 1920 : 1080, H = kind === "16x9" ? 1080 : 1920;
  const lines = [];
  // 1) 구간 자르기 + 배속
  SEG.forEach(([a, b, sp], i) => {
    lines.push(`[0:v]trim=start=${a}:end=${b},setpts=(PTS-STARTPTS)/${sp},fps=30[s${i}];`);
  });
  lines.push(SEG.map((_, i) => `[s${i}]`).join("") + `concat=n=${SEG.length}:v=1:a=0[cat];`);

  const capY = kind === "16x9" ? "128" : "330";
  const capSize = kind === "16x9" ? 58 : 66;
  if (kind === "16x9") {
    // Photoshop 도구바/탭/캔버스/팝업이 다 보이도록 상단 메뉴줄만 덜어낸 16:9 영역
    lines.push(`[cat]crop=1600:900:0:60,scale=${W}:${H}:flags=lanczos,setsar=1[base];`);
  } else {
    // 꽃 + 팝업이 움직이는 범위만 꽉 차게 (캔버스 안쪽 흰 영역)
    lines.push(`[cat]crop=840:790:500:170,scale=1080:-2:flags=lanczos,setsar=1[vid];`);
    lines.push(`color=c=${BG}:s=${W}x${H}:r=30:d=${MAIN_DUR.toFixed(3)}[bg];`);
    lines.push(`[bg][vid]overlay=x=0:y=(H-h)/2+40:shortest=1[base0];`);
    lines.push(`[base0]drawtext=fontfile='${FONT}':text='SHA Paint':fontsize=60:fontcolor=0xf2ede4:x=(w-tw)/2:y=150,` +
      `drawtext=fontfile='${FONT}':text='${esc("펜 옆의 동명도 팔레트 · Photoshop")}':fontsize=46:fontcolor=${GOLD}:x=(w-tw)/2:y=1660[base];`);
  }
  // 2) 자막 + "실제 화면 녹화" 배지
  let cur = "base";
  CAPTIONS.forEach((txt, g) => {
    const [a, b] = groupRange[g];
    const nxt = `c${g}`;
    lines.push(`[${cur}]drawtext=fontfile='${FONT}':text='${esc(txt)}':fontsize=${capSize}:fontcolor=white:` +
      `box=1:boxcolor=black@0.62:boxborderw=26:x=(w-tw)/2:y=${capY}:enable='between(t,${a.toFixed(2)},${(b - 0.05).toFixed(2)})'[${nxt}];`);
    cur = nxt;
  });
  const badgeX = kind === "16x9" ? "40" : "(w-tw)/2";
  const badgeY = kind === "16x9" ? "36" : "240";
  lines.push(`[${cur}]drawtext=fontfile='${FONT}':text='${esc("● 실제 화면 녹화")}':fontsize=${kind === "16x9" ? 30 : 30}:fontcolor=0xf2ede4:` +
    `box=1:boxcolor=0xe8a33d@0.0:boxborderw=0:x=${badgeX}:y=${badgeY}[main];`);

  // 3) 엔드카드
  const big = kind === "16x9" ? 120 : 130, mid = kind === "16x9" ? 52 : 56, sm = kind === "16x9" ? 34 : 38;
  lines.push(`color=c=${BG}:s=${W}x${H}:r=30:d=${END_SEC}[e0];`);
  lines.push(`[e0]drawtext=fontfile='${FONT}':text='SHA Paint':fontsize=${big}:fontcolor=0xf2ede4:x=(w-tw)/2:y=(h/2)-${big + 30},` +
    `drawtext=fontfile='${FONT}':text='${esc("펜 옆의 동명도 팔레트")}':fontsize=${mid}:fontcolor=${GOLD}:x=(w-tw)/2:y=(h/2)+10,` +
    `drawtext=fontfile='${FONT}':text='${esc("Photoshop · Windows 10/11")}':fontsize=${sm}:fontcolor=0xa79f97:x=(w-tw)/2:y=(h/2)+${mid + 40},` +
    `fade=t=in:st=0:d=0.35[end];`);
  lines.push(`[main][end]concat=n=2:v=1:a=0,format=yuv420p[out]`);
  return lines.join("\n");
}

// --web: 랜딩페이지용. 자막·배지·엔드카드 없이 본편만 1280x720으로 → site/media/
// (자막은 페이지가 언어별로 HTML로 겹친다. 구간 시각은 아래 출력값을 site/index.html의 DEMO_CHAPTERS에 반영)
if (process.argv.includes("--web")) {
  const outDir = path.join(DIR, "..", "..", "..", "site", "media");
  fs.mkdirSync(outDir, { recursive: true });
  const lines = SEG.map(([a, b, sp], i) => `[0:v]trim=start=${a}:end=${b},setpts=(PTS-STARTPTS)/${sp},fps=30[s${i}];`);
  lines.push(SEG.map((_, i) => `[s${i}]`).join("") + `concat=n=${SEG.length}:v=1:a=0[cat];`);
  lines.push(`[cat]crop=1600:900:0:60,scale=1280:720:flags=lanczos,setsar=1,format=yuv420p[out]`);
  const scriptPath = path.join(DIR, "filter-web.txt");
  fs.writeFileSync(scriptPath, lines.join("\n"), "utf8");
  const out = path.join(outDir, "sha-paint-demo.mp4");
  let r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", RAW,
    "-filter_complex_script", scriptPath, "-map", "[out]", "-an",
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-r", "30", out], { stdio: "inherit" });
  if (r.status !== 0) { console.error("ffmpeg 실패: web"); process.exit(1); }
  // 포스터: 마지막 흑백 장면 직전(꽃이 다 칠해진 컷)
  r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (groupRange[5][0] - 0.4).toFixed(2), "-i", out,
    "-frames:v", "1", "-q:v", "4", path.join(outDir, "sha-paint-demo-poster.jpg")], { stdio: "inherit" });
  fs.unlinkSync(scriptPath);
  console.log("->", out);
  console.log("구간(초):", JSON.stringify(Object.values(groupRange).map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)])));
  process.exit(0);
}

for (const kind of ["16x9", "9x16"]) {
  const scriptPath = path.join(DIR, `filter-${kind}.txt`);
  fs.writeFileSync(scriptPath, build(kind), "utf8");
  const out = path.join(DIR, `sha-paint-real-demo-${kind}.mp4`);
  const r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", RAW,
    "-filter_complex_script", scriptPath, "-map", "[out]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-r", "30", out], { stdio: "inherit" });
  if (r.status !== 0) { console.error("ffmpeg 실패:", kind); process.exit(1); }
  console.log("->", out);
}
console.log(`본편 ${MAIN_DUR.toFixed(2)}s + 엔드카드 ${END_SEC}s`);
