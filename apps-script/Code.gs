/**
 * WEST POINT WRESTLING - ATTENDANCE, OPTIONAL SESSIONS, WEIGHTS, TRAVEL ROSTERS, BUS CHECK & FRESHMAN NIGHT SIGN-UP  (data script)
 *
 * This script lives in the attendance Google Sheet. It only saves and reads rows.
 * The screens athletes and coaches see are the website in this repository.
 *
 * FIRST TIME: 1) Run "setup" once (Run button above).
 *             2) Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 *             3) Copy the web app URL (ends in /exec) and give it to Claude for config.js.
 *
 * AFTER PASTING A NEW COPY OF THIS FILE:
 *             1) Run "setup" again. It is safe to repeat, and it asks for any new permission
 *                (such as sending the travel roster email).
 *             2) Deploy > Manage deployments > pencil > Version: New version > Deploy.
 *                Do NOT make a new deployment, or the app's address changes.
 */

var TABS = {
  Athletes:   ['StudentID', 'FirstName', 'LastName', 'Grade', 'Eligible', 'Injured', 'Active', 'Role'],
  Attendance: ['Date', 'StudentID', 'Name', 'Status', 'Time', 'Method', 'Note', 'DeviceID', 'UpdatedAt'],
  Weights:    ['Date', 'StudentID', 'Name', 'PreWeight', 'PreTime', 'PostWeight', 'PostTime', 'ChangeLb', 'ChangePct', 'EnteredBy'],
  Schedule:   ['Date', 'Start', 'End', 'Note'],
  Sessions:   ['SessionID', 'Date', 'Name', 'Start', 'End', 'Created'],
  SessionLog: ['SessionID', 'Date', 'StudentID', 'Name', 'Session', 'Time', 'Method', 'DeviceID'],
  Trips:      ['TripID', 'Date', 'Name', 'Leg', 'Roster', 'Created', 'DepLat', 'DepLng', 'RetLat', 'RetLng', 'Levels', 'Excuse', 'EmailedAt', 'EmailedTo', 'EmailedKey'],
  TripLog:    ['TripID', 'StudentID', 'Name', 'Leg', 'Status', 'Time', 'Method', 'Note'],
  Config:     ['Key', 'Value', 'What it does']
};

var DEFAULTS = [
  ['TEAM_NAME', 'West Point Dragons Wrestling', 'Shown at the top of the app and on the QR poster.'],
  ['COACH_PIN', '', 'PIN for the coach screens. Change it any time. Share only with coaches.'],
  ['TIMEZONE', 'America/Phoenix', 'School time zone.'],
  ['EARLY_START', '16:00', 'Start time of the early practice slot, 24-hour time (16:00 = 4:00 PM).'],
  ['LATE_START', '18:00', 'Start time of the late practice slot (18:00 = 6:00 PM).'],
  ['PRACTICE_LENGTH_MIN', '120', 'How long practice runs, in minutes.'],
  ['OPEN_BEFORE_MIN', '30', 'Check-in opens this many minutes before practice starts.'],
  ['LATE_AFTER_MIN', '5', 'Minutes after start before a self check-in counts as Late.'],
  ['CLOSE_AFTER_MIN', '120', 'Check-in closes this many minutes after practice starts. Anyone arriving after LATE_AFTER_MIN is marked Late, so this can run to the end of practice.'],
  ['PRACTICE_DAYS', 'Mon,Tue,Wed,Thu,Fri', 'Days that have practice when the Schedule tab has no row for the date. Set the slot per week from the app: More > Practice schedule.'],
  ['DEFAULT_SLOT', 'early', 'Slot used for a practice day that has no Schedule row: early or late.'],
  ['PRESENCE_CHECK', 'Location', 'How athletes prove they are there. Location = phone must be at school, daily code as backup. LocationOnly = no backup code. Code = type the daily code. Off = anywhere.'],
  ['SCHOOL_LAT', '', 'Latitude of the wrestling room. Set from the app: More > Set school location.'],
  ['SCHOOL_LNG', '', 'Longitude of the wrestling room.'],
  ['SCHOOL_RADIUS_M', '250', 'How close to the wrestling room a phone must be, in meters (250 m is about 270 yards).'],
  ['BUS_RADIUS_M', '200', 'How close to the bus a phone must be to board by scanning, in meters.'],
  ['TRAVEL_TITLE', "West Point Men's Wrestling", 'Title printed at the top of the travel roster PDF.'],
  ['TRAVEL_EMAIL_TO', '', 'Who the travel roster is emailed to (attendance office). Separate several addresses with commas.'],
  ['TRAVEL_EMAIL_CC', '', 'Optional: who gets a copy, for example your school email. Replies go to this address.'],
  ['TRAVEL_EMAIL_GREETING', 'Hello,', 'First line of the travel roster email.'],
  ['TRAVEL_EMAIL_SIGNOFF', 'West Point Wrestling Coaching Staff', 'Last line of the travel roster email.'],
  ['WEIGHT_LOSS_FLAG_PCT', '3', 'Flag an athlete whose weight drops more than this percent in one practice.'],
  ['OLD_SHEET_ID', '', 'ID of the old attendance Sheet. The roster is copied from its Athletes tab.'],
  ['SIGNUP_OPEN', 'Y', 'Future Freshman Night sign-up page: Y = taking sign-ups, N = closed.'],
  ['SIGNUP_SHEET_ID', '', 'ID of the Sheet that collects the Future Freshman Night sign-ups. Blank = a FreshmanNight tab in this Sheet.'],
  ['SITE_URL', 'https://jerry-d-ball.github.io/wrestling-checkin/', 'Address of the app website. This is what the QR code points to.']
];

var EDITABLE_KEYS = ['PRESENCE_CHECK', 'EARLY_START', 'LATE_START', 'OPEN_BEFORE_MIN', 'LATE_AFTER_MIN', 'CLOSE_AFTER_MIN', 'PRACTICE_LENGTH_MIN'];

var __now = null;      // tests only
var __memo = {};

/* ====================================================================== */
/*  WEB APP ENTRY                                                         */
/* ====================================================================== */

function doGet() {
  return ContentService.createTextOutput('West Point Wrestling attendance data script is running. Open the app at ' + appUrl_());
}

/** Every request from the website arrives here as {fn: "name", args: [...]}. */
function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var f = Object.prototype.hasOwnProperty.call(API_, req.fn) ? API_[req.fn] : null;
    out = f ? f.apply(null, req.args || []) : { ok: false, error: 'BAD', message: 'Unknown request. The app may need to be reloaded.' };
  } catch (err) {
    out = { ok: false, error: 'SERVER', message: 'Bad request. Try again.' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Attendance')
    .addItem('1. Set up (run once)', 'setup')
    .addItem('Update roster from old sheet', 'updateRosterFromOldSheet')
    .addItem('Show app links and coach PIN', 'showLinks')
    .addToUi();
}

/* ====================================================================== */
/*  SETUP                                                                 */
/* ====================================================================== */

function setup() {
  var ss = ss_();
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');   // plain text: no surprise date/number conversion
    if (sh.getLastRow() === 0) sh.appendRow(TABS[name]);
    else addMissingHeaders_(sh, TABS[name]);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  __memo = {};
  var have = {};
  read_('Config').rows.forEach(function (r) { have[r.Key] = true; });
  var firstTime = !have.COACH_PIN;
  var cfgSheet = ss.getSheetByName('Config');
  DEFAULTS.forEach(function (d) {
    if (have[d[0]]) return;
    var row = d.slice();
    if (d[0] === 'COACH_PIN') row[1] = String(Math.floor(100000 + Math.random() * 900000));
    cfgSheet.appendRow(row);
  });
  __memo = {};
  var msg = '';
  if (read_('Athletes').rows.length === 0) {
    try { msg = importRoster_(); } catch (err) { msg = 'Roster was NOT copied (' + err.message + '). Paste your roster into the Athletes tab.'; }
  }
  var out = 'Setup complete. ' + msg + '\nCoach PIN: ' + cfg_('COACH_PIN') + (firstTime
    ? '\n\nNext: Deploy > New deployment > Web app > Execute as "Me", Who has access "Anyone". Then copy the web app URL (ends in /exec) and give it to Claude.'
    : '\n\nNext: Deploy > Manage deployments > pencil > Version: New version > Deploy. (Do not make a new deployment.)');
  try { SpreadsheetApp.getUi().alert(out); } catch (err) { /* run from editor */ }
  Logger.log(out);
  return out;
}

function addMissingHeaders_(sh, want) {
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0];
  want.forEach(function (h) {
    if (head.indexOf(h) < 0) { head.push(h); sh.getRange(1, head.length, 1, 1).setValues([[h]]); }
  });
}

function updateRosterFromOldSheet() {
  var msg = importRoster_();
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) {}
  return msg;
}

/** Copies / refreshes athletes from the old sheet's Athletes tab. Never deletes anyone. */
function importRoster_() {
  var id = cfg_('OLD_SHEET_ID');
  if (!id) return 'No OLD_SHEET_ID set.';
  var src = SpreadsheetApp.openById(id).getSheetByName('Athletes');
  if (!src) throw new Error('old sheet has no Athletes tab');
  var vals = src.getDataRange().getDisplayValues();
  var head = vals[0];
  var col = function (n) { return head.indexOf(n); };
  __memo = {};
  var mine = read_('Athletes');
  var byId = {};
  mine.rows.forEach(function (r) { byId[r.StudentID] = r; });
  var added = 0, updated = 0;
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i], sid = String(v[col('StudentID')] || '').trim();
    if (!sid) continue;
    var rec = {
      StudentID: sid, FirstName: v[col('FirstName')], LastName: v[col('LastName')], Grade: v[col('Grade')],
      Eligible: col('Eligible') < 0 ? '' : v[col('Eligible')], Injured: col('Injured') < 0 ? '' : v[col('Injured')]
    };
    if (byId[sid]) { update_('Athletes', byId[sid]._row, { Eligible: rec.Eligible, Injured: rec.Injured, Grade: rec.Grade }); updated++; }
    else { rec.Active = 'Y'; append_('Athletes', rec); added++; }
  }
  __memo = {};
  return 'Roster: ' + added + ' athletes added, ' + updated + ' updated.';
}

