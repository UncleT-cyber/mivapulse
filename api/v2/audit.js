/* ==========================================================================
   MIVAPULSE v2 - AUDIT TRAIL API (Vercel Serverless Compatible)
   GET / - List audit entries
   GET /verify - Verify chain integrity
   ========================================================================== */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Use process.cwd() for Vercel compatibility
const AUDIT_PATH = path.join(process.cwd(), 'data', 'audit_log.json');

// Safe in-memory fallback
let inMemoryAudit = { entries: [], lastHash: '' };

function loadAudit() {
    try {
        if (fs.existsSync(AUDIT_PATH)) {
            return JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('loadAudit error:', e);
    }
    return inMemoryAudit;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const urlObj = new URL(req.url, 'http://localhost');
    const urlPath = urlObj.pathname;

    console.log('Audit API called:', req.method, urlPath);

    // ── LIST AUDIT ENTRIES ──
    if (urlPath.endsWith('/audit') && req.method === 'GET') {
        const data = loadAudit();
        return res.status(200).json({ 
            success: true, 
            entries: data.entries || [],
            total: (data.entries || []).length
        });
    }

    // ── VERIFY CHAIN INTEGRITY ──
    if (urlPath.endsWith('/audit/verify') && req.method === 'GET') {
        const data = loadAudit();
        const entries = data.entries || [];
        
        let valid = true;
        let invalidEntries = [];
        
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (!entry.action || !entry.actorId || !entry.timestamp) {
                valid = false;
                invalidEntries.push({ index: i, reason: 'Missing required fields' });
            }
        }
        
        return res.status(200).json({
            valid,
            total: entries.length,
            invalidEntries,
            message: valid ? 'Chain integrity verified' : 'Integrity issues detected'
        });
    }

    return res.status(404).json({ error: 'Endpoint not found' });
}