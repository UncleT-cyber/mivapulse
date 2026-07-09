/* ==========================================================================
   MIVA PREP - SECURE SIMULATION RUNTIME ENGINE WITH FINAL REVIEW (quiz-engine.js)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // 🌟 Added 'userAnswers' array to log choices chronologically
    const examState = { questions: [], currentIndex: 0, score: 0, attempted: 0, hasAnswered: false, userAnswers: [] };

    const urlParams = new URLSearchParams(window.location.search);
    const targetFile = urlParams.get("course");
    const courseCode = urlParams.get("code") || "EXAM";
    const limitParam = urlParams.get("limit") || "all";
    const quizMode = urlParams.get("mode") ? urlParams.get("mode").toLowerCase().trim() : "practice"; 

    console.log("Current Simulation Engine Active Mode:", quizMode);

    const dom = {
        title: document.getElementById("courseTitleDisplay"), 
        code: document.getElementById("courseCodeDisplay"),
        score: document.getElementById("currentScore"), 
        attempted: document.getElementById("totalAttempted"),
        qNum: document.getElementById("currentQuestionNum"), 
        qTotal: document.getElementById("totalQuestionsNum"),
        progressFill: document.getElementById("trackerFill"), 
        topic: document.getElementById("questionTopic"),
        qText: document.getElementById("questionText"), 
        options: document.getElementById("optionsContainer"),
        feedback: document.getElementById("feedbackPanel"), 
        fbTitle: document.getElementById("feedbackTitle"),
        explanation: document.getElementById("explanationText"), 
        btnNext: document.getElementById("btnNext"),
        quitBtn: document.getElementById("quitBtn"), 
        scoreWrapper: document.getElementById("scoreTrackerWrapper"), 
        examNotice: document.getElementById("examModeNotice") 
    };

    if (!targetFile) {
        if (dom.qText) dom.qText.textContent = "Error: Invalid selection routing parameters.";
        return;
    }

    if (dom.code) dom.code.textContent = courseCode;

    if (dom.quitBtn) {
        dom.quitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (window.confirm("Are you sure you want to quit this active mock? Your current progress will be lost.")) {
                window.location.href = "index.html";
            }
        });
    }

    if (dom.feedback) {
        dom.feedback.classList.add("hidden");
        dom.feedback.style.display = "none"; 
    }
    
    if (quizMode === "exam") {
        if (dom.scoreWrapper) dom.scoreWrapper.style.display = "none"; 
        if (dom.examNotice) dom.examNotice.classList.remove("hidden"); 
    }

    fetch(`data/${targetFile}`)
        .then(res => { if (!res.ok) throw new Error("Network issue."); return res.json(); })
        .then(data => {
            let processedQuestions = [...data];
            for (let i = processedQuestions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [processedQuestions[i], processedQuestions[j]] = [processedQuestions[j], processedQuestions[i]];
            }
            
            if (limitParam !== "all") {
                processedQuestions = processedQuestions.slice(0, parseInt(limitParam, 10));
            }

            examState.questions = processedQuestions;
            if (dom.title) dom.title.textContent = "Exam Lab Simulator";
            renderQuestion(examState, dom, quizMode, courseCode);
        })
        .catch(err => { if (dom.qText) dom.qText.textContent = `Initialization Error: ${err.message}`; });

    if (dom.btnNext) {
        dom.btnNext.addEventListener("click", () => {
            examState.currentIndex++;
            if (examState.currentIndex < examState.questions.length) {
                renderQuestion(examState, dom, quizMode, courseCode);
            } else {
                renderTerminalView(examState, dom, courseCode);
            }
        });
    }
});

function renderQuestion(state, dom, quizMode, courseCode) {
    state.hasAnswered = false;
    
    if (dom.feedback) {
        dom.feedback.classList.add("hidden");
        dom.feedback.style.display = "none";
    }
    if (dom.options) dom.options.innerHTML = "";

    const cur = state.questions[state.currentIndex];
    const curNum = state.currentIndex + 1;
    const total = state.questions.length;

    if (dom.qNum) dom.qNum.textContent = curNum;
    if (dom.qTotal) dom.qTotal.textContent = total;
    if (dom.progressFill) dom.progressFill.style.width = `${(curNum / total) * 100}%`;
    if (dom.topic) dom.topic.textContent = cur.topic || "Core Concept";
    if (dom.qText) dom.qText.textContent = cur.question;

    Object.entries(cur.options).forEach(([key, val]) => {
        if (!val) return;
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.innerHTML = `<strong>${key}:</strong> ${val}`;
        
        btn.addEventListener("click", () => {
            if (state.hasAnswered) return;
            state.hasAnswered = true;
            state.attempted++;
            
            // 🌟 Record the selection data for the final summary matrix
            state.userAnswers.push({
                questionText: cur.question,
                options: cur.options,
                chosenKey: key,
                correctKey: cur.correct_answer,
                explanation: cur.explanation || "No concept breakdown provided."
            });

            const allBtns = dom.options.querySelectorAll(".option-btn");
            allBtns.forEach(b => b.setAttribute("disabled", "true"));

            const isCorrect = (key === cur.correct_answer);
            if (isCorrect) state.score++;

            if (quizMode === "practice") {
                if (isCorrect) {
                    btn.classList.add("correct");
                    if (dom.fbTitle) dom.fbTitle.textContent = "Correct Answer! 🎉";
                    if (dom.feedback) dom.feedback.className = "feedback-panel correct-panel";
                } else {
                    btn.classList.add("incorrect");
                    if (dom.fbTitle) dom.fbTitle.textContent = `Incorrect. Correct answer was ${cur.correct_answer}`;
                    if (dom.feedback) dom.feedback.className = "feedback-panel incorrect-panel";
                    allBtns.forEach(b => { 
                        if (b.innerHTML.startsWith(`<strong>${cur.correct_answer}:</strong>`)) b.classList.add("correct"); 
                    });
                }
                if (dom.explanation) dom.explanation.textContent = cur.explanation || "No explanation provided.";
                if (dom.score) dom.score.textContent = state.score;
                if (dom.attempted) dom.attempted.textContent = state.attempted;
                
                if (dom.feedback) {
                    dom.feedback.classList.remove("hidden");
                    dom.feedback.style.display = "block";
                }
                
            } else {
                // 📝 EXAM MODE: Highlight choice, skip feedback completely, auto-advance
                btn.style.backgroundColor = "#f3e8ff"; 
                btn.style.borderColor = "#a855f7";
                btn.style.color = "#6b21a8";

                if (dom.feedback) {
                    dom.feedback.classList.add("hidden");
                    dom.feedback.style.display = "none";
                }

                setTimeout(() => {
                    state.currentIndex++;
                    if (state.currentIndex < state.questions.length) {
                        renderQuestion(state, dom, quizMode, courseCode);
                    } else {
                        renderTerminalView(state, dom, courseCode);
                    }
                }, 400);
            }
        });
        if (dom.options) dom.options.appendChild(btn);
    });
}

function renderTerminalView(state, dom, courseCode) {
    dom.options.innerHTML = "";
    if (dom.feedback) {
        dom.feedback.classList.add("hidden");
        dom.feedback.style.display = "none";
    }
    if (dom.topic) dom.topic.textContent = "Simulation Assessment Review";
    
    const noticeBanner = document.getElementById("examModeNotice");
    if (noticeBanner) noticeBanner.classList.add("hidden");

    const correctCount = state.score;
    const incorrectCount = state.attempted - state.score;
    const accuracyPercent = state.attempted > 0 ? Math.round((correctCount / state.attempted) * 100) : 0;
    
    if (dom.qText) dom.qText.textContent = `Review completed for ${courseCode}. Below is your performance analysis breakdown.`;
    
    // GitHub Routing Parameters
    const githubUser = "UncleT-cyber"; 
    const repoName = "mivaprep";
    const issueTitle = encodeURIComponent(`Metrics Log Checkpoint - ${courseCode}`);
    const issueBody = encodeURIComponent(`Simulation Results Summary:\n- Course: ${courseCode}\n- Accuracy: ${accuracyPercent}%\n- Correct: ${correctCount}\n- Total Attempted: ${state.attempted}`);
    const githubUrl = `https://github.com/${githubUser}/${repoName}/issues/new?title=${issueTitle}&body=${issueBody}`;

    // 🌟 BUILD INTERACTIVE HTML STRINGS FOR EVERY ANSWERED QUESTION
    let reviewRowsHtml = "";
    state.userAnswers.forEach((ans, i) => {
        const statusClass = (ans.chosenKey === ans.correctKey) ? "review-correct" : "review-incorrect";
        const badgeText = (ans.chosenKey === ans.correctKey) ? "✅ Correct" : "❌ Incorrect";
        
        let optionsListHtml = "";
        Object.entries(ans.options).forEach(([k, v]) => {
            if (!v) return;
            let matchStyle = "";
            if (k === ans.correctKey) {
                matchStyle = "color: #10b981; font-weight: 700; background-color: #ecfdf5; border-radius:4px; padding: 2px 6px;";
            } else if (k === ans.chosenKey && ans.chosenKey !== ans.correctKey) {
                matchStyle = "color: #ef4444; font-weight: 700; background-color: #fef2f2; border-radius:4px; padding: 2px 6px;";
            }
            optionsListHtml += `<li style="margin-bottom: 6px; ${matchStyle}"><strong>${k}:</strong> ${v}</li>`;
        });

        reviewRowsHtml += `
            <div class="review-card ${statusClass}" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem; background: white; display: flex; flex-direction: column; gap: 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem;">
                    <strong style="color: #4a154b;">Question ${i + 1}</strong>
                    <span style="font-weight: 700; font-size: 0.85rem;" class="status-badge">${badgeText}</span>
                </div>
                <p style="font-weight: 600; color: #1e293b; margin: 0;">${ans.questionText}</p>
                <ul style="list-style-type: none; padding-left: 0; margin: 0;">
                    ${optionsListHtml}
                </ul>
                <div style="background-color: #f8fafc; border-left: 3px solid #64748b; padding: 0.75rem; border-radius: 4px; font-size: 0.9rem; color: #475569;">
                    <strong>Concept Breakdown:</strong> ${ans.explanation}
                </div>
            </div>
        `;
    });

    const analyticsWrapper = document.createElement("div");
    analyticsWrapper.className = "analytics-container";
    analyticsWrapper.innerHTML = `
        <style>
            .analytics-container { margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1.75rem; }
            .chart-frame { background-color: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 2rem 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
            .chart-row { display: flex; align-items: center; gap: 1rem; }
            .chart-label { width: 90px; font-size: 0.9rem; font-weight: 700; color: #4a154b; }
            .chart-track-bg { flex: 1; background-color: #e2e8f0; height: 28px; border-radius: 6px; overflow: hidden; position: relative; }
            .chart-fill-bar { height: 100%; display: flex; align-items: center; padding-left: 0.75rem; color: white; font-size: 0.85rem; font-weight: 700; transition: width 1s ease; width: 0%; }
            .fill-correct { background: #10b981; }
            .fill-incorrect { background: #ef4444; }
            .accuracy-badge-box { text-align: center; font-size: 1.5rem; font-weight: 800; color: #e91e63; margin: 0.5rem 0; }
            .action-button-stack { display: flex; flex-direction: column; gap: 0.85rem; margin-top: 1rem; }
            .btn-terminal { padding: 1rem; text-align: center; font-weight: 700; color: white; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; display: block; font-size: 14px; }
            .review-card.review-correct { border-left: 5px solid #10b981 !important; }
            .review-card.review-incorrect { border-left: 5px solid #ef4444 !important; }
            .review-card.review-correct .status-badge { color: #10b981; }
            .review-card.review-incorrect .status-badge { color: #ef4444; }
        </style>

        <div class="accuracy-badge-box">Accuracy Rating: ${accuracyPercent}%</div>
        <div class="chart-frame">
            <div class="chart-row">
                <span class="chart-label">Correct</span>
                <div class="chart-track-bg"><div id="barCorrect" class="chart-fill-bar fill-correct">${correctCount} Answers</div></div>
            </div>
            <div class="chart-row">
                <span class="chart-label">Incorrect</span>
                <div class="chart-track-bg"><div id="barIncorrect" class="chart-fill-bar fill-incorrect">${incorrectCount} Answers</div></div>
            </div>
        </div>
        
        <div class="action-button-stack">
            <a href="${githubUrl}" target="_blank" rel="noopener noreferrer" class="btn-terminal" style="background-color: #24292e;">🐙 Submit Feedback to GitHub</a>
            <button onclick="window.location.reload()" class="btn-terminal" style="background-color: #4a154b;">🔄 Start New Session</button>
            <a href="index.html" class="btn-terminal" style="background-color: #64748b;">🏠 Exit to Home Landing</a>
        </div>

        <div id="simulationReviewStack" style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
            <h3 style="color: #4a154b; margin: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;">Simulation Item Review Log</h3>
            ${reviewRowsHtml}
        </div>
    `;

    if (dom.options) dom.options.appendChild(analyticsWrapper);

    setTimeout(() => {
        const totalAnswers = state.attempted || 1;
        const correctBar = document.getElementById("barCorrect");
        const incorrectBar = document.getElementById("barIncorrect");
        if (correctBar) correctBar.style.width = `${(correctCount / totalAnswers) * 100}%`;
        if (incorrectBar) incorrectBar.style.width = `${(incorrectCount / totalAnswers) * 100}%`;
    }, 100);
}