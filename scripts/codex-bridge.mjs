/** Local, opt-in Codex subscription bridge. Never import this module in the hosted worker.
 * Saved authentication stays with Codex; this application never opens auth.json.
 * No automatic API-key or alternate-provider fallback exists.
 */
import {spawn} from 'node:child_process';
import {access,mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename,delimiter,isAbsolute,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';
import {buildExplanationContext,makeExplanationPrompt,validateExplanationOutput,EXPLANATION_SCHEMA} from '../src/explanation.js';
import {MAX_BODY_BYTES,SECURITY_HEADERS} from '../worker/index.js';

export const BRIDGE_TIMEOUT_MS=120000;
export const MAX_CLI_OUTPUT_BYTES=262144;
const MAX_FINAL_BYTES=24000;
const MODEL_LABEL='Codex CLI 기본 모델';
const DISABLED_CODE_HOST_WARNING='Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.';
export class BridgeError extends Error{
  constructor(code,message,status=503){super(message);this.code=code;this.status=status;}
}
export function sanitizeChildEnvironment(source){
  return Object.fromEntries(Object.entries(source).filter(([key])=>
    !/API_?KEY|ACCESS_?TOKEN|AUTH_?TOKEN|BEARER|^OPENAI_|^AZURE_OPENAI_/i.test(key)
    &&!/^CODEX_(API_BASE_URL|BASE_URL|MODEL_PROVIDER|PROVIDER|AUTH_MODE)$/i.test(key)));
}

export function runChild(executable,args,{cwd,env,input='',timeoutMs=10000,maxOutputBytes=MAX_CLI_OUTPUT_BYTES,onStdout}={}){
  return new Promise((resolve,reject)=>{
    let child,settled=false,total=0,stdout='',stderr='';
    const stdoutDecoder=new StringDecoder('utf8'),stderrDecoder=new StringDecoder('utf8');
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const stop=error=>{child?.kill('SIGKILL');finish(error);};
    const timer=setTimeout(()=>stop(new BridgeError('AI_TIMEOUT','로컬 Codex 응답 시간이 제한을 넘었습니다.',504)),timeoutMs);
    try{child=spawn(executable,args,{cwd,env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});}
    catch{finish(new BridgeError('CODEX_START_FAILED','설치된 Codex 실행 파일을 시작하지 못했습니다.'));return;}
    const collect=(chunk,isStdout)=>{
      total+=chunk.length;
      if(total>maxOutputBytes){stop(new BridgeError('AI_OUTPUT_TOO_LARGE','로컬 Codex 응답이 허용 크기를 넘었습니다.',502));return;}
      const text=(isStdout?stdoutDecoder:stderrDecoder).write(chunk);
      if(isStdout){stdout+=text;try{onStdout?.(text);}catch(error){stop(error);}}
      else stderr+=text;
    };
    child.stdout.on('data',chunk=>collect(chunk,true));child.stderr.on('data',chunk=>collect(chunk,false));
    child.once('error',()=>finish(new BridgeError('CODEX_START_FAILED','설치된 Codex 실행 파일을 시작하지 못했습니다.')));
    child.once('close',(code,signal)=>{
      const last=stdoutDecoder.end();stdout+=last;stderr+=stderrDecoder.end();
      try{if(last)onStdout?.(last);}catch(error){finish(error);return;}
      finish(null,{code,signal,stdout,stderr});
    });
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}

export async function resolveCodexExecutable({env,runner=runChild,platform=process.platform}={}){
  if(platform==='win32'){
    const systemRoot=Object.entries(env).find(([k])=>k.toLowerCase()==='systemroot')?.[1]||'C:\\Windows';
    const found=await runner(join(systemRoot,'System32','where.exe'),['codex.exe'],{env,timeoutMs:5000,maxOutputBytes:8192});
    const executable=found.stdout.split(/\r?\n/).map(x=>x.trim()).find(x=>isAbsolute(x)&&basename(x).toLowerCase()==='codex.exe');
    if(found.code!==0||!executable)throw new BridgeError('CODEX_NOT_FOUND','PATH에서 설치된 codex.exe를 찾지 못했습니다.');
    await access(executable,constants.F_OK);return executable;
  }
  for(const directory of (env.PATH||'').split(delimiter).filter(Boolean)){
    const candidate=join(directory,'codex');
    if(!isAbsolute(candidate))continue;
    try{await access(candidate,constants.X_OK);return candidate;}catch{}
  }
  throw new BridgeError('CODEX_NOT_FOUND','PATH에서 설치된 Codex 실행 파일을 찾지 못했습니다.');
}

const DISABLED_FEATURES=['shell_tool','shell_snapshot','view_image','apps','plugins','remote_plugin',
  'multi_agent','computer_use','browser_use','browser_use_external','in_app_browser','code_mode_host',
  'code_mode','image_generation','hooks','memories','goals','sleep_tool','skill_search',
  'skill_mcp_dependency_install','workspace_dependencies','tool_suggest','request_permissions_tool',
  'plugin_discovery_prefetch','recommended_plugins','enable_mcp_apps'];
export function buildExecArguments(schemaPath){
  return ['exec','--sandbox','read-only','--ephemeral','--ignore-user-config','--skip-git-repo-check',
    '--strict-config','--json','--color','never','--output-schema',schemaPath,
    '-c','forced_login_method="chatgpt"','-c','model_provider="openai"',
    '-c','approval_policy="never"','-c','web_search="disabled"',
    '-c','apps._default.enabled=false','-c','agents.enabled=false',
    '-c','skills.bundled.enabled=false','-c','project_doc_max_bytes=0',
    '-c','history.persistence="none"','-c','check_for_update_on_startup=false',
    '-c','model_reasoning_effort="low"',
    ...DISABLED_FEATURES.flatMap(name=>['--disable',name]),'-'];
}

function eventCollector(){
  let pending='',finalText=null,modelId=null;
  const safeIdentifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:/-]{1,100}$/.test(value)?value:'unclassified';
  const inspect=line=>{
    if(!line.trim())return;
    let event;try{event=JSON.parse(line);}catch{throw new BridgeError('AI_PROTOCOL_INVALID','Codex 응답 형식을 확인하지 못했습니다.',502);}
    if(typeof event.model==='string'&&safeIdentifier(event.model)!=='unclassified')modelId=event.model;
    if(event.type==='error'||event.type==='turn.failed')throw new BridgeError('AI_EXEC_FAILED','Codex가 요청을 완료하지 못했습니다. 구독 사용 한도와 로그인을 확인하세요.',502);
    if(event.item){
      if(event.item.type==='error'){
        // The installed CLI reports our deliberately disabled Code Mode as this exact startup item.
        // No capability is enabled and no arbitrary error is ignored.
        if(event.type==='item.completed'&&event.item.message===DISABLED_CODE_HOST_WARNING)return;
        const error=new BridgeError('AI_EXEC_FAILED','Codex 실행 중 오류가 발생하여 설명을 완료하지 못했습니다.',502);
        error.diagnostic={eventType:safeIdentifier(event.type),itemType:'error',toolName:'unclassified'};
        throw error;
      }
      if(!['agent_message','reasoning'].includes(event.item.type)){
        const error=new BridgeError('AI_TOOL_USE_BLOCKED','계산해설 중 허용되지 않은 실행 항목이 감지되어 응답을 차단했습니다.',502);
        error.diagnostic={eventType:safeIdentifier(event.type),itemType:safeIdentifier(event.item.type),
          toolName:safeIdentifier(event.item.tool_name??event.item.toolName??event.item.tool)};
        throw error;
      }
      if(event.type==='item.completed'&&event.item.type==='agent_message')finalText=event.item.text;
    }
  };
  return {push(chunk){pending+=chunk;for(;;){const end=pending.indexOf('\n');if(end<0)break;inspect(pending.slice(0,end));pending=pending.slice(end+1);}},
    finish(){if(pending.trim())inspect(pending);if(typeof finalText!=='string'||Buffer.byteLength(finalText)>MAX_FINAL_BYTES)throw new BridgeError('AI_OUTPUT_INVALID','Codex 최종 설명을 확인하지 못했습니다.',502);return finalText;},
    model(){return modelId;}};
}

export function createCodexBridge({enabled=false,runner=runChild,resolver=resolveCodexExecutable,
  environment=process.env,tempRoot=tmpdir(),timeoutMs=BRIDGE_TIMEOUT_MS}={}){
  const env=sanitizeChildEnvironment(environment);
  let executable=null,busy=false;
  const baseStatus={provider:'codex_subscription',authMode:null,model:null,aiAvailable:false,localOnly:true};
  async function preflight(){
    if(!enabled)throw new BridgeError('AI_NOT_ENABLED','로컬 구독 연결 옵션이 켜져 있지 않습니다.');
    if(!executable)executable=await resolver({env,runner});
    const login=await runner(executable,['login','status'],{env,cwd:tempRoot,timeoutMs:10000,maxOutputBytes:16384});
    const output=`${login.stdout}\n${login.stderr}`;
    if(login.code!==0||!/^[ \t]*Logged in using ChatGPT[ \t]*\r?$/m.test(output)||/using (?:an? )?API key/i.test(output))
      throw new BridgeError('CHATGPT_AUTH_REQUIRED','Codex CLI의 ChatGPT 구독 로그인이 필요합니다. API 키 인증으로 자동 전환하지 않습니다.');
    return {authMode:'chatgpt',model:MODEL_LABEL};
  }
  return {
    async status(){
      if(!enabled)return {...baseStatus,aiStatus:'local_opt_in_required'};
      try{const authenticated=await preflight();return {...baseStatus,...authenticated,aiAvailable:true,aiStatus:'chatgpt_auth_ready',busy};}
      catch(error){return {...baseStatus,aiStatus:error.code||'CODEX_UNAVAILABLE',message:error instanceof BridgeError?error.message:'로컬 Codex 연결을 확인하지 못했습니다.'};}
    },
    async explain(raw){
      if(!enabled)throw new BridgeError('AI_NOT_ENABLED','로컬 구독 연결 옵션이 켜져 있지 않습니다.');
      const context=buildExplanationContext(raw);
      if(!context.ok)return {ok:false,errors:context.errors};
      if(busy)throw new BridgeError('AI_BUSY','다른 설명 요청을 처리 중입니다. 완료 후 다시 시도하세요.',409);
      busy=true;
      let directory,schemaPath;
      try{
        const authenticated=await preflight();
        directory=await mkdtemp(join(tempRoot,'onplan-codex-'));
        schemaPath=join(directory,'schema.json');
        await writeFile(schemaPath,JSON.stringify(EXPLANATION_SCHEMA),{encoding:'utf8',mode:0o600});
        const collector=eventCollector();
        let streamed=false;
        const execution=await runner(executable,buildExecArguments(schemaPath),{
          cwd:directory,env,input:makeExplanationPrompt(context),timeoutMs,maxOutputBytes:MAX_CLI_OUTPUT_BYTES,
          onStdout:chunk=>{streamed=true;collector.push(chunk);},
        });
        if(execution.code!==0)throw new BridgeError('AI_EXEC_FAILED','Codex가 요청을 완료하지 못했습니다. 구독 사용 한도와 로그인을 확인하세요.',502);
        if(!streamed)collector.push(execution.stdout); // Injectable test runners may return complete output.
        let parsed;try{parsed=JSON.parse(collector.finish());}catch(error){
          if(error instanceof BridgeError)throw error;
          throw new BridgeError('AI_OUTPUT_INVALID','Codex 설명의 JSON 구조를 확인하지 못했습니다.',502);
        }
        const checked=validateExplanationOutput(parsed,context.evidence);
        if(!checked.ok)throw new BridgeError(checked.error,checked.message,502);
        return {mode:'live_ai',sections:checked.sections,evidence:context.evidence,model:collector.model()||authenticated.model,
          inputHash:createHash('sha256').update(JSON.stringify(context.input)).digest('hex'),
          provider:'codex_subscription',authMode:'chatgpt'};
      }finally{
        // Only the exact file/directory created above is removed; never recursively delete a supplied path.
        if(schemaPath)await unlink(schemaPath).catch(()=>{});
        if(directory)await rmdir(directory).catch(()=>{});
        busy=false;
      }
    },
  };
}

/** Used by the loopback-only dev server, never by the hosted worker. */
export async function handleLocalAIRequest(request,{bridge,worker}){
  const url=new URL(request.url);
  const json=(value,status=200,extra={})=>new Response(request.method==='HEAD'?null:JSON.stringify(value),{
    status,headers:{...SECURITY_HEADERS,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra},
  });
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:')return json({error:'LOCAL_ONLY'},403);
  if(url.pathname==='/api/status'){
    if(!['GET','HEAD'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, HEAD'});
    const hosted=await worker.fetch(new Request(request.url),{},{});
    const base=await hosted.json();
    return json({...base,...await bridge.status()});
  }
  if(url.pathname!=='/api/explain')return worker.fetch(request,{},{});
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
  if(request.headers.get('Origin')!==url.origin)return json({error:'ORIGIN_REQUIRED',message:'로컬 화면에서 직접 설명을 요청하세요.'},403);
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'JSON_REQUIRED'},415);
  const declared=request.headers.get('Content-Length');
  if(declared!==null&&!/^\d+$/.test(declared))return json({error:'INVALID_CONTENT_LENGTH'},400);
  if(declared!==null&&Number(declared)>MAX_BODY_BYTES)return json({error:'INPUT_TOO_LARGE'},413);
  let body;
  const reader=request.body?.getReader();
  try{
    const chunks=[];let size=0;
    if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>MAX_BODY_BYTES){await reader.cancel();return json({error:'INPUT_TOO_LARGE'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{return json({error:'INVALID_JSON'},400);}
  finally{reader?.releaseLock();}
  try{
    const result=await bridge.explain(body?.input);
    return json(result,result.ok===false?422:200);
  }catch(error){return json({error:error instanceof BridgeError?error.code:'AI_EXEC_FAILED',
    ...(error instanceof BridgeError&&error.diagnostic?{diagnostic:error.diagnostic}:{}),
    message:error instanceof BridgeError?error.message:'로컬 Codex 요청을 완료하지 못했습니다.'},
    error instanceof BridgeError?error.status:502);}
}
