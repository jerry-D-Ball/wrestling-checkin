// The Monday attendance email. Run: node test/report.test.js     (all names are made up)
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const ctx=vm.createContext({console,Intl,Date,Math,JSON,String,Number,Object,Array,RegExp,Error,isFinite,btoa});
ctx.globalThis=ctx;
vm.runInContext(fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8'),ctx);
const run=(s)=>vm.runInContext(s,ctx);
const at=(iso)=>run(`__now=new Date('${iso}')`);
let n=0; const ok=(c,m)=>{n++;assert.ok(c,m);};
const cfgRow=(k)=>run(`(__book.getSheetByName('Config').data.filter(function(r){return r[0]==='${k}'})[0]||[])[1]`);
const setRow=(k,v)=>run(`__book.getSheetByName('Config').data.forEach(function(r){if(r[0]==='${k}')r[1]='${v}'});__memo={}`);
const mail=()=>run('__mail'), last=()=>mail()[mail().length-1];
const post=(o)=>JSON.parse(run(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(o))}}})`).__text);
const section=(html,title)=>{const i=html.indexOf('<h3'),a=html.indexOf(title,i);if(a<0)return null;const e=html.indexOf('</table>',a);return html.slice(a,e);};
const P='123456',TO='grant@example.org';

// ---------- boys Sheet ----------
run('__seedOld()'); at('2026-11-05T22:40:00Z');                              // Thu Nov 5, 3:40 PM Phoenix
run("var c=__book.insertSheet('Config');c.appendRow(['Key','Value','What it does']);c.appendRow(['OLD_SHEET_ID','OLDID','']);c.appendRow(['PRESENCE_CHECK','Off','']);");
let m=run('setup()');
ok(/Weekly attendance email: off\. To turn it on, put the address in the REPORT_EMAIL_TO row/.test(m),'setup says the weekly email is off until an address is set: '+m);
ok(cfgRow('REPORT_EMAIL_TO')===''&&cfgRow('REPORT_BY_DAY')==='Y'&&cfgRow('REPORT_LAST_SENT')==='','settings rows added');
let t=run('__triggers'); ok(t.length===1&&t[0].fn==='weeklyReport'&&t[0].day==='MONDAY'&&t[0].hour===6&&t[0].minute===0&&t[0].weeks===1&&t[0].tz==='America/Phoenix','one Monday 6 AM Phoenix timer: '+JSON.stringify(t));
setRow('COACH_PIN',P);
at('2026-11-16T13:02:00Z'); ok(/nothing sent/.test(run('weeklyReport()'))&&mail().length===0,'no address: the timer runs and sends nothing');
setRow('REPORT_EMAIL_TO','not-an-address'); ok(/nothing sent/.test(run('weeklyReport()'))&&mail().length===0,'a typo that is not an email address sends nothing');
setRow('REPORT_EMAIL_TO',TO);
run("__triggers.push({getHandlerFunction:function(){return 'somethingElse'}})");
m=run('setup()'); t=run('__triggers');
ok(t.length===2&&t.filter(x=>x.getHandlerFunction()==='weeklyReport').length===1,'running setup again leaves exactly one timer and does not touch other timers');
ok(m.includes('Weekly attendance email: every Monday at about 6 AM to '+TO+'.'),'setup confirms who it goes to: '+m);
run("__triggerFail='fancy'"); run('setup()'); t=run('__triggers').filter(x=>x.fn==='weeklyReport');
ok(t.length===1&&t[0].day==='MONDAY'&&t[0].hour===6&&t[0].minute===undefined,'falls back to the plainest Monday 6 AM timer if Google rejects the detailed one');
run("__triggerFail='all'"); m=run('setup()'); ok(/THE MONDAY TIMER WAS NOT SET \(Authorization is required\)/.test(m)&&/Setup complete/.test(m),'no permission yet: setup still finishes and says so');
run("__triggerFail=''"); run('setup()');

// the week before (must not appear), then the week of Nov 9
at('2026-11-06T22:40:00Z'); ok(run("athleteCheckIn('300117','p0','')").ok,'Fri Nov 6');
at('2026-11-09T22:40:00Z'); ok(run("athleteCheckIn('300100','p1','')").me.status==='Present','Mon on time');
at('2026-11-09T23:10:00Z'); ok(run("athleteCheckIn('300101','p2','')").me.status==='Late','Mon late');
run(`coachMark('${P}','2026-11-09','300102','Absent',null)`); run(`coachMark('${P}','2026-11-09','300103','Excused','doctor')`);
at('2026-11-10T22:40:00Z'); run("athleteCheckIn('300100','p1','')"); ok(run(`coachMark('${P}','2026-11-10','300104','Present',null)`).ok,'Tue: marked by coach');
run(`coachAddAthlete('${P}',{id:'300900',first:'Mia',last:'Vega',grade:'',role:'Manager'})`);
run("__book.getSheetByName('SessionLog').appendRow(['SX','2026-11-10','300900','Mia Vega','Weight room','15:00','Coach',''])");            // a manager row typed by hand
run("__book.getSheetByName('Attendance').appendRow(['2026-11-10','399999','Zed Unknown','Present','15:50','Coach','','',''])");           // someone no longer on the roster
run("__book.getSheetByName('Athletes').data.forEach(function(r){if(r[0]==='300104')r[1]='Theo <T&J>'});__memo={}");
ok(run(`coachSetActive('${P}','300101',false)`).ok,'Dante removed from the roster mid-week');
at('2026-11-14T17:00:00Z');                                                  // Sat Nov 14, 10 AM: no practice
let s=run(`coachSessionStart('${P}','Saturday recovery',60,'')`); ok(s.ok,'optional session');
ok(run("athleteCheckIn('300105','p5','')").me.extras.length===1&&run(`coachSessionMark('${P}','${s.id}','300106',true)`).ok,'two at the Saturday session');

// a test send on Friday goes to the owner only
at('2026-11-13T18:00:00Z'); m=run('weeklyReportTest()');
ok(mail().length===1&&last().to==='owner@example.com'&&!last().cc&&/^TEST - /.test(last().subject),'test goes only to the Sheet owner');
ok(last().htmlBody.includes('TEST. This copy went only to you.')&&last().htmlBody.includes(TO)&&last().body.includes('Week of Mon, Nov 9 to Sun, Nov 15, 2026')&&m.includes('Test sent to owner@example.com'),'test shows this week so far and says where the real one goes');
ok(cfgRow('REPORT_LAST_SENT')==='','a test does not count as the week being sent');
run("__owner=''"); m=run('weeklyReportTest()'); ok(mail().length===1&&/Could not read your own email/.test(m),'no owner address: no test sent');
run("__owner='owner@example.com';__mail=[]");

// Monday 6:02 AM: the real one
at('2026-11-16T13:02:00Z'); m=run('weeklyReport()');
ok(mail().length===1&&last().to===TO&&!last().cc&&last().name==='West Point Dragons Wrestling','sent to the grant contact, from the team: '+m);
ok(last().subject==='West Point Dragons Wrestling attendance: week of Mon, Nov 9 to Sun, Nov 15','subject: '+last().subject);
let h=last().htmlBody,b=last().body;
ok(b.includes('Week of Mon, Nov 9 to Sun, Nov 15, 2026')&&b.includes('6 students attended on 3 days.')&&h.includes('6 students attended on 3 days.'),'week and totals');
let mon=section(h,'Mon, Nov 9: 2 students'),tue=section(h,'Tue, Nov 10: 3 students'),sat=section(h,'Sat, Nov 14: 2 students');
ok(mon&&tue&&sat&&(h.match(/<h3/g)||[]).length===3,'one list per day that had attendance, none for the other days');
ok(/>300100<\/td><td[^>]*>Alvarez, Marco</.test(mon)&&/>300101<\/td><td[^>]*>Brooks, Dante</.test(mon),'Monday: on time and late both count; a removed athlete still shows for the day he came');
ok(!/Castillo|Diaz/.test(h),'absent and excused are not listed');
ok(/>300104<\/td><td[^>]*>Estrada, Theo &lt;T&amp;J&gt;</.test(tue)&&!h.includes('<T&J>'),'marked by coach counts; odd characters are escaped');
ok(/>399999<\/td><td[^>]*>Zed Unknown</.test(tue)&&tue.indexOf('Alvarez')<tue.indexOf('Estrada')&&tue.indexOf('Estrada')<tue.indexOf('Zed Unknown'),'someone off the roster keeps the name on the attendance row; lists sort by last name');
ok(/Flores, Andre/.test(sat)&&/Garza, Micah/.test(sat),'optional session days count');
ok(!/Vega|Ramos|300900|300117/.test(h+b),'no manager, and nobody from the week before');
ok(!/\b(late|absent|excused|present|grade|eligible|weight|injured|pin)\b/i.test(h.replace(/<[^>]+>/g,' ')+b),'names and IDs only: no status, grade, weight or other detail');
ok(b.includes('Mon, Nov 9: 2 students\n300100  Alvarez, Marco\n300101  Brooks, Dante\n')&&!/[<>]/.test(b.replace('Theo <T&J>','')),'plain-text copy for mail programs that do not show tables');
ok((h.match(/<th /g)||[]).length===6&&!/<th[^>]*>(?!Student ID|Name)/.test(h),'the only columns are Student ID and Name');
ok(/^2026-11-09 week, sent 2026-11-16 06:02:00 to grant@example\.org$/.test(cfgRow('REPORT_LAST_SENT')),'the Sheet records that the week went out: '+cfgRow('REPORT_LAST_SENT'));
m=run('weeklyReport()'); ok(mail().length===1&&/already went out/.test(m),'a second run the same morning does not send twice');
at('2026-11-17T20:00:00Z'); run('weeklyReport()'); ok(mail().length===1,'run by hand later that week: still not sent twice');

// one list for the whole week
setRow('REPORT_BY_DAY','N'); let w=run("weekMail_('2026-11-09')");
ok(w.htmlBody.includes('Attended at least one day: 6 students')&&(w.htmlBody.match(/<h3/g)||[]).length===1&&(w.htmlBody.match(/>300100</g)||[]).length===1,'REPORT_BY_DAY = N: one list, each student once');
setRow('REPORT_BY_DAY','Y');

// following weeks
at('2026-11-16T22:40:00Z'); run("athleteCheckIn('300107','p7','')");
ok(!run("weekMail_('2026-11-09')").htmlBody.includes('Hale'),'the next Monday is outside the week');
setRow('REPORT_EMAIL_CC','coach@example.org');
run("__mailFail='Service invoked too many times'"); at('2026-11-23T13:00:00Z');
let threw=false; try{run('weeklyReport()');}catch(e){threw=/too many times/.test(e.message);}
ok(threw&&mail().length===1&&/^2026-11-09/.test(cfgRow('REPORT_LAST_SENT')),'if Google refuses the send, the run fails loudly and the week is not marked as sent');
run("__mailFail=''"); at('2026-11-23T15:30:00Z'); run('weeklyReport()');
ok(mail().length===2&&last().cc==='coach@example.org'&&last().subject.endsWith('week of Mon, Nov 16 to Sun, Nov 22')&&last().body.includes('1 student attended on 1 day.')&&last().htmlBody.includes('Hale, Isaac'),'run again later that Monday: the week goes out, with the copy address');
at('2026-11-30T13:00:00Z'); run('weeklyReport()');
ok(mail().length===3&&last().body.includes('No attendance was recorded this week.')&&!last().htmlBody.includes('<table')&&last().subject.endsWith('week of Mon, Nov 23 to Sun, Nov 29'),'a week with no practice still sends, saying so');
at('2027-01-04T13:00:00Z'); run('weeklyReport()'); ok(last().body.includes('Week of Mon, Dec 28 to Sun, Jan 3, 2027'),'a week across New Year');
['weeklyReport','weeklyReportTest','weekMail_','weekAttendance_','installWeeklyTimer_','ownerEmail_','say_','note_'].forEach(f=>ok(post({fn:f,args:[]}).error==='BAD',f+' cannot be called from the web'));
const sent=mail().length; ok(sent===4&&post({fn:'weeklyReport',args:[]}).error==='BAD'&&mail().length===sent,'nobody on the web can make it send');

// ---------- girls Sheet ----------
run('__book.sheets={};__cache={};__memo={};__mail=[];__triggers=[]'); at('2026-11-09T22:40:00Z');
m=run('setupGirls()'); ok(/Weekly attendance email: off/.test(m)&&run('__triggers').length===1,'girls Sheet gets its own Monday timer');
setRow('COACH_PIN','222222'); setRow('HEALTH_PIN','778899'); setRow('PRESENCE_CHECK','Off'); setRow('REPORT_EMAIL_TO',TO);
run("coachAddAthlete('222222',{id:'400101',first:'Ana',last:'Reyes',grade:'10'})"); run("coachAddAthlete('222222',{id:'400102',first:'Bree',last:'Soto',grade:'9'})");
run("athleteCheckIn('400101','g1','')"); run("coachCycleConsent('222222','778899','400101',true)");
ok(run("athleteCycle('400101','g1',true)").ok&&run("__book.getSheetByName('Cycle').data.length")===2,'a cycle day is logged for her');
at('2026-11-16T13:00:00Z'); run('weeklyReport()');
ok(mail().length===1&&last().to===TO&&last().subject==='West Point Girls Wrestling attendance: week of Mon, Nov 9 to Sun, Nov 15'&&/>400101<\/td><td[^>]*>Reyes, Ana</.test(last().htmlBody)&&!/Soto/.test(last().htmlBody),'girls email: own team name, who attended');
ok(!/cycle|778899|222222|consent/i.test(JSON.stringify(last())),'the girls email carries nothing from the cycle log');
console.log('ALL',n,'WEEKLY ATTENDANCE EMAIL CHECKS PASSED');
