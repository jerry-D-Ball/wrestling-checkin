/**
 * WEST POINT WRESTLING - ATTENDANCE, WEIGHTS & BUS CHECK  (data script)
 *
 * This script lives in the attendance Google Sheet. It only saves and reads rows.
 * The screens athletes and coaches see are the website in this repository.
 *
 * FIRST TIME: 1) Run "setup" once (Run button above).
 *             2) Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 *             3) Copy the web app URL (ends in /exec) and give it to Claude for config.js.
 * You should not need to edit this file again.
 */

var TABS = {
  Athletes:   ['StudentID', 'FirstName', 'LastName', 'Grade', 'Eligible', 'Injured', 'Active'],
  Attendance: ['Date', 'StudentID', 'Name', 'Status', 'Time', 'Method', 'Note', 'DeviceID', 'UpdatedAt'],
  Weights:    ['Date', 'StudentID', 'Name', 'PreWeight', 'PreTime', 'PostWeight', 'PostTime', 'ChangeLb', 'ChangePct', 'EnteredBy'],
  Trips:      ['TripID', 'Date', 'Name', 'Leg', 'Roster', 'Created'],
  TripLog:    ['TripID', 'StudentID', 'Name', 'Leg', 'Status', 'Time', 'Method', 'Note'],
  Config:     ['Key', 'Value', 'What it does']
};

var DEFAULTS = [
  ['TEAM_NAME', 'West Point Wrestling', 'Shown at the top of the app and on the QR poster.'],
  ['COACH_PIN', '', 'PIN for the coach screens. Change it any time. Share only with coaches.'],
  ['TIMEZONE', 'America/Phoenix', 'School time zone.'],
  ['PRACTICE_START', '16:00', 'Practice start, 24-hour time (16:00 = 4:00 PM).'],
  ['LATE_AFTER_MIN', '5', 'Minutes after start before a self check-in counts as Late.'],
  ['CHECKIN_OPENS', '15:00', 'Earliest time athletes can check themselves in.'],
  ['CHECKIN_CLOSES', '18:30', 'Latest time athletes can check themselves in.'],
  ['PRACTICE_DAYS', 'Mon,Tue,Wed,Thu,Fri', 'Days athletes can check themselves in. Coaches can mark any day.'],
  ['EXTRA_OPEN_DATE', '', 'Set from the app (More > Open check-in today) for a Saturday or holiday practice.'],
  ['ROOM_CODE_REQUIRED', 'No', 'Yes = athletes must type the 2-digit code shown on the coach screen. Stops check-ins from outside the room.'],
  ['WEIGHT_LOSS_FLAG_PCT', '3', 'Flag an athlete whose weight drops more than this percent in one practice.'],
  ['OLD_SHEET_ID', '', 'ID of the old attendance Sheet. The roster is copied from its Athletes tab.'],
  ['SITE_URL', 'https://jerry-d-ball.github.io/wrestling-checkin/', 'Address of the app website. This is what the QR code points to.']
];

var EDITABLE_KEYS = ['ROOM_CODE_REQUIRED', 'EXTRA_OPEN_DATE', 'PRACTICE_START', 'LATE_AFTER_MIN', 'CHECKIN_OPENS', 'CHECKIN_CLOSES'];

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
  var out = 'Setup complete. ' + msg + '\nCoach PIN: ' + cfg_('COACH_PIN') +
    '\n\nNext: Deploy > New deployment > Web app > Execute as "Me", Who has access "Anyone". Then copy the web app URL (ends in /exec) and give it to Claude.';
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
  var msg = 'Athlete check-in (this is the QR code link):\n' + u + '\n\nCoach screens:\n' + u + '?p=coach\n\nQR poster to print:\n' + u + '?p=poster\n\nCoach PIN: ' + cfg_('COACH_PIN');
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

