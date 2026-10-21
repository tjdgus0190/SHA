# 인물화 "같은 명도로 화려하게" 영상 (15초)

갈색 한 톤으로 칠한 얼굴(`source/portrait-blue.jpg`, 사용자 제공)에 펜으로 화려한 색을 더하는 연출 영상.
메시지: **아무리 화려해도 같은 명도라 자연스럽다** — 흑백으로 보면 원본과 똑같다.
- 각 픽셀의 L\*(명도)는 그대로, a\*b\*(색)만 목표 색조로 — 보라 그림자 → 마젠타 혈색 → 금빛 하이라이트 → 코발트 반사광 → 핫핑크 머리카락(5획 누적)
- 펜이 SHA Paint 팝업에서 색을 찍고(그 자리 L\* 필드) 얼굴로 가서 칠한다. 펜이 지나간 자리만 색이 드러난다.
- "보통 피커면 얼룩처럼 뜬다"는 자막 한 줄로만 언급(사용자 요청). `lab.py`는 비교 수치용으로 보통 피커 버전도 계속 만든다.
- 실제 앱 녹화가 아니다. 앱은 이 원리로 같은 명도의 색을 골라 주는 팔레트이고 그림에 자동으로 칠하는 기능은 없다(영상·사이트에 표기).

| 파일 | 내용 |
|---|---|
| `sha-paint-portrait-15s-9x16.mp4` / `-en` | 1080×1920 릴스/스토리용, CTA "프로필 링크에서 구매" |
| `sha-paint-portrait-15s-16x9.mp4` / `-en` | 1920×1080 사이트용(CTA 없음). 웹 압축본은 `site/media/sha-paint-portrait-{ko,en}.mp4` |
| `lab.py` | `frames-src/` 생성(원본/흑백/동명도 4단계/보통 피커/명도 차이 표시). 색 상수는 `app/colorMath.js`와 동일. 인물 마스크는 흰 배경판 `source/portrait-white.jpg`에서 |
| `ad-portrait.html` | 영상 원본(캔버스). `?ar=16x9`, `?lang=en`. 펜 획 경로는 `STROKES[].path`(원본 800px 좌표) |
| `render-portrait.js` | 프레임 캡처 → MP4 (`../v3/render-v3.js`와 같은 방식) |

## 구성
| 구간 | 화면 | 자막 |
|---|---|---|
| 0–2.0s | 원본(한 톤) + 흑백 미리보기 | 한 톤으로 칠한 얼굴에 / 색을 더해볼게요 |
| 2.0–8.4s | 팝업 → 펜으로 5획(획마다 색 찍기 → 칠하기), 흑백 미리보기는 그대로 | 그 자리 명도는 그대로, / 색만 화려하게 → 같은 명도라서 / 화려해도 자연스럽게 |
| 8.5–10.0s | 원본 ↔ 완성 슬라이드 비교 | 원본과 비교하면 / 완전히 다른 그림 |
| 10.1–12.2s | 완성본을 흑백으로 넘김 = 원본 흑백과 같음 | 흑백으로 보면 / 원본과 똑같습니다 |
| 12.2–15s | 엔드카드(원본 / 색 추가 비교) | — |

수치(`frames-src/info.json`, 인물 영역 평균 \|ΔL\*\|): 동명도 5획 ≈ 0.07(반올림 오차), 같은 자리를 보통 피커 색으로 칠하면 ≈ 14.

## 다시 만들기
```
python docs/ad-video/portrait/lab.py                     # frames-src/ (약 1분)
node docs/ad-video/portrait/render-portrait.js [--lang en] [--ar 16x9] [--stills 1,4,7,9,11,14]
# 사이트용 압축본
ffmpeg -i sha-paint-portrait-15s-16x9.mp4 -vf scale=1280:-2 -an -c:v libx264 -crf 25 -preset slow -movflags +faststart site/media/sha-paint-portrait-ko.mp4
```
렌더 의존성은 `../README.md`(AD_RENDER_DEPS)와 같다.
