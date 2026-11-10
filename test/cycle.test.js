// Girls team Sheet (setupGirls) and the cycle log. Run: node test/cycle.test.js
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const ctx=vm.createContext({console,Intl,Date,Math,JSON,String,Number,Object,Array,RegExp,Error,isFinite,btoa});
ctx.globalThis=ctx;
vm.runInContext(fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8'),ctx);
const run=(s)=>vm.runInContext(s,ctx);
const at=(iso)=>run(`__now=new Date('${iso}')`);
let n=0; const ok=(c,m)=>{n++;assert.ok(c,m);};
const cfgRow=(k)=>run(`(__book.getSheetByName('Config').data.filter(function(r){return r[0]==='${k}'})[0]||[])[1]`);
const setRow=(k,v)=>run(`__book.getSheetByName('Config').data.forEach(function(r){if(r[0]==='${k}')r[1]='${v}'})`);
const tab=(t)=>run(`(__book.getSheetByName('${t}')||{data:null}).data`);
const post=(o)=>JSON.parse(run(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(o))}}})`).__text);

// ---------- 1. the boys' Sheet is untouched by any of this ----------
run('__seedOld()'); at('2026-11-05T22:40:00Z');                  // Thu 3:40 PM Phoenix
run("var c=__book.insertSheet('Config');c.appendRow(['Key','Value','What it does']);c.appendRow(['OLD_SHEET_ID','OLDID','']);c.appendRow(['PRESENCE_CHECK','Off','']);");
run('setup()'); setRow('COACH_PIN','123456');
let r=run("athleteCheckIn('300100','d1','')"); ok(r.ok&&!('cycle' in r.me),'boys: check-in reply has no cycle field');
ok(!('cycle' in run("athleteState('300100','d1')").me),'boys: state has no cycle field');
ok(run("coachLogin('123456')").cycle===false,'boys: coach screens are told the cycle log is off');
ok(run("coachCycle('123456','000000')").error==='CYCLE_OFF'&&run("athleteCycle('300100','d1',true)").error==='CYCLE_OFF','boys: cycle requests refused');
ok(run("coachCycleConsent('123456','000000','300100',true)").error==='CYCLE_OFF'&&run("coachCycleMark('123456','000000','300100','2026-11-05',true)").error==='CYCLE_OFF','boys: cannot be switched on from the app');
ok(tab('Cycle')===null&&tab('CycleConsent')===null,'boys: no cycle tabs are ever created');
ok(cfgRow('CYCLE_TRACKING')===undefined&&cfgRow('HEALTH_PIN')===undefined,'boys: no cycle settings in Config');
let m=run('setupGirls()'); ok(/^STOP/.test(m)&&cfgRow('TEAM_NAME')==='West Point Dragons Wrestling'&&tab('Cycle')===null&&cfgRow('CYCLE_TRACKING')===undefined,'setupGirls refuses a Sheet that already holds attendance and changes nothing');
ok(/^Setup complete\. /.test(run('setup()'))&&cfgRow('TEAM_NAME')==='West Point Dragons Wrestling'&&cfgRow('SITE_URL')==='https://jerry-d-ball.github.io/wrestling-checkin/','boys: setup still the boys team');
run("__book.getSheetByName('Config').appendRow(['CYCLE_TRACKING','Y',''])");
ok(run("coachLogin('123456')").cycle===false&&!('cycle' in run("athleteState('300100','d1')").me),'a typed CYCLE_TRACKING=Y does nothing without a Health PIN');
run("__book.getSheetByName('Config').appendRow(['HEALTH_PIN','123456',''])");
ok(run("coachLogin('123456')").cycle===false,'a Health PIN equal to the coach PIN does not count');

// ---------- 2. a new girls Sheet ----------
run('__book.sheets={};__cache={};__memo={}');
at('2026-11-09T22:40:00Z');                                       // Mon Nov 9, 3:40 PM
m=run('setupGirls()');
ok(/Setup complete for West Point Girls Wrestling/.test(m)&&/Health PIN \(opens the cycle log only\): \d{6}/.test(m)&&/New deployment/.test(m)&&/roster is empty/.test(m),'setupGirls message: '+m);
ok(cfgRow('TEAM_NAME')==='West Point Girls Wrestling'&&cfgRow('TRAVEL_TITLE')==="West Point Women's Wrestling"&&cfgRow('SITE_URL')==='https://jerry-d-ball.github.io/wrestling-checkin/girls/'&&cfgRow('SIGNUP_OPEN')==='N','girls settings');
ok(cfgRow('TRAVEL_EMAIL_TO')===''&&cfgRow('OLD_SHEET_ID')==='','no boys office address or roster link carried over');
ok(/^\d{6}$/.test(cfgRow('COACH_PIN'))&&/^\d{6}$/.test(cfgRow('HEALTH_PIN'))&&cfgRow('COACH_PIN')!==cfgRow('HEALTH_PIN')&&cfgRow('CYCLE_TRACKING')==='Y','own coach PIN and a different Health PIN');
ok(tab('Cycle')[0].join()==='Date,StudentID,Name,Time,EnteredBy'&&tab('CycleConsent')[0].join()==='StudentID,Name,OnFile,UpdatedAt','cycle tabs made');
ok(run("__book.getSheetByName('Cycle').hidden===true&&__book.getSheetByName('CycleConsent').hidden===true&&!__book.getSheetByName('Athletes').hidden"),'cycle tabs start hidden');
const rows0=tab('Config').length; m=run('setup()');
ok(/Setup complete for West Point Girls Wrestling/.test(m)&&/Manage deployments/.test(m)&&tab('Config').length===rows0&&cfgRow('TEAM_NAME')==='West Point Girls Wrestling','plain setup on the girls Sheet keeps it a girls Sheet');
ok(run('setupGirls()').includes('Setup complete')&&tab('Config').length===rows0,'setupGirls is safe to run twice');
setRow('COACH_PIN','222222'); setRow('HEALTH_PIN','778899'); setRow('PRESENCE_CHECK','Off');
const P='222222',H='778899',D='2026-11-09';
ok(post({fn:'signupFreshman',args:[{student:'A B',parent:'C D',parentEmail:'c@d.co'}]}).error==='CLOSED','freshman sign-up is closed on the girls Sheet');
m=run('showLinks()'); ok(m.includes('/wrestling-checkin/girls/?p=coach')&&m.includes('Health PIN (opens the cycle log only): 778899')&&!m.includes('signup.html'),'links');
[['400101','Ana','Reyes','10'],['400102','Bree','Soto','9'],['400103','Cami','Tran','11'],['400104','Dee','Uribe','12']].forEach(a=>ok(run(`coachAddAthlete('${P}',{id:'${a[0]}',first:'${a[1]}',last:'${a[2]}',grade:'${a[3]}'})`).ok,'add '+a[1]));
ok(run(`coachAddAthlete('${P}',{id:'400199',first:'Mia',last:'Vega',grade:'',role:'Manager'})`).ok,'manager added');
ok(run(`coachLogin('${P}')`).cycle===true,'coach screens are told the cycle log is on');

// consent gate + own-phone rule
r=run("athleteCheckIn('400101','g1','')"); ok(r.ok&&r.me.status==='Present'&&!('cycle' in r.me),'no consent form on file: no box');
r=run("athleteCycle('400101','g1',true)"); ok(r.error==='CYCLE_OFF'&&tab('Cycle').length===1,'and nothing can be saved for her');
ok(run(`coachCycle('${P}','000000')`).error==='HPIN'&&run(`coachCycle('000000','${H}')`).error==='PIN'&&run(`coachCycle('${P}')`).error==='HPIN','log needs both PINs');
run('__cache={}');
r=run(`coachCycle('${P}','${H}')`); ok(r.ok&&r.today===D&&r.athletes.length===4&&r.athletes.every(a=>!a.consent&&!a.today&&!a.spans.length)&&r.athletes[0].name==='Reyes, Ana','empty log lists the wrestlers, not the manager');
ok(run(`coachCycleMark('${P}','${H}','400101','${D}',true)`).error==='NO_CONSENT','coach cannot log a day without the form on file either');
ok(run(`coachCycleConsent('${P}','${H}','400101',true)`).ok&&tab('CycleConsent')[1].slice(0,3).join()==='400101,Ana Reyes,Y','consent marked on file');
ok(run(`coachCycleConsent('${P}','${H}','400199',true)`).ok===false,'not for a manager');
r=run("athleteState('400101','g1')"); ok(r.me.cycle&&r.me.cycle.on===false,'her own phone now shows the box, unticked');
ok(!('cycle' in run("athleteState('400101','zz')").me)&&!('cycle' in run("athleteState('400101','')").me)&&!('cycle' in run("athleteState('400101')").me),'another phone that types her ID sees nothing');
r=run("athleteCheckIn('400102','g2','')"); ok(r.ok&&!('cycle' in r.me),'a teammate without the form still sees nothing');
ok(run("athleteCycle('400101','zz',true)").error==='CYCLE_OFF'&&run("athleteCycle('400101','',true)").error==='CYCLE_OFF'&&tab('Cycle').length===1,'another phone cannot save for her');
r=run("athleteCycle('400101','g1',true)"); ok(r.ok&&r.me.cycle.on===true&&tab('Cycle')[1].join()==='2026-11-09,400101,Ana Reyes,15:40,Athlete','ticked on her phone: one row');
ok(run("athleteCycle('400101','g1',true)").ok&&tab('Cycle').length===2,'ticking twice is one row');
ok(!('cycle' in run("athleteState('400101','zz')").me),'still invisible to another phone after she ticks it');
r=run("athleteWeight('400101','pre','130.5','g1')"); ok(r.ok&&r.me.pre==='130.5'&&r.me.cycle.on===true,'saving a weight keeps the box on her phone');
r=run("athleteWeight('400101','post','129','')"); ok(r.ok&&!('cycle' in r.me),'a weight saved without the phone id carries nothing');
ok(post({fn:'athleteCycle',args:['400101','g1',false]}).me.cycle.on===false&&tab('Cycle').length===1,'unticking removes the row (through the web entry)');
run("athleteCycle('400101','g1',true)");

// the other coach screens never carry it
const quiet=(o)=>!/cycle|778899/i.test(JSON.stringify(o));
ok(quiet(run(`coachDay('${P}','${D}')`))&&quiet(run(`coachReport('${P}','2026-11-01','${D}')`))&&quiet(run(`coachAthlete('${P}','400101')`))&&quiet(run(`coachRoster('${P}')`))&&quiet(run(`coachTravelPeople('${P}','')`)),'Today, Reports, athlete page, roster and travel screens carry no cycle data');
ok(run(`coachExport('${P}','2026-11-01','${D}')`).ok&&quiet(tab('Report')),'the exported report has no cycle data');

// coach-marked athlete, coach edits, optional session
ok(run(`coachMark('${P}','${D}','400103','Present')`).ok&&!('cycle' in run("athleteState('400103','g3')").me),'marked by coach: no phone owns the day');
run(`coachCycleConsent('${P}','${H}','400103',true)`); ok(!('cycle' in run("athleteState('400103','g3')").me),'still none after her form is on file');
ok(run(`coachCycleMark('${P}','${H}','400103','${D}',true)`).ok&&tab('Cycle')[2].join()==='2026-11-09,400103,Cami Tran,15:40,Coach','coach logs the day for her');
at('2026-11-09T23:10:00Z'); run(`coachCycleConsent('${P}','${H}','400104',true)`);
r=run("athleteCheckIn('400104','g4','')"); ok(r.me.status==='Late'&&r.me.cycle,'late self check-in has the box');
run(`coachMark('${P}','${D}','400104','Present')`); ok(run("athleteState('400104','g4')").me.cycle,'coach fixing Late to Present keeps it on her phone');
run(`coachMark('${P}','${D}','400104','Absent')`); ok(!('cycle' in run("athleteState('400104','g4')").me),'marked Absent: no box');
at('2026-11-15T17:00:00Z');                                       // Sun Nov 15, 10:00 AM: no practice
ok(run(`coachSessionStart('${P}','Open mat',60,'')`).ok,'optional session');
r=run("athleteCheckIn('400101','g1','')"); ok(r.ok&&r.me.extras.length===1&&r.me.cycle&&r.me.cycle.on===false,'optional-session check-in has the box, fresh for the new day');
ok(!('cycle' in run("athleteState('400101','zz')").me),'not for another phone');

// periods as reported
at('2026-12-08T22:40:00Z');                                       // Tue Dec 8
['2026-11-10','2026-11-11','2026-11-13','2026-11-16','2026-11-20','2026-12-07','2026-12-08'].forEach(d=>ok(run(`coachCycleMark('${P}','${H}','400101','${d}',true)`).ok,'log '+d));
r=run(`coachCycle('${P}','${H}')`); let a1=r.athletes.filter(a=>a.id==='400101')[0];
ok(a1.consent&&a1.today&&a1.spans.length===3,'three periods: '+JSON.stringify(a1.spans));
ok(a1.spans[0].from==='2026-12-07'&&a1.spans[0].to==='2026-12-08'&&a1.spans[0].days===2&&a1.spans[0].open===true,'newest first, open today');
ok(a1.spans[1].from==='2026-11-20'&&a1.spans[1].days===1&&a1.spans[1].open===false,'4 days after the last report starts a new one');
ok(a1.spans[2].from==='2026-11-09'&&a1.spans[2].to==='2026-11-16'&&a1.spans[2].days===8&&a1.spans[2].dates.length===5,'a weekend gap (Fri to Mon) stays one period');
ok(r.athletes.filter(a=>a.id==='400103')[0].today===false&&r.athletes.filter(a=>a.id==='400102')[0].consent===false,'others');
ok(run(`coachCycleMark('${P}','${H}','400101','2026-12-08',false)`).ok&&run(`coachCycle('${P}','${H}')`).athletes[0].today===false,'coach removes a day');
ok(run(`coachCycleMark('${P}','${H}','400101','2026-12-09',true)`).ok===false&&run(`coachCycleMark('${P}','${H}','400101','12-01',true)`).ok===false&&run(`coachCycleMark('${P}','${H}','999999','2026-12-01',true)`).ok===false,'future day, bad day and unknown athlete rejected');
ok(run("cycleSpans_(['2026-11-16','junk','2026-11-13','2026-11-13',''],'2026-11-16')").length===1,'spans ignore junk and repeats');

// Health PIN lockout
run('__cache={}');
for(let i=0;i<4;i++)ok(run(`coachCycle('${P}','0000')`).error==='HPIN','wrong try '+(i+1));
ok(run(`coachCycle('${P}','${H}')`).ok,'right PIN clears the count');
for(let i=0;i<4;i++)run(`coachCycle('${P}','0000')`);
ok(run(`coachCycle('${P}','0000')`).error==='HPIN_LOCKED','fifth wrong try locks it');
ok(run(`coachCycle('${P}','${H}')`).error==='HPIN_LOCKED'&&run(`coachCycleErase('${P}','${H}','400101')`).error==='HPIN_LOCKED','locked even with the right PIN');
ok(run(`coachDay('${P}','${D}')`).ok,'the rest of the coach screens keep working while it is locked');
run('__cache={}'); ok(run(`coachCycle('${P}','${H}')`).ok,'open again after the lock runs out');

// consent withdrawn, erase
const before=tab('Cycle').length;
ok(run(`coachCycleConsent('${P}','${H}','400101',false)`).ok&&tab('CycleConsent').filter(x=>x[0]==='400101').length===1&&tab('CycleConsent').filter(x=>x[0]==='400101')[0][2]==='N','consent turned off in place');
at('2026-12-08T22:45:00Z'); r=run("athleteCheckIn('400101','g1','')"); ok(r.ok&&!('cycle' in r.me)&&tab('Cycle').length===before,'box gone; logged days stay until erased');
r=run(`coachCycleErase('${P}','${H}','400101')`); ok(r.ok&&r.removed===before-2&&tab('Cycle').length===2&&tab('Cycle')[1][1]==='400103','erase removes only her days');
ok(run(`coachCycle('${P}','${H}')`).athletes[0].spans.length===0,'her log is empty');

// switches
setRow('CYCLE_TRACKING','N'); run(`coachCycleConsent('${P}','${H}','400101',true)`);
ok(run(`coachLogin('${P}')`).cycle===false&&run(`coachCycle('${P}','${H}')`).error==='CYCLE_OFF'&&!('cycle' in run("athleteState('400101','g1')").me),'CYCLE_TRACKING = N turns it all off');
setRow('CYCLE_TRACKING','Y'); setRow('HEALTH_PIN','222222'); ok(run(`coachLogin('${P}')`).cycle===false,'Health PIN same as coach PIN: off');
setRow('HEALTH_PIN','778899');
ok(post({fn:'coachCycle',args:['000000','x']}).error==='PIN'&&post({fn:'coachCycleErase',args:['000000','x','400103']}).error==='PIN','web entry guarded by the coach PIN');
['cycleSpans_','setCycle_','health_','cycleConsent_','cycleFor_','cycleOn_','setupGirls','setup_','setCfg_'].forEach(f=>ok(post({fn:f,args:[]}).error==='BAD',f+' is not callable from the web'));

// ---------- 3. "setup" run by mistake before "setupGirls" on an unused Sheet ----------
run('__book.sheets={};__cache={};__memo={}');
ok(/^Setup complete\. No OLD_SHEET_ID/.test(run('setup()'))&&cfgRow('TEAM_NAME')==='West Point Dragons Wrestling','plain setup first');
const pin0=cfgRow('COACH_PIN'); setRow('TRAVEL_EMAIL_SIGNOFF','Coach Avery');
m=run('setupGirls()');
ok(/for West Point Girls Wrestling/.test(m)&&cfgRow('TEAM_NAME')==='West Point Girls Wrestling'&&cfgRow('SITE_URL').endsWith('/girls/')&&cfgRow('SIGNUP_OPEN')==='N'&&cfgRow('COACH_PIN')===pin0,'untouched settings move to the girls values; the PIN is kept');
ok(cfgRow('TRAVEL_EMAIL_SIGNOFF')==='Coach Avery'&&/^\d{6}$/.test(cfgRow('HEALTH_PIN'))&&cfgRow('HEALTH_PIN')!==pin0&&tab('Cycle').length===1,'a setting the coach already changed is left alone');
console.log('ALL',n,'GIRLS TEAM AND CYCLE LOG CHECKS PASSED');
