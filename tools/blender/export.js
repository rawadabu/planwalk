// Export the viewer's house as GLB + world-space camera views. node export.js <houseId> <outdir>
const {chromium}=require('playwright'); const fs=require('fs'); const [,, id, out]=process.argv;
const VIEWS=[['living',1,[800,1300],[250,1000]],['kitchen',1,[480,570],[200,250]],['seating',1,[330,640],[640,1260]],['master',2,[440,1440],[150,1150]],['kids',2,[395,385],[120,110]],['pano',1,[480,1140],[480,900]]];
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:800,height:500}}); p.on('pageerror',e=>console.log('pageerror',e.message));
await p.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.fulfill({status:200,body:'',contentType:'text/css'}));
await p.goto(`http://127.0.0.1:5173/?test#/h/${id}?test`);
await p.waitForFunction(()=>!!document.querySelector('.roomcard'),null,{timeout:240000}); await p.waitForTimeout(2500);
const at=async(f,[x,y])=>{ await p.evaluate(([f,x,y])=>window.__viewer.goTo(f,x,y,0),[f,x,y]); await p.waitForTimeout(700); return p.evaluate(()=>{const c=window.__exp.camera.instance; c.updateMatrixWorld(); const v=c.getWorldPosition(new c.position.constructor()); return [v.x,v.y,v.z]}) };
const views=[]; for(const [name,f,pos,tgt] of VIEWS){ const a=await at(f,pos), t=await at(f,tgt); views.push({name,pos:a,target:t}) }
const b64=await p.evaluate(async()=>{ const buf=await window.__viewer.exportGLB(); const u=new Uint8Array(buf); let s=''; const CH=0x8000; for(let i=0;i<u.length;i+=CH) s+=String.fromCharCode.apply(null,u.subarray(i,i+CH)); return btoa(s) });
fs.mkdirSync(out,{recursive:true}); fs.writeFileSync(out+'/house.glb',Buffer.from(b64,'base64')); fs.writeFileSync(out+'/views.json',JSON.stringify(views,null,1));
console.log('glb MB',(fs.statSync(out+'/house.glb').size/1e6).toFixed(1), JSON.stringify(views.slice(0,2))); await b.close();})();
