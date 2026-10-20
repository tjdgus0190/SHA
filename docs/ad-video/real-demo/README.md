# 실사용 예시 영상 (실제 화면 녹화)

실제 Photoshop 2024 + 설치된 SHA Paint를 이 PC에서 자동 조작하며 녹화한 영상.
연출(모션그래픽)이 아니라 진짜 앱 동작이다. 단, **펜이 아니라 마우스 입력**으로 촬영했다.

| 파일 | 내용 |
|---|---|
| `sha-paint-real-demo-9x16.mp4` | 1080×1920, 36초 — 릴스/쇼츠/틱톡 |
| `sha-paint-real-demo-16x9.mp4` | 1920×1080, 36초 — 유튜브/상품 페이지 |
| `raw-take2.mkv` | 편집 전 원본(56초, 1920×1080) |
| `raw-take2-marks.txt` | 원본의 장면 시각 |
| `edit.js` | 원본 → 두 버전 편집(구간 배속, 자막, 엔드카드) |
| `automation/` | 촬영 자동화 스크립트(PowerShell + Photoshop COM) |

## 장면
1. 중클릭 → 커서 옆에 팝업 → 핑크로 위 꽃잎
2. 같은 밝기에서 색만 돌려 라벤더, 피치
3. 히스토리 스와치로 핑크/라벤더 재사용
4. 중심(노랑), 잎·줄기(초록)
5. Lab 명도(L) 채널만 보기 → 꽃잎 5장이 전부 같은 회색 (같은 L*72의 증거)

## 다시 편집
```
set FFMPEG=<ffmpeg.exe 경로>
node docs/ad-video/real-demo/edit.js
```
자막 문구/구간/배속은 `edit.js` 상단의 `SEG`, `CAPTIONS`.

## 다시 촬영 (주의: 촬영 중 PC 조작 금지)
- Photoshop 메인 창이 **보조 모니터(왼쪽, 1920×1080)에 최대화**된 배치를 가정한다(`input.ps1`의 `$MonX`, `demo.ps1`의 캔버스 좌표).
- `automation/setup-doc.jsx`로 데모 문서 생성 → 전경색을 rgb(245,148,178)로 → `automation/demo.ps1` 실행.
- 녹화는 ffmpeg `ddagrab`(output_idx=1). `gdigrab`은 SHA Paint 오버레이 창을 찍지 못한다.

## 배경음악
영상에 음원은 넣지 않았다. 인스타그램/틱톡 업로드 시 앱의 라이선스된 음원 라이브러리에서 고르는 것을 권장.
