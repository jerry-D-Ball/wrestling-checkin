// Minimal stand-in for the Google Apps Script services used by Code.gs (tests + browser harness only).
(function (g) {
  function Sheet(name) { this.name = name; this.data = []; }
  Sheet.prototype = {
    getMaxRows: function () { return 1000; }, getMaxColumns: function () { return 26; },
    getLastRow: function () { return this.data.length; },
    getLastColumn: function () { return this.data.reduce(function (m, r) { return Math.max(m, r.length); }, 0); },
    appendRow: function (a) { this.data.push(a.map(String)); },
    deleteRow: function (n) { this.data.splice(n - 1, 1); },
    setFrozenRows: function () {}, clearContents: function () { this.data = []; }, hideSheet: function () { this.hidden = true; },
    getDataRange: function () { var s = this; return { getDisplayValues: function () { var w = Math.max(1, s.getLastColumn()); if (!s.data.length) return [['']]; return s.data.map(function (r) { var o = r.slice(); while (o.length < w) o.push(''); return o; }); } }; },
    getRange: function (r, c, nr, nc) {
      var s = this; nr = nr || 1; nc = nc || 1;
      return {
        setNumberFormat: function () { return this; }, setFontWeight: function () { return this; },
        getDisplayValues: function () { var out = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push(((s.data[r - 1 + i] || [])[c - 1 + j]) || ''); out.push(row); } return out; },
        setValues: function (v) { for (var i = 0; i < nr; i++) { while (s.data.length < r + i) s.data.push([]); for (var j = 0; j < nc; j++) { var row = s.data[r - 1 + i]; while (row.length < c + j) row.push(''); row[c - 1 + j] = String(v[i][j]); } } return this; }
      };
    }
  };
  function Book() { this.sheets = {}; }
  Book.prototype = {
    getSheetByName: function (n) { return this.sheets[n] || null; },
    insertSheet: function (n) { return (this.sheets[n] = new Sheet(n)); },
    getSheets: function () { var s = this.sheets; return Object.keys(s).map(function (k) { return s[k]; }); },
    getUrl: function () { return 'https://docs.google.com/spreadsheets/d/TEST/edit'; }
  };
  g.__book = new Book(); g.__old = new Book(); g.__signup = new Book();
  g.SpreadsheetApp = { getActiveSpreadsheet: function () { return g.__book; }, openById: function (id) { if (id === 'NOSUCH') throw new Error('not found'); return id === 'SIGNUPID' ? g.__signup : g.__old; }, getUi: function () { throw new Error('no ui'); } };
  g.Utilities = {
    formatDate: function (d, tz, f) {
      var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      if (f === 'u') return String({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday]);
      return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
    },
    DigestAlgorithm: { MD5: 1 },
    computeDigest: function (a, s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return [(h & 255) - 128, ((h >> 8) & 255) - 128]; },
    sleep: function () {}
  };
  g.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  g.__triggers = []; g.__triggerFail = '';   // __triggerFail: 'all' = no permission yet, 'fancy' = only the plainest timer form works
  g.ScriptApp = { getService: function () { return { getUrl: function () { return 'https://script.google.com/macros/s/TEST/exec'; } }; },
    WeekDay: { MONDAY: 'MONDAY', FRIDAY: 'FRIDAY' },
    getProjectTriggers: function () { if (g.__triggerFail === 'all') throw new Error('Authorization is required'); return g.__triggers.slice(); },
    deleteTrigger: function (t) { g.__triggers = g.__triggers.filter(function (x) { return x !== t; }); },
    newTrigger: function (fn) {
      var t = { fn: fn, getHandlerFunction: function () { return fn; } }, b = {
        timeBased: function () { return b; }, everyWeeks: function (n) { t.weeks = n; return b; }, onWeekDay: function (d) { t.day = d; return b; }, atHour: function (h) { t.hour = h; return b; },
        nearMinute: function (m) { if (g.__triggerFail === 'fancy') throw new Error('unsupported'); t.minute = m; return b; }, inTimezone: function (z) { t.tz = z; return b; },
        create: function () { g.__triggers.push(t); return t; } };
      return b;
    } };
  g.__owner = 'owner@example.com';
  g.Session = { getEffectiveUser: function () { return { getEmail: function () { return g.__owner; } }; } };
  g.Logger = { log: function () {} };
  g.__cache = {};
  g.CacheService = { getScriptCache: function () { return { get: function (k) { return Object.prototype.hasOwnProperty.call(g.__cache, k) ? g.__cache[k] : null; }, put: function (k, v) { g.__cache[k] = String(v); }, remove: function (k) { delete g.__cache[k]; } }; } };
  g.__mail = []; g.__mailFail = '';
  g.MailApp = { sendEmail: function (msg) { if (g.__mailFail) throw new Error(g.__mailFail); g.__mail.push(msg); } };
  g.Utilities.newBlob = function (data, type, name) {
    var b = { __data: data, __type: type, __name: name,
      getAs: function (t) { return g.Utilities.newBlob('%PDF-1.4 ' + data, t, name); },
      setName: function (n) { b.__name = n; return b; }, getName: function () { return b.__name; },
      getBytes: function () { var out = []; for (var i = 0; i < b.__data.length; i++) out.push(b.__data.charCodeAt(i) & 255); return out; } };
    return b;
  };
  g.Utilities.base64Encode = function (bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 255); return (typeof btoa === 'function') ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); };
  g.ContentService = { MimeType: { JSON: 1 }, createTextOutput: function (t) { return { __text: t, setMimeType: function () { return this; } }; } };
  g.__seedOld = function () {
    var names = [['Marco','Alvarez',9],['Dante','Brooks',11],['Eli','Castillo',10],['Jonah','Diaz',12],['Theo','Estrada',9],['Andre','Flores',10],['Micah','Garza',11],['Isaac','Hale',9],['Owen','Ibarra',12],['Luis','Jimenez',10],['Kai','Keller',11],['Nico','Lopez',9],['Sam','Medina',10],['Reid','Navarro',12],['Cruz','Ortega',9],['Jude','Pena',11],['Ty','Quintero',10],['Max','Ramos',9]];
    var sh = g.__old.insertSheet('Athletes');
    sh.appendRow(['StudentID','AthleteCode','FirstName','LastName','Grade','Sport','Eligible','Injured','Active','FirstSeenYMD']);
    names.forEach(function (n, i) { sh.appendRow([String(300100 + i), String(300100 + i), n[0], n[1], String(n[2]), 'Wrestling', i % 5 === 4 ? 'No' : 'Yes', 'No', 'Y', '2026-11-02']); });
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
