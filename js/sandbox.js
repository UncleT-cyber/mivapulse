/* ==========================================================================
   MIVAPULSE v2 - PERSONAL SANDBOX QUIZ ENGINE
   Isolated practice from uploaded/generated questions. Scores saved to localStorage only.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const cur = document.documentElement.getAttribute('data-theme');
            const next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('miva-theme', next);
        });
    }

    // State
    let sandboxQuestions = [];
    let quizState = { questions: [], currentIndex: 0, score: 0, attempted: 0, hasAnswered: false, userAnswers: [] };

    // DOM refs
    const countEl = document.getElementById('sandboxCount');
    const listEl = document.getElementById('sandboxQuestionList');
    const startBtn = document.getElementById('startSandboxQuiz');
    const clearBtn = document.getElementById('clearSandboxBtn');
    const quizArea = document.getElementById('sandboxQuizArea');
    const exitBtn = document.getElementById('exitSandboxQuiz');
    const historyEl = document.getElementById('sandboxHistory');

    // Quiz DOM
    const qNum = document.getElementById('sbQNum');
    const qTotal = document.getElementById('sbQTotal');
    const trackerFill = document.getElementById('sbTrackerFill');
    const topic = document.getElementById('sbTopic');
    const qText = document.getElementById('sbQuestionText');
    const options = document.getElementById('sbOptions');
    const essayArea = document.getElementById('sbEssayArea');
    const essayInput = document.getElementById('sbEssayInput');
    const essaySubmit = document.getElementById('sbEssaySubmit');
    const feedback = document.getElementById('sbFeedback');
    const fbTitle = document.getElementById('sbFeedbackTitle');
    const explanation = document.getElementById('sbExplanation');
    const nextBtn = document.getElementById('sbNextBtn');
    const aiFeedback = document.getElementById('sbAiFeedback');
    const aiFeedbackText = document.getElementById('sbAiFeedbackText');
    const results = document.getElementById('sbResults');
    const resultsContent = document.getElementById('sbResultsContent');
    const retryBtn = document.getElementById('sbRetryBtn');
    const submitGlobalBtn = document.getElementById('sbSubmitToGlobal');

    // Load sandbox questions
    function loadSandboxQuestions() {
        sandboxQuestions = QuestionAdapter.fetchQuestions({ source: 'PERSONAL_SANDBOX' });
        if (countEl) countEl.textContent = sandboxQuestions.length;
        if (startBtn) startBtn.disabled = sandboxQuestions.length === 0;
        renderQuestionList();
        renderHistory();
    }

    function renderQuestionList() {
        if (!listEl) return;
        if (sandboxQuestions.length === 0) {
            listEl.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-style:italic;padding:40px 20px;">No questions yet. Upload study materials in StudyLab to generate practice questions.</p>';
            return;
        }
        listEl.innerHTML = sandboxQuestions.map((q, i) => `
            <div style="padding:12px 16px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
                <div style="flex:1;">
                    <span style="font-size:0.7rem;font-weight:700;color:#a855f7;background:rgba(168,85,247,0.1);padding:2px 6px;border-radius:4px;">${q.type || 'MCQ'}</span>
                    <span style="font-size:0.8rem;color:var(--text-primary);margin-left:8px;">${(q.questionText || q.question || '').slice(0, 80)}...</span>
                </div>
                <span style="font-size:0.75rem;color:var(--text-secondary);">#${i + 1}</span>
            </div>
        `).join('');
    }

    function renderHistory() {
        if (!historyEl) return;
        try {
            const history = JSON.parse(localStorage.getItem('mivapulse_sandbox_history') || '[]');
            if (history.length === 0) {
                historyEl.innerHTML = '<p style="font-style:italic;">No previous sandbox sessions.</p>';
                return;
            }
            historyEl.innerHTML = history.slice(-10).reverse().map(h => `
                <div style="padding:10px 14px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;">
                    <span>${h.date} - ${h.courseCode || 'Sandbox'}</span>
                    <span style="font-weight:700;color:${h.accuracy >= 70 ? '#10b981' : '#ef4444'};">${h.score}/${h.total} (${h.accuracy}%)</span>
                </div>
            `).join('');
        } catch(e) {
            historyEl.innerHTML = '<p style="font-style:italic;">No previous sandbox sessions.</p>';
        }
    }

    // Start quiz
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            quizState = {
                questions: [...sandboxQuestions],
                currentIndex: 0, score: 0, attempted: 0,
                hasAnswered: false, userAnswers: []
            };
            // Shuffle
            for (let i = quizState.questions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [quizState.questions[i], quizState.questions[j]] = [quizState.questions[j], quizState.questions[i]];
            }
            if (quizArea) quizArea.classList.remove('hidden');
            if (results) results.classList.add('hidden');
            quizArea.scrollIntoView({ behavior: 'smooth' });
            renderQuizQuestion();
        });
    }

    // Clear sandbox
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear all sandbox questions? This cannot be undone.')) {
                QuestionAdapter.clearSandbox();
                loadSandboxQuestions();
            }
        });
    }

    // Exit quiz
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            if (quizArea) quizArea.classList.add('hidden');
        });
    }

    // Render quiz question
    function renderQuizQuestion() {
        const cur = quizState.questions[quizState.currentIndex];
        if (!cur) return;

        quizState.hasAnswered = false;
        if (feedback) feedback.classList.add('hidden');
        if (aiFeedback) aiFeedback.style.display = 'none';
        if (options) options.innerHTML = '';
        if (essayArea) essayArea.style.display = 'none';
        if (essayInput) essayInput.value = '';

        const curNum = quizState.currentIndex + 1;
        const total = quizState.questions.length;

        if (qNum) qNum.textContent = curNum;
        if (qTotal) qTotal.textContent = total;
        if (trackerFill) trackerFill.style.width = `${(curNum / total) * 100}%`;
        if (topic) topic.textContent = cur.courseCode || 'Sandbox';
        if (qText) qText.textContent = cur.questionText || cur.question || '';

        // Branch: Essay
        if ((cur.type || 'MCQ').toUpperCase() === 'ESSAY') {
            if (options) options.style.display = 'none';
            if (essayArea) essayArea.style.display = 'block';
            if (essaySubmit) {
                essaySubmit.onclick = () => submitEssay(cur);
            }
            return;
        }

        // Branch: MCQ
        if (options) options.style.display = 'grid';
        const rawOptions = cur.options;
        if (rawOptions) {
            const entries = Array.isArray(rawOptions)
                ? rawOptions.map((v, i) => [String.fromCharCode(65 + i), v])
                : Object.entries(rawOptions).filter(([k, v]) => v);

            entries.forEach(([key, val]) => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.innerHTML = `<strong>${key}:</strong> ${val}`;
                btn.addEventListener('click', () => {
                    if (quizState.hasAnswered) return;
                    quizState.hasAnswered = true;
                    quizState.attempted++;

                    const correctKey = cur.correctAnswer || cur.correct_answer || '';
                    const isCorrect = key === correctKey;
                    if (isCorrect) quizState.score++;

                    quizState.userAnswers.push({
                        questionText: cur.questionText || cur.question,
                        chosenKey: key,
                        correctKey: correctKey,
                        explanation: cur.explanation || 'No explanation provided.'
                    });

                    const allBtns = options.querySelectorAll('.option-btn');
                    allBtns.forEach(b => b.setAttribute('disabled', 'true'));

                    if (isCorrect) {
                        btn.classList.add('correct');
                        if (fbTitle) fbTitle.textContent = 'Correct!';
                        if (feedback) feedback.className = 'feedback-panel correct-panel';
                    } else {
                        btn.classList.add('incorrect');
                        if (fbTitle) fbTitle.textContent = `Incorrect. Answer: ${correctKey}`;
                        if (feedback) feedback.className = 'feedback-panel incorrect-panel';
                        allBtns.forEach(b => {
                            if (b.innerHTML.startsWith(`<strong>${correctKey}:</strong>`)) b.classList.add('correct');
                        });
                    }

                    if (explanation) explanation.textContent = cur.explanation || 'No explanation provided.';
                    if (feedback) { feedback.classList.remove('hidden'); feedback.style.display = 'block'; }
                });
                options.appendChild(btn);
            });
        }
    }

    // Submit essay for AI evaluation
    async function submitEssay(cur) {
        const text = essayInput ? essayInput.value.trim() : '';
        if (!text) { alert('Please write a response before submitting.'); return; }

        essaySubmit.disabled = true;
        essaySubmit.textContent = 'Evaluating...';

        try {
            const res = await fetch('/api/evaluate-essay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: cur.questionText || cur.question,
                    expectedCriteria: cur.rubric || '',
                    submission: text
                })
            });

            if (!res.ok) throw new Error('Evaluation failed');
            const data = await res.json();

            if (aiFeedbackText) aiFeedbackText.innerHTML = data.evaluation;
            if (aiFeedback) aiFeedback.style.display = 'block';

            quizState.userAnswers.push({
                questionText: cur.questionText || cur.question,
                chosenKey: 'Review Pending',
                correctKey: 'Review Pending',
                explanation: cur.explanation || ''
            });

            if (fbTitle) fbTitle.textContent = 'Evaluation Complete';
            if (feedback) { feedback.classList.remove('hidden'); feedback.style.display = 'block'; }
        } catch (err) {
            if (aiFeedbackText) aiFeedbackText.textContent = 'AI evaluation unavailable. Your response has been saved.';
            if (aiFeedback) aiFeedback.style.display = 'block';
            quizState.userAnswers.push({
                questionText: cur.questionText || cur.question,
                chosenKey: 'Review Pending',
                correctKey: 'Review Pending',
                explanation: ''
            });
            if (fbTitle) fbTitle.textContent = 'Response Saved';
            if (feedback) { feedback.classList.remove('hidden'); feedback.style.display = 'block'; }
        } finally {
            essaySubmit.disabled = false;
            essaySubmit.textContent = 'Submit for AI Evaluation';
        }
    }

    // Next button
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            quizState.currentIndex++;
            if (quizState.currentIndex < quizState.questions.length) {
                renderQuizQuestion();
            } else {
                showResults();
            }
        });
    }

    // Show results
    function showResults() {
        if (results) results.classList.remove('hidden');
        if (feedback) feedback.classList.add('hidden');
        if (aiFeedback) aiFeedback.style.display = 'none';

        const mcqAnswers = quizState.userAnswers.filter(a => a.chosenKey !== 'Review Pending');
        const essayAnswers = quizState.userAnswers.filter(a => a.chosenKey === 'Review Pending');
        const accuracy = mcqAnswers.length > 0 ? Math.round((quizState.score / mcqAnswers.length) * 100) : 0;

        if (resultsContent) {
            resultsContent.innerHTML = `
                <div style="text-align:center;margin-bottom:16px;">
                    <div style="font-size:2rem;font-weight:800;color:${accuracy >= 70 ? '#10b981' : '#ef4444'};">${accuracy}%</div>
                    <div style="font-size:0.9rem;color:var(--text-secondary);">${quizState.score}/${mcqAnswers.length} MCQ correct | ${essayAnswers.length} essays submitted</div>
                </div>
            `;
        }

        // Save to sandbox history
        try {
            const history = JSON.parse(localStorage.getItem('mivapulse_sandbox_history') || '[]');
            history.push({
                date: new Date().toLocaleDateString(),
                courseCode: 'SANDBOX',
                score: quizState.score,
                total: mcqAnswers.length,
                accuracy: accuracy,
                essays: essayAnswers.length
            });
            localStorage.setItem('mivapulse_sandbox_history', JSON.stringify(history));
            renderHistory();
        } catch(e) {}
    }

    // Retry
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            if (results) results.classList.add('hidden');
            startBtn.click();
        });
    }

    // Submit to global bank
    if (submitGlobalBtn) {
        submitGlobalBtn.addEventListener('click', async () => {
            const confirmed = confirm('Submit these questions to the MivaPulse Global Bank for review by moderators?');
            if (!confirmed) return;

            let submitted = 0;
            for (const q of sandboxQuestions) {
                const result = await QuestionAdapter.submitContribution(q, { userId: 'sandbox_user' });
                if (result.success) submitted++;
            }
            alert(`Submitted ${submitted}/${sandboxQuestions.length} questions for review.`);
        });
    }

    // Initialize
    loadSandboxQuestions();
});
