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
            return '<option value="' + s.id + '">' + s.title + "</option>";
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
    optionsEl.innerHTML =
      "<div>A: " +
      question.optionA +
      "</div><div>B: " +
      question.optionB +
      "</div><div>C: " +
      question.optionC +
      "</div><div>D: " +
      question.optionD +
      "</div>";
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

          document.getElementById("scanSetupPanel").style.display = "none";
          document.getElementById("scanSessionPanel").style.display = "block";
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

        document.getElementById("scanSessionPanel").style.display = "none";
        document.getElementById("scanSetupPanel").style.display = "block";
        renderCurrentQuestion();
        setMessage(
          "Sitzung beendet. Ergebnisse stehen im Tab „Statistik“.",
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
