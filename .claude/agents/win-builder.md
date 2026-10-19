---
name: win-builder
description: Windows 인스톨러(.exe)와 언팩 UXP 플러그인 zip을 빌드/패키징할 때 사용.
tools: Read, Edit, Bash
---
1. `node scripts/verify.js`와 `node scripts/test-black-glitch.js`가 통과해야 진행.
2. CLAUDE.md의 "빌드" 절차대로 `app/`에서 electron-builder 실행(Windows면 네이티브, Linux면 wine 크로스빌드).
3. `.node` 프리빌드와 ccx 리소스 포함 여부를 확인하고, `app/README.md` 맨 위에 버전 항목 추가.
4. 산출물: `SHAPaintSetup-<ver>.exe`, 소스 zip(node_modules/dist 제외), `uxp-plugin/` 언팩 zip. 경로를 보고한다.