function athleteCheckIn(studentId, deviceId, code) {
  return safe_(function () {
    var a = athlete_(studentId);
    if (!a) return { ok: false, error: 'NOT_FOUND', message: 'That ID is not on the wrestling roster. See Coach.' };
    var day = today_();
    return locked_(function () {
      var existing = find_('Attendance', function (r) { return r.Date === day && r.StudentID === a.id; });
      if (existing && (existing.Status === 'Present' || existing.Status === 'Late')) return { ok: true, already: true, me: stateFor_(a, deviceId) };
      var w = window_();
      if (!w.open) return { ok: false, error: 'CLOSED', message: w.reason, me: stateFor_(a, deviceId) };
      if (isYes_(cfg_('ROOM_CODE_REQUIRED')) && String(code || '').trim() !== roomCode_(day)) {
        return { ok: false, error: 'CODE', message: code ? 'That is not today\'s room code. Look at the code Coach is showing.' : 'Enter the 2-digit room code from Coach.', me: stateFor_(a, deviceId) };
      }
      var other = deviceId && find_('Attendance', function (r) { return r.Date === day && r.DeviceID === deviceId && r.StudentID !== a.id && r.Method === 'Self'; });
      if (other) return { ok: false, error: 'DEVICE', message: 'This phone already checked in ' + other.Name + ' today. One phone, one athlete. See Coach to be marked here.', me: stateFor_(a, deviceId) };
      var rec = { Date: day, StudentID: a.id, Name: a.name, Status: w.late ? 'Late' : 'Present', Time: nowTime_(), Method: 'Self', Note: '', DeviceID: deviceId || '', UpdatedAt: stamp_() };
      if (existing) update_('Attendance', existing._row, rec); else append_('Attendance', rec);
      return { ok: true, me: stateFor_(a, deviceId) };
    });
  });
}

function athleteWeight(studentId, kind, value) {
  return safe_(function () {
    var a = athlete_(studentId);
    if (!a) return { ok: false, error: 'NOT_FOUND', message: 'That ID is not on the roster. See Coach.' };
    var r = saveWeight_(today_(), a, kind, value, 'Athlete');
    if (!r.ok) return r;
    return { ok: true, me: stateFor_(a, '') };
  });
}