function showLinks() {
  var u = appUrl_();
  var msg = 'Athlete check-in (this is the QR code link):\n' + u + '\n\nCoach screens:\n' + u + '?p=coach\n\nQR poster to print:\n' + u + '?p=poster\n\nFuture Freshman Night sign-up:\n' + u + 'signup.html\n\nCoach PIN: ' + cfg_('COACH_PIN');
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) {}
  Logger.log(msg);
  return msg;
}

/* ====================================================================== */
/*  ATHLETE (student phone)                                               */
/* ====================================================================== */

function athleteState(studentId, deviceId) {
  return safe_(function () {
    var a = athlete_(studentId);
    if (!a) return { ok: false, error: 'NOT_FOUND', message: 'That ID is not on the wrestling roster. Check the number or see Coach.' };
    return { ok: true, me: stateFor_(a, deviceId) };
  });
}

/**
 * One scan checks the athlete into whatever is open.
 *   what 'auto'  : practice if practice check-in is open; otherwise the optional session that is open.
 *   what 'extra' : the open optional session only (the athlete tapped "also here for ...").
 */
function athleteCheckIn(studentId, deviceId, proof, what) {
  return safe_(function () {
    var a = athlete_(studentId);
    if (!a) return { ok: false, error: 'NOT_FOUND', message: 'That ID is not on the wrestling roster. See Coach.' };
    if (a.staff) return { ok: false, error: 'STAFF', message: 'You are listed as a manager or student assistant. There is no practice check-in for you.', me: stateFor_(a, deviceId) };
    var day = today_();
    return locked_(function () {
      var existing = find_('Attendance', function (r) { return r.Date === day && r.StudentID === a.id; });
      var inPractice = !!existing && (existing.Status === 'Present' || existing.Status === 'Late');
      var w = window_(), s = openSession_();
      var inS = !!s && !!find_('SessionLog', function (r) { return r.SessionID === s.SessionID && r.StudentID === a.id; });
      var doPractice = what !== 'extra' && w.open && !existing;
      var doExtra = !!s && !inS && (what === 'extra' || !w.open);
      if (!doPractice && !doExtra) {
        if (what === 'extra') return inS ? { ok: true, already: true, me: stateFor_(a, deviceId) }
                                         : { ok: false, error: 'CLOSED', message: 'That session is closed. See Coach to be added.', me: stateFor_(a, deviceId) };
        if (inPractice || inS || find_('SessionLog', function (r) { return r.Date === day && r.StudentID === a.id; })) return { ok: true, already: true, me: stateFor_(a, deviceId) };
        if (existing) return { ok: false, error: 'MARKED', message: 'Coach marked you ' + existing.Status + ' today. If that is wrong, see Coach.', me: stateFor_(a, deviceId) };
        return { ok: false, error: 'CLOSED', message: w.reason, me: stateFor_(a, deviceId) };
      }
      var pr = presence_(schoolAnchor_(), proof, day);
      if (!pr.ok) return { ok: false, error: pr.error, message: pr.message, me: stateFor_(a, deviceId) };
      var mine = function (r) { return r.Date === day && r.DeviceID === deviceId && r.StudentID !== a.id && /^Self/.test(r.Method); };
      var other = deviceId && (find_('Attendance', mine) || find_('SessionLog', mine));
      if (other) return { ok: false, error: 'DEVICE', message: 'This phone already checked in ' + other.Name + ' today. One phone, one athlete. See Coach to be marked here.', me: stateFor_(a, deviceId) };
      if (doPractice) append_('Attendance', { Date: day, StudentID: a.id, Name: a.name, Status: w.late ? 'Late' : 'Present', Time: nowTime_(), Method: 'Self-' + pr.by, Note: '', DeviceID: deviceId || '', UpdatedAt: stamp_() });
      if (doExtra) append_('SessionLog', { SessionID: s.SessionID, Date: day, StudentID: a.id, Name: a.name, Session: s.Name, Time: nowTime_(), Method: 'Self-' + pr.by, DeviceID: deviceId || '' });
      return { ok: true, me: stateFor_(a, deviceId) };
    });
  });
}

function athleteWeight(studentId, kind, value) {
  return safe_(function () {
    var a = athlete_(studentId);
    if (!a) return { ok: false, error: 'NOT_FOUND', message: 'That ID is not on the roster. See Coach.' };
    var att = find_('Attendance', function (r) { return r.Date === today_() && r.StudentID === a.id; });
    var inSession = find_('SessionLog', function (r) { return r.Date === today_() && r.StudentID === a.id; });
    if (!inSession && (!att || (att.Status !== 'Present' && att.Status !== 'Late'))) return { ok: false, error: 'NOT_IN', message: 'Check in first. Your weight is saved only when you are checked in for today.', me: stateFor_(a, '') };
    var r = saveWeight_(today_(), a, kind, value, 'Athlete');
    if (!r.ok) return r;
    return { ok: true, me: stateFor_(a, '') };
  });
}

function athleteBoard(studentId, deviceId, proof) {
  return safe_(function () {
    var a = athlete_(studentId);
    if (!a) return { ok: false, error: 'NOT_FOUND', message: 'That ID is not on the roster. See Coach.' };
    return locked_(function () {
      var t = tripForAthlete_(a.id);
      if (!t) return { ok: false, error: 'NO_TRIP', message: 'No bus is boarding for you right now. See Coach.', me: stateFor_(a, deviceId) };
      var done = find_('TripLog', function (r) { return r.TripID === t.TripID && r.Leg === t.Leg && r.StudentID === a.id && r.Status === 'On'; });
      if (done) return { ok: true, me: stateFor_(a, deviceId) };
      var pr = presence_(tripAnchor_(t), proof, today_());
      if (!pr.ok) return { ok: false, error: pr.error, message: pr.message, me: stateFor_(a, deviceId) };
      var tag = 'Self:' + (deviceId || '');
      var other = deviceId && find_('TripLog', function (r) { return r.TripID === t.TripID && r.Leg === t.Leg && r.Method === tag && r.StudentID !== a.id; });
      if (other) return { ok: false, error: 'DEVICE', message: 'This phone already boarded ' + other.Name + '. See Coach to be marked on the bus.', me: stateFor_(a, deviceId) };
      var ex = find_('TripLog', function (r) { return r.TripID === t.TripID && r.Leg === t.Leg && r.StudentID === a.id; });
      var rec = { TripID: t.TripID, StudentID: a.id, Name: a.name, Leg: t.Leg, Status: 'On', Time: nowTime_(), Method: tag, Note: pr.by === 'Code' ? 'code' : '' };
      if (ex) { if (ex.Status !== 'On') update_('TripLog', ex._row, rec); } else append_('TripLog', rec);
      return { ok: true, me: stateFor_(a, deviceId) };
    });
  });
}

function stateFor_(a, deviceId) {
  var day = today_(), w = window_();
  var att = find_('Attendance', function (r) { return r.Date === day && r.StudentID === a.id; });
  var wt = find_('Weights', function (r) { return r.Date === day && r.StudentID === a.id; });
  var t = tripForAthlete_(a.id), trip = null;
  if (t) {
    var log = find_('TripLog', function (r) { return r.TripID === t.TripID && r.Leg === t.Leg && r.StudentID === a.id; });
    trip = { name: t.Name, leg: t.Leg, status: log ? log.Status : '', time: log ? log.Time : '' };
  }
  var s = openSession_();
  var logs = read_('SessionLog').rows.filter(function (r) { return r.Date === day && r.StudentID === a.id; });
  var inS = !!s && logs.some(function (r) { return r.SessionID === s.SessionID; });
  var inPractice = !!att && (att.Status === 'Present' || att.Status === 'Late');
  return {
    // canCheckIn: a scan right now would check this athlete into something. session.offer: show the "also here for ..." button.
    canCheckIn: !a.staff && ((w.open && !att) || (!!s && !inS && !w.open)),
    checkedIn: inPractice || logs.length > 0,
    session: s ? { name: s.Name, until: normTime_(s.End), 'in': inS, offer: !a.staff && !inS && w.open && !!att } : null,
    extras: logs.map(function (r) { return { name: r.Session, time: r.Time }; }),
    id: a.id, first: a.first, name: a.first + ' ' + a.last, date: day, staff: !!a.staff,
    status: att ? att.Status : '', time: att ? att.Time : '',
    open: w.open, closedReason: w.open ? '' : w.reason, presence: presenceMode_(), practice: w.practice ? { start: w.practice.start, end: w.practice.end, note: w.practice.note } : null,
    pre: wt ? wt.PreWeight : '', post: wt ? wt.PostWeight : '', change: wt ? wt.ChangeLb : '',
    trip: trip
  };
}

/* ====================================================================== */
/*  COACH                                                                 */
/* ====================================================================== */

function coachLogin(pin) { return coach_(pin, function () { return { ok: true, team: cfg_('TEAM_NAME'), today: today_() }; }); }

