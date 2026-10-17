/* Statistik-Ansicht: Sitzungen nach Fach/Klasse filtern, Ergebnisse je Frage
   anzeigen, exportieren (F6) und Wiederholungssets vorschlagen (F9). */
var StatsView = (function () {
  var currentSessionId = null;
  var currentSessionDetail = null; // { session, questionSet, rows: [{question, counts, correctCount, total}] }
  var listedSessionIds = [];

  function populateFilters() {
    Promise.all([Store.listSubjects(), Store.listClassGroups()]).then(
      function (results) {
        fillSelect("statsSubjectSelect", results[0]);
        fillSelect("statsClassSelect", results[1]);
      }
    );
  }

  function fillSelect(elementId, items) {
    var select = document.getElementById(elementId);
    if (!select) return;
    var previousValue = select.value;
    select.innerHTML =
      '<option value="">Alle</option>' +
      items
        .map(function (item) {
          return '<option value="' + item.id + '">' + item.name + "</option>";
        })
        .join("");
    select.value = previousValue;
  }

  document.addEventListener("nnq:questionsets-changed", populateFilters);

  function loadSessions() {
    var subjectId = document.getElementById("statsSubjectSelect").value;
    var classId = document.getElementById("statsClassSelect").value;

    Promise.all([
      Store.listSessions({
        subjectId: subjectId || undefined,
        classId: classId || undefined,
      }),
      Store.listSubjects(),
      Store.listClassGroups(),
      Store.listQuestionSets({ includeDeleted: true }),
    ]).then(function (results) {
      var sessions = results[0];
      var subjectById = indexBy(results[1]);
      var classById = indexBy(results[2]);
      var setById = indexBy(results[3]);

      renderCumulative();
      var list = document.getElementById("statsSessionList");
      listedSessionIds = sessions.map(function (s) {
        return s.id;
      });
      var allButton = document.getElementById("statsExportAllBtn");
      if (allButton) allButton.hidden = sessions.length === 0;
      if (sessions.length === 0) {
        list.innerHTML =
          '<p class="empty">Noch keine Quiz-Ergebnisse. Sie erscheinen hier, sobald ein Quiz gespielt wurde.</p>';
        return;
      }

      sessions.sort(function (a, b) {
        return new Date(b.date) - new Date(a.date);
      });

      list.innerHTML = sessions
        .map(function (s) {
          var dateLabel = new Date(s.date).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
          var subjectName = (subjectById[s.subjectId] || {}).name || "?";
          var className = (classById[s.classId] || {}).name || "?";
          var setTitle = (setById[s.questionSetId] || {}).title || "?";
          return (
            '<div class="list-item clickable' +
            (s.id === currentSessionId ? " selected" : "") +
            '" onclick="StatsView.selectSession(\'' +
            s.id +
            "')\"><div class=\"grow\"><strong>" +
            escapeHtml(setTitle) +
            "</strong>" +
            (s.status === "completed" ? "" : '<span class="badge">nicht beendet</span>') +
            '<div class="sub">' +
            escapeHtml(subjectName) +
            " · Klasse " +
            escapeHtml(className) +
            " · " +
            dateLabel +
            "</div></div><span aria-hidden=\"true\">›</span></div>"
          );
        })
        .join("");
    });
  }

  function indexBy(items) {
    var map = {};
    items.forEach(function (item) {
      map[item.id] = item;
    });
    return map;
  }

  function selectSession(sessionId) {
    currentSessionId = sessionId;
    document.getElementById("statsReviewCandidates").innerHTML = "";
    document.getElementById("statsExportMessage").textContent = "";
    loadSessions();

    Analysis.load().then(function (model) {
      var e = Analysis.entry(model, sessionId);
      if (!e) return;
      currentSessionDetail = {
        session: e.session,
        questionSet: e.set,
        entry: e,
        rows: e.asked.map(function (q) {
          var st = e.stats[q.id];
          return { question: q, counts: st.counts, correctCount: st.correct, total: st.total };
        }),
      };
      renderDetail();
    });
  }

  function countCell(row, letter) {
    var isCorrect = row.question.correctAnswer === letter;
    return (
      '<td class="num' + (isCorrect ? ' correct-col" title="richtige Antwort' : "") + '">' +
      row.counts[letter] +
      "</td>"
    );
  }

  function renderDetail() {
    var container = document.getElementById("statsSessionDetail");
    if (!container || !currentSessionDetail) return;
    var d = currentSessionDetail;
    var e = d.entry;

    var sum = { A: 0, B: 0, C: 0, D: 0, correct: 0, total: 0 };
    var rowsHtml = d.rows
      .map(function (row, i) {
        Analysis.LETTERS.forEach(function (l) {
          sum[l] += row.counts[l];
        });
        sum.correct += row.correctCount;
        sum.total += row.total;
        return (
          "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(row.question.text) + "</td>" +
          Analysis.LETTERS.map(function (l) {
            return countCell(row, l);
          }).join("") +
          '<td class="num">' + row.correctCount + "/" + row.total + "</td>" +
          '<td class="num">' + Analysis.formatPercent(row.total ? row.correctCount / row.total : null) + "</td></tr>"
        );
      })
      .join("");

    var totalRow =
      '<tr class="sum-row"><td></td><td>Gesamt</td>' +
      Analysis.LETTERS.map(function (l) {
        return '<td class="num">' + sum[l] + "</td>";
      }).join("") +
      '<td class="num">' + sum.correct + "/" + sum.total + "</td>" +
      '<td class="num">' + Analysis.formatPercent(sum.total ? sum.correct / sum.total : null) + "</td></tr>";

    // Richtig/falsch je Karte
    var cardHeader =
      "<tr><th>Karte</th>" +
      d.rows.map(function (row, i) {
        return '<th class="num" title="' + escapeHtml(row.question.text) + '">' + (i + 1) + "</th>";
      }).join("") +
      '<th class="num">Richtig</th></tr>';
    var cardRows = e.cardIds
      .map(function (cardId) {
        var answers = e.cards[cardId];
        var res = Analysis.cardResult(e, cardId);
        return (
          "<tr><td>" + cardId + "</td>" +
          d.rows.map(function (row) {
            var a = answers[row.question.id];
            if (!a) return '<td class="num muted">–</td>';
            var ok = a === row.question.correctAnswer;
            return '<td class="num ' + (ok ? "ok" : "bad") + '">' + a + (ok ? " ✓" : " ✗") + "</td>";
          }).join("") +
          '<td class="num">' + res.correct + "/" + res.answered + "</td></tr>"
        );
      })
      .join("");

    container.innerHTML =
      "<h3>" + escapeHtml(d.questionSet.title) + "</h3>" +
      '<p class="hint">' + escapeHtml(e.subject) + " · Klasse " + escapeHtml(e.className) + " · " +
      e.date.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) + "</p>" +
      (d.rows.length === 0
        ? '<p class="empty">In diesem Quiz wurde noch keine Frage abgeschlossen.</p>'
        : '<div class="table-wrap"><table class="stats-table">' +
          '<tr><th>#</th><th>Frage</th><th class="num">A</th><th class="num">B</th><th class="num">C</th><th class="num">D</th><th class="num">Richtig</th><th class="num">%</th></tr>' +
          rowsHtml + totalRow +
          "</table></div>" +
          '<p class="hint">Die richtige Antwort ist grün hinterlegt.</p>' +
          "<h3 style=\"margin-top:18px;\">Richtig / falsch pro Karte</h3>" +
          (e.cardIds.length
            ? '<div class="table-wrap"><table class="stats-table card-table">' + cardHeader + cardRows + "</table></div>"
            : '<p class="empty">Keine Antworten gespeichert.</p>'));

    var card = document.getElementById("statsDetailCard");
    if (card) {
      card.hidden = false;
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // --- Fragen über alle Quiz (kumuliert) ----------------------------------

  function currentFilter() {
    return {
      subjectId: document.getElementById("statsSubjectSelect").value || undefined,
      classId: document.getElementById("statsClassSelect").value || undefined,
      questionSetId: document.getElementById("statsSetSelect").value || undefined,
    };
  }

  function renderCumulative() {
    var container = document.getElementById("statsCumulative");
    if (!container) return;
    var filter = currentFilter();
    Promise.all([Analysis.load(), Store.listQuestionSets()]).then(function (results) {
      var model = results[0];
      var setSelect = document.getElementById("statsSetSelect");
      var previous = setSelect.value;
      var sets = results[1].slice().sort(function (a, b) {
        return a.title.localeCompare(b.title, "de");
      });
      setSelect.innerHTML =
        '<option value="">Alle gestellten Fragen</option>' +
        sets.map(function (s) {
          return '<option value="' + s.id + '">' + escapeHtml(s.title) + "</option>";
        }).join("");
      setSelect.value = previous;
      filter.questionSetId = setSelect.value || undefined;

      var rows = Analysis.questionSummary(model, filter);
      if (rows.length === 0) {
        container.innerHTML = '<p class="empty">Noch keine Fragen gestellt.</p>';
        return;
      }
      container.innerHTML =
        '<div class="table-wrap"><table class="stats-table">' +
        '<tr><th>Frage</th><th class="num">A</th><th class="num">B</th><th class="num">C</th><th class="num">D</th><th class="num">%</th><th>Gestellt</th></tr>' +
        rows.map(function (r) {
          var row = { question: r.question, counts: r.counts };
          return (
            "<tr><td>" + escapeHtml(r.question.text) +
            (filter.questionSetId || r.setTitles.length === 0 ? "" : '<div class="sub">' + escapeHtml(r.setTitles.join(", ")) + "</div>") +
            "</td>" +
            Analysis.LETTERS.map(function (l) {
              return countCell(row, l);
            }).join("") +
            '<td class="num">' + Analysis.formatPercent(r.rate) + "</td>" +
            '<td class="asked">' +
            (r.askings.length
              ? r.askings.map(function (a) {
                  var cls = a.rate === null ? "" : a.rate >= Analysis.SUCCESS_RATE ? " ok" : " bad";
                  return '<span class="chip' + cls + '">' + escapeHtml(Analysis.askingLabel(a, true)) + "</span>";
                }).join(" ")
              : '<span class="badge">neu</span>') +
            "</td></tr>"
          );
        }).join("") +
        "</table></div>" +
        '<p class="hint">A–D: wie oft die Antwort insgesamt gewählt wurde (richtige grün). ' +
        "Gestellt: Klasse, Datum und Anteil richtig – grün ab " + Math.round(Analysis.SUCCESS_RATE * 100) + " %.</p>";
    });
  }

  function exportClassFiles() {
    var el = document.getElementById("statsListMessage");
    var classId = document.getElementById("statsClassSelect").value;
    var subjectId = document.getElementById("statsSubjectSelect").value;
    ExcelIO.exportClasses({ classId: classId || undefined, subjectId: subjectId || undefined })
      .then(function (count) {
        if (el) {
          el.textContent = count > 1 ? count + " Excel-Dateien heruntergeladen (eine pro Klasse)." : "";
          el.style.color = "green";
        }
      })
      .catch(function (err) {
        if (el) {
          el.textContent = err.message;
          el.style.color = "crimson";
        }
      });
  }

  function buildHtmlTable() {
    var d = currentSessionDetail;
    var rowsHtml = d.rows
      .map(function (row, i) {
        var q = row.question;
        return (
          "<tr>" +
          "<td>" +
          (i + 1) +
          "</td><td>" +
          escapeHtml(q.text) +
          "</td><td>" +
          row.counts.A +
          "</td><td>" +
          row.counts.B +
          "</td><td>" +
          row.counts.C +
          "</td><td>" +
          row.counts.D +
          "</td><td>" +
          row.correctCount +
          "/" +
          row.total +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    return (
      "<table><tr><th>#</th><th>Frage</th><th>A</th><th>B</th><th>C</th><th>D</th><th>Richtig</th></tr>" +
      rowsHtml +
      "</table>"
    );
  }

  function buildCsv() {
    var d = currentSessionDetail;
    var lines = ["#;Frage;A;B;C;D;Richtig"];
    d.rows.forEach(function (row, i) {
      var q = row.question;
      lines.push(
        [
          i + 1,
          Exporter.csvEscape(q.text),
          row.counts.A,
          row.counts.B,
          row.counts.C,
          row.counts.D,
          row.correctCount + "/" + row.total,
        ].join(";")
      );
    });
    return lines.join("\n");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exportClipboard() {
    if (!currentSessionDetail) return;
    var html = buildHtmlTable();
    var text = currentSessionDetail.rows
      .map(function (row) {
        return row.question.text + ": A=" + row.counts.A + " B=" + row.counts.B +
          " C=" + row.counts.C + " D=" + row.counts.D;
      })
      .join("\n");

    Exporter.copyHtmlTable(html, text)
      .then(function () {
        setExportMessage(
          "In Zwischenablage kopiert – jetzt in OneNote einfügen (Strg+V).",
          false
        );
      })
      .catch(function (err) {
        setExportMessage(err.message, true);
      });
  }

  function exportCsv() {
    if (!currentSessionDetail) return;
    Exporter.downloadCsv(
      "ergebnisse-" + currentSessionDetail.session.id + ".csv",
      buildCsv()
    );
  }

  function exportExcel() {
    if (!currentSessionId) return;
    ExcelIO.exportSession(currentSessionId).catch(function (err) {
      setExportMessage(err.message, true);
    });
  }

  function exportAllExcel() {
    var el = document.getElementById("statsListMessage");
    ExcelIO.exportSessions(listedSessionIds)
      .then(function () {
        if (el) el.textContent = "";
      })
      .catch(function (err) {
        if (el) {
          el.textContent = err.message;
          el.style.color = "crimson";
        }
      });
  }

  function setExportMessage(text, isError) {
    var el = document.getElementById("statsExportMessage");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "crimson" : "green";
  }

  // --- Wiederholung (F9) --------------------------------------------------

  function suggestReview() {
    if (!currentSessionId) return;
    Review.suggestCandidates(currentSessionId).then(function (candidates) {
      var container = document.getElementById("statsReviewCandidates");
      if (candidates.length === 0) {
        container.innerHTML =
          "<p>Keine Frage über der Fehlerquote-Schwelle (" +
          Math.round(Review.DEFAULT_THRESHOLD * 100) +
          "%).</p>";
        return;
      }

      container.innerHTML =
        candidates
          .map(function (c) {
            return (
              '<label style="display:block;"><input type="checkbox" class="review-candidate" value="' +
              c.question.id +
              '" checked> ' +
              c.question.text +
              " (Fehlerquote " +
              Math.round(c.errorRate * 100) +
              "%)</label>"
            );
          })
          .join("") +
        '<button type="button" onclick="StatsView.createReviewSet()">Wiederholungsset erstellen</button>';
    });
  }

  function createReviewSet() {
    var checked = document.querySelectorAll(".review-candidate:checked");
    var questionIds = Array.prototype.map.call(checked, function (el) {
      return el.value;
    });

    Review.createReviewQuestionSet(currentSessionId, questionIds)
      .then(function (questionSet) {
        document.getElementById("statsReviewCandidates").innerHTML =
          'Wiederholungsset "' + questionSet.title + '" wurde angelegt.';
        document.dispatchEvent(new CustomEvent("nnq:questionsets-changed"));
      })
      .catch(function (err) {
        alert("Konnte Wiederholungsset nicht erstellen: " + err.message);
      });
  }

  return {
    populateFilters: populateFilters,
    loadSessions: loadSessions,
    selectSession: selectSession,
    exportClipboard: exportClipboard,
    exportCsv: exportCsv,
    exportExcel: exportExcel,
    exportClassFiles: exportClassFiles,
    renderCumulative: renderCumulative,
    exportAllExcel: exportAllExcel,
    suggestReview: suggestReview,
    createReviewSet: createReviewSet,
  };
})();
