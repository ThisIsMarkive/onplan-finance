import {runPlan,MODEL_VERSION} from '../src/core.js';

const BUILD_VERSION='0.1.0';
export const MAX_BODY_BYTES=32768;
export const SECURITY_HEADERS={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
};
function jsonResponse(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{...SECURITY_HEADERS,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});}
function methodNotAllowed(allow){return jsonResponse({error:'METHOD_NOT_ALLOWED'},405,{'Allow':allow});}
function readOnlyJSON(request,data){
  if(!['GET','HEAD'].includes(request.method))return methodNotAllowed('GET, HEAD');
  const response=jsonResponse(data);
  return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
}
async function readJSON(request){
  const mediaType=request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if(mediaType!=='application/json')return {error:jsonResponse({error:'JSON_REQUIRED'},415)};
  const declared=request.headers.get('Content-Length');
  if(declared!==null&&!/^\d+$/.test(declared))return {error:jsonResponse({error:'INVALID_CONTENT_LENGTH'},400)};
  if(declared!==null&&Number(declared)>MAX_BODY_BYTES)return {error:jsonResponse({error:'INPUT_TOO_LARGE'},413)};
  const reader=request.body?.getReader();
  const chunks=[];
  let size=0;
  try{
    if(reader)for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BODY_BYTES){await reader.cancel();return {error:jsonResponse({error:'INPUT_TOO_LARGE'},413)};}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return {body:JSON.parse(text)};
  }catch{return {error:jsonResponse({error:'INVALID_JSON'},400)};}
  finally{reader?.releaseLock();}
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/status'){
      return readOnlyJSON(request,{aiAvailable:false,model:null,buildVersion:BUILD_VERSION,modelVersion:MODEL_VERSION,aiStatus:'local_codex_required'});
    }
    if(url.pathname==='/api/calculate'||url.pathname==='/api/explain'){
      if(request.method!=='POST')return methodNotAllowed('POST');
      if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return jsonResponse({error:'ORIGIN_MISMATCH'},403);
      const parsed=await readJSON(request);
      if(parsed.error)return parsed.error;
      if(url.pathname==='/api/explain')return jsonResponse({error:'AI_NOT_CONFIGURED',message:'공개 웹은 AI에 연결되지 않습니다. 로컬 Codex 구독 모드에서 설명을 요청하거나 계산해설을 확인하세요.'},503);
      const result=runPlan(parsed.body?.input);
      return jsonResponse(result,result.ok?200:422);
    }
    if(url.pathname==='/health')return readOnlyJSON(request,{ok:true,version:BUILD_VERSION});
    if(request.method!=='GET'&&request.method!=='HEAD')return methodNotAllowed('GET, HEAD');
    const asset=(typeof ASSETS==='undefined'?{}:ASSETS)[url.pathname];
    if(!asset)return new Response('Not found',{status:404,headers:SECURITY_HEADERS});
    return new Response(request.method==='HEAD'?null:asset.body,{headers:{...SECURITY_HEADERS,'Content-Type':asset.type,'Cache-Control':'no-cache'}});
  }
};