/** Everything the Today and Weights screens need for one date. */
function coachDay(pin, date) {
  return coach_(pin, function () {
    var day = normDate_(date) || today_();
    var att = {}, wts = {};
    read_('Attendance').rows.forEach(function (r) { if (r.Date === day) att[r.StudentID] = r; });
    read_('Weights').rows.forEach(function (r) { if (r.Date === day) wts[r.StudentID] = r; });
    var lastW = lastWeights_(day);
    var slogs = read_('SessionLog').rows.filter(function (l) { return l.Date === day; }), xs = {};
    slogs.forEach(function (l) { (xs[l.StudentID] = xs[l.StudentID] || []).push(l.Session); });
    var list = wrestlers_().map(function (a) {
      var r = att[a.id] || {}, w = wts[a.id] || {};
      return { id: a.id, name: a.last + ', ' + a.first, grade: a.grade, cleared: a.cleared, injured: a.injured, x: xs[a.id] || [],
               status: r.Status || '', time: r.Time || '', method: r.Method || '', note: r.Note || '',
               pre: w.PreWeight || '', post: w.PostWeight || '', chg: w.ChangeLb || '', pct: w.ChangePct || '', last: lastW[a.id] || '' };
    });
    var w = window_();
    return { ok: true, date: day, today: today_(), isToday: day === today_(), athletes: list,
             sessions: sessionsOn_(day).map(function (x) { return sessionInfo_(x, slogs); }),
             presence: presenceMode_(), schoolSet: !!schoolAnchor_(), code: roomCode_(day),
             open: w.open, closedReason: w.reason || '', practice: w.practice || null, todayOverride: !!find_('Schedule', function (r) { return r.Date === today_(); }),
             flagPct: Number(cfg_('WEIGHT_LOSS_FLAG_PCT')) || 3,
             settings: { early: cfg_('EARLY_START'), lateStart: cfg_('LATE_START'), before: cfg_('OPEN_BEFORE_MIN'), late: cfg_('LATE_AFTER_MIN'), after: cfg_('CLOSE_AFTER_MIN'), length: cfg_('PRACTICE_LENGTH_MIN'), days: cfg_('PRACTICE_DAYS') } };
  });
}

/** status: Present | Late | Excused | Absent | '' (clear) */
function coachMark(pin, date, studentId, status, note) {
  return coach_(pin, function () {
    var day = normDate_(date) || today_(), a = athlete_(studentId, true);
    if (!a) return { ok: false, message: 'Athlete not found.' };
    if (['Present', 'Late', 'Excused', 'Absent', ''].indexOf(status) < 0) return { ok: false, message: 'Unknown status.' };
    return locked_(function () {
      var ex = find_('Attendance', function (r) { return r.Date === day && r.StudentID === a.id; });
      if (!status) { if (ex) deleteRow_('Attendance', ex._row); return { ok: true }; }
      var here = status === 'Present' || status === 'Late';
      var time = here ? ((ex && ex.Time) || (day === today_() ? nowTime_() : '')) : '';
      var rec = { Date: day, StudentID: a.id, Name: a.name, Status: status, Time: time, Method: 'Coach',
                  Note: note == null ? ((ex && ex.Note) || '') : String(note).slice(0, 200), DeviceID: (ex && ex.DeviceID) || '', UpdatedAt: stamp_() };
      if (ex) update_('Attendance', ex._row, rec); else append_('Attendance', rec);
      return { ok: true };
    });
  });
}

function coachWeight(pin, date, studentId, kind, value) {
  return coach_(pin, function () {
    var a = athlete_(studentId, true);
    if (!a) return { ok: false, message: 'Athlete not found.' };
    return saveWeight_(normDate_(date) || today_(), a, kind, value, 'Coach');
  });
}

function coachSetConfig(pin, key, value) {
  return coach_(pin, function () {
    if (EDITABLE_KEYS.indexOf(key) < 0) return { ok: false, message: 'That setting is changed in the Config tab of the Sheet.' };
    value = String(value == null ? '' : value).trim();
    if (/^(EARLY_START|LATE_START)$/.test(key) && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(value)) return { ok: false, message: 'Use a time like 16:00.' };
    if (/_MIN$/.test(key) && !/^\d{1,3}$/.test(value)) return { ok: false, message: 'Use a number of minutes.' };
    if (key === 'PRESENCE_CHECK' && ['Location', 'LocationOnly', 'Code', 'Off'].indexOf(value) < 0) return { ok: false, message: 'Unknown setting.' };
    return locked_(function () { setCfg_(key, value); return { ok: true }; });
  });
}

/** Sets the school check-in point to where the coach's phone is. */
function coachSetSchool(pin, lat, lng) {
  return coach_(pin, function () {
    lat = num_(lat); lng = num_(lng);
    if (!okLatLng_(lat, lng)) return { ok: false, message: 'Could not read a location from this phone.' };
    return locked_(function () { setCfg_('SCHOOL_LAT', lat.toFixed(6)); setCfg_('SCHOOL_LNG', lng.toFixed(6)); return { ok: true }; });
  });
}

function setCfg_(key, value) {
  var row = find_('Config', function (r) { return r.Key === key; });
  if (row) update_('Config', row._row, { Value: value }); else append_('Config', { Key: key, Value: value });
  __memo = {};
}

/* ---------- practice schedule ---------- */

/** The week (Mon-Sun) starting at `monday`: each day's practice, where it came from, and the slot presets. */
function coachSchedule(pin, monday) {
  return coach_(pin, function () {
    var m = normDate_(monday) || weekStart_(today_());
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays_(m, i), pr = practiceFor_(d);
      days.push({ date: d, dow: dowName_(d), start: pr ? pr.start : '', end: pr ? pr.end : '', note: pr ? pr.note : '', source: pr ? pr.source : 'off', slot: pr ? slotOf_(pr.start) : 'off' });
    }
    return { ok: true, monday: m, today: today_(), days: days, early: cfg_('EARLY_START'), late: cfg_('LATE_START'), length: Number(cfg_('PRACTICE_LENGTH_MIN')) || 120 };
  });
}

/**
 * Sets one day. slot: 'early' | 'late' | 'off' | 'custom' (with start) | 'default' (remove the row, back to the weekly rule).
 */
function coachSetDay(pin, date, slot, start, note) {
  return coach_(pin, function () {
    var d = normDate_(date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, message: 'Pick a date.' };
    var st = slot === 'early' ? cfg_('EARLY_START') : slot === 'late' ? cfg_('LATE_START') : slot === 'custom' ? String(start || '').trim() : '';
    if (slot === 'custom' && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(st)) return { ok: false, message: 'Use a time like 17:30.' };
    if (['early', 'late', 'off', 'custom', 'default'].indexOf(slot) < 0) return { ok: false, message: 'Bad request.' };
    return locked_(function () {
      var ex = find_('Schedule', function (r) { return r.Date === d; });
      if (slot === 'default') { if (ex) deleteRow_('Schedule', ex._row); return { ok: true }; }
      var rec = { Date: d, Start: slot === 'off' ? 'OFF' : normTime_(st), End: slot === 'off' ? '' : addMin_(normTime_(st), Number(cfg_('PRACTICE_LENGTH_MIN')) || 120), Note: String(note || '').slice(0, 80) };
      if (ex) update_('Schedule', ex._row, rec); else append_('Schedule', rec);
      return { ok: true };
    });
  });
}

/** Fills Mon-Fri of `weeks` weeks from `monday`, alternating slots starting with `firstSlot`. Days already set by hand are kept. */
function coachFillWeeks(pin, monday, firstSlot, weeks) {
  return coach_(pin, function () {
    var m = normDate_(monday); weeks = Math.min(12, Math.max(1, Number(weeks) || 4));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m) || ['early', 'late'].indexOf(firstSlot) < 0) return { ok: false, message: 'Bad request.' };
    return locked_(function () {
      var n = 0;
      for (var w = 0; w < weeks; w++) {
        var slot = (w % 2 === 0) === (firstSlot === 'early') ? 'early' : 'late';
        for (var i = 0; i < 5; i++) {
          var d = addDays_(m, w * 7 + i);
          if (find_('Schedule', function (r) { return r.Date === d; })) continue;
          var st = cfg_(slot === 'early' ? 'EARLY_START' : 'LATE_START');
          append_('Schedule', { Date: d, Start: st, End: addMin_(st, Number(cfg_('PRACTICE_LENGTH_MIN')) || 120), Note: slot === 'early' ? 'Early week' : 'Late week' });
          n++;
        }
      }
      return { ok: true, added: n };
    });
  });
}

/** a = {id, first, last, grade, role}. role 'Manager' = manager or student assistant: travel only, not on the daily list. */
function coachAddAthlete(pin, a) {
  return coach_(pin, function () {
    var id = String((a && a.id) || '').trim(), first = String((a && a.first) || '').trim(), last = String((a && a.last) || '').trim();
    var staff = /manager/i.test(String((a && a.role) || ''));
    if (!/^\d{3,10}$/.test(id)) return { ok: false, message: 'Student ID should be numbers only.' };
    if (!first || !last) return { ok: false, message: 'Enter first and last name.' };
    return locked_(function () {
      ensureCols_('Athletes');
      var ex = find_('Athletes', function (r) { return r.StudentID === id; });
      if (ex) { update_('Athletes', ex._row, { Active: 'Y' }); __memo = {}; return { ok: true, id: id, existing: true, message: ex.FirstName + ' ' + ex.LastName + ' was already on the list and is now active.' }; }
      append_('Athletes', { StudentID: id, FirstName: first, LastName: last, Grade: String((a && a.grade) || ''), Eligible: '', Injured: '', Active: 'Y', Role: staff ? 'Manager' : '' });
      __memo = {};
      return { ok: true, id: id };
    });
  });
}

