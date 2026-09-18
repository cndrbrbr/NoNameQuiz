/* IndexedDB-Zugriffsschicht: Subjects, ClassGroups, QuestionSets, Questions,
   Sessions, AnswerRecords. Promise-basierte API, siehe architecture.md. */
var Store = (function () {
  var DB_NAME = "nonamequiz";
  var DB_VERSION = 2;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        var db = event.target.result;

        if (!db.objectStoreNames.contains("subjects")) {
          db.createObjectStore("subjects", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("classGroups")) {
          db.createObjectStore("classGroups", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("questionSets")) {
          var qs = db.createObjectStore("questionSets", { keyPath: "id" });
          qs.createIndex("subjectId", "subjectId");
        }
        if (!db.objectStoreNames.contains("questions")) {
          var q = db.createObjectStore("questions", { keyPath: "id" });
          q.createIndex("questionSetId", "questionSetId");
        }
        if (!db.objectStoreNames.contains("sessions")) {
          var s = db.createObjectStore("sessions", { keyPath: "id" });
          s.createIndex("subjectId", "subjectId");
          s.createIndex("classId", "classId");
        }
        if (!db.objectStoreNames.contains("answerRecords")) {
          var a = db.createObjectStore("answerRecords", { keyPath: "id" });
          a.createIndex("sessionId", "sessionId");
          a.createIndex("questionId", "questionId");
        }
        if (!db.objectStoreNames.contains("materials")) {
          var m = db.createObjectStore("materials", { keyPath: "id" });
          m.createIndex("subjectId", "subjectId");
        }
      };

      request.onsuccess = function (event) {
        resolve(event.target.result);
      };
      request.onerror = function (event) {
        reject(event.target.error);
      };
    });

    return dbPromise;
  }

  function newId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function tx(storeNames, mode) {
    return openDb().then(function (db) {
      return db.transaction(storeNames, mode || "readonly");
    });
  }

  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function put(storeName, record) {
    return tx([storeName], "readwrite").then(function (t) {
      return reqToPromise(t.objectStore(storeName).put(record)).then(
        function () {
          return record;
        }
      );
    });
  }

  function get(storeName, key) {
    return tx([storeName], "readonly").then(function (t) {
      return reqToPromise(t.objectStore(storeName).get(key));
    });
  }

  function getAll(storeName) {
    return tx([storeName], "readonly").then(function (t) {
      return reqToPromise(t.objectStore(storeName).getAll());
    });
  }

  function getAllByIndex(storeName, indexName, value) {
    return tx([storeName], "readonly").then(function (t) {
      return reqToPromise(
        t.objectStore(storeName).index(indexName).getAll(value)
      );
    });
  }

  function remove(storeName, key) {
    return tx([storeName], "readwrite").then(function (t) {
      return reqToPromise(t.objectStore(storeName).delete(key));
    });
  }

  // --- Subjects ------------------------------------------------------

  function listSubjects() {
    return getAll("subjects");
  }

  function findOrCreateSubject(name) {
    var trimmed = (name || "").trim();
    if (!trimmed) return Promise.reject(new Error("Fach fehlt"));

    return listSubjects().then(function (subjects) {
      var existing = subjects.filter(function (s) {
        return s.name.toLowerCase() === trimmed.toLowerCase();
      })[0];
      if (existing) return existing;
      var subject = { id: newId(), name: trimmed };
      return put("subjects", subject);
    });
  }

  function findSubjectByName(name) {
    var trimmed = (name || "").trim();
    if (!trimmed) return Promise.resolve(null);

    return listSubjects().then(function (subjects) {
      return (
        subjects.filter(function (s) {
          return s.name.toLowerCase() === trimmed.toLowerCase();
        })[0] || null
      );
    });
  }

  // --- ClassGroups -----------------------------------------------------

  function listClassGroups() {
    return getAll("classGroups");
  }

  function findOrCreateClassGroup(name) {
    var trimmed = (name || "").trim();
    if (!trimmed) return Promise.reject(new Error("Klasse fehlt"));

    return listClassGroups().then(function (groups) {
      var existing = groups.filter(function (c) {
        return c.name.toLowerCase() === trimmed.toLowerCase();
      })[0];
      if (existing) return existing;
      var group = { id: newId(), name: trimmed };
      return put("classGroups", group);
    });
  }

  // --- QuestionSets + Questions ---------------------------------------

  function saveQuestionSet(data) {
    // data: { title, subjectId, origin, sourceSessionId, questions: [{text, optionA..D, correctAnswer}] }
    var questionSet = {
      id: newId(),
      title: data.title,
      subjectId: data.subjectId,
      origin: data.origin || "manual",
      sourceSessionId: data.sourceSessionId || null,
      createdAt: new Date().toISOString(),
    };

    return put("questionSets", questionSet).then(function () {
      var writes = data.questions.map(function (q, index) {
        var question = {
          id: newId(),
          questionSetId: questionSet.id,
          position: index,
          text: q.text,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          correctAnswer: q.correctAnswer,
        };
        return put("questions", question);
      });
      return Promise.all(writes).then(function () {
        return questionSet;
      });
    });
  }

  function listQuestionSets() {
    return getAll("questionSets");
  }

  function getQuestionSetWithQuestions(questionSetId) {
    return get("questionSets", questionSetId).then(function (questionSet) {
      if (!questionSet) return null;
      return getAllByIndex("questions", "questionSetId", questionSetId).then(
        function (questions) {
          questions.sort(function (a, b) {
            return a.position - b.position;
          });
          questionSet.questions = questions;
          return questionSet;
        }
      );
    });
  }

  // --- Sessions ---------------------------------------------------------

  function createSession(data) {
    // data: { subjectId, classId, questionSetId }
    var session = {
      id: newId(),
      subjectId: data.subjectId,
      classId: data.classId,
      questionSetId: data.questionSetId,
      date: new Date().toISOString(),
      status: "active",
    };
    return put("sessions", session);
  }

  function updateSession(sessionId, patch) {
    return get("sessions", sessionId).then(function (session) {
      if (!session) return null;
      Object.keys(patch).forEach(function (key) {
        session[key] = patch[key];
      });
      return put("sessions", session);
    });
  }

  function getSession(sessionId) {
    return get("sessions", sessionId);
  }

  function listSessions(filter) {
    filter = filter || {};
    return getAll("sessions").then(function (sessions) {
      return sessions
        .filter(function (s) {
          if (filter.subjectId && s.subjectId !== filter.subjectId) return false;
          if (filter.classId && s.classId !== filter.classId) return false;
          return true;
        })
        .sort(function (a, b) {
          return new Date(b.date) - new Date(a.date);
        });
    });
  }

  // --- AnswerRecords ------------------------------------------------------

  function saveAnswerRecords(sessionId, questionId, answersByCardId) {
    var writes = Object.keys(answersByCardId).map(function (cardId) {
      var record = {
        id: newId(),
        sessionId: sessionId,
        questionId: questionId,
        cardId: parseInt(cardId, 10),
        answer: answersByCardId[cardId],
        timestamp: new Date().toISOString(),
      };
      return put("answerRecords", record);
    });
    return Promise.all(writes);
  }

  function listAnswerRecordsForSession(sessionId) {
    return getAllByIndex("answerRecords", "sessionId", sessionId);
  }

  function listAnswerRecordsForQuestion(sessionId, questionId) {
    return listAnswerRecordsForSession(sessionId).then(function (records) {
      return records.filter(function (r) {
        return r.questionId === questionId;
      });
    });
  }

  // --- Materials (Unterrichtsmaterialien, Kontext für spätere KI-Nutzung) --

  function saveMaterial(data) {
    // data: { subjectId, filename, mimeType, blob }
    var material = {
      id: newId(),
      subjectId: data.subjectId,
      filename: data.filename,
      mimeType: data.mimeType,
      blob: data.blob,
      uploadedAt: new Date().toISOString(),
    };
    return put("materials", material);
  }

  function listMaterialsForSubject(subjectId) {
    return getAllByIndex("materials", "subjectId", subjectId);
  }

  function deleteMaterial(materialId) {
    return remove("materials", materialId);
  }

  return {
    newId: newId,
    listSubjects: listSubjects,
    findOrCreateSubject: findOrCreateSubject,
    findSubjectByName: findSubjectByName,
    listClassGroups: listClassGroups,
    findOrCreateClassGroup: findOrCreateClassGroup,
    saveQuestionSet: saveQuestionSet,
    listQuestionSets: listQuestionSets,
    getQuestionSetWithQuestions: getQuestionSetWithQuestions,
    createSession: createSession,
    updateSession: updateSession,
    getSession: getSession,
    listSessions: listSessions,
    saveAnswerRecords: saveAnswerRecords,
    listAnswerRecordsForSession: listAnswerRecordsForSession,
    listAnswerRecordsForQuestion: listAnswerRecordsForQuestion,
    saveMaterial: saveMaterial,
    listMaterialsForSubject: listMaterialsForSubject,
    deleteMaterial: deleteMaterial,
  };
})();
