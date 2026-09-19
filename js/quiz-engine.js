/* ==========================================================================
   UNIVERSAL PARSER & WILDCARD ESCAPE PIPELINE
   ========================================================================== */

// 1. Escapes raw HTML tags while preserving LaTeX delimiters
function safeRenderText(text) {
    if (typeof text !== 'string') return text;

    // First, temporarily protect valid LaTeX delimiters ($...$ or $$...$$)
    const mathTokens = [];
    let cleanText = text.replace(/(\$\$[\s\S]*?\$\$|\$[^\$]+?\$)/g, (match) => {
        mathTokens.push(match);
        return `___MATH_TOKEN_${mathTokens.length - 1}___`;
    });

    // Escape raw angle brackets so <div> or <html> display as visible text
    cleanText = cleanText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Restore LaTeX expressions back into place
    return cleanText.replace(/___MATH_TOKEN_(\d+)___/g, (_, index) => mathTokens[index]);
}

// 2. Universal Trigger: Renders MathJax across the entire active container
function triggerUniversalMathRender(targetElement = document.body) {
    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
        requestAnimationFrame(() => {
            window.MathJax.typesetPromise([targetElement]).catch((err) => 
                console.warn("MathJax Rendering Warning:", err)
            );
        });
    }
}

/* ==========================================================================
   MIVA PREP - SECURE SIMULATION RUNTIME ENGINE WITH FINAL REVIEW (quiz-engine.js)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
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

    // Check for StudyLab source
    const quizSource = urlParams.get("source") || "file";

    if (!targetFile && quizSource !== "studylab") {
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

    // ── STUDYLAB BRANCH: Load from localStorage ──
    if (quizSource === "studylab") {
        const studyLabData = localStorage.getItem('mivapulse_studylab_quiz');
        if (!studyLabData) {
            if (dom.qText) dom.qText.textContent = "No StudyLab questions found. Go back to StudyLab to generate questions first.";
            const mask = document.getElementById("loading-mask");
            if (mask) mask.remove();
            return;
        }
        const parsed = JSON.parse(studyLabData);
        let processedQuestions = [...(parsed.questions || [])];
        
        // Shuffle
        for (let i = processedQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [processedQuestions[i], processedQuestions[j]] = [processedQuestions[j], processedQuestions[i]];
        }
        
        if (limitParam !== "all") {
            const limitValue = parseInt(limitParam, 10) || 10;
            processedQuestions = processedQuestions.slice(0, limitValue);
        }

        examState.questions = processedQuestions;
        if (dom.title) dom.title.textContent = "StudyLab Session";
        if (dom.code) dom.code.textContent = "STUDYLAB";
        renderQuestion(examState, dom, quizMode, "STUDYLAB");
        const mask = document.getElementById("loading-mask");
        if (mask) mask.remove();
        // Removed return so script flows directly into registering dom.btnNext event listener below!
    } else {
        // ── STANDARD BRANCH: Load from JSON file ──
        fetch(`data/${targetFile}`)
            .then(res => { if (!res.ok) throw new Error("Network issue."); return res.json(); })
            .then(data => {
                let processedQuestions = [...data];
                for (let i = processedQuestions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [processedQuestions[i], processedQuestions[j]] = [processedQuestions[j], processedQuestions[i]];
                }
                
                if (limitParam !== "all") {
                    const limitValue = parseInt(limitParam, 10) || 10;
                    processedQuestions = processedQuestions.slice(0, limitValue);
                }

                examState.questions = processedQuestions;
                if (dom.title) dom.title.textContent = "Exam Lab Simulator";
                renderQuestion(examState, dom, quizMode, courseCode);
                const mask = document.getElementById("loading-mask");
                if (mask) mask.remove();
            })
            .catch(err => { if (dom.qText) dom.qText.textContent = `Initialization Error: ${err.message}`; });
    }

   // ===================================================
    // 🛠️ THE NEXT BUTTON SMOOTH TRANSITION & SCROLL FIX
    // ===================================================
    if (dom.btnNext) {
        dom.btnNext.addEventListener("click", () => {
            examState.currentIndex++;
            
            // Grabs your main question box component
            const quizContainer = document.querySelector('.quiz-container') || dom.options.parentElement;

            if (examState.currentIndex < examState.questions.length) {
                if (quizContainer) {
                    // 1. Start sleek fade out
                    quizContainer.style.opacity = '0';
                    quizContainer.style.transition = 'opacity 0.15s ease';
                    
                    setTimeout(() => {
                        // 2. Snap viewport back up while hidden
                        window.scrollTo({ top: 0, behavior: 'instant' });
                        
                        // 3. Load the new question strings into the HTML elements
                        renderQuestion(examState, dom, quizMode, courseCode);
                        
                        // 4. Fade the new question back in beautifully
                        quizContainer.style.opacity = '1';
                    }, 150);
                } else {
                    // Instant fallback if layout container cannot be located by script
                    window.scrollTo({ top: 0, behavior: 'instant' });
                    renderQuestion(examState, dom, quizMode, courseCode);
                }
            } else {
                // Handle final results view transition cleanly
                window.scrollTo({ top: 0, behavior: 'instant' });
                renderTerminalView(examState, dom, courseCode);
            }
        });
    }
}); // <-- Keep this trailing bracket! It safely closes your whole script wrapper.

function renderQuestion(state, dom, quizMode, courseCode) {
    state.hasAnswered = false;
    
    if (dom.feedback) {
        dom.feedback.classList.add("hidden");
        dom.feedback.style.display = "none";
    }
    if (dom.options) dom.options.innerHTML = "";

    // Locate the newly added Essay & AI DOM nodes from quiz.html
    const essayWorkspace = document.getElementById("essayWorkspaceContainer");
    const aiFeedbackBox = document.getElementById("aiFeedbackContainer");
    const aiFeedbackText = document.getElementById("aiFeedbackText");
    const essayInput = document.getElementById("essayResponseInput");
    const essaySubmitBtn = document.getElementById("submitEssayBtn");

    // Clear and hide essay components on every fresh card draw
    if (essayWorkspace) essayWorkspace.style.display = "none";
    if (aiFeedbackBox) aiFeedbackBox.style.display = "none";
    if (essayInput) essayInput.value = "";

    const cur = state.questions[state.currentIndex];
    
    // Safety check: if no question data found, break early
    if (!cur) {
        if (dom.qText) dom.qText.textContent = "Error: Question stream exhausted.";
        return;
    }

    const curNum = state.currentIndex + 1;
    const total = state.questions.length;

    if (dom.qNum) dom.qNum.textContent = curNum;
    if (dom.qTotal) dom.qTotal.textContent = total;
    if (dom.progressFill) dom.progressFill.style.width = `${(curNum / total) * 100}%`;
    if (dom.topic) dom.topic.textContent = cur.topic || "Core Concept";
    if (dom.qText) dom.qText.innerHTML = safeRenderText(cur.question);

    /* ==========================================================================
       BRANCH A: ADVANCED ESSAY EVALUATION ENGINE WITH NEXUS AI
       ========================================================================== */
    if (cur.type === "essay") {
        // Direct URL check to isolate exam mode safely without breaking script scopes
        const checkParams = new URLSearchParams(window.location.search);
        const currentActiveMode = checkParams.get("mode") ? checkParams.get("mode").toLowerCase().trim() : "practice";

        if (currentActiveMode === "exam") {
            // 🧼 1. Wipe out all text strings so absolutely nothing shows behind the alert
            if (dom.qText) dom.qText.textContent = "";
            if (dom.topic) dom.topic.textContent = "";
            if (dom.qNum) dom.qNum.textContent = "";
            if (dom.qTotal) dom.qTotal.textContent = "";
            
            // Hide the header/metadata and layout containers completely
            const headerMetadata = document.querySelector(".quiz-header") || 
                                   document.querySelector("[style*='QUESTION']") || 
                                   (dom.qNum ? dom.qNum.parentElement : null);
                                   
            if (headerMetadata) headerMetadata.style.setProperty("display", "none", "important");
            if (dom.progressFill && dom.progressFill.parentElement) {
                dom.progressFill.parentElement.style.setProperty("display", "none", "important");
            }

            // Hide the "Exam Simulation Mode Active" top purple notice box
            const noticeBanner = document.getElementById("examModeNotice") || document.querySelector(".exam-notice-banner");
            if (noticeBanner) noticeBanner.style.setProperty("display", "none", "important");
            if (essayWorkspace) essayWorkspace.style.setProperty("display", "none", "important");

            // 🎨 2. Render ONLY the beautifully isolated alert card inside the options slot
            if (dom.options) {
                dom.options.style.display = "block"; 
                dom.options.innerHTML = `
                    <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 35px; text-align: center; margin: 5px 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); animation: fadeIn 0.2s ease-out;">
                        <div style="font-size: 2.5rem; margin-bottom: 10px;">⚠️</div>
                        <h3 style="color: #f87171; font-size: 1.1rem; font-weight: 700; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">Simulation Mode Unavailable</h3>
                        <p style="color: #9ca3af; font-size: 0.88rem; line-height: 1.5; margin: 0 0 22px 0; max-width: 400px; margin-left: auto; margin-right: auto;">
                            Comprehensive multi-metric essay evaluations are exclusively optimized for interactive <strong>Practice Mode</strong> to support session-by-session pacing.
                        </p>
                        <button onclick="window.location.href='index.html'" style="background: #a855f7; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 0.88rem; cursor: pointer; transition: background 0.2s; box-shadow: 0 2px 4px rgba(168,85,247,0.3); width: 100%; max-width: 250px;">
    🔄 Return to Dashboard
</button>
                    </div>
                `;
            }
            return; // Clean break out of engine rendering loops
        }

        // --- Standard Working Practice Mode Flow Continues Safely ---
        if (dom.options) dom.options.style.display = "none"; // Hide MCQ grid
        if (essayWorkspace) essayWorkspace.style.display = "flex"; // Reveal textarea container

        // Bind the active question data context directly onto your submit button
        if (essaySubmitBtn) {
            essaySubmitBtn.textContent = "Submit to Nexus AI for Evaluation";
            essaySubmitBtn.disabled = false;
            essaySubmitBtn.style.opacity = "1";
            
            // Store current question for the global handleEssayEvaluation handler
            window._currentEssayQuestion = cur;

            essaySubmitBtn.onclick = function() {
                processEssayEvaluation(cur, state, dom);
            };
        }
        return; // Break execution out early since we don't have MCQ options to loop over
    }

