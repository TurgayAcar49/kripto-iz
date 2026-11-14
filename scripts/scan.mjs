// Command-line scan: node scripts/scan.mjs <file.mbox> [output.json]
// The output JSON can be loaded on the site with "Yedek yükle".
import fs from 'node:fs';
import { splitMbox, createScanner } from '../js/mail.js';

const [file, out] = process.argv.slice(2);
if (!file) {
  console.error('Kullanım: node scripts/scan.mjs <dosya.mbox> [cikti.json]');
  process.exit(1);
}

const size = fs.statSync(file).size;
let read = 0;
async function* chunks() {
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 1 << 20 })) {
    read += chunk.length;
    yield new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length);
  }
}

const started = Date.now();
const scanner = createScanner();
let lastLog = 0;
for await (const raw of splitMbox(chunks())) {
  scanner.add(raw);
  if (Date.now() - lastLog > 5000) {
    lastLog = Date.now();
    console.log(`%${((read / size) * 100).toFixed(1)} - ${scanner.total} mail, ${scanner.matched} kripto`);
  }
}

const result = scanner.result();
const byType = {};
for (const p of result.projects) byType[p.type] = (byType[p.type] || 0) + 1;
console.log(`Bitti (${Math.round((Date.now() - started) / 1000)} sn): ${result.total} mail, `
  + `${result.matched} kripto maili, ${result.projects.length} proje`);
console.log('Türlere göre:', byType);

if (out) {
  const backup = {
    projects: result.projects,
    wallets: [],
    hidden: [],
    lastScan: { files: [file], at: new Date().toISOString(), total: result.total, matched: result.matched },
  };
  fs.writeFileSync(out, JSON.stringify(backup));
  console.log(`Kaydedildi: ${out}`);
}
