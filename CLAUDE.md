# SHA Paint

Photoshop 오버레이 팔레트. Lab L*(명도)를 고정한 채 색상/채도만 조절한다. 사용자 응답은 **한국어**.
브랜드: **SHA Studio**(제작사) / 제품명 **SHA Paint**. 저장소: https://github.com/tjdgus0190/SHA (비공개, 여러 PC에서 작업 — 작업 전 `git pull`, 후 commit/push).

## 현재 상황 (2026-10-20 기준)
- **판매 중**: Gumroad `https://tjdgus76.gumroad.com/l/vutuls` ($10, 1회 결제). 결제 바로가기 링크는 끝에 `?wanted=true`.
  - 라이선스 키: Gumroad License API. 상품 ID `Z-z4Harnz0sMKG_7200QXw==` (`app/licensing.js`와 `app/build/installer.nsh` 두 곳 — `verify.js`가 일치 검사). 실제 구매 키로 활성화 성공 확인됨(2026-10-19).
  - 좌석(seat) 옵션 켜짐 → 활성화 PC 수 = 좌석 수 × 3.
- **배포 파일**: `app/dist/SHAPaintSetup-1.0.0.exe` (저장소에 없음, 빌드로 생성). Gumroad에 업로드된 것이 출시본.
- **랜딩페이지**: Netlify가 GitHub 저장소에 연결됨 → `main`에 push하면 자동 배포(`netlify.toml`이 `site/`를 배포 폴더로 지정). `site/index.html`(한국어), `site/en/index.html`(영문, `node scripts/build-en-landing.js`로 한국어 페이지 스타일을 가져와 생성). 구매 버튼은 전부 Gumroad 결제 링크. 메시지 중심은 **명도 고정·입체감 유지**(히어로/비교 데모는 colorMath 계산값으로 칠한 구 + 흑백 구 CSS 애니메이션), 펜 옆 팝업은 보조 기능으로 소개. 데모 영상 섹션은 `site/media/sha-paint-portrait-{ko,en}.mp4`(`docs/ad-video/portrait/` 16:9 웹 압축본) + 장면 버튼.
- **광고/마케팅 에셋** (`docs/`):
  - `docs/ad-video/` 15초 모션그래픽(9:16·16:9, 한/영) — 인스타그램 광고로 집행 중(9:16 한국어)
  - `docs/ad-video/v2/` 인스타 피드용 15초 4:5(밝은 톤, 한/영)
  - `docs/ad-video/v3/` 인스타 릴스용 15초 9:16(한/영) — **메인 기능(명도 고정·동명도 어울리는 색·입체감 유지) 중심**. 렌더 `node docs/ad-video/v3/render-v3.js [--lang en]`
  - `docs/ad-video/portrait/` 인물화 15초(9:16·16:9, 한/영) — 한 톤 그림에 **같은 명도로 색을 더해 이질감 없이 다채롭게**(보통 피커는 얼룩처럼 뜸). 그림은 사용자 제공. `python lab.py` → `node render-portrait.js`
  - `docs/ad-video/real-demo/` 실제 Photoshop+SHA Paint 화면 녹화 편집본(36초, 마우스 자동조작으로 촬영)
  - `docs/store/` Gumroad 표지/썸네일(한/영), 상품 설명(`gumroad-description.md`, 영+한), 영문 카피 검토 메모
  - `docs/brand/instagram/` 인스타 프로필 사진, `docs/pricing.md`, `docs/sales-channels.md`
- **앱 버전**: `app/README.md` 맨 위(최신 v8.9). UXP 플러그인 1.1.0(ID `com.shastudio.shapaint`).
- **사용자 결정 사항**: 코드 서명 안 함(SmartScreen 경고는 FAQ로 안내). 랜딩/광고에 약속성 문구 금지(평생 업데이트, Mac 예정, 무조건 환불 등). Mac 버전은 보류.

