'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),readline=require('node:readline'),{spawn}=require('node:child_process');

test('MCP bridge lists only granted tools and observes revocation on every call',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lumen-mcp-'));
  await fs.writeFile(path.join(directory,'permissions.json'),JSON.stringify({system:true,files:false,web:false,roots:[]}));
  const child=spawn(process.execPath,[path.join(__dirname,'..','backend','mcp-server.cjs'),directory],{stdio:['pipe','pipe','pipe']});
  t.after(async()=>{child.kill();await fs.rm(directory,{recursive:true,force:true})});
  const waiting=new Map(),lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{const value=JSON.parse(line);const done=waiting.get(value.id);if(done){waiting.delete(value.id);done(value)}});
  let id=0;const call=(method,params={})=>new Promise((resolve,reject)=>{const current=++id,timer=setTimeout(()=>{waiting.delete(current);reject(new Error('MCP timeout'))},3000);waiting.set(current,value=>{clearTimeout(timer);resolve(value)});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:current,method,params})+'\n')});
  const init=await call('initialize',{protocolVersion:'2025-06-18'});assert.equal(init.result.serverInfo.name,'lumen-permissions');
  const listed=await call('tools/list');assert.deepEqual(listed.result.tools.map(tool=>tool.name),['get_system_info']);
  const info=await call('tools/call',{name:'get_system_info',arguments:{}});assert.equal(info.result.isError,undefined);assert.match(info.result.content[0].text,/"platform"/);
  await fs.writeFile(path.join(directory,'permissions.json'),JSON.stringify({system:false,files:false,web:false,roots:[]}));
  const denied=await call('tools/call',{name:'get_system_info',arguments:{}});assert.equal(denied.error.code,-32602);
  const finalList=await call('tools/list');assert.deepEqual(finalList.result.tools,[]);
});
