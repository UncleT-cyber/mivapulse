export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { question, expectedCriteria, submission } = req.body;
        const apiKey = process.env.GROQ_API_KEY; 

        const systemPrompt = `You are an expert university professor grading essays. Your task is to provide an objective grade and a deeply detailed, constructive pedagogical analysis to help the student learn.

Grading Guidelines:
- Be realistic and unbiased. If a submission is empty or completely off-topic, award 0 marks for the categories.
- Crucially, even if a student scores 0, your explanation fields MUST be highly detailed, thorough, and educational. Use the "weaknesses" section to explain the concepts they missed, what they should have written, and how to master the topic based on the expected criteria.

You MUST respond with a raw JSON object matching this exact structure, with no markdown styling outside the text values:
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
  "generalOverview": "A thorough, 2-3 sentence academic paragraph summarizing the state of the submission.",
  "strengths": [
    "A deeply detailed analysis explaining any positive attempt or potential, mapping back to the criteria."
  ],
  "weaknesses": [
    "A thorough, multi-sentence breakdown of the first major missing concept, explaining what they should have included to meet the criteria.",
    "A thorough, multi-sentence breakdown of structural or analytical gaps, offering a detailed explanation of the target concept so they can learn from it."
  ]
}`;

        const userPrompt = `
[Question]
${question}

[Expected Criteria]
${expectedCriteria}

[Student Submission]
${submission}
`.trim();

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
                temperature: 0.3, // Slightly raised to 0.3 to unlock deeper writing and richer explanations
                response_format: { type: "json_object" },
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API responded with status code: ${response.status}`);
        }

        const data = await response.json();
        const rubrics = JSON.parse(data.choices[0].message.content);

        // Re-injecting the detailed paragraphs back into your custom styled container
        const formattedEvaluationHtml = `
<div class="evaluation-container">
    <div style="text-align: center; margin-bottom: 20px;">
        <span style="font-size: 2.5rem; font-weight: bold; color: #a855f7;">${rubrics.totalScore}/100</span>
        <div style="font-size: 1.2rem; color: #9ca3af; margin-top: 5px;">Grade: <strong>${rubrics.letterGrade}</strong></div>
    </div>

    <hr style="border-color: #374151; margin: 15px 0;" />

    <h3 style="color: #c084fc; font-size: 1.1rem; margin-bottom: 10px;">Grading Breakdown:</h3>
    <ul style="list-style: none; padding-left: 0; line-height: 1.8; margin-bottom: 15px;">
        <li><strong>Content:</strong> ${rubrics.contentScore} / ${rubrics.contentMax}</li>
        <li><strong>Organization and Structure:</strong> ${rubrics.orgScore} / ${rubrics.orgMax}</li>
        <li><strong>Analytical Depth and Context:</strong> ${rubrics.depthScore} / ${rubrics.depthMax}</li>
        <li><strong>Writing Style and Conventions:</strong> ${rubrics.styleScore} / ${rubrics.styleMax}</li>
    </ul>

    <p style="line-height: 1.6; color: #e5e7eb; margin-bottom: 15px;">${rubrics.generalOverview}</p>

    <hr style="border-color: #374151; margin: 15px 0;" />

    <h3 style="color: #c084fc; font-size: 1.1rem; margin-bottom: 8px;">Strengths:</h3>
    <ul style="padding-left: 20px; line-height: 1.6; margin-bottom: 15px; color: #e5e7eb;">
        ${rubrics.strengths.map(s => `<li style="margin-bottom: 8px;">${s}</li>`).join('')}
    </ul>

    <h3 style="color: #f87171; font-size: 1.1rem; margin-bottom: 8px;">Constructive Critique & Missing Concepts:</h3>
    <ul style="padding-left: 20px; line-height: 1.6; color: #e5e7eb;">
        ${rubrics.weaknesses.map(w => `<li style="margin-bottom: 8px;">${w}</li>`).join('')}
    </ul>
</div>
        `.trim();

        return res.status(200).json({ evaluation: formattedEvaluationHtml });

    } catch (error) {
        console.error("Groq Cloud Invocation Error: ", error);
        return res.status(500).json({ 
            error: "Internal Server Error during cloud evaluation", 
            details: error.message 
        });
    }
}