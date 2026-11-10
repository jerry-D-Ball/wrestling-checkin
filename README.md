# West Point Wrestling Check-In

Attendance, weigh-ins, travel rosters and bus checks for the wrestling program. Athletes scan one QR code; coaches use the same site with a PIN.

No athlete names, IDs or weights are stored in this repository. All data lives in the coach's Google Sheet.

## How it fits together

| Piece | Where it lives | Changes how often |
|---|---|---|
| The screens (`index.html`, `qrcode.js`) | This repository, served by GitHub Pages | Whenever a screen needs changing |
| The connection (`config.js`) | This repository | Once, when the Sheet script is deployed |
| The data script (`apps-script/Code.gs`) | Pasted into the attendance Google Sheet | Rarely |

## Links

- Athlete check-in (the QR code): https://jerry-d-ball.github.io/wrestling-checkin/
- Coach screens: https://jerry-d-ball.github.io/wrestling-checkin/?p=coach
- Printable QR poster: https://jerry-d-ball.github.io/wrestling-checkin/?p=poster
- Future Freshman Night sign-up (its own QR code): https://jerry-d-ball.github.io/wrestling-checkin/signup.html

## One-time setup

1. In this repository: Settings > Pages > Source "Deploy from a branch" > `main` and `/ (root)` > Save.
2. Open the attendance Google Sheet > Extensions > Apps Script. Replace the contents of `Code.gs` with `apps-script/Code.gs` from this repository and save.
3. Choose the `setup` function and click Run. Approve the permission prompt. Note the coach PIN it shows.
4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Deploy, and copy the web app URL (ends in `/exec`).
5. Put that URL in `config.js` as `window.WP_API`.

## Practice times

Practice alternates weekly between an early slot (4:00) and a late slot (6:00). The `Schedule` tab holds one row per practice day (`Date`, `Start`, `End`, `Note`; `Start` = `OFF` for no practice). Days with no row follow `PRACTICE_DAYS` and `DEFAULT_SLOT` in Config. Coaches set days from More > Practice schedule, including Saturdays and holidays; "Fill ahead" lays out four alternating weeks. Check-in opens 30 minutes before the start, marks Late after 5, and closes 20 minutes after (all in Config).

## Optional sessions

Weight room time, Saturday recovery and other non-mandatory work are tracked as optional sessions, separate from practice.

- **Starting one:** on the Today screen, "+ Optional session" opens check-in immediately for 1, 2 or 3 hours. Athletes scan the same QR code. For a past day the coach creates the session and adds names by hand.
- **What a scan does:** if practice check-in is open, the scan is a practice check-in, and the athlete can add the optional session with one more tap. If practice check-in is not open, the scan logs the optional session.
- **Reports:** optional sessions are counted on their own ("+ optional"). They are never a practice day, never an absence, and never part of the attendance percentage.
- Data lives in the `Sessions` and `SessionLog` tabs.

## Travel rosters

The Travel tab holds one trip per meet. A trip is both the travel roster for the attendance office and the list for the bus check, so the two cannot drift apart.

- **Picking the roster:** each traveler is tagged Varsity, JV or Other. Managers and student assistants are added from the trip form; they are stored in the `Athletes` tab with `Role` = `Manager`, travel as Other, and are left off the daily attendance list and the reports.
- **The roster PDF:** title (`TRAVEL_TITLE`), the excused line typed on the trip (for example "Excused 12/1 for classes 5-7"), then ID and Name, sorted by last name.
- **The email:** "Email this roster to the office" sends the PDF to `TRAVEL_EMAIL_TO` from the Google account that owns the Sheet. The address lives only in the Sheet's Config tab, not in this repository. The trip records when it was sent and flags the roster if it changes afterwards.
- Sending email is a Google permission. After pasting a new `Code.gs`, run `setup` once so Google asks for it, then deploy a new version.

## Future Freshman Night sign-up

`signup.html` is a public page for incoming families: student name, student email (optional), parent or guardian name and email. It has its own QR code and needs no PIN or Student ID.

- Each sign-up is one row on the `Sign-Ups` tab of its own Google Sheet ("Future Freshman Night - Wrestling Sign-Ups"). That Sheet has its own copy of `Code.gs` and its own web app; its URL is `WP_SIGNUP_API` in `config.js`. The sign-up page never talks to the attendance Sheet.
- The sign-up Sheet's Config tab holds its own ID as `SIGNUP_SHEET_ID`. If that is blank or cannot be opened, rows go to a `FreshmanNight` tab in the same Sheet, so a sign-up is never lost.
- The page can only add a row. It cannot read the list. The same student with the same parent email corrects their row instead of adding a second one.
- The coach may add, move or reorder columns in the sign-up Sheet; rows follow the column headers.
- To close sign-up, set `SIGNUP_OPEN` to `N` in Config.

