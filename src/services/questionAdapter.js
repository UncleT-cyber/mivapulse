/* ==========================================================================
   MIVAPULSE v2 - UNIVERSAL QUESTION ADAPTER LAYER
   Decouples quiz engine from static JSON files.
   Supports: GLOBAL_DB (REST API), PERSONAL_SANDBOX (localStorage), PENDING_REVIEW
   ========================================================================== */

const QuestionAdapter = (() => {
    // Unified QuestionItem interface (documented, not enforced in vanilla JS)
    // {
    //   id: string,
    //   courseCode: string,
    //   faculty: string,
    //   level: 100|200|300|400,
    //   type: 'MCQ'|'ESSAY',
    //   questionText: string,
    //   options?: string[],
    //   correctAnswer?: string|number,
    //   rubric?: string,
    //   explanation?: string,
    //   source: 'GLOBAL_DB'|'PERSONAL_SANDBOX'|'PENDING_REVIEW'
    // }

    const API_BASE = '/api/v2';

    /**
     * Fetch questions from the specified source with filtering params.
     * @param {Object} params
     * @param {string} params.source - 'GLOBAL_DB' | 'PERSONAL_SANDBOX' | 'PENDING_REVIEW'
     * @param {string} [params.faculty]
     * @param {number} [params.level]
     * @param {string} [params.courseCode]
     * @param {string} [params.type] - 'MCQ' | 'ESSAY'
     * @param {number} [params.limit]
     * @returns {Promise<QuestionItem[]>}
     */
    async function fetchQuestions(params = {}) {
        const { source = 'GLOBAL_DB', faculty, level, courseCode, type, limit } = params;

        switch (source) {
            case 'GLOBAL_DB':
                return _fetchFromGlobalDB({ faculty, level, courseCode, type, limit });
            case 'PERSONAL_SANDBOX':
                return _fetchFromSandbox({ faculty, level, courseCode, type, limit });
            case 'PENDING_REVIEW':
                return _fetchPendingReview({ faculty, level, courseCode, type, limit });
            default:
                console.warn(`Unknown source "${source}", falling back to GLOBAL_DB`);
                return _fetchFromGlobalDB({ faculty, level, courseCode, type, limit });
        }
    }

    /**
     * Fetch from the global REST backend.
     * Falls back to static JSON files if API is unavailable (legacy compat).
     */
    async function _fetchFromGlobalDB({ faculty, level, courseCode, type, limit }) {
        // Try REST API first
        try {
            const query = new URLSearchParams();
            if (faculty) query.set('faculty', faculty);
            if (level) query.set('level', level);
            if (courseCode) query.set('course', courseCode);
            if (type) query.set('type', type);
            if (limit) query.set('limit', limit);

            const res = await fetch(`${API_BASE}/questions?${query.toString()}`, {
                headers: { 'Accept': 'application/json' }
            });

            if (res.ok) {
                const data = await res.json();
                return (data.questions || data || []).map(q => ({
                    ..._normalizeQuestion(q),
                    source: 'GLOBAL_DB'
                }));
            }
        } catch (err) {
            console.warn('Global DB API unavailable, falling back to static files:', err.message);
        }

        // Legacy fallback: fetch from static JSON data files
        return _fetchFromStaticFiles({ faculty, level, courseCode, limit });
    }

    /**
     * Legacy static file loader (backward compatible with existing data/ structure).
     */
    async function _fetchFromStaticFiles({ faculty, level, courseCode, limit }) {
        // courseCode here is actually the file path from manifest
        if (!courseCode) return [];

        try {
            const res = await fetch(`data/${courseCode}`);
            if (!res.ok) throw new Error(`Static file not found: ${courseCode}`);
            const data = await res.json();

            let questions = data.map(q => ({
                ..._normalizeQuestion(q),
                source: 'GLOBAL_DB'
            }));

            // Shuffle
            for (let i = questions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [questions[i], questions[j]] = [questions[j], questions[i]];
            }

            if (limit && limit !== 'all') {
                questions = questions.slice(0, parseInt(limit, 10));
            }

            return questions;
        } catch (err) {
            console.error('Static file load error:', err);
            return [];
        }
    }

    /**
     * Fetch from Personal Sandbox (localStorage).
     */
    function _fetchFromSandbox({ faculty, level, courseCode, type, limit }) {
        const key = 'mivapulse_sandbox_questions';
        let questions = [];

        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                questions = JSON.parse(raw);
            }
        } catch (err) {
            console.warn('Sandbox parse error:', err);
        }

        // Apply filters
        if (faculty) questions = questions.filter(q => q.faculty === faculty);
        if (level) questions = questions.filter(q => q.level === parseInt(level));
        if (courseCode) questions = questions.filter(q => q.courseCode === courseCode);
        if (type) questions = questions.filter(q => q.type === type);

        // Shuffle
        for (let i = questions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questions[i], questions[j]] = [questions[j], questions[i]];
        }

        if (limit && limit !== 'all') {
            questions = questions.slice(0, parseInt(limit, 10));
        }

        return questions.map(q => ({ ...q, source: 'PERSONAL_SANDBOX' }));
    }

    /**
     * Fetch pending review questions (from backend API).
     */
    async function _fetchPendingReview({ faculty, level, courseCode, type, limit }) {
        try {
            const query = new URLSearchParams();
            if (faculty) query.set('faculty', faculty);
            if (level) query.set('level', level);
            if (courseCode) query.set('course', courseCode);
            if (type) query.set('type', type);

            const token = localStorage.getItem('mivapulse_auth_token');
            const res = await fetch(`${API_BASE}/contributions?${query.toString()}`, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token || ''}`
                }
            });

            if (!res.ok) throw new Error(`Pending review fetch failed: ${res.status}`);
            const data = await res.json();
            let questions = (data.contributions || data || []).map(q => ({
                ..._normalizeQuestion(q),
                source: 'PENDING_REVIEW'
            }));

            if (limit && limit !== 'all') {
                questions = questions.slice(0, parseInt(limit, 10));
            }

            return questions;
        } catch (err) {
            console.error('Pending review fetch error:', err);
            return [];
        }
    }

    /**
     * Normalize a raw question object into the QuestionItem shape.
     */
    function _normalizeQuestion(raw) {
        const q = {
            id: raw.id || raw._id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            courseCode: raw.courseCode || raw.course_code || raw.code || '',
            faculty: raw.faculty || '',
            level: parseInt(raw.level) || 100,
            type: (raw.type || 'MCQ').toUpperCase(),
            questionText: raw.questionText || raw.question || raw.prompt || '',
            options: null,
            correctAnswer: raw.correctAnswer ?? raw.correct_answer ?? null,
            rubric: raw.rubric || raw.key_points_expected || '',
            explanation: raw.explanation || '',
            source: raw.source || 'GLOBAL_DB'
        };

        // Normalize options: support both object {A, B, C, D} and array formats
        if (raw.options) {
            if (Array.isArray(raw.options)) {
                q.options = raw.options;
            } else if (typeof raw.options === 'object') {
                q.options = Object.entries(raw.options)
                    .filter(([k, v]) => v)
                    .map(([k, v]) => `${k}: ${v}`);
            }
        }

        return q;
    }

    /**
     * Save questions to Personal Sandbox (localStorage).
     */
    function saveToSandbox(questions) {
        try {
            const existing = _fetchFromSandbox({});
            const merged = [...existing, ...questions.map(q => ({
                ...q,
                source: 'PERSONAL_SANDBOX',
                id: q.id || `sbx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
            }))];
            localStorage.setItem('mivapulse_sandbox_questions', JSON.stringify(merged));
            return true;
        } catch (err) {
            console.error('Sandbox save error:', err);
            return false;
        }
    }

    /**
     * Clear Personal Sandbox questions.
     */
    function clearSandbox() {
        localStorage.removeItem('mivapulse_sandbox_questions');
    }

    /**
     * Submit a question contribution to the global bank.
     */
    async function submitContribution(question, userMeta = {}) {
        try {
            const token = localStorage.getItem('mivapulse_auth_token');
            const res = await fetch(`${API_BASE}/contributions/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token || ''}`
                },
                body: JSON.stringify({
                    question: {
                        ...question,
                        source: 'PENDING_REVIEW',
                        submittedBy: userMeta.userId || 'anonymous',
                        submittedAt: new Date().toISOString()
                    },
                    userMeta
                })
            });

            if (!res.ok) throw new Error(`Submission failed: ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error('Contribution submit error:', err);
            return { success: false, error: err.message };
        }
    }

    // Public API
    return {
        fetchQuestions,
        saveToSandbox,
        clearSandbox,
        submitContribution
    };
})();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuestionAdapter;
}
