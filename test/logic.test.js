const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const ctx=vm.createContext({console,Intl,Date,Math,JSON,String,Number,Object,Array,RegExp,Error,isFinite});
ctx.globalThis=ctx;
vm.runInContext(fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8'),ctx);
const run=(s)=>vm.runInContext(s,ctx);
const at=(iso)=>run(`__now=new Date('${iso}')`);
let n=0; const ok=(c,m)=>{n++;assert.ok(c,m);};
run('__seedOld()');
at('2026-11-05T22:40:00Z');                       // Thu 3:40 PM Phoenix
run("var c=__book.insertSheet('Config');c.appendRow(['Key','Value','What it does']);c.appendRow(['OLD_SHEET_ID','OLDID','']);");
const msg=run('setup()'); ok(/18 athletes added/.test(msg),msg);
ok(/^\d{6}$/.test(run("cfg_('COACH_PIN')")),'pin generated');
run("__book.getSheetByName('Config').data.forEach(function(r){if(r[0]==='COACH_PIN')r[1]='123456'})");
ok(run('setup()').includes('Setup complete'),'setup is safe to run twice');
ok(run("__book.getSheetByName('Athletes').data.length")===19,'no duplicate roster rows');
const P='123456', D='2026-11-05';
// --- athlete
ok(run("athleteState('999','d1')").error==='NOT_FOUND','unknown id');
let r=run("athleteCheckIn('300100','d1','')"); ok(r.ok&&r.me.status==='Present'&&r.me.time==='15:40','on-time check-in');
r=run("athleteCheckIn('300100','d1','')"); ok(r.ok&&r.already,'second scan is harmless');
ok(run("__book.getSheetByName('Attendance').data.length")===2,'no duplicate attendance row');
r=run("athleteCheckIn('300101','d1','')"); ok(!r.ok&&r.error==='DEVICE','one phone cannot check in two athletes');
at('2026-11-05T23:06:00Z'); r=run("athleteCheckIn('300101','d2','')"); ok(r.ok&&r.me.status==='Late','4:06 is late');
at('2026-11-05T23:05:00Z'); r=run("athleteCheckIn('300102','d3','')"); ok(r.ok&&r.me.status==='Present','4:05 is on time');
at('2026-11-06T02:00:00Z'); r=run("athleteCheckIn('300103','d4','')"); ok(!r.ok&&r.error==='CLOSED'&&/closed at 6:30 PM/.test(r.message),'closed after 6:30');
at('2026-11-05T21:00:00Z'); r=run("athleteCheckIn('300103','d4','')"); ok(!r.ok&&/opens at 3:00 PM/.test(r.message),'not open before 3');
at('2026-11-07T23:00:00Z'); r=run("athleteCheckIn('300103','d4','')"); ok(!r.ok&&r.error==='CLOSED','Saturday closed');
ok(run(`coachSetConfig('${P}','EXTRA_OPEN_DATE','2026-11-07')`).ok,'open Saturday');
r=run("athleteCheckIn('300103','d4','')"); ok(r.ok&&r.me.status==='Present','Saturday open when coach opens it');
at('2026-11-05T22:50:00Z');
// room code
ok(run(`coachSetConfig('${P}','ROOM_CODE_REQUIRED','Yes')`).ok,'code on');
const code=run(`coachDay('${P}','${D}')`).code; ok(/^\d\d$/.test(code),'2 digit code');
ok(run("athleteCheckIn('300104','d5','')").error==='CODE','code required');
ok(run("athleteCheckIn('300104','d5','00')").error==='CODE','wrong code');
ok(run(`athleteCheckIn('300104','d5','${code}')`).ok,'right code');
run(`coachSetConfig('${P}','ROOM_CODE_REQUIRED','No')`);
// --- coach
ok(run("coachDay('000000','')").error==='PIN','bad pin rejected');
ok(run("coachMark('000000','','300105','Present')").error==='PIN','bad pin cannot write');
ok(run(`coachMark('${P}','${D}','300105','Present',null)`).ok,'coach marks here');
ok(run(`coachMark('${P}','${D}','300106','Excused','doctor')`).ok,'excused');
ok(run(`coachMark('${P}','${D}','300107','Absent',null)`).ok,'absent');
ok(run(`coachMark('${P}','${D}','300105','',null)`).ok,'clear');
let day=run(`coachDay('${P}','${D}')`); const by=(id)=>day.athletes.find(a=>a.id===id);
ok(day.athletes.length===18&&by('300100').status==='Present'&&by('300101').status==='Late'&&by('300106').note==='doctor'&&by('300105').status==='','day view');
ok(by('300104').cleared===false&&by('300100').cleared===true,'clearance flag carried over');
ok(day.athletes[0].name==='Alvarez, Marco','sorted by last name');
// coach override of a self check-in keeps the time
run(`coachMark('${P}','${D}','300101','Present',null)`); day=run(`coachDay('${P}','${D}')`); ok(by('300101').status==='Present'&&by('300101').time==='16:06','override keeps time');
// --- weights
ok(run("athleteWeight('300100','pre','152.4')").ok,'pre');
r=run("athleteWeight('300100','post','147.2')"); ok(r.me.change==='-5.2','change');
ok(run("athleteWeight('300100','pre','15')").error==='RANGE','range check');
ok(run("athleteWeight('300100','pre','abc')").error==='RANGE','non-number');
r=run(`coachWeight('${P}','${D}','300102','pre','160')`); ok(r.ok&&r.pre==='160','coach weight');
r=run(`coachWeight('${P}','${D}','300102','post','161.5')`); ok(r.chg==='1.5'&&r.pct==='0.9','gain pct');
r=run(`coachWeight('${P}','${D}','300102','pre','')`); ok(r.ok&&r.pre===''&&r.chg==='','clear one side');
run(`coachWeight('${P}','${D}','300102','post','')`); ok(run("__book.getSheetByName('Weights').data.length")===2,'empty row removed');
ok(run("__book.getSheetByName('Weights').data[1][8]")==='-3.4','pct stored');
// --- second day + report
at('2026-11-06T22:55:00Z');
['300100','300102','300106'].forEach((id,i)=>ok(run(`athleteCheckIn('${id}','x${i}','')`).ok,'day2 '+id));
ok(run(`coachDay('${P}','2026-11-06')`).athletes.find(a=>a.id==='300100').last==='152.4','last weight shown next day');
let rep=run(`coachReport('${P}','2026-11-02','2026-11-06')`); const rr=(id)=>rep.rows.find(x=>x.id===id);
ok(rep.days.join()==='2026-11-05,2026-11-06','practice days (Saturday excluded from range)');
ok(rr('300100').pct===100&&rr('300100').marks==='PP','100%');
ok(rr('300101').pct===50&&rr('300101').A===1,'50%');
ok(rr('300106').E===1&&rr('300106').pct===100,'excused not counted against');
ok(rr('300107').pct===0&&rr('300107').marks==='AA','absent both');
rep=run(`coachReport('${P}','2026-11-02','2026-11-08')`); ok(rep.days.length===3,'saturday counted in wider range');
let ath=run(`coachAthlete('${P}','300100')`); ok(ath.ok&&ath.days.length===3&&ath.weights[0].chg==='-5.2','athlete history');
let ex=run(`coachExport('${P}','2026-11-02','2026-11-06')`); ok(ex.ok&&ex.rows===18&&ex.days===2,'export');
ok(run("__book.getSheetByName('Report').data[1].slice(0,9).join('|')")==='Alvarez, Marco|9|2|0|0|0|100%|P|P','report grid row');
// --- roster admin
ok(run(`coachAddAthlete('${P}',{id:'300999',first:'New',last:'Kid',grade:'9'})`).ok,'add athlete');
ok(run("athleteState('300999','z')").ok,'new athlete can use app');
ok(run(`coachSetActive('${P}','300999',false)`).ok&&run("athleteState('300999','z')").error==='NOT_FOUND','inactive cannot check in');
ok(run(`coachDay('${P}','')`).athletes.length===18,'inactive hidden');
// --- trips
at('2026-11-06T20:30:00Z');
let t=run(`coachTripSave('${P}',{name:'Meet at Test HS',date:'2026-11-06',roster:['300100','300101','300102']})`); ok(t.ok,'trip saved'); const T=t.id;
ok(run(`coachTripSave('${P}',{name:'',date:'2026-11-06',roster:['1']})`).ok===false,'trip needs name');
r=run("athleteState('300100','b1')"); ok(r.me.trip&&r.me.trip.leg==='Depart'&&r.me.trip.status==='','athlete sees bus');
ok(run("athleteState('300105','b9')").me.trip===null,'non-rider sees no bus');
ok(run("athleteBoard('300105','b9')").error==='NO_TRIP','non-rider cannot board');
ok(run("athleteBoard('300100','b1')").ok,'self board');
ok(run("athleteBoard('300101','b1')").error==='DEVICE','one phone cannot board two');
ok(run(`coachTripMark('${P}','${T}','300101','Depart','On','')`).ok,'coach boards');
let tr=run(`coachTrip('${P}','${T}')`); ok(tr.riders.filter(x=>x.dep.status==='On').length===2&&tr.riders.find(x=>x.id==='300100').dep.self===true,'trip state');
run(`coachTripMark('${P}','${T}','300102','Depart','Released','riding with mom')`);
ok(run(`coachTripHeadcount('${P}','${T}','Depart',2)`).ok,'headcount');
tr=run(`coachTrip('${P}','${T}')`); ok(tr.headcount.Depart.n==='2','headcount stored');
run(`coachTripMark('${P}','${T}','300101','Depart','','')`);
tr=run(`coachTrip('${P}','${T}')`); ok(!tr.headcount.Depart&&tr.riders.find(x=>x.id==='300101').dep.status==='','changing a rider voids the head count');
ok(run(`coachTripLeg('${P}','${T}','Return')`).ok,'return leg');
r=run("athleteBoard('300100','b1')"); ok(r.ok&&r.me.trip.leg==='Return'&&r.me.trip.status==='On','board return');
tr=run(`coachTrip('${P}','${T}')`); ok(tr.riders.find(x=>x.id==='300100').ret.status==='On'&&tr.riders.find(x=>x.id==='300100').dep.status==='On','legs independent');
ok(run(`coachTrips('${P}')`).trips[0].accounted===1,'trip list count');
run(`coachTripLeg('${P}','${T}','Done')`); ok(run("athleteState('300100','b1')").me.trip===null,'finished trip disappears for athletes');
ok(run(`coachTripDelete('${P}','${T}')`).ok&&run("__book.getSheetByName('TripLog').data.length")===1,'delete trip clears log');
// --- robustness: Sheets reformatting dates/times
run("__book.getSheetByName('Attendance').data.push(['11/9/2026','300100','Marco Alvarez','Present','3:58 PM','Self','','q','x'])");
at('2026-11-09T23:30:00Z'); r=run("athleteState('300100','q')"); ok(r.me.status==='Present'&&r.me.time==='15:58','reads reformatted date/time');
// header added by a human in different column order still works
ok(run("normDate_('2026-1-5')")==='2026-01-05','normDate');
// --- web entry point
const post=(o)=>JSON.parse(run(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(o))}}})`).__text);
ok(post({fn:'athleteState',args:['300100','q']}).ok,'doPost routes');
ok(post({fn:'cfg_',args:['COACH_PIN']}).error==='BAD','private helpers are not callable');
ok(post({fn:'setup',args:[]}).error==='BAD','setup is not callable from the web');
ok(post({fn:'constructor',args:[]}).error==='BAD','object internals are not callable');
ok(post({fn:'coachDay',args:['000000','']}).error==='PIN','doPost enforces the PIN');
ok(run("doPost({postData:{contents:'not json'}})").__text.includes('SERVER'),'bad body handled');
ok(run("showLinks()").includes('https://jerry-d-ball.github.io/wrestling-checkin/?p=coach'),'links point at the site');
console.log('ALL',n,'CHECKS PASSED');
