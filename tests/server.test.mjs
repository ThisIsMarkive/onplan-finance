import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import worker,{MAX_BODY_BYTES} from '../worker/index.js';
import {runPlan} from '../src/core.js';

const origin='https://onplan.test';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/fictional-household.json',import.meta.url)));
const post=(path='/api/calculate',body=JSON.stringify({input:fixture}),headers={})=>new Request(origin+path,{
  method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body,
});
const call=request=>worker.fetch(request,{},{});
async function expectError(request,status,code){
  const response=await call(request);
  assert.equal(response.status,status);
  assert.equal((await response.json()).error,code);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  return response;
}

test('calculator endpoint recomputes from input, ignores claimed results and personal labels',async()=>{
  const response=await call(post('/api/calculate',JSON.stringify({input:{...fixture,label:'ignored-personal-label'},
    result:{netWorth:999,aiAvailable:true}})));
  assert.equal(response.status,200);
  const data=await response.json(), expected=runPlan(fixture);
  assert.equal(data.ok,true);
  assert.deepEqual(data.evidence,expected.evidence);
  assert.deepEqual(data.strategies.map(s=>s.normal.summary),expected.strategies.map(s=>s.normal.summary));
  assert.equal(data.input.label,undefined);
  assert.equal(data.strategies[0].normal.summary.initialNetWorth,465000000);
});

test('calculator returns structured 422 field errors for missing, blank and inconsistent data',async()=>{
  for(const input of [undefined,null,[],{}, {...fixture,cash:''},{...fixture,educationEarmark:fixture.cash+1}]){
    const response=await call(post('/api/calculate',JSON.stringify({input})));
    assert.equal(response.status,422);
    const body=await response.json();
    assert.equal(body.ok,false);assert.ok(body.errors.length>0);
    assert.equal(typeof body.errors[0].field,'string');assert.equal(typeof body.errors[0].message,'string');
  }
});

test('POST APIs reject wrong methods and report the allowed method',async()=>{
  for(const path of ['/api/calculate','/api/explain'])for(const method of ['GET','HEAD','PUT','DELETE','OPTIONS']){
    const response=await expectError(new Request(origin+path,{method}),405,'METHOD_NOT_ALLOWED');
    assert.equal(response.headers.get('Allow'),'POST');
  }
});

test('status and health are read-only, support HEAD and expose no invented live AI state',async()=>{
  for(const path of ['/api/status','/health']){
    const get=await call(new Request(origin+path));assert.equal(get.status,200);
    const head=await call(new Request(origin+path,{method:'HEAD'}));
    assert.equal(head.status,200);assert.equal(await head.text(),'');
    for(const method of ['POST','PUT','DELETE','OPTIONS']){
      const response=await expectError(new Request(origin+path,{method}),405,'METHOD_NOT_ALLOWED');
      assert.equal(response.headers.get('Allow'),'GET, HEAD');
    }
  }
  const status=await (await call(new Request(origin+'/api/status'))).json();
  assert.equal(status.aiAvailable,false);assert.equal(status.model,null);
  assert.equal(status.aiStatus,'local_codex_required');
  assert.equal(typeof status.modelVersion,'string');
});

test('cross-origin and opaque-origin requests cannot call either POST API',async()=>{
  for(const path of ['/api/calculate','/api/explain'])for(const badOrigin of ['https://other.test','null',origin+'/']){
    const response=await expectError(post(path,'{}',{Origin:badOrigin}),403,'ORIGIN_MISMATCH');
    assert.equal(response.headers.has('Access-Control-Allow-Origin'),false);
  }
  const response=await call(new Request(origin+'/api/calculate',{
    method:'POST',headers:{'Content-Type':'application/json'},body:'{}',
  }));
  assert.equal(response.status,422,'Non-browser requests without Origin are allowed and validated normally.');
});

test('only the JSON media type is accepted, including its case-insensitive and charset forms',async()=>{
  for(const path of ['/api/calculate','/api/explain']){
    for(const type of ['text/plain','application/jsonp','text/application/json','application/json-extra'])
      await expectError(post(path,'{}',{'Content-Type':type}),415,'JSON_REQUIRED');
    const response=await call(post(path,'{}',{'Content-Type':'Application/JSON; charset=utf-8'}));
    assert.equal(response.status,path==='/api/calculate'?422:503);
  }
});

test('invalid JSON, empty bodies and invalid UTF-8 are controlled errors',async()=>{
  for(const path of ['/api/calculate','/api/explain']){
    for(const body of ['', '{','{"input":NaN}',Buffer.from([0xff])])
      await expectError(post(path,body),400,'INVALID_JSON');
  }
});

test('request size is bounded by bytes for both declared and actual body size',async()=>{
  assert.equal(MAX_BODY_BYTES,32768);
  for(const path of ['/api/calculate','/api/explain']){
    await expectError(post(path,'{}',{'Content-Length':String(MAX_BODY_BYTES+1)}),413,'INPUT_TOO_LARGE');
    await expectError(post(path,'{}',{'Content-Length':'-1'}),400,'INVALID_CONTENT_LENGTH');
    await expectError(post(path,' '.repeat(MAX_BODY_BYTES+1),{'Content-Length':'1'}),413,'INPUT_TOO_LARGE');
    const korean=JSON.stringify({padding:'가'.repeat(12000)});
    assert.ok(korean.length<MAX_BODY_BYTES&&Buffer.byteLength(korean)>MAX_BODY_BYTES);
    await expectError(post(path,korean),413,'INPUT_TOO_LARGE');
    const exact='{"padding":"'+'a'.repeat(MAX_BODY_BYTES-14)+'"}';
    assert.equal(Buffer.byteLength(exact),MAX_BODY_BYTES);
    const response=await call(post(path,exact));
    assert.equal(response.status,path==='/api/calculate'?422:503);
  }
});

