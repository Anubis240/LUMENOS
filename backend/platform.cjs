'use strict';
const os = require('node:os');
const fs = require('node:fs/promises');
const {spawn,execFile} = require('node:child_process');
const {ApiError} = require('./providers.cjs');
const APPS = [
  {id:'files', name:'File manager', executable:'/usr/bin/thunar', icon:'files'},
  {id:'browser', name:'Web browser', executable:'/usr/bin/chromium', icon:'browser'},
  {id:'terminal', name:'Linux terminal', executable:'/usr/bin/xfce4-terminal', icon:'terminal'},
  {id:'settings', name:'Linux settings', executable:'/usr/bin/xfce4-settings-manager', icon:'settings'},
  {id:'installer', name:'Install Lumen OS', executable:'/usr/local/bin/lumen-installer', icon:'installer'},
];
function createPlatform({directory, platform=process.platform, launcher=spawn}={}) {
  async function apps() {
    return Promise.all(APPS.map(async a=>({id:a.id,name:a.name,icon:a.icon,available:platform==='linux'&&await fs.access(a.executable,fs.constants.X_OK).then(()=>true,()=>false)})));
  }
  async function status() {
    const cpus=os.cpus();let disk=null;
    if(directory)try {const d=await fs.statfs(directory);disk={total:d.blocks*d.bsize,available:d.bavail*d.bsize}}catch{}
    return {platform,release:os.release(),architecture:os.arch(),memory:{total:os.totalmem(),free:os.freemem()},cpu:{model:cpus[0]?.model||'Unknown',threads:cpus.length},uptime:os.uptime(),disk,apps:await apps(),version:'0.6.0',session:platform==='linux'?'Linux desktop service':'Windows development preview'};
  }
  async function launch(id, url) {
    if(platform!=='linux')throw new ApiError('Native applications become available in the Linux session.',409);
    const app=APPS.find(a=>a.id===id);if(!app)throw new ApiError('Unknown application.');
    if(!(await apps()).find(a=>a.id===id).available)throw new ApiError('This application is not installed.',409);
    const args=[];
    if(id==='browser') {args.push('--force-dark-mode');if(url!==undefined){let u;try{u=new URL(url)}catch{throw new ApiError('Enter a valid website address.')}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.href.length>2048)throw new ApiError('Use an http or https website without embedded credentials.');args.push('--new-window',u.href)}else args.push('--new-window','about:blank')}
    await new Promise((resolve,reject)=>{const child=launcher(app.executable,args,{detached:true,stdio:'ignore',env:process.env});child.once('error',()=>reject(new ApiError('The application could not be started. Check the Linux session.',502)));child.once('spawn',()=>{child.unref();resolve()})});
    return {message:app.name+' opened.'};
  }
  async function offlineEngine(){return{bundled:platform==='linux'&&await fs.access('/opt/lumen-ollama/bin/ollama',fs.constants.X_OK).then(()=>true,()=>false)}}
  async function startOffline(){if(!(await offlineEngine()).bundled)throw new ApiError('Install and start Ollama on this device first.',409);await new Promise((resolve,reject)=>execFile('/usr/bin/systemctl',['--user','start','lumen-offline.service'],{timeout:10000},e=>e?reject(new ApiError('The local engine could not start. Check its user service log.',502)):resolve()));return{message:'Local engine started. Choose a model to download.'}}
  return {status,apps,launch,offlineEngine,startOffline};
}
module.exports={createPlatform,APPS};
