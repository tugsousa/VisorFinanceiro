// Compares two files written by "VisorFinanceiro.exe tax-snapshot", ignoring the order of the items in
// each list (the order of the option sales changes between runs). Exits with 1 when a value changed.
// Usage: node scripts/compare-tax-snapshot.js before.json after.json
const fs = require('fs');
const [a, b] = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));

const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon).map(x => JSON.stringify(x)).sort().map(s => JSON.parse(s));
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])]));
  return v;
};

let differences = 0;
const byId = (s) => Object.fromEntries(s.map(p => [p.portfolio_id, p]));
const A = byId(a), B = byId(b);
for (const id of new Set([...Object.keys(A), ...Object.keys(B)])) {
  const pa = A[id], pb = B[id];
  if (!pa || !pb) { console.log(`Carteira ${id}: só existe num dos ficheiros`); differences++; continue; }
  for (const key of Object.keys(pa).filter(k => !k.startsWith('portfolio_'))) {
    const ca = canon(pa[key]), cb = canon(pb[key]);
    const sa = (Array.isArray(ca) ? ca : [ca]).map(x => JSON.stringify(x));
    const sb = (Array.isArray(cb) ? cb : [cb]).map(x => JSON.stringify(x));
    const onlyA = sa.filter(x => !sb.includes(x)), onlyB = sb.filter(x => !sa.includes(x));
    if (onlyA.length || onlyB.length || sa.length !== sb.length) {
      differences++;
      console.log(`\n${pa.portfolio_name} / ${key}: ${sa.length} antes, ${sb.length} depois`);
      onlyA.slice(0, 5).forEach(x => console.log('  - antes: ', x));
      onlyB.slice(0, 5).forEach(x => console.log('  + depois:', x));
    } else {
      console.log(`${pa.portfolio_name} / ${key}: igual (${sa.length})`);
    }
  }
}
console.log(differences ? `\n${differences} secção(ões) diferente(s).` : '\nNenhum valor da página do IRS mudou.');
process.exit(differences ? 1 : 0);
