# SHA Paint 가격 책정

- 작성: planner 에이전트 / 기준일 2026-10-19
- 상태: **초안(결정 제안)**. 법률·세무 자문이 아니며, 세금·약관 항목은 세무사·법률 전문가 확인이 필요하다.
- 표기 규칙: **[확인]** = 출처 URL로 확인한 수치, **[가정]** = 근거 없는 추정치, **[미확인]** = 조사했으나 확인 못 함.
- 판매처 상세 비교는 `docs/sales-channels.md` 참고.

---

## 0. 요약

### 결정 사항(제안)
| 항목 | 제안 | 한 줄 근거 |
|---|---|---|
| 가격 모델 | **영구 라이선스(1회 결제)** + 1.x 버전 무료 업데이트, 메이저 버전(2.0)은 유료 업그레이드 가능성 유보 | 직접 경쟁 제품(Coolorus, MagicPicker, Filthy)이 모두 1회 결제. 구독은 Adobe 구독 피로가 있는 타깃에 역효과 |
| 정가 | **US$14.99** (약 22,500원, [가정] 1달러=1,500원) | Coolorus $16.99, MagicPicker $19(할인가), Filthy $12 사이. Windows 전용·미서명·신생이므로 상위 경쟁작보다 낮게 |
| 런칭가 | **US$9.99** (33% 할인, 출시 후 2주 또는 선착순 300개 중 먼저 도달) | 랜딩 초안의 $10과 일치. 할인가로만 쓰고 정가로 고정하지 않는다 |
| 환불 | **구매 후 30일 무조건 환불** | 체험판이 없으므로(코드에 라이선스·체험 기능 없음) 환불 보장이 체험판 역할. Coolorus 60일, Proko 30일 |
| 라이선스 범위 | 1인 사용자, PC 2대 동시 활성화 | Lazy Nezumi는 1인 3대. 데스크톱+노트북 사용 패턴 대응 |
| 손익분기 | 연 고정비 약 $470 [가정] 기준 **정가로 약 43개**, 런칭가로만 팔 경우 약 67개 (환불 8% [가정] 반영) | 아래 5장 |

### 랜딩 초안(`site/index.html`)과의 차이 — 수정 필요
1. `$10 / 약 14,000원` → 환율 [가정] 1,500원이면 약 15,000원. 런칭가로 표시하고 정가 $14.99를 함께 표기 권장.
2. "앞으로 나올 업데이트 무료" → 영구 약속이 된다. **"1.x 버전 업데이트 무료"**로 범위를 한정 권장.
3. "Mac 버전 … 구매하신 라이선스로 그대로 쓰실 수 있게 할 계획" → `app/mac-bridge.js`는 **실제 Mac에서 검증된 적 없음**(CLAUDE.md). 약속이 아닌 "검토 중"으로 완화 권장.
4. FAQ "패널을 열지 않아도 작동합니다" → 검정 글리치 방어의 핵심(③ UXP 연결 시 COM 폴링 무시)은 UXP 패널이 연결되어 있어야 동작한다. 패널 없이 COM만 쓰면 와콤 펜 검정 글리치 노출 가능성이 남는다. developer 확인 후 문구 수정 필요.
5. "정상적으로 작동하지 않는 경우 환불" → 조건부 문구는 분쟁 소지. 30일 무조건 환불로 단순화 권장.
6. Gumroad URL, 문의 이메일(`hello@shapaint.example`)이 플레이스홀더.

### 열린 질문
- 검정 글리치가 실사용(와콤)에서 "출시 가능한 수준"인지 누가, 어떤 기준으로 판정하나? (가격보다 환불률에 직접 영향)
- 라이선스 키를 출시 v1에 넣을지, 무키(honor system)로 시작할지. (5장 시나리오는 키 유무와 무관하게 계산)
- 코드서명 없이 출시할지(SmartScreen 경고 감수), 인증서 확보 후 출시할지.
- 원화 결제를 따로 열지(국내 PG), Gumroad USD 결제만 할지.

