# West Point Wrestling Check-In

Attendance, weigh-ins and bus checks for the wrestling program. Athletes scan one QR code; coaches use the same site with a PIN.

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

## One-time setup

1. In this repository: Settings > Pages > Source "Deploy from a branch" > `main` and `/ (root)` > Save.
2. Open the attendance Google Sheet > Extensions > Apps Script. Replace the contents of `Code.gs` with `apps-script/Code.gs` from this repository and save.
3. Choose the `setup` function and click Run. Approve the permission prompt. Note the coach PIN it shows.
4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Deploy, and copy the web app URL (ends in `/exec`).
5. Put that URL in `config.js` as `window.WP_API`.

## How the app knows an athlete is really there

Set under More > "Where athletes can check in" on the coach screens.

- **At school, code as backup (default):** the athlete's phone must be within about 270 yards of the wrestling room. If a phone cannot get its location, the coach gives that athlete the day's 2-digit backup code.
- **Bus, leaving:** same rule, measured from the school (or from the coach's phone if the coach sets the spot).
- **Bus, coming home:** measured from the coach's phone, captured when the coach switches the trip to the ride home.
- Phone coordinates are used for the check and are not saved. The Sheet records only whether location or the code was used.
- A coach can always mark anyone by hand.

## Changing the data script later

Paste the new `Code.gs`, then Deploy > Manage deployments > pencil > Version: New version > Deploy. The URL stays the same.

## Tests

`node test/logic.test.js` checks the data script against a mock Sheet. `node test/ui.test.js` drives the real `index.html` in a phone-sized browser (needs Playwright). All names in the tests are made up.

`qrcode.js` is qrcode-generator by Kazuhiko Arase, MIT license.
