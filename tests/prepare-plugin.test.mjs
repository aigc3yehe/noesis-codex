import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, access, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const source = fileURLToPath(new URL('../', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'noesis-visible-upload-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ['prepare-plugin.mjs','plugin-manifest.json','mcp-config.json','gitignore.txt','dist/server.cjs','skills/noesis-start/SKILL.md']) {
    const target = join(root, file); await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, file), target);
  }
  return root;
}
const run = root => spawnSync(process.execPath, [join(root, 'prepare-plugin.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
test('visible-only upload restores byte-identical standard files and can run twice', async t => {
  const root = await fixture(t);
  assert.equal(run(root).status, 0);
  for (const [visible, hidden] of [['plugin-manifest.json','.codex-plugin/plugin.json'],['mcp-config.json','.mcp.json'],['gitignore.txt','.gitignore']]) assert.deepEqual(await readFile(join(root, hidden)), await readFile(join(root, visible)));
  assert.equal(run(root).status, 0);
});
test('preflight preserves existing customized files without partially preparing others', async t => {
  const root = await fixture(t); await writeFile(join(root, '.mcp.json'), '{"custom":true}');
  assert.equal(run(root).status, 1);
  assert.equal(await readFile(join(root, '.mcp.json'), 'utf8'), '{"custom":true}');
  await assert.rejects(access(join(root, '.codex-plugin/plugin.json')));
});
test('preparation rejects a symlink destination', async t => {
  const root = await fixture(t); await symlink(join(root, 'skills'), join(root, '.codex-plugin'), 'dir');
  assert.equal(run(root).status, 1);
  await assert.rejects(access(join(root, 'skills/plugin.json')));
});
