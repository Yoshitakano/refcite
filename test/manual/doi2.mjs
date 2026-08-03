import { fetchByDoi } from '../src/import/crossref.js';
import { normalizeAll, validateItem } from '../src/citation/index.js';
for (const d of ['10.7129/jject.10.169','10.1086/227049']) {
  const r = await fetchByDoi(d);
  const it = normalizeAll([r.item])[0];
  console.log(`[${d}]`);
  console.log('  title:', it.title);
  console.log('  author:', JSON.stringify(it.author ?? null));
  console.log('  language:', it.language, '| annote:', it.annote ?? '(なし)');
  const issues = validateItem(it);
  console.log('  警告:', issues.length ? issues.map(i=>`${i.level}/${i.field}`).join(', ') : 'なし');
}
