#!/usr/bin/env node
// app/licensing.js를 가짜 fetch(Gumroad 흉내)와 임시 폴더로 시나리오 테스트한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLicensing, OFFLINE_GRACE_MS, VERIFY_INTERVAL_MS } = require(path.join(__dirname, '..', 'app', 'licensing.js'));

let fail = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) fail++; };
const silent = { log() {}, warn() {}, error() {} };

const VALID = 'AAAA1111-BBBB2222-CCCC3333-DDDD4444';
function makeEnv(server) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shalic-'));
  const env = { dir, t: 1_000_000_000, calls: [], server };
  env.fetch = async (url, opts) => {
    const params = new URLSearchParams(opts.body);
    env.calls.push(Object.fromEntries(params));
    return env.server(params);
  };
  env.lic = createLicensing({ userDataDir: dir, fetchImpl: env.fetch, now: () => env.t, productId: 'PROD123', log: silent });
  return env;
}
const resp = (status, body) => ({ status, json: async () => body });
const gumroad = (opts = {}) => (params) => {
  if (opts.offline) throw new Error('ENOTFOUND');
  if (params.get('license_key') !== VALID) return resp(404, { success: false, message: 'That license does not exist for the provided product.' });
  return resp(200, { success: true, uses: opts.uses || 1, purchase: { refunded: !!opts.refunded, chargebacked: false, disputed: false, quantity: opts.quantity || 1 } });
};

(async () => {
  { const e = makeEnv(gumroad());
    const s = await e.lic.check();
    check('키 없음 → 미확인 + 안내', !s.licensed && /입력/.test(s.reason)); }

  { const e = makeEnv(gumroad());
    fs.writeFileSync(path.join(e.dir, 'license-key.txt'), '﻿ ' + VALID.toLowerCase() + '\r\n');
    const s = await e.lic.check();
    check('인스톨러가 쓴 키(BOM/공백/소문자) → 확인됨', s.licensed, JSON.stringify(s));
    check('첫 활성화 때만 사용 횟수 증가', e.calls[0].increment_uses_count === 'true' && e.calls[0].product_id === 'PROD123');
    const n = e.calls.length; await e.lic.check();
    check('7일 이내 재실행 → 서버 호출 없음', e.calls.length === n);
    e.t += VERIFY_INTERVAL_MS + 1; await e.lic.check();
    check('7일 경과 → 재확인(횟수 증가 없음)', e.calls.length === n + 1 && e.calls[n].increment_uses_count === 'false');
    e.server = gumroad({ offline: true }); e.t += VERIFY_INTERVAL_MS + 1;
    check('오프라인 + 유예 기간 내 → 계속 사용', (await e.lic.check()).licensed);
    e.t += OFFLINE_GRACE_MS;
    check('오프라인 30일 초과 → 차단', !(await e.lic.check()).licensed); }

  { const e = makeEnv(gumroad());
    const s = await e.lic.activate('WRONG-KEY-1234');
    check('틀린 키 → 거부', !s.licensed && /유효하지/.test(s.reason));
    const s2 = await e.lic.activate(VALID);
    check('앱 창에서 올바른 키 재입력 → 확인됨', s2.licensed); }

  { const e = makeEnv(gumroad({ refunded: true }));
    check('환불된 구매 → 거부', !(await e.lic.activate(VALID)).licensed); }

  { const e = makeEnv(gumroad({ uses: 4 }));
    check('4대째 활성화 → 거부', !(await e.lic.activate(VALID)).licensed); }

  { const e = makeEnv(gumroad({ uses: 10, quantity: 5 }));
    check('5좌석 구매 → 10대째도 허용(5x3=15)', (await e.lic.activate(VALID)).licensed); }

  { const e = makeEnv(gumroad({ uses: 16, quantity: 5 }));
    check('5좌석 구매 → 16대째 거부', !(await e.lic.activate(VALID)).licensed); }

  { const e = makeEnv(gumroad({ offline: true }));
    const s = await e.lic.activate(VALID);
    check('첫 활성화인데 오프라인 → 미확인 + 인터넷 안내', !s.licensed && /인터넷/.test(s.reason)); }

  { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shalic-'));
    const lic = createLicensing({ userDataDir: dir, fetchImpl: async () => { throw new Error('호출되면 안 됨'); }, productId: '', log: silent });
    check('PRODUCT_ID 미설정 → 개발 모드 통과', (await lic.check()).devMode === true); }

  console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
  process.exit(fail ? 1 : 0);
})();
