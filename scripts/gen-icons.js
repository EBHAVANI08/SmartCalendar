const fs = require('fs');
const sharp = require('sharp');

const svg192 = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#0d9488"/>
    </linearGradient>
  </defs>
  <rect width="192" height="192" rx="40" fill="url(#g)"/>
  <path d="M56 48h80a12 12 0 0 1 12 12v72a12 12 0 0 1-12 12H56a12 12 0 0 1-12-12V60a12 12 0 0 1 12-12zm0 28v56h80V76H56zm12-40v16m56-16v16" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="96" cy="104" r="10" fill="#ffffff"/>
</svg>`;

const svg512 = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#0d9488"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#g)"/>
  <path d="M140 120h232a32 32 0 0 1 32 32v200a32 32 0 0 1-32 32H140a32 32 0 0 1-32-32V152a32 32 0 0 1 32-32zm0 80v152h232V200H140zm36-110v44m160-44v44" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="256" cy="276" r="26" fill="#ffffff"/>
</svg>`;

async function run() {
  if (!fs.existsSync('public')) fs.mkdirSync('public', { recursive: true });
  await sharp(Buffer.from(svg192)).png().toFile('public/icon-192.png');
  await sharp(Buffer.from(svg512)).png().toFile('public/icon-512.png');
  console.log('Icons generated successfully.');
}
run();
