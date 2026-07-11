export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { question, expectedCriteria, submission } = req.body;
        
        // Pulls your secret key securely from the Vercel environment variables we just set up
        const apiKey = process.env.GROQ_API_KEY; 

        // 2. Clear instructions to ensure structured, academic responses
        const systemPrompt = `You are an expert academic evaluator. You grade student essay submissions based strictly on the provided question and expected criteria.
        
Provide a constructive breakdown, specific highlights of strengths and weaknesses, and close with a final letter grade. Keep your layout clean, structured, and easy for a student to read.`;

        const userPrompt = `
[Question]
${question}

[Expected Criteria]
${expectedCriteria}

[Student Submission]
${submission}
`.trim();

        // 3. Connect to Groq's high-speed global cloud pipeline
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant', // Free tier powerhouse with ultra-high limits!
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3, // Keeps the grading rubric stable and objective
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API responded with status code: ${response.status}`);
        }

        const data = await response.json();
        
        // 4. Extract the critique string and output it exactly matching your original frontend layout
        const aiCritique = data.choices[0].message.content;
        return res.status(200).json({ evaluation: aiCritique });

    } catch (error) {
        console.error("Groq Cloud Invocation Error: ", error);
        return res.status(500).json({ 
            error: "Internal Server Error during cloud evaluation", 
            details: error.message 
        });
    }
}