/* ==========================================================================
       BRANCH B: STANDARD MULTIPLE CHOICE LOGIC (YOUR ORIGINAL ENGINE RULES)
       ========================================================================== */
    if (dom.options) dom.options.style.display = "grid"; // Ensure MCQ grid is visible if coming from an essay card

    if (cur.options) {
        Object.entries(cur.options).forEach(([key, val]) => {
            if (!val) return;
            const btn = document.createElement("button");
            btn.className = "option-btn";
            
            // 💡 ENHANCEMENT: Safe text render for option labels
            btn.innerHTML = `<strong>${key}:</strong> ${safeRenderText(val)}`;
            
            btn.addEventListener("click", () => {
                if (state.hasAnswered) return;
                
                btn.classList.add("selected-pop");
                state.hasAnswered = true;
                state.attempted++;

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

                    // 💡 ENHANCEMENT: Safe text render for explanations
                    if (dom.explanation) {
                        dom.explanation.innerHTML = safeRenderText(cur.explanation || "No explanation provided.");
                    }

                    if (dom.feedback) {
                        dom.feedback.classList.remove("hidden");
                        dom.feedback.style.display = "block";
                    }

                    // 💡 ENHANCEMENT: Render MathJax in explanation panel when revealed
                    triggerUniversalMathRender(dom.feedback);

                } else {
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

    /* ==========================================================================
       FUTURE-PROOF MATHJAX DYNAMIC RENDERING TRIGGER (MCQ + ESSAY SAFE)
       ========================================================================== */
    // 💡 ENHANCEMENT: Clean universal math trigger on initial card draw
    triggerUniversalMathRender(document.body);

} // <-- Absolute final closing bracket for renderQuestion function



/* ==========================================================================
   RENDER TERMINAL VIEW (HYBRID MULTI-CHOICE & ESSAY ANALYTICS BREAKDOWN)
   ========================================================================== */
function renderTerminalView(state, dom, courseCode) {
    const essayWorkspace = document.getElementById("essayWorkspaceContainer");
    const aiFeedbackBox = document.getElementById("aiFeedbackContainer");
    if (essayWorkspace) essayWorkspace.style.setProperty("display", "none", "important");
    if (aiFeedbackBox) aiFeedbackBox.style.setProperty("display", "none", "important");

    dom.options.innerHTML = "";
    if (dom.feedback) {
        dom.feedback.classList.add("hidden");
        dom.feedback.style.display = "none"; 
    }
    if (dom.topic) dom.topic.textContent = "Simulation Assessment Review";
    
    const noticeBanner = document.getElementById("examModeNotice");
    if (noticeBanner) noticeBanner.classList.add("hidden");

    let reviewRowsHtml = "";
    let globalItemCounter = 1;

    let mcqAttempted = 0;
    let mcqCorrect = 0;

    if (state && Array.isArray(state.userAnswers) && state.userAnswers.length > 0) {
        state.userAnswers.forEach((ans) => {
            const isEssayInState = (ans.options && ans.options["Your Submission"]) || ans.chosenKey === "Review Pending";
            
            if (!isEssayInState) {
                mcqAttempted++;
                const isCorrect = ans.chosenKey === ans.correctKey;
                if (isCorrect) mcqCorrect++;

                const badgeColor = isCorrect ? "#10b981" : "#ef4444";
                const badgeText = isCorrect ? "✅ Correct" : "❌ Incorrect";

                let optionsListHtml = "";
                if (ans.options) {
                    Object.entries(ans.options).forEach(([k, v]) => {
                        if (!v) return;
                        let matchStyle = "";
                        if (k === ans.correctKey) {
                            matchStyle = "color: #10b981; font-weight: 700; background-color: #ecfdf5; border-radius:4px; padding: 2px 6px;";
                        } else if (k === ans.chosenKey && !isCorrect) {
                            matchStyle = "color: #ef4444; font-weight: 700; background-color: #fef2f2; border-radius:4px; padding: 2px 6px;";
                        }
                        optionsListHtml += `<li style="margin-bottom: 6px; ${matchStyle}"><strong>${k}:</strong> ${v}</li>`;
                    });
                }

                reviewRowsHtml += `
                    <div class="review-card mcq-card" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem; background: white; display: flex; flex-direction: column; gap: 0.75rem; border-left: 5px solid ${badgeColor} !important; margin-bottom: 1rem; text-align: left;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem;">
                            <strong style="color: #4a154b;">Question ${globalItemCounter} (Multiple Choice)</strong>
                            <span style="font-weight: 700; font-size: 0.85rem; color: ${badgeColor};">${badgeText}</span>
                        </div>
                        <p style="font-weight: 600; color: #1e293b; margin: 0;">${ans.questionText || "Multiple Choice Question Item"}</p>
                        <ul style="list-style-type: none; padding-left: 0; margin: 0; font-size: 0.95rem; color: #334155;">${optionsListHtml}</ul>
                        <div style="background-color: #f8fafc; border-left: 3px solid #64748b; padding: 0.75rem; border-radius: 4px; font-size: 0.9rem; color: #475569;">
                            <strong>Explanation:</strong> ${ans.explanation || "No clarification metadata provided."}
                        </div>
                    </div>
                `;
                globalItemCounter++;
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const activeQuizMode = urlParams.get("mode") ? urlParams.get("mode").toLowerCase().trim() : "practice";

    if (activeQuizMode === "exam" || activeQuizMode === "simulation") {
        const totalQuestionsList = state.questions || [];
        totalQuestionsList.forEach((q, idx) => {
            if (q.type === "essay") {
                const cachedResponseText = (window.essaySubmissionsList && window.essaySubmissionsList.find(e => e.questionText === q.question))
                    ? window.essaySubmissionsList.find(e => e.questionText === q.question).submissionText
                    : (window.examAnswersCache ? window.examAnswersCache[idx] : "") || "No response recorded.";

                reviewRowsHtml += `
                    <div class="review-card review-essay" style="border: 1px solid #312e81; border-radius: 8px; padding: 1.25rem; background: #1e1b4b; display: flex; flex-direction: column; gap: 0.75rem; border-left: 5px solid #fbbf24 !important; margin-bottom: 1rem; text-align: left;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #312e81; padding-bottom: 0.5rem;">
                            <strong style="color: #a5b4fc;">Question ${globalItemCounter} (Essay Evaluation Frame)</strong>
                            <span style="font-weight: 700; font-size: 0.85rem; color: #fbbf24;">💾 Saved for Grading</span>
                        </div>
                        <p style="font-weight: 600; color: #ffffff; margin: 0;">${q.question || "Essay Prompt Assignment"}</p>
                        <div style="background-color: rgba(255,255,255,0.04); border: 1px solid #312e81; border-radius: 6px; padding: 1rem;">
                            <strong style="color: #a5b4fc; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Your Submitted Response:</strong>
                            <p style="color: #e0e7ff; margin: 0; white-space: pre-wrap; font-style: italic;">"${cachedResponseText}"</p>
                        </div>
                    </div>
                `;
                globalItemCounter++;
            }
        });
    } else {
        const essayList = window.essaySubmissionsList || [];
        essayList.forEach((item) => {
            let formattedAiFeedback = item.aiEvaluation
                ? item.aiEvaluation.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")
                : "No structured critique payload logged.";

            reviewRowsHtml += `
                <div class="review-card review-essay" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem; background: white; display: flex; flex-direction: column; gap: 0.75rem; border-left: 5px solid #4a154b !important; margin-bottom: 1rem; text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem;">
                        <strong style="color: #4a154b;">Question ${globalItemCounter} (Essay Response)</strong>
                        <span style="font-weight: 700; font-size: 0.85rem; color: #4a154b;">📝 Evaluation Logged</span>
                    </div>
                    <p style="font-weight: 600; color: #1e293b; margin: 0;">${item.questionText || "Essay Prompt Case Study"}</p>
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem;">
                        <strong style="color: #475569; font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Your Written Response:</strong>
                        <p style="color: #1e293b; margin: 0; white-space: pre-wrap; font-style: italic;">"${item.submissionText}"</p>
                    </div>
                    <div style="background-color: #f5f3ff; border-left: 3px solid #7c3aed; padding: 1rem; border-radius: 4px; font-size: 0.9rem; color: #1e293b;">
                        <strong style="color: #6d28d9; display: block; margin-bottom: 0.5rem;">🤖 Nexus AI Assessment Breakdown:</strong>
                        <div style="line-height: 1.5;">${formattedAiFeedback}</div>
                    </div>
                </div>
            `;
            globalItemCounter++;
        });
    }

    const totalEssays = (window.essaySubmissionsList || []).length;
    const accuracyPercent = mcqAttempted > 0 ? Math.round((mcqCorrect / mcqAttempted) * 100) : 100;

    if (dom.qText) dom.qText.textContent = `Review completed for ${courseCode || "COS 301"}. Below is your session analysis breakdown.`;

    // 🌟 MIVACIRCLE (YIKORA) FEEDBACK PIPELINE LINK
    const yikoraPostUrl = "https://app.yikora.com/post/1fa9ed28-bf93-437a-9842-559403a5dbe7";

    // Calculate pie chart values
    const mcqIncorrect = mcqAttempted - mcqCorrect;
    const passPercent = mcqAttempted > 0 ? Math.round((mcqCorrect / mcqAttempted) * 100) : 0;
    const failPercent = mcqAttempted > 0 ? 100 - passPercent : 0;
    const passed = mcqCorrect >= Math.ceil(mcqAttempted * 0.5);
    const gradeLabel = mcqAttempted > 0 ? (passed ? 'PASSED' : 'FAILED') : 'N/A';
    const gradeColor = passed ? '#10b981' : '#ef4444';

    const analyticsWrapper = document.createElement("div");
    analyticsWrapper.className = "analytics-container";
    analyticsWrapper.innerHTML = `
        <style>
            .analytics-container { margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1.75rem; }
            .pie-chart-wrapper { display: flex; align-items: center; justify-content: center; gap: 2rem; flex-wrap: wrap; padding: 1.5rem; background: var(--bg-card, #fff); border: 2px solid var(--border-color, #e2e8f0); border-radius: 16px; }
            .pie-chart-circle { width: 180px; height: 180px; border-radius: 50%; position: relative; display: flex; align-items: center; justify-content: center; transition: all 0.6s ease; }
            .pie-chart-center { position: absolute; width: 100px; height: 100px; border-radius: 50%; background: var(--bg-card, #fff); display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: inset 0 0 10px rgba(0,0,0,0.05); }
            .pie-percent { font-size: 1.6rem; font-weight: 800; color: var(--text-primary, #1e293b); line-height: 1; }
            .pie-label { font-size: 0.7rem; font-weight: 600; color: var(--text-secondary, #64748b); text-transform: uppercase; letter-spacing: 0.5px; }
            .pie-legend { display: flex; flex-direction: column; gap: 12px; }
            .pie-legend-item { display: flex; align-items: center; gap: 10px; }
            .pie-legend-dot { width: 14px; height: 14px; border-radius: 4px; flex-shrink: 0; }
            .pie-legend-text { font-size: 0.88rem; color: var(--text-primary, #1e293b); }
            .pie-legend-count { font-weight: 700; }
            .grade-badge { display: inline-block; padding: 6px 20px; border-radius: 8px; font-weight: 800; font-size: 1rem; letter-spacing: 1px; margin-top: 4px; }
            .stat-pills { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
            .stat-pill { padding: 4px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; }
        </style>

        <div class="pie-chart-wrapper">
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                <div class="pie-chart-circle" id="pieChartCircle" style="background: conic-gradient(#e2e8f0 0deg, #e2e8f0 360deg);">
                    <div class="pie-chart-center">
                        <span class="pie-percent" id="piePercentText">0%</span>
                        <span class="pie-label">Score</span>
                    </div>
                </div>
                <div class="grade-badge" id="gradeBadge" style="background: ${gradeColor}15; color: ${gradeColor}; border: 2px solid ${gradeColor}30;">${gradeLabel}</div>
                <div class="stat-pills">
                    ${totalEssays > 0 ? `<span class="stat-pill" style="background:rgba(74,21,75,0.08);color:#4a154b;">${totalEssays} Essays</span>` : ''}
                    <span class="stat-pill" style="background:rgba(100,116,139,0.08);color:#64748b;">${mcqAttempted + totalEssays} Total</span>
                </div>
            </div>
            <div class="pie-legend">
                <div class="pie-legend-item">
                    <div class="pie-legend-dot" style="background:#10b981;"></div>
                    <span class="pie-legend-text">Correct: <span class="pie-legend-count" id="legendCorrect">0</span></span>
                </div>
                <div class="pie-legend-item">
                    <div class="pie-legend-dot" style="background:#ef4444;"></div>
                    <span class="pie-legend-text">Incorrect: <span class="pie-legend-count" id="legendIncorrect">0</span></span>
                </div>
                ${totalEssays > 0 ? `
                <div class="pie-legend-item">
                    <div class="pie-legend-dot" style="background:#4a154b;"></div>
                    <span class="pie-legend-text">Essays: <span class="pie-legend-count">${totalEssays}</span></span>
                </div>` : ''}
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 0.85rem; margin-top: 0.5rem;">
            <a href="${yikoraPostUrl}" target="_blank" rel="noopener noreferrer" style="padding: 1rem; text-align: center; font-weight: 700; color: white; border: none; border-radius: 8px; text-decoration: none; display: block; font-size: 14px; background-color: #0284c7; box-shadow: 0 2px 4px rgba(2,132,199,0.3);">💬 Share Feedback on MivaCircle (Yikora)</a>
            <button onclick="window.location.reload()" style="padding: 1rem; text-align: center; font-weight: 700; color: white; border: none; border-radius: 8px; cursor: pointer; display: block; font-size: 14px; background-color: #4a154b;">🔄 Start New Session</button>
            <a href="index.html" style="padding: 1rem; text-align: center; font-weight: 700; color: white; border: none; border-radius: 8px; text-decoration: none; display: block; font-size: 14px; background-color: #64748b;">🏠 Exit to Home Landing</a>
        </div>

        <div id="simulationReviewStack" style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
            <h3 style="color: #4a154b; margin: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; text-align: left;">Simulation Item Review Log</h3>
            ${(mcqAttempted + totalEssays) > 0 ? reviewRowsHtml : `<p style="color: #64748b; font-style: italic; text-align: left;">No processed questions or answers found in active session memory.</p>`}
        </div>

        <button id="backToTopBtn" onclick="if(window.triggerHaptic) window.triggerHaptic(15); window.scrollTo({top: 0, behavior: 'smooth'});" style="position: fixed; bottom: 24px; right: 24px; width: 48px; height: 48px; border-radius: 50%; background: #b794f4; color: #ffffff; border: none; font-size: 1.2rem; font-weight: bold; cursor: pointer; box-shadow: 0 4px 14px rgba(183, 148, 244, 0.4); display: none; z-index: 9999; align-items: center; justify-content: center; transition: all 0.2s ease;">↑</button>
    `;

    window.addEventListener('scroll', () => {
        const btn = document.getElementById("backToTopBtn");
        if (btn) {
            if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
                btn.style.display = "flex";
            } else {
                btn.style.display = "none";
            }
        }
    });

    if (dom.options) dom.options.appendChild(analyticsWrapper);

    setTimeout(() => {
        // Animate pie chart
        const pieCircle = document.getElementById("pieChartCircle");
        const piePercent = document.getElementById("piePercentText");
        const legendCorrect = document.getElementById("legendCorrect");
        const legendIncorrect = document.getElementById("legendIncorrect");
        
        if (pieCircle && mcqAttempted > 0) {
            const correctDeg = (mcqCorrect / mcqAttempted) * 360;
            pieCircle.style.background = `conic-gradient(#10b981 0deg, #10b981 ${correctDeg}deg, #ef4444 ${correctDeg}deg, #ef4444 360deg)`;
            
            // Animate percentage counter
            let currentPct = 0;
            const targetPct = accuracyPercent;
            const step = Math.max(1, Math.floor(targetPct / 30));
            const counter = setInterval(() => {
                currentPct = Math.min(currentPct + step, targetPct);
                if (piePercent) piePercent.textContent = currentPct + '%';
                if (currentPct >= targetPct) clearInterval(counter);
            }, 25);
            
            if (legendCorrect) legendCorrect.textContent = mcqCorrect;
            if (legendIncorrect) legendIncorrect.textContent = mcqIncorrect;
        } else if (pieCircle) {
            pieCircle.style.background = '#e2e8f0';
            if (piePercent) piePercent.textContent = '—';
        }
    }, 100);
}



/* ==========================================================================
   NEXUS AI COGNITIVE PIPELINE FOR ESSAY ASSESSMENTS
   ========================================================================== */
async function processEssayEvaluation(curQuestion, state, dom) {
    const essayInput = document.getElementById("essayResponseInput");
    const essaySubmitBtn = document.getElementById("submitEssayBtn");
    const aiFeedbackBox = document.getElementById("aiFeedbackContainer");
    const aiFeedbackText = document.getElementById("aiFeedbackText");

    const studentSubmission = essayInput ? essayInput.value.trim() : "";

    if (!studentSubmission) {
        // Grab the custom modal and its text element
        const validationModal = document.getElementById("validationModal");
        
        if (validationModal) {
            // Dynamically update the text to match your academic prompt
            const modalDesc = validationModal.querySelector("p");
            if (modalDesc) {
                modalDesc.textContent = "Please compose an academic response before submitting for evaluation.";
            }
            
            // Show the custom modal interface cleanly
            validationModal.classList.remove("hidden");
            validationModal.style.display = "flex";
        }
        return;
    }

    try {
        const response = await fetch("/api/evaluate-essay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question: curQuestion.question,
                expectedCriteria: curQuestion.key_points_expected || [],
                submission: studentSubmission
            })
        });

        if (!response.ok) throw new Error("Evaluation network connection fault.");
        const data = await response.json();

        if (aiFeedbackText) aiFeedbackText.innerHTML = data.evaluation;
        if (aiFeedbackBox) aiFeedbackBox.style.display = "block";

        state.userAnswers.push({
            questionText: curQuestion.question,
            options: { "Your Submission": studentSubmission },
            chosenKey: "Review Pending",
            correctKey: "Review Pending",
            explanation: curQuestion.explanation || "No data criteria breakdown provided."
        });

        if (dom.feedback) {
            if (dom.fbTitle) dom.fbTitle.textContent = "Evaluation Processed Successfully";
            if (dom.explanation) dom.explanation.textContent = curQuestion.explanation || "";
            dom.feedback.className = "feedback-panel correct-panel";
            dom.feedback.classList.remove("hidden");
            dom.feedback.style.display = "block";
        }

        if (dom.feedback) {
            if (dom.fbTitle) dom.fbTitle.textContent = "Evaluation Processed Successfully";
            if (dom.explanation) dom.explanation.textContent = curQuestion.explanation || "";
            dom.feedback.className = "feedback-panel correct-panel";
            dom.feedback.classList.remove("hidden");
            dom.feedback.style.display = "block";
        }

        // ====== FORCE NEXT QUESTION BUTTON TO SHOW ======
        if (dom.btnNext) {
            dom.btnNext.style.setProperty("display", "block", "important");
            dom.btnNext.classList.remove("hidden");
        }

    } catch (err) {
        console.error("AI Node Interruption Error: ", err);
        if (aiFeedbackText) aiFeedbackText.textContent = "Nexus AI communication failure. (Note: Serverless functions require netlify dev to run locally).";
        if (aiFeedbackBox) aiFeedbackBox.style.display = "block";
    } finally {
        if (essaySubmitBtn) {
            essaySubmitBtn.textContent = "Submit to Nexus AI for Evaluation";
            essaySubmitBtn.disabled = false;
            essaySubmitBtn.style.opacity = "1";
        }
    }
}

window.handleEssayEvaluation = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const currentMode = urlParams.get("mode") || "practice";

    const submissionField = document.getElementById("essayResponseInput");
    const submissionText = submissionField ? submissionField.value.trim() : "";
    
    // Check for empty essay content submission
if (!submissionText || !submissionText.trim()) {
    // Grab your custom validation modal element
    const validationModal = document.getElementById("validationModal");
    if (validationModal) {
        validationModal.classList.remove("hidden");
        validationModal.style.display = "flex";
    }
    return;
}

    // Initialize an array sequence to keep track of submissions cleanly
    if (!window.essaySubmissionsList) {
        window.essaySubmissionsList = [];
    }

    const activeQuestionElement = document.querySelector(".quiz-question-text") || document.querySelector("h2") || document.querySelector("h3");
    const questionText = activeQuestionElement ? activeQuestionElement.textContent.trim() : "Essay Examination Question";

    // Create a base log object placeholder immediately
    const entryIndex = window.essaySubmissionsList.length;
    const currentEntry = {
        questionText: questionText,
        submissionText: submissionText,
        aiEvaluation: "Review Pending Analysis"
    };
    window.essaySubmissionsList.push(currentEntry);

    // Backup to your legacy object cache map to preserve standard routing behavior
    if (!window.examAnswersCache) window.examAnswersCache = {};
    window.examAnswersCache[entryIndex] = submissionText;

    // ==========================================
    // 📝 BRANCH PATHWAY A: EXAM MODE EXECUTION
    // ==========================================
    if (currentMode === "exam" || currentMode === "simulation") {
        if (submissionField) submissionField.disabled = true;

        const nextBtn = document.getElementById("nextQuestionBtn") || document.getElementById("next-btn") || document.querySelector(".next-btn");
        if (nextBtn) {
            nextBtn.style.display = "block"; 
            nextBtn.classList.remove("hidden");
        }
        
        const submitBtn = document.getElementById("submitEssayBtn");
        if (submitBtn) {
            submitBtn.innerHTML = "✅ Answer Saved Successfully";
            submitBtn.style.backgroundColor = "#10b981";
            submitBtn.disabled = true;
        }
        return;
    }

    // ==========================================
    // 🎓 BRANCH PATHWAY B: PRACTICE MODE POPUP
    // ==========================================
    const modalOverlay = document.createElement("div");
    modalOverlay.className = "nexus-modal-overlay";
    modalOverlay.id = "nexus-evaluation-modal";
    
    modalOverlay.innerHTML = `
        <div class="nexus-modal-card">
            <div class="nexus-loader-container" id="nexus-modal-loading-state">
                <div class="nexus-spinner"></div>
                <p class="nexus-loader-text">🤖 Nexus AI is thoroughly analyzing your architectural synthesis...</p>
            </div>
            <div class="nexus-modal-body hidden" id="nexus-modal-result-state" style="padding-bottom: 2.5rem !important;">
    <h3 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 0.5rem; color: var(--text-primary);">🤖 Nexus AI Assessment Review</h3>
    <hr style="border: 0; border-top: 1px solid var(--border-color); margin-bottom: 1rem;">
    <div id="nexus-modal-text-content"></div>
    <button class="nexus-modal-close-btn" onclick="
        document.getElementById('nexus-evaluation-modal').remove(); 
        const optionsGrid = document.getElementById('optionsContainer');
        if (optionsGrid) optionsGrid.style.setProperty('display', 'grid', 'important');
        const nativeNextBtn = document.getElementById('btnNext');
        if (nativeNextBtn) nativeNextBtn.click();
    ">Close Review and Continue</button>
</div>
        </div>
    `;
    document.body.appendChild(modalOverlay);

    try {
        const activeQ = window._currentEssayQuestion || {};
        const expectedCriteria = Array.isArray(activeQ.key_points_expected) 
            ? activeQ.key_points_expected.join('; ') 
            : (activeQ.key_points_expected || "Demonstrates coherent architectural synthesis, clear analytical formatting, and algorithmic context.");

        const response = await fetch('/api/evaluate-essay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: questionText,
                expectedCriteria: expectedCriteria,
                submission: submissionText
            })
        });

        if (!response.ok) throw new Error("AI evaluation service unavailable.");
        const data = await response.json();

        // 🌟 SAVE REAL REAL AI EVALUATION DIRECTLY TO ENTRY FOR THE TERMINAL DISPLAY
        currentEntry.aiEvaluation = data.evaluation;

        document.getElementById("nexus-modal-loading-state").classList.add("hidden");
        const resultState = document.getElementById("nexus-modal-result-state");
        resultState.classList.remove("hidden");
        
        let cleanHtmlOutput = data.evaluation
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\n/g, "<br>");

        document.getElementById("nexus-modal-text-content").innerHTML = cleanHtmlOutput;

        const nextBtn = document.getElementById("nextQuestionBtn") || document.getElementById("next-btn") || document.querySelector(".next-btn");
        if (nextBtn) {
            nextBtn.style.display = "block"; 
            nextBtn.classList.remove("hidden");
        }

    } catch (error) {
        console.error("Nexus AI Frontend Invocation Error:", error);
        currentEntry.aiEvaluation = "Evaluation connection offline or timed out.";
        const loadingState = document.getElementById("nexus-modal-loading-state");
        if (loadingState) {
            loadingState.innerHTML = `
                <p style="color: #ef4444; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.5rem;">⚠️ Evaluation Connection Interrupted</p>
                <button class="nexus-modal-close-btn" style="align-self: center;" onclick="document.getElementById('nexus-evaluation-modal').remove()">Dismiss</button>
            `;
        }
    }
};

