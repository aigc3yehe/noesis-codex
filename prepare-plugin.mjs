// Restore Codex's standard filenames after uploading only visible files.
// No network, package install, wallet access or global configuration changes.
import { readFile, writeFile, lstat, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const mappings = [
  ['plugin-manifest.json', '.codex-plugin/plugin.json'],
  ['mcp-config.json', '.mcp.json'],
  ['gitignore.txt', '.gitignore'],
];
async function stat(path) {
  try { return await lstat(path); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22 or newer is required.');
  const jobs = [];
  for (const [source, destination] of mappings) {
    const sourcePath = join(root, source), targetPath = join(root, destination);
    if ((await stat(sourcePath))?.isSymbolicLink()) throw Error(`Refusing a symlink: ${source}`);
    const data = await readFile(sourcePath);
    const parent = await stat(dirname(targetPath));
    if (parent && (!parent.isDirectory() || parent.isSymbolicLink())) throw Error(`Unsafe destination directory: ${destination}`);
    const current = await stat(targetPath);
    if (current && (!current.isFile() || current.isSymbolicLink())) throw Error(`Unsafe destination: ${destination}`);
    if (current && !(await readFile(targetPath)).equals(data)) throw Error(`Existing ${destination} differs. Preserve it and review the difference before preparing again.`);
    jobs.push({ source, destination, targetPath, data, exists: !!current });
  }
  const manifest = JSON.parse(jobs[0].data.toString('utf8'));
  if (manifest.name !== 'noesis' || manifest.skills !== './skills/' || manifest.mcpServers !== './.mcp.json') throw Error('Unexpected plugin manifest paths.');
  const mcp = JSON.parse(jobs[1].data.toString('utf8'));
  if (!mcp.mcpServers?.noesis) throw Error('Missing NOESIS MCP configuration.');
  await access(join(root, 'dist/server.cjs'));
  await access(join(root, 'skills/noesis-start/SKILL.md'));
  // Preflight every destination before writing any generated file.
  for (const job of jobs) {
    if (!job.exists) {
      await mkdir(dirname(job.targetPath), { recursive: true });
      await writeFile(job.targetPath, job.data, { flag: 'wx' });
    }
  }
  console.log('Prepared: .codex-plugin/plugin.json, .mcp.json, .gitignore');
  console.log('The plugin files are ready. Continue with Codex plugin installation; NFT authentication is a separate step.');
} catch (error) {
  console.error('Preparation failed: ' + error.message);
  process.exitCode = 1;
}
