/* Upload von Unterrichtsmaterialien pro Fach. Dient als vorbereitete
   Kontext-Quelle für die spätere KI-Fragengenerierung/-Tipps (F8/F10) –
   die eigentliche KI-Anbindung ist noch nicht gebaut, siehe architecture.md. */
var Materials = (function () {
  function setMessage(text, isError) {
    var el = document.getElementById("matMessage");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "crimson" : "green";
  }

  function currentSubjectName() {
    var el = document.getElementById("matSubjectInput");
    return el ? el.value.trim() : "";
  }

  function handleUpload(file) {
    if (!file) return;
    var subjectName = currentSubjectName();
    if (!subjectName) {
      setMessage("Bitte zuerst ein Fach angeben.", true);
      return;
    }

    Store.findOrCreateSubject(subjectName)
      .then(function (subject) {
        return Store.saveMaterial({
          subjectId: subject.id,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          blob: file,
        });
      })
      .then(function () {
        setMessage('"' + file.name + '" gespeichert.', false);
        document.getElementById("matFile").value = "";
        renderList();
      })
      .catch(function (err) {
        setMessage("Fehler beim Speichern: " + err.message, true);
      });
  }

  function renderList() {
    var container = document.getElementById("matList");
    if (!container) return;
    var subjectName = currentSubjectName();

    if (!subjectName) {
      container.innerHTML = "";
      return;
    }

    Store.findSubjectByName(subjectName).then(function (subject) {
      if (!subject) {
        container.innerHTML = "<p>Noch keine Materialien für dieses Fach.</p>";
        return;
      }
      Store.listMaterialsForSubject(subject.id).then(function (materials) {
        if (materials.length === 0) {
          container.innerHTML = "<p>Noch keine Materialien für dieses Fach.</p>";
          return;
        }
        materials.sort(function (a, b) {
          return new Date(b.uploadedAt) - new Date(a.uploadedAt);
        });
        container.innerHTML = materials
          .map(function (m) {
            var sizeKb = Math.round((m.blob.size || 0) / 1024);
            return (
              "<div>" +
              m.filename +
              " (" +
              sizeKb +
              " KB) " +
              '<button type="button" onclick="Materials.remove(\'' +
              m.id +
              "')\">Entfernen</button>" +
              "</div>"
            );
          })
          .join("");
      });
    });
  }

  function remove(materialId) {
    Store.deleteMaterial(materialId).then(renderList);
  }

  return {
    handleUpload: handleUpload,
    renderList: renderList,
    remove: remove,
  };
})();
