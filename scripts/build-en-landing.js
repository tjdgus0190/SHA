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
head = head.replace(/<title>[^<]*<\/title>/, "<title>SHA Paint — The same-value palette, right by your pen</title>");
head = head.replace(/<meta name="description" content="[^"]*" \/>/,
  '<meta name="description" content="A Photoshop color palette that pops up right next to your pen. It keeps the lightness of your current color locked, so you only choose hue and saturation. For Windows 10/11." />');
head = head.replace(/<meta property="og:title" content="[^"]*" \/>/,
  '<meta property="og:title" content="SHA Paint — The same-value palette, right by your pen" />');
head = head.replace(/<meta property="og:description" content="[^"]*" \/>/,
  '<meta property="og:description" content="Stop going back and forth to the color panel. Pick colors that keep the same value, right next to your pen." />');

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
      <h1>Keep your hand on the canvas.<br>Keep your values steady.</h1>
      <p class="sub">
        Tired of reaching all the way to the color panel every time you switch colors?
        SHA Paint pops up right next to your pen tip. It keeps the lightness of your
        current color locked and lets you choose only the hue and saturation that fit.
      </p>
      <div class="cta-row">
        <a href="${BUY}" class="btn-primary gumroad-button">Download for $10</a>
        <span class="price-note">One-time payment · Windows + Photoshop</span>
      </div>
    </div>
    <div class="hero-visual">
      <div class="field-demo"><div class="cursor-dot"></div></div>
      <div class="lightness-track-demo"><div class="handle"></div></div>
      <p class="hero-visual-caption">The field shows only colors that can exist at your current lightness</p>
    </div>
  </div>
</header>

<section class="divider-top demo-section">
  <div class="wrap">
    <h2 class="eyebrow-free-title">One color change, two very different trips</h2>
    <p class="section-lead">
      This is the moment you switch colors in the middle of a drawing. It's a simplified
      mock-up rather than a screen capture, but the difference in how far your hand
      travels is accurate.
    </p>

    <div class="demo-grid">
      <div class="demo-panel is-before">
        <p class="demo-label">Before</p>
        <div class="demo-stage">
          <div class="far-panel">
            <div class="far-swatch-row">
              <div class="far-swatch" style="background:#8d1d4d"></div>
              <div class="far-swatch" style="background:#3c520e"></div>
              <div class="far-swatch" style="background:#1a5166"></div>
              <div class="far-swatch" style="background:#821d7c"></div>
            </div>
          </div>
          <div class="demo-cursor"></div>
        </div>
        <p class="demo-caption">Every color change is a round trip to a panel off the canvas.</p>
      </div>

      <div class="demo-panel is-after">
        <p class="demo-label">SHA Paint</p>
        <div class="demo-stage">
          <div class="near-popup"><div class="popup-field"></div></div>
          <div class="demo-cursor"></div>
        </div>
        <p class="demo-caption">It opens where your pen is, and you pick your color right there.</p>
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
        <h3>Your values drift a little more with every shadow</h3>
        <p class="answer">
          Rotate the hue in a standard color picker and the lightness shifts along with it.
          Matching by eye, your shadow and highlight values slowly drift apart, and the
          finished piece loses depth. <b>SHA Paint locks your current lightness and moves
          only hue and saturation</b>, so your values have nothing to drift from.
        </p>
      </div>
      <div class="pain-item">
        <h3>You leave the drawing just to pick a color</h3>
        <p class="answer">
          When you're zoomed in on details, that quick trip up to the color panel breaks
          your focus more than you'd expect. <b>The popup opens right by your cursor</b>,
          so you can change colors without leaving your current view or zoom level.
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
        <div><h4>Your choice of trigger</h4><p>Middle-click is the default, but you can switch to any key or mouse button.</p></div>
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
    <p>SHA Paint — A Photoshop palette for Windows</p>
    ${CONTACT ? `<p>Contact: ${CONTACT}</p>` : ""}
  </div>
</footer>

<script src="https://gumroad.com/js/gumroad.js"></script>

</body>
</html>
`;

fs.mkdirSync(path.join(SITE, "en"), { recursive: true });
fs.writeFileSync(path.join(SITE, "en", "index.html"), head + body, "utf8");
console.log("-> site/en/index.html");