## The girls team: a separate deployment

Girls wrestling runs the same app as its own deployment. The two teams share the code and nothing else.

| | Boys | Girls |
|---|---|---|
| Athlete check-in (the QR code) | https://jerry-d-ball.github.io/wrestling-checkin/ | https://jerry-d-ball.github.io/wrestling-checkin/girls/ |
| Coach screens | `…/wrestling-checkin/?p=coach` | `…/wrestling-checkin/girls/?p=coach` |
| Printable QR poster | `…/wrestling-checkin/?p=poster` | `…/wrestling-checkin/girls/?p=poster` |
| Connection | `config.js` | `girls/config.js` |
| Google Sheet, roster, coach PIN, web app URL | the boys' Sheet | the girls' own Sheet |

- **Setting it up:** the girls' coach makes a new blank Google Sheet in her own Google account, pastes `apps-script/Code.gs` into Extensions > Apps Script, runs **`setupGirls`** (not `setup`), and deploys it as a web app exactly as in "One-time setup". Its `/exec` URL goes in `girls/config.js` as `window.WP_API`. Until then the girls page says it is not connected yet. `setupGirls` refuses to run in a Sheet that already holds attendance.
- **The page:** `girls/index.html` is generated from `index.html` by `node tools/build-girls.js` (only the page title and home-screen name differ). Run it after every change to `index.html`; `test/girls.test.js` fails if the two are out of step. The girls page saves the Student ID and coach PIN on a phone under its own keys (`WP_KEY`), so a phone that uses both pages keeps them apart.
- **Later updates:** paste the new `Code.gs` into both Sheets. Plain `setup` in the girls' Sheet keeps it a girls Sheet.

### Cycle log (girls Sheet only)

The girls' coach can track which days each athlete reports being on her period.

- **For the athlete:** after she checks in, the weigh-in card has a folded "Cycle log" row. Opened, it is one checkbox: "On cycle today". It is folded because the check-in screen gets shown to coaches and teammates.
- **Who gets the box:** only an athlete whose parent consent form the coach has marked as on file, and only on the phone that checked her in that day. Another phone that types her Student ID sees nothing.
- **For the coach:** Reports > Cycle log, opened with a second PIN (`HEALTH_PIN` in Config) that is asked for every time and never saved on the phone. It lists who is on today and each athlete's periods as reported: first day, last day, number of days. Days no more than 3 apart count as one period, so a weekend does not split it. The coach can add or remove a day, turn an athlete's box on or off, and erase an athlete's log.
- **Where it is kept:** the hidden `Cycle` and `CycleConsent` tabs of the girls' Sheet. It is not on the Today, Weights, Reports, athlete, travel or export screens. Five wrong Health PINs lock the log for 15 minutes.
- **Off switch:** `CYCLE_TRACKING` = `N` in Config turns it off for everyone. None of this exists in a Sheet set up with plain `setup`.

This is health information about students. Before any athlete's box is turned on, the school should have approved collecting it and her parent should have signed a consent form (in Arizona see A.R.S. 15-117).

## How the app knows an athlete is really there

Set under More > "Where athletes can check in" on the coach screens.

- **At school, code as backup (default):** the athlete's phone must be within about 270 yards of the wrestling room. If a phone cannot get its location, the coach gives that athlete the day's 2-digit backup code.
- **Bus, leaving:** same rule, measured from the school (or from the coach's phone if the coach sets the spot).
- **Bus, coming home:** measured from the coach's phone, captured when the coach switches the trip to the ride home.
- Phone coordinates are used for the check and are not saved. The Sheet records only whether location or the code was used.
- A coach can always mark anyone by hand.

## Changing the data script later

Paste the new `Code.gs`, run `setup`, then Deploy > Manage deployments > pencil > Version: New version > Deploy. The URL stays the same. Do this in each team's Sheet.

## Tests

`node test/logic.test.js` checks the data script against a mock Sheet, and `node test/cycle.test.js` does the same for a girls-team Sheet and the cycle log. `node test/ui.test.js` drives the real `index.html` in a phone-sized browser (needs Playwright), `node test/girls.test.js` does the same for the girls page, and `node test/signup.test.js` for `signup.html`. All names in the tests are made up.

`qrcode.js` is qrcode-generator by Kazuhiko Arase, MIT license.
