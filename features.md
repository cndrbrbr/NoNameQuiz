# Features: Quiz-Modus für NoNameQuiz

## Ziel

NoNameQuiz ist bisher ein reines Live-Abstimmungs-/Anwesenheitstool: Karten werden
erkannt, die aktuell gehaltene Ecke (A–D) wird gezählt, es gibt aber keine
hinterlegte Frage und keine dauerhafte Speicherung der Ergebnisse.

Ziel dieser Erweiterung: Eine Lehrkraft lädt vorbereitete Fragen mit den
Antwortoptionen A–D hoch. Frage und Antworten werden im Unterricht angezeigt,
die Schüler antworten wie bisher über die ArUco-Karten, und die Ergebnisse
werden je Fach und Klasse dauerhaft als Statistik gespeichert.

## Rollen

- **Lehrkraft** – bedient das Handy/Tablet, lädt Fragen hoch, startet den Scan,
  sieht die Statistik.
- **Schüler** – halten ihre nummerierte ArUco-Karte hoch, keine direkte
  Interaktion mit der App.

## Feature-Liste

### F1 – Fragenverwaltung (Upload)

- Lehrkraft kann ein **Fragenset** hochladen: pro Frage ein Fragetext, vier
  Antworttexte (A–D) und die als richtig markierte Antwort (Grundlage für
  Auswertung und Wiederholung, siehe F10).
- Upload entweder als Datei (JSON) oder über ein einfaches Formular in der App.
- Ein Fragenset wird einem **Fach** zugeordnet (z. B. "Mathematik") und kann in
  mehreren Sitzungen/Klassen wiederverwendet werden.
- Bestehende Fragensets lassen sich erneut auswählen, statt jedes Mal neu
  eingegeben werden zu müssen.
- Alternativ zur manuellen Eingabe: KI-gestützte Generierung eines
  Fragensets, siehe F8.

### F2 – Fragenanzeige

- Aktuelle Frage und die vier Antwortmöglichkeiten (A–D) werden groß und gut
  lesbar angezeigt (für die ganze Klasse sichtbar, z. B. per Beamer oder am
  Lehrer-Gerät vorgelesen).
- Navigation zwischen den Fragen eines Sets ("nächste Frage").
- Anzeige, an welcher Position im Fragenset man sich gerade befindet
  (z. B. "Frage 3 von 10").

### F3 – Kartenerkennung (bestehende Funktion, wird eingebunden)

- Jede Schüler-Karte trägt einen eindeutigen ArUco-Code (Kartennummer).
- Die Ecke der Karte, die nach oben zeigt, kodiert die Antwort A, B, C oder D.
- Der Scan läuft weiterhin über die Handy-/Tablet-Kamera (bestehende Logik aus
  `index.html`).

### F4 – Live-Auszählung

- Während des Scans wird pro Karte die erkannte Antwort live angezeigt.
- Die laufende Verteilung (Anzahl A/B/C/D) wird live aktualisiert.
- Anzeige, welche angemeldeten Karten noch nicht geantwortet haben
  ("Noch offen") – bestehende Funktion, jetzt an die aktuell angezeigte Frage
  gekoppelt statt an eine generische Runde.

### F5 – Ergebnis-Speicherung & Statistik

- Beim Wechsel zur nächsten Frage wird das Ergebnis der aktuellen Frage
  gespeichert:
  - pro Kartennummer, welche Antwort gegeben wurde,
  - aggregiert, wie oft A/B/C/D gewählt wurden.
- Speicherung strukturiert nach **Fach → Klasse → Sitzung (Datum/Stunde) →
  Fragenset → Frage**.
- Da jede Frage eine hinterlegte richtige Antwort hat, wird zusätzlich
  Richtig/Falsch pro Antwort erfasst — Grundlage für die Fehlerquote je
  Frage (siehe F10) und für die KI-Tipps (siehe F11).
- Historische Statistiken lassen sich später nach Fach und/oder Klasse
  filtern und ansehen (z. B. "alle Ergebnisse von Klasse 7b in Mathematik").
- Übersicht zeigt z. B. die Verteilung pro Frage; ein Verlauf über mehrere
  Sitzungen ist eine mögliche spätere Ausbaustufe.

### F6 – Datenexport (inkl. OneNote)

- Export der gespeicherten Statistik als JSON/CSV, damit die Daten nicht
  ausschließlich im Browser-Speicher eines einzelnen Geräts liegen und bei
  Bedarf gesichert oder in Excel/Sheets weiterverarbeitet werden können.
- **Für OneNote**: Ergebnisse lassen sich per Klick als formatierte Tabelle
  in die Zwischenablage kopieren und direkt in eine OneNote-Seite einfügen
  (Strg+V erzeugt dort eine native Tabelle) — ohne Umweg über eine separate
  Datei.