function coachSetActive(pin, studentId, active) {
  return coach_(pin, function () {
    return locked_(function () {
      var ex = find_('Athletes', function (r) { return r.StudentID === String(studentId); });
      if (!ex) return { ok: false, message: 'Athlete not found.' };
      update_('Athletes', ex._row, { Active: active ? 'Y' : 'N' });
      __memo = {};
      return { ok: true };
    });
  });
}

function coachRoster(pin) {
  return coach_(pin, function () {
    return { ok: true, athletes: roster_(false).map(function (a) { return { id: a.id, name: a.last + ', ' + a.first, grade: a.grade, active: a.active, cleared: a.cleared }; }) };
  });
}

/* ---------- reports ---------- */

function coachReport(pin, from, to) {
  return coach_(pin, function () { return report_(normDate_(from), normDate_(to)); });
}

function report_(from, to) {
  var dates = {}, map = {};
  read_('Attendance').rows.forEach(function (r) {
    if (r.Date < from || r.Date > to) return;
    if (r.Status === 'Present' || r.Status === 'Late') dates[r.Date] = true;   // a practice "happened" if anyone was there
    map[r.StudentID + '|' + r.Date] = r.Status;
  });
  var days = Object.keys(dates).sort();
  var xs = {}, held = 0;   // optional sessions: counted on their own, never for or against the percentage
  read_('SessionLog').rows.forEach(function (l) { if (l.Date >= from && l.Date <= to) xs[l.StudentID] = (xs[l.StudentID] || 0) + 1; });
  read_('Sessions').rows.forEach(function (x) { if (x.Date >= from && x.Date <= to) held++; });
  var rows = wrestlers_().map(function (a) {
    var c = { P: 0, L: 0, E: 0, A: 0 }, marks = [];
    days.forEach(function (d) {
      var s = map[a.id + '|' + d] || 'Absent';
      var k = s === 'Present' ? 'P' : s === 'Late' ? 'L' : s === 'Excused' ? 'E' : 'A';
      c[k]++; marks.push(k);
    });
    var counted = days.length - c.E;
    return { id: a.id, name: a.last + ', ' + a.first, grade: a.grade, P: c.P, L: c.L, E: c.E, A: c.A, x: xs[a.id] || 0,
             pct: counted > 0 ? Math.round(100 * (c.P + c.L) / counted) : null, marks: marks.join('') };
  });
  return { ok: true, from: from, to: to, days: days, rows: rows, sessions: held };
}

function coachAthlete(pin, studentId) {
  return coach_(pin, function () {
    var a = athlete_(studentId, true);
    if (!a) return { ok: false, message: 'Athlete not found.' };
    var rep = report_('0000-00-00', '9999-99-99');
    var mine = rep.rows.filter(function (r) { return r.id === a.id; })[0];
    var info = {};
    read_('Attendance').rows.forEach(function (r) { if (r.StudentID === a.id) info[r.Date] = r; });
    var days = rep.days.map(function (d, i) {
      var r = info[d] || {};
      return { date: d, mark: mine ? mine.marks.charAt(i) : 'A', time: r.Time || '', note: r.Note || '' };
    });
    var weights = read_('Weights').rows.filter(function (r) { return r.StudentID === a.id; })
      .map(function (r) { return { date: r.Date, pre: r.PreWeight, post: r.PostWeight, chg: r.ChangeLb, pct: r.ChangePct }; })
      .sort(function (x, y) { return x.date < y.date ? 1 : -1; });
    var extras = read_('SessionLog').rows.filter(function (l) { return l.StudentID === a.id; })
      .map(function (l) { return { date: l.Date, name: l.Session, time: l.Time }; })
      .sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
    return { ok: true, id: a.id, name: a.first + ' ' + a.last, grade: a.grade, cleared: a.cleared, active: a.active, today: today_(), days: days, weights: weights, extras: extras,
             flagPct: Number(cfg_('WEIGHT_LOSS_FLAG_PCT')) || 3 };
  });
}

/** Writes a printable grid (athlete x practice day) to a "Report" tab in the Sheet. */
function coachExport(pin, from, to) {
  return coach_(pin, function () {
    var rep = report_(normDate_(from), normDate_(to));
    var ss = ss_(), sh = ss.getSheetByName('Report') || ss.insertSheet('Report');
    sh.clearContents();
    var head = ['Athlete', 'Grade', 'Present', 'Late', 'Excused', 'Absent', 'Attendance %', 'Optional sessions'].concat(rep.days.map(function (d) { return d.slice(5); }));
    var out = [head];
    rep.rows.forEach(function (r) {
      out.push([r.name, r.grade, r.P, r.L, r.E, r.A, r.pct == null ? '' : r.pct + '%', r.x].concat(r.marks.split('')));
    });
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    sh.getRange(1, 1, out.length, head.length).setValues(out.map(function (row) { return row.map(String); }));
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    return { ok: true, url: ss.getUrl(), rows: rep.rows.length, days: rep.days.length };
  });
}

/* ---------- optional sessions (weight room, Saturday recovery): tracked, never counted for or against attendance ---------- */

/** Starts a session athletes can check into right now. For a past date it makes a closed session to fill in by hand. */
function coachSessionStart(pin, name, minutes, date) {
  return coach_(pin, function () {
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) return { ok: false, message: 'Give the session a name, like "Weight room".' };
    var day = normDate_(date) || today_(), live = day === today_();
    if (day > today_()) return { ok: false, message: 'A session is started on the day it happens.' };
    var mins = Math.min(360, Math.max(15, Number(minutes) || 60));
    return locked_(function () {
      var cur = live && openSession_();
      if (cur) return { ok: false, error: 'OPEN', message: cur.Name + ' is still open. Close it first.' };
      var id = 'S' + stamp_().replace(/\D/g, '').slice(2, 14);
      append_('Sessions', { SessionID: id, Date: day, Name: name, Start: live ? nowTime_() : '', End: live ? mm_(Math.min(1439, nowMins_() + mins)) : '', Created: stamp_() });
      return { ok: true, id: id };
    });
  });
}

function coachSessionClose(pin, id) {
  return coach_(pin, function () {
    return locked_(function () {
      var x = find_('Sessions', function (r) { return r.SessionID === id; });
      if (!x) return { ok: false, message: 'Session not found.' };
      if (sessionOpen_(x)) update_('Sessions', x._row, { End: mm_(Math.max(0, nowMins_() - 1)) });
      return { ok: true };
    });
  });
}

function coachSessionDelete(pin, id) {
  return coach_(pin, function () {
    return locked_(function () {
      var x = find_('Sessions', function (r) { return r.SessionID === id; });
      if (x) deleteRow_('Sessions', x._row);
      read_('SessionLog').rows.filter(function (l) { return l.SessionID === id; }).map(function (l) { return l._row; })
        .sort(function (a, b) { return b - a; }).forEach(function (r) { deleteRow_('SessionLog', r); });
      return { ok: true };
    });
  });
}

/** One session with every wrestler and whether they were in it. */
function coachSession(pin, id) {
  return coach_(pin, function () {
    var x = find_('Sessions', function (r) { return r.SessionID === id; });
    if (!x) return { ok: false, message: 'Session not found.' };
    var logs = read_('SessionLog').rows.filter(function (l) { return l.SessionID === id; }), by = {};
    logs.forEach(function (l) { by[l.StudentID] = l; });
    return { ok: true, session: sessionInfo_(x, logs), today: today_(), athletes: wrestlers_().map(function (a) {
      var l = by[a.id];
      return { id: a.id, name: a.last + ', ' + a.first, grade: a.grade, 'in': !!l, time: l ? l.Time : '', method: l ? l.Method : '' };
    }) };
  });
}

/** Coach adds (on = true) or removes one athlete by hand. */
function coachSessionMark(pin, id, studentId, on) {
  return coach_(pin, function () {
    var a = athlete_(studentId, true);
    if (!a) return { ok: false, message: 'Athlete not found.' };
    return locked_(function () {
      var x = find_('Sessions', function (r) { return r.SessionID === id; });
      if (!x) return { ok: false, message: 'Session not found.' };
      var l = find_('SessionLog', function (r) { return r.SessionID === id && r.StudentID === a.id; });
      if (on && !l) append_('SessionLog', { SessionID: id, Date: x.Date, StudentID: a.id, Name: a.name, Session: x.Name, Time: x.Date === today_() ? nowTime_() : '', Method: 'Coach', DeviceID: '' });
      if (!on && l) deleteRow_('SessionLog', l._row);
      return { ok: true };
    });
  });
}

function sessionsOn_(day) { return read_('Sessions').rows.filter(function (x) { return x.Date === day; }); }
function sessionOpen_(x) {
  if (x.Date !== today_() || !x.Start || !x.End) return false;
  var m = nowMins_();
  return m >= hm_(normTime_(x.Start), 0) && m <= hm_(normTime_(x.End), -1);
}
function openSession_() { return sessionsOn_(today_()).filter(sessionOpen_)[0] || null; }
function sessionInfo_(x, logs) {
  var n = (logs || read_('SessionLog').rows).filter(function (l) { return l.SessionID === x.SessionID; }).length;
  return { id: x.SessionID, date: x.Date, name: x.Name, start: x.Start ? normTime_(x.Start) : '', end: x.End ? normTime_(x.End) : '', open: sessionOpen_(x), count: n };
}

/* ---------- trips / bus ---------- */