---

## 1. 제품 현황 확인 (코드·문서 기준)

광고/가격 근거로 쓸 수 있는 것과 아닌 것을 구분한다.

| 항목 | 현재 상태 | 근거 |
|---|---|---|
| 동명도(Lab L* 고정) 팝업 팔레트 | 있음 (Windows) | CLAUDE.md, `app/README.md` |
| 트리거 | 그리는 중 Ctrl 홀드 → 커서 위치 팝업 | `app/README.md` 1~6행 |
| Photoshop 전경색 즉시 적용 | 있음. 단 "색 적용 실패 빈발"이 미해결 목록에 있음(재시도로 완화) | CLAUDE.md 미해결 |
| 최근 색 히스토리 | 있음. **영속화 안 됨**(재시작 시 소실) | CLAUDE.md 미해결 |
| macOS | 브릿지 코드만 존재, **미검증**. `package.json`에 mac 타깃 있으나 서명 없음(`hardenedRuntime: false`) | CLAUDE.md, `app/package.json` |
| 라이선스 키 / 체험판 | **없음** (`app/` 전체에 license 관련 코드 없음) | Grep 결과 |
| 코드서명 | **없음** (랜딩 FAQ가 SmartScreen 경고를 안내 중) | `site/index.html` 710행 |
| 외부 네트워크 통신 / 텔레메트리 | **없음**. 로컬 TCP 51900, 로컬 WS 51837만 사용. 로그는 `%APPDATA%\luminance-overlay-app\sha-paint-log.txt` 로컬 저장만 | `app/main.js` 53행, `app/com-bridge.js` 256행 |
| UXP 패널 | 사용자가 수동으로 1회 열어 도킹해야 함(자동화 불가 확정) | CLAUDE.md 막다른 길 |
| 식별자 | 동봉 파일 `tourbox-luminance-picker.ccx`, UXP ID `com.yourcompany.luminancepicker`, appId `com.yourcompany.luminanceoverlay`, author 플레이스홀더 | `app/package.json`, `uxp-plugin/manifest.json` |

→ 가격에 반영할 약점: Windows 전용, 미서명, 히스토리 비영속, 패널 수동 설정 필요, 와콤 검정 글리치 이력. 이 때문에 경쟁 상위 제품보다 낮은 정가를 제안한다.

---

## 2. 시장조사: 경쟁·유사 제품 가격

