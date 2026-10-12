// Exports the in-game Handbook (web/handbook.js) to docs/GUIDE.md so the online docs never drift
// from the manual in the game. Run after changing the Handbook:  node tools/export-handbook.mjs
import fs from 'fs';
import { buildPages } from '../web/handbook.js';

const bytes = fs.readFileSync(new URL('../web/highrise.wasm', import.meta.url));
const w = (await WebAssembly.instantiate(bytes, {})).instance.exports;
w.init(1);

const K = { LOBBY: 1, OFFICE: 2, CONDO: 3, HOTEL: 4, CAFE: 5, SHOP: 6, PARKING: 7, ELEVATOR: 10, STAIRS: 11 };
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const ACH = [
  ['Grand Opening', 'Build your first lobby.'], ['Going Up', 'Build an elevator.'], ['Open for Business', 'Welcome your first tenant.'],
  ['Rising Star', 'Reach a 2★ rating.'], ['Three-Star Address', 'Reach a 3★ rating.'], ['Skyline Fixture', 'Reach a 4★ rating.'],
  ['Landmark', 'Reach a 5★ rating.'], ['Food Court', 'Run 5 cafés at once.'], ['Tycoon', 'Have $10,000,000 in the bank.'],
];
const pages = buildPages({
  w, K, money, platform: { mac: false, native: true },
  achievements: () => ACH.map(([name, desc]) => ({ name, desc, done: false })),
});
const anchor = id => pages.find(p => p.id === id).title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

const inline = h => h
  .replace(/<a data-page="([^"]+)">(.*?)<\/a>/g, (_, id, t) => `[${t}](#${anchor(id)})`)
  .replace(/<\/?b>/g, '**').replace(/<\/?i>/g, '*')
  .replace(/<code>(.*?)<\/code>/g, '`$1`')
  .replace(/<kbd[^>]*>(.*?)<\/kbd>/g, '`$1`')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function md(html) {
  return html
    .replace(/<div class="hb-pic"[^>]*><\/div>/g, '')
    .replace(/<table class="hb-tbl">(.*?)<\/table>/gs, (_, t) => {
      const rows = [...t.matchAll(/<tr>(.*?)<\/tr>/gs)].map(r => [...r[1].matchAll(/<t[hd]>(.*?)<\/t[hd]>/gs)].map(c => inline(c[1]).replace(/\|/g, '\\|')));
      return '\n\n' + [rows[0], rows[0].map(() => '---'), ...rows.slice(1)].map(r => `| ${r.join(' | ')} |`).join('\n') + '\n\n';
    })
    .replace(/<table class="hb-kv">(.*?)<\/table>/gs, (_, t) =>
      '\n\n' + [...t.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/gs)].map(r => `- **${inline(r[1])}:** ${inline(r[2])}`).join('\n') + '\n\n')
    .replace(/<div class="hb-ach">(.*?)<\/div>\s*$/s, (_, t) =>
      '\n\n' + [...t.matchAll(/<b>(.*?)<\/b><span>(.*?)<\/span>/g)].map(r => `- **${inline(r[1]).replace(/^\W+\s*/, '')}**: ${inline(r[2])}`).join('\n') + '\n\n')
    .replace(/<div class="hb-note (tip|warn)">(.*?)<\/div>/gs, (_, k, t) => `\n\n> ${k === 'warn' ? '⚠️' : '💡'} ${inline(t)}\n\n`)
    .replace(/<h3>(.*?)<\/h3>/g, (_, t) => `\n\n### ${inline(t)}\n\n`)
    .replace(/<p[^>]*>(.*?)<\/p>/gs, (_, t) => `\n\n${inline(t)}\n\n`)
    .replace(/<(ul|ol)[^>]*>(.*?)<\/\1>/gs, (_, tag, t) =>
      '\n\n' + [...t.matchAll(/<li>(.*?)<\/li>/gs)].map((m, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${inline(m[1])}`).join('\n') + '\n\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

let out = `# Highrise Player Guide

<!-- Generated from web/handbook.js by tools/export-handbook.mjs. Edit the Handbook, not this file. -->

This is the same Handbook that's built into the game (press **F1**, or **R3** on a controller).

`;
let group = '';
const toc = [];
let body = '';
for (const p of pages) {
  if (p.group !== group) { group = p.group; body += `\n## ${group}\n\n`; toc.push(`- **${group}**`); }
  toc.push(`  - [${p.title}](#${anchor(p.id)})`);
  body += `### ${p.title}\n\n${md(p.html()).replace(/^### /gm, '#### ')}\n\n`;
}
out += toc.join('\n') + '\n' + body;
fs.mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
// the docs serve every platform: show the Mac shortcuts next to the Windows/Linux ones
out = out.replaceAll('`Ctrl` `S`', '`Ctrl` `S` (`⌘` `S` on Mac)').replaceAll('| `F11` |', '| `F11` (`⌃` `⌘` `F` on Mac) |');
fs.writeFileSync(new URL('../docs/GUIDE.md', import.meta.url), out.replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n'));
console.log(`Wrote docs/GUIDE.md (${pages.length} pages)`);
