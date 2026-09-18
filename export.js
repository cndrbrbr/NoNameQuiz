/* Export der Statistik: Zwischenablage als HTML-Tabelle (für OneNote) und
   CSV-Download als Fallback. Siehe architecture.md, Abschnitt "Export für
   OneNote". */
var Exporter = (function () {
  function copyHtmlTable(html, plainText) {
    if (!navigator.clipboard || !window.ClipboardItem) {
      return Promise.reject(
        new Error(
          "Zwischenablage wird von diesem Browser nicht unterstützt. Bitte CSV-Download nutzen."
        )
      );
    }

    var htmlBlob = new Blob([html], { type: "text/html" });
    var textBlob = new Blob([plainText || ""], { type: "text/plain" });

    return navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
  }

  function downloadFile(filename, content, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadCsv(filename, csvString) {
    downloadFile(filename, csvString, "text/csv;charset=utf-8;");
  }

  function csvEscape(value) {
    var str = String(value == null ? "" : value);
    if (str.indexOf(";") !== -1 || str.indexOf('"') !== -1 || str.indexOf("\n") !== -1) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  return {
    copyHtmlTable: copyHtmlTable,
    downloadCsv: downloadCsv,
    csvEscape: csvEscape,
  };
})();
