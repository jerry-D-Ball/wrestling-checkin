const SHOTS=process.env.SHOTS||require('os').tmpdir();
const {chromium}=require('playwright');const path=require('path');const assert=require('assert');
(async()=>{
  const b=await chromium.launch();const AT={latitude:33.4735,longitude:-112.3085,accuracy:20}, FAR={latitude:33.4484,longitude:-112.0740,accuracy:15};
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,geolocation:AT,permissions:['geolocation']});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  const fs=require('fs');
  { // build a local harness: the real index.html, with the Sheet and Apps Script replaced by test/mock.js
    const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'),code=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
    const shim=`<script>${mock}</script><script>${code}</script><script>
    __seedOld(); var q=new URLSearchParams(location.search); __now=new Date(q.get('now')||'2026-11-05T22:58:00Z');
    if(sessionStorage.book){var b=JSON.parse(sessionStorage.book);Object.keys(b).forEach(function(k){__book.insertSheet(k).data=b[k];});}
    else{var c=__book.insertSheet('Config');c.appendRow(['Key','Value','What it does']);c.appendRow(['OLD_SHEET_ID','OLDID','']);setup();c.data.forEach(function(r){if(r[0]==='COACH_PIN')r[1]='123456';});c.appendRow(['SCHOOL_LAT','33.473388','']);c.appendRow(['SCHOOL_LNG','-112.308543','']);}
    function persist(){var o={};Object.keys(__book.sheets).forEach(function(k){o[k]=__book.sheets[k].data;});sessionStorage.book=JSON.stringify(o);}
    window.__fail=false; window.WP_TEAM='West Point Wrestling'; window.WP_API='https://mock.invalid/exec';
    window.fetch=function(u,o){return new Promise(function(res,rej){setTimeout(function(){if(window.__fail)return rej(new TypeError('net'));var out=doPost({postData:{contents:o.body}});persist();res({ok:true,json:function(){return Promise.resolve(JSON.parse(out.__text));}});},120);});};</script>`;
    const out=html.replace('<script src="config.js"></script>',()=>shim).replace('src="qrcode.js"','src="../qrcode.js"');
    if(out===html)throw new Error('harness injection failed');
    fs.writeFileSync(path.join(__dirname,'harness.html'),out);
  }
  const U='file://'+path.join(__dirname,'harness.html');
  const shot=(n)=>p.screenshot({path:path.join(SHOTS,n+'.png'),fullPage:false});
  const txt=()=>p.innerText('#app');
  let n=0;const ok=(c,m)=>{n++;global.__n=n+' '+m;assert.ok(c,m);};
  // ---- athlete
  await p.goto(U+'?now=2026-11-05T22:58:00Z');
  await p.fill('#sid','300100');await p.click('[data-a=idNext]');await p.waitForSelector('[data-a=idYes]');
  ok((await txt()).includes('Marco Alvarez'),'confirm name');await shot('01-confirm');
  await p.click('[data-a=idYes]');await p.waitForSelector('.hero.ok');
  ok((await txt()).includes('CHECKED IN')&&(await txt()).includes('3:58 PM'),'green');await shot('02-checked-in');
  await p.fill('#wpre','152.4');await p.click('[data-a=wtSave][data-kind=pre]');await p.waitForFunction(()=>document.body.innerText.includes('Saved ✓'));
  await p.fill('#wpost','147.2');await p.click('[data-a=wtSave][data-kind=post]');await p.waitForFunction(()=>document.body.innerText.includes('-5.2 lb'));ok(true,'weights');
  await p.reload();await p.waitForSelector('.hero.ok');ok((await p.inputValue('#wpre'))==='152.4','remembers athlete + weights after reload');
  // second athlete on same phone blocked
  await p.click('[data-a=switch]');await p.click('[data-a=switchYes]');await p.fill('#sid','300101');await p.press('#sid','Enter');await p.click('[data-a=idYes]');await p.waitForSelector('.hero.bad');
  ok((await txt()).includes('already checked in Marco'),'device rule shown');await shot('03-blocked');
  // network failure
  await p.evaluate(()=>{window.__fail=true});await p.click('[data-a=retry]');await p.waitForFunction(()=>document.body.innerText.includes('Could not reach'));
  ok((await txt()).includes('NOT CHECKED IN'),'failure is loud');await shot('04-offline');
  await p.evaluate(()=>{window.__fail=false});
  // ---- coach
  await p.click('[data-a=coachMode]');await p.fill('#pin','1111');await p.press('#pin','Enter');await p.waitForFunction(()=>document.body.innerText.includes('Wrong coach PIN'));ok(true,'bad pin');
  await p.fill('#pin','123456');await p.click('[data-a=pinGo]');await p.waitForSelector('.tiles');await p.waitForSelector('.row');
  ok((await p.innerText('.t-out b'))==='17'&&(await p.innerText('.t-here b'))==='1','counts');await shot('05-today');
  await p.click('.row[data-id="300102"]');await p.waitForFunction(()=>document.querySelector('.t-here b').innerText==='2');
  ok(await p.isVisible('.row[data-id="300102"]'),'row stays put after tap');await p.waitForSelector('#toast.open');ok((await p.innerText('#toast')).includes('UNDO'),'undo offered');
  await p.click('.row[data-id="300103"]');await p.click('.row[data-id="300104"]');await p.waitForFunction(()=>document.querySelector('.t-here b').innerText==='4');
  await p.waitForFunction(()=>document.getElementById('toast').innerText.includes('Estrada'));await p.click('#toast [data-a=undo]');await p.waitForFunction(()=>document.querySelector('.t-here b').innerText==='3');ok(true,'undo works');
  await p.waitForTimeout(600);await p.click('.row[data-id="300102"]');await p.waitForSelector('#sheet.open');await shot('06-sheet');
  await p.fill('#note','bus was late');await p.click('#sheet [data-s=Late]');await p.waitForFunction(()=>document.querySelector('.t-late b').innerText==='1');
  await p.click('.row[data-id="300105"]');await p.waitForTimeout(500);await p.click('.row[data-id="300105"]');await p.click('#sheet [data-s=Excused]');await p.waitForFunction(()=>document.querySelector('.t-exc b').innerText==='1');
  await p.fill('#q','lop');ok((await p.locator('.row').count())===1,'search');await p.fill('#q','');
  await p.click('.t-here');await p.waitForTimeout(300);ok((await p.locator('.row').count())===3,'here filter');await shot('07-here');
  // ---- weights
  await p.click('.nav [data-t=weights]');await p.waitForSelector('.wt');await p.waitForTimeout(400);
  const pre=p.locator('.wt input[data-id="300102"][data-kind=pre]');await pre.fill('160');await pre.press('Enter');await p.waitForTimeout(400);
  const post=p.locator('.wt input[data-id="300102"][data-kind=post]');await post.fill('106');await post.press('Enter');await p.waitForSelector('#sheet.open');
  ok((await p.innerText('#sheet')).includes('Check that number'),'typo guard');await shot('08-typo');
  await p.click('[data-a=wtNo]');await post.fill('154.2');await post.press('Enter');await p.waitForFunction(()=>document.getElementById('chg300102').innerText.includes('-5.8'));
  ok((await p.innerText('#chg300102')).includes('-3.6%'),'loss flag');await shot('09-weights');
  // ---- bus
  await p.click('.nav [data-t=bus]');await p.waitForSelector('[data-a=tripNew]');await p.click('[data-a=tripNew]');await p.waitForSelector('.check');
  await p.fill('#tname','Meet at Test HS');await p.click('[data-a=selHere]');ok((await p.innerText('#seln'))==='3','here today picks 3');
  await p.check('.check input[data-id="300110"]');ok((await p.innerText('#seln'))==='4','manual add');ok((await p.inputValue('#tname'))==='Meet at Test HS','form kept');
  await p.click('[data-a=tripSave]');await p.waitForSelector('.count');await shot('10-bus-missing');
  ok((await p.innerText('.count')).includes('4 MISSING'),'missing shown');
  for(const id of ['300100','300102','300103'])await p.click('.row[data-id="'+id+'"]');
  await p.waitForFunction(()=>document.querySelector('.count').innerText.includes('1 MISSING: Keller'));ok(true,'names the missing athlete');await shot('11-bus-one-missing');
  await p.waitForTimeout(500);await p.click('.row[data-id="300110"]');await p.waitForSelector('[data-a=headcount]');ok((await txt()).includes('You should count 4'),'asks for head count');await shot('12-bus-count');
  await p.click('[data-a=headcount]');await p.waitForSelector('.count.go');await shot('13-bus-go');
  await p.waitForTimeout(500);await p.click('.row[data-id="300110"]');await p.waitForSelector('#sheet.open');await p.fill('#rnote','Left with Mom');await p.click('#sheet [data-s=Released]');
  await p.waitForFunction(()=>document.querySelector('.count').innerText.includes('You should count 3'));ok(!(await p.isVisible('.count.go')),'change voids head count');
  await p.click('[data-a=headcount]');await p.waitForSelector('.count.go');ok((await txt()).includes('Athletes can scan to board'),'leaving leg uses the school');
  await p.click('[data-a=tripLeg][data-v=Return]');await p.waitForFunction(()=>document.querySelector('.count').innerText.includes('4 MISSING'));
  await p.waitForFunction(()=>document.getElementById('app').innerText.includes('the spot you set'));ok(true,'ride-home spot captured from the coach phone');
  ok(true,'return leg starts empty');await shot('14-bus-return');
  // athlete sees bus on return leg
  // ---- reports
  await p.click('.nav [data-t=reports]');await p.waitForSelector('.rep');await shot('15-report');
  ok((await txt()).includes('Team attendance'),'report');
  await p.click('.rep[data-id="300100"]');await p.waitForSelector('table.t');ok(/weight log/i.test(await txt())&&(await txt()).includes('-5.2'),'athlete detail');await shot('16-athlete');
  await p.click('[data-a=athBack]');await p.waitForSelector('.rep');await p.click('[data-a=export]');await p.waitForSelector('#sheet.open');ok((await p.innerText('#sheet')).includes('18 athletes × 1 practices'),'export');await p.click('#sheet [data-a=close]');
  // ---- more
  await p.click('.nav [data-t=more]');await p.waitForSelector('[data-a=presence]');ok((await txt()).includes('set ✓'),'school location shown as set');await shot('17-more');
  await p.click('[data-a=presence][data-v=Off]');await p.waitForFunction(()=>!document.querySelector('.note.code'));await p.click('[data-a=presence][data-v=Location]');await p.waitForSelector('.note.code');await p.waitForTimeout(400);
  await p.click('[data-a=schoolAsk]');await p.waitForSelector('#sheet.open');await p.click('[data-a=schoolSet]');await p.waitForFunction(()=>document.getElementById('toast').innerText.includes('School location set'));ok(true,'coach can set school location');
  await p.click('[data-m=qr]');await p.waitForSelector('.qrbox svg');await shot('18-qr');
  await p.click('[data-a=moreBack]');await p.waitForTimeout(300);
  await p.click('[data-m=add]');await p.fill('#aid','300555');await p.fill('#afn','Test');await p.fill('#aln','Zed');await p.fill('#agr','9');await p.click('[data-a=addSave]');await p.waitForSelector('[data-m=qr]');
  await p.click('.nav [data-t=today]');await p.waitForSelector('.row');await p.fill('#q','zed');ok((await p.locator('.row').count())===1,'added athlete on list');
  // ---- athlete bus + poster
  await p.goto(U+'?now=2026-11-05T23:40:00Z');await p.evaluate(()=>localStorage.setItem('wp_sid','300100'));await p.reload();await p.waitForSelector('[data-a=board]');
  await p.click('[data-a=board]');await p.waitForFunction(()=>document.body.innerText.includes('ON THE BUS'));await p.evaluate(()=>window.scrollTo(0,9999));await shot('19-athlete-bus');ok(true,'athlete boards return leg');
  // ---- location: far away is blocked, backup code works, denied permission is explained
  await ctx.setGeolocation(FAR);
  await p.goto(U+'?now=2026-11-05T23:10:00Z');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('wp_sid','300106');});await p.reload();await p.waitForSelector('.hero.bad');
  ok(/miles from the wrestling room/.test(await txt()),'far away: '+(await p.innerText('.hero.bad')).replace(/\n/g,' '));await shot('21-far');
  ok((await p.evaluate(()=>document.activeElement.id))!=='code','backup code box does not grab focus');
  await p.fill('#code','00');await p.click('[data-a=codeGo]');await p.waitForFunction(()=>document.body.innerText.includes('not today'));
  const code=await p.evaluate(()=>roomCode_(today_()));await p.fill('#code',code);await p.click('[data-a=codeGo]');await p.waitForSelector('.hero.late');ok(true,'backup code checks in');
  await ctx.clearPermissions();
  await p.evaluate(()=>{localStorage.clear();localStorage.setItem('wp_sid','300107');});await p.reload();await p.waitForSelector('.hero.bad',{timeout:25000});
  ok(/Location is turned off|could not find its location/.test(await txt()),'denied permission explained');await shot('22-denied');
  await ctx.grantPermissions(['geolocation']);await ctx.setGeolocation(AT);
  await p.click('[data-a=retry]');await p.waitForSelector('.hero.late');ok(true,'retry after allowing location works');
  await p.goto(U+'?p=poster');await p.waitForSelector('.poster svg');await p.screenshot({path:path.join(SHOTS,'20-poster.png'),fullPage:true});
  // touch target audit on coach today
  await p.evaluate(()=>localStorage.setItem('wp_pin','123456'));await p.goto(U+'?p=coach&now=2026-11-05T22:58:00Z');await p.waitForSelector('.row');
  const small=await p.evaluate(()=>[].slice.call(document.querySelectorAll('button,input,a')).filter(e=>e.offsetParent).map(e=>({t:(e.innerText||e.id||'').slice(0,20),h:Math.round(e.getBoundingClientRect().height),w:Math.round(e.getBoundingClientRect().width)})).filter(x=>x.h<44||x.w<44));
  ok(small.length===0,'small targets: '+JSON.stringify(small));
  ok(errs.length===0,'console errors: '+errs.join(' | '));
  console.log('UI',n,'CHECKS PASSED');await b.close();
})().catch(e=>{console.error('FAIL after check',global.__n,e.message.split('\n').slice(0,6).join('\n'));process.exit(1);});
