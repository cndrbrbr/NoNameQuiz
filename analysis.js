/* Auswertung über alle Quiz hinweg: welche Frage wurde wann welcher Klasse
   gestellt, wie oft wurde A/B/C/D gewählt (je Quiz und kumuliert), wer hat
   richtig/falsch geantwortet, und in welcher Reihenfolge Fragen beim
   nächsten Quiz einer Klasse gestellt werden sollen.

   Fragen werden über ihren Text wiedererkannt (Groß-/Kleinschreibung und
   Leerzeichen egal). So zählt die Historie weiter, wenn ein Fragenset per
   Excel neu hochgeladen oder als Wiederholungsset kopiert wurde. */
var Analysis = (function () {
  var LETTERS = ["A", "B", "C", "D"];
  // Ab diesem Anteil richtiger Antworten gilt eine Frage in einer Klasse als
  // erfolgreich gestellt (passend zur Fehlerquote-Schwelle der Wiederholung).
  var SUCCESS_RATE = 0.6;
  var MAX_QUESTIONS = 30;

  function questionKey(q) {
    return String(q.text || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function indexBy(items) {
    var map = {};
    items.forEach(function (i) {
      map[i.id] = i;
    });
    return map;
  }

  function load() {
    return Store.getAllFrom(["subjects", "classGroups", "questionSets", "questions", "sessions", "answerRecords"]).then(
      build
    );
  }

  function emptyCounts() {
    return { A: 0, B: 0, C: 0, D: 0 };
  }

  function build(data) {
    var questionsById = indexBy(data.questions);
    var setsById = indexBy(data.questionSets);
    var subjectsById = indexBy(data.subjects);
    var classesById = indexBy(data.classGroups);

    var questionsBySet = {};
    data.questions.forEach(function (q) {
      (questionsBySet[q.questionSetId] = questionsBySet[q.questionSetId] || []).push(q);
    });
    Object.keys(questionsBySet).forEach(function (id) {
      questionsBySet[id].sort(function (a, b) {
        return a.position - b.position;
      });
    });

    var recordsBySession = {};
    data.answerRecords.forEach(function (r) {
      (recordsBySession[r.sessionId] = recordsBySession[r.sessionId] || []).push(r);
    });

    var askingsByKey = {};
    var entries = data.sessions
      .slice()
      .sort(function (a, b) {
        return new Date(a.date) - new Date(b.date);
      })
      .map(function (s) {
        var records = recordsBySession[s.id] || [];
        var asked;
        if (s.askedQuestionIds) {
          asked = s.askedQuestionIds
            .map(function (id) {
              return questionsById[id];
            })
            .filter(Boolean);
        } else {
          // Ältere Quiz: gestellt = Fragen mit mindestens einer Antwort.
          var answered = {};
          records.forEach(function (r) {
            answered[r.questionId] = true;
          });
          asked = (questionsBySet[s.questionSetId] || []).filter(function (q) {
            return answered[q.id];
          });
        }

        var stats = {};
        asked.forEach(function (q) {
          stats[q.id] = { counts: emptyCounts(), correct: 0, total: 0 };
        });
        var cards = {};
        records.forEach(function (r) {
          var st = stats[r.questionId];
          if (!st) return;
          st.counts[r.answer] = (st.counts[r.answer] || 0) + 1;
          st.total++;
          if (r.answer === questionsById[r.questionId].correctAnswer) st.correct++;
          (cards[r.cardId] = cards[r.cardId] || {})[r.questionId] = r.answer;
        });

        var entry = {
          session: s,
          set: setsById[s.questionSetId] || { title: "?" },
          subject: (subjectsById[s.subjectId] || {}).name || "",
          classId: s.classId,
          className: (classesById[s.classId] || {}).name || "",
          date: new Date(s.date),
          asked: asked,
          stats: stats,
          records: records,
          cards: cards,
          cardIds: Object.keys(cards)
            .map(Number)
            .sort(function (a, b) {
              return a - b;
            }),
        };

        asked.forEach(function (q) {
          var st = stats[q.id];
          var key = questionKey(q);
          (askingsByKey[key] = askingsByKey[key] || []).push({
            entry: entry,
            question: q,
            counts: st.counts,
            correct: st.correct,
            total: st.total,
            rate: st.total ? st.correct / st.total : null,
          });
        });
        return entry;
      });

    return {
      entries: entries,
      entriesById: indexBy(
        entries.map(function (e) {
          return { id: e.session.id, entry: e };
        })
      ),
      askingsByKey: askingsByKey,
      questionsBySet: questionsBySet,
      setsById: setsById,
      subjects: data.subjects,
      classes: data.classGroups,
      classesById: classesById,
    };
  }

  function entry(model, sessionId) {
    var e = model.entriesById[sessionId];
    return e ? e.entry : null;
  }

  function matches(e, filter) {
    if (filter.subjectId && e.session.subjectId !== filter.subjectId) return false;
    if (filter.classId && e.classId !== filter.classId) return false;
    if (filter.sessionIds && filter.sessionIds.indexOf(e.session.id) === -1) return false;
    return true;
  }

  // Eine Zeile je Frage mit kumulierten A/B/C/D-Zahlen und der Liste, wann sie
  // welcher Klasse gestellt wurde. filter: { subjectId, classId, questionSetId,
  // sessionIds }. Mit questionSetId erscheinen auch noch nie gestellte Fragen.
  function questionSummary(model, filter) {
    filter = filter || {};
    var rows = {};
    var order = [];

    function row(q) {
      var key = questionKey(q);
      if (!rows[key]) {
        rows[key] = { key: key, question: q, setTitles: [], counts: emptyCounts(), correct: 0, total: 0, askings: [] };
        order.push(key);
      }
      return rows[key];
    }

    if (filter.questionSetId) {
      (model.questionsBySet[filter.questionSetId] || []).forEach(row);
    }

    model.entries.forEach(function (e) {
      if (!matches(e, filter)) return;
      e.asked.forEach(function (q) {
        var key = questionKey(q);
        if (filter.questionSetId && !rows[key]) return;
        var r = row(q);
        if (!filter.questionSetId) r.question = q; // neueste Fassung zeigen
        var st = e.stats[q.id];
        LETTERS.forEach(function (l) {
          r.counts[l] += st.counts[l];
        });
        r.correct += st.correct;
        r.total += st.total;
        if (r.setTitles.indexOf(e.set.title) === -1) r.setTitles.push(e.set.title);
        r.askings.push({
          className: e.className,
          classId: e.classId,
          date: e.date,
          correct: st.correct,
          total: st.total,
          rate: st.total ? st.correct / st.total : null,
        });
      });
    });

    return order.map(function (key) {
      var r = rows[key];
      r.rate = r.total ? r.correct / r.total : null;
      return r;
    });
  }

  // Richtig/falsch je Karte über mehrere Quiz.
  function cardSummary(model, filter) {
    var entries = model.entries.filter(function (e) {
      return matches(e, filter || {});
    });
    var cards = {};
    entries.forEach(function (e, i) {
      e.cardIds.forEach(function (cardId) {
        var c = (cards[cardId] = cards[cardId] || { cardId: cardId, perEntry: {}, correct: 0, answered: 0 });
        var res = cardResult(e, cardId);
        c.perEntry[i] = res;
        c.correct += res.correct;
        c.answered += res.answered;
      });
    });
    return {
      entries: entries,
      cards: Object.keys(cards)
        .map(Number)
        .sort(function (a, b) {
          return a - b;
        })
        .map(function (id) {
          return cards[id];
        }),
    };
  }

  function cardResult(e, cardId) {
    var answers = e.cards[cardId] || {};
    var correct = 0;
    var answered = 0;
    e.asked.forEach(function (q) {
      var a = answers[q.id];
      if (!a) return;
      answered++;
      if (a === q.correctAnswer) correct++;
    });
    return { correct: correct, answered: answered };
  }

  // Reihenfolge für ein neues Quiz einer Klasse: zuerst Fragen, die diese
  // Klasse noch nie hatte, dann solche ohne erfolgreichen Durchgang
  // (schlechteste zuerst), zuletzt bereits gekonnte (am längsten her zuerst).
  // Innerhalb einer Gruppe bleibt die Reihenfolge des Fragensets.
  function prioritize(model, questions, classId) {
    return questions
      .map(function (q, index) {
        var askings = (model.askingsByKey[questionKey(q)] || []).filter(function (a) {
          return classId && a.entry.classId === classId;
        });
        var best = null;
        var last = 0;
        askings.forEach(function (a) {
          if (a.rate !== null && (best === null || a.rate > best)) best = a.rate;
          last = Math.max(last, a.entry.date.getTime());
        });
        var group, sortValue;
        if (askings.length === 0) {
          group = 0;
          sortValue = 0;
        } else if (best === null || best < SUCCESS_RATE) {
          group = 1;
          sortValue = best === null ? -1 : best;
        } else {
          group = 2;
          sortValue = last;
        }
        return { question: q, index: index, group: group, sortValue: sortValue };
      })
      .sort(function (a, b) {
        return a.group - b.group || a.sortValue - b.sortValue || a.index - b.index;
      });
  }

  function groupCounts(prioritized) {
    var counts = [0, 0, 0];
    prioritized.forEach(function (p) {
      counts[p.group]++;
    });
    return { neu: counts[0], offen: counts[1], gekonnt: counts[2] };
  }

  function formatDate(date) {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  function formatPercent(rate) {
    return rate === null || rate === undefined ? "–" : Math.round(rate * 100) + " %";
  }

  // "7b 10.10.26 (60 %)" – für Tabellen und Excel.
  function askingLabel(a, withClass) {
    return (withClass && a.className ? a.className + " " : "") + formatDate(a.date) + " (" + formatPercent(a.rate) + ")";
  }

  return {
    LETTERS: LETTERS,
    SUCCESS_RATE: SUCCESS_RATE,
    MAX_QUESTIONS: MAX_QUESTIONS,
    questionKey: questionKey,
    load: load,
    build: build,
    entry: entry,
    questionSummary: questionSummary,
    cardSummary: cardSummary,
    cardResult: cardResult,
    prioritize: prioritize,
    groupCounts: groupCounts,
    formatDate: formatDate,
    formatPercent: formatPercent,
    askingLabel: askingLabel,
  };
})();
