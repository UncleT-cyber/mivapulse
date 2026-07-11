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
2. In the "Status Assessment" section, explicitly address their pass/fail standing. If they failed (below 50/100), give them a stark reality check on their conceptual gaps and a direct mandate on where they must sit up. If they passed but have weak margins, expose their fragile spots. If they aced it, validate their mastery but give them a higher-level thought experiment.
3. Structure your response using clean, standard Markdown headers (###).

Your response must strictly follow this text layout:
### 📊 Academic Evaluation
**Overall Score:** [Score]/100
**Letter Grade:** [Grade]

| Metric | Score |
| :--- | :--- |
| Content | [Score]/40 |
| Structure | [Score]/20 |
| Depth | [Score]/20 |
| Style | [Score]/20 |

### 📢 Status Assessment
[Direct, conversational breakdown analyzing whether they passed or failed, what that means for their actual comprehension of the course material, and a blunt reality check on where they need to sit up immediately to bridge the knowledge gap.]

### 🎯 Strengths
* [A clear, high-value point regarding what they got right.]

### ⚠️ Areas for Improvement
* [A precise critique pointing out what was structurally or argumentatively missing.]

### 📖 Topic Masterclass
[Write a comprehensive, highly detailed educational breakdown of the target topic. Go deep into the subject matter, explain the core concepts, theory, or architectural designs they failed to grasp, and explain why it works that way so they truly learn the concept. Do not add excessive vertical paragraph breaks.]`;

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
                temperature: 0.3, 
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API responded with status code: ${response.status}`);
        }

        const data = await response.json();
        const evaluationText = data.choices[0].message.content;

        return res.status(200).json({ evaluation: evaluationText });

    } catch (error) {
        console.error("Groq Invocation Error: ", error);
        return res.status(500).json({ 
            error: "Internal Server Error during cloud evaluation", 
            details: error.message 
        });
    }
}