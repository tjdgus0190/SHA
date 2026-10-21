#!/usr/bin/env node
// site/index.html(한국어)의 <head>/스타일을 그대로 쓰고 본문만 영어로 바꿔 site/en/index.html을 만든다.
// 한국어 페이지 디자인을 고친 뒤 다시 실행하면 영문 페이지에도 반영된다.
//   node scripts/build-en-landing.js
const fs = require("fs");
const path = require("path");
const SITE = path.join(__dirname, "..", "site");

const ko = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const BUY = "https://tjdgus76.gumroad.com/l/vutuls?wanted=true";
const CONTACT = (ko.match(/<p>문의:\s*([^<]+)<\/p>/) || [])[1] || "";

let head = ko.slice(0, ko.indexOf("<body>"));
function rep(o, n) {
  if (!head.includes(o)) throw new Error("head에서 못 찾음: " + o.slice(0, 60));
  head = head.replace(o, n);
}
rep('<html lang="ko">', '<html lang="en">');
head = head.replace(/<title>[^<]*<\/title>/, "<title>SHA Paint — Lock the value, change only the color</title>");
head = head.replace(/<meta name="description" content="[^"]*" \/>/,
  '<meta name="description" content="A same-value color palette for Photoshop. It locks the lightness (L*) of your current color and shows only hues and chroma at that value, so recoloring never breaks your shading or form. For Windows 10/11." />');
head = head.replace(/<meta property="og:title" content="[^"]*" \/>/,
  '<meta property="og:title" content="SHA Paint — Lock the value, change only the color" />');
head = head.replace(/<meta property="og:description" content="[^"]*" \/>/,
  '<meta property="og:description" content="Colors that fit, at the exact same value as your current color. Recolor freely and your shading and form stay intact." />');

