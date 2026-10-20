# SHA Paint 판매처 검토

- 작성: planner 에이전트 / 기준일 2026-10-19
- **법률·세무 자문이 아님.** 사업자등록, 통신판매업, 부가세, 약관은 세무사·법률 전문가 확인 필요.
- 표기: **[확인]** 출처로 확인 / **[제3자]** 비공식 자료 / **[미확인]** 조사했으나 확인 불가(2026년 기준 확인 불가 포함) / **[가정]**
- 가격·손익은 `docs/pricing.md` 참고.

---

## 0. 결론

| 순위 | 판매처 | 이유 |
|---|---|---|
| **1순위** | **Gumroad** | 이미 랜딩 초안에 결제 오버레이가 연결되어 있음(플레이스홀더만 교체). 2025-01-01부터 MoR(해외 세금 대행) [확인]. 고정비 0, 심사 없음, 개인 판매 가능. 라이선스 키 생성 + 인증 불필요 verify API [확인, 문서 미러]. 수수료가 가장 높은 편(10%+$0.50)이지만 초기 판매량에서는 차이가 작다(정가 기준 Lemon Squeezy 대비 건당 약 $0.4~1.1). |
| **2순위** | **Lemon Squeezy** | 수수료가 낮고(5%+$0.50, 해외카드 +1.5%) MoR, 라이선스 키 자동 발급·비활성화·재발급 내장 [확인]. 한국 은행 정산 지원 국가 목록에 포함 [확인]. 단 Stripe 인수 후 Stripe Managed Payments로의 전환 방향이 거론되어 장기 불확실성 [제3자]. **월 판매가 100건 이상[가정]으로 늘거나, 기기 활성화 제한이 필요해지면 전환 검토.** |
| 보조 | 텀블벅(국내 런칭 펀딩) | 국내 커뮤니티 노출용 1회성 이벤트. 수수료 Start 5%(VAT 별도)+결제대행 [확인]. |
| 보류 | Adobe Creative Cloud Marketplace | 수수료는 10%로 낮지만, 외부 exe(Electron 앱) 동반 구조가 심사 요건과 충돌 가능성 높음(아래 3장). |
| 비추천(v1) | Paddle, 자체 사이트+국내 PG, 크몽, itch.io | 각각 심사 부담 / 고정비·세무 부담·해외 VAT 미처리 / 수수료 높음·정보 불명확 / 타깃 불일치 |

---

## 1. 판매처 비교표

