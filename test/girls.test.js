// The girls team's page: same app, own address, own saved keys, and the private cycle log.
// Run: node test/girls.test.js     (SHOTS=<folder> saves screenshots)
const SHOTS=process.env.SHOTS||require('os').tmpdir();
const {chromium}=require('playwright'),path=require('path'),assert=require('assert'),fs=require('fs');
const R=path.join(__dirname,'..');
(async()=>{
  let n=0;const ok=(c,m)=>{n++;global.__n=n+' '+m;assert.ok(c,m);};
  // ---- the generated page is in step with index.html, and its settings point nowhere near the boys' Sheet
  const page=fs.readFileSync(path.join(R,'girls/index.html'),'utf8');
  ok(page===require('../tools/build-girls.js').build(),'girls/index.html is out of date: run node tools/build-girls.js');
  const conf=(f)=>{const w={};new Function('window',fs.readFileSync(path.join(R,f),'utf8'))(w);return w;};
  const boys=conf('config.js'),girls=conf('girls/config.js');
  ok(girls.WP_KEY==='wpg_'&&boys.WP_KEY===undefined&&girls.WP_TEAM==='West Point Girls Wrestling','girls page keeps its own saved keys and name');
  ok(girls.WP_API===''||(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(girls.WP_API)&&girls.WP_API!==boys.WP_API&&girls.WP_API!==boys.WP_SIGNUP_API),'girls page is blank or has its own web app URL, never the boys\' one');
  for(const f of ['icon-180.png','icon-192.png','icon-512.png','manifest.webmanifest'])ok(fs.existsSync(path.join(R,'girls',f)),'girls/'+f);
  ok(JSON.parse(fs.readFileSync(path.join(R,'girls/manifest.webmanifest'),'utf8')).short_name==='WP Girls','own home-screen name');

  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  const p=await ctx.newPage();const errs=[],reqs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});p.on('request',r=>reqs.push(r.url()));
  const txt=()=>p.innerText('#app');
  const shot=(name)=>p.screenshot({path:path.join(SHOTS,name+'.png'),fullPage:false});

  // ---- before the girls Sheet is connected: a plain message, and not one request leaves for any Sheet
  if(girls.WP_API===''){
    await p.goto('file://'+path.join(R,'girls/index.html'));
    ok((await p.title())==='WP Girls Wrestling Check-In'&&(await txt()).includes('West Point Girls Wrestling'),'title and team name');
    await p.fill('#sid','400101');await p.click('[data-a=idNext]');await p.waitForFunction(()=>document.body.innerText.includes('not connected to the Sheet yet'));
    ok(!reqs.some(u=>/script\.google|googleusercontent/.test(u)),'unconnected page talks to no Sheet: '+reqs.filter(u=>/google/.test(u)).join());
    ok(await p.evaluate(()=>typeof qrcode==='function'),'QR library loads from the folder above');
  }

  // ---- harness: the real girls page, with the Sheet replaced by test/mock.js set up with setupGirls
  const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'),code=fs.readFileSync(path.join(R,'apps-script/Code.gs'),'utf8');
  const shim=`<script>${mock}</script><script>${code}</script><script>
    var q=new URLSearchParams(location.search); __now=new Date(q.get('now')||'2026-11-09T22:58:00Z');
    if(sessionStorage.book){var bk=JSON.parse(sessionStorage.book);Object.keys(bk).forEach(function(k){__book.insertSheet(k).data=bk[k];});}
    else{setupGirls();__book.getSheetByName('Config').data.forEach(function(r){if(r[0]==='COACH_PIN')r[1]='222222';if(r[0]==='HEALTH_PIN')r[1]='778899';if(r[0]==='PRESENCE_CHECK')r[1]='Off';});
      [['400101','Ana','Reyes','10'],['400102','Bree','Soto','9'],['400103','Cami','Tran','11']].forEach(function(a){__book.getSheetByName('Athletes').appendRow([a[0],a[1],a[2],a[3],'Yes','No','Y','']);});}
    function persist(){var o={};Object.keys(__book.sheets).forEach(function(k){o[k]=__book.sheets[k].data;});sessionStorage.book=JSON.stringify(o);}
    window.WP_TEAM='West Point Girls Wrestling'; window.WP_API='https://mock.invalid/exec'; window.WP_KEY='wpg_';
    window.fetch=function(u,o){return new Promise(function(res){setTimeout(function(){var out=doPost({postData:{contents:o.body}});persist();var j=JSON.parse(out.__text);res({ok:true,json:function(){return Promise.resolve(j);}});},120);});};</script>`;
  const out=page.replace('<script src="config.js"></script>',()=>shim);
  if(out===page)throw new Error('harness injection failed');
  fs.writeFileSync(path.join(__dirname,'harness-girls.html'),out);
  const U='file://'+path.join(__dirname,'harness-girls.html');
  const book=(t)=>p.evaluate((t)=>(__book.getSheetByName(t)||{data:null}).data,t);

  // athlete checks in: no consent form on file yet, so nothing about a cycle anywhere
  await p.goto(U);await p.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await p.goto(U);
  await p.fill('#sid','400101');await p.click('[data-a=idNext]');await p.waitForSelector('[data-a=idYes]');await p.click('[data-a=idYes]');await p.waitForSelector('.hero.ok');
  ok((await txt()).includes('CHECKED IN')&&(await txt()).includes('Ana Reyes'),'girls athlete checks in');
  ok(!/cycle/i.test(await p.innerHTML('#app')),'no consent form on file: no cycle box');
  ok(await p.evaluate(()=>localStorage.getItem('wpg_sid')==='400101'&&localStorage.getItem('wp_sid')===null&&!!localStorage.getItem('wpg_dev')&&localStorage.getItem('wp_dev')===null),'saved under the girls keys only');
  await p.evaluate(()=>localStorage.setItem('wp_pin','123456'));   // a coach who also uses the boys' page on this phone

  // coach: own PIN, then the cycle log behind the Health PIN
  await p.click('[data-a=coachMode]');await p.waitForSelector('#pin');
  ok((await p.inputValue('#pin'))===''&&(await txt()).includes('Coach PIN'),'the boys\' saved coach PIN is not used here');
  await p.fill('#pin','222222');await p.click('[data-a=pinGo]');await p.waitForSelector('.tiles');await p.waitForSelector('.row');
  ok(await p.evaluate(()=>localStorage.getItem('wpg_pin')==='222222'&&localStorage.getItem('wp_pin')==='123456'),'girls coach PIN saved apart from the boys\' one');
  ok(!/cycle/i.test(await p.innerHTML('#app')),'Today screen carries nothing about cycles');
  await p.click('.nav [data-t=weights]');await p.waitForSelector('.wt');ok(!/cycle/i.test(await p.innerHTML('#app')),'Weights screen carries nothing about cycles');
  await p.click('.nav [data-t=reports]');await p.waitForSelector('[data-a=cycOpen]');await shot('g01-reports');
  await p.click('[data-a=cycOpen]');await p.waitForSelector('#hpin');await shot('g02-health-pin');
  ok(!(await txt()).includes('Reyes'),'no names before the Health PIN');
  await p.fill('#hpin','111111');await p.press('#hpin','Enter');await p.waitForFunction(()=>document.body.innerText.includes('Wrong Health PIN'));ok(true,'wrong Health PIN refused');
  await p.fill('#hpin','222222');await p.click('[data-a=cycGo]');await p.waitForFunction(()=>document.body.innerText.includes('Wrong Health PIN')&&!document.querySelector('#hpin').disabled);ok(true,'the coach PIN does not open it');
  await p.fill('#hpin','778899');await p.click('[data-a=cycGo]');await p.waitForSelector('[data-a=cycAth]');
  ok((await txt()).toLowerCase().includes('no consent form yet · 3')&&(await txt()).includes('No one yet'),'log opens: nobody has a form on file');await shot('g03-log-empty');
  ok(await p.evaluate(()=>!Object.keys(localStorage).concat(Object.keys(sessionStorage).filter(k=>k!=='book')).some(k=>(localStorage.getItem(k)||sessionStorage.getItem(k)||'').includes('778899'))),'the Health PIN is never saved on the phone');
  await p.click('[data-a=cycAth][data-id="400101"]');await p.waitForSelector('#sheet.open');await shot('g04-consent-sheet');
  await p.click('#sheet [data-a=cycConsent]');await p.waitForFunction(()=>document.querySelector('#sheet.open [data-a=cycToday]'));
  ok((await txt()).toLowerCase().includes('consent form on file · 1')&&(await p.innerText('#sheet')).includes('Nothing logged yet'),'form marked on file; her sheet reopens');
  await p.click('#sheet [data-a=close]');

  // athlete: the box is folded, opens in place, saves in place
  await p.goto(U);await p.waitForSelector('.hero.ok');await p.waitForSelector('[data-a=cycFold]');
  ok(await p.evaluate(()=>document.getElementById('cycp').hidden&&getComputedStyle(document.getElementById('cycp')).display==='none'),'the box is folded shut until she opens it');
  ok(!(await txt()).includes('On cycle today'),'nothing on the check-in screen says whether she marked it');await shot('g05-athlete-folded');
  const big=async(sel)=>{const r=await p.locator(sel).boundingBox();return r.height>=44&&r.width>=44;};
  ok(await big('[data-a=cycFold]'),'fold row is a full-size touch target');
  await p.fill('#wpre','131.5');await p.click('[data-a=cycFold]');
  ok(await p.isVisible('#cyc')&&(await p.inputValue('#wpre'))==='131.5'&&(await p.getAttribute('[data-a=cycFold]','aria-expanded'))==='true','opening it does not wipe a weight being typed');
  ok(await big('label[for=cyc]'),'the checkbox row is a full-size touch target');
  await p.click('label[for=cyc]');await p.waitForFunction(()=>document.getElementById('cycst').innerText.includes('Saved'));
  ok(await p.isChecked('#cyc')&&(await p.inputValue('#wpre'))==='131.5','saved in place; typed weight still there');await shot('g06-athlete-open');
  let cy=await book('Cycle');ok(cy.length===2&&cy[1].join()==='2026-11-09,400101,Ana Reyes,15:58,Athlete','one row in the Cycle tab');
  await p.click('[data-a=wtSave][data-kind=pre]');await p.waitForFunction(()=>document.body.innerText.includes('Saved ✓'));
  ok(await p.isVisible('#cyc')&&await p.isChecked('#cyc'),'saving a weight keeps the box as she left it');
  await p.reload();await p.waitForSelector('.hero.ok');await p.waitForSelector('[data-a=cycFold]');
  ok(await p.evaluate(()=>document.getElementById('cycp').hidden&&document.getElementById('cyc').checked),'after a reload it is folded again, and remembers today\'s answer inside');
  // another phone that types her Student ID
  const dev=await p.evaluate(()=>localStorage.getItem('wpg_dev'));
  await p.evaluate(()=>localStorage.setItem('wpg_dev','someone-elses-phone'));await p.reload();await p.waitForSelector('.hero.ok');
  ok(!/cycle/i.test(await p.innerHTML('#app'))&&(await txt()).includes('Ana Reyes'),'another phone sees her check-in but nothing about her cycle');
  await p.evaluate((d)=>localStorage.setItem('wpg_dev',d),dev);

  // coach log now shows it
  const openLog=async()=>{await p.goto(U+'?p=coach');await p.waitForSelector('.tiles');await p.click('.nav [data-t=reports]');await p.click('[data-a=cycOpen]');await p.fill('#hpin','778899');await p.click('[data-a=cycGo]');await p.waitForSelector('[data-a=cycAth]');};
  await openLog();
  ok((await p.innerText('.kv .tile:first-child b'))==='1'&&(await p.innerText('[data-a=cycAth][data-id="400101"]')).includes('On now')&&(await txt()).includes('Mon, Nov 9 · day 1 so far'),'coach sees who is on today');await shot('g07-log');
  await p.click('[data-a=cycAth][data-id="400101"]');await p.waitForSelector('#sheet.open');
  await p.click('#sheet [data-a=cycDay][data-on="1"]');ok((await p.innerText('#cycerr')).includes('Pick the day first'),'a day must be picked');
  await p.fill('#cycd','2026-11-06');await p.click('#sheet [data-a=cycDay][data-on="1"]');
  await p.waitForFunction(()=>{var s=document.querySelector('#sheet.open .plist');return s&&s.innerText.includes('Fri, Nov 6');});
  ok((await p.innerText('#sheet .plist')).includes('Fri, Nov 6 – today · day 4 so far')&&(await p.innerText('#sheet .plist')).includes('Marked on 2 of the 4 days'),'Friday and Monday read as one period across the weekend');await shot('g08-athlete-sheet');
  await p.click('#sheet [data-a=cycToday]');await p.waitForFunction(()=>{var s=document.querySelector('#sheet.open .plist');return s&&!s.innerText.includes('today');});
  ok((await p.innerText('#sheet .plist')).trim()==='Fri, Nov 6 · 1 day'&&(await p.innerText('.kv .tile:first-child b'))==='0','coach removes today; the period now ended Friday');
  await p.click('#sheet [data-a=cycEraseAsk]');await p.waitForFunction(()=>document.querySelector('#sheet.open [data-a=cycErase]'));await p.click('#sheet [data-a=cycErase]');
  await p.waitForFunction(()=>document.getElementById('toast').innerText.includes('erased'));cy=await book('Cycle');ok(cy.length===1,'erase empties her rows in the Sheet');
  // leaving the log forgets the Health PIN
  await p.click('.nav [data-t=today]');await p.waitForSelector('.tiles');await p.click('.nav [data-t=reports]');await p.click('[data-a=cycOpen]');await p.waitForSelector('#hpin');
  ok(!(await txt()).includes('Reyes')&&(await p.inputValue('#hpin'))==='','leaving the log means the Health PIN is asked again');
  await p.fill('#hpin','778899');await p.click('[data-a=cycGo]');await p.waitForSelector('[data-a=cycAth]');
  await p.click('[data-a=cycAth][data-id="400101"]');await p.waitForSelector('#sheet.open');
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{value:false,configurable:true});});
  await p.waitForSelector('[data-a=cycOpen]');
  ok(!(await p.isVisible('#sheet.open'))&&(await p.locator('[data-a=cycAth]').count())===0,'locking the phone or switching apps closes the log');
  // five wrong Health PINs lock it
  await p.click('[data-a=cycOpen]');
  for(let i=1;i<=5;i++){await p.waitForFunction(()=>{var e=document.getElementById('hpin');return e&&!e.disabled;});await p.fill('#hpin','0000');await p.click('[data-a=cycGo]');await p.waitForFunction((i)=>!document.querySelector('#hpin').disabled&&/Wrong Health PIN|Too many/.test(document.body.innerText)&&window.__cache.hpin_tries===String(i),i);}
  ok((await txt()).includes('locked for 15 minutes'),'locked after five wrong tries');
  await p.fill('#hpin','778899');await p.click('[data-a=cycGo]');await p.waitForFunction(()=>!document.querySelector('#hpin')||!document.querySelector('#hpin').disabled);
  ok((await txt()).includes('locked for 15 minutes')&&(await p.locator('[data-a=cycAth]').count())===0,'even the right PIN waits out the lock');
  await p.click('[data-a=cycBack]');await p.waitForSelector('[data-a=cycOpen]');ok(true,'back to reports');
  ok(errs.length===0,'no page errors: '+errs.join(' | '));
  console.log('GIRLS PAGE',n,'CHECKS PASSED');await b.close();
})().catch(e=>{console.error('FAILED after check',global.__n,'\n',e);process.exit(1);});