| 제품 | 형태 | 가격 | 플랫폼 | 라이선스/정책 | 상태 | 출처 |
|---|---|---|---|---|---|---|
| **Coolorus 2.5** | Photoshop 컬러 휠 패널 | **$16.99**, 기존 사용자 업그레이드 **$9.99** | Win + Mac | 1회 결제, **60일 환불 보장** | [확인] | https://coolorus.com |
| **MagicPicker 10** (Anastasiy) | Photoshop/Illustrator 컬러 휠. "Tone Lock"(명도 근사 고정) 기능 보유 | **$19** ("limited time discount" 표기, 정가 미표기) | Win + Mac(Apple Silicon 네이티브) | "One-time license", 15일 데모 | [확인] | https://anastasiy.com/colorwheel , Tone Lock: https://blog.anastasiy.com/?p=537 |
| MagicPicker 시즌 할인 | 블랙프라이데이 | 35%~최대 60% 할인 이력 | - | - | [확인] (할인율만) | https://blog.anastasiy.com/?cat=40 |
| **Filthy(Fillthy) PS Plug-in** | Photoshop 플러그인: 자동 채우기, 휴 시프트, **Luminosity Lock** | **$12** | Photoshop 2023+ (OS 미표기) | Proko 30일 환불 | [확인] | https://www.proko.com/tool/filthy-photoshop-plugin , https://makenowthinker.gumroad.com/l/wlfko |
| Lazy Nezumi Pro | 펜 보정(스태빌라이저) 도구, Windows 전용, 1인 개발 | **가격 [미확인]** (공식 페이지에서 금액 미노출) | Windows | 1회 결제, 1년 무료 업데이트 후 할인 갱신, 1인 3대, 15일 체험 | [확인] (조건만) | https://lazynezumi.com/buy , https://lazynezumi.com |
| Mixer Bars UXP | Adobe Exchange 색 혼합 패널 | $7.00 (2021년 업데이트 기준 페이지) | - | - | [확인, 오래됨] | https://exchange.adobe.com/creativecloud/plugindetails.html/app/cc/756f3079 |
| Photoshop color wheel (christiandulson) | Gumroad 무료 컬러 휠 | $0+ | - | - | [확인, 검색 요약] | https://christiandulson.gumroad.com/l/photoshop-color-wheel |
| Photoshop 내장 HUD 컬러 피커 / 컬러 휠 | 기본 기능 | 무료(Photoshop 포함) | - | - | [확인] | https://community.adobe.com/t5/photoshop-ecosystem-discussions/how-to-add-color-picker-wheel-in-adobe-photoshop-illustrator-cc-2015/td-p/7762183 |
| Gumroad Photoshop 브러시 | 브러시 세트 | 대략 무료~$11 | - | - | [확인, 제3자 집계] | https://marketsy.ai/tools/gumroad-trends/category/brushes%20photoshop |
| Gumroad Photoshop 작업 패널(비색상) | Pro Panel / Transform Panel | $49 / $29 | - | - | [검색 요약, 개별 페이지 미확인] | https://tpanel.gumroad.com/l/ultimate |
| Clip Studio Paint PRO/EX | 드로잉 앱 본체(참고용) | 공식 페이지 가격 로드 실패. 제3자 집계 PRO $49.99 / EX $219 | Win/Mac/모바일 | 영구 + 업데이트 패스 | [미확인] | https://www.clipstudio.net/en/purchase/ , https://subger.com/en/service/clip-studio |
| 크몽 디지털 자료 | 국내 마켓 | 브러시/툴 개별 가격대 조사 실패. 전자책 1만원대 사례만 | - | - | [미확인] | https://brunch.co.kr/@mingzi93/155 |

### 해석
- **직접 경쟁 구간은 $12~$19**(Filthy $12, Coolorus $16.99, MagicPicker $19). 모두 1회 결제.
- 동명도(명도 고정) 개념 자체는 **이미 존재**한다(MagicPicker Tone Lock, Filthy Luminosity Lock). 따라서 "세계 최초 명도 고정"류 카피는 쓰면 안 된다.
- SHA Paint의 실질 차별점은 **펜 옆에 뜨는 오버레이 팝업**(패널로 시선 이동 없음) + **Lab L* 정확 고정** + **같은 명도 후보 색 제시/히스토리**의 조합이다. 단, 위 경쟁 제품의 팝업/HUD 기능 여부는 상세 확인하지 않았으므로 비교 카피는 marketer가 재확인해야 한다.
- 상위 경쟁작은 Win+Mac, 오랜 운영 이력, 서명된 배포를 갖춤 → SHA Paint는 그 아래 가격이 합리적.

---

## 3. 가격 모델 비교

| 모델 | 장점 | 단점 | 이 제품 적합도 |
|---|---|---|---|
| **A. 영구 라이선스(1회 결제)** | 경쟁작 표준. 구매 결정 쉬움. 구현 단순(키 검증만) | 지속 수익 없음. 업데이트 비용을 신규 판매로 충당해야 함 | **높음 (추천)** |
| B. 구독(월/연) | 지속 수익 | 단일 기능 유틸에 구독은 거부감 큼. Adobe 구독을 이미 내는 타깃. 서버 측 상태 관리 필요. 경쟁작 중 구독 사례 없음 | 낮음 |
| C. 영구 + 메이저 유료 업그레이드 | 장기 수익. Coolorus($9.99 업그레이드), Lazy Nezumi(1년 업데이트 후 갱신)가 사용 | 메이저 버전에 충분한 신기능 필요 | **중간 (A에 옵션으로 유보)** |
| D. 무료 + 프로 | 유입 확대 | 무료판 경계 설계·유지 비용. 1인 개발에 부담. 무료판도 서명·지원 필요 | 낮음(v1) |