| 판매처 | 수수료 | 한국 개인/사업자 판매 | 세금(MoR) | 라이선스 키 | 정산 | 근거 상태 |
|---|---|---|---|---|---|---|
| **Gumroad** | 직접 판매 10%+$0.50, Discover 유입 30% [확인]. 카드 처리비 별도 여부 불명확(별도라는 제3자 자료 있음) | 개인 가능 [제3자]. 한국 은행 직접 입금 지원 국가로 제3자 목록에 있으나 공식 표 미확인. 미지원 국가는 PayPal [확인, 도움말 인용] | **MoR (2025-01-01~)**, 전 세계 판매세/VAT 처리 [확인] | 판매당 고유 키 생성 옵션 + `POST /v2/licenses/verify`(인증 불필요, 사용 횟수 카운트) [확인, 문서 미러]. 기기별 해제 기능은 없음 [가정] | 매주 금요일, 최소 7일 보류 [확인/제3자]. **최소 지급액 $10 vs $100 자료 충돌** [미확인] | 대부분 확인 |
| **Lemon Squeezy** | 5%+$0.50, 미국 외 카드 +1.5%, PayPal +1.5%, 구독 +0.5% [확인] | 한국("Republic of Korea") 은행 정산 지원 목록에 포함 [확인] | **MoR**, 세금 계산·징수·신고 포함 [확인] | 자동 발급, 비활성화·재발급 지원 [확인] | 월 2회(1일·15일), USD. 비미국 은행 정산 1%, PayPal 정산 3%(최대 $30) [확인] | 확인. Stripe 전환 불확실성 [제3자] |
| **Paddle** | 5%+$0.50 [확인]. **$10 미만 상품은 별도 문의** [확인] | 개인사업자 가능(약관에 법적 이름 권장) [확인] | **MoR** [확인] | 내장 여부 [미확인] | [미확인] | 도메인 심사: 약관·환불·개인정보처리방침 페이지 공개 필수, 가격 공개 필수 [확인] |
| Polar | 공식 문서상 4%+$0.40 [확인]. 2026-05-27부로 Starter 5%+$0.50로 변경됐다는 제3자 보도 [제3자] | [미확인] | MoR [확인] | 내장 [확인] | [미확인] | **2026년 현행 요율 확인 불가** |
| **Adobe CC Marketplace** | 10% 정률, FastSpring 경유 [확인]. 커뮤니티 보고: FastSpring 최소 지급 $100 [제3자, 2021] | 한국 정산 가능 여부 [미확인] | **EU만 MoR**(EU VAT 징수·납부) [확인]. 그 외 지역 세금 처리 [미확인] | 마켓 자체 라이선스 [미확인] | 로열티 지급 [확인], 주기 [미확인] | 심사 요건 확인(3장) |
| itch.io | 오픈 수익배분 기본 10%(0~100% 조정) + 처리비 약 2.9%+$0.30 [확인] | 가능. PayPal/Payoneer 지급 [확인] | "Collected by itch.io" 방식 선택 시 MoR [확인] | 다운로드 키 있음, 앱 내 검증 API [미확인] | 판매 7일 후 가용, 지급 요청 후 검토 7~14일, 최소 $5, 세금 신원확인 $3 1회 [확인] | 확인. 게임 중심 마켓 |
| 크몽 | 20% 또는 25%(VOD) 등 자료 충돌 [제3자] | 가능. 통신판매업 관련 안내 페이지 존재 [확인] | 국내 판매(해외 VAT 해당 없음) | 없음 [가정] | [미확인] | **수수료율 확인 불가**. 소프트웨어 판매 카테고리 적합성 [미확인] |
| 텀블벅 | Start 요금제 5%(VAT 별도) + 결제대행 수수료, 성공 시에만 [확인, 2025-07~10 정책 문서] | 가능 | 국내 | 없음 | 결제 종료 후 7영업일 [확인] | 2026-10 현행 요율 [미확인] |
| 자체 사이트 + 토스페이먼츠 | 카드 3.4%(VAT 별도, 일반 등급), 가입비 22만원(1회), 연관리비 11만원 [확인] | **사업자등록 + 통신판매업 신고 사실상 필수** | **판매자가 직접 처리**. 해외 구매자 VAT 대응 불가 → 국내 전용 | 직접 구현 필요 | [미확인] | 확인 |
| 자체 사이트 + 포트원 | PG 연동 플랫폼. 추천 패키지로 PG 가입비·연회비 면제 홍보 [확인, 2024 블로그] | 사업자 필요 [가정] | 판매자 직접 | 직접 구현 | [미확인] | 2026년 요금제 [미확인] |

### 정가 $14.99 기준 건당 순수익 (pricing.md 5-1 재게시)
Gumroad 12.26(보수적) ~ 12.99 / Lemon Squeezy 13.38 / Adobe 13.49 / itch.io 12.76 (USD)

---

## 2. 1·2순위 상세 근거

### Gumroad (1순위)
- **출시 속도**: `site/index.html`에 `gumroad.js` 오버레이와 버튼 3개가 이미 있다. URL 교체만으로 결제 가능.
- **세무 부담**: MoR이므로 EU/영국/미국 주별 세금을 판매자가 등록할 필요가 없을 가능성이 높다 [확인: MoR 표명. 개별 국가 적용 범위는 미확인].
- **라이선스**: 판매당 키 생성 → 앱이 verify API를 호출해 검증하는 최소 구현이 가능. 현재 앱은 외부 네트워크 통신이 전혀 없으므로, 도입 시 개인정보처리방침에 "라이선스 키 확인 목적의 통신"을 추가해야 한다.
- **단점**: 10%+$0.50로 MoR 중 가장 비쌈 / 환불 시 수수료 미반환 보고 [제3자] / 최소 지급액 정보 충돌 / 한국 은행 직접 입금 공식 확인 필요.

