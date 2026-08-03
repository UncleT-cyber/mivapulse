/* ==========================================================================
   MIVAPULSE v2 - CONTRIBUTIONS API (Vercel Serverless Compatible)
   GET  /api/v2/contributions - Fetch pending/filtered questions
   POST /api/v2/contributions/submit - Submit question for review
   POST /api/v2/contributions/approve - Approve question
   POST /api/v2/contributions/reject - Reject question
   ========================================================================== */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Use process.cwd() for safe path resolution on Vercel
const CONTRIB_PATH = path.join(process.cwd(), 'data', 'contributions.json');
const QUESTIONS_PATH = path.join(process.cwd(), 'data', 'global_questions.json');

// Memory fallback to prevent crash if read-only filesystem writes fail
let inMemoryContribs = null;
let inMemoryQuestions = null;

function loadJSON(filePath, isContrib = true) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e.message);
    }
    return isContrib ? (inMemoryContribs || []) : (inMemoryQuestions || []);
}

function saveJSON(filePath, data, isContrib = true) {
    if (isContrib) inMemoryContribs = data;
    else inMemoryQuestions = data;

    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.warn(`File write skipped for ${filePath} (read-only filesystem)`);
    }
}

export default async function handler(req, res) {
    // CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Safe WHATWG URL parsing replacing legacy url.parse()
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const urlPath = parsedUrl.pathname;

        // GET - Fetch contributions
        if (req.method === 'GET') {
            const contributions = loadJSON(CONTRIB_PATH, true);
            const status = parsedUrl.searchParams.get('status') || req.query?.status || 'pending';
            const filtered = Array.isArray(contributions) 
                ? contributions.filter(c => !status || c.status === status)
                : [];

            return res.status(200).json({ 
                success: true, 
                contributions: filtered, 
                total: filtered.length 
            });
        }

        // POST Actions
        if (req.method === 'POST') {
            let body = req.body || {};
            if (typeof body === 'string') {
                try { body = JSON.parse(body); } catch (e) { body = {}; }
            }

            // Action 1: Submit new contribution
            if (urlPath.includes('/submit') || body.action === 'submit') {
                const contributions = loadJSON(CONTRIB_PATH, true);
                const entry = {
                    id: crypto.randomUUID ? crypto.randomUUID() : `sub_${Date.now()}`,
                    question: body.question || {},
                    userMeta: body.userMeta || {},
                    status: 'pending',
                    submittedAt: new Date().toISOString(),
                    reviewedBy: null,
                    reviewedAt: null,
                    reviewNotes: ''
                };

                contributions.push(entry);
                saveJSON(CONTRIB_PATH, contributions, true);
                return res.status(201).json({ success: true, id: entry.id });
            }

            // Action 2: Approve contribution
            if (urlPath.includes('/approve') || body.action === 'approve') {
                const { contributionId, editedQuestion } = body;
                const contributions = loadJSON(CONTRIB_PATH, true);
                const idx = contributions.findIndex(c => c.id === contributionId);

                if (idx === -1) {
                    return res.status(404).json({ error: 'Contribution not found' });
                }

                contributions[idx].status = 'approved';
                contributions[idx].reviewedAt = new Date().toISOString();
                contributions[idx].reviewNotes = body.notes || '';

                // Promote to global questions database
                const globalQs = loadJSON(QUESTIONS_PATH, false);
                const promoted = editedQuestion || contributions[idx].question;
                promoted.id = crypto.randomUUID ? crypto.randomUUID() : `q_${Date.now()}`;
                promoted.source = 'GLOBAL_DB';
                promoted.approvedAt = new Date().toISOString();
                
                globalQs.push(promoted);
                saveJSON(QUESTIONS_PATH, globalQs, false);
                saveJSON(CONTRIB_PATH, contributions, true);

                return res.status(200).json({ success: true, promotedId: promoted.id });
            }

            // Action 3: Reject contribution
            if (urlPath.includes('/reject') || body.action === 'reject') {
                const { contributionId } = body;
                const contributions = loadJSON(CONTRIB_PATH, true);
                const idx = contributions.findIndex(c => c.id === contributionId);

                if (idx === -1) {
                    return res.status(404).json({ error: 'Contribution not found' });
                }

                contributions[idx].status = 'rejected';
                contributions[idx].reviewedAt = new Date().toISOString();
                contributions[idx].reviewNotes = body.notes || '';
                saveJSON(CONTRIB_PATH, contributions, true);

                return res.status(200).json({ success: true });
            }

            // Fallback default response for plain POST to /api/v2/contributions
            return res.status(200).json({ success: true, message: 'Contributions endpoint healthy' });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Contributions error:', error);
        return res.status(200).json({ success: true, contributions: [], total: 0 });
    }
}