test('an oversized streamed body is cancelled before unlimited buffering',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(MAX_BODY_BYTES));controller.enqueue(new Uint8Array(1));},
    cancel(){cancelled=true;},
  });
  const request=new Request(origin+'/api/calculate',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:stream,duplex:'half',
  });
  await expectError(request,413,'INPUT_TOO_LARGE');assert.equal(cancelled,true);
});

test('unconfigured AI cannot issue a provider request or return generated-looking success',async t=>{
  const fetchMock=t.mock.method(globalThis,'fetch',()=>{throw new Error('Unexpected outbound provider call');});
  const response=await worker.fetch(post('/api/explain'),{OPENAI_API_KEY:'test-only-not-a-real-key'},{});
  assert.equal(response.status,503);
  const body=await response.json();assert.equal(body.error,'AI_NOT_CONFIGURED');
  assert.equal(body.mode,undefined);assert.equal(body.sections,undefined);assert.equal(body.model,undefined);
  const status=await (await worker.fetch(new Request(origin+'/api/status'),{OPENAI_API_KEY:'test-only-not-a-real-key'},{})).json();
  assert.equal(status.aiAvailable,false);assert.equal(fetchMock.mock.callCount(),0);
});

test('API responses carry cache and browser security headers; unknown routes return 404',async()=>{
  for(const request of [new Request(origin+'/api/status'),post('/api/calculate','{}'),post('/api/explain','{}')]){
    const response=await call(request);
    assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
    assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.match(response.headers.get('Content-Security-Policy'),/connect-src 'self'/);
  }
  const response=await call(new Request(origin+'/api/missing'));
  assert.equal(response.status,404);
});

function localRequest(port,path,{method='GET',headers={},body,chunks}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path,method,headers},res=>{
      const received=[];
      res.on('data',chunk=>received.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(received).toString('utf8')}));
      res.on('error',reject);
    });
    req.on('error',reject);
    if(chunks)for(const chunk of chunks)req.write(chunk);
    req.end(body);
  });
}

test('built local server passes real HTTP endpoint, byte-limit and Host-origin checks',{timeout:20000},async t=>{
  const child=spawn(process.execPath,['scripts/dev.mjs'],{
    cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0'},
    stdio:['ignore','pipe','pipe'],windowsHide:true,
  });
  let logs='';
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error(`Local startup timeout: ${logs}`));},10000);
    child.stdout.on('data',chunk=>{
      logs+=chunk;const match=logs.match(/Local: http:\/\/127\.0\.0\.1:(\d+)/);
      if(match){clearTimeout(timer);resolve(Number(match[1]));}
    });
    child.stderr.on('data',chunk=>{logs+=chunk;});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Local process exited ${code}: ${logs}`));});
  });
  try{
    await t.test('actual GET/HEAD assets and health are available',async()=>{
      for(const path of ['/','/app.js','/src/core.js','/health']){
        const get=await localRequest(port,path);assert.equal(get.status,200,path);
        assert.ok(get.text.length>0);assert.equal(get.headers['x-content-type-options'],'nosniff');
        const head=await localRequest(port,path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.text,'');
      }
    });
    await t.test('localhost Host and Origin are consistently accepted',async()=>{
      const result=await localRequest(port,'/api/calculate',{
        method:'POST',headers:{Host:`localhost:${port}`,Origin:`http://localhost:${port}`,'Content-Type':'application/json'},
        body:JSON.stringify({input:fixture}),
      });
      assert.equal(result.status,200);assert.equal(JSON.parse(result.text).ok,true);
    });
    await t.test('invalid body and cross-origin calls retain controlled JSON errors',async()=>{
      const invalid=await localRequest(port,'/api/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
      assert.equal(invalid.status,400);assert.equal(JSON.parse(invalid.text).error,'INVALID_JSON');
      const cross=await localRequest(port,'/api/explain',{method:'POST',headers:{Origin:'https://other.test','Content-Type':'application/json'},body:'{}'});
      assert.equal(cross.status,403);assert.equal(JSON.parse(cross.text).error,'ORIGIN_MISMATCH');
    });
    await t.test('fixed-length and chunked oversized bodies are both rejected as JSON 413',async()=>{
      const body='a'.repeat(MAX_BODY_BYTES+1);
      for(const options of [
        {headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body},
        {headers:{'Content-Type':'application/json'},chunks:['a'.repeat(MAX_BODY_BYTES),'a']},
      ]){
        const response=await localRequest(port,'/api/calculate',{method:'POST',...options});
        assert.equal(response.status,413);assert.equal(JSON.parse(response.text).error,'INPUT_TOO_LARGE');
        assert.equal(response.headers['cache-control'],'no-store');
      }
    });
    await t.test('local Host guard blocks a non-loopback hostname',async()=>{
      const response=await localRequest(port,'/api/status',{headers:{Host:'unexpected.example'}});
      assert.equal(response.status,400);assert.equal(JSON.parse(response.text).error,'INVALID_LOCAL_HOST');
    });
    await t.test('actual AI status is unavailable and explain returns 503',async()=>{
      const status=await localRequest(port,'/api/status');assert.equal(JSON.parse(status.text).aiAvailable,false);
      const response=await localRequest(port,'/api/explain',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:fixture}),
      });
      assert.equal(response.status,503);assert.equal(JSON.parse(response.text).error,'AI_NOT_CONFIGURED');
    });
  }finally{
    const exited=once(child,'exit');child.kill();await exited;
  }
});