## 다음 할 일 후보
- 실제 와콤 펜으로 검정 전환 수정 검증(사용자 PC에 와콤 없음 → 베타 테스터 로그 `[uxp]`, `[license]` 줄로 분석)
- 앱 UI 영문화(설치 화면·메뉴·설정이 한국어 — 해외 판매 걸림돌, 영문 FAQ에 고지 중)
- 인스타 광고 성과(CTR) 보고 15초 광고 개선 / 할인 코드(INSTA 전용) 검토
- Esc로 팝업 안 닫힘(× 버튼으로 우회), 패널 위치 기억

## 에이전트 (`.claude/agents/`)
- `planner` 기획자: 가격·로드맵·포지셔닝·법적 체크리스트
- `marketer` 마케터: 광고 영상 기획, 판매 카피, 채널 계획
- `designer` 디자이너: 브랜드, UI/UX, 비주얼 에셋
- `developer` 개발자: 버그 수정, 기능, 빌드
- 보조: `glitch-tester`, `bridge-reviewer`, `log-analyzer`, `win-builder`

## 구성
- `app/` — Electron 앱 (`main.js` 중심). 전역 후킹(uiohook-napi), 트레이, 팝업/상태 패널, WebSocket 서버(포트 **51837**), 라이선스(`licensing.js`, `license.html`).
- `app/com-bridge.js` — Windows 브릿지. PowerShell 스크립트(템플릿 리터럴 `PS_SCRIPT`)가 Photoshop COM을 100ms 폴링, TCP **51900**. 프로토콜: `COLOR r,g,b` / `PS_ALIVE` / `PS_GONE` / `SET_OK` / `SET_ERR` / `TEST` / `POLL ON|OFF`→`POLL_OK`.
- `app/mac-bridge.js` — macOS 브릿지(osascript). **실제 Mac에서 검증된 적 없음.**
- `uxp-plugin/` — Photoshop UXP 패널 (`ws://localhost:51837` 클라이언트). 연결 시 `hello{protocol:2}`, `setColor{id}`에 `setResult` ack. `set`/`reset`/`exchange` 이벤트에서 전경색을 직접 받아 `trusted:true`로 전송.
- `app/build/installer.nsh` — NSIS 라이선스 키 입력 페이지(설치 중 PowerShell로 Gumroad 확인). **UTF-8 BOM 1개**로 저장, MUI 매크로 사용 불가, `!ifndef BUILD_UNINSTALLER`로 감쌈.

## 핵심 문제: 와콤 펜 검정 글리치
와콤 펜으로 그리면 읽히는 전경색이 순간적으로 검정이 되어 팝업/히스토리에 검정이 쌓였다. 마우스로는 재현 안 됨. 펜은 uiohook 마우스 이벤트를 만들지 않는다.
- 찾은 근본 원인(v8.8): ① COM 속성이 바쁠 때 `$null` → `[int]$null=0` → `COLOR 0,0,0` ② UXP가 디스크립터 초록 키 `grain`을 몰라 직접 추출 실패 → 재조회 경로로 빠짐 + 500ms 폴링이 무검증 전송.
- 의도적으로 고른 검정(스포이드/스워치/D키)은 **반드시 히스토리에 남아야** 한다. "검정 전부 무시" 금지.
- 방어 계층: PS `Read-ForegroundColor`(null/HexValue 검증, 검정은 5회 연속 안정) → `main.js` 0차 검정 보류 700ms → SET 그레이스 4s → 왕복 감지(첫 왕복부터 히스토리 제거) → UXP 연결 중 COM 폴링 정지, `trusted:true`는 방어 우회.
- **실제 펜 실기 검증은 아직 안 됨.**

