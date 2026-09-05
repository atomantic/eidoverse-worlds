// Disposable sequencer + actual browser client; no lived-in world is touched.
import {chromium} from 'playwright';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {strict as a} from 'node:assert';
const dir=mkdtempSync(`${tmpdir()}/eido-label-world-`),port=18973;
const server=Bun.spawn([process.execPath,'server/server.ts'],{env:{...process.env,PORT:String(port),JOIN_TOKEN:'label-test',WORLDS_DIR:dir},stdout:'ignore',stderr:'ignore'});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://localhost:${port}/version`)).ok)break;}catch{}await Bun.sleep(100);}
 browser=await chromium.launch({executablePath:process.env.CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://localhost:${port}/?spectate&key=label-test&world=labels`);
 await page.getByText('Inspect objects',{exact:true}).waitFor({timeout:60000});
 await page.evaluate(async()=>{
  const [{state,hydrate},{entities},{THREE,camera,scene},{tickObjectLabels}]=await Promise.all([import('/lib/state.js'),import('/lib/world.js'),import('/lib/core.js'),import('/lib/objectlabels.js')]);
  camera.position.set(0,2,8);camera.lookAt(0,1,0);camera.updateMatrixWorld();
  const snapshot=structuredClone(state.st);snapshot.entities={};
  for(let i=0;i<100;i++){
   const id=`test-${i}`;snapshot.entities[id]={id,kind:'light',pos:[0,0,0],color:'#ffffff',intensity:0,comp:i?{label:{name:i===1?'<img onerror=alert(1)> Library':'Plaque '+i,visibility:'always'}}:{}};
  }
  hydrate(snapshot);
  for(let i=0;i<100;i++){
   const obj=new THREE.Mesh(new THREE.BoxGeometry(0.5,1,0.5),new THREE.MeshBasicMaterial());obj.position.set((i%10-5)*0.12,0,-Math.floor(i/10)*0.12);scene.add(obj);obj.updateMatrixWorld();entities.set(`test-${i}`,obj);
  }
  tickObjectLabels(performance.now()+1000);
  window.labelTick=tickObjectLabels;
 });
 await page.getByText('Inspect objects',{exact:true}).click();
 await page.getByLabel('Choose object to inspect').selectOption('test-1');
 a.match(await page.locator('details').filter({hasText:'Inspect objects'}).innerText(),/<img onerror=alert\(1\)> Library/);
 a.equal(await page.locator('details img').count(),0);
 await page.getByLabel('Object labels',{exact:true}).selectOption('off');
 await page.evaluate(()=>window.labelTick(performance.now()+2000));
 a.equal(await page.locator('body > div > span').filter({visible:true}).count(),0);
 await page.getByLabel('Choose object to inspect').selectOption('test-0');
 a.match(await page.locator('details').filter({hasText:'Inspect objects'}).innerText(),/Entity: test-0/);
 await page.getByLabel('Object labels',{exact:true}).selectOption('all');
 const result=await page.evaluate(async()=>{
  const start=performance.now();for(let i=0;i<100;i++)window.labelTick(performance.now()+3000+i*101);
  const spans=[...document.querySelectorAll('body > div > span')].filter(el=>el.style.position==='absolute');
  return {ms:performance.now()-start,pool:spans.length,visible:spans.filter(el=>el.style.display!=='none').length,overflow:document.documentElement.scrollWidth>innerWidth};
 });
 a.equal(result.pool,32);a.equal(result.visible,32);a.equal(result.overflow,false);
 await page.screenshot({path:'/tmp/eido-label-narrow.png'});
 // Read-only controls must never send a logged verb or claim a lease.
 const sent=await page.evaluate(async()=>{
  const {net}=await import('/lib/net.js');const messages=[];const original=WebSocket.prototype.send;
  WebSocket.prototype.send=function(data){messages.push(String(data));return original.call(this,data);};window.labelMessages=messages;return true;
 });
 await page.getByLabel('Choose object to inspect').selectOption('test-2');
 await page.getByRole('button',{name:'Inspect centered object'}).focus();
 await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Pick an object'}).click();
 await page.mouse.click(195,430);
 await page.mouse.move(195,430);await page.mouse.down();await page.mouse.move(245,450);await page.mouse.up();
 a.equal(await page.evaluate(()=>window.labelMessages.some(s=>{try{const m=JSON.parse(s);return m.type==='verb'||m.type==='lease';}catch{return false;}})),false);
 const offMs=await page.evaluate(async()=>{
  const pref=document.querySelector('select[aria-label="Object labels"]');pref.value='off';pref.dispatchEvent(new Event('change'));
  const start=performance.now();for(let i=0;i<100;i++)window.labelTick(performance.now()+20000+i*101);return performance.now()-start;
 });
 console.log(JSON.stringify({result,offMs,errors},null,2));
 a.equal(errors.length,0);
}finally{await browser?.close();server.kill();await server.exited;rmSync(dir,{recursive:true,force:true});}
