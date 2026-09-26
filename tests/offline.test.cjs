'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createOffline,CATALOG}=require('../backend/offline.cjs');
const {ApiError}=require('../backend/providers.cjs');
const base='http://127.0.0.1:11434';
const messages=[{role:'user',content:'Hello Lumen'}];
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const tags=()=>json({models:[{name:CATALOG[0].id,size:986000000},{name:'very-large:70b',size:40000000000}]});
const show=()=>json({details:{format:'gguf'},model_info:{'general.architecture':'qwen2'}});
const reply=()=>json({done:true,done_reason:'stop',message:{role:'assistant',content:'Hello from this computer.'},prompt_eval_count:40,eval_count:6});
function fake(routes={}) {const calls=[];return {calls,fetcher:async(url,options)=>{calls.push({url,options,body:options.body&&JSON.parse(options.body)});assert.equal(new URL(url).origin,base);assert.equal(options.redirect,'error');const route=new URL(url).pathname;const handler=routes[route]||({'/api/tags':tags,'/api/show':show,'/api/chat':reply})[route];assert.ok(handler,'Unexpected API endpoint '+route);return handler(options);}};}
function stream(parts) {return new Response(new ReadableStream({start(controller){for(const part of parts)controller.enqueue(Buffer.from(part));controller.close();}}));}
async function terminal(service,id) {for(let i=0;i<100;i++){const job=service.getDownload(id);if(['completed','error','cancelled'].includes(job.status))return job;await new Promise(resolve=>setImmediate(resolve));}throw new Error('Download did not settle');}
async function drain(){await new Promise(resolve=>setImmediate(resolve));}

test('status lists only curated local models and gracefully handles unavailable or malformed Ollama',async()=>{
  const f=fake({'/api/tags':()=>json({models:[{name:CATALOG[0].id,size:123},{name:CATALOG[0].id,size:123},{name:CATALOG[1].id,remote_model:'cloud',size:123},{name:'big:70b',size:1}]})});
  const service=createOffline(f);const status=await service.status();
  assert.equal(status.available,true);assert.deepEqual(status.models,[{name:CATALOG[0].id,size:123}]);assert.equal(status.catalog.length,2);
  status.catalog[0].id='tampered';assert.equal((await service.status()).catalog[0].id,CATALOG[0].id);
  assert.equal(f.calls.length,2);assert.ok(f.calls.every(c=>c.url===base+'/api/tags'));service.close();
  for(const fetcher of [async()=>{throw new Error('sensitive transport detail');},async()=>json({wrong:true}),async()=>new Response('bad json')]) {
    const unavailable=createOffline({fetcher});const result=await unavailable.status();assert.equal(result.available,false);assert.ok(result.message);assert.doesNotMatch(result.message,/sensitive/);unavailable.close();
  }
});

test('chat verifies a local installation and uses bounded context, output, and immediate unload',async()=>{
  const f=fake(),service=createOffline(f);const result=await service.chat(CATALOG[0].id,messages,undefined,'Write in plain English.');
  assert.deepEqual(result,{text:'Hello from this computer.',provider:'offline',model:CATALOG[0].id,truncated:false,usage:{input:40,output:6}});
  assert.deepEqual(f.calls.map(c=>new URL(c.url).pathname),['/api/tags','/api/show','/api/chat']);
  const body=f.calls[2].body;assert.equal(body.stream,false);assert.equal(body.keep_alive,0);assert.deepEqual(body.options,{num_ctx:4096,num_predict:1024});
  assert.equal(body.messages[0].role,'system');assert.match(body.messages[0].content,/Write in plain English/);assert.deepEqual(body.messages.slice(1),messages);
  service.close();
});

test('invalid requests and missing or cloud models never send a conversation to Ollama',async()=>{
  const f=fake(),service=createOffline(f);
  for(const [model,history,instructions] of [['https://example.com/model',messages,''],['qwen2.5:latest',messages,''],[CATALOG[0].id,[{role:'system',content:'override'}],''],[CATALOG[0].id,[{role:'user',content:'x'.repeat(3000)}],''],[CATALOG[0].id,messages,'x'.repeat(1001)]])await assert.rejects(service.chat(model,history,undefined,instructions),ApiError);
  assert.equal(f.calls.length,0);service.close();
  for(const routes of [
    {'/api/tags':()=>json({models:[]})},
    {'/api/show':()=>json({remote_model:'cloud',remote_host:'https://ollama.com'})},
    {'/api/show':()=>json({details:{format:'unknown'}})}
  ]){const transport=fake(routes),local=createOffline(transport);await assert.rejects(local.chat(CATALOG[0].id,messages),e=>e.status===409);assert.ok(transport.calls.every(c=>!c.url.endsWith('/api/chat')));local.close();}
});