## 막다른 길 (재시도 금지)
- COM `CurrentTool`/`DoJavaScript`로 도구 이름 읽기 → 항상 `''`.
- `ExecuteActionGet`으로 전경색 읽기 → 항상 "이 기능을 사용할 수 없습니다".
- 마우스 이벤트 기반 게이팅 → 펜은 이벤트가 없어 무효.
- UXP 패널 자동 실행/숨기기 불가. **채택된 워크플로: 사용자가 수동으로 한 번 열고 도킹/접기.**
- "Photoshop 색 변경 자동 감지" 토글 → 제거함.
- `setAlwaysOnTop(false)`로 창 뒤로 보내기 불가 → `hide()`/`showInactive()`.
- 사용자는 UXP Developer Tool을 안 씀 → 언팩된 플러그인 폴더를 덮어쓰기로 배포(번들 `.ccx`는 인스톨러가 엶).

## 함정
- `PS_SCRIPT`는 JS 템플릿 리터럴. `${...}`는 JS 보간(허용: `TCP_PORT`, `LOOP_INTERVAL_MS`). PowerShell 변수는 `$($var)`. 백틱 금지.
- Photoshop 디스크립터 RGB 초록 키는 `grain`. 펜 사용 중 전경색 **재조회는 신뢰 불가**.
- 단일 인스턴스 락 있음. 로그가 이상하면 중복 실행 의심.
- 로그: `%APPDATA%\luminance-overlay-app\sha-paint-log.txt` (5MB 회전). 히스토리/라이선스도 같은 폴더(`sha-paint-history.json`, `license-key.txt`, `license.json`). 패키지 name(`luminance-overlay-app`)을 바꾸면 이 경로가 바뀌니 바꾸지 말 것.
- 이 PC 셸: Bash heredoc 안의 `python -`는 Windows py 런처가 오인함 → 스크립트를 파일로 쓰고 실행.

## 검증 (코드 수정 후 항상)
```
node scripts/verify.js              # 문법 / require / PS ${...} / 패키징 누락 / 상품 ID 일치
node scripts/test-black-glitch.js   # main.js 실제 방어 블록 시나리오
node scripts/test-uxp-plugin.js     # 모의 Photoshop으로 플러그인 이벤트→WS
node scripts/test-com-bridge-ps.js  # (Windows) 실제 PowerShell로 PS_SCRIPT + 모의 COM
node scripts/test-licensing.js      # 가짜 Gumroad로 라이선스 시나리오
python scripts/pack-plugin.py       # uxp-plugin 수정 후 번들 .ccx 재패키징
```
실제 펜/Photoshop 동작은 자동 검증 불가 — **검증한 것과 못한 것을 구분해서 보고**.

## 빌드 (Windows 인스톨러)
- `cd app && npm install && npx electron-builder --win --x64` → `app/dist/SHAPaintSetup-1.0.0.exe`
- 이 PC 첫 빌드 때 winCodeSign 캐시 압축 해제가 심볼릭 링크 권한으로 실패함 → `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`에 7za로 `-xr!darwin` 제외 후 직접 풀면 해결.
- 빌드 후 변경점은 `app/README.md` 맨 위에 버전 항목 추가.

## 영상/이미지 렌더링 (새 PC 셋업)
렌더 도구는 저장소에 없다. 프로젝트 밖 아무 폴더에 설치하고 경로를 환경변수로 준다:
```
mkdir C:\sha-render && cd C:\sha-render && npm init -y && npm i puppeteer-core ffmpeg-static
set AD_RENDER_DEPS=C:\sha-render        (PowerShell: $env:AD_RENDER_DEPS="C:\sha-render")
node docs/ad-video/render/render.js [--lang en] [--ar 16x9]     # 15초 광고
node docs/ad-video/v2/render-v2.js [--lang en]                   # v2 4:5 광고
node docs/store/render-store-images.js                           # Gumroad 표지/썸네일
node docs/brand/instagram/render-profile.js                      # 인스타 프로필
set FFMPEG=C:\sha-render\node_modules\ffmpeg-static\ffmpeg.exe && node docs/ad-video/real-demo/edit.js
```
Chrome(`C:\Program Files\Google\Chrome\Application\chrome.exe`), 폰트 Noto Sans KR / Noto Serif / 맑은 고딕 필요.