function coachTrips(pin) {
  return coach_(pin, function () {
    var logs = read_('TripLog').rows;
    var list = read_('Trips').rows.map(function (t) {
      var ids = tripRoster_(t);
      var leg = t.Leg === 'Return' ? 'Return' : 'Depart';
      var n = logs.filter(function (l) { return l.TripID === t.TripID && l.Leg === leg && (l.Status === 'On' || l.Status === 'Released'); }).length;
      return { id: t.TripID, date: t.Date, name: t.Name, leg: t.Leg, total: ids.length, accounted: n,
               emailed: !t.EmailedAt ? '' : (t.EmailedKey === travelKey_(t) ? 'yes' : 'changed') };
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return { ok: true, today: today_(), trips: list };
  });
}

/** t = {id, name, date, roster: [ids], levels: {id: 'V'|'JV'|'O'}, excuse: 'Excused 12/1 for classes 5-7'} */
function coachTripSave(pin, t) {
  return coach_(pin, function () {
    var name = String((t && t.name) || '').trim(), date = normDate_(t && t.date);
    var roster = ((t && t.roster) || []).map(function (x) { return String(x).replace(/\D/g, ''); }).filter(String);
    if (!name) return { ok: false, message: 'Give the trip a name, like "Meet at Agua Fria".' };
    if (!date) return { ok: false, message: 'Pick the trip date.' };
    if (!roster.length) return { ok: false, message: 'Pick at least one person for the trip.' };
    var lv = (t && t.levels) || {}, staff = {};
    roster_(false).forEach(function (a) { if (a.staff) staff[a.id] = true; });
    var levels = roster.map(function (id) { var v = staff[id] ? 'O' : String(lv[id] || ''); return id + ':' + (/^(V|JV|O)$/.test(v) ? v : 'V'); }).join(',');
    var excuse = String((t && t.excuse) || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '').slice(0, 120);
    return locked_(function () {
      ensureCols_('Trips');
      var ex = t.id && find_('Trips', function (r) { return r.TripID === t.id; });
      if (ex) { update_('Trips', ex._row, { Name: name, Date: date, Roster: roster.join(','), Levels: levels, Excuse: excuse }); return { ok: true, id: ex.TripID }; }
      var id = 'T' + stamp_().replace(/\D/g, '').slice(2, 14);
      append_('Trips', { TripID: id, Date: date, Name: name, Leg: 'Depart', Roster: roster.join(','), Created: stamp_(), Levels: levels, Excuse: excuse });
      return { ok: true, id: id };
    });
  });
}

function coachTrip(pin, tripId) {
  return coach_(pin, function () {
    var t = find_('Trips', function (r) { return r.TripID === tripId; });
    if (!t) return { ok: false, message: 'Trip not found.' };
    var by = {}; roster_(false).forEach(function (a) { by[a.id] = a; });
    var lv = tripLevels_(t);
    var logs = read_('TripLog').rows.filter(function (l) { return l.TripID === tripId; });
    var cell = function (id, leg) {
      var l = logs.filter(function (x) { return x.StudentID === id && x.Leg === leg; })[0];
      return l ? { status: l.Status, time: l.Time, self: /^Self/.test(l.Method), code: /^Self/.test(l.Method) && l.Note === 'code', note: l.Note } : { status: '' };
    };
    var riders = tripRoster_(t).map(function (id) {
      var a = by[id];
      return { id: id, name: a ? a.last + ', ' + a.first : 'ID ' + id, level: lv[id] || '', dep: cell(id, 'Depart'), ret: cell(id, 'Return') };
    }).sort(function (x, y) { return x.name < y.name ? -1 : 1; });
    var hc = {};
    logs.forEach(function (l) { if (l.Status === 'HeadCount') hc[l.Leg] = { n: l.Note, time: l.Time }; });
    return { ok: true, travel: travelInfo_(t),
             trip: { id: t.TripID, date: t.Date, name: t.Name, leg: t.Leg, roster: tripRoster_(t), levels: lv, excuse: t.Excuse || '',
                               depSet: !!tripAnchor_(t, 'Depart'), depOwn: isFinite(num_(t.DepLat)), retSet: !!tripAnchor_(t, 'Return') },
             riders: riders, headcount: hc, presence: presenceMode_(), code: roomCode_(today_()) };
  });
}

/** status: On | Released | '' (clear) */
function coachTripMark(pin, tripId, studentId, leg, status, note) {
  return coach_(pin, function () {
    if (['Depart', 'Return'].indexOf(leg) < 0 || ['On', 'Released', ''].indexOf(status) < 0) return { ok: false, message: 'Bad request.' };
    return locked_(function () {
      var a = athlete_(studentId, true), sid = String(studentId);
      var ex = find_('TripLog', function (r) { return r.TripID === tripId && r.Leg === leg && r.StudentID === sid; });
      clearHeadcount_(tripId, leg);     // roster changed: the count must be confirmed again
      ex = find_('TripLog', function (r) { return r.TripID === tripId && r.Leg === leg && r.StudentID === sid; });
      if (!status) { if (ex) deleteRow_('TripLog', ex._row); return { ok: true }; }
      var rec = { TripID: tripId, StudentID: sid, Name: a ? a.name : sid, Leg: leg, Status: status, Time: nowTime_(), Method: 'Coach', Note: String(note || '').slice(0, 200) };
      if (ex) update_('TripLog', ex._row, rec); else append_('TripLog', rec);
      return { ok: true };
    });
  });
}

function coachTripLeg(pin, tripId, leg) {
  return coach_(pin, function () {
    if (['Depart', 'Return', 'Done'].indexOf(leg) < 0) return { ok: false, message: 'Bad request.' };
    return locked_(function () {
      var t = find_('Trips', function (r) { return r.TripID === tripId; });
      if (!t) return { ok: false, message: 'Trip not found.' };
      update_('Trips', t._row, { Leg: leg });
      return { ok: true };
    });
  });
}

/** Sets where the bus is for one leg (the coach's phone location). Athletes must be near it to board by scanning. */
function coachTripAnchor(pin, tripId, leg, lat, lng) {
  return coach_(pin, function () {
    if (['Depart', 'Return'].indexOf(leg) < 0) return { ok: false, message: 'Bad request.' };
    lat = num_(lat); lng = num_(lng);
    if (!okLatLng_(lat, lng)) return { ok: false, message: 'Could not read a location from this phone.' };
    return locked_(function () {
      ensureCols_('Trips');
      var t = find_('Trips', function (r) { return r.TripID === tripId; });
      if (!t) return { ok: false, message: 'Trip not found.' };
      update_('Trips', t._row, leg === 'Return' ? { RetLat: lat.toFixed(6), RetLng: lng.toFixed(6) } : { DepLat: lat.toFixed(6), DepLng: lng.toFixed(6) });
      return { ok: true };
    });
  });
}

function coachTripHeadcount(pin, tripId, leg, n) {
  return coach_(pin, function () {
    return locked_(function () {
      clearHeadcount_(tripId, leg);
      append_('TripLog', { TripID: tripId, StudentID: '', Name: 'HEAD COUNT CONFIRMED', Leg: leg, Status: 'HeadCount', Time: nowTime_(), Method: 'Coach', Note: String(n) });
      return { ok: true };
    });
  });
}

function coachTripDelete(pin, tripId) {
  return coach_(pin, function () {
    return locked_(function () {
      var t = find_('Trips', function (r) { return r.TripID === tripId; });
      if (t) deleteRow_('Trips', t._row);
      var rows = read_('TripLog').rows.filter(function (l) { return l.TripID === tripId; }).map(function (l) { return l._row; }).sort(function (a, b) { return b - a; });
      rows.forEach(function (r) { deleteRow_('TripLog', r); });
      return { ok: true };
    });
  });
}

/* ---------- travel roster: who is going, the PDF, and the email to the office ---------- */

/** Everyone who can be put on a trip, plus the most recent other trip (for "same as last trip"). */
function coachTravelPeople(pin, exceptTripId) {
  return coach_(pin, function () {
    var trips = read_('Trips').rows.filter(function (t) { return t.TripID !== exceptTripId; })
      .sort(function (a, b) { return String(a.Created) < String(b.Created) ? 1 : -1; });
    var people = roster_(true).map(function (a) { return { id: a.id, name: a.last + ', ' + a.first, grade: a.grade, cleared: a.cleared, staff: !!a.staff }; });
    var p = trips[0];
    return { ok: true, people: people, prev: p ? { name: p.Name, date: p.Date, roster: tripRoster_(p), levels: tripLevels_(p) } : null };
  });
}

/** The real PDF, base64, so the coach can look at it or print it. */
function coachTravelPdf(pin, tripId) {
  return coach_(pin, function () {
    var t = find_('Trips', function (r) { return r.TripID === tripId; });
    if (!t) return { ok: false, message: 'Trip not found.' };
    var chk = travelCheck_(t); if (!chk.ok) return chk;
    var pdf = travelPdf_(t);
    return { ok: true, filename: pdf.getName(), b64: Utilities.base64Encode(pdf.getBytes()), count: tripRoster_(t).length };
  });
}

/** Emails the roster PDF to TRAVEL_EMAIL_TO. Sent from the Google account that owns this Sheet. */
function coachTravelEmail(pin, tripId) {
  return coach_(pin, function () {
    var t = find_('Trips', function (r) { return r.TripID === tripId; });
    if (!t) return { ok: false, message: 'Trip not found.' };
    var chk = travelCheck_(t); if (!chk.ok) return chk;
    var to = emails_(cfg_('TRAVEL_EMAIL_TO')), cc = emails_(cfg_('TRAVEL_EMAIL_CC'));
    if (!to) return { ok: false, error: 'NO_TO', message: 'No office email address is set. Put it in the Config tab of the Sheet, in the TRAVEL_EMAIL_TO row.' };
    var key = travelKey_(t);
    if (t.EmailedAt && t.EmailedKey === key && stampAge_(t.EmailedAt) < 120) return { ok: true, already: true, to: t.EmailedTo, at: t.EmailedAt };   // double tap
    var title = cfg_('TRAVEL_TITLE'), n = tripRoster_(t).length;
    var body = [cfg_('TRAVEL_EMAIL_GREETING'), '',
      'Attached is the ' + title + ' travel roster for ' + t.Name + ' on ' + niceDate_(t.Date) + '.', '',
      t.Excuse + '.', n + (n === 1 ? ' student is' : ' students are') + ' listed.', '',
      'Thank you,', cfg_('TRAVEL_EMAIL_SIGNOFF')].join('\n');
    try {
      var msg = { to: to, subject: title + ' travel roster - ' + t.Excuse, body: body, name: cfg_('TEAM_NAME'), attachments: [travelPdf_(t)] };
      if (cc) { msg.cc = cc; msg.replyTo = cc.split(',')[0]; }
      MailApp.sendEmail(msg);
    } catch (err) {
      var m = String((err && err.message) || err);
      return { ok: false, error: 'MAIL', message: 'The email was NOT sent. ' + (/authori|permission/i.test(m)
        ? 'Google has not been given permission to send email yet. In the Sheet open Extensions > Apps Script, run "setup" once and approve, then deploy a new version.' : m) };
    }
    var at = stamp_();
    locked_(function () {
      ensureCols_('Trips');
      var cur = find_('Trips', function (r) { return r.TripID === tripId; });
      if (cur) update_('Trips', cur._row, { EmailedAt: at, EmailedTo: to, EmailedKey: key });
    });
    return { ok: true, to: to, at: at };
  });
}

function travelCheck_(t) {
  if (!tripRoster_(t).length) return { ok: false, message: 'No one is on this trip yet.' };
  if (!t.Excuse || /classes?\s*$/i.test(t.Excuse)) return { ok: false, error: 'EXCUSE', message: 'Finish the excused line first: say which classes.' };
  return { ok: true };
}

function tripLevels_(t) {
  var m = {};
  String(t.Levels || '').split(',').forEach(function (x) { var p = x.split(':'); if (p[0] && p[1]) m[p[0].trim()] = p[1].trim(); });
  return m;
}

/** "First M. Last", the way the attendance office lists students. */
function travelName_(a) {
  var p = String(a.first || '').split(/\s+/).filter(String);
  return ((p[0] || '') + (p[1] ? ' ' + p[1].charAt(0).toUpperCase() + '.' : '') + ' ' + a.last).trim();
}

/** The roster as it prints: one row per person, sorted by last name. */
function travelRows_(t) {
  var by = {}; roster_(false).forEach(function (a) { by[a.id] = a; });
  var lv = tripLevels_(t);
  return tripRoster_(t).map(function (id) {
    var a = by[id];
    return { id: id, name: a ? travelName_(a) : 'ID ' + id, key: a ? (a.last + ' ' + a.first).toLowerCase() : '~' + id, level: lv[id] || '' };
  }).sort(function (x, y) { return x.key < y.key ? -1 : x.key > y.key ? 1 : 0; });
}

/** Changes whenever the list, the excused line or the date changes, so the app can say "changed since it was emailed". */
function travelKey_(t) { return tripRoster_(t).slice().sort().join(',') + '|' + String(t.Excuse || '') + '|' + t.Date; }

function travelInfo_(t) {
  var rows = travelRows_(t), c = { V: 0, JV: 0, O: 0 };
  rows.forEach(function (r) { if (c[r.level] != null) c[r.level]++; });
  return { title: cfg_('TRAVEL_TITLE'), excuse: t.Excuse || '', rows: rows.map(function (r) { return { id: r.id, name: r.name }; }), counts: c,
           to: emails_(cfg_('TRAVEL_EMAIL_TO')), cc: emails_(cfg_('TRAVEL_EMAIL_CC')),
           emailedAt: t.EmailedAt || '', emailedTo: t.EmailedTo || '', changed: !!t.EmailedAt && t.EmailedKey !== travelKey_(t) };
}

/** Plain table markup with inline styles only: this is what Google turns into the PDF. */
function travelHtml_(t) {
  var font = 'font-family:Arial,Helvetica,sans-serif;';
  var band = font + 'background-color:#0d0d0d;color:#e8261c;font-size:14pt;font-weight:bold;text-align:center;padding:30px 8px 8px 8px;border:1px solid #0d0d0d;';
  var cell = font + 'font-size:13pt;color:#000000;padding:5px 7px;border:1px solid #333333;';
  var head = cell + 'background-color:#ff0000;';
  var h = '<html><head><meta charset="utf-8"><title>' + esc_(cfg_('TRAVEL_TITLE')) + '</title></head><body style="margin:0;padding:0;">' +
    '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;">' +
    '<tr><td colspan="2" bgcolor="#0d0d0d" style="' + band + '">' + esc_(cfg_('TRAVEL_TITLE')) + '</td></tr>' +
    '<tr><td colspan="2" bgcolor="#0d0d0d" style="' + band + '">' + esc_(t.Excuse) + '</td></tr>' +
    '<tr><td bgcolor="#ff0000" width="15%" style="' + head + '">ID</td><td bgcolor="#ff0000" style="' + head + '">Name</td></tr>';
  travelRows_(t).forEach(function (r) {
    h += '<tr><td style="' + cell + '">' + esc_(r.id) + '</td><td style="' + cell + '">' + esc_(r.name) + '</td></tr>';
  });
  return h + '</table></body></html>';
}

function travelPdf_(t) {
  return Utilities.newBlob(travelHtml_(t), 'text/html', 'roster.html').getAs('application/pdf').setName('WP Wrestling Travel Roster ' + t.Date + '.pdf');
}

function esc_(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function emails_(v) {
  return String(v || '').split(/[,;\s]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); }).join(',');
}
function niceDate_(ymd) { var p = String(ymd).split('-'); return dowName_(ymd) + ', ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(p[1]) - 1] + ' ' + Number(p[2]); }
/** Seconds since a stamp_() value. */
function stampAge_(st) {
  var f = function (x) { var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(String(x)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 : NaN; };
  var d = f(stamp_()) - f(st);
  return isFinite(d) ? d : 1e9;
}

function clearHeadcount_(tripId, leg) {
  var h = find_('TripLog', function (r) { return r.TripID === tripId && r.Leg === leg && r.Status === 'HeadCount'; });
  if (h) deleteRow_('TripLog', h._row);
}

function tripRoster_(t) { return String(t.Roster || '').split(',').map(function (s) { return s.trim(); }).filter(String); }

/** Today's trip that is boarding and has this athlete on it. */
function tripForAthlete_(id) {
  var day = today_();
  return read_('Trips').rows.filter(function (t) {
    return t.Date === day && (t.Leg === 'Depart' || t.Leg === 'Return') && tripRoster_(t).indexOf(id) >= 0;
  })[0] || null;
}

/* ====================================================================== */
/*  FUTURE FRESHMAN NIGHT SIGN-UP (public page: no PIN, can only add a row) */
/* ====================================================================== */

var SIGNUP_HEAD = ['Signed Up', 'Student Name', 'Student Email', 'Parent Name', 'Parent Email'];

/**
 * d = {student, studentEmail, parent, parentEmail} from the sign-up page.
 * Saves one row in the sign-up Sheet. It never sends anyone's information back.
 */
function signupFreshman(d) {
  return safe_(function () {
    d = d || {};
    if (d.website) return { ok: true };   // hidden box that only a spam robot fills in: say thanks, save nothing
    if (isNo_(cfg_('SIGNUP_OPEN'))) return { ok: false, error: 'CLOSED', message: 'Sign-up is closed. Please see a West Point wrestling coach.' };
    var student = signupText_(d.student, 60), parent = signupText_(d.parent, 60);
    var sEmail = signupText_(d.studentEmail, 100).toLowerCase(), pEmail = signupText_(d.parentEmail, 100).toLowerCase();
    var bad = function (field, message) { return { ok: false, error: 'FIELD', field: field, message: message }; };
    if (student.length < 2) return bad('student', 'Enter the student\'s first and last name.');
    if (sEmail && !isEmail_(sEmail)) return bad('studentEmail', 'Check the student email. It should look like name@example.com. You can also leave it blank.');
    if (parent.length < 2) return bad('parent', 'Enter a parent or guardian name.');
    if (!pEmail) return bad('parentEmail', 'Enter a parent or guardian email so a coach can reach you.');
    if (!isEmail_(pEmail)) return bad('parentEmail', 'Check the parent email. It should look like name@example.com.');
    return locked_(function () {
      var sh = signupSheet_();
      var vals = sh.getDataRange().getDisplayValues();
      var head = vals[0].map(function (h) { return String(h).trim(); });
      SIGNUP_HEAD.forEach(function (h) {            // a renamed or deleted column is put back at the end, never guessed at
        if (head.indexOf(h) < 0) { head.push(h); sh.getRange(1, head.length, 1, 1).setValues([[h]]); }
      });
      if (vals.length > 3000) return { ok: false, error: 'FULL', message: 'The sign-up list is full. Please see a West Point wrestling coach.' };
      var cS = head.indexOf('Student Name'), cSE = head.indexOf('Student Email'), cP = head.indexOf('Parent Name'), cPE = head.indexOf('Parent Email');
      var cell = function (row, c) { return String(row[c] == null ? '' : row[c]).trim(); };
      for (var i = 1; i < vals.length; i++) {       // same student and parent email again: correct the row, do not add a second one
        if (cell(vals[i], cS).toLowerCase() !== student.toLowerCase() || cell(vals[i], cPE).toLowerCase() !== pEmail) continue;
        sh.getRange(i + 1, cS + 1, 1, 1).setValues([[student]]);
        sh.getRange(i + 1, cP + 1, 1, 1).setValues([[parent]]);
        if (sEmail) sh.getRange(i + 1, cSE + 1, 1, 1).setValues([[sEmail]]);
        return { ok: true, already: true };
      }
      var rec = { 'Signed Up': stamp_(), 'Student Name': student, 'Student Email': sEmail, 'Parent Name': parent, 'Parent Email': pEmail };
      sh.appendRow(head.map(function (h) { return rec[h] == null ? '' : rec[h]; }));
      return { ok: true };
    });
  });
}

/** The Sheet named in Config (SIGNUP_SHEET_ID). If it cannot be opened, a FreshmanNight tab in this Sheet, so a sign-up is never lost. */
function signupSheet_() {
  var sh = null, id = cfg_('SIGNUP_SHEET_ID');
  if (id) {
    try { var book = SpreadsheetApp.openById(id); sh = book.getSheetByName('Sign-Ups') || book.getSheets()[0]; } catch (err) { sh = null; }
  }
  if (!sh) sh = ss_().getSheetByName('FreshmanNight') || ss_().insertSheet('FreshmanNight');
  if (sh.getLastRow() === 0) {
    sh.appendRow(SIGNUP_HEAD);
    sh.getRange(1, 1, 1, SIGNUP_HEAD.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** One line of plain text. A leading = + - or @ is dropped so the Sheet can never read a typed value as a formula. */
function signupText_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s=+\-@]+/, '').trim().slice(0, max);
}
function isEmail_(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(v || '')); }

/* ====================================================================== */
/*  SHARED LOGIC                                                          */
/* ====================================================================== */

function saveWeight_(day, a, kind, value, by) {
  if (kind !== 'pre' && kind !== 'post') return { ok: false, message: 'Bad request.' };
  var txt = String(value == null ? '' : value).trim(), num = '';
  if (txt !== '') {
    num = Number(txt);
    if (!isFinite(num) || num < 70 || num > 450) return { ok: false, error: 'RANGE', message: 'Enter a weight in pounds between 70 and 450.' };
    num = Math.round(num * 10) / 10;
  }
  return locked_(function () {
    var ex = find_('Weights', function (r) { return r.Date === day && r.StudentID === a.id; });
    var rec = ex ? { PreWeight: ex.PreWeight, PreTime: ex.PreTime, PostWeight: ex.PostWeight, PostTime: ex.PostTime } : { PreWeight: '', PreTime: '', PostWeight: '', PostTime: '' };
    var t = num === '' ? '' : nowTime_();
    if (kind === 'pre') { rec.PreWeight = num === '' ? '' : String(num); rec.PreTime = t; } else { rec.PostWeight = num === '' ? '' : String(num); rec.PostTime = t; }
    rec.ChangeLb = ''; rec.ChangePct = '';
    if (rec.PreWeight !== '' && rec.PostWeight !== '') {
      var d = Number(rec.PostWeight) - Number(rec.PreWeight);
      rec.ChangeLb = (Math.round(d * 10) / 10).toFixed(1);
      rec.ChangePct = (Math.round(1000 * d / Number(rec.PreWeight)) / 10).toFixed(1);
    }
    rec.Date = day; rec.StudentID = a.id; rec.Name = a.name; rec.EnteredBy = by;
    if (ex) {
      if (rec.PreWeight === '' && rec.PostWeight === '') deleteRow_('Weights', ex._row); else update_('Weights', ex._row, rec);
    } else if (rec.PreWeight !== '' || rec.PostWeight !== '') append_('Weights', rec);
    return { ok: true, pre: rec.PreWeight, post: rec.PostWeight, chg: rec.ChangeLb, pct: rec.ChangePct };
  });
}

/** Most recent weight before `day` for each athlete, used to catch typos. */
function lastWeights_(day) {
  var best = {};
  read_('Weights').rows.forEach(function (r) {
    if (r.Date >= day) return;
    var w = r.PreWeight || r.PostWeight;
    if (w && (!best[r.StudentID] || best[r.StudentID].d < r.Date)) best[r.StudentID] = { d: r.Date, w: w };
  });
  var out = {}; Object.keys(best).forEach(function (k) { out[k] = best[k].w; });
  return out;
}

/** Is self check-in open right now, and would a check-in be late? */
/** Today's practice: a Schedule row for the date wins; otherwise the weekly rule and default slot. null = no practice. */
function practiceFor_(day) {
  var row = find_('Schedule', function (r) { return r.Date === day; });
  if (row) {
    if (/^off$/i.test(row.Start) || !row.Start) return null;
    var st = normTime_(row.Start);
    return { start: st, end: row.End ? normTime_(row.End) : addMin_(st, Number(cfg_('PRACTICE_LENGTH_MIN')) || 120), note: row.Note || '', source: 'set' };
  }
  var days = cfg_('PRACTICE_DAYS').split(',').map(function (x) { return x.trim().slice(0, 3).toLowerCase(); });
  if (days.indexOf(dowName_(day).toLowerCase()) < 0) return null;
  var st2 = cfg_(/late/i.test(cfg_('DEFAULT_SLOT')) ? 'LATE_START' : 'EARLY_START');
  return { start: st2, end: addMin_(st2, Number(cfg_('PRACTICE_LENGTH_MIN')) || 120), note: '', source: 'rule' };
}

/** Is self check-in open right now, and would a check-in be late? */
function window_() {
  var day = today_(), mins = nowMins_(), pr = practiceFor_(day);
  if (!pr) return { open: false, practice: null, reason: 'No practice check-in today. If there is practice, see Coach.' };
  var start = hm_(pr.start, 960);
  var opens = start - (Number(cfg_('OPEN_BEFORE_MIN')) || 0), closes = start + (Number(cfg_('CLOSE_AFTER_MIN')) || 0);
  var late = mins > start + (Number(cfg_('LATE_AFTER_MIN')) || 0);
  if (mins < opens) return { open: false, practice: pr, reason: 'Practice is at ' + pretty_(pr.start) + ' today. Check-in opens at ' + pretty_(mm_(opens)) + '.' };
  if (mins > closes) return { open: false, practice: pr, reason: 'Check-in closed at ' + pretty_(mm_(closes)) + '. See Coach to be marked.' };
  return { open: true, late: late, practice: pr };
}

function slotOf_(start) { return start === cfg_('EARLY_START') ? 'early' : start === cfg_('LATE_START') ? 'late' : 'custom'; }
function mm_(m) { m = ((m % 1440) + 1440) % 1440; return pad_(Math.floor(m / 60)) + ':' + pad_(m % 60); }
function addMin_(hhmm, n) { return mm_(hm_(hhmm, 0) + n); }
function dowName_(ymd) { var p = ymd.split('-'); var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]; }
function addDays_(ymd, n) { var p = ymd.split('-'); var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n)); return d.getUTCFullYear() + '-' + pad_(d.getUTCMonth() + 1) + '-' + pad_(d.getUTCDate()); }
function weekStart_(ymd) { var k = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dowName_(ymd)) + 6) % 7; return addDays_(ymd, -k); }

