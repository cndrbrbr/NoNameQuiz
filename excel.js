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

  // Ungespeicherter Stand aus dem Editor (z.B. KI-Vorschlag) – zum Prüfen und
  // Bearbeiten in Excel, danach normal hochladen.
  function exportDraft(title, subject, questions) {
    var workbook = XLSX.utils.book_new();
    addSheet(workbook, title || "Fragenset", questionSetRows(title, subject, questions), QUESTION_COLS, { anleitung: true }, 0);
    download(workbook, "fragenset-" + fileSafe(title || "entwurf") + ".xlsx");
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

  // --- Quiz-Ergebnisse (Daten aus analysis.js) ------------------------------

  function shortDate(date) {
    return Analysis.formatDate(date);
  }

  function pct(rate) {
    return rate === null || rate === undefined ? "" : Math.round(rate * 100);
  }

  // Je Frage eines Quiz: A–D, richtig, % – plus Gesamtzeile.
  function questionRows(e) {
    var rows = [
      ["Fragenset", e.set.title],
      ["Fach", e.subject],
      ["Klasse", e.className],
      ["Datum", formatDate(e.session.date)],
      ["Teilnehmende Karten", e.cardIds.length],
      [],
      ["Nr.", "Frage", "Richtige Antwort", "A", "B", "C", "D", "Richtig", "Antworten", "% richtig"],
    ];
    var sum = { A: 0, B: 0, C: 0, D: 0, correct: 0, total: 0 };
    e.asked.forEach(function (q, i) {
      var st = e.stats[q.id];
      Analysis.LETTERS.forEach(function (l) {
        sum[l] += st.counts[l];
      });
      sum.correct += st.correct;
      sum.total += st.total;
      rows.push([
        i + 1,
        q.text,
        q.correctAnswer + ": " + q["option" + q.correctAnswer],
        st.counts.A,
        st.counts.B,
        st.counts.C,
        st.counts.D,
        st.correct,
        st.total,
        percent(st.correct, st.total),
      ]);
    });
    rows.push(["", "Gesamt", "", sum.A, sum.B, sum.C, sum.D, sum.correct, sum.total, percent(sum.correct, sum.total)]);
    return rows;
  }

  // Je Karte eines Quiz: Antwort mit ✓/✗ je Frage.
  function cardRows(e) {
    var header = ["Karte"];
    e.asked.forEach(function (q, i) {
      header.push("Frage " + (i + 1));
    });
    header.push("Richtig", "Beantwortet", "% richtig");
    var rows = [header];
    e.cardIds.forEach(function (cardId) {
      var answers = e.cards[cardId];
      var res = Analysis.cardResult(e, cardId);
      var row = [cardId];
      e.asked.forEach(function (q) {
        var a = answers[q.id];
        row.push(a ? a + (a === q.correctAnswer ? " ✓" : " ✗") : "");
      });
      row.push(res.correct, res.answered, percent(res.correct, res.answered));
      rows.push(row);
    });
    var key = ["Richtige Antwort"];
    e.asked.forEach(function (q) {
      key.push(q.correctAnswer);
    });
    rows.push([], key);
    return rows;
  }

  function cardCols(e) {
    return [16].concat(
      e.asked.map(function () {
        return 9;
      }),
      [9, 12, 10]
    );
  }

  // Kumuliert je Frage, mit Liste wann sie welcher Klasse gestellt wurde.
  function cumulativeRows(model, filter, withClass) {
    var rows = [["Frage", "Fragenset", "Richtige Antwort", "A", "B", "C", "D", "Richtig", "Antworten", "% richtig", "Wie oft gestellt", "Gestellt"]];
    Analysis.questionSummary(model, filter).forEach(function (r) {
      var q = r.question;
      rows.push([
        q.text,
        r.setTitles.join(", "),
        q.correctAnswer + ": " + q["option" + q.correctAnswer],
        r.counts.A,
        r.counts.B,
        r.counts.C,
        r.counts.D,
        r.correct,
        r.total,
        pct(r.rate),
        r.askings.length,
        r.askings
          .map(function (a) {
            return Analysis.askingLabel(a, withClass);
          })
          .join(", "),
      ]);
    });
    return rows;
  }
  var CUMULATIVE_COLS = [60, 28, 28, 6, 6, 6, 6, 9, 10, 10, 10, 50];

  function overviewRows(entries, withClass) {
    var rows = [["Datum", "Fach"].concat(withClass ? ["Klasse"] : [], ["Fragenset", "Fragen", "Karten", "Antworten", "Richtig", "% richtig", "Beendet"])];
    entries.forEach(function (e) {
      var correct = 0;
      var total = 0;
      e.asked.forEach(function (q) {
        correct += e.stats[q.id].correct;
        total += e.stats[q.id].total;
      });
      rows.push(
        [formatDate(e.session.date), e.subject].concat(withClass ? [e.className] : [], [
          e.set.title,
          e.asked.length,
          e.cardIds.length,
          total,
          correct,
          percent(correct, total),
          e.session.status === "completed" ? "ja" : "nein",
        ])
      );
    });
    return rows;
  }

  function answerRows(entries) {
    var rows = [["Datum", "Fach", "Klasse", "Fragenset", "Nr.", "Frage", "Karte", "Antwort", "Richtige Antwort", "Richtig?"]];
    entries.forEach(function (e) {
      e.asked.forEach(function (q, i) {
        e.cardIds.forEach(function (cardId) {
          var a = e.cards[cardId][q.id];
          if (!a) return;
          rows.push([formatDate(e.session.date), e.subject, e.className, e.set.title, i + 1, q.text, cardId, a, q.correctAnswer, a === q.correctAnswer ? "ja" : "nein"]);
        });
      });
    });
    return rows;
  }
  var ANSWER_COLS = [16, 16, 10, 36, 5, 60, 7, 8, 16, 9];

  function exportSession(sessionId) {
    return Analysis.load().then(function (model) {
      var e = Analysis.entry(model, sessionId);
      if (!e) throw new Error("Quiz nicht gefunden.");
      var workbook = XLSX.utils.book_new();
      var used = {};
      addSheet(workbook, "Fragen", questionRows(e), [8, 60, 30, 6, 6, 6, 6, 9, 10, 10], used);
      addSheet(workbook, "Karten", cardRows(e), cardCols(e), used);
      download(
        workbook,
        "ergebnis-" +
          fileSafe(e.set.title) +
          (e.className ? "-" + fileSafe(e.className) : "") +
          "-" +
          e.session.date.slice(0, 10) +
          ".xlsx"
      );
    });
  }

  // Mehrere Quiz (z.B. alle gefilterten): Übersicht, Fragen kumuliert und alle
  // Einzelantworten in einer langen Tabelle, die sich in Excel gut filtern lässt.
  function exportSessions(sessionIds) {
    if (sessionIds.length === 0) return Promise.reject(new Error("Keine Quiz-Ergebnisse vorhanden."));
    return Analysis.load().then(function (model) {
      var filter = { sessionIds: sessionIds };
      var entries = model.entries.filter(function (e) {
        return sessionIds.indexOf(e.session.id) !== -1;
      });
      var workbook = XLSX.utils.book_new();
      var used = {};
      addSheet(workbook, "Übersicht", overviewRows(entries, true), [16, 16, 10, 36, 8, 8, 10, 8, 10, 8], used);
      addSheet(workbook, "Fragen kumuliert", cumulativeRows(model, filter, true), CUMULATIVE_COLS, used);
      addSheet(workbook, "Alle Antworten", answerRows(entries), ANSWER_COLS, used);
      download(workbook, "quiz-ergebnisse-" + today() + ".xlsx");
      return entries.length;
    });
  }

  // Eine Datei pro Klasse: Fragen kumuliert, Quiz-Übersicht, Karten über alle
  // Quiz, je Quiz ein Blatt mit richtig/falsch pro Karte, alle Antworten.
  function classWorkbook(model, classId, subjectId) {
    var filter = { classId: classId, subjectId: subjectId };
    var cs = Analysis.cardSummary(model, filter);
    var entries = cs.entries;
    var workbook = XLSX.utils.book_new();
    var used = {};

    addSheet(workbook, "Fragen", cumulativeRows(model, filter, false), CUMULATIVE_COLS, used);
    addSheet(workbook, "Quiz", overviewRows(entries, false), [16, 16, 36, 8, 8, 10, 8, 10, 8], used);

    var header = ["Karte"];
    entries.forEach(function (e) {
      header.push(shortDate(e.date) + " " + e.set.title);
    });
    header.push("Richtig gesamt", "Beantwortet", "% richtig");
    var cardTable = [header];
    cs.cards.forEach(function (c) {
      var row = [c.cardId];
      entries.forEach(function (e, i) {
        var r = c.perEntry[i];
        row.push(r ? r.correct + "/" + r.answered : "");
      });
      row.push(c.correct, c.answered, percent(c.correct, c.answered));
      cardTable.push(row);
    });
    cardTable.push([], ["Je Quiz: richtig/beantwortet. Leer = Karte war nicht dabei."]);
    addSheet(
      workbook,
      "Karten",
      cardTable,
      [16].concat(
        entries.map(function () {
          return 14;
        }),
        [14, 12, 10]
      ),
      used
    );

    entries.forEach(function (e) {
      var rows = [["Fragenset", e.set.title], ["Datum", formatDate(e.session.date)], []].concat(cardRows(e));
      rows.push([]);
      e.asked.forEach(function (q, i) {
        rows.push(["Frage " + (i + 1), q.text]);
      });
      addSheet(workbook, shortDate(e.date) + " " + e.set.title, rows, cardCols(e), used);
    });

    addSheet(workbook, "Alle Antworten", answerRows(entries), ANSWER_COLS, used);
    return { workbook: workbook, entries: entries };
  }

  // Genau die Ansicht "Fragen über alle Quiz" mit ihren Filtern.
  function exportCumulative(filter) {
    return Analysis.load().then(function (model) {
      var rows = cumulativeRows(model, filter, true);
      if (rows.length === 1) throw new Error("Noch keine Fragen gestellt.");
      var name = function (list, id) {
        var item = list.filter(function (i) {
          return i.id === id;
        })[0];
        return item ? item.name || item.title : "alle";
      };
      var info = [
        ["Fach", filter.subjectId ? name(model.subjects, filter.subjectId) : "alle"],
        ["Klasse", filter.classId ? name(model.classes, filter.classId) : "alle"],
        ["Fragenset", filter.questionSetId ? (model.setsById[filter.questionSetId] || {}).title : "alle gestellten Fragen"],
        ["Stand", formatDate(new Date().toISOString())],
        [],
      ];
      var workbook = XLSX.utils.book_new();
      addSheet(workbook, "Fragen kumuliert", info.concat(rows), CUMULATIVE_COLS, {});
      download(workbook, "fragen-kumuliert-" + today() + ".xlsx");
    });
  }

  // filter.classId gesetzt: eine Datei; sonst eine Datei für jede Klasse mit Quiz.
  function exportClasses(filter) {
    return Analysis.load().then(function (model) {
      var classIds = filter.classId
        ? [filter.classId]
        : model.entries
            .filter(function (e) {
              return !filter.subjectId || e.session.subjectId === filter.subjectId;
            })
            .map(function (e) {
              return e.classId;
            })
            .filter(function (id, i, all) {
              return all.indexOf(id) === i;
            });
      var files = classIds
        .map(function (classId) {
          var name = (model.classesById[classId] || {}).name || "ohne-klasse";
          var result = classWorkbook(model, classId, filter.subjectId);
          return { name: name, workbook: result.workbook, count: result.entries.length };
        })
        .filter(function (f) {
          return f.count > 0;
        });
      if (files.length === 0) throw new Error("Keine Quiz-Ergebnisse vorhanden.");

      // Nacheinander, sonst blockieren manche Browser mehrere Downloads.
      return files
        .reduce(function (chain, f, i) {
          return chain.then(function () {
            download(f.workbook, "klasse-" + fileSafe(f.name) + "-" + today() + ".xlsx");
            return i < files.length - 1
              ? new Promise(function (resolve) {
                  setTimeout(resolve, 600);
                })
              : null;
          });
        }, Promise.resolve())
        .then(function () {
          return files.length;
        });
    });
  }

  return {
    downloadTemplate: downloadTemplate,
    exportQuestionSet: exportQuestionSet,
    exportDraft: exportDraft,
    exportAllQuestionSets: exportAllQuestionSets,
    parseQuestionSheets: parseQuestionSheets,
    exportSession: exportSession,
    exportSessions: exportSessions,
    exportClasses: exportClasses,
    exportCumulative: exportCumulative,
    classWorkbook: classWorkbook,
  };
})();
