import { build } from 'esbuild';
import { readFile, writeFile, readdir } from 'node:fs/promises';
const result = await build({ entryPoints: ['src/server.mjs'], outfile: 'dist/server.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', packages: 'bundle', legalComments: 'eof', metafile: true });
const packages = new Set(Object.keys(result.metafile.inputs).filter(p => p.startsWith('node_modules/')).map(p => p.split('/').slice(1, p.split('/')[1].startsWith('@') ? 3 : 2).join('/')));
const notices = ['# Third-party notices\n\nThe bundled runtime includes the following dependencies and their license notices.\n'];
for (const name of [...packages].sort()) {
  const root = 'node_modules/' + name;
  const pkg = JSON.parse(await readFile(root + '/package.json', 'utf8'));
  const files = (await readdir(root)).filter(f => /^(license|copying|notice)(\.|$)/i.test(f));
  if (!files.length) throw new Error('Missing license notice for ' + name);
  notices.push(`\n## ${name} ${pkg.version}\n`);
  for (const file of files) notices.push('\n```text\n' + (await readFile(root + '/' + file, 'utf8')).trim() + '\n```\n');
}
await writeFile('THIRD_PARTY_NOTICES.md', notices.join(''));
