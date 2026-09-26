class LumenCapture extends AudioWorkletProcessor {
  constructor(){super();this.buffer=new Float32Array(1024);this.offset=0;this.port.onmessage=e=>{if(e.data==='flush'){if(this.offset)this.port.postMessage(this.buffer.slice(0,this.offset));this.offset=0;this.port.postMessage('flushed')}}}
  process(inputs){const data=inputs[0]?.[0];if(data)for(const value of data){this.buffer[this.offset++]=value;if(this.offset===this.buffer.length){this.port.postMessage(this.buffer);this.buffer=new Float32Array(1024);this.offset=0}}return true}
}
registerProcessor('lumen-capture',LumenCapture);
