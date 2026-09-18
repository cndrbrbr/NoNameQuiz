/* Statistik-Ansicht: Sitzungen nach Fach/Klasse filtern, Ergebnisse je Frage
   anzeigen, exportieren (F6) und Wiederholungssets vorschlagen (F9). */
var StatsView = (function () {
  var currentSessionId = null;
  var currentSessionDetail = null; // { session, questionSet, rows: [{question, counts, correctCount, total}] }

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
      Store.listQuestionSets(),
    ]).then(function (results) {
      var sessions = results[0];
      var subjectById = indexBy(results[1]);
      var classById = indexBy(results[2]);
      var setById = indexBy(results[3]);

      var list = document.getElementById("statsSessionList");
      if (sessions.length === 0) {
        list.innerHTML = "<p>Keine Sitzungen gefunden.</p>";
        return;
      }

      list.innerHTML = sessions
        .map(function (s) {
          var dateLabel = new Date(s.date).toLocaleString();
          var subjectName = (subjectById[s.subjectId] || {}).name || "?";
          var className = (classById[s.classId] || {}).name || "?";
          var setTitle = (setById[s.questionSetId] || {}).title || "?";
          return (
            '<div style="border-bottom:1px solid #ddd;padding:4px 0;cursor:pointer;" ' +
            'onclick="StatsView.selectSession(\'' +
            s.id +
            "')\">" +
            dateLabel +
            " – " +
            subjectName +
            " / " +
            className +
            " – " +
            setTitle +
            " (" +
            (s.status === "completed" ? "abgeschlossen" : "läuft") +
            ")</div>"
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

    Promise.all([
      Store.getSession(sessionId),
      Store.listAnswerRecordsForSession(sessionId),
    ]).then(function (results) {
      var session = results[0];
      var records = results[1];

      Store.getQuestionSetWithQuestions(session.questionSetId).then(
        function (questionSet) {
          var rows = questionSet.questions.map(function (question) {
            var questionRecords = records.filter(function (r) {
              return r.questionId === question.id;
            });
            var counts = { A: 0, B: 0, C: 0, D: 0 };
            var correctCount = 0;
            questionRecords.forEach(function (r) {
              counts[r.answer] = (counts[r.answer] || 0) + 1;
              if (r.answer === question.correctAnswer) correctCount++;
            });
            return {
              question: question,
              counts: counts,
              correctCount: correctCount,
              total: questionRecords.length,
            };
          });

          currentSessionDetail = {
            session: session,
            questionSet: questionSet,
            rows: rows,
          };
          renderDetail();
        }
      );
    });
  }

  function renderDetail() {
    var container = document.getElementById("statsSessionDetail");
    if (!container || !currentSessionDetail) return;

    var rowsHtml = currentSessionDetail.rows
      .map(function (row, i) {
        var q = row.question;
        return (
          "<tr>" +
          "<td>" +
          (i + 1) +
          "</td><td>" +
          q.text +
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

    container.innerHTML =
      "<h4>" +
      currentSessionDetail.questionSet.title +
      "</h4>" +
      '<table border="1" cellpadding="4" style="border-collapse:collapse;">' +
      "<tr><th>#</th><th>Frage</th><th>A</th><th>B</th><th>C</th><th>D</th><th>Richtig</th></tr>" +
      rowsHtml +
      "</table>";
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
      .replace(/>/g, "&gt;");
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
    suggestReview: suggestReview,
    createReviewSet: createReviewSet,
  };
})();
