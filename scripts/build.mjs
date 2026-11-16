import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const files={
  '/':['public/index.html','text/html; charset=utf-8'],
  '/app.js':['public/app.js','text/javascript; charset=utf-8'],
  '/styles.css':['public/styles.css','text/css; charset=utf-8'],
  '/src/core.js':['src/core.js','text/javascript; charset=utf-8'],
  '/src/form-schema.js':['src/form-schema.js','text/javascript; charset=utf-8'],
};
const assets={};
for(const [path,[file,type]] of Object.entries(files)) assets[path]={type,body:await readFile(resolve(root,file),'utf8')};
const core=await readFile(resolve(root,'src/core.js'),'utf8');
const server=await readFile(resolve(root,'worker/index.js'),'utf8');
const generated=`// Generated; edit src and worker source.\nconst ASSETS=${JSON.stringify(assets)};\n${core.replace(/^export /gm,'')}\n${server.replace(/^import .*;\r?\n/gm,'')}`;
await mkdir(resolve(root,'dist/server'),{recursive:true});
await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await writeFile(resolve(root,'dist/server/index.js'),generated);
await writeFile(resolve(root,'dist/.openai/hosting.json'),await readFile(resolve(root,'.openai/hosting.json')));
console.log(JSON.stringify({built:true,assetCount:Object.keys(assets).length,bytes:Buffer.byteLength(generated)}));
