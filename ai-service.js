/* Kommuniziert mit dem KI-Proxy (server/) für die Fragengenerierung (F8).
   Reine Anfrage/Antwort-Aufrufe, keine eigene Persistenz – siehe
   architecture.md#ki-komponente-fragengenerierung--tipps. */
var AiService = (function () {
  // Proxy läuft standardmäßig auf demselben Origin wie diese Seite (relative
  // URL). Läuft der Proxy separat (siehe server/README.md), hier die volle
  // URL eintragen, z.B. "https://ki-proxy.example.org".
  var proxyBaseUrl = "";

  function setMessage(text, isError) {
    var el = document.getElementById("aiMessage");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "crimson" : "green";
  }

  function readMaterialAsPayload(material) {
    return new Promise(function (resolve, reject) {
      var isPdf = material.mimeType === "application/pdf";
      var reader = new FileReader();
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.onload = function () {
        var content = isPdf ? (reader.result.split(",")[1] || "") : reader.result;
        resolve({
          filename: material.filename,
          mimeType: material.mimeType,
          content: content,
        });
      };
      if (isPdf) reader.readAsDataURL(material.blob);
      else reader.readAsText(material.blob);
    });
  }

  function collectMaterials(subjectId) {
    return Store.listMaterialsForSubject(subjectId).then(function (materials) {
      return Promise.all(materials.map(readMaterialAsPayload));
    });
  }

  function requestGenerateQuestions(payload) {
    return fetch(proxyBaseUrl + "/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (response) {
      if (!response.ok) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            throw new Error(
              body.error || "KI-Anfrage fehlgeschlagen (" + response.status + ")"
            );
          });
      }
      return response.json();
    });
  }

  function generate() {
    var topic = document.getElementById("aiTopic").value.trim();
    var subjectName = document.getElementById("aiSubject").value.trim();
    var count = parseInt(document.getElementById("aiCount").value, 10) || 5;

    if (!topic || !subjectName) {
      setMessage("Bitte Themenbereich und Fach angeben.", true);
      return;
    }

    setMessage("Frage KI an …", false);

    Store.findOrCreateSubject(subjectName)
      .then(function (subject) {
        return collectMaterials(subject.id);
      })
      .then(function (materials) {
        return requestGenerateQuestions({
          topic: topic,
          subject: subjectName,
          count: count,
          materials: materials,
        });
      })
      .then(function (questionSet) {
        setMessage(
          questionSet.questions.length +
            " Fragen vorgeschlagen – im Formular oben sichten, bearbeiten und dann speichern.",
          false
        );
        QuestionEditor.prefillFromAi(questionSet);
      })
      .catch(function (err) {
        setMessage("Fehler: " + err.message, true);
      });
  }

  return {
    generate: generate,
    setProxyBaseUrl: function (url) {
      proxyBaseUrl = url;
    },
  };
})();
