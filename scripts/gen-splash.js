/**
 * Generate assets/splash-icon.png: the app icon (rounded) centered on a
 * transparent 1024x1024 canvas. The native splash renders it with
 * resizeMode:contain on the #121212 background from app.json, giving a
 * centered app-mark splash instead of the old Expo placeholder grid.
 *
 * Usage: node scripts/gen-splash.js
 */
const sharp = require('sharp');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'assets', 'icon.png');
const OUT = path.join(ROOT, 'assets', 'splash-icon.png');

const CANVAS = 1024;
const LOGO = 400; // logo size within the canvas -> modest centered mark on screen
const RADIUS = 88; // rounded corners (~app-icon curvature)

(async () => {
  const rounded = await sharp(ICON)
    .resize(LOGO, LOGO)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${LOGO}" height="${LOGO}"><rect x="0" y="0" width="${LOGO}" height="${LOGO}" rx="${RADIUS}" ry="${RADIUS}"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: rounded, left: Math.round((CANVAS - LOGO) / 2), top: Math.round((CANVAS - LOGO) / 2) }])
    .png()
    .toFile(OUT);

  console.log('wrote', OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
