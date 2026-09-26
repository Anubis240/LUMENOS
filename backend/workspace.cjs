'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {constants}=require('node:fs'),{randomUUID}=require('node:crypto');
const {ApiError}=require('./providers.cjs');
const MAX_BYTES=64*1024,EXTENSIONS=new Set(['.txt','.md','.json','.csv','.yaml','.yml']);
const fail=()=>new ApiError('Use a regular text file inside the Lumen workspace.',400);
function createWorkspace({directory}){
 const root=path.resolve(directory);
 async function checkParents(target,create=false){
  const parsed=path.parse(target);let current=parsed.root;
  for(const component of target.slice(parsed.root.length).split(path.sep).filter(Boolean)){
   current=path.join(current,component);let info;
   try{info=await fs.lstat(current)}catch(e){if(e.code!=='ENOENT'||!create)throw e;try{await fs.mkdir(current,{mode:0o700})}catch(err){if(err.code!=='EEXIST')throw err}info=await fs.lstat(current)}
   if(info.isSymbolicLink()||!info.isDirectory())throw fail();
  }
 }
 const ready=checkParents(root,true);
 function resolve(name){
  if(typeof name!=='string'||!name||name.length>240||name.includes('\\')||path.isAbsolute(name)||name.includes(':'))throw fail();
  const parts=name.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||/[\x00-\x1f<>"|?*]/.test(p)||/[ .]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw fail();
  if(!EXTENSIONS.has(path.extname(name).toLowerCase()))throw new ApiError('Supported workspace files: .txt, .md, .json, .csv, .yaml and .yml.',400);
  const target=path.resolve(root,...parts),relative=path.relative(root,target);
  if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw fail();return target;
 }
 async function regular(target){await checkParents(path.dirname(target));const s=await fs.lstat(target);if(s.isSymbolicLink()||!s.isFile()||s.nlink>1)throw fail();if(s.size>MAX_BYTES)throw new ApiError('Workspace text files must be 64 KB or smaller.',413);return s}
 async function list(){
  await ready;await checkParents(root);const files=[];
  async function walk(dir,depth){if(depth>5||files.length>=200)return;for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(files.length>=200)break;if(e.name.startsWith('.')||e.isSymbolicLink())continue;const p=path.join(dir,e.name);if(e.isDirectory()){await checkParents(p);await walk(p,depth+1)}else if(e.isFile()&&EXTENSIONS.has(path.extname(e.name).toLowerCase())){try{const s=await regular(p);files.push({path:path.relative(root,p).split(path.sep).join('/'),name:e.name,size:s.size})}catch(e){if(!(e instanceof ApiError))throw e}}}}
  await walk(root,0);return files;
 }
 async function read(name){
  await ready;const target=resolve(name);let file;
  try{const before=await regular(target);file=await fs.open(target,constants.O_RDONLY|(constants.O_NOFOLLOW||0));const opened=await file.stat();if(!opened.isFile()||opened.nlink>1||opened.size>MAX_BYTES||opened.ino!==before.ino||opened.dev!==before.dev)throw fail();await checkParents(path.dirname(target));const buffer=Buffer.alloc(MAX_BYTES+1);let used=0;while(used<buffer.length){const {bytesRead}=await file.read(buffer,used,buffer.length-used,null);if(!bytesRead)break;used+=bytesRead}if(used>MAX_BYTES)throw new ApiError('Workspace text files must be 64 KB or smaller.',413);const content=buffer.subarray(0,used).toString('utf8');if(content.includes('\0'))throw fail();return{path:name,content}}
  catch(e){if(e.code==='ENOENT')throw new ApiError('Workspace file was not found.',404);if(e.code==='ELOOP')throw fail();throw e}finally{await file?.close()}
 }
 async function create(name,content){
  await ready;if(typeof content!=='string'||content.includes('\0')||Buffer.byteLength(content)>MAX_BYTES)throw new ApiError('Enter text of 64 KB or less.',400);const target=resolve(name);let file;
  try{await checkParents(path.dirname(target));file=await fs.open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW||0),0o600);await checkParents(path.dirname(target));await file.writeFile(content,'utf8');await file.sync();return{path:name,name:path.basename(name),size:Buffer.byteLength(content)}}catch(e){if(e.code==='EEXIST')throw new ApiError('A file already has that name. Choose a new name; existing files are never overwritten.',409);if(e.code==='ENOENT')throw new ApiError('The workspace folder does not exist.',404);throw e}finally{await file?.close()}
 }
 async function writeNote(content){return create('lumen-note-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.md',content)}
 function systemInfo(){const cpus=os.cpus();return{platform:os.platform(),architecture:os.arch(),totalMemoryBytes:os.totalmem(),freeMemoryBytes:os.freemem(),cpuCount:cpus.length,cpuModel:cpus[0]?.model||'Unknown',uptimeSeconds:Math.round(os.uptime())}}
 return{ready,list,read,create,writeNote,systemInfo};
}
module.exports={createWorkspace,MAX_BYTES};
