import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain } from '../src/citation/engine.js';
import * as F from '../src/citation/fixtures.js';

const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');

export const styles = {
  apa: read('styles/apa.csl'),
  sist02: read('styles/sist02.csl'),
};
export const locales = {
  'ja-JP': read('locales/locales-ja-JP.xml'),
  'en-US': read('locales/locales-en-US.xml'),
};
export const engine = new CitationEngine({ styles, locales });

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const style of ['sist02', 'apa']) {
    console.log('='.repeat(72));
    console.log(`  ${style.toUpperCase()}`);
    console.log('='.repeat(72));
    for (const item of F.ALL) {
      try {
        console.log(`  [${item.id}]`);
        console.log(`     ${htmlToPlain(engine.renderOne(item, style))}`);
      } catch (e) {
        console.log(`  [${item.id}] ERROR: ${e.message}`);
      }
    }
    console.log();
  }
}
