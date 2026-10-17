/* Sicherung aller Daten (Fragensets, Materialien, Sitzungen, Antworten) als
   eine JSON-Datei und Wiedereinspielen – auch auf ein anderes Gerät. Die
   Daten liegen sonst nur in der IndexedDB dieses Browsers (siehe
   features.md, Datenhoheit). */
var Backup = (function () {
  var FORMAT = "nonamequiz-backup";
  var VERSION = 1;

  function setMessage(text, isError) {
    var el = document.getElementById("backupMessage");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "crimson" : "green";
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    return fetch(dataUrl).then(function (response) {
      return response.blob();
    });
  }

  function today() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      ("0" + (d.getMonth() + 1)).slice(-2) +
      "-" +
      ("0" + d.getDate()).slice(-2)
    );
  }

  // --- Export --------------------------------------------------------------

  function exportAll() {
    setMessage("Sicherung wird erstellt …", false);

    Store.exportAll()
      .then(function (data) {
        // Blobs lassen sich nicht als JSON speichern – als data:-URL einbetten.
        return Promise.all(
          data.materials.map(function (m) {
            return blobToDataUrl(m.blob).then(function (dataUrl) {
              var copy = Object.assign({}, m);
              delete copy.blob;
              copy.blobDataUrl = dataUrl;
              return copy;
            });
          })
        ).then(function (materials) {
          data.materials = materials;
          return data;
        });
      })
      .then(function (data) {
        var backup = {
          format: FORMAT,
          version: VERSION,
          exportedAt: new Date().toISOString(),
          data: data,
        };
        Exporter.downloadFile(
          "nonamequiz-sicherung-" + today() + ".json",
          JSON.stringify(backup),
          "application/json"
        );
        setMessage(
          "Sicherung heruntergeladen: " +
            data.questionSets.length +
            " Fragensets, " +
            data.sessions.length +
            " Quiz-Ergebnisse, " +
            data.materials.length +
            " Materialien.",
          false
        );
      })
      .catch(function (err) {
        setMessage("Sicherung fehlgeschlagen: " + err.message, true);
      });
  }

  // --- Import --------------------------------------------------------------

  // Fächer/Klassen entstehen auf jedem Gerät mit eigener id. Gleichnamige
  // werden auf die hier schon vorhandenen abgebildet, sonst gäbe es nach dem
  // Einspielen z.B. zweimal "Mathematik".
  function mergeByName(imported, existing) {
    var existingIdByName = {};
    existing.forEach(function (item) {
      existingIdByName[item.name.trim().toLowerCase()] = item.id;
    });

    var idMap = {};
    var toImport = [];
    imported.forEach(function (item) {
      var existingId = existingIdByName[String(item.name).trim().toLowerCase()];
      if (existingId) {
        idMap[item.id] = existingId;
      } else {
        idMap[item.id] = item.id;
        toImport.push(item);
      }
    });
    return { idMap: idMap, records: toImport };
  }

  function remap(records, field, idMap) {
    return records.map(function (r) {
      var copy = Object.assign({}, r);
      if (idMap[copy[field]]) copy[field] = idMap[copy[field]];
      return copy;
    });
  }

  function validate(backup) {
    if (!backup || backup.format !== FORMAT || !backup.data) {
      throw new Error("Das ist keine NoNameQuiz-Sicherung.");
    }
    if (backup.version > VERSION) {
      throw new Error(
        "Die Sicherung stammt aus einer neueren Version der App. Bitte die App aktualisieren."
      );
    }
  }

  function importFile(file) {
    if (!file) return;
    setMessage("Sicherung wird eingespielt …", false);

    file
      .text()
      .then(function (text) {
        var backup;
        try {
          backup = JSON.parse(text);
        } catch (e) {
          throw new Error("Die Datei ist beschädigt oder kein JSON.");
        }
        validate(backup);
        var data = backup.data;

        return Promise.all([
          Store.listSubjects(),
          Store.listClassGroups(),
          Promise.all(
            (data.materials || []).map(function (m) {
              var copy = Object.assign({}, m);
              var dataUrl = copy.blobDataUrl;
              delete copy.blobDataUrl;
              return dataUrlToBlob(dataUrl).then(function (blob) {
                copy.blob = blob;
                return copy;
              });
            })
          ),
        ]).then(function (results) {
          var subjects = mergeByName(data.subjects || [], results[0]);
          var classGroups = mergeByName(data.classGroups || [], results[1]);

          var merged = {
            subjects: subjects.records,
            classGroups: classGroups.records,
            questionSets: remap(data.questionSets || [], "subjectId", subjects.idMap),
            questions: data.questions || [],
            sessions: remap(
              remap(data.sessions || [], "subjectId", subjects.idMap),
              "classId",
              classGroups.idMap
            ),
            answerRecords: data.answerRecords || [],
            materials: remap(results[2], "subjectId", subjects.idMap),
          };

          return Store.importAll(merged).then(function () {
            return merged;
          });
        });
      })
      .then(function (merged) {
        document.dispatchEvent(new CustomEvent("nnq:questionsets-changed"));
        setMessage(
          "Sicherung eingespielt: " +
            merged.questionSets.length +
            " Fragensets, " +
            merged.sessions.length +
            " Quiz-Ergebnisse, " +
            merged.materials.length +
            " Materialien.",
          false
        );
      })
      .catch(function (err) {
        setMessage("Einspielen fehlgeschlagen: " + err.message, true);
      });
  }

  return {
    exportAll: exportAll,
    importFile: importFile,
  };
})();
