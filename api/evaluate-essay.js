export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { question, expectedCriteria, submission } = req.body;

        // 2. Formulate the evaluation prompt text
        const promptText = `
You are an expert academic evaluator. Please grade the following student essay submission.

[Question]
${question}

[Expected Criteria]
${expectedCriteria}

[Student Submission]
${submission}

Provide a constructive breakdown and a final letter grade.
`.trim();

        // 3. Smart Endpoint Selector
        // If running locally, hit localhost. If live on Vercel, hit your public DuckDNS address.
        const ollamaHost = process.env.VERCEL_ENV 
            ? "http://nexus-mentor.duckdns.org:11434" 
            : "http://127.0.0.1:11434";

        // 4. Send the request to Ollama's native generation API
        const response = await fetch(`${ollamaHost}/api/generate`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                model: 'llama3.2:latest', // <-- Updated to perfectly match your downloaded model!
                prompt: promptText,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama Node responded with status code: ${response.status}`);
        }

        const data = await response.json();
        
        // 5. Safely return Ollama's generated critique back to your UI
        return res.status(200).json({ evaluation: data.response });

    } catch (error) {
        console.error("Ollama Node Invocation Error: ", error);
        return res.status(500).json({ 
            error: "Internal Server Error during Ollama evaluation", 
            details: error.message 
        });
    }
}