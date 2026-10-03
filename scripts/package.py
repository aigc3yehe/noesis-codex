"""Create a portable, allowlisted source/runtime archive; never sweep the home directory."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
output = root / 'release'
output.mkdir(exist_ok=True)
archive = output / f'noesis-{version}.zip'
files = [root / name for name in ('README.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', '.mcp.json', '.codex-plugin/plugin.json', 'dist/server.cjs')]
for directory in ('src', 'scripts', 'tests', 'skills', 'docs'):
    files.extend(p for p in (root / directory).rglob('*') if p.is_file() and p.suffix in ('.mjs', '.md', '.json', '.py'))
checksums = {}
han = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
text_suffixes = {'.json', '.md', '.mjs', '.py', '.txt', '.html', '.css'}
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
    for path in sorted(files):
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise RuntimeError('Refusing external or symbolic package path')
        data = path.read_bytes()
        relative = str(path.relative_to(root))
        if path.suffix in text_suffixes:
            content = data.decode('utf-8')
            if path.suffix == '.json':
                content = json.dumps(json.loads(content), ensure_ascii=False)
            if han.search(content):
                raise RuntimeError(f'Non-English CJK content: {relative}')
        package.writestr('noesis/' + relative, data)
        checksums[relative] = hashlib.sha256(data).hexdigest()
    package.writestr('noesis/SHA256SUMS.json', json.dumps(checksums, indent=2) + '\n')
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / (archive.name + '.sha256')).write_text(f'{digest}  {archive.name}\n')
print(json.dumps({'archive': str(archive), 'files': len(checksums), 'sha256': digest}))
