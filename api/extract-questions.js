import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, includeEssays } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'No text content provided for AI extraction.' });
  }

  try {
    const prompt = `
You are the MivaPulse Academic Quiz Engine.
Your task is to analyze raw educational text and produce quiz questions in a STRICT JSON format.

RULES:
1. Identify educational concepts and turn them into questions.
2. Create mostly MCQ questions (4 options A-D), but also include 1-2 essay/short-answer questions when the content warrants deeper thinking.
3. For MCQs: options must be an object with keys "A", "B", "C", "D".
4. Detect or infer the correct answer. If unstated, use context to determine the correct option.
5. Fix OCR errors, broken formatting, and duplicate content.
6. Add a "topic" field that identifies the subject area.
7. Add a "type" field: "mcq" for multiple choice, "essay" for open-ended questions.
8. For essay questions: provide a "model_answer" field with a sample answer.
9. OUTPUT STRICT JSON ONLY matching this schema:

{
  "questions": [
    {
      "question": "Question text here...",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      },
      "correct_answer": "B",
      "explanation": "Clear educational explanation...",
      "topic": "Subject area identified from text",
      "type": "mcq"
    },
    {
      "question": "Essay question text...",
      "type": "essay",
      "topic": "Subject area",
      "model_answer": "A well-structured sample answer..."
    }
  ]
}

RAW EDUCATIONAL TEXT:
${text.slice(0, 12000)}
`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You output valid JSON objects with a "questions" array. Do not write introductory prose or code blocks.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const rawOutput = chatCompletion.choices[0]?.message?.content || '{}';
    let parsed = JSON.parse(rawOutput);
    
    // Handle both array and object formats
    let questions = [];
    if (Array.isArray(parsed)) {
      questions = parsed;
    } else if (parsed.questions) {
      questions = parsed.questions;
    } else if (parsed.data) {
      questions = parsed.data;
    }

    // Normalize each question to ensure quiz-engine compatibility
    questions = questions.map(q => {
      const normalized = {
        question: q.question || '',
        type: q.type || (q.options ? 'mcq' : 'essay'),
        topic: q.topic || 'General',
        explanation: q.explanation || '',
      };
      if (q.options) {
        normalized.options = q.options;
        normalized.correct_answer = q.correct_answer || q.answer || 'A';
      }
      if (q.model_answer) {
        normalized.model_answer = q.model_answer;
      }
      return normalized;
    });

    return res.status(200).json({
      success: true,
      count: questions.length,
      questions: questions,
    });

  } catch (error) {
    console.error('Groq AI Extraction Error:', error);
    return res.status(500).json({ 
      error: 'AI formatting failed: ' + error.message 
    });
  }
}
