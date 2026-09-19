require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { generateQuestions } = require("./lib/questionGenerator");

const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
// Materials (especially base64-encoded PDFs) can push request bodies well
// past Express's 100kb default.
app.use(express.json({ limit: "15mb" }));

app.post("/api/generate-questions", async (req, res) => {
  const { topic, subject, count, materials } = req.body || {};

  if (!topic || !subject) {
    return res.status(400).json({ error: "topic und subject sind Pflichtfelder" });
  }

  try {
    const questionSet = await generateQuestions({
      topic,
      subject,
      count: Number(count) || 5,
      materials,
    });
    res.json(questionSet);
  } catch (err) {
    console.error("generate-questions failed:", err);
    res.status(502).json({ error: "KI-Anfrage fehlgeschlagen: " + err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("NoNameQuiz KI-Proxy listening on port " + port);
});
