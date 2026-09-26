'use strict';
// Minimal stdio MCP bridge over Lumen's existing permission-gated adapters.
// Each request reloads permissions from disk so revocation fails closed.
const path=require('node:path'),readline=require('node:readline');
const {createCapabilities}=require('./capabilities.cjs');

const directory=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!path.isAbsolute(directory)){process.exitCode=2;return}

const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const result=(id,value)=>send({jsonrpc:'2.0',id,result:value});
const error=(id,code,message)=>send({jsonrpc:'2.0',id,error:{code,message}});
const capabilities=()=>createCapabilities({directory});
const tools=()=>capabilities().toolSchemas().map(tool=>({name:tool.name,description:tool.description,inputSchema:tool.parameters}));

async function handle(message){
  if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string')return;
  if(message.method==='notifications/initialized'||message.method.startsWith('notifications/'))return;
  if(!Object.hasOwn(message,'id'))return;
  if(message.method==='initialize')return result(message.id,{protocolVersion:message.params?.protocolVersion||'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'lumen-permissions',version:'0.4.0'}});
  if(message.method==='ping')return result(message.id,{});
  if(message.method==='tools/list')return result(message.id,{tools:tools()});
  if(message.method==='tools/call'){
    const name=message.params?.name,args=message.params?.arguments;
    if(!tools().some(tool=>tool.name===name))return error(message.id,-32602,'That Lumen capability is not currently granted.');
    try{
      const value=await capabilities().run(name,args&&typeof args==='object'?args:{});
      return result(message.id,{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
    }catch(e){
      const messageText=e?.status&&e.status<500?String(e.message||'Capability denied.'):'The Lumen capability could not complete the request.';
      return result(message.id,{content:[{type:'text',text:messageText}],isError:true});
    }
  }
  error(message.id,-32601,'Method not found.');
}

const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',line=>{let message;try{message=JSON.parse(line)}catch{return}Promise.resolve(handle(message)).catch(()=>{if(Object.hasOwn(message,'id'))error(message.id,-32603,'Internal error.')})});
