/* Excel-Import und -Export (Fragensets und Quiz-Ergebnisse), damit
   Lehrkräfte ohne JSON auskommen. Nutzt SheetJS (vendor/xlsx.full.min.js),
   läuft komplett im Browser.

   Aufbau eines Fragenset-Blatts (ein Blatt = ein Fragenset):
     A1 "Titel"  B1 <Titel>
     A2 "Fach"   B2 <Fach>
     A4 "Frage"  B4 "Antwort A" … E4 "Antwort D"  F4 "Richtig (A-D)"
     ab Zeile 5 eine Frage pro Zeile
   Beim Einlesen wird die Kopfzeile gesucht (Zelle "Frage" in Spalte A),
   die Zeilennummern müssen also nicht genau stimmen. */
var ExcelIO = (function () {
  var LETTERS = ["A", "B", "C", "D"];
  var QUESTION_HEADER = ["Frage", "Antwort A", "Antwort B", "Antwort C", "Antwort D", "Richtig (A-D)"];

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  function fileSafe(name) {
    return String(name || "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-").slice(0, 60) || "export";
  }

  // Blattnamen: max. 31 Zeichen, keine []:*?/\ und im Arbeitsblatt eindeutig.
  function sheetName(name, used) {
    var base = String(name || "Blatt").replace(/[\[\]:*?\/\\]/g, "").trim().slice(0, 31) || "Blatt";
    var candidate = base;
    var n = 2;
    while (used[candidate.toLowerCase()]) {
      var suffix = " (" + n++ + ")";
      candidate = base.slice(0, 31 - suffix.length) + suffix;
    }
    used[candidate.toLowerCase()] = true;
    return candidate;
  }

  // Fragen-/Antwortzellen als Text formatieren, sonst macht Excel z.B. aus
  // "1/2" ein Datum. Leere Zeilen werden mit vorformatierten Zellen
  // aufgefüllt, damit auch neu eingetippte Fragen Text bleiben.
  var TEXT_ROWS = 200;

  function formatAsText(sheet, firstRow, lastCol) {
    for (var r = firstRow; r < TEXT_ROWS; r++) {
      for (var c = 0; c <= lastCol; c++) {
        var ref = XLSX.utils.encode_cell({ r: r, c: c });
        var existing = sheet[ref];
        if (!existing) sheet[ref] = { t: "s", v: "", z: "@" };
        else if (existing.t === "s") existing.z = "@";
      }
    }
    sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: TEXT_ROWS - 1, c: Math.max(lastCol, 1) } });
  }

  function addSheet(workbook, name, rows, colWidths, used, textFromRow) {
    var sheet = XLSX.utils.aoa_to_sheet(rows);
    if (textFromRow != null) formatAsText(sheet, textFromRow, QUESTION_HEADER.length - 1);
    if (colWidths) {
      sheet["!cols"] = colWidths.map(function (w) {
        return { wch: w };
      });
    }
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName(name, used));
  }

  function download(workbook, filename) {
    XLSX.writeFile(workbook, filename, { compression: true });
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  }

  function percent(part, total) {
    return total ? Math.round((part / total) * 100) : "";
  }

  // --- Fragensets ----------------------------------------------------------

  var QUESTION_COLS = [60, 28, 28, 28, 28, 14];

  function questionSetRows(title, subject, questions) {
    var rows = [["Titel", title], ["Fach", subject], [], QUESTION_HEADER];
    questions.forEach(function (q) {
      rows.push([q.text, q.optionA, q.optionB, q.optionC, q.optionD, q.correctAnswer]);
    });
    return rows;
  }

  function downloadTemplate() {
    var workbook = XLSX.utils.book_new();
    var used = {};
    addSheet(
      workbook,
      "Fragenset",
      questionSetRows("Mein Fragenset", "Mathematik", [
        { text: "Wie viel ist 3 · 4?", optionA: "7", optionB: "12", optionC: "34", optionD: "1", correctAnswer: "B" },
        { text: "Welche Zahl ist eine Primzahl?", optionA: "9", optionB: "15", optionC: "21", optionD: "13", correctAnswer: "D" },
      ]),
      QUESTION_COLS,
      used,
      0
    );
    addSheet(
      workbook,
      "Anleitung",
      [
        ["So funktioniert die Vorlage"],
        [],
        ["1.", "Im Blatt „Fragenset“ neben „Titel“ und „Fach“ eintragen."],
        ["2.", "Ab Zeile 5 eine Frage pro Zeile: Fragetext, vier Antworten, und in der letzten Spalte der Buchstabe der richtigen Antwort (A, B, C oder D)."],
        ["3.", "Die Beispielfragen überschreiben oder löschen."],
        ["4.", "Mehrere Fragensets in einer Datei: das Blatt „Fragenset“ kopieren (Rechtsklick auf den Blattnamen → Verschieben/Kopieren). Jedes Blatt wird ein eigenes Fragenset."],
        ["5.", "Datei speichern und in NoNameQuiz unter Fragen → „Excel-Datei“ hochladen."],
        [],
        ["Dieses Blatt „Anleitung“ wird beim Hochladen ignoriert."],
      ],
      [4, 110],
      used
    );
    download(workbook, "nonamequiz-vorlage.xlsx");
  }

  function exportQuestionSets(setIds) {
    return Promise.all([Store.listSubjects()].concat(setIds.map(Store.getQuestionSetWithQuestions))).then(
      function (results) {
        var subjectById = {};
        results[0].forEach(function (s) {
          subjectById[s.id] = s.name;
        });
        var sets = results.slice(1).filter(Boolean);
        if (sets.length === 0) throw new Error("Keine Fragensets vorhanden.");

        var workbook = XLSX.utils.book_new();
        var used = { anleitung: true };
        sets.forEach(function (set) {
          addSheet(
            workbook,
            set.title,
            questionSetRows(set.title, subjectById[set.subjectId] || "", set.questions),
            QUESTION_COLS,
            used,
            0
          );
        });
        download(
          workbook,
          sets.length === 1 ? "fragenset-" + fileSafe(sets[0].title) + ".xlsx" : "fragensets-" + today() + ".xlsx"
        );
        return sets.length;
      }
    );
  }

  function exportQuestionSet(setId) {
    return exportQuestionSets([setId]);
  }

  function exportAllQuestionSets() {
    return Store.listQuestionSets().then(function (sets) {
      sets.sort(function (a, b) {
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      return exportQuestionSets(
        sets.map(function (s) {
          return s.id;
        })
      );
    });
  }

  function cell(row, i) {
    return String(row[i] == null ? "" : row[i]).trim();
  }

  // Liefert pro brauchbarem Blatt { title, subject, questions } im Upload-Format
  // (wie das JSON in architecture.md). Fehler nennen Blatt und Excel-Zeile.
  function parseQuestionSheets(arrayBuffer, fallbackTitle) {
    var workbook = XLSX.read(arrayBuffer, { type: "array" });
    var sets = [];
    var errors = [];

    workbook.SheetNames.forEach(function (name) {
      var rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "", blankrows: true });
      var headerIndex = -1;
      var title = "";
      var subject = "";
      for (var r = 0; r < rows.length; r++) {
        var label = cell(rows[r], 0).toLowerCase().replace(/:$/, "");
        if (label === "titel") title = cell(rows[r], 1);
        else if (label === "fach") subject = cell(rows[r], 1);
        else if (label === "frage" || label === "fragetext") {
          headerIndex = r;
          break;
        }
      }
      if (headerIndex === -1) return; // z.B. Blatt "Anleitung"

      var questions = [];
      var sheetErrors = [];
      for (var i = headerIndex + 1; i < rows.length; i++) {
        var row = rows[i];
        var text = cell(row, 0);
        var options = { A: cell(row, 1), B: cell(row, 2), C: cell(row, 3), D: cell(row, 4) };
        var correct = cell(row, 5).toUpperCase().replace(/[^A-D]/g, "");
        if (!text && !options.A && !options.B && !options.C && !options.D && !correct) continue;

        var excelRow = i + 1;
        var missing = [];
        if (!text) missing.push("Fragetext");
        LETTERS.forEach(function (l) {
          if (!options[l]) missing.push("Antwort " + l);
        });
        if (missing.length) {
          sheetErrors.push("Zeile " + excelRow + ": " + missing.join(", ") + " fehlt");
          continue;
        }
        if (correct.length !== 1) {
          sheetErrors.push("Zeile " + excelRow + ": richtige Antwort muss A, B, C oder D sein");
          continue;
        }
        questions.push({ text: text, options: options, correctAnswer: correct });
      }

      var setTitle = title || (workbook.SheetNames.length > 1 ? name : fallbackTitle || name);
      if (!subject) sheetErrors.unshift("Fach fehlt (Zelle neben „Fach“)");
      if (questions.length === 0 && sheetErrors.length === 0) sheetErrors.push("keine Fragen gefunden");

      if (sheetErrors.length) {
        errors.push("Blatt „" + name + "“: " + sheetErrors.join("; "));
      } else {
        sets.push({ title: setTitle, subject: subject, questions: questions });
      }
    });

    if (sets.length === 0 && errors.length === 0) {
      errors.push("Keine Fragen gefunden. Bitte die Vorlage verwenden (Kopfzeile mit „Frage“ in Spalte A).");
    }
    return { sets: sets, errors: errors };
  }

  // --- Quiz-Ergebnisse -----------------------------------------------------

  // Lädt alles, was zur Auswertung einer Sitzung gehört.
  function loadSessionData(sessionId, lookups) {
    return Promise.all([Store.getSession(sessionId), Store.listAnswerRecordsForSession(sessionId)]).then(
      function (results) {
        var session = results[0];
        var records = results[1];
        return Store.getQuestionSetWithQuestions(session.questionSetId).then(function (questionSet) {
          questionSet = questionSet || { title: "?", questions: [] };
          var cards = {};
          records.forEach(function (r) {
            cards[r.cardId] = cards[r.cardId] || {};
            cards[r.cardId][r.questionId] = r.answer;
          });
          return {
            session: session,
            questionSet: questionSet,
            subject: (lookups.subjects[session.subjectId] || {}).name || "",
            className: (lookups.classes[session.classId] || {}).name || "",
            date: formatDate(session.date),
            records: records,
            cardIds: Object.keys(cards)
              .map(Number)
              .sort(function (a, b) {
                return a - b;
              }),
            cards: cards,
          };
        });
      }
    );
  }

  function loadLookups() {
    return Promise.all([Store.listSubjects(), Store.listClassGroups()]).then(function (results) {
      var index = function (items) {
        var map = {};
        items.forEach(function (i) {
          map[i.id] = i;
        });
        return map;
      };
      return { subjects: index(results[0]), classes: index(results[1]) };
    });
  }

  function questionRows(d) {
    var rows = [
      ["Fragenset", d.questionSet.title],
      ["Fach", d.subject],
      ["Klasse", d.className],
      ["Datum", d.date],
      ["Teilnehmende Karten", d.cardIds.length],
      [],
      ["Nr.", "Frage", "Richtige Antwort", "A", "B", "C", "D", "Richtig", "Antworten", "% richtig"],
    ];
    d.questionSet.questions.forEach(function (q, i) {
      var counts = { A: 0, B: 0, C: 0, D: 0 };
      var total = 0;
      d.records.forEach(function (r) {
        if (r.questionId !== q.id) return;
        counts[r.answer] = (counts[r.answer] || 0) + 1;
        total++;
      });
      var correct = counts[q.correctAnswer] || 0;
      rows.push([
        i + 1,
        q.text,
        q.correctAnswer + ": " + q["option" + q.correctAnswer],
        counts.A,
        counts.B,
        counts.C,
        counts.D,
        correct,
        total,
        percent(correct, total),
      ]);
    });
    return rows;
  }

  function cardRows(d) {
    var questions = d.questionSet.questions;
    var header = ["Karte"];
    questions.forEach(function (q, i) {
      header.push("Frage " + (i + 1));
    });
    header.push("Richtig", "Beantwortet", "% richtig");
    var rows = [header];
    d.cardIds.forEach(function (cardId) {
      var answers = d.cards[cardId];
      var row = [cardId];
      var correct = 0;
      var answered = 0;
      questions.forEach(function (q) {
        var a = answers[q.id] || "";
        row.push(a);
        if (a) answered++;
        if (a && a === q.correctAnswer) correct++;
      });
      row.push(correct, answered, percent(correct, answered));
      rows.push(row);
    });
    var key = ["Richtige Antwort"];
    questions.forEach(function (q) {
      key.push(q.correctAnswer);
    });
    rows.push([], key);
    return rows;
  }

  function exportSession(sessionId) {
    return loadLookups()
      .then(function (lookups) {
        return loadSessionData(sessionId, lookups);
      })
      .then(function (d) {
        var workbook = XLSX.utils.book_new();
        var used = {};
        addSheet(workbook, "Fragen", questionRows(d), [8, 60, 30, 6, 6, 6, 6, 9, 10, 10], used);
        addSheet(
          workbook,
          "Karten",
          cardRows(d),
          [16].concat(d.questionSet.questions.map(function () {
            return 9;
          }), [9, 12, 10]),
          used
        );
        download(
          workbook,
          "ergebnis-" +
            fileSafe(d.questionSet.title) +
            (d.className ? "-" + fileSafe(d.className) : "") +
            "-" +
            d.session.date.slice(0, 10) +
            ".xlsx"
        );
      });
  }

  // Mehrere Sitzungen (z.B. alle gefilterten): Übersicht + alle Einzelantworten
  // in einer langen Tabelle, die sich in Excel gut filtern lässt.
  function exportSessions(sessionIds) {
    if (sessionIds.length === 0) return Promise.reject(new Error("Keine Quiz-Ergebnisse vorhanden."));
    return loadLookups()
      .then(function (lookups) {
        return Promise.all(
          sessionIds.map(function (id) {
            return loadSessionData(id, lookups);
          })
        );
      })
      .then(function (all) {
        all.sort(function (a, b) {
          return new Date(a.session.date) - new Date(b.session.date);
        });
        var overview = [["Datum", "Fach", "Klasse", "Fragenset", "Fragen", "Karten", "Antworten", "Richtig", "% richtig", "Beendet"]];
        var answers = [["Datum", "Fach", "Klasse", "Fragenset", "Nr.", "Frage", "Karte", "Antwort", "Richtige Antwort", "Richtig?"]];
        all.forEach(function (d) {
          var correctTotal = 0;
          var position = {};
          d.questionSet.questions.forEach(function (q, i) {
            position[q.id] = { nr: i + 1, q: q };
          });
          var sorted = d.records.slice().sort(function (a, b) {
            var pa = (position[a.questionId] || {}).nr || 0;
            var pb = (position[b.questionId] || {}).nr || 0;
            return pa - pb || a.cardId - b.cardId;
          });
          sorted.forEach(function (r) {
            var p = position[r.questionId];
            if (!p) return;
            var ok = r.answer === p.q.correctAnswer;
            if (ok) correctTotal++;
            answers.push([d.date, d.subject, d.className, d.questionSet.title, p.nr, p.q.text, r.cardId, r.answer, p.q.correctAnswer, ok ? "ja" : "nein"]);
          });
          overview.push([
            d.date,
            d.subject,
            d.className,
            d.questionSet.title,
            d.questionSet.questions.length,
            d.cardIds.length,
            d.records.length,
            correctTotal,
            percent(correctTotal, d.records.length),
            d.session.status === "completed" ? "ja" : "nein",
          ]);
        });

        var workbook = XLSX.utils.book_new();
        var used = {};
        addSheet(workbook, "Übersicht", overview, [16, 16, 10, 36, 8, 8, 10, 8, 10, 8], used);
        addSheet(workbook, "Alle Antworten", answers, [16, 16, 10, 36, 5, 60, 7, 8, 16, 9], used);
        download(workbook, "quiz-ergebnisse-" + today() + ".xlsx");
        return all.length;
      });
  }

  return {
    downloadTemplate: downloadTemplate,
    exportQuestionSet: exportQuestionSet,
    exportAllQuestionSets: exportAllQuestionSets,
    parseQuestionSheets: parseQuestionSheets,
    exportSession: exportSession,
    exportSessions: exportSessions,
  };
})();
