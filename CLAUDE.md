# SHA Paint

Photoshop 오버레이 팔레트. Lab L*(명도)를 고정한 채 색상/채도만 조절한다. 사용자 응답은 **한국어**.

## 프로젝트 주 목표 (상용화)
1. **상용화** — 판매 가능한 제품으로 완성 (안정성, 라이선스, 서명, 랜딩/결제).
2. **검정 전환 버그 근절** — 위 "핵심 문제" 참고.
3. **판매 금액 책정** — `docs/pricing.md` (근거 있는 시장조사 + 손익 계산).
4. **광고 영상 제작** — `docs/ad-video/` (스크립트, 스토리보드, 에셋).

## 에이전트 (`.claude/agents/`)
- `planner` 기획자: 가격·로드맵·포지셔닝·법적 체크리스트
- `marketer` 마케터: 광고 영상 기획, 판매 카피, 채널 계획
- `designer` 디자이너: 브랜드, UI/UX, 비주얼 에셋
- `developer` 개발자: 버그 수정, 기능, 빌드
- 보조: `glitch-tester`, `bridge-reviewer`, `log-analyzer`, `win-builder`
협업 순서 예: planner(가격/범위) → designer(브랜드/에셋) → marketer(영상/카피) ← developer(검증된 기능만 광고에 사용).

## 구성
- `app/` — Electron 앱 (`main.js` 중심). 전역 후킹(uiohook-napi), 트레이, 팝업/상태 패널, WebSocket 서버(포트 **51837**).
- `app/com-bridge.js` — Windows 브릿지. PowerShell 스크립트(템플릿 리터럴 `PS_SCRIPT`)가 Photoshop COM을 100ms 폴링, TCP **51900**. 프로토콜: `COLOR r,g,b` / `PS_ALIVE` / `PS_GONE` / `SET_OK` / `SET_ERR` / `TEST`.
- `app/mac-bridge.js` — macOS 브릿지(osascript). **실제 Mac에서 검증된 적 없음.**
- `uxp-plugin/` — Photoshop UXP 패널 (`ws://localhost:51837` 클라이언트). `set` 이벤트 리스너로 전경색을 직접 받아 `trusted:true`로 전송.

## 핵심 문제: 와콤 펜 검정 글리치
와콤 펜(Wintab 추정)으로 누르거나 그리면 COM이 읽는 전경색이 순간적으로 검정이 되어 팝업/히스토리에 검정이 쌓인다. 마우스로는 재현 안 됨. 펜은 uiohook 마우스 이벤트를 만들지 않는다.
- 의도적으로 Photoshop에서 고른 검정(스포이드/스워치)은 **반드시 히스토리에 남아야** 한다. "검정 전부 무시" 금지.
- 팝업 필드에서 직접 고른 검정은 별개 경로(`popup-color-picked`)라 방어 로직과 무관.
- 방어 계층 (`main.js`, `applyIncomingColor`): ① SET 그레이스(우리 SET 후 4s 내 검정 무시) ② 왕복 감지(색X→검정→색X, 6s 슬라이딩 윈도우, 임계 2, 세션 학습 시 1, 확정 시 해당 왕복의 검정 후보를 히스토리에서 전부 제거) ③ UXP 연결 중이면 COM 폴링 결과 완전 무시, WS `trusted:true`는 방어 우회.

## 막다른 길 (재시도 금지)
- COM `CurrentTool`/`DoJavaScript`로 도구 이름 읽기 → 항상 `''`. 태그 계층은 죽은 코드.
- `ExecuteActionGet`으로 전경색 읽기 → 항상 "이 기능을 사용할 수 없습니다", 폴링당 ~400ms 낭비.
- 마우스 이벤트 기반 게이팅 → 펜은 이벤트가 없어 무효.
- UXP 패널 자동 실행/숨기기: 패널은 OS 창이 아니라(EnumWindows에 안 잡힘) 외부에서 열거나 숨길 수 없다. 키보드 단축키 편집기에서 플러그인 카테고리가 펼쳐지지 않음. **채택된 워크플로: 사용자가 수동으로 한 번 열고 도킹/접기.** 단축키 자동화, Win32 숨김 재시도 금지.
- "Photoshop 색 변경 자동 감지" 토글 → 켜고 끄면 정상 스포이드 갱신까지 막아서 제거함.
- `setAlwaysOnTop(false)`로 창 뒤로 보내기 불가 → `hide()`/`showInactive()`로 가시성 동기화.
- 사용자는 `.ccx`와 UXP Developer Tool을 쓸 수 없음 → 언팩된 플러그인 폴더를 플러그인 디렉터리에 덮어쓰기로 배포.

## 함정
- `PS_SCRIPT`는 JS 템플릿 리터럴. `${...}`는 JS 보간으로 평가된다(허용: `TCP_PORT`, `LOOP_INTERVAL_MS`). PowerShell 변수는 `$($var)`. 위반 시 앱 시작 시 `ReferenceError`.
- 단일 인스턴스 락(`requestSingleInstanceLock`)이 있음. 로그가 이상하면 중복 실행 의심.
- 로그: `%APPDATA%\luminance-overlay-app\sha-paint-log.txt`.

## 검증 (코드 수정 후 항상)
```
node scripts/verify.js              # 문법 / require / PS ${...} 스캔
node scripts/test-black-glitch.js   # main.js의 실제 applyIncomingColor 블록을 추출해 시나리오 테스트
```
UI(`overlay`, `status-panel`)는 jsdom으로 검증. 실제 펜/Photoshop 동작은 샌드박스에서 검증 불가 — **검증한 것과 못한 것을 구분해서 보고**.

## 빌드 (Windows 인스톨러)
- Windows PC: `cd app && npm install && npx electron-builder --win --x64` → `SHAPaintSetup-1.0.0.exe`
- Linux 크로스빌드: `npm install --os=win32 --cpu=x64 --include=optional`, `chmod +x node_modules/app-builder-bin/linux/x64/app-builder`, wine64+wine32 필요.
- 확인: uiohook win32-x64 / x-win win32-x64-msvc `.node` 프리빌드, `resources/tourbox-luminance-picker.ccx` 포함 여부.
- 빌드 후 변경점은 `app/README.md` 맨 위에 버전 항목 추가(최신이 위, 현재 v8.7).

## 미해결
- Esc로 팝업이 안 닫히는 문제(진단 로그/try-catch만 추가됨).
- UXP `set` 디스크립터 구조(`descriptor.to`) 실기 로그로 확인 필요.
- 패널을 닫은 채 Photoshop 재시작 시 연결 안 됨(위 워크플로 한계).
- 색 적용 실패 빈발(SET 재시도 20×150ms로 완화).
- 히스토리 영속화, 패널 위치 기억, 랜딩페이지(`sh-paint-landing.html`) 플레이스홀더, macOS 빌드/서명.
