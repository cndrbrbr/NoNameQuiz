const pdfParse = require("pdf-parse");

// Keeps the prompt sent to the model bounded even if a teacher uploads a
// large script/handout.
const MAX_CHARS_PER_MATERIAL = 20000;

async function extractMaterialText(material) {
  if (!material || !material.content) return "";

  if (material.mimeType === "application/pdf") {
    try {
      const buffer = Buffer.from(material.content, "base64");
      const parsed = await pdfParse(buffer);
      return parsed.text || "";
    } catch (err) {
      console.warn(
        "Could not extract text from PDF " + (material.filename || "?") + ": " + err.message
      );
      return "";
    }
  }

  return typeof material.content === "string" ? material.content : "";
}

async function buildMaterialsContext(materials) {
  if (!Array.isArray(materials) || materials.length === 0) return "";

  const sections = await Promise.all(
    materials.map(async (material) => {
      const text = await extractMaterialText(material);
      if (!text) return "";
      return "### " + (material.filename || "Material") + "\n" + text.slice(0, MAX_CHARS_PER_MATERIAL);
    })
  );

  return sections.filter(Boolean).join("\n\n");
}

module.exports = { buildMaterialsContext };
