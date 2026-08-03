/* ==========================================================================
   MIVAPULSE v2 - CONTRIBUTIONS API (Vercel Serverless)
   POST /api/v2/contributions/submit - Submit question for review
   GET  /api/v2/contributions - Fetch pending questions
   POST /api/v2/contributions/:action - Approve/Reject/Edit
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONTRIB_PATH = path.join(__dirname, '..', '..', 'data', 'contributions.json');
const QUESTIONS_PATH = path.join(__dirname, '..', '..', 'data', 'global_questions.json');

function loadJSON(filePath, fallback = []) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch { return fallback; }
}
function saveJSON(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const urlPath = req.url || '';

    // GET - Fetch contributions (with optional status filter)
    if (req.method === 'GET') {
        const contributions = loadJSON(CONTRIB_PATH);
        const status = req.query?.status || 'pending';
        const filtered = contributions.filter(c => c.status === status);
        return res.status(200).json({ success: true, contributions: filtered, total: filtered.length });
    }

    // POST - Submit or moderate
    if (req.method === 'POST') {
        const body = req.body || {};

        // Submit new contribution
        if (urlPath.endsWith('/submit')) {
            const contributions = loadJSON(CONTRIB_PATH);
            const entry = {
                id: crypto.randomUUID(),
                question: body.question || {},
                userMeta: body.userMeta || {},
                status: 'pending',
                submittedAt: new Date().toISOString(),
                reviewedBy: null,
                reviewedAt: null,
                reviewNotes: ''
            };
            contributions.push(entry);
            saveJSON(CONTRIB_PATH, contributions);
            return res.status(201).json({ success: true, id: entry.id });
        }

        // Approve contribution
        if (urlPath.endsWith('/approve')) {
            const { contributionId, editedQuestion } = body;
            const contributions = loadJSON(CONTRIB_PATH);
            const idx = contributions.findIndex(c => c.id === contributionId);
            if (idx === -1) return res.status(404).json({ error: 'Contribution not found' });

            contributions[idx].status = 'approved';
            contributions[idx].reviewedAt = new Date().toISOString();
            contributions[idx].reviewNotes = body.notes || '';

            // Promote to global questions
            const globalQs = loadJSON(QUESTIONS_PATH);
            const promoted = editedQuestion || contributions[idx].question;
            promoted.id = crypto.randomUUID();
            promoted.source = 'GLOBAL_DB';
            promoted.approvedAt = new Date().toISOString();
            globalQs.push(promoted);
            saveJSON(QUESTIONS_PATH, globalQs);
            saveJSON(CONTRIB_PATH, contributions);

            return res.status(200).json({ success: true, promotedId: promoted.id });
        }

        // Reject contribution
        if (urlPath.endsWith('/reject')) {
            const { contributionId } = body;
            const contributions = loadJSON(CONTRIB_PATH);
            const idx = contributions.findIndex(c => c.id === contributionId);
            if (idx === -1) return res.status(404).json({ error: 'Contribution not found' });

            contributions[idx].status = 'rejected';
            contributions[idx].reviewedAt = new Date().toISOString();
            contributions[idx].reviewNotes = body.notes || '';
            saveJSON(CONTRIB_PATH, contributions);

            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Unknown action. Use /submit, /approve, or /reject.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
