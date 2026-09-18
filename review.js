/* Fehlerquote je Frage und Erzeugung von Wiederholungs-Fragensets (F9).
   Siehe architecture.md, Abschnitt "Wiederholungsfragen". */
var Review = (function () {
  var DEFAULT_THRESHOLD = 0.4;

  function computeErrorRates(sessionId) {
    return Promise.all([
      Store.getSession(sessionId),
      Store.listAnswerRecordsForSession(sessionId),
    ]).then(function (results) {
      var session = results[0];
      var records = results[1];
      if (!session) return [];

      return Store.getQuestionSetWithQuestions(session.questionSetId).then(
        function (questionSet) {
          return questionSet.questions.map(function (question) {
            var questionRecords = records.filter(function (r) {
              return r.questionId === question.id;
            });
            var total = questionRecords.length;
            var wrong = questionRecords.filter(function (r) {
              return r.answer !== question.correctAnswer;
            }).length;

            return {
              question: question,
              total: total,
              wrong: wrong,
              errorRate: total === 0 ? 0 : wrong / total,
            };
          });
        }
      );
    });
  }

  function suggestCandidates(sessionId, threshold) {
    threshold = typeof threshold === "number" ? threshold : DEFAULT_THRESHOLD;
    return computeErrorRates(sessionId).then(function (rates) {
      return rates.filter(function (r) {
        return r.total > 0 && r.errorRate >= threshold;
      });
    });
  }

  function createReviewQuestionSet(sessionId, questionIds) {
    return Store.getSession(sessionId).then(function (session) {
      if (!session) throw new Error("Sitzung nicht gefunden");

      return Store.getQuestionSetWithQuestions(session.questionSetId).then(
        function (questionSet) {
          var selected = questionSet.questions.filter(function (q) {
            return questionIds.indexOf(q.id) !== -1;
          });
          if (selected.length === 0) {
            throw new Error("Keine Fragen ausgewählt");
          }

          return Store.saveQuestionSet({
            title: "Wiederholung – " + questionSet.title,
            subjectId: session.subjectId,
            origin: "review",
            sourceSessionId: sessionId,
            questions: selected.map(function (q) {
              return {
                text: q.text,
                optionA: q.optionA,
                optionB: q.optionB,
                optionC: q.optionC,
                optionD: q.optionD,
                correctAnswer: q.correctAnswer,
              };
            }),
          });
        }
      );
    });
  }

  return {
    DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
    computeErrorRates: computeErrorRates,
    suggestCandidates: suggestCandidates,
    createReviewQuestionSet: createReviewQuestionSet,
  };
})();