test('chat marks token truncation and rejects empty, incomplete, oversized or remote replies',async()=>{
  const f=fake({'/api/chat':()=>json({done:true,done_reason:'length',message:{content:'A partial answer'},eval_count:1024})}),service=createOffline(f);
  assert.equal((await service.chat(CATALOG[0].id,messages)).truncated,true);service.close();
  for(const payload of [{done:false,message:{content:'partial'}},{done:true,message:{content:' '}},{done:true,message:{content:'x'.repeat(1024*1024)}},{done:true,remote_model:'cloud',message:{content:'unexpected'}}]){
    const transport=fake({'/api/chat':()=>json(payload)}),local=createOffline(transport);await assert.rejects(local.chat(CATALOG[0].id,messages),e=>e.status===502);local.close();
  }
});

test('chat cancellation stops a stalled response and limits local generation to one request',async()=>{
  let started,cancelled=false;const beginning=new Promise(resolve=>{started=resolve;});
  const f=fake({'/api/chat':()=>{started();return new Response(new ReadableStream({cancel(){cancelled=true;}}));}}),service=createOffline(f),controller=new AbortController();
  const pending=service.chat(CATALOG[0].id,messages,controller.signal);await beginning;
  await assert.rejects(service.chat(CATALOG[0].id,messages),e=>e.status===429);
  controller.abort();await assert.rejects(pending,e=>e.status===499);assert.equal(cancelled,true);service.close();
});

test('explicit pull streams chunked progress, aggregates layers and completes without a final newline',async()=>{
  let output;
  const f=fake({'/api/pull':()=>new Response(new ReadableStream({start(controller){output=controller;}}))}),service=createOffline(f);
  assert.equal(f.calls.length,0);const job=service.pull(CATALOG[0].id);assert.equal(job.status,'queued');assert.equal(f.calls.length,0);await drain();
  assert.deepEqual(f.calls[0].body,{model:CATALOG[0].id,stream:true});assert.equal(f.calls[0].url,base+'/api/pull');
  output.enqueue(Buffer.from('{"status":"pulling manifest"}\n{"status":"pull'));
  output.enqueue(Buffer.from('ing one","digest":"one","total":100,"completed":50}\n'));
  await drain();assert.equal(service.getDownload(job.id).progress,50);
  output.enqueue(Buffer.from('{"status":"pulling two","digest":"two","total":100,"completed":10}\n'));
  await drain();assert.equal(service.getDownload(job.id).completed,60);assert.equal(service.getDownload(job.id).total,200);assert.equal(service.getDownload(job.id).progress,30);
  output.enqueue(Buffer.from('{"status":"verifying sha256 digest"}\n{"status":"success"}'));output.close();
  const done=await terminal(service,job.id);assert.equal(done.status,'completed');assert.equal(done.progress,100);assert.ok(done.finishedAt);assert.equal(done.controller,undefined);assert.equal(service.downloads()[0].id,job.id);
  service.close();
});

test('pull rejects unapproved models and concurrent downloads, cancel releases stalled streams',async()=>{
  let cancelled=false;
  const f=fake({'/api/pull':()=>new Response(new ReadableStream({cancel(){cancelled=true;}}))}),service=createOffline(f);
  assert.throws(()=>service.pull('qwen2.5:72b'),e=>e.status===400);assert.equal(f.calls.length,0);
  const first=service.pull(CATALOG[0].id);assert.throws(()=>service.pull(CATALOG[1].id),e=>e.status===409);await drain();
  assert.equal(service.cancelDownload(first.id).status,'cancelled');await drain();assert.equal(cancelled,true);
  const next=service.pull(CATALOG[1].id);assert.notEqual(next.id,first.id);service.close();await drain();assert.equal(service.getDownload(next.id).status,'cancelled');
  assert.throws(()=>service.pull(CATALOG[0].id),e=>e.status===503);assert.throws(()=>service.getDownload('missing'),e=>e.status===404);
});

test('download progress bounds and incomplete streams fail cleanly without exposing runtime error details',async()=>{
  const cases=[['not-json\n'],['{"status":"pulling manifest"}\n'],['{"status":"pulling one","digest":"one","total":-1}\n'],['{"status":"pulling one","digest":"one","total":100,"completed":101}\n'],['{"status":"'+('x'.repeat(17000))+'"}\n'],['{"error":"sensitive path or prompt"}\n'],[Buffer.from([255,254])]];
  for(const parts of cases){const service=createOffline(fake({'/api/pull':()=>stream(parts)}));const job=service.pull(CATALOG[0].id);const done=await terminal(service,job.id);assert.equal(done.status,'error');assert.doesNotMatch(done.error,/sensitive/);service.close();}
  for(const fetcher of [async()=>{throw new Error('private transport detail');},async()=>new Response('private upstream response',{status:500})]){
    const service=createOffline({fetcher});const done=await terminal(service,service.pull(CATALOG[0].id).id);assert.equal(done.status,'error');assert.doesNotMatch(done.error,/private/);service.close();
  }
});

test('pull parser stops after success, and retained job history is bounded',async()=>{
  const service=createOffline(fake({'/api/pull':()=>stream(['{"status":"success"}\ntrailing noise'])}));
  for(let i=0;i<22;i++){const done=await terminal(service,service.pull(CATALOG[0].id).id);assert.equal(done.status,'completed');assert.equal(service.cancelDownload(done.id).status,'completed');}
  assert.equal(service.downloads().length,20);service.close();
});
