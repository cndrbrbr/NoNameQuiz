/* Verbindet die Scan-Ansicht mit Fach/Klasse/Fragenset/Session und der
   aktuell aktiven Frage. Persistiert Antworten beim Wechsel zur nächsten
   Frage. Siehe architecture.md, Abschnitt "Kopplung an bestehenden
   Scan-Code". */
var QuizRunner = (function () {
  var currentSession = null;
  var currentQuestions = [];
  var currentQuestionIndex = 0;
  var responses = {}; // cardId -> "A"|"B"|"C"|"D", nur für die aktuelle Frage

  function setMessage(text, isError) {
    var el = document.getElementById("scanMessage");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "crimson" : "inherit";
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function populateSelectors() {
    Promise.all([Store.listSubjects(), Store.listClassGroups()]).then(
      function (results) {
        fillDatalist("subjectsDatalist", results[0]);
        fillDatalist("classGroupsDatalist", results[1]);
      }
    );
    Store.listQuestionSets().then(function (sets) {
      var select = document.getElementById("scanQuestionSetSelect");
      if (!select) return;
      var previousValue = select.value;
      select.innerHTML =
        '<option value="">– Fragenset wählen –</option>' +
        sets
          .map(function (s) {
            return '<option value="' + s.id + '">' + escapeHtml(s.title) + "</option>";
          })
          .join("");
      if (previousValue) select.value = previousValue;
    });
  }

  function fillDatalist(elementId, items) {
    var el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = items
      .map(function (item) {
        return '<option value="' + item.name + '">';
      })
      .join("");
  }

  document.addEventListener("nnq:questionsets-changed", populateSelectors);

  function hasActiveSession() {
    return currentSession !== null;
  }

  function showSessionUi(active) {
    document.getElementById("scanSetupPanel").style.display = active ? "none" : "block";
    document.getElementById("scanSessionPanel").style.display = active ? "block" : "none";
    document.getElementById("questionDisplayPanel").style.display = active ? "block" : "none";
    var liveArea = document.getElementById("liveArea");
    if (liveArea) liveArea.hidden = !active;
    document.body.classList.toggle("quiz-active", active);
  }

  function getCurrentQuestion() {
    if (!hasActiveSession()) return null;
    return currentQuestions[currentQuestionIndex] || null;
  }

  function renderCurrentQuestion() {
    var question = getCurrentQuestion();
    var textEl = document.getElementById("questionText");
    var optionsEl = document.getElementById("questionOptionsDisplay");
    var progressEl = document.getElementById("questionProgress");
    if (!textEl || !optionsEl || !progressEl) return;

    if (!question) {
      textEl.textContent = "";
      optionsEl.innerHTML = "";
      progressEl.textContent = "";
      return;
    }

    textEl.textContent = question.text;
    optionsEl.innerHTML = ["A", "B", "C", "D"]
      .map(function (letter) {
        return (
          '<div class="opt"><span class="letter letter-' + letter + '">' + letter +
          "</span><span>" + escapeHtml(question["option" + letter]) + "</span></div>"
        );
      })
      .join("");
    progressEl.textContent =
      "Frage " + (currentQuestionIndex + 1) + " von " + currentQuestions.length;
  }

  function startSession() {
    var subjectName = document.getElementById("scanSubjectInput").value;
    var classGroupName = document.getElementById("scanClassInput").value;
    var questionSetId = document.getElementById("scanQuestionSetSelect").value;

    if (!subjectName.trim() || !classGroupName.trim() || !questionSetId) {
      setMessage("Bitte Fach, Klasse und Fragenset auswählen.", true);
      return;
    }

    Promise.all([
      Store.findOrCreateSubject(subjectName),
      Store.findOrCreateClassGroup(classGroupName),
      Store.getQuestionSetWithQuestions(questionSetId),
    ])
      .then(function (results) {
        var subject = results[0];
        var classGroup = results[1];
        var questionSet = results[2];

        if (!questionSet || questionSet.questions.length === 0) {
          throw new Error("Fragenset ist leer.");
        }

        return Store.createSession({
          subjectId: subject.id,
          classId: classGroup.id,
          questionSetId: questionSet.id,
        }).then(function (session) {
          currentSession = session;
          currentQuestions = questionSet.questions;
          currentQuestionIndex = 0;
          responses = {};

          showSessionUi(true);
          renderCurrentQuestion();
          setMessage("", false);
        });
      })
      .catch(function (err) {
        setMessage("Konnte Sitzung nicht starten: " + err.message, true);
      });
  }

  function recordAnswer(cardId, answer) {
    if (!hasActiveSession()) return;
    responses[cardId] = answer;
  }

  function getResponses() {
    return responses;
  }

  function nextQuestion() {
    if (!hasActiveSession()) return;
    var question = getCurrentQuestion();

    var save = question
      ? Store.saveAnswerRecords(currentSession.id, question.id, responses)
      : Promise.resolve();

    save.then(function () {
      currentQuestionIndex++;
      responses = {};

      if (currentQuestionIndex >= currentQuestions.length) {
        endSession();
      } else {
        renderCurrentQuestion();
      }
    });
  }

  function endSession() {
    if (!hasActiveSession()) return;
    Store.updateSession(currentSession.id, { status: "completed" }).then(
      function () {
        currentSession = null;
        currentQuestions = [];
        currentQuestionIndex = 0;
        responses = {};

        showSessionUi(false);
        renderCurrentQuestion();
        setMessage(
          "Quiz beendet. Die Ergebnisse stehen unter „Auswertung“.",
          false
        );
      }
    );
  }

  return {
    populateSelectors: populateSelectors,
    hasActiveSession: hasActiveSession,
    getCurrentQuestion: getCurrentQuestion,
    startSession: startSession,
    recordAnswer: recordAnswer,
    getResponses: getResponses,
    nextQuestion: nextQuestion,
    endSession: endSession,
  };
})();
