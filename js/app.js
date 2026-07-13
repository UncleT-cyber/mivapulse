// Initialize global haptic feedback for mobile devices
if (typeof window !== 'undefined') {
  window.triggerHaptic = (pattern = 15) => {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };
}

/* ==========================================================================
   MIVA PREP - HOMEPAGE PORTAL ENGINE WITH PERSISTENT THEME CONTROLLER (app.js)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements for Course Selector Matrix (Enhanced for Faculty/Level/Semester nesting)
    const facultySelect = document.getElementById("facultySelect");
    const levelSelect = document.getElementById("levelSelect");
    const semesterSelect = document.getElementById("semesterSelect"); // 🌟 Added element pointer
    const courseSelect = document.getElementById("courseSelect");
    const configModal = document.getElementById("configModal");
    
    const startSimulationBtn = document.getElementById("startSimulationBtn") || document.getElementById("buildMockBtn");
    const mockConfigForm = document.getElementById("mockConfigForm") || document.querySelector("#configModal form") || document.getElementById("simulatorForm");

    let globalManifest = null;

    // 1. FETCH & RENDER DYNAMIC ACADEMIC MANIFEST
    if (facultySelect && levelSelect && semesterSelect && courseSelect) {
        fetch("data/manifest.json")
            .then(res => {
                if (!res.ok) throw new Error("Failed to load level matrix catalog.");
                return res.json();
            })
            .then(data => {
                globalManifest = data;
                
                // Clear cascading select fields down to default safe disabled states
                levelSelect.innerHTML = '<option value="" disabled selected>-- Select a faculty first --</option>';
                levelSelect.disabled = true;
                semesterSelect.innerHTML = '<option value="" disabled selected>-- Select a level first --</option>';
                semesterSelect.disabled = true;
                courseSelect.innerHTML = '<option value="" disabled selected>-- Select a semester first --</option>';
                courseSelect.disabled = true;
            })
            .catch(err => console.error("Manifest Initialization Error:", err));

        // 🟢 LIVE USER COUNT SIMULATOR
        function initLiveUserCounter() {
            const counterEl = document.getElementById("liveUserCount");
            if (!counterEl) return;

            let currentUsers = Math.floor(Math.random() * (180 - 120 + 1)) + 120;
            counterEl.textContent = `${currentUsers} Miva students practicing right now`;

            setInterval(() => {
                const change = Math.floor(Math.random() * 7) - 3;
                currentUsers += change;
                if (currentUsers < 90) currentUsers += 5;
                if (currentUsers > 250) currentUsers -= 5;
                counterEl.textContent = `${currentUsers} Miva students practicing right now`;
            }, Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000);
        }
        initLiveUserCounter();

        // Step A: Listen for Faculty changes -> Populate Levels
        facultySelect.addEventListener("change", (e) => {
            const selectedFacultyId = e.target.value;
            
            levelSelect.innerHTML = '<option value="" disabled selected>Select your Level...</option>';
            levelSelect.disabled = true;
            semesterSelect.innerHTML = '<option value="" disabled selected>-- Select a level first --</option>';
            semesterSelect.disabled = true;
            courseSelect.innerHTML = '<option value="" disabled selected>-- Select a semester first --</option>';
            courseSelect.disabled = true;

            if (!globalManifest) return;

            const targetFaculty = globalManifest.faculties.find(f => f.id === selectedFacultyId);
            if (targetFaculty && targetFaculty.levels) {
                targetFaculty.levels.forEach(level => {
                    const opt = document.createElement("option");
                    opt.value = level.id;
                    opt.textContent = level.name;
                    levelSelect.appendChild(opt);
                });
                levelSelect.disabled = false;
            }
        });

        // Step B: Listen for Level changes -> Populate Semesters
        levelSelect.addEventListener("change", (e) => {
            const selectedFacultyId = facultySelect.value;
            const selectedLevelId = e.target.value;
            
            semesterSelect.innerHTML = '<option value="" disabled selected>Select your Semester...</option>';
            semesterSelect.disabled = true;
            courseSelect.innerHTML = '<option value="" disabled selected>-- Select a semester first --</option>';
            courseSelect.disabled = true;

            if (!globalManifest) return;

            const targetFaculty = globalManifest.faculties.find(f => f.id === selectedFacultyId);
            const targetLevel = targetFaculty?.levels.find(l => l.id === selectedLevelId);

            if (targetLevel && targetLevel.semesters) {
                targetLevel.semesters.forEach(sem => {
                    const opt = document.createElement("option");
                    opt.value = sem.id;
                    opt.textContent = sem.name;
                    semesterSelect.appendChild(opt);
                });
                semesterSelect.disabled = false;
            }
        });

        // Step C: Listen for Semester changes -> Populate Courses
        semesterSelect.addEventListener("change", (e) => {
            const selectedFacultyId = facultySelect.value;
            const selectedLevelId = levelSelect.value;
            const selectedSemesterId = e.target.value;
            
            courseSelect.innerHTML = '<option value="" disabled selected>Select a course...</option>';
            courseSelect.disabled = true;

            if (!globalManifest) return;

            const targetFaculty = globalManifest.faculties.find(f => f.id === selectedFacultyId);
            const targetLevel = targetFaculty?.levels.find(l => l.id === selectedLevelId);
            const targetSemester = targetLevel?.semesters.find(s => s.id === selectedSemesterId);

            if (targetSemester && targetSemester.courses.length > 0) {
                targetSemester.courses.forEach(course => {
                    const opt = document.createElement("option");
                    opt.value = course.file; // Securely reads the accurate folder destination path
                    opt.setAttribute("data-code", course.code);
                    opt.setAttribute("data-title", course.title);
                    opt.textContent = `${course.code} - ${course.title}`;
                    courseSelect.appendChild(opt);
                });
                courseSelect.disabled = false;
            } else {
                courseSelect.innerHTML = '<option value="" disabled>No active courses found for this semester.</option>';
            }
        });
    }

    // 2. CENTRALIZED ROUTER ROUTING CONTROLLER FUNCTION
    function launchSimulation(e) {
        if (e && typeof e.preventDefault === "function") {
            e.preventDefault();
        }

        const file = courseSelect.value;
        const selectedOpt = courseSelect.options[courseSelect.selectedIndex];
        
        if (!file || courseSelect.selectedIndex === 0) {
            alert("Please select a target examination module to launch simulation.");
            return false;
        }

        const code = selectedOpt.getAttribute("data-code");
        const title = selectedOpt.getAttribute("data-title");
        
        // 🌟 FIX: Checked for both 'quizMode' and 'examMode' elements to match your HTML perfectly
        const selectedMode = document.querySelector('input[name="quizMode"]:checked')?.value || 
                             document.querySelector('input[name="examMode"]:checked')?.value || 
                             document.querySelector('input[name="simMode"]:checked')?.value || "practice";
                             
        const selectedLimit = document.getElementById("questionLimit")?.value || 
                              document.getElementById("questionLimit")?.value ||
                              document.querySelector('input[name="questionLimit"]:checked')?.value || "10";

        // Build dynamic routing parameters matching your simulation page entry points
        const destinationUrl = `quiz.html?course=${encodeURIComponent(file)}&code=${encodeURIComponent(code)}&title=${encodeURIComponent(title)}&mode=${selectedMode}&limit=${selectedLimit}`;
        
        console.log("Routing into simulation engine path layout:", destinationUrl);
        window.location.href = destinationUrl;
        return false;
    }

    if (mockConfigForm) {
        mockConfigForm.addEventListener("submit", launchSimulation);
    }
    if (startSimulationBtn) {
        startSimulationBtn.addEventListener("click", launchSimulation);
    }

    // 3. CORE THEME CONTROLLER ENGINE
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const savedTheme = localStorage.getItem("miva-theme") || 
                       (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    if (savedTheme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
    } else {
        document.documentElement.setAttribute("data-theme", "light");
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", () => {
            const currentTheme = document.documentElement.getAttribute("data-theme");
            let newTheme = "light";
            if (currentTheme === "light") newTheme = "dark";
            
            document.documentElement.setAttribute("data-theme", newTheme);
            localStorage.setItem("miva-theme", newTheme);
            console.log(`System UI context shifted to: ${newTheme} mode.`);
        });
    }
});

/* Global Window helper methods to open/close the config modal gracefully */
window.openConfigModal = function() {
    const modal = document.getElementById("configModal");
    if (modal) modal.classList.remove("hidden");
};

window.closeConfigModal = function() {
    const modal = document.getElementById("configModal");
    if (modal) modal.classList.add("hidden");
};

// MOBILE COMPACT TOAST INTERCEPTOR LAYOUT OVERRIDE
window.alert = function(message) {
    console.warn("Intercepted browser alert:", message);
    let toast = document.getElementById("custom-app-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "custom-app-toast";
        toast.style.cssText = `
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%) translateY(-20px);
            background-color: #1e1b4b;
            color: #ffffff;
            padding: 12px 20px;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.6);
            z-index: 9999999;
            font-weight: 600;
            font-size: 0.85rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0;
            pointer-events: none;
            border-left: 4px solid #a855f7;
            font-family: sans-serif;
            text-align: center;
            width: 88%;
            max-width: 340px;
            white-space: normal;
            line-height: 1.4;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
    
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(-20px)";
    }, 3500);
};