### F7 – Verwaltung von Fächern/Klassen (optional, spätere Ausbaustufe)

- Anlegen/Umbenennen von Fächern und Klassen direkt in der App, statt sie nur
  implizit beim ersten Gebrauch entstehen zu lassen.

### F8 – KI-gestützte Fragengenerierung

- Lehrkraft gibt einen Themenbereich ein (z. B. "Bruchrechnung, Klasse 7").
- Eine KI-Komponente schlägt dazu ein Fragenset vor: Fragetexte, vier
  Antwortoptionen A–D je Frage sowie die jeweils richtige Antwort.
- Die Lehrkraft kann den Vorschlag vor der Übernahme sichten, einzelne
  Fragen bearbeiten/verwerfen und erst dann als Fragenset speichern (siehe
  F1) — die KI ersetzt also die manuelle Eingabe, nicht die Kontrolle durch
  die Lehrkraft.

### F9 – Wiederholung falsch beantworteter Fragen

- Nach einer Sitzung erkennt das System, welche Fragen auffällig oft falsch
  beantwortet wurden (hohe Fehlerquote).
- Für die nächste Sitzung derselben Klasse/desselben Fachs kann daraus ein
  **Wiederholungs-Fragenset** erzeugt werden, das genau diese Fragen erneut
  stellt.
- In der Standardausbaustufe erfolgt die Wiederholung klassenweise (alle
  bekommen dieselben, zuvor schwierigen Fragen erneut). Eine Wiederholung
  gezielt für einzelne Schüler (über die Kartennummer) ist nur sinnvoll,
  wenn dieselbe Karte dauerhaft derselben Person zugeordnet ist, und ist
  daher als spätere Ausbaustufe vorgesehen.

### F10 – KI-Tipps für die Lehrkraft

- Nach einer Frage bzw. am Ende einer Sitzung kann die Lehrkraft eine kurze,
  KI-generierte Einschätzung abrufen, z. B. welche Frage besonders
  fehleranfällig war und was das über einen möglichen Erklärungsbedarf
  nahelegt.
- Die Tipps sind ein optionales Zusatzangebot ("ggf."), keine verpflichtende
  Bewertung — die Lehrkraft entscheidet selbst, ob und wie sie reagiert.

### F11 – Präsentationsansicht für Smartboard

- Während des Scannens sollen auf einem Smartboard gleichzeitig sichtbar
  sein: die aktuelle Frage mit den Antwortoptionen A–D, das Kamerabild vom
  Handy (auf dem gescannt wird) und die live erkannten Ergebnisse/die
  Verteilung.
- Das Handy bleibt das Gerät, das scannt (Kamera + Kartenerkennung); das
  Smartboard zeigt für die ganze Klasse sichtbar dieselben Informationen in
  groß an.
- Die Scan-Ansicht wird so aufgeräumt, dass sie sich für die Projektion
  eignet: Frage, Antworten, Kamerabild und Live-Ergebnisse groß und klar,
  Steuerungselemente der Lehrkraft (z. B. "Team steht fest", "Neue Frage")
  unauffällig/klein, damit sie die Projektion nicht stören.

## Nicht-funktionale Anforderungen

- Weiterhin ohne Build-Step nutzbar (reines HTML/JS wie bisher).
- Kernfunktionen (Frage anzeigen, scannen, auswerten, Statistik ansehen)
  funktionieren offline auf einem Gerät. Internet wird nur für die
  optionalen KI-Funktionen (F8, F10) benötigt — ohne Internetverbindung
  bleibt alles außer diesen beiden Features nutzbar.
- Keine Klarnamen der Schüler nötig – nur Kartennummern (Datenschutz). Bei
  KI-Anfragen (F8, F10) werden nur Fragetexte/Statistikwerte übertragen,
  keine personenbezogenen Daten.
- Bedienbar durch eine Lehrkraft ohne technisches Vorwissen.

## Abgrenzung (vorerst nicht enthalten)

- Keine Nutzerkonten/Login.
- Keine Mehrgeräte-Synchronisation in Phase 1 (ein Handy/Tablet pro Sitzung
  scannt und speichert lokal).
- Keine automatische Zuordnung Kartennummer → Schülername.
- Keine direkte OneNote-API-Anbindung (Microsoft-Login etc.) — Export läuft
  über Kopieren/Einfügen bzw. Dateidownload (siehe F6).
- Keine personalisierte, kartenbasierte Wiederholung in Phase 1 (siehe F9).

Siehe [architecture.md](architecture.md) für die technische Umsetzung.