/* ---------- proof of presence: location first, daily code as backup ---------- */

function presenceMode_() {
  var v = cfg_('PRESENCE_CHECK').replace(/\s/g, '').toLowerCase();
  if (v === 'off' || v === 'anywhere' || v === 'no') return 'off';
  if (v === 'code') return 'code';
  if (v === 'locationonly') return 'loconly';
  return 'loc';
}

function schoolAnchor_() {
  var lat = num_(cfg_('SCHOOL_LAT')), lng = num_(cfg_('SCHOOL_LNG'));
  if (!okLatLng_(lat, lng)) return null;
  return { lat: lat, lng: lng, radius: Number(cfg_('SCHOOL_RADIUS_M')) || 250, name: 'the wrestling room' };
}

/** Where the bus is for a leg. Leaving defaults to the school; the ride home must be set by the coach. */
function tripAnchor_(t, leg) {
  leg = leg || t.Leg;
  var r = Number(cfg_('BUS_RADIUS_M')) || 200;
  if (leg === 'Return') return okLatLng_(num_(t.RetLat), num_(t.RetLng)) ? { lat: num_(t.RetLat), lng: num_(t.RetLng), radius: r, name: 'the bus' } : null;
  if (okLatLng_(num_(t.DepLat), num_(t.DepLng))) return { lat: num_(t.DepLat), lng: num_(t.DepLng), radius: r, name: 'the bus' };
  var s = schoolAnchor_();
  return s ? { lat: s.lat, lng: s.lng, radius: s.radius, name: 'the school' } : null;
}