**추천: A + C 유보.** v1은 1회 결제, "1.x 무료 업데이트" 명시. 2.0(예: macOS, 히스토리 영속화+팔레트 저장 등)이 충분히 커지면 기존 구매자 업그레이드 $7~9 [가정]을 검토.

---

## 4. 추천 가격과 정책

### 4-1. 가격안 3개 비교

| 안 | 정가 | 런칭가 | 포지션 | 판단 |
|---|---|---|---|---|
| 1. 저가 | $9.99 | $6.99 | 충동구매 구간 | 정액 수수료($0.50) 비중이 커지고, 할인 여지가 작다. 지원 비용 대비 저평가 |
| **2. 중가 (추천)** | **$14.99** | **$9.99** | Filthy($12)~Coolorus($16.99) 사이 | 미서명·Windows 전용 약점을 감안한 현실적 상단 |
| 3. 고가 | $19.99 | $14.99 | MagicPicker급 | Mac·서명·안정성 이력이 갖춰진 뒤(v2)에 고려 |

원화 표기 [가정 1달러=1,500원]: 정가 약 22,500원, 런칭가 약 15,000원. Gumroad는 USD 결제이며, 국내 카드 해외결제 시 구매자 측 추가 수수료가 붙을 수 있다 [미확인].
국내 PG로 원화 판매를 따로 연다면 정가 **19,900원 / 런칭 14,900원(VAT 포함)** [가정]을 제안(국내 심리 가격대, 해외가보다 약간 낮음).

### 4-2. 런칭 할인 / 얼리버드
- 런칭가 $9.99: **출시 후 14일 또는 선착순 300개** 중 먼저 도달 시 종료 [가정: 수량·기간은 조정 가능].
- 이후 정기 할인은 **연 1회(블랙프라이데이) 최대 30%**로 제한. MagicPicker는 35~60% 할인 이력이 있으나, 신생 제품이 상시 할인하면 정가 신뢰가 무너진다.
- 학생/교육 할인, 번들: v1에서는 하지 않음(운영 부담).
- 런칭 구매자에게 "1.x 무료 업데이트" + (2.0 출시 시) 업그레이드 할인 약속은 **하지 않는다**(지킬 수 있는 약속만).

### 4-3. 환불 정책(제안)
- **구매 후 30일 이내, 사유 불문 전액 환불.** 체험판이 없으므로 환불이 사실상 체험판 역할.
- 근거: Coolorus 60일 [확인], Proko 30일 [확인]. Paddle은 "환불 불가" 문구를 거부하며 14~90일 범위를 요구한다는 개발자 문서가 있음 [확인, 개발자 문서].
- 비용: Gumroad는 환불 시에도 플랫폼 수수료(10%+$0.50)를 돌려주지 않는다는 제3자 보고가 있음 [제3자 자료, 공식 미확인] → 환불 1건당 약 $2~2.7 손실로 계산.
- 한국 전자상거래법상 디지털 콘텐츠 청약철회 제한 요건이 있으나, 30일 무조건 환불은 법정 기준보다 소비자에게 유리하므로 충돌 가능성이 낮다고 보인다(전문가 확인 필요).
- 라이선스 키 도입 시 환불 = 키 비활성화.

---

## 5. 손익 계산

### 5-1. 판매 1건당 순수익 (USD)

공통 [가정]: 구매자 대부분 해외 카드, 판매자 한국 거주, 세금은 MoR이 처리하고 가격과 별도 부과(tax-exclusive) 설정. 세금 포함 가격(tax-inclusive)으로 설정하면 EU 구매 건은 VAT(약 17~25%)만큼 추가로 줄어든다.

