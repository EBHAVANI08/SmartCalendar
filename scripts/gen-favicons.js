const fs = require('fs');
const sharp = require('sharp');

async function generateFavicons() {
  const svg = fs.readFileSync('public/favicon.svg');
  
  // 32x32 for favicon.ico
  await sharp(svg).resize(32, 32).png().toFile('public/favicon.ico');
  
  // 180x180 for Apple touch icon
  await sharp(svg).resize(180, 180).png().toFile('public/apple-touch-icon.png');
  
  // 192x192 icon.png
  await sharp(svg).resize(192, 192).png().toFile('public/icon.png');
  
  console.log('Favicons generated successfully.');
}

generateFavicons();
