// sfx.js — 광고용 효과음을 코드로 합성해 WAV(48kHz, 16bit, 스테레오)로 만든다.
// 외부 음원 파일을 전혀 쓰지 않으므로 저작권 문제가 없다(전부 수식으로 생성).
// 큐 목록은 ad.html 의 window.SFX_CUES (타임라인과 같은 소스)에서 온다.
"use strict";

const SR = 48000;

// 결정적 노이즈 (매 렌더 동일한 소리)
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
}

function addInto(buf, startSec, samples, gain) {
  const off = Math.round(startSec * SR);
  for (let i = 0; i < samples.length; i++) {
    const j = off + i;
    if (j >= 0 && j < buf.length) buf[j] += samples[i] * gain;
  }
}

const gen = {
  whoosh(dur = 0.34, seed = 1) {
    const n = Math.round(dur * SR), out = new Float32Array(n), rnd = makeRng(seed);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const env = Math.sin(Math.PI * p) ** 2;
      const cut = 0.02 + 0.12 * Math.sin(Math.PI * p); // 필터가 열렸다 닫힘
      lp += (rnd() - lp) * cut; lp2 += (lp - lp2) * cut;
      out[i] = lp2 * env * 3.2;
    }
    return out;
  },
  click(dur = 0.05, seed = 2) {
    const n = Math.round(dur * SR), out = new Float32Array(n), rnd = makeRng(seed);
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      out[i] = (Math.exp(-tt * 900) * rnd() * 0.6 + Math.exp(-tt * 140) * Math.sin(2 * Math.PI * 2100 * tt) * 0.5);
    }
    return out;
  },
  pop(dur = 0.16) {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      const f = 320 + 700 * Math.exp(-tt * 38);
      ph += 2 * Math.PI * f / SR;
      out[i] = Math.sin(ph) * Math.exp(-tt * 26) * (1 - Math.exp(-tt * 3000));
    }
    return out;
  },
  tick(dur = 0.09) {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      out[i] = (Math.sin(2 * Math.PI * 1568 * tt) * 0.7 + Math.sin(2 * Math.PI * 3136 * tt) * 0.2) * Math.exp(-tt * 55) * (1 - Math.exp(-tt * 4000));
    }
    return out;
  },
  scribble(dur = 0.4, seed = 3) {
    const n = Math.round(dur * SR), out = new Float32Array(n), rnd = makeRng(seed);
    let lp = 0, hp = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / SR, p = i / n;
      const env = Math.min(1, p * 12) * Math.min(1, (1 - p) * 10) * (0.6 + 0.4 * Math.abs(Math.sin(2 * Math.PI * 7 * tt)));
      const x = rnd();
      hp = 0.97 * (hp + x - prev); prev = x; // 고역 통과 → 종이 긁는 질감
      lp += (hp - lp) * 0.35;
      out[i] = lp * env;
    }
    return out;
  },
  erase(dur = 0.4, seed = 4) {
    const n = Math.round(dur * SR), out = new Float32Array(n), rnd = makeRng(seed);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / SR, p = i / n;
      const env = Math.min(1, p * 10) * Math.min(1, (1 - p) * 8) * (0.55 + 0.45 * Math.abs(Math.sin(2 * Math.PI * 5 * tt)));
      lp += (rnd() - lp) * 0.08;
      out[i] = lp * env * 2.4;
    }
    return out;
  },
  swell(dur = 0.9) {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const tt = i / SR, p = i / n;
      const env = Math.sin(Math.PI * p) ** 2;
      out[i] = (Math.sin(2 * Math.PI * 220 * tt) * 0.5 + Math.sin(2 * Math.PI * 330 * tt) * 0.3 + Math.sin(2 * Math.PI * 440 * tt) * 0.15) * env * 0.5;
    }
    return out;
  },
  chime(dur = 1.4) {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    const notes = [[0, 659.25], [0.12, 987.77], [0.24, 1318.5]];
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      let v = 0;
      for (const [st, f] of notes) {
        if (tt < st) continue;
        const u = tt - st;
        v += (Math.sin(2 * Math.PI * f * u) + 0.25 * Math.sin(2 * Math.PI * f * 2 * u)) * Math.exp(-u * 3.2) * (1 - Math.exp(-u * 800));
      }
      out[i] = v * 0.4;
    }
    return out;
  }
};

const GAIN = { whoosh: 0.22, click: 0.35, pop: 0.42, tick: 0.3, scribble: 0.16, erase: 0.2, swell: 0.22, chime: 0.34 };

function buildWav(cues, durationSec) {
  const n = Math.round(durationSec * SR);
  const mix = new Float32Array(n);
  cues.forEach((c, k) => {
    const g = gen[c.type];
    if (!g) return;
    const s = c.dur !== undefined ? g(c.dur, 10 + k) : g(undefined, 10 + k);
    addInto(mix, c.t, s, (GAIN[c.type] || 0.3) * (c.vol !== undefined ? c.vol : 1));
  });
  // 끝 0.3초 페이드아웃 + 소프트 클리핑
  for (let i = 0; i < n; i++) {
    const tail = Math.min(1, (n - i) / (0.3 * SR));
    mix[i] = Math.tanh(mix[i] * 1.2) * tail;
  }
  const ch = 2, bytes = n * ch * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + bytes, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, mix[i])) * 32767 | 0;
    buf.writeInt16LE(v, 44 + i * 4);
    buf.writeInt16LE(v, 44 + i * 4 + 2);
  }
  return buf;
}

module.exports = { buildWav };