| 판매처 | 수수료 구조 | $9.99 순수익 | $14.99 순수익 | $19.99 순수익 | 비고 |
|---|---|---|---|---|---|
| Gumroad (공식 수수료만) | 10% + $0.50 [확인] | 8.49 | 12.99 | 17.49 | 직접 링크 판매 기준. Discover 유입 판매는 30% [확인] |
| **Gumroad (보수적)** | 위 + 카드처리 2.9%+$0.30 별도 가정 [제3자 자료] | **7.90** | **12.26** | **16.61** | 처리 수수료 포함 여부가 공식 페이지에 불명확 → 보수적 값을 기준으로 사용 |
| Lemon Squeezy | 5%+$0.50, 해외카드 +1.5%, 비미국 은행 정산 1% [확인] | 8.75 | 13.38 | 18.01 | PayPal 결제 시 +1.5% 추가 |
| Adobe Marketplace | 10% 정률 [확인] | 8.99 | 13.49 | 17.99 | FastSpring 정산 수수료 [미확인]. 등록 요건 미충족 가능성(sales-channels.md) |
| itch.io | 기본 10%(조정 가능) + 처리 ~2.9%+$0.30 [확인] | 8.40 | 12.76 | 17.11 | 게임 중심 마켓 |

계산식 예: Gumroad 보수적 $14.99 = 14.99 − (1.499 + 0.50) − (0.435 + 0.30) = 12.26.

### 5-2. 연간 고정비

| 항목 | 금액 | 근거 |
|---|---|---|
| 코드서명 인증서(OV, 클라우드) | Certum Standard Code Signing in the Cloud **€209** → 약 $240 / 약 36만원 [환율 가정 €1=$1.15] | [확인] https://shop.certum.eu/code-signing.html . 2026-02-27부터 인증서 최대 유효기간 459일 → 사실상 매년 갱신 |
| (대안) Sectigo OV | 리셀러가 약 $220/년~, EV 약 $290~500/년 | [제3자 리셀러 자료] https://sslinsights.com/sectigo-code-signing-certificate-guide/ |
| (대안) Microsoft Artifact Signing(구 Trusted Signing) | 가격 페이지에 금액 미노출. **개인 개발자는 미국·캐나다만 대상**이라는 2025년 Q&A 답변 → 한국 개인 사용 불가로 판단 | [확인/미확인 혼재] https://learn.microsoft.com/en-us/answers/questions/2243504/trusted-signing-for-other-countries |
| 도메인 | 약 2만원/년 | [가정] |
| 랜딩 호스팅 | 0원 (정적 호스팅 무료 티어) | [가정] |
| 세무 신고(종합소득세) 대행 | 0~30만원/년 | [가정] |
| Gumroad 월 고정비 | 0원 | [확인] https://gumroad.com/pricing |
| **합계(기준)** | **약 70만원 ≈ $470/년** | [가정] |

제외 항목: Apple Developer Program(macOS 서명·공증 시 필요, 금액 이번 조사에서 미확인), 개발자 인건비(아래 별도 시나리오).

참고: EV 인증서는 2024년 이후 SmartScreen 평판을 즉시 주지 않으며 OV와 동일하게 평판을 쌓아야 한다는 자료가 있다 → **EV에 추가 비용을 쓸 이유가 약하다.** [확인, Microsoft 문서·업계 블로그] https://learn.microsoft.com/et-ee/windows/apps/package-and-deploy/smartscreen-reputation , https://www.todesktop.com/blog/posts/windows-apps-psa-ev-certs-do-not-grant-immediate-reputation-anymore

### 5-3. 손익분기 판매량 (Gumroad 보수적 기준)

환불률 [가정] 8%. 환불 건은 매출 0, 수수료 손실(10%+$0.50 + 처리 수수료)로 계산.

| 가격 | 건당 순수익 | 환불 반영 실효 순수익 | 고정비 $470 손익분기 |
|---|---|---|---|
| $9.99 (런칭가로만 판매) | 7.90 | 7.10 | **67개** |
| **$14.99 (정가)** | 12.26 | 11.06 | **43개** |
| $19.99 | 16.61 | 15.05 | 32개 |

