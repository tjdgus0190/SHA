// licensing.js
// ---------------------------------------------------------------------
// 라이선스 키 확인 (Gumroad License API).
//
// 흐름:
//   1. 인스톨러(build/installer.nsh)가 설치 중 입력받은 키를
//      %APPDATA%\luminance-overlay-app\license-key.txt 에 저장한다.
//      (앱 안의 "라이선스 키 입력" 창도 같은 파일에 저장한다.)
//   2. 앱이 시작하면 그 키를 Gumroad에 확인하고, 결과를 license.json에
//      캐시한다. 이후엔 VERIFY_INTERVAL_MS마다 백그라운드로 재확인한다.
//   3. 인터넷이 안 될 때는 마지막 성공 확인 후 OFFLINE_GRACE_MS 동안은
//      그대로 사용 가능 — 오프라인 작업 중에 갑자기 막히지 않게.
//
// 출시 전 반드시 GUMROAD_PRODUCT_ID를 실제 값으로 채워야 한다
// (상품 편집 > Content 탭에서 "Generate a unique license key per sale"를
// 켜면 그 항목 아래에 표시됨. 안 보이면 상품 편집 > Share 탭 쪽도 확인).
// 비어 있으면 "개발 모드"로 간주해 확인 없이 통과시키고 경고 로그만 남긴다
// — scripts/verify.js가 이 상태를 경고로 알려준다.
// ---------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const i18n = require("./i18n.js");

const GUMROAD_PRODUCT_ID = "Z-z4Harnz0sMKG_7200QXw==";
const GUMROAD_VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify";
const MAX_ACTIVATIONS = 3; // 좌석(seat) 1개당 활성화할 수 있는 PC 수 (Gumroad 좌석 수만큼 곱함)
const VERIFY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

function normalizeKey(key) {
  return String(key || "").trim().replace(/\s+/g, "").toUpperCase();
}

// tr: 사용자에게 보여줄 사유 문구 번역 함수(main이 i18n.t를 넘김). 기본은 한국어.
function createLicensing({ userDataDir, fetchImpl = globalThis.fetch, now = () => Date.now(), productId = GUMROAD_PRODUCT_ID, log = console, tr = (k, v) => i18n.t(k, v, "ko") }) {
  const keyPath = path.join(userDataDir, "license-key.txt");
  const cachePath = path.join(userDataDir, "license.json");

  function readKey() {
    try { return normalizeKey(fs.readFileSync(keyPath, "utf8").replace(/^﻿/, "")); } catch (e) { return ""; }
  }
  function writeKey(key) {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(keyPath, normalizeKey(key), "utf8");
  }
  function readCache() {
    try { return JSON.parse(fs.readFileSync(cachePath, "utf8")) || {}; } catch (e) { return {}; }
  }
  function writeCache(c) {
    try { fs.writeFileSync(cachePath, JSON.stringify(c, null, 2), "utf8"); } catch (e) { log.error("[license] 캐시 저장 실패:", e.message); }
  }

  // Gumroad에 실제로 물어본다. 결과: { ok, reason, network }
  async function askGumroad(key, incrementUses) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const body = new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: incrementUses ? "true" : "false" });
      const res = await fetchImpl(GUMROAD_VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: ctrl.signal
      });
      let data = {};
      try { data = await res.json(); } catch (e) { /* 본문 없음 */ }
      if (res.status >= 500) return { ok: false, network: true, reason: tr("license.serverError", { status: res.status }) };
      if (!data.success) return { ok: false, network: false, reason: tr("license.invalid") };
      const p = data.purchase || {};
      if (p.refunded || p.chargebacked || p.disputed) return { ok: false, network: false, reason: tr("license.refunded") };
      // 구매자가 좌석을 여러 개 샀으면(purchase.quantity) 그만큼 PC 수를 늘려준다.
      const seats = Math.max(1, Math.floor(Number(p.quantity)) || 1);
      const limit = MAX_ACTIVATIONS * seats;
      if (Number(data.uses) > limit) return { ok: false, network: false, reason: tr("license.tooMany", { limit }) };
      return { ok: true, network: false, reason: "" };
    } catch (e) {
      return { ok: false, network: true, reason: tr("license.offline") };
    } finally {
      clearTimeout(timer);
    }
  }

  // 현재 상태를 판정한다. force=true면 캐시가 신선해도 서버에 다시 묻는다.
  // 결과: { licensed, reason, key, devMode }
  async function check({ force = false } = {}) {
    if (!productId) {
      log.warn("[license] GUMROAD_PRODUCT_ID가 비어 있음 — 개발 모드로 라이선스 확인을 건너뜁니다. 출시 빌드 전에 반드시 설정하세요.");
      return { licensed: true, reason: "", key: readKey(), devMode: true };
    }
    const key = readKey();
    if (!key) return { licensed: false, reason: tr("license.enterKey"), key: "" };

    const cache = readCache();
    const sameKey = cache.key === key;
    const t = now();
    if (!force && sameKey && cache.ok && t - cache.verifiedAt < VERIFY_INTERVAL_MS) {
      return { licensed: true, reason: "", key };
    }

    // 이 PC에서 이 키를 처음 활성화할 때만 사용 횟수를 올린다.
    const firstActivation = !(sameKey && cache.activated);
    const r = await askGumroad(key, firstActivation);
    if (r.ok) {
      writeCache({ key, ok: true, activated: true, verifiedAt: t });
      return { licensed: true, reason: "", key };
    }
    if (r.network && sameKey && cache.ok && t - cache.verifiedAt < OFFLINE_GRACE_MS) {
      log.warn(`[license] 온라인 확인 실패(${r.reason}) — 오프라인 유예 기간 내라 계속 사용`);
      return { licensed: true, reason: "", key };
    }
    if (!r.network) writeCache({ key, ok: false, activated: sameKey && !!cache.activated, verifiedAt: t });
    return { licensed: false, reason: r.reason, key };
  }

  async function activate(key) {
    const k = normalizeKey(key);
    if (k.length < 8) return { licensed: false, reason: tr("license.enterKeyExact"), key: k };
    writeKey(k);
    return check({ force: true });
  }

  return { check, activate, readKey, keyPath, cachePath };
}

module.exports = { createLicensing, normalizeKey, GUMROAD_PRODUCT_ID, MAX_ACTIVATIONS, OFFLINE_GRACE_MS, VERIFY_INTERVAL_MS };
