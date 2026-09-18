# NoNameQuiz

A browser-based, camera-driven quiz/voting tool. Instead of clickers or a phone app,
each participant holds up a printed card with a unique **ArUco marker**. The camera
watches the room, recognizes each card by its marker ID, and reads the answer
(**A/B/C/D**) from which corner of the card is currently pointing up — so answering
a question is just a matter of rotating your card.

Built on top of [js-aruco2](https://damianofalcioni.github.io/js-aruco2/) for marker
detection. Questions, sessions, and results are stored locally in the browser via
IndexedDB. Everything runs client-side; there is no backend or build step (see
[features.md](features.md) and [architecture.md](architecture.md) for the full
feature/architecture rationale — a couple of optional AI features described there
aren't built yet, see the note at the end of this file).

## Requirements

- A device with a camera (phone, tablet, or laptop) and a modern browser
  (Chrome/Safari/Firefox on Android/iOS/desktop all work).
- **HTTPS, or `localhost`.** Browsers only grant camera access (`getUserMedia`) on
  secure origins, so opening `index.html` directly via `file://` will fail — serve it
  over `https://` or run it locally (see below).
- One printed ArUco marker card per participant, each with a distinct ID. You can
  generate marker images with the
  [js-aruco2 marker generator](https://damianofalcioni.github.io/js-aruco2/) (dictionary:
  `ARUCO`). ID `0` is reserved/ignored by the app, so start numbering from `1`.

## Setup

Clone the repo and serve the folder with any static file server, for example:

```bash
git clone https://github.com/cndrbrbr/NoNameQuiz.git
cd NoNameQuiz
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html` on the device that will act as the
camera/host. (For use on a phone that isn't `localhost`, you'll need to serve it over
HTTPS — e.g. via `ngrok`, GitHub Pages, or any static host with TLS — since mobile
browsers require a secure origin for camera access.)

Grant camera access when prompted. The app requests the rear-facing (`environment`)
camera by default.

## Preparing marker cards

Each participant needs a physical card with one ArUco marker on it (dictionary
`ARUCO`, any ID except `0`). The card should work as a "spinner": whichever corner is
held pointing **up** encodes the answer:

| Top corner | Answer |
|---|---|
| corner 0 | A |
| corner 1 | B |
| corner 2 | C |
| corner 3 | D |

A simple approach is to print each marker with the letters A/B/C/D written next to the
corresponding corner, so participants can just rotate the physical card to the letter
they want to answer.

## Usage

The app has three tabs: **Fragen** (questions), **Scan** (live quiz), and
**Statistik** (results). It opens on the **Scan** tab and asks for camera access
immediately, same as before.

### 1. Fragen — prepare a question set

- **Upload as JSON**: a file with a `title`, a `subject`, and a `questions` array,
  each question giving `text`, `options.A`–`options.D`, and `correctAnswer`
  (`"A"`–`"D"`) — see the example in [architecture.md](architecture.md#format-für-den-fragen-upload-json).
- **Or build one manually**: enter a title and subject, click **"Frage
  hinzufügen"** to add question rows (text + four options + which one is
  correct), then **"Fragenset speichern"**.
- Existing question sets are listed below the form and can be reused across
  sessions/classes.

### 2. Scan — run a live round

1. Enter **Fach** (subject) and **Klasse** (class) — existing ones are
   suggested, new ones are created on the fly — pick a **Fragenset**, and click
   **"Sitzung starten"** (start session).
2. Point the camera at the room. Any marker card that comes into view is
   automatically added to **"Wer spielt mit?"** as active attendance.
3. Click **"Team steht fest"** to lock in the current attendance list; only
   confirmed cards are then tracked for answers. Use **"Team ändern"** to
   reopen the roster (people joining/leaving), including the manual
   `+17 -18 -94` editor described below.
4. The current question and its A–D options are shown above the camera view.
   Participants rotate their card to the corner matching their answer and hold
   it up. The app continuously updates:
   - **Ergebnisse** — each card's currently detected answer.
   - **Verteilung** — a live tally of how many chose A/B/C/D.
   - **Noch offen** — confirmed participants not yet detected answering.
5. Click **"Nächste Frage"** to store that question's answers and move to the
   next one; after the last question the session is automatically marked
   complete. **"Sitzung beenden"** ends it early at any point.

### 3. Statistik — review results

Filter by Fach/Klasse, pick a session from the list to see the per-question
distribution (A/B/C/D counts and correct/total), then either:

- **"In Zwischenablage kopieren (OneNote)"** — copies the result table to the
  clipboard as an HTML table; paste (Ctrl+V) directly into a OneNote page to
  get a native table there.
- **"CSV herunterladen"** — downloads the same data as a CSV file (fallback,
  or for further processing).

**"Wiederholungsset vorschlagen"** lists questions from that session with a
high error rate (≥40% by default) and lets you turn the selected ones into a
new "Wiederholung …" question set for the next session with that class.

### Presentation mode (smartboard)

Rotating the phone to **landscape** switches the Scan tab to a two-column
layout sized for a 16:9 screen: camera view/question/answers on the left,
teacher controls (session setup, attendance, next/end question) on the
right — meant for exactly this moment, when the phone's screen is mirrored to
a smartboard (Miracast/AirPlay/Chromecast/HDMI) so the room sees question,
answer options, camera feed, and live results together. Only the processed
camera view (with detected markers highlighted) is shown — the raw camera
preview is kept off-screen since it would just duplicate that image.

The **"Präsentation an/aus"** button additionally shrinks the teacher
controls and enlarges the question/answers/results text further, for when
you want the room-facing content even bigger regardless of orientation. See
[architecture.md](architecture.md#präsentationsmodus-smartboard) for why this
doesn't need a second device/app.

### Not implemented yet

Two features from [features.md](features.md) need an external AI API key and a
small server-side proxy to call it safely (an API key can't live in this
static page's client-side JS) and aren't wired up yet: **F8** (AI-generated
question sets from a topic) and **F10** (AI tips for the teacher based on
error patterns). See [architecture.md](architecture.md#ki-komponente-fragengenerierung--tipps)
for the planned shape once a provider/hosting choice is made.

## Project structure

```
index.html         — app shell, tabs, camera loop, marker → answer logic
store.js            — IndexedDB data layer (subjects, classes, question sets,
                       questions, sessions, answer records)
question-editor.js  — question set upload (JSON) and manual builder
quiz-runner.js      — session/question flow, ties scanning to the active question
stats-view.js       — results browser (filter, per-question breakdown)
export.js           — clipboard HTML-table copy + CSV download
review.js           — error-rate calculation and review-set generation
aruco.js            — vendored js-aruco2 marker detector
cv.js               — vendored computer-vision helpers used by aruco.js
polyfill.js         — getUserMedia / browser compatibility shims
history/            — archived earlier iterations of index.html, kept for reference
```

## Credits

Marker detection powered by [js-aruco2](https://damianofalcioni.github.io/js-aruco2/).
