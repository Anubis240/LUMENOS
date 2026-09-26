'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createVault}=require('./backend/vault.cjs');
const {createProviders,DEFAULTS,ApiError,modelId,history}=require('./backend/providers.cjs');
const {createAccounts}=require('./backend/accounts.cjs');
const {createRuntime}=require('./backend/runtime.cjs'),{createOffline}=require('./backend/offline.cjs'),{createPlatform}=require('./backend/platform.cjs');
const {createCapabilities}=require('./backend/capabilities.cjs');
const {createConnectors}=require('./backend/connectors.cjs');
const STATIC=new Set(['index.html','style.css','app.js','orb.js','connection.js','voice.js','audio-capture.js','runtime-ui.js','offline-ui.js','permissions-ui.js','integrations-ui.js']);
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
function createServer(options={}) {
  const directory=options.directory||process.env.LUMEN_DATA_DIR||path.join(__dirname,'runtime-private');
  const vault=options.vault||createVault(directory),cloudProviders=options.providers||createProviders();
  const capabilities=options.capabilities||createCapabilities({directory});
  const accounts=options.accounts||createAccounts({directory,capabilities});
  const connectors=options.connectors||createConnectors({vault});
  // Every chat gets the live clock + OS as ambient context. API-key providers additionally
  // get a tool-use loop over whatever capabilities are currently granted.
  const IMAGE_HINT='If the user asks you to generate, create, draw, make or show an image, picture, photo or illustration, your ENTIRE reply must be exactly one line: "IMAGE: <a vivid, detailed description of the requested image>" — no other text. The Lumen app renders the picture from that line.';
  const withAmbient=instructions=>[capabilities.ambientContext(),IMAGE_HINT,instructions].filter(Boolean).join('\n');
  const providers={...cloudProviders,chat:(provider,credential,messages,signal,instructions)=>['codex','claude-account'].includes(provider)?accounts.chat(provider,messages,signal,withAmbient(instructions)):cloudProviders.chat(provider,credential,messages,signal,withAmbient(instructions),capabilities)};
  const runtimeVault={get:async provider=>{if(!['codex','claude-account'].includes(provider))return vault.get(provider);const s=await accounts.status(true),id=provider==='codex'?'codex':'claude';return s[id]?.connected?{account:true}:null}};
  const runtime=options.runtime===false?null:options.runtime||createRuntime({directory,providers,vault:runtimeVault,connectors});
  const offline=options.offline||createOffline(),platform=options.platform||createPlatform({directory});
  const csrf=crypto.randomBytes(32).toString('hex'),tested={};let active=0,runtimeError=null;
  const ready=Promise.resolve(runtime?.ready).catch(()=>{runtimeError='The workspace could not be opened. Check its storage directory and restart Lumen.'});
  const json=(res,status,data)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
  async function body(req) {
    if(req.headers['content-type']!=='application/json')throw new ApiError('Use JSON requests.',415);
    let n=0;const parts=[];for await(const chunk of req){n+=chunk.length;if(n>1600000)throw new ApiError('Request is too large.',413);parts.push(chunk)}
    try{return JSON.parse(Buffer.concat(parts).toString())}catch{throw new ApiError('Invalid JSON.')}
  }
  async function workspaceReady(){await ready;if(!runtime||runtimeError)throw new ApiError(runtimeError||'The workspace service is unavailable.',503)}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','microphone=(self), camera=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const port=server.address()?.port,host=req.headers.host;
    if(!['127.0.0.1:'+port,'localhost:'+port].includes(host)){json(res,403,{error:'Invalid host.'});return}
    const origin='http://'+host;
    let requestUrl,route;try{requestUrl=new URL(req.url,origin);route=requestUrl.pathname}catch{json(res,400,{error:'Invalid URL.'});return}
    const googleCallback=route==='/api/integrations/google/callback'&&req.method==='GET';
    if((req.headers.origin&&req.headers.origin!==origin)||(req.headers['sec-fetch-site']==='cross-site'&&!googleCallback)){json(res,403,{error:'Cross-origin access is not allowed.'});return}
    if(googleCallback){try{await connectors.completeGoogle({state:requestUrl.searchParams.get('state'),code:requestUrl.searchParams.get('code')});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});res.end('<!doctype html><title>Lumen connected</title><style>body{font:18px system-ui;background:#070817;color:#eee;display:grid;place-items:center;height:100vh}main{max-width:34rem;padding:3rem;border:1px solid #7450b8;border-radius:22px}</style><main><h1>Google connected to Lumen</h1><p>You can close this tab and return to Integrations.</p></main>')}catch{res.writeHead(400,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});res.end('<!doctype html><title>Lumen connection failed</title><style>body{font:18px system-ui;background:#070817;color:#eee;display:grid;place-items:center;height:100vh}main{max-width:34rem;padding:3rem;border:1px solid #a65b7b;border-radius:22px}</style><main><h1>Google sign-in could not be completed</h1><p>Return to Lumen and try again.</p></main>')}return}
    if(!route.startsWith('/api/')) {
      if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed.'});return}
      const file=route.slice(1)||'index.html';if(!STATIC.has(file)){json(res,404,{error:'Not found.'});return}
      res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]});if(req.method==='HEAD')res.end();else{const stream=fs.createReadStream(path.join(__dirname,file));stream.on('error',()=>res.destroy());stream.pipe(res)}return;
    }
    if(route==='/api/health'&&req.method==='GET'){json(res,200,{service:'lumen-os',version:'0.6.0',status:'ready'});return}
    if(route==='/api/integrations/status'&&req.method==='GET'){json(res,200,await connectors.status());return}
    if(route==='/api/status'&&req.method==='GET') {
      let credentials={},credentialError=null;try{credentials=await vault.status()}catch{credentialError='Credential storage is locked or unavailable. Unlock your Linux keyring or check your Windows account.'}
      let accountStatus;try{accountStatus=await accounts.status()}catch{accountStatus={codex:{installed:false,connected:false,error:'Account service unavailable.'},claude:{installed:false,connected:false,error:'Account service unavailable.'}}}
      json(res,200,{csrf,store:vault.kind,providers:credentials,accounts:accountStatus,credentialError,tested,defaults:DEFAULTS,version:'0.6.0'});return;
    }
    if(route==='/api/permissions'&&req.method==='GET'){json(res,200,capabilities.describe());return}
    if(req.headers['x-lumen-csrf']!==csrf){json(res,403,{error:'Session expired. Reload Lumen and try again.',code:'SESSION_EXPIRED'});return}
    if(req.method!=='POST'){json(res,405,{error:'Method not allowed.'});return}
    const controller=new AbortController();
    req.on('aborted',()=>controller.abort());
    res.on('close',()=>{if(!res.writableEnded)controller.abort()});
    let counted=false;
    try {
      const input=await body(req);if(!input||typeof input!=='object'||Array.isArray(input))throw new ApiError('Invalid request.');
      let result;
      if(['/api/runtime/','/api/agent/','/api/routine/','/api/job/','/api/workspace/'].some(p=>route.startsWith(p))) {
        await workspaceReady();
        switch(route) {
          case '/api/runtime/state':result=runtime.snapshot();break;
          case '/api/runtime/summary':{const s=runtime.snapshot();result={busy:s.busy,agents:s.agents.length,routines:s.routines.length,jobs:s.jobs.filter(j=>j.status==='running').map(j=>({id:j.id,status:j.status})),lastStatus:s.jobs[0]?.status||null};break;}
          case '/api/runtime/settings':result=await runtime.updateSettings(input);break;
          case '/api/agent/save':result=await runtime.saveAgent(input);break;
          case '/api/agent/delete':result=await runtime.removeAgent(input.id);break;
          case '/api/routine/save':result=await runtime.saveRoutine(input);break;
          case '/api/routine/delete':result=await runtime.removeRoutine(input.id);break;
          case '/api/job/run':result=await runtime.run(input);break;
          case '/api/job/stop':result=await runtime.stop(input.id);break;
          case '/api/workspace/list':result={files:await runtime.workspace.list()};break;
          case '/api/workspace/read':result=await runtime.workspace.read(input.path);break;
          case '/api/workspace/create':result=await runtime.workspace.create(input.name,input.content);break;
          default:throw new ApiError('Unknown operation.',404);
        }
        json(res,200,result??{message:'Done.'});return;
      }
      if(route==='/api/permissions'){json(res,200,await capabilities.update(input));return}
      if(route==='/api/integrations/google/save'){json(res,200,await connectors.saveGoogle(input));return}
      if(route==='/api/integrations/google/connect'){json(res,200,await connectors.connectGoogle(`http://127.0.0.1:${port}/api/integrations/google/callback`));return}
      if(route==='/api/integrations/google/disconnect'){json(res,200,await connectors.disconnectGoogle());return}
      if(route==='/api/integrations/gmail/test'){json(res,200,await connectors.testGmail());return}
      if(route==='/api/capability'){json(res,200,{result:await capabilities.run(input.name,input.args||{})});return}
      if(route==='/api/image'){
        if(['codex','claude-account'].includes(input.provider)){const r=await accounts.image(input.provider,input.prompt,controller.signal);json(res,200,r);return}
        if(input.allowApiBilling!==true)throw new ApiError('No API-billed image request was made. Subscription account connections cover Lumen text, while image APIs require separate billing and an explicit opt-in setting.',409);
        if(!['openai','gemini'].includes(input.provider))throw new ApiError('Choose an image API in Settings → AI & Voice before generating images.',409);
        const credential=await vault.get(input.provider);
        if(!credential?.key)throw new ApiError(`Add a ${input.provider==='openai'?'OpenAI':'Gemini'} API key before selecting it for image generation.`,409);
        const r=await cloudProviders.image(input.prompt,{[input.provider]:credential},controller.signal);json(res,200,r);return;
      }
      if(route==='/api/platform/status'){json(res,200,await platform.status());return}
      if(route==='/api/platform/launch'){json(res,200,await platform.launch(input.id,input.url));return}
      if(route==='/api/account/login'){if(!['codex','claude'].includes(input.provider))throw new ApiError('Unknown account provider.');json(res,200,await accounts.login(input.provider));return}
      if(route==='/api/account/logout'){if(!['codex','claude'].includes(input.provider))throw new ApiError('Unknown account provider.');json(res,200,await accounts.logout(input.provider));return}
      if(route==='/api/account/test'){if(!['codex','claude'].includes(input.provider))throw new ApiError('Unknown account provider.');json(res,200,await accounts.test(input.provider==='codex'?'codex':'claude-account',controller.signal));return}
      if(route==='/api/offline/status'){json(res,200,{...await offline.status(),...await platform.offlineEngine?.()});return}
      if(route==='/api/offline/start'){json(res,200,await platform.startOffline());return}
      if(route==='/api/offline/pull'){json(res,200,await offline.pull(input.model));return}
      if(route==='/api/offline/downloads'){json(res,200,{downloads:offline.downloads()});return}
      if(route==='/api/offline/cancel'){json(res,200,await offline.cancelDownload(input.id));return}
      // Control operations remain available while cloud conversations are running.
      if(active>=2)throw new ApiError('Lumen is busy. Wait for a current request or stop it.',429);
      active++;counted=true;const p=input.provider;
      if(input.instructions!==undefined&&(typeof input.instructions!=='string'||input.instructions.length>1000))throw new ApiError('Agent instructions are too long.');
      if(route==='/api/chat'&&p==='offline'){json(res,200,await offline.chat(input.model,history(input.messages),controller.signal,input.instructions));return}
      if(!['openai','claude','gemini','codex','claude-account'].includes(p))throw new ApiError('Unknown provider.');
      if(route==='/api/chat'&&['codex','claude-account'].includes(p)){result=await accounts.chat(p,history(input.messages),controller.signal,withAmbient(input.instructions));json(res,200,result);return}
      if(['codex','claude-account'].includes(p))throw new ApiError('Unknown account operation.',404);
      if(route==='/api/provider/save') {
        const old=await vault.get(p),key=input.key||old?.key;
        if(typeof key!=='string'||key.length<10||key.length>512||!/^[\x21-\x7e]+$/.test(key))throw new ApiError('Enter a valid API key without spaces.');
        const value={key,model:modelId(input.model||DEFAULTS[p])};if(p==='gemini')value.speechModel=modelId(input.speechModel||DEFAULTS.speech);
        await vault.set(p,value);delete tested[p];json(res,200,{message:'Credential saved securely. Test the connection next.'});return;
      }
      if(route==='/api/provider/remove'){await vault.set(p,null);delete tested[p];json(res,200,{message:'Saved credential removed.'});return}
      const credential=await vault.get(p);if(!credential?.key)throw new ApiError('Add this provider’s API key in Settings → AI & Voice first.',409);
      if(route==='/api/provider/models'){json(res,200,await providers.listModels(p,credential,controller.signal));return}
      if(route==='/api/provider/test'){delete tested[p];result=await providers.test(p,credential,controller.signal);tested[p]=new Date().toISOString();json(res,200,result);return}
      if(route==='/api/chat'){result=await providers.chat(p,credential,history(input.messages),controller.signal,input.instructions);tested[p]=new Date().toISOString();json(res,200,result);return}
      if(route==='/api/voice'&&p==='gemini'){result=await providers.voice(credential,input.audio,controller.signal);tested[p]=new Date().toISOString();json(res,200,result);return}
      if(route==='/api/voice/test'&&p==='gemini'){json(res,200,{audio:await providers.speech(credential,'Hello. I am Lumen. It is good to hear you.',controller.signal)});return}
      if(route==='/api/speak'&&p==='gemini'){const text=typeof input.text==='string'?input.text.trim():'';if(!text)throw new ApiError('Provide text to speak.');if(text.length>4000)throw new ApiError('That reply is too long to read aloud.');json(res,200,{audio:await providers.speech(credential,text,controller.signal)});return}
      throw new ApiError('Unknown operation.',404);
    }catch(e){json(res,e instanceof ApiError?e.status:500,{error:e instanceof ApiError?e.message:'The local service could not complete the operation. Check storage and the service log.'})}finally{if(counted)active--}
  });
  server.requestTimeout=480000;server.headersTimeout=15000;
  server.on('close',()=>{Promise.resolve(runtime?.close()).catch(()=>{});Promise.resolve(offline.close()).catch(()=>{});Promise.resolve(accounts.close()).catch(()=>{});Promise.resolve(connectors.close()).catch(()=>{})});
  return server;
}
if(require.main===module) {
  const server=createServer(),port=Number(process.env.LUMEN_PORT||4173);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('LUMEN_PORT must be between 1024 and 65535.');
  server.listen(port,'127.0.0.1',()=>console.log('Lumen OS: http://127.0.0.1:'+port));
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'The Lumen port is already in use. Stop the other server first.':'Could not start Lumen.');process.exitCode=1});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close();server.closeIdleConnections();setTimeout(()=>process.exit(0),4000).unref()});
}
module.exports={createServer};
