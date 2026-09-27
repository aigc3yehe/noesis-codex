"""Verify the portable archive and run its MCP bundle without source dependencies."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
archive = root / 'release' / f'noesis-{version}.zip'
node = shutil.which('node')
if not node:
    raise RuntimeError('Node.js 22+ is required')

with tempfile.TemporaryDirectory(prefix='noesis portable ') as tmp:
    destination = Path(tmp)
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        for name in names:
            if not name.startswith('noesis/') or '..' in Path(name).parts or any(part in ('node_modules', '.git', 'release') for part in Path(name).parts):
                raise RuntimeError(f'Unexpected archive entry: {name}')
        package.extractall(destination)
    plugin = destination / 'noesis'
    checksums = json.loads((plugin / 'SHA256SUMS.json').read_text())
    for path, digest in checksums.items():
        if hashlib.sha256((plugin / path).read_bytes()).hexdigest() != digest:
            raise RuntimeError(f'Checksum mismatch: {path}')
    manifest = json.loads((plugin / '.codex-plugin/plugin.json').read_text())
    assert manifest['version'].split('+')[0] == version
    config = json.loads((plugin / '.mcp.json').read_text())['mcpServers']['noesis']
    assert config == {'cwd': '.', 'command': 'node', 'args': ['./dist/server.cjs']}
    # Built-in Node APIs only: this probe has no SDK/node_modules dependency either.
    probe = r'''
      const {spawn}=require('node:child_process');
      const {createInterface}=require('node:readline');
      const child=spawn(process.execPath,['./dist/server.cjs'],{cwd:process.argv[1],stdio:['pipe','pipe','pipe']});
      const waiting=new Map();let next=1,stderr='';
      child.stderr.on('data',b=>stderr+=b.toString());
      createInterface({input:child.stdout}).on('line',line=>{const v=JSON.parse(line);if(v.id)waiting.get(v.id)?.(v);});
      const rpc=(method,params)=>new Promise((resolve,reject)=>{
        const id=next++;const timer=setTimeout(()=>reject(Error('MCP timeout')),5000);
        waiting.set(id,v=>{clearTimeout(timer);waiting.delete(id);v.error?reject(Error(JSON.stringify(v.error))):resolve(v.result);});
        child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
      });
      (async()=>{
        await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'portable-check',version:'1.0.0'}});
        child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
        const tools=await rpc('tools/list',{});if(tools.tools.length!==11)throw Error('Wrong tool count');
        const r=await rpc('tools/call',{name:'noesis_read',arguments:{endpoint:'macro_latest'}});
        if(!r.isError||JSON.parse(r.content[0].text).error.code!=='AUTH_REQUIRED')throw Error('Unauthenticated read was not denied');
        if(stderr)throw Error('Unexpected stderr');
        console.log(JSON.stringify({tools:tools.tools.length,unauthenticatedRead:'denied',dependencyFree:true}));
      })().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>child.stdin.end());
    '''
    result = subprocess.run([node, '-e', probe, str(plugin)], capture_output=True, text=True, timeout=20, check=True, cwd=destination)
    print(json.dumps({'archiveChecksums': 'passed', 'archiveFiles': len(checksums), 'portableMcp': json.loads(result.stdout)}))
