const BASE_URL = (process.env.MISTRAL_BASE_URL || "https://mistral.cndrbrbr.de/v1").replace(/\/$/, "");
const MODEL = process.env.MISTRAL_MODEL || "mistral";

// mistral.cndrbrbr.de currently needs no auth. If that changes, add e.g.
// `Authorization: "Bearer " + process.env.MISTRAL_API_KEY` to the headers below.
async function chatCompletion(messages) {
  const response = await fetch(BASE_URL + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error("Mistral-Server antwortete mit " + response.status + ": " + body.slice(0, 300));
  }

  const data = await response.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    throw new Error("Mistral-Server lieferte keine Antwort");
  }
  return content;
}

module.exports = { chatCompletion };
