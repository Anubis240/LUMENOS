(() => {
  let stream,context,node,source,timer,parts=[],active=false,starting=false,version=0,playback,playContext,playReject,playVersion=0;
  // Always-listening (continuous) mode state.
  let cStream,cContext,cNode,cSource,continuousOn=false,continuousPaused=false,suspend=false,suspendTimer;
  const emit=(type,detail={})=>window.dispatchEvent(new CustomEvent('lumen-voice',{detail:{type,...detail}}));
  function cleanup(){clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());source?.disconnect();node?.disconnect();if(context)context.close().catch(()=>{});stream=context=node=source=null;active=starting=false}
  function cancel(){version++;cleanup();parts=[];emit('idle')}

  // Downsample mono Float32 chunks to a 16 kHz 16-bit PCM WAV, base64-encoded.
  function encodeWav(chunks,rate){
    const count=chunks.reduce((n,p)=>n+p.length,0);
    const all=new Float32Array(count);let off=0;for(const p of chunks){all.set(p,off);off+=p.length}
    const frames=Math.min(480000,Math.floor(count*16000/rate)),buffer=new ArrayBuffer(44+frames*2),v=new DataView(buffer);
    const str=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i))};
    str(0,'RIFF');v.setUint32(4,36+frames*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,frames*2,true);
    for(let i=0;i<frames;i++){const from=Math.floor(i*rate/16000),to=Math.max(from+1,Math.floor((i+1)*rate/16000));let sum=0;for(let j=from;j<to;j++)sum+=all[j]||0;v.setInt16(44+i*2,Math.max(-1,Math.min(1,sum/(to-from)))*32767,true)}
    const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }

  async function start(){if(active||starting)return;stopPlayback();const run=++version;starting=true;parts=[];emit('starting');try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires the local server and a supported browser.');const media=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});if(run!==version){media.getTracks().forEach(t=>t.stop());return}stream=media;context=new AudioContext();await context.resume();await context.audioWorklet.addModule('audio-capture.js');if(run!==version)return;source=context.createMediaStreamSource(stream);node=new AudioWorkletNode(context,'lumen-capture');node.port.onmessage=e=>{if(e.data instanceof Float32Array){parts.push(e.data);let energy=0;for(const n of e.data)energy+=n*n;emit('level',{level:Math.min(1,Math.sqrt(energy/e.data.length)*6)})}};const mute=context.createGain();mute.gain.value=0;source.connect(node);node.connect(mute);mute.connect(context.destination);active=true;starting=false;emit('recording');timer=setTimeout(()=>stop(),30000)}catch(e){if(run!==version)return;cleanup();emit('error',{message:e.name==='NotAllowedError'?'Microphone permission was denied. Allow it in your browser to use voice.':e.name==='NotFoundError'?'No microphone was found.':e.message})}}
  async function stop(){if(starting){cancel();return}if(!active)return;const run=version;active=false;const rate=context.sampleRate;clearTimeout(timer);await new Promise(resolve=>{const handler=node.port.onmessage;node.port.onmessage=e=>{if(e.data==='flushed')resolve();else handler(e)};node.port.postMessage('flush');setTimeout(resolve,150)});if(run!==version)return;const chunks=parts;parts=[];cleanup();const count=chunks.reduce((n,p)=>n+p.length,0);if(count/rate<.5){emit('error',{message:'Hold the microphone for at least half a second.'});return}emit('recorded',{audio:encodeWav(chunks,rate)})}

  // ---- Always-listening: continuous capture with simple voice-activity detection ----
  function cleanupContinuous(){cStream?.getTracks().forEach(t=>t.stop());cSource?.disconnect();cNode?.disconnect();if(cContext)cContext.close().catch(()=>{});cStream=cContext=cNode=cSource=null}
  async function startContinuous(){
    if(continuousOn)return;continuousOn=true;continuousPaused=false;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires the local server and a supported browser.');
      const media=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(!continuousOn){media.getTracks().forEach(t=>t.stop());return}
      cStream=media;cContext=new AudioContext();await cContext.resume();
      await cContext.audioWorklet.addModule('audio-capture.js');
      if(!continuousOn)return;
      cSource=cContext.createMediaStreamSource(cStream);
      cNode=new AudioWorkletNode(cContext,'lumen-capture');
      const rate=cContext.sampleRate;
      const START=0.020,END=0.011;                        // RMS gates for speech / silence
      const HANG=Math.max(18,Math.round(rate/1024*0.7));  // trailing silence that ends an utterance (~0.7s)
      const MINLEN=0.35*rate,MAXLEN=18*rate;
      const PREMAX=Math.max(4,Math.round(rate/1024*0.25)); // pre-roll kept before speech is detected
      let inSpeech=false,silent=0,seg=[],pre=[];
      cNode.port.onmessage=e=>{
        const d=e.data;if(!(d instanceof Float32Array))return;
        let energy=0;for(const n of d)energy+=n*n;const rms=Math.sqrt(energy/d.length);
        if(suspend||continuousPaused){inSpeech=false;silent=0;seg=[];pre=[];return}
        emit('level',{level:Math.min(1,rms*6)});
        pre.push(d);if(pre.length>PREMAX)pre.shift();
        if(!inSpeech){
          if(rms>START){inSpeech=true;silent=0;seg=pre.slice()}
        }else{
          seg.push(d);
          if(rms<END)silent++;else silent=0;
          const len=seg.reduce((n,p)=>n+p.length,0);
          if(silent>=HANG||len>=MAXLEN){
            inSpeech=false;const done=seg;seg=[];silent=0;
            if(len>=MINLEN&&!suspend)emit('recorded',{audio:encodeWav(done,rate),continuous:true});
          }
        }
      };
      const sink=cContext.createGain();sink.gain.value=0;
      cSource.connect(cNode);cNode.connect(sink);sink.connect(cContext.destination);
      emit('continuous',{state:'listening'});
    }catch(err){
      continuousOn=false;cleanupContinuous();
      emit('error',{message:err.name==='NotAllowedError'?'Microphone permission was denied. Allow it to use always-listening.':err.name==='NotFoundError'?'No microphone was found.':err.message});
      emit('continuous',{state:'off'});
    }
  }
  function stopContinuous(){continuousOn=false;continuousPaused=false;cleanupContinuous();emit('level',{level:0});emit('continuous',{state:'off'})}
  function pauseContinuous(v){if(!continuousOn)return;continuousPaused=v!==undefined?!!v:!continuousPaused;emit('level',{level:0});emit('continuous',{state:continuousPaused?'paused':'listening'})}

  function stopPlayback(){playVersion++;if(playback){playback.onended=null;try{playback.stop()}catch{}playback=null}if(playContext){playContext.close().catch(()=>{});playContext=null}if(playReject){const reject=playReject;playReject=null;reject(new DOMException('Playback stopped.','AbortError'))}clearTimeout(suspendTimer);suspend=false}
  async function play(audio){stopPlayback();suspend=true;const playRun=playVersion;const bytes=Uint8Array.from(atob(audio.pcm),c=>c.charCodeAt(0));if(bytes.length%2||bytes.length>12000000){suspend=false;throw new Error('Invalid speech audio.')}playContext=new AudioContext({sampleRate:audio.rate});await playContext.resume();if(playRun!==playVersion){suspend=false;throw new DOMException('Playback stopped.','AbortError')}const buffer=playContext.createBuffer(1,bytes.length/2,audio.rate),samples=buffer.getChannelData(0),dv=new DataView(bytes.buffer);for(let i=0;i<samples.length;i++)samples[i]=dv.getInt16(i*2,true)/32768;playback=playContext.createBufferSource();playback.buffer=buffer;const analyser=playContext.createAnalyser();analyser.fftSize=256;playback.connect(analyser);analyser.connect(playContext.destination);const meter=new Float32Array(256);emit('speaking');const measure=()=>{if(!playback)return;analyser.getFloatTimeDomainData(meter);let sum=0;for(const x of meter)sum+=x*x;emit('level',{level:Math.min(1,Math.sqrt(sum/meter.length)*4)});requestAnimationFrame(measure)};requestAnimationFrame(measure);await new Promise((resolve,reject)=>{playReject=reject;playback.onended=()=>{playReject=null;playback=null;playContext.close().catch(()=>{});playContext=null;clearTimeout(suspendTimer);suspendTimer=setTimeout(()=>{suspend=false},450);emit('idle');resolve()};playback.start()})}
  window.addEventListener('pagehide',()=>{cancel();stopContinuous();stopPlayback()});
  window.lumenVoice={start,stop,cancel,play,stopPlayback,startContinuous,stopContinuous,pauseContinuous,get active(){return active||starting},get continuous(){return continuousOn},get listening(){return continuousOn&&!continuousPaused}};
})();
