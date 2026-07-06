/**
 * Generate Google Play listing graphics from the existing app icon.
 * Outputs to Notes/play-store/:
 *   - play-icon-512.png            (512x512 store icon)
 *   - play-feature-graphic-1024x500.png
 *
 * Usage: node scripts/make-play-graphics.js
 */
const path = require('path');
// Full `jimp` (pure JS) for its bundled fonts. Install once with:
//   npm install --no-save jimp@0.22.12
const Jimp = require('jimp');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'Notes', 'play-store');
const ICON_SRC = path.join(ROOT, 'assets', 'icon.png');

const BG = 0x0b0c10ff; // Midnight Blue background
const GLOW = { r: 0x1a, g: 0x22, b: 0x36 }; // top radial glow color

async function main() {
  // 1) 512x512 store icon
  const icon = await Jimp.read(ICON_SRC);
  await icon.clone().resize(512, 512).writeAsync(path.join(OUT, 'play-icon-512.png'));

  // 2) 1024x500 feature graphic
  const W = 1024;
  const H = 500;
  const fg = new Jimp(W, H, BG);

  // Subtle top-center radial glow toward #1A2236.
  const cx = W * 0.32;
  const cy = -40;
  const maxD = 620;
  fg.scan(0, 0, W, H, function (x, y, idx) {
    const d = Math.hypot(x - cx, y - cy);
    const t = Math.max(0, 1 - d / maxD);
    const k = t * t * 0.9;
    this.bitmap.data[idx] = Math.round(0x0b + (GLOW.r - 0x0b) * k);
    this.bitmap.data[idx + 1] = Math.round(0x0c + (GLOW.g - 0x0c) * k);
    this.bitmap.data[idx + 2] = Math.round(0x10 + (GLOW.b - 0x10) * k);
    this.bitmap.data[idx + 3] = 255;
  });

  // App mark (rounded-square icon) on the left, vertically centered.
  const markSize = 232;
  const mark = (await Jimp.read(ICON_SRC)).resize(markSize, markSize);
  const markX = 96;
  const markY = Math.round((H - markSize) / 2);
  fg.composite(mark, markX, markY);

  // Text block to the right of the mark.
  const titleFont = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  const tagFont = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const textX = markX + markSize + 56;

  fg.print(titleFont, textX, 185, 'AccountaBuild');
  fg.print(tagFont, textX + 4, 285, 'Fitness is a team sport.');

  // Blue accent underline under the title.
  const accentY = 268;
  fg.scan(textX + 4, accentY, 260, 5, function (x, y, idx) {
    this.bitmap.data[idx] = 0x3e;
    this.bitmap.data[idx + 1] = 0x8b;
    this.bitmap.data[idx + 2] = 0xff;
    this.bitmap.data[idx + 3] = 255;
  });

  await fg.writeAsync(path.join(OUT, 'play-feature-graphic-1024x500.png'));

  console.log('✅ Wrote play-icon-512.png and play-feature-graphic-1024x500.png to Notes/play-store/');
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});
