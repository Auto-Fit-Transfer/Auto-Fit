// Builds src/features/exercise/exerciseTips.json from the AI owner's "운동별 3줄 안내" text file:
//   node scripts/build-exercise-tips.mjs "<path to AutoFit__전체 운동.txt>"
// Only the basic drafts go in. Entries marked [원본 동작 확인 필요], or whose lines still point at the
// GIF or the original, are left out: the app never says a move it cannot describe.
import { readFileSync, writeFileSync } from 'node:fs';

const source = process.argv[2];
if (!source) throw new Error('give the path of the guide text file');
const lines = readFileSync(source, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
const tips = {};
let skipped = 0;
for (let i = 0; i < lines.length; i += 1) {
  if (!/^\[\d{4}\] /.test(lines[i])) continue;
  const key = /^식별키: (ex_[0-9a-f]+)/.exec(lines[i + 1] ?? '')?.[1];
  const parts = ['1. 운동 방법: ', '2. 주의사항: ', '3. 집중 포인트: '].map((head, n) => {
    const line = lines[i + 2 + n] ?? '';
    return line.startsWith(head) ? line.slice(head.length).trim().replace(/;\s*/g, '. ') : '';
  });
  if (!key || parts.some((part) => !part)) throw new Error(`unexpected entry at line ${i + 1}`);
  if (lines[i].includes('[원본 동작 확인 필요]') || parts.some((part) => /GIF|원본/.test(part))) { skipped += 1; continue; }
  tips[key] = parts;
}
writeFileSync(new URL('../src/features/exercise/exerciseTips.json', import.meta.url), `${JSON.stringify(tips)}\n`);
console.log(`kept ${Object.keys(tips).length}, left out ${skipped}`);
