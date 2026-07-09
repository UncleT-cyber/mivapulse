/* ==========================================================================
   MIVA PREP - UNIVERSAL GATEWAY ARCHITECTURE CONTROLLER (app.js)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const levelSelect = document.getElementById("levelSelect");
    const courseSelect = document.getElementById("courseSelect");
    const simulatorForm = document.getElementById("simulatorForm");

    if (!levelSelect && !courseSelect && !simulatorForm) {
        return;
    }

    let globalManifest = [];

    // Fetch the registry manifest configurations
    fetch('data/manifest.json')
        .then(res => {
            if (!res.ok) throw new Error(`HTTP network response code: ${res.status}`);
            return res.json();
        })
        .then(data => {
            globalManifest = data.levels || [];
            
            levelSelect.innerHTML = '<option value="" disabled selected>-- Choose your level --</option>';
            globalManifest.forEach(level => {
                const opt = document.createElement("option");
                opt.value = level.id;
                opt.textContent = level.name;
                levelSelect.appendChild(opt);
            });
        })
        .catch(err => console.error("Manifest Registry Load Error: ", err));

    levelSelect.addEventListener("change", () => {
        const selectedLevelId = levelSelect.value;
        const matchedLevel = globalManifest.find(l => l.id === selectedLevelId);

        courseSelect.innerHTML = '<option value="" disabled selected>-- Choose a course --</option>';
        
        if (matchedLevel && matchedLevel.courses && matchedLevel.courses.length > 0) {
            courseSelect.removeAttribute("disabled");
            matchedLevel.courses.forEach(course => {
                const opt = document.createElement("option");
                
                let fileName = course.file;
                if (fileName && !fileName.endsWith('.json')) {
                    fileName += '.json';
                }

                opt.value = JSON.stringify({ file: fileName, code: course.code });
                opt.textContent = `${course.code} - ${course.title}`;
                courseSelect.appendChild(opt);
            });
        } else {
            courseSelect.setAttribute("disabled", "true");
        }
    });

    const launchSimulation = () => {
        // Clear old inline errors if any exist
        const oldError = document.getElementById("modalValidationError");
        if (oldError) oldError.remove();

        // Premium Custom Validation Check
        if (!levelSelect.value || !courseSelect.value || courseSelect.value === "") {
            const errorMsg = document.createElement("div");
            errorMsg.id = "modalValidationError";
            errorMsg.style.color = "#dc2626";
            errorMsg.style.backgroundColor = "#fee2e2";
            errorMsg.style.padding = "10px";
            errorMsg.style.borderRadius = "6px";
            errorMsg.style.marginBottom = "14px";
            errorMsg.style.fontSize = "13px";
            errorMsg.style.fontWeight = "600";
            errorMsg.style.textAlign = "center";
            errorMsg.textContent = "⚠️ Please select both an Academic Level and Course Module.";
            
            simulatorForm.insertBefore(errorMsg, document.getElementById("buildMockBtn"));
            return;
        }

        try {
            const metaData = JSON.parse(courseSelect.value);
            const questionLimitEl = document.getElementById("questionLimit");
            const limit = questionLimitEl ? questionLimitEl.value : "all";
            
            const checkedModeInput = document.querySelector('input[name="quizMode"]:checked');
            const selectedMode = checkedModeInput ? checkedModeInput.value : "practice";

            window.location.href = `quiz.html?course=${encodeURIComponent(metaData.file)}&code=${encodeURIComponent(metaData.code)}&limit=${limit}&mode=${selectedMode}`;
        
        } catch (parseError) {
            console.error("Payload routing conversion error:", parseError);
        }
    };

    if (simulatorForm) {
        simulatorForm.addEventListener("submit", (e) => {
            e.preventDefault();
            launchSimulation();
        });
    }

    document.addEventListener("click", (e) => {
        if (e.target && e.target.textContent && e.target.textContent.includes("Build My Mock")) {
            e.preventDefault();
            launchSimulation();
        }
    });
});

function openConfigModal() { document.getElementById("configModal").classList.remove("hidden"); }
function closeConfigModal() { 
    const oldError = document.getElementById("modalValidationError");
    if (oldError) oldError.remove();
    document.getElementById("configModal").classList.add("hidden"); 
}
function scrollToDepartments() { document.getElementById("departmentSection").scrollIntoView({ behavior: 'smooth' }); }
function handleOutsideClick(e) { if (e.target.id === "configModal") closeConfigModal(); }