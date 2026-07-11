export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { question, expectedCriteria, submission } = req.body;
        const apiKey = process.env.GROQ_API_KEY; 

        const systemPrompt = `You are a world-class academic mentor and tough university examiner. Your task is to provide an objective score while using any weaknesses as a deep teaching opportunity to ensure the student thoroughly masters the core topic.

Grading & Mentorship Protocol:
1. Be highly realistic and unbiased with the numerical scores. 
2. In the "topicDeepDive" section, analyze where the student struggled, look into the specific subject matter or architectural topic, and write a thorough, detailed explanation of the ideal theoretical concept. Teach it so clearly that a student who failed completely understands exactly how the mechanism works.

You MUST respond with a raw JSON object matching this exact structure, with no markdown styling outside text values:
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
  "strengths": ["A clear, high-value point regarding what they got right."],
  "weaknesses": ["A precise critique pointing out what was structurally or argumentatively missing."],
  "topicDeepDive": "A comprehensive, highly detailed educational breakdown of the target topic. Go deep into the subject matter, explain the core concepts, theory, or architectural designs they failed to grasp or fully articulate, and explain why it works that way so they truly learn the concept."
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
                temperature: 0.4, // Unlocks maximum descriptive capability for the topic tutorial
                response_format: { type: "json_object" },
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API responded with status code: ${response.status}`);
        }

        const data = await response.json();
        const rubrics = JSON.parse(data.choices[0].message.content);

        // A beautifully compacted mobile layout that keeps the reading space clean
        const formattedEvaluationHtml = `
<div class="evaluation-container" style="font-family: inherit; color: #e5e7eb;">
    
    <!-- Ultra-Compact Header Score Row -->
    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(168, 85, 247, 0.1); padding: 12px 16px; border-radius: 8px; margin-bottom: 15px; border: 1px solid rgba(168, 85, 247, 0.2);">
        <div>
            <div style="font-size: 0.85rem; color: #9ca3af; text-transform: uppercase; tracking-wider;">Overall Score</div>
            <span style="font-size: 1.8rem; font-weight: bold; color: #c084fc;">${rubrics.totalScore}<span style="font-size: 1rem; color: #6b7280;">/100</span></span>
        </div>
        <div style="text-align: right;">
            <div style="font-size: 0.85rem; color: #9ca3af; text-transform: uppercase;">Grade</div>
            <span style="font-size: 1.6rem; font-weight: bold; color: #f43f5e;">${rubrics.letterGrade}</span>
        </div>
    </div>

    <!-- Compact 2x2 Grid for Categorized Scores -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px; font-size: 0.85rem; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 6px;">
        <div><span style="color: #9ca3af;">Content:</span> <strong style="color: #fff;">${rubrics.contentScore}/${rubrics.contentMax}</strong></div>
        <div><span style="color: #9ca3af;">Structure:</span> <strong style="color: #fff;">${rubrics.orgScore}/${rubrics.orgMax}</strong></div>
        <div><span style="color: #9ca3af;">Depth:</span> <strong style="color: #fff;">${rubrics.depthScore}/${rubrics.depthMax}</strong></div>
        <div><span style="color: #9ca3af;">Style:</span> <strong style="color: #fff;">${rubrics.styleScore}/${rubrics.styleMax}</strong></div>
    </div>

    <hr style="border-color: #27272a; margin: 12px 0;" />

    <!-- Core Critiques -->
    <h3 style="color: #c084fc; font-size: 1rem; margin: 0 0 4px 0;">🎯 Strengths</h3>
    <ul style="padding-left: 18px; margin: 0 0 12px 0; font-size: 0.9rem; line-height: 1.5; color: #d1d5db;">
        ${rubrics.strengths.map(s => `<li>${s}</li>`).join('')}
    </ul>

    <h3 style="color: #f87171; font-size: 1rem; margin: 0 0 4px 0;">⚠️ Areas for Improvement</h3>
    <ul style="padding-left: 18px; margin: 0 0 15px 0; font-size: 0.9rem; line-height: 1.5; color: #d1d5db;">
        ${rubrics.weaknesses.map(w => `<li>${w}</li>`).join('')}
    </ul>

    <!-- Master Deep Dive Tutorial Section -->
    <div style="background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-top: 15px;">
        <h3 style="color: #60a5fa; font-size: 1rem; margin: 0 0 6px 0; display: flex; align-items: center; gap: 6px;">
            📖 Topic Masterclass
        </h3>
        <p style="font-size: 0.9rem; line-height: 1.6; color: #e5e7eb; margin: 0;">
            ${rubrics.topicDeepDive}
        </p>
    </div>

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