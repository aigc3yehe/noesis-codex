"""Create a portable, allowlisted source/runtime archive; never sweep the home directory."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
output = root / 'release'
output.mkdir(exist_ok=True)
archive = output / f'noesis-{version}.zip'
files = [root / name for name in ('README.md', 'UPLOAD.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', 'plugin-manifest.json', 'mcp-config.json', 'gitignore.txt', 'prepare-plugin.mjs', '.gitignore', '.mcp.json', '.codex-plugin/plugin.json', 'dist/server.cjs')]
for directory in ('src', 'scripts', 'tests', 'skills', 'docs'):
    files.extend(p for p in (root / directory).rglob('*') if p.is_file() and p.suffix in ('.mjs', '.md', '.json', '.py'))
checksums = {}
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
    for path in sorted(files):
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise RuntimeError('Refusing external or symbolic package path')
        data = path.read_bytes()
        relative = str(path.relative_to(root))
        package.writestr('noesis/' + relative, data)
        checksums[relative] = hashlib.sha256(data).hexdigest()
    package.writestr('noesis/SHA256SUMS.json', json.dumps(checksums, indent=2) + '\n')
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / (archive.name + '.sha256')).write_text(f'{digest}  {archive.name}\n')
print(json.dumps({'archive': str(archive), 'files': len(checksums), 'sha256': digest}))
