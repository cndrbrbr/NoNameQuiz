const { chatCompletion } = require("./mistralClient");
const { buildMaterialsContext } = require("./materials");

const ANSWER_LETTERS = ["A", "B", "C", "D"];

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Antwort enthielt keine Fragen");
  }
  questions.forEach((q, i) => {
    if (!q.text || !q.options) {
      throw new Error("Frage " + (i + 1) + ": text/options fehlen in KI-Antwort");
    }
    ANSWER_LETTERS.forEach((letter) => {
      if (!q.options[letter]) {
        throw new Error("Frage " + (i + 1) + ": Option " + letter + " fehlt in KI-Antwort");
      }
    });
    if (ANSWER_LETTERS.indexOf(q.correctAnswer) === -1) {
      throw new Error("Frage " + (i + 1) + ": correctAnswer ungültig in KI-Antwort");
    }
  });
}

// Returns a question set in the app's upload format, see
// architecture.md#format-für-den-fragen-upload-json.
async function generateQuestions({ topic, subject, count, materials }) {
  const materialsContext = await buildMaterialsContext(materials);

  const systemPrompt =
    "Du erstellst Multiple-Choice-Quizfragen für den Schulunterricht auf Deutsch. " +
    'Antworte ausschließlich mit validem JSON der Form {"questions":[{"text":"...",' +
    '"options":{"A":"...","B":"...","C":"...","D":"..."},"correctAnswer":"A"}]}. ' +
    "Kein Fließtext, keine Markdown-Codeblöcke, keine Erklärungen außerhalb des JSON.";

  const userPromptParts = [
    "Fach: " + subject,
    "Themenbereich: " + topic,
    "Anzahl Fragen: " + count,
  ];
  if (materialsContext) {
    userPromptParts.push(
      "Nutze folgende Unterrichtsmaterialien als inhaltliche Grundlage, soweit relevant:\n\n" +
        materialsContext
    );
  }

  const content = await chatCompletion([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPromptParts.join("\n\n") },
  ]);

  const parsed = extractJson(content);
  validateQuestions(parsed.questions);

  return {
    title: subject + " – " + topic,
    subject: subject,
    questions: parsed.questions,
  };
}

module.exports = { generateQuestions };
