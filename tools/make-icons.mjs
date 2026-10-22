import sharp from 'sharp';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#000"/>
<path d="M14 50 V28 a10 10 0 0 1 10 -10 H48" fill="none" stroke="#4fd1ff" stroke-width="9" stroke-linecap="round"/>
<path d="M48 9 v18" stroke="#ffb23d" stroke-width="6" stroke-linecap="round"/>
<circle cx="14" cy="53" r="5" fill="#3dff8a"/></svg>`;
await sharp(Buffer.from(svg)).resize(64, 64).png().toFile('public/favicon.png');
await sharp(Buffer.from(svg)).resize(192, 192).png().toFile('public/icon-192.png');