function athleteBoard(studentId, deviceId) {
  return safe_(function () {
    var a = athlete_(studentId);
    if (!a) return { ok: false, error: 'NOT_FOUND', message: 'That ID is not on the roster. See Coach.' };
    return locked_(function () {
      var t = tripForAthlete_(a.id);
      if (!t) return { ok: false, error: 'NO_TRIP', message: 'No bus is boarding for you right now. See Coach.', me: stateFor_(a, deviceId) };
      var tag = 'Self:' + (deviceId || '');
      var other = deviceId && find_('TripLog', function (r) { return r.TripID === t.TripID && r.Leg === t.Leg && r.Method === tag && r.StudentID !== a.id; });
      if (other) return { ok: false, error: 'DEVICE', message: 'This phone already boarded ' + other.Name + '. See Coach to be marked on the bus.', me: stateFor_(a, deviceId) };
      var ex = find_('TripLog', function (r) { return r.TripID === t.TripID && r.Leg === t.Leg && r.StudentID === a.id; });
      var rec = { TripID: t.TripID, StudentID: a.id, Name: a.name, Leg: t.Leg, Status: 'On', Time: nowTime_(), Method: tag, Note: '' };
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
  return {
    id: a.id, first: a.first, name: a.first + ' ' + a.last, date: day,
    status: att ? att.Status : '', time: att ? att.Time : '',
    open: w.open, closedReason: w.open ? '' : w.reason, needCode: isYes_(cfg_('ROOM_CODE_REQUIRED')),
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
    var list = roster_(true).map(function (a) {
      var r = att[a.id] || {}, w = wts[a.id] || {};
      return { id: a.id, name: a.last + ', ' + a.first, grade: a.grade, cleared: a.cleared, injured: a.injured,
               status: r.Status || '', time: r.Time || '', method: r.Method || '', note: r.Note || '',
               pre: w.PreWeight || '', post: w.PostWeight || '', chg: w.ChangeLb || '', pct: w.ChangePct || '', last: lastW[a.id] || '' };
    });
    var w = window_();
    return { ok: true, date: day, today: today_(), isToday: day === today_(), athletes: list,
             codeRequired: isYes_(cfg_('ROOM_CODE_REQUIRED')), code: roomCode_(day),
             open: w.open, closedReason: w.reason || '', extraOpen: cfg_('EXTRA_OPEN_DATE') === today_(),
             flagPct: Number(cfg_('WEIGHT_LOSS_FLAG_PCT')) || 3,
             settings: { start: cfg_('PRACTICE_START'), late: cfg_('LATE_AFTER_MIN'), opens: cfg_('CHECKIN_OPENS'), closes: cfg_('CHECKIN_CLOSES'), days: cfg_('PRACTICE_DAYS') } };
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
    if (/^(PRACTICE_START|CHECKIN_OPENS|CHECKIN_CLOSES)$/.test(key) && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(value)) return { ok: false, message: 'Use a time like 16:00.' };
    if (key === 'LATE_AFTER_MIN' && !/^\d{1,3}$/.test(value)) return { ok: false, message: 'Use a number of minutes.' };
    return locked_(function () {
      var row = find_('Config', function (r) { return r.Key === key; });
      if (row) update_('Config', row._row, { Value: value }); else append_('Config', { Key: key, Value: value });
      __memo = {};
      return { ok: true };
    });
  });
}

function coachAddAthlete(pin, a) {
  return coach_(pin, function () {
    var id = String((a && a.id) || '').trim(), first = String((a && a.first) || '').trim(), last = String((a && a.last) || '').trim();
    if (!/^\d{3,10}$/.test(id)) return { ok: false, message: 'Student ID should be numbers only.' };
    if (!first || !last) return { ok: false, message: 'Enter first and last name.' };
    return locked_(function () {
      var ex = find_('Athletes', function (r) { return r.StudentID === id; });
      if (ex) { update_('Athletes', ex._row, { Active: 'Y' }); __memo = {}; return { ok: true, message: ex.FirstName + ' ' + ex.LastName + ' was already on the list and is now active.' }; }
      append_('Athletes', { StudentID: id, FirstName: first, LastName: last, Grade: String((a && a.grade) || ''), Eligible: '', Injured: '', Active: 'Y' });
      __memo = {};
      return { ok: true };
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
  var rows = roster_(true).map(function (a) {
    var c = { P: 0, L: 0, E: 0, A: 0 }, marks = [];
    days.forEach(function (d) {
      var s = map[a.id + '|' + d] || 'Absent';
      var k = s === 'Present' ? 'P' : s === 'Late' ? 'L' : s === 'Excused' ? 'E' : 'A';
      c[k]++; marks.push(k);
    });
    var counted = days.length - c.E;
    return { id: a.id, name: a.last + ', ' + a.first, grade: a.grade, P: c.P, L: c.L, E: c.E, A: c.A,
             pct: counted > 0 ? Math.round(100 * (c.P + c.L) / counted) : null, marks: marks.join('') };
  });
  return { ok: true, from: from, to: to, days: days, rows: rows };
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
    return { ok: true, id: a.id, name: a.first + ' ' + a.last, grade: a.grade, cleared: a.cleared, active: a.active, today: today_(), days: days, weights: weights,
             flagPct: Number(cfg_('WEIGHT_LOSS_FLAG_PCT')) || 3 };
  });
}

/** Writes a printable grid (athlete x practice day) to a "Report" tab in the Sheet. */
function coachExport(pin, from, to) {
  return coach_(pin, function () {
    var rep = report_(normDate_(from), normDate_(to));
    var ss = ss_(), sh = ss.getSheetByName('Report') || ss.insertSheet('Report');
    sh.clearContents();
    var head = ['Athlete', 'Grade', 'Present', 'Late', 'Excused', 'Absent', 'Attendance %'].concat(rep.days.map(function (d) { return d.slice(5); }));
    var out = [head];
    rep.rows.forEach(function (r) {
      out.push([r.name, r.grade, r.P, r.L, r.E, r.A, r.pct == null ? '' : r.pct + '%'].concat(r.marks.split('')));
    });
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    sh.getRange(1, 1, out.length, head.length).setValues(out.map(function (row) { return row.map(String); }));
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    return { ok: true, url: ss.getUrl(), rows: rep.rows.length, days: rep.days.length };
  });
}

/* ---------- trips / bus ---------- */

function coachTrips(pin) {
  return coach_(pin, function () {
    var logs = read_('TripLog').rows;
    var list = read_('Trips').rows.map(function (t) {
      var ids = tripRoster_(t);
      var leg = t.Leg === 'Return' ? 'Return' : 'Depart';
      var n = logs.filter(function (l) { return l.TripID === t.TripID && l.Leg === leg && (l.Status === 'On' || l.Status === 'Released'); }).length;
      return { id: t.TripID, date: t.Date, name: t.Name, leg: t.Leg, total: ids.length, accounted: n };
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return { ok: true, today: today_(), trips: list };
  });
}

function coachTripSave(pin, t) {
  return coach_(pin, function () {
    var name = String((t && t.name) || '').trim(), date = normDate_(t && t.date), roster = (t && t.roster) || [];
    if (!name) return { ok: false, message: 'Give the trip a name, like "Meet at Agua Fria".' };
    if (!date) return { ok: false, message: 'Pick the trip date.' };
    if (!roster.length) return { ok: false, message: 'Pick at least one athlete for the bus.' };
    return locked_(function () {
      var ex = t.id && find_('Trips', function (r) { return r.TripID === t.id; });
      if (ex) { update_('Trips', ex._row, { Name: name, Date: date, Roster: roster.join(',') }); return { ok: true, id: ex.TripID }; }
      var id = 'T' + stamp_().replace(/\D/g, '').slice(2, 14);
      append_('Trips', { TripID: id, Date: date, Name: name, Leg: 'Depart', Roster: roster.join(','), Created: stamp_() });
      return { ok: true, id: id };
    });
  });
}

function coachTrip(pin, tripId) {
  return coach_(pin, function () {
    var t = find_('Trips', function (r) { return r.TripID === tripId; });
    if (!t) return { ok: false, message: 'Trip not found.' };
    var by = {}; roster_(false).forEach(function (a) { by[a.id] = a; });
    var logs = read_('TripLog').rows.filter(function (l) { return l.TripID === tripId; });
    var cell = function (id, leg) {
      var l = logs.filter(function (x) { return x.StudentID === id && x.Leg === leg; })[0];
      return l ? { status: l.Status, time: l.Time, self: /^Self/.test(l.Method), note: l.Note } : { status: '' };
    };
    var riders = tripRoster_(t).map(function (id) {
      var a = by[id];
      return { id: id, name: a ? a.last + ', ' + a.first : 'ID ' + id, dep: cell(id, 'Depart'), ret: cell(id, 'Return') };
    }).sort(function (x, y) { return x.name < y.name ? -1 : 1; });
    var hc = {};
    logs.forEach(function (l) { if (l.Status === 'HeadCount') hc[l.Leg] = { n: l.Note, time: l.Time }; });
    return { ok: true, trip: { id: t.TripID, date: t.Date, name: t.Name, leg: t.Leg, roster: tripRoster_(t) }, riders: riders, headcount: hc };
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
function window_() {
  var day = today_(), mins = nowMins_();
  var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var dow = names[Number(Utilities.formatDate(now_(), tz_(), 'u')) % 7];
  var days = cfg_('PRACTICE_DAYS').split(',').map(function (s) { return s.trim().slice(0, 3).toLowerCase(); });
  var extra = cfg_('EXTRA_OPEN_DATE') === day;
  var late = mins > hm_(cfg_('PRACTICE_START'), 960) + (Number(cfg_('LATE_AFTER_MIN')) || 0);
  if (extra) return { open: true, late: late };
  if (days.indexOf(dow.toLowerCase()) < 0) return { open: false, reason: 'No practice check-in today. If there is practice, see Coach.' };
  if (mins < hm_(cfg_('CHECKIN_OPENS'), 900)) return { open: false, reason: 'Check-in opens at ' + pretty_(cfg_('CHECKIN_OPENS')) + '.' };
  if (mins > hm_(cfg_('CHECKIN_CLOSES'), 1110)) return { open: false, reason: 'Check-in closed at ' + pretty_(cfg_('CHECKIN_CLOSES')) + '. See Coach to be marked.' };
  return { open: true, late: late };
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
               active: !isNo_(r.Active), injured: isYes_(r.Injured), cleared: !isNo_(r.Eligible) && !isYes_(r.Injured) };
    }).sort(function (a, b) { return (a.last + ' ' + a.first).toLowerCase() < (b.last + ' ' + b.first).toLowerCase() ? -1 : 1; });
  }
  return activeOnly ? __memo.roster.filter(function (a) { return a.active; }) : __memo.roster;
}

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
  coachAddAthlete: coachAddAthlete, coachSetActive: coachSetActive, coachRoster: coachRoster,
  coachReport: coachReport, coachAthlete: coachAthlete, coachExport: coachExport,
  coachTrips: coachTrips, coachTripSave: coachTripSave, coachTrip: coachTrip, coachTripMark: coachTripMark,
  coachTripLeg: coachTripLeg, coachTripHeadcount: coachTripHeadcount, coachTripDelete: coachTripDelete
};