/**
 * Decides whether a self check-in / self boarding may go ahead.
 * proof = { lat, lng, acc, code } from the athlete's phone (any part may be missing).
 * Coordinates are used for the check and then thrown away; they are never saved.
 */
function presence_(anchor, proof, day) {
  var mode = presenceMode_();
  if (mode === 'off') return { ok: true, by: 'Open' };
  if (typeof proof === 'string') proof = { code: proof };
  proof = proof || {};
  var code = String(proof.code == null ? '' : proof.code).trim();
  var codeOk = code !== '' && code === roomCode_(day);
  if (mode === 'code') {
    return codeOk ? { ok: true, by: 'Code' }
                  : { ok: false, error: 'CODE', message: code ? 'That is not today\'s code. Look at the code Coach is showing.' : 'Enter the 2-digit code from Coach.' };
  }
  var lat = num_(proof.lat), lng = num_(proof.lng), acc = num_(proof.acc), why;
  if (!anchor) why = { error: 'LOC_UNSET', message: 'Coach has not set the location for this yet.' };
  else if (!okLatLng_(lat, lng)) why = { error: 'LOC_NEEDED', message: 'This phone did not share its location.' };
  else if (isFinite(acc) && acc > 1500) why = { error: 'LOC_VAGUE', message: 'This phone could not get a good location fix.' };
  else {
    var d = distM_(lat, lng, anchor.lat, anchor.lng), slack = Math.min(isFinite(acc) && acc > 0 ? acc : 0, 150);
    if (d <= anchor.radius + slack) return { ok: true, by: 'GPS' };
    why = { error: 'LOC_FAR', message: 'This phone looks about ' + far_(d) + ' from ' + anchor.name + '.' };
  }
  if (mode === 'loc') {
    if (codeOk) return { ok: true, by: 'Code' };
    if (code !== '') return { ok: false, error: 'CODE', message: 'That is not today\'s backup code. Ask Coach for it.' };
    why.message += ' Try again, or ask Coach for the backup code.';
  } else {
    why.message += ' Try again, or see Coach to be marked.';
  }
  why.ok = false;
  return why;
}

