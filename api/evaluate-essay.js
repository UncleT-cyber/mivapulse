export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { question, expectedCriteria, submission } = req.body;
        const apiKey = process.env.GROQ_API_KEY; 

        const systemPrompt = `You are a world-class academic mentor and tough university examiner. Your task is to provide an objective score while using any weaknesses as a deep teaching opportunity to ensure the student thoroughly masters the core topic.

Grading & Mentorship Protocol:
1. Be highly realistic, hyper-critical, and completely unbiased with the numerical scores. If the submission lacks depth or structure, grade it strictly.
2. In the "statusAssessment" section, analyze whether they passed or failed. Give a direct reality check on their conceptual gaps and a direct mandate on where they must sit up immediately.

You MUST respond with a raw JSON object matching this exact structure, with no markdown formatting inside the values:
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
  "statusAssessment": "Direct analysis of their pass/fail standing and a blunt reality check on where they need to sit up immediately.",
  "strengths": ["A clear point regarding what they got right."],
  "weaknesses": ["A precise critique pointing out what was missing."],
  "topicDeepDive": "A comprehensive, highly detailed educational breakdown of the target topic."
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
                model: 'openai/gpt-oss-20b',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3, 
                response_format: { type: "json_object" },
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API responded with status code: ${response.status}`);
        }

        const data = await response.json();
       // Clean out any accidental markdown wrapper code blocks injected by the LLM
        let rawContent = data.choices[0].message.content.trim();
        if (rawContent.startsWith("```json")) {
            rawContent = rawContent.substring(7, rawContent.length - 3).trim();
        } else if (rawContent.startsWith("```")) {
            rawContent = rawContent.substring(3, rawContent.length - 3).trim();
        }

        const rubrics = JSON.parse(rawContent);

        // Standardize paragraphs for the masterclass block, using adaptive text colors
        const deepDiveParagraphs = rubrics.topicDeepDive
            .split('\n\n')
            .filter(p => p.trim().length > 0)
            .map(p => `<p style="margin: 0 0 6px 0 !important; padding: 0 !important; font-size: 0.85rem; line-height: 1.35; color: currentColor !important; opacity: 0.85; display: block;">${p.replace(/\n/g, '<br>')}</p>`)
            .join('');

        // Using "currentColor" and standard semantic opacity scales for dynamic themes
        const formattedEvaluationHtml = `
<div style="font-family: inherit; color: currentColor !important; text-align: left; margin: 0 !important; padding: 0 !important; display: block; line-height: 1.3; height: auto !important;">
    
    <!-- 1. Header Metrics Block (Semi-transparent bounds that morph on dark/light surfaces) -->
    <table style="width: 100%; border-collapse: collapse; margin: 0 0 8px 0 !important; background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 6px;">
        <tr>
            <td style="padding: 6px 10px; vertical-align: middle;">
                <div style="font-size: 0.68rem; color: currentColor !important; opacity: 0.6; text-transform: uppercase; margin: 0; padding: 0;">Overall Score</div>
                <span style="font-size: 1.3rem; font-weight: bold; color: #c084fc; line-height: 1;">${rubrics.totalScore}<span style="font-size: 0.8rem; color: currentColor !important; opacity: 0.4;">/100</span></span>
            </td>
            <td style="padding: 6px 10px; text-align: right; vertical-align: middle;">
                <div style="font-size: 0.68rem; color: currentColor !important; opacity: 0.6; text-transform: uppercase; margin: 0; padding: 0;">Grade</div>
                <span style="font-size: 1.3rem; font-weight: bold; color: #f43f5e; line-height: 1;">${rubrics.letterGrade}</span>
            </td>
        </tr>
    </table>

    <!-- 2. Detailed Scores Mini Table -->
    <table style="width: 100%; border-collapse: collapse; margin: 0 0 10px 0 !important; font-size: 0.78rem; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.05); border-radius: 4px;">
        <tr>
            <td style="padding: 4px 6px; color: currentColor !important; opacity: 0.75;">Content: <strong style="color: currentColor !important;">${rubrics.contentScore}/${rubrics.contentMax}</strong></td>
            <td style="padding: 4px 6px; color: currentColor !important; opacity: 0.75;">Structure: <strong style="color: currentColor !important;">${rubrics.orgScore}/${rubrics.orgMax}</strong></td>
        </tr>
        <tr>
            <td style="padding: 4px 6px; color: currentColor !important; opacity: 0.75;">Depth: <strong style="color: currentColor !important;">${rubrics.depthScore}/${rubrics.depthMax}</strong></td>
            <td style="padding: 4px 6px; color: currentColor !important; opacity: 0.75;">Style: <strong style="color: currentColor !important;">${rubrics.styleScore}/${rubrics.styleMax}</strong></td>
        </tr>
    </table>

    <!-- 3. Status Assessment -->
    <div style="margin: 0 0 10px 0 !important; padding: 0 !important; display: block;">
        <h3 style="color: #0284c7; font-size: 0.88rem; margin: 0 0 3px 0 !important; padding: 0 !important; font-weight: 700; line-height: 1.2;">📢 Status Assessment</h3>
        <p style="font-size: 0.83rem; line-height: 1.35; color: currentColor !important; margin: 0 !important; padding: 0 !important;">${rubrics.statusAssessment}</p>
    </div>

    <!-- 4. Strengths -->
    <div style="margin: 0 0 10px 0 !important; padding: 0 !important; display: block;">
        <h3 style="color: #16a34a; font-size: 0.88rem; margin: 0 0 3px 0 !important; padding: 0 !important; font-weight: 700; line-height: 1.2;">🎯 Strengths</h3>
        <ul style="padding-left: 14px !important; margin: 0 !important; font-size: 0.83rem; line-height: 1.35; color: currentColor !important; opacity: 0.9;">
            ${rubrics.strengths.length > 0 
                ? rubrics.strengths.map(s => `<li style="margin: 0 0 2px 0 !important; padding: 0 !important;">${s}</li>`).join('')
                : `<li style="list-style: none; margin: 0; padding: 0; opacity: 0.6; font-style: italic;">None identified for this attempt.</li>`
            }
        </ul>
    </div>

    <!-- 5. Areas for Improvement -->
    <div style="margin: 0 0 12px 0 !important; padding: 0 !important; display: block;">
        <h3 style="color: #dc2626; font-size: 0.88rem; margin: 0 0 3px 0 !important; padding: 0 !important; font-weight: 700; line-height: 1.2;">⚠️ Areas for Improvement</h3>
        <ul style="padding-left: 14px !important; margin: 0 !important; font-size: 0.83rem; line-height: 1.35; color: currentColor !important; opacity: 0.9;">
            ${rubrics.weaknesses.map(w => `<li style="margin: 0 0 2px 0 !important; padding: 0 !important;">${w}</li>`).join('')}
        </ul>
    </div>

    <!-- 6. Topic Masterclass -->
    <div style="background: rgba(59, 130, 246, 0.08); padding: 8px 10px !important; border-radius: 6px; border-left: 3px solid #2563eb; margin: 0 !important; display: block;">
        <h3 style="color: #2563eb; font-size: 0.88rem; margin: 0 0 4px 0 !important; padding: 0 !important; font-weight: 700; line-height: 1.2;">📖 Topic Masterclass</h3>
        ${deepDiveParagraphs}
    </div>
</div>
        `.trim();

        // Collapse text into a single flat line to avoid layout vertical spacing issues
        const cleanedEvaluationHtml = formattedEvaluationHtml.replace(/\n/g, '').replace(/\s+/g, ' ');

        return res.status(200).json({ evaluation: cleanedEvaluationHtml });

    } catch (error) {
        console.error("Groq Cloud Invocation Error: ", error);
        return res.status(500).json({ 
            error: "Internal Server Error during cloud evaluation", 
            details: error.message 
        });
    }
}