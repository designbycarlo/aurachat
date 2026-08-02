const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const svgPath = path.join(__dirname, 'public', 'favicon.svg');
const svgBuffer = fs.readFileSync(svgPath);

const sizes = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

(async () => {
  for (const { name, size } of sizes) {
    const outPath = path.join(__dirname, 'public', name);
    await sharp(svgBuffer, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`Generated ${name} (${size}x${size})`);
  }
  console.log('All PNG icons generated successfully.');
})();