/* Fragenverwaltung: JSON-Upload + einfaches Formular (F1), siehe features.md. */
var QuestionEditor = (function () {
  var rowCounter = 0;
  var pendingOrigin = "manual";

  function notifyChanged() {
    document.dispatchEvent(new CustomEvent("nnq:questionsets-changed"));
  }

  function setMessage(text, isError) {
    var el = document.getElementById("qsMessage");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "crimson" : "green";
  }

  // --- JSON-Upload -----------------------------------------------------

  function validateUploadedSet(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Ungültiges JSON");
    }
    if (!data.title || !data.subject) {
      throw new Error("title und subject sind Pflichtfelder");
    }
    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("questions muss eine nicht-leere Liste sein");
    }
    data.questions.forEach(function (q, i) {
      if (!q.text || !q.options) {
        throw new Error("Frage " + (i + 1) + ": text/options fehlen");
      }
      ["A", "B", "C", "D"].forEach(function (letter) {
        if (!q.options[letter]) {
          throw new Error("Frage " + (i + 1) + ": Option " + letter + " fehlt");
        }
      });
      if (["A", "B", "C", "D"].indexOf(q.correctAnswer) === -1) {
        throw new Error(
          "Frage " + (i + 1) + ": correctAnswer muss A, B, C oder D sein"
        );
      }
    });
  }

  function saveUploadedSet(data, origin) {
    return Store.findOrCreateSubject(data.subject)
      .then(function (subject) {
        return Store.saveQuestionSet({
          title: data.title,
          subjectId: subject.id,
          origin: origin || "manual",
          questions: data.questions.map(function (q) {
            return {
              text: q.text,
              optionA: q.options.A,
              optionB: q.options.B,
              optionC: q.options.C,
              optionD: q.options.D,
              correctAnswer: q.correctAnswer,
            };
          }),
        });
      })
      .then(function (questionSet) {
        setMessage('Fragenset "' + questionSet.title + '" gespeichert.', false);
        notifyChanged();
        renderQuestionSetList();
        return questionSet;
      })
      .catch(function (err) {
        setMessage("Fehler beim Speichern: " + err.message, true);
        throw err;
      });
  }

  function handleJsonFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        validateUploadedSet(data);
        saveUploadedSet(data, "manual").catch(function () {});
      } catch (err) {
        setMessage("Fehler im JSON: " + err.message, true);
      }
    };
    reader.readAsText(file);
  }

  function loadSampleQuestionSet(url) {
    setMessage("Lade Beispiel-Fragenset …", false);
    fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error("Konnte " + url + " nicht laden");
        return response.json();
      })
      .then(function (data) {
        validateUploadedSet(data);
        return saveUploadedSet(data, "manual");
      })
      .catch(function (err) {
        setMessage("Fehler: " + err.message, true);
      });
  }

  // --- Manuelles Formular ------------------------------------------------

  function addQuestionRow() {
    rowCounter++;
    var container = document.getElementById("qsQuestionsContainer");
    if (!container) return;

    var rowId = "qsRow" + rowCounter;
    var row = document.createElement("div");
    row.id = rowId;
    row.className = "qs-question-row";
    row.style.cssText =
      "border:1px solid #ccc;padding:8px;margin:6px 0;text-align:left;";

    row.innerHTML =
      '<input type="text" class="qs-text" placeholder="Fragetext" style="width:95%;margin-bottom:4px;">' +
      ["A", "B", "C", "D"]
        .map(function (letter) {
          return (
            '<div style="margin:2px 0;">' +
            '<input type="radio" name="correct-' +
            rowId +
            '" class="qs-correct" value="' +
            letter +
            '"> ' +
            letter +
            ": " +
            '<input type="text" class="qs-option-' +
            letter +
            '" placeholder="Antwort ' +
            letter +
            '" style="width:70%;">' +
            "</div>"
          );
        })
        .join("") +
      '<button type="button" onclick="QuestionEditor.removeQuestionRow(\'' +
      rowId +
      "')\">Frage entfernen</button>";

    container.appendChild(row);
  }

  function removeQuestionRow(rowId) {
    var row = document.getElementById(rowId);
    if (row) row.remove();
  }

  function collectFormQuestions() {
    var rows = document.querySelectorAll(".qs-question-row");
    var questions = [];
    rows.forEach(function (row) {
      var text = row.querySelector(".qs-text").value.trim();
      var correctEl = row.querySelector(".qs-correct:checked");
      var optionA = row.querySelector(".qs-option-A").value.trim();
      var optionB = row.querySelector(".qs-option-B").value.trim();
      var optionC = row.querySelector(".qs-option-C").value.trim();
      var optionD = row.querySelector(".qs-option-D").value.trim();

      if (!text || !optionA || !optionB || !optionC || !optionD || !correctEl) {
        throw new Error(
          "Bitte alle Felder (Frage, A-D, richtige Antwort) ausfüllen."
        );
      }

      questions.push({
        text: text,
        optionA: optionA,
        optionB: optionB,
        optionC: optionC,
        optionD: optionD,
        correctAnswer: correctEl.value,
      });
    });

    if (questions.length === 0) {
      throw new Error("Mindestens eine Frage hinzufügen.");
    }
    return questions;
  }

  function saveManualQuestionSet() {
    var title = document.getElementById("qsTitle").value.trim();
    var subjectName = document.getElementById("qsSubject").value.trim();

    if (!title || !subjectName) {
      setMessage("Titel und Fach sind Pflichtfelder.", true);
      return;
    }

    var questions;
    try {
      questions = collectFormQuestions();
    } catch (err) {
      setMessage(err.message, true);
      return;
    }

    var origin = pendingOrigin;

    Store.findOrCreateSubject(subjectName)
      .then(function (subject) {
        return Store.saveQuestionSet({
          title: title,
          subjectId: subject.id,
          origin: origin,
          questions: questions,
        });
      })
      .then(function (questionSet) {
        setMessage('Fragenset "' + questionSet.title + '" gespeichert.', false);
        document.getElementById("qsTitle").value = "";
        document.getElementById("qsSubject").value = "";
        document.getElementById("qsQuestionsContainer").innerHTML = "";
        pendingOrigin = "manual";
        notifyChanged();
        renderQuestionSetList();
      })
      .catch(function (err) {
        setMessage("Fehler beim Speichern: " + err.message, true);
      });
  }

  // --- Übernahme eines KI-Vorschlags (F8) in das manuelle Formular -------
  // Die KI liefert einen Entwurf im Upload-Format (siehe ai-service.js); er
  // landet im selben Formular wie die manuelle Eingabe, damit die Lehrkraft
  // ihn vor dem Speichern sichten/bearbeiten kann (Anforderung aus F8).

  function prefillFromAi(questionSetDraft) {
    document.getElementById("qsTitle").value = questionSetDraft.title || "";
    document.getElementById("qsSubject").value = questionSetDraft.subject || "";
    document.getElementById("qsQuestionsContainer").innerHTML = "";

    (questionSetDraft.questions || []).forEach(function (q) {
      addQuestionRow();
      var rows = document.querySelectorAll(".qs-question-row");
      var row = rows[rows.length - 1];
      row.querySelector(".qs-text").value = q.text || "";
      ["A", "B", "C", "D"].forEach(function (letter) {
        row.querySelector(".qs-option-" + letter).value =
          (q.options && q.options[letter]) || "";
      });
      if (q.correctAnswer) {
        var radio = row.querySelector('.qs-correct[value="' + q.correctAnswer + '"]');
        if (radio) radio.checked = true;
      }
    });

    pendingOrigin = "ai";
    document.getElementById("viewFragen").scrollIntoView({ behavior: "smooth" });
  }

  // --- Liste bestehender Fragensets -------------------------------------

  function renderQuestionSetList() {
    var container = document.getElementById("qsList");
    if (!container) return;

    Promise.all([Store.listQuestionSets(), Store.listSubjects()]).then(
      function (results) {
        var sets = results[0];
        var subjects = results[1];
        var subjectById = {};
        subjects.forEach(function (s) {
          subjectById[s.id] = s.name;
        });

        if (sets.length === 0) {
          container.innerHTML = "<p>Noch keine Fragensets vorhanden.</p>";
          return;
        }

        sets.sort(function (a, b) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        container.innerHTML = sets
          .map(function (set) {
            var subjectName = subjectById[set.subjectId] || "?";
            var originLabel =
              set.origin === "review"
                ? " (Wiederholung)"
                : set.origin === "ai"
                ? " (KI)"
                : "";
            return (
              "<div style='border-bottom:1px solid #ddd;padding:4px 0;'>" +
              "<strong>" +
              set.title +
              "</strong> – " +
              subjectName +
              originLabel +
              "</div>"
            );
          })
          .join("");
      }
    );
  }

  document.addEventListener("nnq:questionsets-changed", renderQuestionSetList);

  return {
    handleJsonFile: handleJsonFile,
    loadSampleQuestionSet: loadSampleQuestionSet,
    addQuestionRow: addQuestionRow,
    removeQuestionRow: removeQuestionRow,
    saveManualQuestionSet: saveManualQuestionSet,
    prefillFromAi: prefillFromAi,
    renderQuestionSetList: renderQuestionSetList,
  };
})();
