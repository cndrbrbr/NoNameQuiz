# NoNameQuiz

A browser-based, camera-driven quiz/voting tool. Instead of clickers or a phone app,
each participant holds up a printed card with a unique **ArUco marker**. The camera
watches the room, recognizes each card by its marker ID, and reads the answer
(**A/B/C/D**) from which corner of the card is currently pointing up — so answering
a question is just a matter of rotating your card.

Built on top of [js-aruco2](https://damianofalcioni.github.io/js-aruco2/) for marker
detection. Everything runs client-side in the browser; there is no backend or build
step.

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

1. Open the app and point the camera at the room. Any marker card that comes into
   view is automatically added to **"Wer spielt mit?"** (who's playing) as active
   attendance.
2. Click **"Team steht fest"** ("team is set") to lock in the current attendance list.
   From this point on, only confirmed cards are tracked for answers.
3. Show a quiz question to the room. Participants rotate their card to the corner
   matching their answer (A/B/C/D) and hold it up toward the camera.
4. The app continuously reads visible cards and updates:
   - **Ergebnisse** — each participant's card ID and their currently detected answer.
   - **Verteilung** — a live tally of how many chose A/B/C/D.
   - **Noch offen** — which confirmed participants haven't been detected answering yet.
5. Click **"Neue Frage"** ("new question") to clear answers and start the next round
   (attendance stays locked).
6. Use **"Team ändern"** ("change team") to reopen the attendance editor if people
   join or leave. You can also manually adjust the roster by typing marker IDs into
   the text field in the form `+17 -18 -94` (add card 17, remove cards 18 and 94) and
   clicking **"Übernehmen"** (apply).

## Project structure

```
index.html   — the app (UI, camera loop, marker → answer logic)
aruco.js     — vendored js-aruco2 marker detector
cv.js        — vendored computer-vision helpers used by aruco.js
polyfill.js  — getUserMedia / browser compatibility shims
history/     — archived earlier iterations of index.html, kept for reference
```

## Credits

Marker detection powered by [js-aruco2](https://damianofalcioni.github.io/js-aruco2/).