개발 시간까지 회수하려면 [가정]: 개발·지원 200시간 × 시급 3만원 = 600만원(≈$4,000) + 고정비 $470 → 정가 기준 약 **405개**.

### 5-4. 1년차 판매 시나리오 (전부 가정)

[가정] 판매의 30%는 런칭가($9.99), 70%는 정가($14.99). 환불 8%. 세전·종합소득세 전 금액. 환율 1,500원.

| 시나리오 | 연 판매량 | 순매출(수수료·환불 후) | 고정비 차감 후 | 원화 |
|---|---|---|---|---|
| 비관 | 100 | $987 | **$517** | 약 78만원 |
| 기준 | 400 | $3,949 | **$3,479** | 약 522만원 |
| 낙관 | 1,500 | $14,808 | **$14,338** | 약 2,151만원 |

판매량 근거는 없다. 출시 후 4주간 실제 랜딩 방문 수·전환율로 즉시 갱신해야 한다. 판단 기준 [가정]: 랜딩 전환율 1~2%라면 기준 시나리오(400개)에는 연 2~4만 방문이 필요.

### 5-5. 세금 메모 (전문가 확인 필요)
- Gumroad(2025-01-01부터), Lemon Squeezy, Paddle은 MoR로서 구매자 국가의 판매세/VAT를 징수·납부한다 [확인]. 판매자는 해외 VAT 등록이 필요 없을 가능성이 높다.
- 한국 측: 국내 거주자의 해외 플랫폼 수익은 종합소득세 합산 신고 대상이고, 매출 누락 시 가산세가 있다 [확인, 세무 서비스 자료] https://help.bznav.com/hc/ko/articles/53282397984409 . 해외 MoR에 공급하는 구조에서 **부가세 영세율 적용 여부와 증빙**은 세무사 확인 필요.
- 국내 PG로 원화 직접 판매 시 판매자가 부가세(10%) 과세 대상. 국내가 19,900원(VAT 포함)이면 공급가 약 18,091원, 토스페이먼츠 일반 카드 수수료 3.4%(VAT 별도) 차감 시 약 17,350원/건 [계산, 수수료 출처: https://www.tosspayments.com/about/fee]. 첫해 가입비 22만원 + 연관리비 11만원 고정비 추가.

---

## 6. 출시 범위와 가격의 연결 (로드맵 요약)

### 출시 차단 요소 (해결 전 유료 판매 비권장)
| 항목 | 현재 | 가격 영향 |
|---|---|---|
| 검정 글리치 | 방어 3계층 + 시나리오 테스트 존재. **실제 와콤 환경 검증 기록 필요** | 미해결 시 환불률 급증 → 손익분기 붕괴 |
| 설치 안정성 | UXP 플러그인은 `.ccx`/UDT 사용 불가 → 폴더 덮어쓰기 배포. 패널 수동 1회 열기 필요 | 설치 실패 = 환불. 인스톨러가 플러그인 폴더 복사를 자동화하는지 developer 확인 필요 |
| 라이선스 키 | 없음 | 없어도 판매는 가능(Gumroad 다운로드 링크). 무단 공유 감수 여부 결정 필요 |
| macOS | 미검증 | **v1은 Windows 전용으로 판매**. 랜딩에서 Mac 약속 제거 |
| 코드서명 | 없음 | SmartScreen 경고 → 전환율 하락 [가정]. 인증서 €209/년 |
| 식별자/상표 | 동봉 파일명에 `tourbox`(타사 제품 브랜드) 포함, 나머지 ID는 `yourcompany` 플레이스홀더 | 출시 전 이름 교체 권장 |

### 출시 후 기능(유료 업그레이드 후보)
히스토리 영속화, 팔레트 저장, 패널 위치 기억, Esc 닫기 안정화, macOS(검증 후), 다국어.

---

## 7. 포지셔닝 (가격 근거용)

- 타깃: Photoshop에서 와콤 펜으로 채색하는 일러스트레이터·웹툰·컨셉 아티스트(Windows).
- 한 문장 가치 제안(초안): **"펜을 떼지 않고, 명도는 그대로 둔 채 색만 바꾼다."**
- 차별점(검증 가능한 것만): 커서 위치 오버레이 팝업 / Lab L* 고정 / 같은 명도의 후보 색 / 즉시 전경색 적용.
- 피해야 할 주장: "최초의 명도 고정 도구"(MagicPicker Tone Lock, Filthy Luminosity Lock 존재), "Mac 지원", "패널 없이도 완벽 동작".

---

## 8. 열린 질문 (결정 필요)
1. 출시 판정 기준: 와콤 실사용 N시간 동안 검정 오염 0건 등 정량 기준을 누가 정하나?
2. 라이선스 키 v1 포함 여부. 포함 시 Gumroad 라이선스 API(인증 불필요 verify 엔드포인트)로 구현 가능 → developer 공수 산정 필요.
3. 코드서명 확보 전 판매 시작 여부. (권장: 런칭가 기간에만 미서명 허용하고 정가 전환 전 서명)
4. 사업자 형태(간이/일반과세)와 통신판매업 신고 필요 여부 → sales-channels.md 체크리스트.
5. 원화 결제 채널 개설 여부와 시점.
6. 판매량 가정 검증: 출시 4주 후 실제 데이터로 5-4 표 갱신.

---

## 출처
- Coolorus: https://coolorus.com
- MagicPicker: https://anastasiy.com/colorwheel / 할인 이력: https://blog.anastasiy.com/?cat=40 / Tone Lock: https://blog.anastasiy.com/?p=537
- Filthy PS Plug-in: https://www.proko.com/tool/filthy-photoshop-plugin , https://makenowthinker.gumroad.com/l/wlfko
- Lazy Nezumi Pro: https://lazynezumi.com , https://lazynezumi.com/buy
- Mixer Bars UXP: https://exchange.adobe.com/creativecloud/plugindetails.html/app/cc/756f3079
- 무료 컬러 휠: https://christiandulson.gumroad.com/l/photoshop-color-wheel
- Gumroad 브러시 가격대(제3자): https://marketsy.ai/tools/gumroad-trends/category/brushes%20photoshop
- Gumroad 패널: https://tpanel.gumroad.com/l/ultimate
- Clip Studio: https://www.clipstudio.net/en/purchase/ , https://subger.com/en/service/clip-studio
- 국내 전자책 가격 사례: https://brunch.co.kr/@mingzi93/155
- Gumroad 수수료: https://gumroad.com/pricing / 처리 수수료·환불 시 수수료(제3자): https://checkoutpage.com/blog/gumroad-fees , https://dodopayments.com/blogs/gumroad-fees-explained
- Lemon Squeezy: https://www.lemonsqueezy.com/pricing , https://docs.lemonsqueezy.com/help/getting-started/fees
- Adobe Marketplace: https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/adobe-marketplace
- itch.io: https://itch.io/docs/creators/payments
- Paddle 환불 정책 요건: https://developer.paddle.com/partners/embed-billing/seller-go-live/minimum-seller-terms
- 코드서명: https://shop.certum.eu/code-signing.html , https://sslinsights.com/sectigo-code-signing-certificate-guide/ , https://azure.microsoft.com/pricing/details/artifact-signing/ , https://learn.microsoft.com/en-us/answers/questions/2243504/trusted-signing-for-other-countries
- SmartScreen/EV: https://learn.microsoft.com/et-ee/windows/apps/package-and-deploy/smartscreen-reputation , https://www.todesktop.com/blog/posts/windows-apps-psa-ev-certs-do-not-grant-immediate-reputation-anymore
- 토스페이먼츠: https://www.tosspayments.com/about/fee
- 해외 플랫폼 수익 세금: https://help.bznav.com/hc/ko/articles/53282397984409
- 환율(2026-07-10 기준 1,501.06원, 10월 값 미확인): https://ycharts.com/indicators/south_korean_won_to_us_dollar_exchange_rate
