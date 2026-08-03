/* ==========================================================================
   MIVAPULSE v2 - NON-REPUDIATION AUDIT TRAIL ENGINE
   Append-only JSONL log with SHA-256 chain hashing for tamper evidence.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_LOG_PATH = path.join(__dirname, '..', '..', 'data', 'audit_trail.jsonl');

class AuditLogger {
    constructor() {
        this._lastHash = this._readLastHash();
    }

    /**
     * Read the integrity hash of the last audit entry for chain continuity.
     */
    _readLastHash() {
        try {
            if (!fs.existsSync(AUDIT_LOG_PATH)) return '';
            const content = fs.readFileSync(AUDIT_LOG_PATH, 'utf8').trim();
            if (!content) return '';
            const lines = content.split('\n');
            const lastLine = lines[lines.length - 1];
            const lastEntry = JSON.parse(lastLine);
            return lastEntry.integrityHash || '';
        } catch {
            return '';
        }
    }

    /**
     * Write an audit entry with chain hash integrity.
     */
    log({ actorId, actorRole, action, resourceId, previousState, newState, ipAddress }) {
        const payload = JSON.stringify({
            actorId: actorId || 'system',
            actorRole: actorRole || 'system',
            action: action || 'UNKNOWN',
            resourceId: resourceId || '',
            previousState: previousState || null,
            newState: newState || null,
            ipAddress: ipAddress || '127.0.0.1',
            timestamp: new Date().toISOString()
        });

        const chainInput = (this._lastHash || '') + payload;
        const integrityHash = crypto.createHash('sha256').update(chainInput).digest('hex');

        const entry = {
            auditId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            actorId: actorId || 'system',
            actorRole: actorRole || 'system',
            action: action || 'UNKNOWN',
            resourceId: resourceId || '',
            previousState: previousState || null,
            newState: newState || null,
            ipAddress: ipAddress || '127.0.0.1',
            integrityHash: integrityHash
        };

        try {
            const dir = path.dirname(AUDIT_LOG_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
            this._lastHash = integrityHash;
            return entry;
        } catch (err) {
            console.error('Audit log write error:', err);
            return null;
        }
    }

    /**
     * Read all audit entries with optional filtering.
     */
    static readAll({ action, actorId, limit = 500 } = {}) {
        try {
            if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
            const content = fs.readFileSync(AUDIT_LOG_PATH, 'utf8').trim();
            if (!content) return [];

            let entries = content.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try { return JSON.parse(line); } catch { return null; }
                })
                .filter(Boolean);

            if (action) entries = entries.filter(e => e.action === action);
            if (actorId) entries = entries.filter(e => e.actorId === actorId);

            return entries.slice(-limit).reverse();
        } catch (err) {
            console.error('Audit log read error:', err);
            return [];
        }
    }

    /**
     * Verify the integrity chain of all audit entries.
     */
    static verifyChain() {
        try {
            if (!fs.existsSync(AUDIT_LOG_PATH)) return { valid: true, total: 0 };
            const content = fs.readFileSync(AUDIT_LOG_PATH, 'utf8').trim();
            if (!content) return { valid: true, total: 0 };

            const lines = content.split('\n').filter(l => l.trim());
            let lastHash = '';
            let valid = true;
            const invalidEntries = [];

            for (let i = 0; i < lines.length; i++) {
                const entry = JSON.parse(lines[i]);
                const payload = JSON.stringify({
                    actorId: entry.actorId,
                    actorRole: entry.actorRole,
                    action: entry.action,
                    resourceId: entry.resourceId,
                    previousState: entry.previousState,
                    newState: entry.newState,
                    ipAddress: entry.ipAddress,
                    timestamp: entry.timestamp
                });

                const chainInput = (lastHash || '') + payload;
                const expectedHash = crypto.createHash('sha256').update(chainInput).digest('hex');

                if (entry.integrityHash !== expectedHash) {
                    valid = false;
                    invalidEntries.push({ line: i + 1, auditId: entry.auditId });
                }
                lastHash = entry.integrityHash;
            }

            return { valid, total: lines.length, invalidEntries };
        } catch (err) {
            return { valid: false, error: err.message, total: 0 };
        }
    }
}

module.exports = new AuditLogger();
module.exports.AuditLogger = AuditLogger;