### Lemon Squeezy (2순위)
- 수수료 우위: $14.99에서 Gumroad 보수적 대비 건당 약 $1.1 더 남음. 연 400개[가정]면 약 $450 차이 → 코드서명 인증서 1년치 이상.
- 라이선스 활성화 관리(비활성화·재발급)가 내장되어 "PC 2대" 정책 구현이 쉬움.
- 위험: Stripe 인수 이후 Stripe Managed Payments로의 이전 방향이 제3자 자료에서 거론됨, 지원 지연 언급 [제3자]. 랜딩 결제 버튼 교체 작업 필요.

### 전환 기준 [가정]
월 100건 이상 또는 무단 공유가 확인되어 기기 활성화 제한이 필요해지면 Lemon Squeezy(또는 그 시점 현행 MoR) 이전을 검토.

---

## 3. Adobe Creative Cloud Marketplace 검토 (보류 사유)

공식 리뷰 가이드라인에서 확인한 요건 [확인, https://developer.adobe.com/uxp/guides/how-to/distribution/review-guidelines/ ]:
- "The companion app must install successfully on all supported operating systems"
- "The plugin must not launch external applications (only browser links are allowed)"
- 하이브리드 플러그인은 macOS arm64 / macOS x64 / Windows x64 바이너리를 모두 포함해야 함
- "avoid OS-level warning prompts during installation" → 미서명 exe의 SmartScreen 경고와 충돌
- Adobe 상표 사용 제한("Photoshop Enhancer" 같은 이름 금지, 로고 무단 사용 금지)
- 심사를 위해 라이선스 키/테스트 계정 제공 필요

SHA Paint 구조와의 충돌:
| 요건 | SHA Paint 현재 | 판정 |
|---|---|---|
| 동반 앱이 지원 OS 모두에서 설치 | Electron 앱 Windows만 검증, macOS 미검증 | **불충족 가능성 높음** (UXP manifest에서 Windows 전용 지정이 허용되는지 [미확인]) |
| 플러그인이 외부 앱 실행 금지 | UXP 패널은 WS 클라이언트일 뿐 앱을 실행하지 않음(코드상) | 충족 가능 |
| 설치 시 OS 경고 회피 | 미서명 | **불충족** |
| 식별자·상표 | 플러그인 ID `com.yourcompany.luminancepicker`(플레이스홀더), 동봉 파일명 `tourbox-luminance-picker.ccx`(타사 브랜드명 포함) | 교체 필요 |
| 사용자 배포 방식 | 사용자는 `.ccx`/UXP Developer Tool을 쓸 수 없어 폴더 덮어쓰기로 배포 중(CLAUDE.md) | 마켓 배포는 `.ccx` 기반 → 이 사용자 환경 이슈 원인 파악 필요 |

결론: v1에서는 보류. 서명 + (가능하면) Mac 검증 후, **유료가 아닌 "무료 동반 패널" 등록**을 노출 채널로 쓰는 방안을 v2에서 재검토. 외부 결제 상품과 연계된 무료 리스팅이 허용되는지는 [미확인] — 가이드라인은 유료/체험/무료 티어를 "명확히 표기"하라고만 요구.

---

## 4. 런칭 체크리스트

### A. 사업·세무 (전문가 확인 필요)
- [ ] **사업자등록** (업종: 소프트웨어 개발·공급 / 전자상거래 등. 간이 vs 일반과세는 예상 매출로 결정). 간이과세 기준 금액은 자료마다 8천만원/1억400만원으로 충돌 [미확인] → 국세청 확인.
- [ ] **통신판매업 신고 필요 여부 판단**: 직전연도 거래 50회 미만 또는 간이과세자면 면제 가능하다는 고시 해석 자료 [제3자]. 해외 MoR(Gumroad 등)이 판매자인 구조에서 내가 통신판매업자에 해당하는지는 [미확인] → 관할 시·군·구청 확인. 국내 PG 사용 시에는 신고번호를 요구받는 경우가 많음 [제3자].
- [ ] 해외 플랫폼 수익의 종합소득세 신고, 부가세 영세율 적용 가능성과 증빙(정산 내역 보관) [확인: 신고 대상이라는 자료 / 영세율은 미확인].
- [ ] 정산 계좌: Gumroad 한국 은행 입금 가능 여부를 계정 설정 화면에서 직접 확인. 불가 시 PayPal.

### B. 제품·배포
- [ ] 검정 글리치 실사용(와콤) 검증 기록 — 출시 판정 기준 정의 (pricing.md 8장)
- [ ] **코드서명**: Certum Standard Cloud €209 또는 Sectigo OV(리셀러 약 $220~). EV는 SmartScreen 즉시 통과 효과가 없어 비추천. Microsoft Artifact Signing은 한국 개인 대상 아님(2025 Q&A 기준) [확인/미확인 혼재]. 서명 후에도 초기 SmartScreen 경고는 평판이 쌓일 때까지 남을 수 있음.
- [ ] 인스톨러가 UXP 플러그인 폴더 배치 + "패널 1회 열기" 안내를 포함하는지 확인(설치 실패 = 환불)
- [ ] 라이선스 키 방식 결정 (무키 / Gumroad verify / Lemon Squeezy 활성화). 오프라인 유예 기간 [가정 7일] 설계
- [ ] 식별자 정리: 동봉 패키지 파일명 `resources/tourbox-luminance-picker.ccx`(타사 브랜드 TourBox 포함), UXP 플러그인 ID `com.yourcompany.luminancepicker`·이름 `Luminance Color Picker`, appId `com.yourcompany.luminanceoverlay`, author `Luminance Picker Project` → 정식 이름으로 교체 (`app/package.json`, `uxp-plugin/manifest.json`)
- [ ] macOS: v1 판매 범위에서 제외 명시

### C. 문서·정책 (랜딩에 링크)
- [ ] **EULA**: 1인 사용, PC 2대, 양도 금지, 보증 부인, 책임 제한, 1.x 무료 업데이트 범위
- [ ] **환불 정책**: 30일 무조건 환불 (pricing.md 4-3). Paddle 등은 "환불 불가" 문구를 거부 [확인]
- [ ] **이용약관**
- [ ] **개인정보처리방침**: 앱은 현재 외부로 아무것도 전송하지 않음(로그는 `%APPDATA%\luminance-overlay-app\sha-paint-log.txt` 로컬 저장). 이를 그대로 명시. 사용자가 지원 요청 시 로그 파일을 **자발적으로** 보내는 경우의 처리(보관 기간·삭제)를 기재. 결제 정보는 MoR(Gumroad 등)이 처리함을 기재. 라이선스 검증 통신 추가 시 개정.
- [ ] **Adobe 상표**: 제품명·로고에 Photoshop 미사용. "for Adobe® Photoshop®" 수준의 설명적 사용과 "Adobe 및 Photoshop은 Adobe Inc.의 상표이며 SHA Paint는 Adobe와 무관" 고지 [가정: 일반적 관행, 전문가 확인]. 광고 영상에서 Photoshop UI 노출 범위도 marketer와 확인
- [ ] Wacom 상표: "와콤 펜 지원" 표현 시 동일하게 소유권 고지 [가정]
- [ ] 사업자 정보 표시(국내 판매 시 전자상거래법상 표시 의무 가능성) [미확인]

### D. 랜딩/결제
- [ ] Gumroad 상품 생성(라이선스 키 옵션 ON), 랜딩 URL 3곳 교체, 문의 이메일 실제 주소로 교체
- [ ] 가격 표기: 런칭가 $9.99 + 정가 $14.99, 원화 환산은 "약"으로 (pricing.md 0장)
- [ ] 랜딩 FAQ 수정: Mac 약속 완화, "패널 없이도 작동" 문구 검증, 환불 문구 교체
- [ ] Gumroad 세금 표시 방식(가격 포함/별도) 설정 확인
- [ ] Gumroad 최소 지급액·지급 국가 설정 확인

---

## 5. 열린 질문
1. Gumroad 한국 은행 직접 입금이 실제 계정에서 가능한가? (공식 국가표 미확인)
2. Gumroad 최소 지급액은 $10인가 $100인가? (자료 충돌)
3. 해외 MoR 판매 시 통신판매업 신고 대상인가? 부가세 영세율 적용 가능한가? (세무사)
4. Lemon Squeezy의 Stripe 전환 일정이 신규 판매자에게 영향을 주는가? (2026 공식 공지 확인 필요)
5. Adobe Marketplace에 Windows 전용 동반 앱 플러그인 등록이 가능한가? (Adobe 개발자 지원 문의)
6. 크몽 소프트웨어 판매 수수료와 카테고리 적합성 (공식 판매자센터 확인)

---

## 출처
- Gumroad 수수료·MoR: https://gumroad.com/pricing
- Gumroad 지급(공식 도움말, 본문 로드 실패): https://gumroad.com/help/article/13-getting-paid
- Gumroad 지급·국가(제3자): https://learnwithhasan.com/payment-gateways/gumroad/ , https://mintlify.com/antiwork/gumroad/payments/payouts , https://sellfy.com/blog/gumroad-pricing/
- Gumroad 수수료 상세(제3자): https://checkoutpage.com/blog/gumroad-fees , https://dodopayments.com/blogs/gumroad-fees-explained
- Gumroad 라이선스 API: https://www.mintlify.com/antiwork/gumroad/api/licenses/verify
- Lemon Squeezy: https://www.lemonsqueezy.com/pricing , https://docs.lemonsqueezy.com/help/getting-started/fees , https://docs.lemonsqueezy.com/help/getting-started/supported-countries , https://docs.lemonsqueezy.com/help/getting-started/getting-paid
- Lemon Squeezy/Stripe 전환(제3자): https://fungies.io/lemon-squeezy-stripe-acquisition-saas-founders-2026/ , https://dodopayments.com/blogs/lemonsqueezy-alternatives
- Paddle: https://www.paddle.com/pricing , https://www.paddle.com/help/start/account-verification/what-is-domain-approval , https://developer.paddle.com/partners/embed-billing/seller-go-live/minimum-seller-terms
- Polar: https://polar.sh/docs , https://fungies.io/polar-sh-review-2026
- itch.io: https://itch.io/docs/creators/payments
- Adobe Marketplace: https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/adobe-marketplace , https://developer.adobe.com/uxp/guides/how-to/distribution/review-guidelines/ , https://community.adobe.com/questions-628/fastspring-minimum-payout-changed-from-25-dollars-to-100-685631
- 크몽: https://calcnara.com/calculators/ebook-revenue , https://lilys.ai/ko/notes/sell-digital-products-20251203/creator-knowledge-courses-platform , https://kmong.com/support/expert-center/posts/671
- 텀블벅: https://docs.channel.io/tumblbug/ko/articles/2ee4a118
- 토스페이먼츠: https://www.tosspayments.com/about/fee
- 포트원: https://blog.portone.io/pg-recommend/ , https://blog.portone.io/pricing-plan-updates/
- 통신판매업 면제 기준(제3자): https://thecheck.co.kr/mail-order-business-report-exemption/
- 해외 플랫폼 수익 신고: https://help.bznav.com/hc/ko/articles/53282397984409
- 한국 디지털 서비스 VAT(제3자): https://quaderno.io/guides/south-korea-vat-guide
- 코드서명: https://shop.certum.eu/code-signing.html , https://sslinsights.com/sectigo-code-signing-certificate-guide/ , https://learn.microsoft.com/en-us/answers/questions/2243504/trusted-signing-for-other-countries , https://www.todesktop.com/blog/posts/windows-apps-psa-ev-certs-do-not-grant-immediate-reputation-anymore
