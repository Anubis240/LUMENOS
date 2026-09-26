/* Procedural orb: bounded Canvas 2D geometry; no assets, frameworks, or GPU required. */
(() => {
  const canvas=document.getElementById('orb'),ctx=canvas.getContext('2d');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let state='idle',quality='balanced',reduced=motion.matches,last=0,phase=0,w=0,h=0,level=0;
  window.lumenOrb={setState(value){state=value;level=0;draw(phase)},setLevel(value){level=Math.max(0,Math.min(1,value))},configure(q,r){quality=q;reduced=r||motion.matches;draw(phase)},getState(){return state}};
  function resize(){const b=canvas.getBoundingClientRect();w=b.width;h=b.height;const d=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0);draw(phase)}
  new ResizeObserver(resize).observe(canvas);motion.addEventListener('change',()=>{reduced=motion.matches||document.body.classList.contains('reduced-motion');draw(phase)});
  function draw(t){
    if(!w||!h)return;ctx.clearRect(0,0,w,h);
    const cx=w/2,cy=h*.47,R=Math.min(w*.315,h*.355),busy=state==='thinking',listen=state==='listening',speak=state==='speaking',complete=state==='complete';
    const pulse=reduced?1:1+Math.sin(t*(speak?8:listen?4:1.1))*(speak?.02:listen?.015:.007)+(listen||speak?level*.055:0);
    ctx.save();ctx.translate(cx,cy);ctx.scale(pulse,pulse);
    const halo=ctx.createRadialGradient(0,0,R*.2,0,0,R*1.6);halo.addColorStop(0,'#7225dc20');halo.addColorStop(.55,'#8236ea45');halo.addColorStop(.7,'#9147ff2a');halo.addColorStop(1,'#8031ef00');ctx.fillStyle=halo;ctx.fillRect(-R*1.7,-R*1.7,R*3.4,R*3.4);
    const line=(radius,color,width=1)=>{ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()};
    for(let i=0;i<5;i++){ctx.setLineDash(i%2?[2,7]:[]);line(R*(1.11+i*.13),'#9855ec'+(i===0?'39':'20'),.6)}ctx.setLineDash([]);
    const turns=quality==='low'?16:quality==='high'?42:28,steps=quality==='low'?80:120;
    ctx.save();ctx.rotate(reduced?0:t*(busy?.13:.018));ctx.globalCompositeOperation='screen';
    for(let j=0;j<turns;j++){
      const a=j/turns*Math.PI*2+t*.045;ctx.beginPath();
      for(let k=0;k<=steps;k++){
        const p=k/steps*Math.PI*2;const x=Math.cos(p)*R;const y=Math.sin(p)*R*Math.sin(a);
        const angle=.65*Math.sin(a*.8)+t*.015;const xx=x*Math.cos(angle)-y*Math.sin(angle), yy=x*Math.sin(angle)+y*Math.cos(angle);
        if(k===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
      }
      ctx.strokeStyle=`hsla(${complete?260:269+j%20},95%,${60+j%22}%,${busy?.3:.23})`;ctx.lineWidth=.8;ctx.stroke();
    }
    // Fine, bounded filaments give the sphere a living texture without a bitmap.
    const filaments=quality==='low'?10:quality==='high'?32:20;
    for(let j=0;j<filaments;j++){
      ctx.beginPath();for(let k=0;k<=100;k++){
        const p=k/100*Math.PI*2,rr=R*(.81+.12*Math.sin(p*7+j*1.7+t*.18)+.035*Math.sin(p*19-j));
        const x=Math.cos(p)*rr,y=Math.sin(p)*rr;
        if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }ctx.strokeStyle='#ad69ff24';ctx.lineWidth=.65;ctx.stroke();
    }
    ctx.restore();
    ctx.save();ctx.rotate(reduced?0:-t*.025);ctx.strokeStyle='#c38cff80';ctx.lineWidth=.8;
    const flower=R*.48;
    for(let i=0;i<6;i++){let a=i*Math.PI/3;ctx.beginPath();ctx.arc(Math.cos(a)*flower,Math.sin(a)*flower,flower,0,Math.PI*2);ctx.stroke()}
    line(flower,'#daaaff55',.65);ctx.restore();
    ctx.shadowColor='#9a4bff';ctx.shadowBlur=quality==='low'?8:22;line(R,'#d8a8ffdf',1.4);line(R*.985,'#ad73ff9c',2);ctx.shadowBlur=0;
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4+(reduced?0:t*(busy?.22:.028)),radius=i%2?R*.97:R;
      star(Math.cos(a)*radius,Math.sin(a)*radius,i%2?2:4);
    }
    star(0,0,7);ctx.strokeStyle='#bb78ff2a';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(-w/2,0);ctx.lineTo(w/2,0);ctx.moveTo(0,-h/2);ctx.lineTo(0,R*1.26);ctx.stroke();
    if(listen||speak||complete){for(let i=0;i<3;i++){const v=reduced?i/3:((t*.4+i/3)%1);line(R*(1+v*.5),`rgba(197,143,255,${(1-v)*.24})`,1)}}
    ctx.restore();
    function star(x,y,s){const glow=ctx.createRadialGradient(x,y,0,x,y,s*6);glow.addColorStop(0,'#fff5ff');glow.addColorStop(.12,'#e7c9ffdc');glow.addColorStop(.4,'#b866ff40');glow.addColorStop(1,'#9655ff00');ctx.fillStyle=glow;ctx.fillRect(x-s*6,y-s*6,s*12,s*12);ctx.strokeStyle='#f3ddffa0';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(x-s*3,y);ctx.lineTo(x+s*3,y);ctx.moveTo(x,y-s*4);ctx.lineTo(x,y+s*4);ctx.stroke()}
  }
  function tick(now){requestAnimationFrame(tick);if(document.hidden||reduced)return;const interval=quality==='high'?1000/45:quality==='low'?1000/20:1000/30;if(now-last<interval)return;phase+=Math.min((now-last)/1000,.1);last=now;draw(phase)}
  requestAnimationFrame(tick);
})();
