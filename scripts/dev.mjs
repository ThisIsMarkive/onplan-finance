import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createCodexBridge,handleLocalAIRequest} from './codex-bridge.mjs';
const root=resolve(import.meta.dirname,'..');
const aiOption=process.argv.slice(2).find(value=>value.startsWith('--ai='));
if(aiOption&&aiOption!=='--ai=codex'){console.error('Supported local AI option: --ai=codex');process.exit(1);}
const aiEnabled=aiOption==='--ai=codex';
const bridge=createCodexBridge({enabled:aiEnabled});
const build=spawnSync(process.execPath,[resolve(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit'});
if(build.error||build.status!==0)process.exit(build.status||1);
const {default:worker,MAX_BODY_BYTES,SECURITY_HEADERS}=await import('../dist/server/index.js');
const port=Number(process.env.PORT||4173);
const server=http.createServer(async(req,res)=>{
  const fail=(status,error)=>{res.writeHead(status,{...SECURITY_HEADERS,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error}));};
  try{
    const requestURL=new URL(req.url,`http://${req.headers.host||`127.0.0.1:${server.address().port}`}`);
    if(!['127.0.0.1','localhost','[::1]'].includes(requestURL.hostname)){fail(400,'INVALID_LOCAL_HOST');req.resume();return;}
    if(Number(req.headers['content-length']||0)>MAX_BODY_BYTES){fail(413,'INPUT_TOO_LARGE');req.resume();return;}
    const chunks=[]; let size=0,tooLarge=false;
    for await(const c of req){
      if(tooLarge)continue;
      size+=c.length;
      if(size>MAX_BODY_BYTES){tooLarge=true;chunks.length=0;fail(413,'INPUT_TOO_LARGE');continue;}
      chunks.push(c);
    }
    if(tooLarge)return;
    const init={method:req.method,headers:req.headers};
    if(!['GET','HEAD'].includes(req.method))init.body=Buffer.concat(chunks);
    const request=new Request(requestURL,init);
    const response=aiEnabled&&['/api/status','/api/explain'].includes(requestURL.pathname)
      ?await handleLocalAIRequest(request,{bridge,worker}):await worker.fetch(request,{},{});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.headersSent)fail(500,'LOCAL_SERVER_ERROR');else res.end();}
});
server.listen(port,'127.0.0.1',()=>{
  console.log(`Local: http://127.0.0.1:${server.address().port}`);
  if(aiEnabled)console.log('Local AI: Codex ChatGPT subscription opt-in; authentication is checked before every request.');
});
