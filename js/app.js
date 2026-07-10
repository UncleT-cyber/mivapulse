/* ==========================================================================
   MIVA PREP - HOMEPAGE PORTAL ENGINE WITH PERSISTENT THEME CONTROLLER (app.js)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements for Course Selector Matrix
    const levelSelect = document.getElementById("levelSelect");
    const courseSelect = document.getElementById("courseSelect");
    const configModal = document.getElementById("configModal");
    
    // Look for BOTH possible launcher variants (the specific submission button OR the parent config form wrapper)
    const startSimulationBtn = document.getElementById("startSimulationBtn") || document.getElementById("buildMockBtn");
    const mockConfigForm = document.getElementById("mockConfigForm") || document.querySelector("#configModal form");

    let globalManifest = null;

    // 1. FETCH & RENDER DYNAMIC ACADEMIC MANIFEST
    if (levelSelect && courseSelect) {
        fetch("data/manifest.json")
            .then(res => {
                if (!res.ok) throw new Error("Failed to load level matrix catalog.");
                return res.json();
            })
            .then(data => {
                globalManifest = data;
                
                // Clear existing placeholder options
                levelSelect.innerHTML = '<option value="" disabled selected>Select your Level...</option>';
                
                // Populate level dropdown dynamically from JSON
                data.levels.forEach(level => {
                    const opt = document.createElement("option");
                    opt.value = level.id;
                    opt.textContent = level.name;
                    levelSelect.appendChild(opt);
                });
            })
            .catch(err => console.error("Manifest Initialization Error:", err));

        // Listen for Level changes to update Course options dynamically
        levelSelect.addEventListener("change", (e) => {
            const selectedLevelId = e.target.value;
            courseSelect.innerHTML = '<option value="" disabled selected>Select a course...</option>';
            courseSelect.disabled = true;

            if (!globalManifest) return;

            const targetLevel = globalManifest.levels.find(l => l.id === selectedLevelId);
            if (targetLevel && targetLevel.courses.length > 0) {
                targetLevel.courses.forEach(course => {
                    const opt = document.createElement("option");
                    opt.value = course.file;
                    opt.setAttribute("data-code", course.code);
                    opt.setAttribute("data-title", course.title);
                    opt.textContent = `${course.code} - ${course.title}`;
                    courseSelect.appendChild(opt);
                });
                courseSelect.disabled = false;
            } else {
                courseSelect.innerHTML = '<option value="" disabled>No active courses found for this tier.</option>';
            }
        });
    }

    // 2. CENTRALIZED ROUTER ROUTING CONTROLLER FUNCTION
    function launchSimulation(e) {
        // CRITICAL FIX: Stop the browser from submitting forms natively and kicking you back to index.html
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
        
        // Match the current input names inside your updated configuration modal
        const selectedMode = document.querySelector('input[name="examMode"]:checked')?.value || 
                             document.querySelector('input[name="simMode"]:checked')?.value || "practice";
                             
        const selectedLimit = document.getElementById("questionQuantitySelect")?.value || 
                              document.querySelector('input[name="questionLimit"]:checked')?.value || "10";

        // Build dynamic routing parameters matching your simulation page entry points
        const destinationUrl = `quiz.html?course=${encodeURIComponent(file)}&code=${encodeURIComponent(code)}&title=${encodeURIComponent(title)}&mode=${selectedMode}&limit=${selectedLimit}`;
        
        console.log("Routing into simulation engine path layout:", destinationUrl);
        window.location.href = destinationUrl;
        return false;
    }

    // Attach listeners to both form actions or direct button clicks to lock down form submission completely
    if (mockConfigForm) {
        mockConfigForm.addEventListener("submit", launchSimulation);
    }
    if (startSimulationBtn) {
        startSimulationBtn.addEventListener("click", launchSimulation);
    }

    // 3. CORE THEME CONTROLLER ENGINE (Late-Night Dark Mode Toggle)
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
            
            if (currentTheme === "light") {
                newTheme = "dark";
            }
            
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