function distM_(lat1, lng1, lat2, lng2) {
  var R = 6371000, k = Math.PI / 180, dLat = (lat2 - lat1) * k, dLng = (lng2 - lng1) * k;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * k) * Math.cos(lat2 * k) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function far_(m) { return m < 1500 ? (Math.round(m * 1.09361 / 10) * 10) + ' yards' : (m / 1609.34).toFixed(1) + ' miles'; }
function num_(v) { return (v === '' || v == null) ? NaN : Number(v); }
function okLatLng_(lat, lng) { return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0); }

function ensureCols_(name) {
  var head = read_(name).head;
  if (TABS[name].some(function (h) { return head.indexOf(h) < 0; })) { addMissingHeaders_(sheet_(name), TABS[name]); delete __memo['t:' + name]; }
}

function roomCode_(day) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, day + '|' + cfg_('COACH_PIN'));
  return String(10 + (((d[0] & 255) * 256 + (d[1] & 255)) % 90));
}

function roster_(activeOnly) {
  if (!__memo.roster) {
    __memo.roster = read_('Athletes').rows.filter(function (r) { return String(r.StudentID).trim(); }).map(function (r) {
      var first = String(r.FirstName || '').trim(), last = String(r.LastName || '').trim();
      return { id: String(r.StudentID).trim(), first: first, last: last, name: first + ' ' + last, grade: r.Grade || '',
               active: !isNo_(r.Active), injured: isYes_(r.Injured), cleared: !isNo_(r.Eligible) && !isYes_(r.Injured),
               staff: /manager|assistant|staff/i.test(String(r.Role || '')) };
    }).sort(function (a, b) { return (a.last + ' ' + a.first).toLowerCase() < (b.last + ' ' + b.first).toLowerCase() ? -1 : 1; });
  }
  return activeOnly ? __memo.roster.filter(function (a) { return a.active; }) : __memo.roster;
}

/** Active wrestlers: the daily list and the reports. Managers and student assistants are travel-only. */
function wrestlers_() { return roster_(true).filter(function (a) { return !a.staff; }); }

function athlete_(id, includeInactive) {
  id = String(id == null ? '' : id).replace(/\D/g, '');
  if (!id) return null;
  return roster_(!includeInactive).filter(function (a) { return a.id === id; })[0] || null;
}

function coach_(pin, fn) {
  return safe_(function () {
    var real = cfg_('COACH_PIN');
    if (!real || String(pin || '').trim() !== real) { Utilities.sleep(1500); return { ok: false, error: 'PIN', message: 'Wrong coach PIN.' }; }
    return fn();
  });
}

function safe_(fn) {
  __memo = {};
  try { return fn(); }
  catch (err) { return { ok: false, error: 'SERVER', message: 'Something went wrong saving. Try again. (' + (err && err.message) + ')' }; }
}

function locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { __memo = {}; return fn(); } finally { lock.releaseLock(); }
}

/* ====================================================================== */
/*  SHEET ACCESS (text in, text out — never trust Sheets auto-formatting) */
/* ====================================================================== */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh && TABS[name]) {
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    sh.appendRow(TABS[name]);
    sh.setFrozenRows(1);
  }
  if (!sh) throw new Error('Tab "' + name + '" is missing. Run setup.');
  return sh;
}

function read_(name) {
  if (__memo['t:' + name]) return __memo['t:' + name];
  var vals = sheet_(name).getDataRange().getDisplayValues();
  var head = (vals[0] || []).map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    var o = { _row: i + 1 }, any = false;
    for (var c = 0; c < head.length; c++) {
      var v = String(vals[i][c] == null ? '' : vals[i][c]).trim();
      if (head[c] === 'Date') v = normDate_(v);
      if (/Time$/.test(head[c])) v = normTime_(v);
      if (head[c]) o[head[c]] = v;
      if (v) any = true;
    }
    if (any) rows.push(o);
  }
  return (__memo['t:' + name] = { head: head, rows: rows });
}

function find_(name, test) { var r = read_(name).rows; for (var i = 0; i < r.length; i++) if (test(r[i])) return r[i]; return null; }

function append_(name, obj) {
  var head = read_(name).head;
  sheet_(name).appendRow(head.map(function (h) { return obj[h] == null ? '' : String(obj[h]); }));
  delete __memo['t:' + name]; delete __memo.roster;
}

function update_(name, row, obj) {
  var head = read_(name).head, sh = sheet_(name);
  var cur = sh.getRange(row, 1, 1, head.length).getDisplayValues()[0];
  var next = head.map(function (h, i) { return obj[h] == null ? cur[i] : String(obj[h]); });
  sh.getRange(row, 1, 1, head.length).setValues([next]);
  delete __memo['t:' + name]; delete __memo.roster;
}

function deleteRow_(name, row) { sheet_(name).deleteRow(row); delete __memo['t:' + name]; delete __memo.roster; }

function cfg_(key) {
  if (!__memo.cfg) {
    __memo.cfg = {};
    DEFAULTS.forEach(function (d) { __memo.cfg[d[0]] = d[1]; });
    try { read_('Config').rows.forEach(function (r) { if (r.Key) __memo.cfg[r.Key] = r.Value || ''; }); } catch (err) { /* before setup */ }
  }
  return __memo.cfg[key] == null ? '' : String(__memo.cfg[key]);
}

/* ---------- small helpers ---------- */

function now_() { return __now || new Date(); }
function tz_() { return cfg_('TIMEZONE') || 'America/Phoenix'; }
function today_() { return Utilities.formatDate(now_(), tz_(), 'yyyy-MM-dd'); }
function nowTime_() { return Utilities.formatDate(now_(), tz_(), 'HH:mm'); }
function nowMins_() { return hm_(nowTime_(), 0); }
function stamp_() { return Utilities.formatDate(now_(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function hm_(s, dflt) { var m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : dflt; }
function pretty_(s) { var m = hm_(s, 0), h = Math.floor(m / 60), mm = m % 60; return ((h + 11) % 12 + 1) + ':' + (mm < 10 ? '0' : '') + mm + (h < 12 ? ' AM' : ' PM'); }
function isYes_(v) { return /^(y|yes|true|1)$/i.test(String(v || '').trim()); }
function isNo_(v) { return /^(n|no|false|0)$/i.test(String(v || '').trim()); }
function pad_(n) { return (n < 10 ? '0' : '') + n; }

function normDate_(v) {
  v = String(v == null ? '' : v).trim();
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return m[1] + '-' + pad_(Number(m[2])) + '-' + pad_(Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  if (m) return m[3] + '-' + pad_(Number(m[1])) + '-' + pad_(Number(m[2]));
  return v;
}

function normTime_(v) {
  v = String(v == null ? '' : v).trim();
  var m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(v);
  if (!m) return v;
  var h = Number(m[1]);
  if (m[3]) { h = h % 12; if (/p/i.test(m[3])) h += 12; }
  return pad_(h) + ':' + m[2];
}

function appUrl_() { return cfg_('SITE_URL'); }

/** The only functions the website is allowed to call. */
var API_ = {
  athleteState: athleteState, athleteCheckIn: athleteCheckIn, athleteWeight: athleteWeight, athleteBoard: athleteBoard,
  coachLogin: coachLogin, coachDay: coachDay, coachMark: coachMark, coachWeight: coachWeight, coachSetConfig: coachSetConfig,
  coachSetSchool: coachSetSchool, coachTripAnchor: coachTripAnchor, coachSchedule: coachSchedule, coachSetDay: coachSetDay, coachFillWeeks: coachFillWeeks,
  coachAddAthlete: coachAddAthlete, coachSetActive: coachSetActive, coachRoster: coachRoster,
  coachSessionStart: coachSessionStart, coachSessionClose: coachSessionClose, coachSessionDelete: coachSessionDelete, coachSession: coachSession, coachSessionMark: coachSessionMark,
  coachReport: coachReport, coachAthlete: coachAthlete, coachExport: coachExport,
  coachTravelPeople: coachTravelPeople, coachTravelPdf: coachTravelPdf, coachTravelEmail: coachTravelEmail,
  coachTrips: coachTrips, coachTripSave: coachTripSave, coachTrip: coachTrip, coachTripMark: coachTripMark,
  coachTripLeg: coachTripLeg, coachTripHeadcount: coachTripHeadcount, coachTripDelete: coachTripDelete,
  signupFreshman: signupFreshman
};
