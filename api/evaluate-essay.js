export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { question, expectedCriteria, submission } = req.body;
        const apiKey = process.env.GROQ_API_KEY; 

        // 1. The Strict, Realistic System Rubric
        const systemPrompt = `You are a realistic, completely unbiased university professor grading essays. 
Your job is to evaluate the student's submission strictly based on the question and expected criteria. 

Grading Guidelines:
- If a submission is empty, completely meaningless, or brief gibberish, you MUST grade it strictly (fail it with very low marks).
- Do not give courtesy points just for trying. Award marks only for actual substance, depth, and structural alignment with the criteria.
- Be fair: if a student actually provides meaningful, accurate paragraphs, score them appropriately.

You MUST respond with a raw JSON object matching this exact structure, with no markdown formatting and no conversational text outside the JSON:
{
  "contentScore": 0,
  "contentMax": 40,
  "orgScore": 0,
  "orgMax": 20,
  "depthScore": 0,
  "depthMax": 20,
  "styleScore": 0,
  "styleMax": 20,
  "totalScore": 0,
  "letterGrade": "F",
  "strengths": ["Point 1", "Point 2"],
  "weaknesses": ["Point 1", "Point 2"]
}`;

        const userPrompt = `
[Question]
${question}

[Expected Criteria]
${expectedCriteria}

[Student Submission]
${submission}
`.trim();

        // 2. Fetching from Groq with strict JSON constraints
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant', 
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.1, // Dropped to 0.1 for high consistency and strict unbiased grading
                response_format: { type: "json_object" }, // Forces Groq to output pure JSON
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API responded with status code: ${response.status}`);
        }

        const data = await response.json();
        
        // 3. Parse Groq's structured JSON response
        const rubrics = JSON.parse(data.choices[0].message.content);

        // 4. Generate a clean HTML UI structure to send straight to your current frontend component
        const formattedEvaluationHtml = `
<div class="evaluation-container">
    <div style="text-align: center; margin-bottom: 20px;">
        <span style="font-size: 2.5rem; font-weight: bold; color: #a855f7;">${rubrics.totalScore}/100</span>
        <div style="font-size: 1.2rem; color: #9ca3af; margin-top: 5px;">Grade: <strong>${rubrics.letterGrade}</strong></div>
    </div>

    <hr style="border-color: #374151; margin: 15px 0;" />

    <h3 style="color: #c084fc; font-size: 1.1rem; margin-bottom: 10px;">Grading Breakdown:</h3>
    <ul style="list-style: none; padding-left: 0; line-height: 1.8;">
        <li><strong>Content:</strong> ${rubrics.contentScore} / ${rubrics.contentMax}</li>
        <li><strong>Organization and Structure:</strong> ${rubrics.orgScore} / ${rubrics.orgMax}</li>
        <li><strong>Analytical Depth and Context:</strong> ${rubrics.depthScore} / ${rubrics.depthMax}</li>
        <li><strong>Writing Style and Conventions:</strong> ${rubrics.styleScore} / ${rubrics.styleMax}</li>
    </ul>

    <hr style="border-color: #374151; margin: 15px 0;" />

    <h3 style="color: #c084fc; font-size: 1.1rem; margin-bottom: 5px;">Strengths:</h3>
    <ul style="padding-left: 20px; line-height: 1.6; margin-bottom: 15px;">
        ${rubrics.strengths.map(s => `<li>${s}</li>`).join('')}
    </ul>

    <h3 style="color: #f87171; font-size: 1.1rem; margin-bottom: 5px;">Areas for Improvement:</h3>
    <ul style="padding-left: 20px; line-height: 1.6;">
        ${rubrics.weaknesses.map(w => `<li>${w}</li>`).join('')}
    </ul>
</div>
        `.trim();

        // 5. Send it back using your original payload key so the UI matches up natively!
        return res.status(200).json({ evaluation: formattedEvaluationHtml });

    } catch (error) {
        console.error("Groq Cloud Invocation Error: ", error);
        return res.status(500).json({ 
            error: "Internal Server Error during cloud evaluation", 
            details: error.message 
        });
    }
}