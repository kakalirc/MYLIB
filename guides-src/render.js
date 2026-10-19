// Prints an HTML file to an A5 PDF with headless Chromium.
// Usage: node render.js in.html out.pdf
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const [inFile, outFile] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(inFile), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: outFile, format: 'A5', printBackground: true, preferCSSPageSize: true });
  await browser.close();
})();
