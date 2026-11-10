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
    else{var c=__book.insertSheet('Config');c.appendRow(['Key','Value','What it does']);c.appendRow(['OLD_SHEET_ID','OLDID','']);c.appendRow(['TRAVEL_EMAIL_TO','office@example.org','']);setup();c.data.forEach(function(r){if(r[0]==='COACH_PIN')r[1]='123456';});c.appendRow(['SCHOOL_LAT','33.473388','']);c.appendRow(['SCHOOL_LNG','-112.308543','']);}
    function persist(){var o={};Object.keys(__book.sheets).forEach(function(k){o[k]=__book.sheets[k].data;});sessionStorage.book=JSON.stringify(o);}
    window.__fail=false; window.WP_TEAM='West Point Wrestling'; window.WP_API='https://mock.invalid/exec';
    window.__realFetch=window.fetch.bind(window);
    window.fetch=function(u,o){return new Promise(function(res,rej){setTimeout(function(){if(window.__fail)return rej(new TypeError('net'));var out=doPost({postData:{contents:o.body}});persist();var j=JSON.parse(out.__text);
      if(q.get('old')){var rq=JSON.parse(o.body);if(/^coach(Session|Travel)/.test(rq.fn))j={ok:false,error:'BAD',message:'Unknown request. The app may need to be reloaded.'};
        if(j.me){['canCheckIn','checkedIn','session','extras','staff'].forEach(function(k){delete j.me[k];});}delete j.sessions;delete j.travel;}
      res({ok:true,json:function(){return Promise.resolve(j);}});},120);});};</script>`;
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
  ok(!/cycle/i.test(await p.innerHTML('#app'))&&(await p.evaluate(()=>localStorage.getItem('wp_sid')))==='300100','this team: no cycle box anywhere on the athlete page; saved under the usual key');
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
  // ---- travel: pick the roster by level, add a manager
  await p.click('.nav [data-t=bus]');await p.waitForSelector('[data-a=tripNew]');await p.click('[data-a=tripNew]');await p.waitForSelector('.pick');
  ok((await p.inputValue('#texc'))==='Excused 11/5 for classes ','excused line starts with the trip date');
  await p.fill('#tname','Meet at Test HS');
  for(const [id,v] of [['300100','V'],['300102','V'],['300103','JV'],['300110','JV']])await p.click(`.lv[data-id="${id}"][data-v="${v}"]`);
  ok((await p.innerText('#lvn'))==='4 traveling · Varsity 2 · JV 2 · Other 0','levels counted: '+(await p.innerText('#lvn')));
  await p.click('.lv[data-id="300103"][data-v="V"]');ok((await p.innerText('#lvn')).includes('Varsity 3 · JV 1'),'tapping another level moves the athlete');
  await p.click('.lv[data-id="300103"][data-v="V"]');ok((await p.innerText('#lvn')).startsWith('3 traveling'),'tapping the same level takes them off');
  await p.click('.lv[data-id="300103"][data-v="JV"]');
  await p.fill('#pq','kel');ok((await p.locator('.pick').count())===1&&await p.isVisible('.lv.on[data-id="300110"][data-v="JV"]'),'picker search keeps the picks');await p.fill('#pq','');
  await p.fill('#tdate','2026-11-06');ok((await p.inputValue('#texc'))==='Excused 11/6 for classes ','changing the date updates the excused line');
  await p.fill('#tdate','2026-11-05');await p.fill('#texc','Excused 11/5 for classes 5-7');
  await p.click('[data-a=mgrAdd]');await p.waitForSelector('#sheet.open');await p.fill('#mid','400001');await p.fill('#mfn','Riley Quinn');await p.fill('#mln','Stone');await p.click('[data-a=mgrSave]');
  await p.waitForFunction(()=>document.getElementById('lvn')&&document.getElementById('lvn').innerText.includes('Other 1'));
  ok((await p.inputValue('#tname'))==='Meet at Test HS'&&(await p.inputValue('#texc'))==='Excused 11/5 for classes 5-7','form survives adding a manager');
  await p.waitForSelector('.lv.on[data-id="400001"]');ok((await p.locator('.pick .lv[data-id="400001"]').count())===1,'manager is listed with one Going button');
  await p.evaluate(()=>window.scrollTo(0,300));await shot('10a-picker');
  await p.click('[data-a=tripSave]');await p.waitForSelector('.count');await shot('10-bus-missing');
  ok((await p.innerText('.count')).includes('5 MISSING'),'missing shown');
  // ---- travel roster: preview, PDF, email
  ok((await txt()).includes('Travel roster · V 2 · JV 2 · Other 1')&&(await txt()).includes('Not emailed to the office yet'),'roster bar on the trip');
  await p.click('[data-a=rosterOpen]');await p.waitForSelector('#sheet.open .tr');await shot('10b-roster');
  const prev=await p.innerText('#sheet .tr');
  ok(prev.includes("West Point Men's Wrestling")&&prev.includes('Excused 11/5 for classes 5-7')&&prev.includes('Riley Q. Stone')&&prev.indexOf('Marco Alvarez')<prev.indexOf('Eli Castillo')&&prev.indexOf('Kai Keller')<prev.indexOf('Riley Q. Stone'),'preview is in the office format, by last name');
  ok((await p.innerText('#sheet')).includes('Goes to: office@example.org'),'recipient shown before sending');
  await p.click('[data-a=rosterPdf]');await p.waitForSelector('#pdflink');
  const pdfOk=await p.evaluate(async()=>{const a=document.getElementById('pdflink');const b=await (await window.__realFetch(a.href)).blob();const t=await b.text();return b.type+'|'+a.download+'|'+t.slice(0,4)+'|'+t.includes('Riley Q. Stone');});
  ok(pdfOk==='application/pdf|WP Wrestling Travel Roster 2026-11-05.pdf|%PDF|true','PDF link holds the PDF: '+pdfOk);
  await p.click('#sheet [data-a=rosterOpen]');await p.waitForSelector('[data-a=rosterEmail]');await p.click('[data-a=rosterEmail]');
  await p.waitForFunction(()=>document.getElementById('toast').innerText.includes('Roster emailed to office@example.org'));
  await p.waitForFunction(()=>document.getElementById('app').innerText.includes('Emailed to the office'));
  const sent=await p.evaluate(()=>__mail.length+'|'+__mail[0].to+'|'+__mail[0].subject+'|'+__mail[0].attachments.length);
  ok(sent==="1|office@example.org|West Point Men's Wrestling travel roster - Excused 11/5 for classes 5-7|1",'exactly one email went out: '+sent);
  await p.click('[data-a=tripEdit]');await p.waitForSelector('.pick');ok((await p.locator('.pick').count())===5,'editing opens on the picked people');
  await p.click('.lv.on[data-id="300103"]');await p.click('[data-a=tripSave]');await p.waitForFunction(()=>document.getElementById('app').innerText.includes('Changed since it was emailed'));
  ok((await p.innerText('.count')).includes('4 MISSING'),'roster change is flagged after emailing');
  await p.click('[data-a=tripEdit]');await p.waitForSelector('.pick');await p.click('[data-a=lvOnly]');await p.waitForSelector('.lv[data-id="300103"]');await p.click('.lv[data-id="300103"][data-v="JV"]');
  await p.click('[data-a=tripSave]');await p.waitForFunction(()=>document.querySelector('.count')&&document.querySelector('.count').innerText.includes('5 MISSING'));
  ok((await txt()).includes('Emailed to the office')&&!(await txt()).includes('Changed since'),'putting the roster back clears the flag');
  // ---- bus check
  for(const id of ['300100','300102','300103','400001'])await p.click('.row[data-id="'+id+'"]');
  await p.waitForFunction(()=>document.querySelector('.count').innerText.includes('1 MISSING: Keller'));ok(true,'names the missing athlete');await shot('11-bus-one-missing');
  await p.waitForTimeout(500);await p.click('.row[data-id="300110"]');await p.waitForSelector('[data-a=headcount]');ok((await txt()).includes('You should count 5'),'asks for head count');await shot('12-bus-count');
  await p.click('[data-a=headcount]');await p.waitForSelector('.count.go');await shot('13-bus-go');
  await p.waitForTimeout(500);await p.click('.row[data-id="300110"]');await p.waitForSelector('#sheet.open');await p.fill('#rnote','Left with Mom');await p.click('#sheet [data-s=Released]');
  await p.waitForFunction(()=>document.querySelector('.count').innerText.includes('You should count 4'));ok(!(await p.isVisible('.count.go')),'change voids head count');
  await p.click('[data-a=headcount]');await p.waitForSelector('.count.go');ok((await txt()).includes('Athletes can scan to board'),'leaving leg uses the school');
  await p.click('[data-a=tripLeg][data-v=Return]');await p.waitForFunction(()=>document.querySelector('.count').innerText.includes('5 MISSING'));
  await p.waitForFunction(()=>document.getElementById('app').innerText.includes('the spot you set'));ok(true,'ride-home spot captured from the coach phone');
  ok(true,'return leg starts empty');await shot('14-bus-return');
  await p.click('[data-a=tripBack]');await p.waitForSelector('[data-a=tripOpen]');ok((await txt()).includes('roster emailed ✓'),'trip list shows the roster was emailed');
  await p.click('[data-a=tripNew]');await p.waitForSelector('[data-a=lvPrev]');await p.click('[data-a=lvPrev]');
  await p.waitForFunction(()=>document.getElementById('lvn').innerText==='5 traveling · Varsity 2 · JV 2 · Other 1');ok(true,'same as last trip copies the roster and levels');
  await p.click('[data-a=tripCancel]');await p.waitForSelector('[data-a=tripNew]');
  // athlete sees bus on return leg
  // ---- reports
  await p.click('.nav [data-t=reports]');await p.waitForSelector('.rep');await shot('15-report');
  ok(!/cycle/i.test(await p.innerHTML('#app'))&&(await p.locator('[data-a=cycOpen]').count())===0,'this team: no cycle log in Reports');
  ok((await txt()).includes('Team attendance'),'report');
  await p.click('.rep[data-id="300100"]');await p.waitForSelector('table.t');ok(/weight log/i.test(await txt())&&(await txt()).includes('-5.2'),'athlete detail');await shot('16-athlete');
  await p.click('[data-a=athBack]');await p.waitForSelector('.rep');await p.click('[data-a=export]');await p.waitForSelector('#sheet.open');ok((await p.innerText('#sheet')).includes('18 athletes × 1 practices'),'export');await p.click('#sheet [data-a=close]');
  // ---- more
  await p.click('.nav [data-t=more]');await p.waitForSelector('[data-a=presence]');ok((await txt()).includes('set ✓'),'school location shown as set');await shot('17-more');
  await p.click('[data-a=presence][data-v=Off]');await p.waitForFunction(()=>!document.querySelector('.note.code'));await p.click('[data-a=presence][data-v=Location]');await p.waitForSelector('.note.code');await p.waitForTimeout(400);
  await p.click('[data-a=schoolAsk]');await p.waitForSelector('#sheet.open');await p.click('[data-a=schoolSet]');await p.waitForFunction(()=>document.getElementById('toast').innerText.includes('School location set'));ok(true,'coach can set school location');
  // ---- practice schedule planner
  await p.click('[data-m=sched]');await p.waitForSelector('[data-a=schedDay]');await shot('23-sched');
  ok((await p.locator('[data-a=schedDay]').count())===7,'seven days shown');
  await p.click('[data-a=schedDay][data-d="2026-11-07"]');await p.waitForSelector('#sheet.open');await p.fill('#snote','Ice baths');await p.click('#sheet [data-s=early]');
  await p.waitForFunction(()=>document.querySelector('[data-a=schedDay][data-d="2026-11-07"]').innerText.includes('Early'));ok(true,'Saturday opened');
  await p.click('[data-a=schedDay][data-d="2026-11-04"]');await p.waitForSelector('#sheet.open');await p.click('#sheet [data-s=late]');
  await p.waitForFunction(()=>document.querySelector('[data-a=schedDay][data-d="2026-11-04"]').innerText.includes('Late · 6:00 PM'));ok(true,'late slot set');
  await p.click('[data-a=schedWeek][data-n="7"]');await p.waitForFunction(()=>document.body.innerText.includes('Week of Mon, Nov 9'));
  await p.click('[data-a=fill][data-s=late]');await p.waitForFunction(()=>document.getElementById('toast').innerText.includes('20 practice days added'));
  await p.waitForFunction(()=>document.querySelector('[data-a=schedDay][data-d="2026-11-09"]').innerText.includes('Late week'));await shot('24-sched-filled');
  await p.click('[data-a=moreBack]');await p.waitForSelector('[data-m=qr]');
  await p.click('[data-m=qr]');await p.waitForSelector('.qrbox svg');await shot('18-qr');
  await p.click('[data-a=moreBack]');await p.waitForTimeout(300);
  await p.click('[data-m=add]');await p.fill('#aid','300555');await p.fill('#afn','Test');await p.fill('#aln','Zed');await p.fill('#agr','9');await p.click('[data-a=addSave]');await p.waitForSelector('[data-m=qr]');
  await p.click('.nav [data-t=today]');await p.waitForSelector('.row');await p.fill('#q','zed');ok((await p.locator('.row').count())===1,'added athlete on list');
  // ---- athlete bus + poster
  await p.goto(U+'?now=2026-11-05T23:40:00Z');await p.evaluate(()=>localStorage.setItem('wp_sid','300100'));await p.reload();await p.waitForSelector('[data-a=board]');
  await p.click('[data-a=board]');await p.waitForFunction(()=>document.body.innerText.includes('ON THE BUS'));await p.evaluate(()=>window.scrollTo(0,9999));await shot('19-athlete-bus');ok(true,'athlete boards return leg');
  await p.evaluate(()=>localStorage.setItem('wp_sid','400001'));await p.reload();await p.waitForSelector('[data-a=board]');
  ok((await txt()).includes('Manager / student assistant')&&!/weigh-in/i.test(await txt())&&!(await txt()).includes('CHECKED IN'),'manager screen: bus only, no check-in or weights');
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
  // ---- optional sessions: coach starts a weight room session before practice check-in opens (3:00 PM; practice 4:00, check-in 3:30)
  const fresh=async(sid,now,extra)=>{await p.evaluate(s=>{localStorage.clear();if(s)localStorage.setItem('wp_sid',s);},sid);await p.goto(U+'?now='+now+(extra||''));};
  await p.evaluate(()=>localStorage.setItem('wp_pin','123456'));await p.goto(U+'?p=coach&now=2026-11-05T22:00:00Z');await p.waitForSelector('[data-a=sessNew]');
  await p.click('[data-a=sessNew]');await p.waitForSelector('#sheet.open');ok((await p.inputValue('#sname'))==='Weight room','session name is prefilled');
  await p.click('[data-a=sessDur][data-m="120"]');await p.click('[data-a=sessStart]');await p.waitForSelector('[data-a=sessOpen]');
  ok(/Weight room · optional · open until 5:00 PM/.test(await p.innerText('[data-a=sessOpen]'))&&(await p.innerText('[data-a=sessOpen]')).includes('0 in')&&!(await p.isVisible('[data-a=sessNew]')),'open session shows on Today: '+(await p.innerText('[data-a=sessOpen]')).replace(/\n/g,' '));
  await fresh('300112','2026-11-05T22:00:00Z');await p.waitForSelector('.hero.ok');
  ok((await txt()).includes('Weight room (optional) · 3:00 PM')&&(await txt()).includes('Check-in opens at 3:30 PM. Open this page again then')&&await p.isVisible('#wpre'),'a scan before practice check-in logs the optional session and opens weights');await shot('25-optional-athlete');
  await p.goto(U+'?now=2026-11-05T22:40:00Z');await p.waitForFunction(()=>document.body.innerText.includes('3:40 PM'));
  ok((await p.innerText('.hero.ok')).includes('CHECKED IN')&&(await p.innerText('.hero.ok')).includes('Weight room (optional) · 3:00 PM'),'the lifter is then checked in for practice with the weight room still shown');
  await fresh('300113','2026-11-05T22:40:00Z');await p.waitForSelector('[data-a=extraGo]');
  ok((await p.innerText('.hero.ok')).includes('CHECKED IN')&&!(await txt()).includes('✓ Weight room'),'arriving for practice does not log the optional session by itself');await shot('26-optional-offer');
  await p.click('[data-a=extraGo]');await p.waitForFunction(()=>document.body.innerText.includes('✓ Weight room (optional)'));ok(!(await p.isVisible('[data-a=extraGo]')),'one tap adds it');
  await p.evaluate(()=>localStorage.setItem('wp_pin','123456'));await p.goto(U+'?p=coach&now=2026-11-05T22:45:00Z');await p.waitForSelector('[data-a=sessOpen]');
  ok((await p.innerText('[data-a=sessOpen]')).includes('2 in'),'coach sees the count');
  await p.click('.t-here');await p.waitForTimeout(200);ok((await p.innerText('.row[data-id="300112"]')).includes('+ Weight room'),'attendance row is tagged with the optional session');
  await p.click('[data-a=sessOpen]');await p.waitForSelector('#slist .row');ok((await p.locator('#slist .row.s-P').count())===2&&(await p.locator('#slist .row').count())===19,'session list');await shot('27-optional-coach');
  await p.click('#slist .row[data-id="300115"]');await p.waitForFunction(()=>document.getElementById('sin').innerText==='In · 3');
  await p.click('[data-a=sessFilter][data-f=in]');await p.waitForFunction(()=>document.querySelectorAll('#slist .row').length===3);ok(true,'coach adds by hand; the In filter works');
  await p.waitForTimeout(400);await p.click('#slist .row[data-id="300115"]');await p.waitForSelector('#sheet.open');await p.click('[data-a=sessOut]');await p.waitForFunction(()=>document.getElementById('sin').innerText==='In · 2');ok(true,'taking someone out asks first');
  await p.click('[data-a=sessClose]');await p.waitForFunction(()=>/ended/.test(document.querySelector('.top .sub').innerText));ok(!(await p.isVisible('[data-a=sessClose]')),'coach closes the session');
  await p.click('[data-a=sessBack]');await p.waitForSelector('[data-a=sessNew]');ok(/Weight room · optional · ended/.test(await p.innerText('[data-a=sessOpen]')),'closed session stays listed for the day');
  await p.click('.nav [data-t=reports]');await p.waitForSelector('.rep');
  ok((await txt()).includes('Optional sessions held: 1')&&(await p.innerText('.rep[data-id="300112"]')).includes('+1 optional')&&!(await p.innerText('.rep[data-id="300100"]')).includes('optional'),'report shows optional counts apart from the percentage');
  await p.click('.rep[data-id="300112"]');await p.waitForSelector('table.t');ok(/optional sessions · 1/i.test(await txt())&&(await txt()).includes('Weight room'),'athlete page lists optional sessions');await shot('28-optional-report');
  await p.click('.nav [data-t=today]');await p.waitForSelector('.row');await p.click('[data-a=day][data-n="-1"]');await p.waitForFunction(()=>document.querySelector('[data-a=sessNew]')&&document.querySelector('[data-a=sessNew]').innerText.includes('Record an optional session'));
  await p.click('[data-a=sessNew]');await p.waitForSelector('#sheet.open');ok(!(await p.isVisible('[data-a=sessDur]')),'a past-day session has no timer');
  await p.click('[data-a=sessName][data-n="Saturday recovery"]');await p.click('[data-a=sessStart]');await p.waitForSelector('#slist .row');
  ok((await p.innerText('.top')).includes('Saturday recovery')&&(await p.innerText('.top')).includes('entered by hand'),'past-day session opens for hand entry');
  await p.click('#slist .row[data-id="300100"]');await p.waitForFunction(()=>document.getElementById('sin').innerText==='In · 1');ok(true,'hand entry on a past day');
  // ---- the website must keep working against the Sheet script from before this update
  await fresh('300116','2026-11-05T22:50:00Z','&old=1');await p.waitForSelector('.hero.ok');
  ok((await p.innerText('.hero.ok')).includes('CHECKED IN')&&await p.isVisible('#wpre')&&!(await p.isVisible('[data-a=extraGo]')),'check-in and weights still work with the older Sheet script');
  await p.evaluate(()=>localStorage.setItem('wp_pin','123456'));await p.goto(U+'?p=coach&old=1&now=2026-11-05T22:50:00Z');await p.waitForSelector('.row');
  ok(!(await p.isVisible('[data-a=sessNew]'))&&!(await p.isVisible('[data-a=sessOpen]'))&&(await p.innerText('.t-here b'))!=='0','coach screen with the older script: no session buttons, attendance intact');
  ok(errs.length===0,'console errors: '+errs.join(' | '));
  console.log('UI',n,'CHECKS PASSED');await b.close();
})().catch(e=>{console.error('FAIL after check',global.__n,e.message.split('\n').slice(0,6).join('\n'));process.exit(1);});
