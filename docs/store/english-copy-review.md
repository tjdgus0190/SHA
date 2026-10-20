# 영문 카피 검토 메모

검토자: Claude (원어민 기준으로 직접 다듬음 — **사람 원어민 검수는 아님**).
대상: 영문 광고 영상 자막, 영문 랜딩페이지(`site/en/index.html`), Gumroad 영문 설명, 광고 문구.

## 원칙
- 미국식 철자/구두점, 짧은 문장, 과장 금지("never", "perfect", "AI" 같은 약속성 표현 배제)
- 미술 용어는 영어권 일러스트레이터가 쓰는 말로: 명도 = **value**(일반 설명) / **lightness (L\*)**(기술 설명)
- 없는 기능·약속 금지(Mac 지원 예정, 평생 업데이트 등)

## 영상 자막 수정
| 이전 | 수정 | 이유 |
|---|---|---|
| No more / paint-and-erase | No more / paint, erase, repeat | "paint-and-erase"는 어색한 조어 |
| Same value, / only matching hues | Same value, / only colors that fit | 채도도 바뀌므로 hue보다 color가 정확 |
| Check in grayscale: / same value | In grayscale, / still the same value | 콜론으로 끊긴 문장보다 자연스러움 |
| Your picks / collect here | Your picks, / saved right here | "collect here"는 명령문으로 읽힘 |

## 광고 문구 수정
- 이전: "...shows only colors with the same value — so your shading never drifts."
- 수정: "...shows only colors with the same value, so your values stay consistent."
- 이유: "never"는 보장성 표현.

## 사람 원어민이 꼭 봐 주면 좋은 곳
1. 랜딩 헤드라인 "Keep your hand on the canvas. Keep your values steady." — 리듬은 좋지만 "hand on the canvas"가 디지털 작업에 자연스러운지
2. "same-value palette" — 영어권에 없는 신조어. "value-locked palette"와 A/B 테스트 후보
3. FAQ "Is the app in English?" 답변 톤 — 솔직하지만 구매를 막을 수 있음(앱 영문화 전까지 유지 권장)
