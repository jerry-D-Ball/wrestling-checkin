// Drives the real signup.html in a phone-sized browser, with the Sheet and Apps Script replaced by test/mock.js.
// All names are made up.
const SHOTS=process.env.SHOTS||require('os').tmpdir();
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');const assert=require('assert');
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  {
    const html=fs.readFileSync(path.join(__dirname,'../signup.html'),'utf8'),mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'),code=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
    const shim=`<script>${mock}</script><script>${code}</script><script>
    var q=new URLSearchParams(location.search); __now=new Date('2026-11-12T01:15:00Z');
    var c=__book.insertSheet('Config');c.appendRow(['Key','Value','What it does']);c.appendRow(['SIGNUP_SHEET_ID','SIGNUPID','']);
    var sg=__signup.insertSheet('Sign-Ups');sg.appendRow(['Signed Up','Student Name','Student Email','Parent Name','Parent Email']);
    window.__fail=false; window.__calls=0; window.WP_TEAM='West Point Dragons Wrestling'; window.WP_API='https://mock.invalid/exec';
    window.fetch=function(u,o){window.__calls++;return new Promise(function(res,rej){setTimeout(function(){if(window.__fail)return rej(new TypeError('net'));
      var j=q.get('old')?{ok:false,error:'BAD',message:'Unknown request. The app may need to be reloaded.'}:JSON.parse(doPost({postData:{contents:o.body}}).__text);
      res({ok:true,json:function(){return Promise.resolve(j);}});},150);});};</script>`;
    const out=html.replace('<script src="config.js"></script>',()=>shim);
    if(out===html)throw new Error('harness injection failed');
    fs.writeFileSync(path.join(__dirname,'harness-signup.html'),out);
  }
  const U='file://'+path.join(__dirname,'harness-signup.html');
  const shot=(n)=>p.screenshot({path:path.join(SHOTS,n+'.png'),fullPage:true});
  const rows=()=>p.evaluate(()=>__signup.getSheetByName('Sign-Ups').data);
  let n=0;const ok=(c,m)=>{n++;assert.ok(c,m);};
  await p.goto(U);
  ok((await p.innerText('.top')).includes('West Point Dragons Wrestling')&&(await p.innerText('.top')).includes('Future Freshman Night'),'header');
  await shot('s1-form');
  // empty submit: nothing sent, first field flagged and focused
  await p.click('#go');
  ok(await p.isVisible('#e-student')&&(await p.evaluate(()=>document.activeElement.id))==='student'&&(await p.evaluate(()=>window.__calls))===0,'empty form is stopped before sending');
  await p.fill('#student','Mateo Rivera');ok(!(await p.isVisible('#e-student')),'error clears when typing');
  await p.fill('#studentEmail','mateo@');await p.fill('#parent','Ana Rivera');await p.fill('#parentEmail','ana@example.com');
  await p.press('#parentEmail','Enter');
  ok(await p.isVisible('#e-studentEmail')&&(await p.getAttribute('#studentEmail','aria-invalid'))==='true','bad optional email is flagged');await shot('s2-error');
  await p.fill('#studentEmail','');
  // network down: clear message, nothing lost, retry works
  await p.evaluate(()=>{window.__fail=true;});await p.click('#go');await p.waitForSelector('#err:not([hidden])');
  ok((await p.innerText('#err')).startsWith('Not saved.')&&(await p.inputValue('#parentEmail'))==='ana@example.com'&&!(await p.isDisabled('#go')),'offline: says not saved, keeps what was typed');await shot('s3-offline');
  await p.evaluate(()=>{window.__fail=false;});await p.click('#go');
  ok(await p.isDisabled('#go'),'button locks while sending');
  await p.waitForSelector('#done:not([hidden])');
  ok((await p.innerText('#done')).includes("YOU'RE ON THE LIST")&&(await p.innerText('#who'))==='Mateo Rivera'&&!(await p.isVisible('#form')),'green confirmation');await shot('s4-done');
  let d=await rows();ok(d.length===2&&d[1].join('|')==='2026-11-11 18:15:00|Mateo Rivera||Ana Rivera|ana@example.com','row landed in the sign-up Sheet');
  // another student on the same phone
  await p.click('#again');
  ok(await p.isVisible('#form')&&(await p.inputValue('#student'))===''&&(await p.inputValue('#parentEmail'))===''&&(await p.evaluate(()=>document.activeElement.id))==='student','form comes back empty');
  await p.fill('#student','  leo   rivera ');await p.fill('#studentEmail','LEO@Example.com');await p.fill('#parent','Ana Rivera');await p.fill('#parentEmail',' Ana@Example.com ');await p.click('#go');await p.waitForSelector('#done:not([hidden])');
  d=await rows();ok(d.length===3&&d[2].join('|')==='2026-11-11 18:15:00|leo rivera|leo@example.com|Ana Rivera|ana@example.com','spaces trimmed, emails lower-cased');
  // tap targets and input font size (no iOS zoom)
  await p.click('#again');
  const m=await p.evaluate(()=>['student','studentEmail','parent','parentEmail','go'].map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {h:r.height,f:parseFloat(getComputedStyle(e).fontSize)};}));
  ok(m.every(x=>x.h>=48&&x.f>=16),'tap targets 48px+, text 16px+: '+JSON.stringify(m));
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll on a phone');
  // Sheet script not updated yet
  await p.goto(U+'?old=1');await p.fill('#student','Nia Cole');await p.fill('#parent','Dee Cole');await p.fill('#parentEmail','dee@example.com');await p.click('#go');await p.waitForSelector('#err:not([hidden])');
  ok(/not turned on yet/.test(await p.innerText('#err')),'old Sheet script: plain message, no false success');await shot('s5-not-on');
  ok(errs.length===0,'no page errors: '+errs.join(' | '));
  await b.close();
  console.log('ALL',n,'SIGN-UP PAGE CHECKS PASSED');
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
