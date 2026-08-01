import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'No text content provided for AI extraction.' });
  }

  try {
    const prompt = `
You are the MivaPrep Academic Formatter Engine.
Your task is to analyze raw educational text and extract structured multiple-choice questions (MCQs).

RULES:
1. Identify all valid educational questions in the text.
2. Normalize options into a standard dictionary/object with keys "A", "B", "C", "D" (and "E" if present).
3. Detect or infer the correct answer key ("A", "B", "C", etc.). If unstated, use the context to pick the mathematically/scientifically correct option.
4. Fix OCR errors, broken line wraps, messy formatting, and duplicate question numbers.
5. Provide a clear, educational explanation for revision.
6. OUTPUT STRICT JSON ONLY matching this exact schema array:

[
  {
    "question": "Question text here...",
    "options": {
      "A": "Option A text",
      "B": "Option B text",
      "C": "Option C text",
      "D": "Option D text"
    },
    "correct_answer": "A",
    "explanation": "Brief clear explanation here..."
  }
]

RAW EDUCATIONAL TEXT:
${text.slice(0, 12000)}
`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You output raw valid JSON arrays containing extracted quiz questions. Do not write introductory prose or code blocks.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const rawOutput = chatCompletion.choices[0]?.message?.content || '[]';
    
    // Parse Groq JSON response safely
    let parsedQuestions = JSON.parse(rawOutput);
    
    // Handle wrapper objects if Groq wraps array inside a property key like {"questions": [...]}
    if (!Array.isArray(parsedQuestions)) {
      parsedQuestions = parsedQuestions.questions || parsedQuestions.data || [];
    }

    return res.status(200).json({
      success: true,
      count: parsedQuestions.length,
      questions: parsedQuestions,
    });

  } catch (error) {
    console.error('Groq AI Extraction Error:', error);
    return res.status(500).json({ 
      error: 'AI formatting failed: ' + error.message 
    });
  }
}