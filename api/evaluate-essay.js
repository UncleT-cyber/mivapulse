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
                temperature: 0.4, 
                response_format: { type: "json_object" },
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API responded with status code: ${response.status}`);
        }

        const data = await response.json();
        const rubrics = JSON.parse(data.choices[0].message.content);

        // --- NEW: CLEAN UP GAPS AND FORMAT THE PARAGRAPHS SAFELY ---
        // 1. Remove extreme consecutive newline artifacts (\n\n\n\n...)
        let deepDiveCleaned = rubrics.topicDeepDive.replace(/\n{3,}/g, '\n\n').trim();
        
        // 2. Convert standard dual newlines into clean, short margin paragraph blocks
        let deepDiveHtml = deepDiveCleaned
            .split('\n\n')
            .map(para => `<p style="margin: 0 0 8px 0; padding: 0; font-size: 0.85rem; line-height: 1.5; color: #e5e7eb;">${para.replace(/\n/g, '<br>')}</p>`)
            .join('');
        // -----------------------------------------------------------

        // We wrap everything tightly to override the frontend's heavy vertical spacing rules
        const formattedEvaluationHtml = `
<div style="font-family: inherit; color: #e5e7eb; display: block; padding: 0; margin: 0; text-align: left;">
    
    <!-- Ultra-Compact Header Score Row -->
    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(168, 85, 247, 0.1); padding: 10px 14px; border-radius: 8px; margin: 0 0 10px 0; border: 1px solid rgba(168, 85, 247, 0.2); line-height: 1.2;">
        <div>
            <div style="font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; margin: 0; padding: 0;">Overall Score</div>
            <span style="font-size: 1.6rem; font-weight: bold; color: #c084fc; margin: 0; padding: 0;">${rubrics.totalScore}<span style="font-size: 0.9rem; color: #6b7280;">/100</span></span>
        </div>
        <div style="text-align: right;">
            <div style="font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; margin: 0; padding: 0;">Grade</div>
            <span style="font-size: 1.5rem; font-weight: bold; color: #f43f5e; margin: 0; padding: 0;">${rubrics.letterGrade}</span>
        </div>
    </div>

    <!-- Compact Grid for Categorized Scores -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0 0 12px 0; font-size: 0.8rem; background: rgba(255,255,255,0.03); padding: 8px 10px; border-radius: 6px; line-height: 1.3;">
        <div><span style="color: #9ca3af;">Content:</span> <strong style="color: #fff;">${rubrics.contentScore}/${rubrics.contentMax}</strong></div>
        <div><span style="color: #9ca3af;">Structure:</span> <strong style="color: #fff;">${rubrics.orgScore}/${rubrics.orgMax}</strong></div>
        <div><span style="color: #9ca3af;">Depth:</span> <strong style="color: #fff;">${rubrics.depthScore}/${rubrics.depthMax}</strong></div>
        <div><span style="color: #9ca3af;">Style:</span> <strong style="color: #fff;">${rubrics.styleScore}/${rubrics.styleMax}</strong></div>
    </div>

    <!-- Content Blocks Wrapped To Avoid Global Modal Spacing Rules -->
    <div style="margin: 0 0 10px 0; padding: 0;">
        <h3 style="color: #c084fc; font-size: 0.95rem; margin: 0 0 4px 0; padding: 0; font-weight: 600;">🎯 Strengths</h3>
        <ul style="padding-left: 16px; margin: 0; font-size: 0.85rem; line-height: 1.4; color: #d1d5db;">
            ${rubrics.strengths.map(s => `<li style="margin-bottom: 3px;">${s}</li>`).join('')}
        </ul>
    </div>

    <div style="margin: 0 0 12px 0; padding: 0;">
        <h3 style="color: #f87171; font-size: 0.95rem; margin: 0 0 4px 0; padding: 0; font-weight: 600;">⚠️ Areas for Improvement</h3>
        <ul style="padding-left: 16px; margin: 0; font-size: 0.85rem; line-height: 1.4; color: #d1d5db;">
            ${rubrics.weaknesses.map(w => `<li style="margin-bottom: 3px;">${w}</li>`).join('')}
        </ul>
    </div>

    <!-- Master Deep Dive Tutorial Section -->
    <div style="background: rgba(30, 41, 59, 0.4); padding: 10px 12px; border-radius: 6px; border-left: 3px solid #3b82f6; margin: 0; text-align: left;">
        <h3 style="color: #60a5fa; font-size: 0.95rem; margin: 0 0 6px 0; padding: 0; font-weight: 600;">
            📖 Topic Masterclass
        </h3>
        <!-- Render the pre-processed and formatted paragraph blocks safely -->
        ${deepDiveHtml}
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