// ==========================================================================
// 🔗 BINDING THE DISPATCH EVENTS INTERNALLY
// ==========================================================================
// Find your 'Submit to Nexus AI for Evaluation' purple action button element 
// Replace 'submitEssayBtn' with the actual ID you set on that button node element
const processEssayBtn = document.getElementById("submitEssayBtn") || document.querySelector("button[onclick*='evaluate']");
if (processEssayBtn) {
    processEssayBtn.removeAttribute("onclick"); // Clean out legacy inline execution assignments
    processEssayBtn.addEventListener("click", handleEssayEvaluation);
}

// Dismiss custom validation modal layer
const closeValidationBtn = document.getElementById("closeValidationBtn");
if (closeValidationBtn) {
    closeValidationBtn.addEventListener("click", () => {
        const validationModal = document.getElementById("validationModal");
        if (validationModal) {
            validationModal.classList.add("hidden");
            validationModal.style.display = "none";
        }
    });
}

// Append this close handler explicitly to the window ecosystem
window.addEventListener("click", (e) => {
    const modal = document.getElementById("validationModal");
    const closeBtn = document.getElementById("closeValidationBtn");
    
    // If they click the close button OR tap outside the card structure on the overlay blur
    if (e.target === closeBtn || e.target === modal) {
        if (modal) {
            modal.style.display = "none";
            modal.classList.add("hidden");
        }
    }
});