const body = `<body>

<div class="hue-strip"></div>

<nav>
  <div class="wrap">
    <span class="wordmark">SHA Paint</span>
    <div class="nav-right">
      <a href="../" class="lang-link" hreflang="ko" lang="ko">한국어</a>
      <a href="${BUY}" class="nav-cta">Get it for $10</a>
    </div>
  </div>
</nav>

<header class="hero">
  <div class="wrap hero-grid">
    <div>
      <h1>Lock the value.<br>Change only the color.</h1>
      <p class="sub">
        SHA Paint locks the lightness (L*) of your current color and shows only the hues
        and chroma that fit at that same value. Recolor as many times as you like: your
        value steps stay put, so your form never goes flat. And the palette pops up right
        next to your pen.
      </p>
      <div class="cta-row">
        <a href="${BUY}" class="btn-primary gumroad-button">Download for $10</a>
        <span class="price-note">One-time payment · Windows + Photoshop</span>
      </div>
    </div>
    <div class="hero-visual">
      <div class="sphere-pair">
        <figure><svg class="sph cycle" viewBox="0 0 200 190" aria-hidden="true"><defs><clipPath id="hc1"><circle cx="100" cy="88" r="70"/></clipPath></defs><ellipse class="ground" cx="118" cy="160" rx="66" ry="14"/><g clip-path="url(#hc1)"><rect class="t-shadow" x="30" y="18" width="140" height="140"/><circle class="t-base" cx="86" cy="74" r="68.6"/><ellipse class="t-light" cx="73" cy="60" rx="25" ry="21" transform="rotate(-34 73 60)"/></g><circle class="outline" cx="100" cy="88" r="70"/></svg><figcaption>Color</figcaption></figure>
        <figure><svg class="sph gray" viewBox="0 0 200 190" aria-hidden="true"><defs><clipPath id="hc2"><circle cx="100" cy="88" r="70"/></clipPath></defs><ellipse class="ground" cx="118" cy="160" rx="66" ry="14"/><g clip-path="url(#hc2)"><rect class="t-shadow" x="30" y="18" width="140" height="140"/><circle class="t-base" cx="86" cy="74" r="68.6"/><ellipse class="t-light" cx="73" cy="60" rx="25" ry="21" transform="rotate(-34 73 60)"/></g><circle class="outline" cx="100" cy="88" r="70"/></svg><figcaption>Grayscale</figcaption></figure>
      </div>
      <div class="tone-row">
        <div><b>L* 85</b>Light</div>
        <div><b>L* 65</b>Base</div>
        <div><b>L* 40</b>Shadow</div>
      </div>
      <p class="hero-visual-caption">The colors change, the grayscale doesn't — because the value is locked</p>
    </div>
  </div>
</header>

<section class="divider-top video-section" id="demo">
  <div class="wrap">
    <h2 class="eyebrow-free-title">More color on a one-tone painting, nothing out of place</h2>
    <p class="section-lead">We added violet shadows, a warm flush, golden highlights and teal bounce light to a face painted in a single brown tone. Colors from a normal picker each have their own value and look pasted on; adding only color at each spot's own value blends right into the painting.</p>

    <div class="video-frame">
      <video id="demo-video" muted loop playsinline preload="metadata" poster="../media/sha-paint-portrait-en-poster.jpg" aria-label="Comparison of adding colors at the same value versus with a normal picker on a one-tone portrait">
        <source src="../media/sha-paint-portrait-en.mp4" type="video/mp4">
      </video>
    </div>
    <ol class="chapters" id="demo-chapters">
      <li><button type="button" data-t="0"><span class="n">1</span>A flat, one-tone face<span class="bar"></span></button></li>
      <li><button type="button" data-t="2.6"><span class="n">2</span>Normal picker: looks pasted<span class="bar"></span></button></li>
      <li><button type="button" data-t="6.0"><span class="n">3</span>Add color at the same value<span class="bar"></span></button></li>
      <li><button type="button" data-t="10.45"><span class="n">4</span>Grayscale matches the original<span class="bar"></span></button></li>
    </ol>
    <p class="video-note">A simulation made with SHA Paint's lightness (L*) math. The app itself is a palette that lets you pick colors at the same value; it doesn't paint colors onto your image automatically. Click a step to jump to it.</p>
  </div>
</section>

<section class="divider-top demo-section">
  <div class="wrap">
    <h2 class="eyebrow-free-title">Change the color, then look at it in grayscale</h2>
    <p class="section-lead">
      Only the base color of the same sphere changes here. The grayscale sphere keeps just
      the lightness (L*) of each color. The values are computed with the same color math as
      the SHA Paint app.
    </p>

    <div class="demo-grid">
      <div class="demo-panel is-before">
        <p class="demo-label">Normal color picker</p>
        <div class="sphere-pair">
          <figure><svg class="sph cycle" viewBox="0 0 200 190" aria-hidden="true"><defs><clipPath id="dc1"><circle cx="100" cy="88" r="70"/></clipPath></defs><ellipse class="ground" cx="118" cy="160" rx="66" ry="14"/><g clip-path="url(#dc1)"><rect class="t-shadow" x="30" y="18" width="140" height="140"/><circle class="t-base" cx="86" cy="74" r="68.6"/><ellipse class="t-light" cx="73" cy="60" rx="25" ry="21" transform="rotate(-34 73 60)"/></g><circle class="outline" cx="100" cy="88" r="70"/></svg><figcaption>Color</figcaption></figure>
          <figure><svg class="sph gray cycle" viewBox="0 0 200 190" aria-hidden="true"><defs><clipPath id="dc2"><circle cx="100" cy="88" r="70"/></clipPath></defs><ellipse class="ground" cx="118" cy="160" rx="66" ry="14"/><g clip-path="url(#dc2)"><rect class="t-shadow" x="30" y="18" width="140" height="140"/><circle class="t-base" cx="86" cy="74" r="68.6"/><ellipse class="t-light" cx="73" cy="60" rx="25" ry="21" transform="rotate(-34 73 60)"/></g><circle class="outline" cx="100" cy="88" r="70"/></svg><figcaption>Grayscale</figcaption></figure>
        </div>
        <p class="readout">Base L* 65 → 87 → 36 → 80</p>
        <p class="demo-caption">Rotate the hue and the value moves with it. The base ends up brighter than the light or darker than the shadow, and the form falls apart.</p>
      </div>

      <div class="demo-panel is-after">
        <p class="demo-label">SHA Paint</p>
        <div class="sphere-pair">
          <figure><svg class="sph cycle" viewBox="0 0 200 190" aria-hidden="true"><defs><clipPath id="dc3"><circle cx="100" cy="88" r="70"/></clipPath></defs><ellipse class="ground" cx="118" cy="160" rx="66" ry="14"/><g clip-path="url(#dc3)"><rect class="t-shadow" x="30" y="18" width="140" height="140"/><circle class="t-base" cx="86" cy="74" r="68.6"/><ellipse class="t-light" cx="73" cy="60" rx="25" ry="21" transform="rotate(-34 73 60)"/></g><circle class="outline" cx="100" cy="88" r="70"/></svg><figcaption>Color</figcaption></figure>
          <figure><svg class="sph gray" viewBox="0 0 200 190" aria-hidden="true"><defs><clipPath id="dc4"><circle cx="100" cy="88" r="70"/></clipPath></defs><ellipse class="ground" cx="118" cy="160" rx="66" ry="14"/><g clip-path="url(#dc4)"><rect class="t-shadow" x="30" y="18" width="140" height="140"/><circle class="t-base" cx="86" cy="74" r="68.6"/><ellipse class="t-light" cx="73" cy="60" rx="25" ry="21" transform="rotate(-34 73 60)"/></g><circle class="outline" cx="100" cy="88" r="70"/></svg><figcaption>Grayscale</figcaption></figure>
        </div>
        <p class="readout">Base locked at L* 65</p>
        <p class="demo-caption">Only the color changes at the same value, so the light, base and shadow steps stay where they were and the form keeps its depth.</p>
      </div>
    </div>
  </div>
</section>

<section class="divider-top">
  <div class="wrap">
    <h2 class="eyebrow-free-title">Problems that keep coming back when you color</h2>
    <p class="section-lead">
      Whether you've been drawing for ten years or ten days, color tends to trip
      everyone up in the same places.
    </p>

    <div class="pain-list">
      <div class="pain-item">
        <h3>Every color change throws your values off and flattens the form</h3>
        <p class="answer">
          Rotate the hue in a standard color picker and the lightness shifts along with it.
          Matching by eye, your shadow and highlight values slowly drift apart, and the
          finished piece loses depth. <b>SHA Paint locks your current lightness and moves
          only hue and saturation</b>, so your values have nothing to drift from.
        </p>
      </div>
      <div class="pain-item">
        <h3>Finding a color that fits your current one takes forever</h3>
        <p class="answer">
          Want some violet in a shadow or a touch of yellow in the light? In a normal picker
          you rotate the hue, then fix the lightness, then repeat. <b>SHA Paint's field only
          shows colors at the same value as your current color</b>, so just drag around it
          and you get colors that fit, ready to use.
        </p>
      </div>
      <div class="pain-item">
        <h3>You leave the drawing just to pick a color</h3>
        <p class="answer">
          That quick trip up to the color panel breaks your focus more than you'd expect.
          <b>The palette opens right by your cursor</b>, so you can change colors without
          leaving your current view or zoom level.
        </p>
      </div>
      <div class="pain-item">
        <h3>You keep hunting for colors you already chose</h3>
        <p class="answer">
          Skin tones and character colors get reused dozens of times in a single piece.
          Instead of sampling them again with the eyedropper, <b>your 8 most recent colors
          stay as swatches</b>, one click away.
        </p>
      </div>
    </div>
  </div>
</section>

<section class="divider-top">
  <div class="wrap">
    <h2 class="eyebrow-free-title">Three steps. That's it.</h2>
    <p class="section-lead">Almost nothing to set up, and nothing new to learn.</p>

    <div class="steps">
      <div class="step">
        <div class="step-swatch" style="background:#3099a4"></div>
        <div class="step-num">1</div>
        <h3>Start from a color</h3>
        <p>Your current brush color, or any color you sample with the eyedropper,
        becomes the palette's base.</p>
      </div>
      <div class="step">
        <div class="step-swatch" style="background:#e8a33d"></div>
        <div class="step-num">2</div>
        <h3>Its value stays locked</h3>
        <p>The lightness (L*) of that color stays fixed, while hue and saturation
        spread out around it.</p>
      </div>
      <div class="step">
        <div class="step-swatch" style="background:#887cf1"></div>
        <div class="step-num">3</div>
        <h3>Pick and paint</h3>
        <p>Drag in the field or click a recent color, and your brush color changes
        on the spot.</p>
      </div>
    </div>
  </div>
</section>

<section class="divider-top">
  <div class="wrap">
    <h2 class="eyebrow-free-title">Also included</h2>

    <div class="feature-list">
      <div class="feature-row">
        <div class="feature-dot" style="background:#f45351"></div>
        <div><h4>Full gamut view</h4><p>Switch between precise and free exploration with one button.</p></div>
      </div>
      <div class="feature-row">
        <div class="feature-dot" style="background:#2d9f59"></div>
        <div><h4>Color history that sticks</h4><p>Your recent colors are saved, so they're still there the next time you open the app.</p></div>
      </div>
      <div class="feature-row">
        <div class="feature-dot" style="background:#3890dd"></div>
        <div><h4>On/off without shortcuts</h4><p>Turn it on or off with one click in a small panel in the corner of your screen.</p></div>
      </div>
      <div class="feature-row">
        <div class="feature-dot" style="background:#ec36e1"></div>
        <div><h4>Pops up by your pen</h4><p>Middle-click (default) or any key or button you choose opens the palette right next to your cursor.</p></div>
      </div>
    </div>
  </div>
</section>

<section class="divider-top" id="pricing">
  <div class="wrap">
    <h2 class="eyebrow-free-title">Pricing</h2>
    <p class="section-lead">No subscription. You pay once.</p>

    <div class="pricing-block">
      <div>
        <div class="price-tag"><sup>$</sup>10</div>
        <p class="price-krw">One-time payment · USD</p>
        <p class="price-includes">
          Windows 10/11 · Photoshop 2023 (v24.0) or later · One installer
          (you'll enter your license key during setup)
        </p>
      </div>
      <a href="${BUY}" class="btn-primary gumroad-button">Download now</a>
    </div>
  </div>
</section>

<section class="divider-top">
  <div class="wrap">
    <h2 class="eyebrow-free-title">FAQ</h2>

    <div class="faq-list">
      <div class="faq-item">
        <h4>Does it work on Mac?</h4>
        <p>It's Windows-only for now.</p>
      </div>
      <div class="faq-item">
        <h4>Is the app in English?</h4>
        <p>The palette popup is almost entirely visual, but the installer, menus, and settings are currently in Korean. The FAQ entries below walk you through the screens you'll need.</p>
      </div>
      <div class="faq-item">
        <h4>Do I need to keep a panel open in Photoshop?</h4>
        <p>We recommend opening the SHA Paint panel once from Photoshop's Plugins menu and docking it in a corner. Color detection while drawing with a pen is most reliable when the panel is connected. If a color fails to apply, a notice appears at the top of the popup.</p>
      </div>
      <div class="faq-item">
        <h4>What about Clip Studio Paint or other apps?</h4>
        <p>They aren't supported right now. Most apps other than Photoshop don't offer an official way for outside programs to set colors, so we won't claim that it works.</p>
      </div>
      <div class="faq-item">
        <h4>Windows says "Windows protected your PC" when I run it</h4>
        <p>That's expected. SHA Paint is a new app that isn't code-signed yet, so Windows SmartScreen shows its standard warning for programs it hasn't seen before. Click "More info", then "Run anyway", to install. It isn't a virus or malware.</p>
      </div>
      <div class="faq-item">
        <h4>Where do I find my license key?</h4>
        <p>It's in the purchase confirmation email you get after checkout. Paste it into the license key screen during installation (the screen with a single text box).</p>
      </div>
      <div class="faq-item">
        <h4>What if something goes wrong after I buy?</h4>
        <p>Email us at the address below.</p>
      </div>
    </div>
  </div>
</section>

<div class="hue-strip dark"></div>

<section class="final-cta">
  <div class="wrap">
    <h2>Your next shadow, without the value guesswork</h2>
    <div class="cta-row">
      <a href="${BUY}" class="btn-primary gumroad-button">Get started for $10</a>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <p>SHA Paint — A value-locked Photoshop palette for Windows</p>
    ${CONTACT ? `<p>Contact: ${CONTACT}</p>` : ""}
  </div>
</footer>

<script>
// 데모 영상: 화면에 보일 때만 재생, 장면 목록 동기화, 장면 클릭 시 이동
(() => {
  const v = document.getElementById("demo-video");
  if (!v) return;
  const btns = [...document.querySelectorAll("#demo-chapters button")];
  const starts = btns.map((b) => +b.dataset.t);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let wanted = !reduce;
  if (reduce) v.controls = true;
  const sync = () => {
    const t = v.currentTime, d = v.duration || 0;
    let i = 0; while (i + 1 < starts.length && t >= starts[i + 1]) i++;
    const end = i + 1 < starts.length ? starts[i + 1] : d;
    btns.forEach((b, k) => {
      b.classList.toggle("on", k === i);
      b.querySelector(".bar").style.width = k === i && end > starts[i] ? ((t - starts[i]) / (end - starts[i]) * 100) + "%" : "0";
    });
  };
  v.addEventListener("timeupdate", sync);
  v.addEventListener("loadedmetadata", sync);
  btns.forEach((b) => b.addEventListener("click", () => { v.currentTime = +b.dataset.t + 0.05; wanted = true; v.play().catch(() => {}); sync(); }));
  v.addEventListener("click", () => { if (v.paused) { wanted = true; v.play().catch(() => {}); } else { wanted = false; v.pause(); } });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting && wanted) v.play().catch(() => {}); else if (!e.isIntersecting) v.pause();
    }), { threshold: 0.35 }).observe(v);
  } else if (wanted) v.play().catch(() => {});
  sync();
})();
</script>

<script src="https://gumroad.com/js/gumroad.js"></script>

</body>
</html>
`;

fs.mkdirSync(path.join(SITE, "en"), { recursive: true });
fs.writeFileSync(path.join(SITE, "en", "index.html"), head + body, "utf8");
console.log("-> site/en/index.html");
