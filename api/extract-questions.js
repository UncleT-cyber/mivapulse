import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, questionType = 'all' } = req.body; // 'all' | 'mcq' | 'essay'

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'No text content provided for AI extraction.' });
  }

  try {
    // Count numbered questions in the source so we can verify the AI extracted all of them
    const numberedMatches = text.match(/(?:^|\n)\s*(?:Q(?:uestion)?\.?\s*)?\d+[\.\)]\s+/g) || [];
    const estimatedQuestions = numberedMatches.length;

    // Instruction based on the user's chosen question type
    const typeInstructions = {
      mcq: 'Output ONLY multiple choice questions (type "mcq"). If the source contains essay/short-answer questions, CONVERT each one into a well-crafted MCQ with 4 plausible options. Do not output any essay questions.',
      essay: 'Output ONLY essay/short-answer questions (type "essay"). If the source contains MCQs, convert them into thoughtful essay or short-answer questions that test the same concept, and provide a model_answer for each. Do not output any MCQ questions.',
      all: 'Output a mix: mostly MCQ questions (type "mcq") plus essay questions (type "essay") where the content suits deeper open-ended testing.'
    };
    const typeInstruction = typeInstructions[questionType] || typeInstructions.all;

    const prompt = `
You are the MivaPulse Academic Quiz Engine. You perform STRICT EXTRACTION, not invention.

PRIMARY RULES — TWO MODES:

MODE A — EXTRACTION (when the text CONTAINS existing questions):
- Find EVERY question present in the text (numbered items like "1.", "Q1)", "Question 1:", etc.) and convert it into the JSON format.
- Count carefully. If the text contains 30 numbered questions, you MUST output 30 questions.
- NEVER fabricate questions, options, or answers that do not exist in the source text.
- If a question's correct answer is marked in the text (e.g. "Answer: B", bold, underline, or stated), use EXACTLY that answer.
- If no answer is marked, infer the best answer from the content and note it in the explanation.
- Fix obvious OCR errors in question/option wording, but NEVER change the meaning.
- Skip duplicates — if the same question appears twice, extract it only once.

MODE B — GENERATION (when the text is pure study material with NO questions):
- Generate comprehensive MCQs from the study material — one question per key concept/fact/definition.
- Aim for thorough coverage: create 1 question for every major concept, term, process, or fact in the material.
- Every question must be grounded in the actual content — never invent facts not present in the text.
- Distractors (wrong options) must be plausible and related to the topic, not obviously wrong.
- The explanation must teach WHY the correct answer is right, based on the material.
- Include a "course_code" field: infer the course code from the text (e.g. "COS 102", "GST 111"). If none can be found, use "GEN 101".

BOTH MODES:
- Include a "course_code" field in every question (extract from text if present, else infer, else "GEN 101").

QUESTION TYPE REQUIREMENT (user-selected): ${typeInstruction}

FORMAT RULES:
1. MCQs: options must be an object with keys "A", "B", "C", "D". If the source has fewer than 4 options, fill remaining keys with plausible distractors and note "(generated)" in the explanation.
2. Add a "topic" field identifying the subject area from the question content.
3. Add a "type" field: "mcq" or "essay".
4. Essay/short-answer questions: provide a "model_answer" field.
5. OUTPUT STRICT JSON ONLY matching this schema:

{
  "questions": [
    {
      "course_code": "COS 102",
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
      "course_code": "COS 102",
      "question": "Essay question text...",
      "type": "essay",
      "topic": "Subject area",
      "model_answer": "A well-structured sample answer..."
    }
  ]
}

DETECTED NUMBERED ITEMS IN SOURCE: ${estimatedQuestions > 0 ? `approximately ${estimatedQuestions} — use MODE A (extraction) and your output must account for all of them` : 'NONE detected — use MODE B (generation) and create questions from the study material'}.

RAW EDUCATIONAL TEXT:
${text.slice(0, 28000)}
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
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    });

    const rawOutput = chatCompletion.choices[0]?.message?.content || '{}';
    const finishReason = chatCompletion.choices[0]?.finish_reason;

    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (parseErr) {
      // Output may be truncated mid-JSON — try to salvage by cutting at the last complete object
      const lastBrace = rawOutput.lastIndexOf('}');
      const salvaged = rawOutput.slice(0, lastBrace + 1).replace(/,\s*$/, '') + '] }';
      try {
        parsed = JSON.parse(salvaged);
      } catch (e2) {
        return res.status(500).json({ error: 'AI returned malformed JSON. Please retry.' });
      }
    }
    
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
        course_code: q.course_code || q.courseCode || 'GEN 101',
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

    // Filter out incomplete MCQs (hallucination safety net)
    questions = questions.filter(q => {
      if (q.type === 'essay') return q.question && q.question.length > 5;
      return q.question && q.options && Object.keys(q.options).length >= 2 && q.correct_answer;
    });

    // Enforce the user-selected question type server-side
    if (questionType === 'mcq') {
      questions = questions.filter(q => q.type !== 'essay');
    } else if (questionType === 'essay') {
      questions = questions.filter(q => q.type === 'essay');
    }

    return res.status(200).json({
      success: true,
      count: questions.length,
      estimatedInSource: estimatedQuestions,
      truncated: finishReason === 'length',
      questions: questions,
    });

  } catch (error) {
    console.error('Groq AI Extraction Error:', error);
    return res.status(500).json({ 
      error: 'AI formatting failed: ' + error.message 
    });
  }
}
