// Initialize global haptic feedback for mobile devices
if (typeof window !== 'undefined') {
  window.triggerHaptic = (pattern = 15) => {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };
}

/* ==========================================================================
   MIVA PREP - HOMEPAGE PORTAL ENGINE
   Cascading: Faculty -> Department -> Level -> Semester -> Course
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const facultySelect = document.getElementById("facultySelect");
    const departmentSelect = document.getElementById("departmentSelect");
    const levelSelect = document.getElementById("levelSelect");
    const semesterSelect = document.getElementById("semesterSelect");
    const courseSelect = document.getElementById("courseSelect");
    const configModal = document.getElementById("configModal");

    const startSimulationBtn = document.getElementById("startSimulationBtn") || document.getElementById("buildMockBtn");
    const mockConfigForm = document.getElementById("mockConfigForm") || document.querySelector("#configModal form");

    let globalManifest = null;

    // Helper: reset downstream selects
    function resetDownstream() {
        for (let i = 0; i < arguments.length; i++) {
            const sel = arguments[i];
            if (!sel) continue;
            const msgs = [
                '-- Select a faculty first --',
                '-- Select a department first --',
                '-- Select a level first --',
                '-- Select a semester first --'
            ];
            sel.innerHTML = '<option value="" disabled selected>' + (msgs[i] || 'Select...') + '</option>';
            sel.disabled = true;
        }
    }

    // 1. FETCH MANIFEST
    if (facultySelect) {
        fetch("data/manifest.json")
            .then(res => {
                if (!res.ok) throw new Error("Failed to load manifest.");
                return res.json();
            })
            .then(data => {
                globalManifest = data;
                if (departmentSelect) resetDownstream(departmentSelect, levelSelect, semesterSelect, courseSelect);
                else resetDownstream(levelSelect, semesterSelect, courseSelect);
            })
            .catch(err => console.error("Manifest Error:", err));

        // Live user counter
        const counterEl = document.getElementById("liveUserCount");
        if (counterEl) {
            let count = Math.floor(Math.random() * 60) + 120;
            counterEl.textContent = count + ' Miva students practicing right now';
            setInterval(() => {
                count += Math.floor(Math.random() * 7) - 3;
                if (count < 90) count += 5;
                if (count > 250) count -= 5;
                counterEl.textContent = count + ' Miva students practicing right now';
            }, Math.floor(Math.random() * 3000) + 3000);
        }

        // Step A: Faculty -> Departments
        facultySelect.addEventListener("change", function(e) {
            var fid = e.target.value;
            resetDownstream(departmentSelect, levelSelect, semesterSelect, courseSelect);
            if (!globalManifest || !departmentSelect) return;

            var faculty = globalManifest.faculties.find(function(f) { return f.id === fid; });
            if (faculty && faculty.departments) {
                departmentSelect.innerHTML = '<option value="" disabled selected>Select your Department...</option>';
                faculty.departments.forEach(function(dept) {
                    var opt = document.createElement("option");
                    opt.value = dept.id;
                    opt.textContent = dept.name;
                    departmentSelect.appendChild(opt);
                });
                departmentSelect.disabled = false;
            }
        });

        // Step B: Department -> Levels
        if (departmentSelect) {
            departmentSelect.addEventListener("change", function(e) {
                var did = e.target.value;
                resetDownstream(levelSelect, semesterSelect, courseSelect);
                if (!globalManifest) return;

                var faculty = globalManifest.faculties.find(function(f) { return f.id === facultySelect.value; });
                var dept = faculty && faculty.departments ? faculty.departments.find(function(d) { return d.id === did; }) : null;
                if (dept && dept.levels) {
                    levelSelect.innerHTML = '<option value="" disabled selected>Select your Level...</option>';
                    dept.levels.forEach(function(lvl) {
                        var opt = document.createElement("option");
                        opt.value = lvl.id;
                        opt.textContent = lvl.name;
                        levelSelect.appendChild(opt);
                    });
                    levelSelect.disabled = false;
                }
            });
        }

        // Step C: Level -> Semesters
        levelSelect.addEventListener("change", function(e) {
            var lid = e.target.value;
            resetDownstream(semesterSelect, courseSelect);
            if (!globalManifest) return;

            var dept = getSelectedDepartment();
            if (dept) {
                var lvl = dept.levels.find(function(l) { return l.id === lid; });
                if (lvl && lvl.semesters) {
                    semesterSelect.innerHTML = '<option value="" disabled selected>Select your Semester...</option>';
                    lvl.semesters.forEach(function(sem) {
                        var opt = document.createElement("option");
                        opt.value = sem.id;
                        opt.textContent = sem.name;
                        semesterSelect.appendChild(opt);
                    });
                    semesterSelect.disabled = false;
                }
            }
        });

        // Step D: Semester -> Courses
        semesterSelect.addEventListener("change", function(e) {
            var sid = e.target.value;
            courseSelect.innerHTML = '<option value="" disabled selected>Select a course...</option>';
            courseSelect.disabled = true;
            if (!globalManifest) return;

            var dept = getSelectedDepartment();
            var lvl = dept ? dept.levels.find(function(l) { return l.id === levelSelect.value; }) : null;
            var sem = lvl ? lvl.semesters.find(function(s) { return s.id === sid; }) : null;

            if (sem && sem.courses.length > 0) {
                sem.courses.forEach(function(course) {
                    var opt = document.createElement("option");
                    opt.value = course.file;
                    opt.setAttribute("data-code", course.code);
                    opt.setAttribute("data-title", course.title);
                    opt.textContent = course.code + ' - ' + course.title;
                    courseSelect.appendChild(opt);
                });
                courseSelect.disabled = false;
            } else {
                courseSelect.innerHTML = '<option value="" disabled>No courses available yet for this semester.</option>';
            }
        });
    }

    // Helper: get selected department object
    function getSelectedDepartment() {
        if (!globalManifest || !facultySelect || !departmentSelect) return null;
        var faculty = globalManifest.faculties.find(function(f) { return f.id === facultySelect.value; });
        return faculty && faculty.departments ? faculty.departments.find(function(d) { return d.id === departmentSelect.value; }) : null;
    }

    // 2. LAUNCH SIMULATION
    function launchSimulation(e) {
        if (e && typeof e.preventDefault === "function") e.preventDefault();

        var file = courseSelect.value;
        var selectedOpt = courseSelect.options[courseSelect.selectedIndex];

        if (!file || courseSelect.selectedIndex === 0) {
            alert("Please select a course to start your mock exam.");
            return false;
        }

        var code = selectedOpt.getAttribute("data-code");
        var title = selectedOpt.getAttribute("data-title");

        var selectedMode = (document.querySelector('input[name="quizMode"]:checked') || {}).value ||
                           (document.querySelector('input[name="examMode"]:checked') || {}).value || "practice";
        var selectedLimit = (document.getElementById("questionLimit") || {}).value || "10";

        var url = 'quiz.html?course=' + encodeURIComponent(file) + '&code=' + encodeURIComponent(code) + '&title=' + encodeURIComponent(title) + '&mode=' + selectedMode + '&limit=' + selectedLimit;
        console.log("Launching:", url);
        window.location.href = url;
        return false;
    }

    if (mockConfigForm) mockConfigForm.addEventListener("submit", launchSimulation);
    if (startSimulationBtn) startSimulationBtn.addEventListener("click", launchSimulation);

    // 3. THEME CONTROLLER
    var themeToggleBtn = document.getElementById("themeToggleBtn");
    var savedTheme = localStorage.getItem("miva-theme") ||
                     (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", function() {
            var current = document.documentElement.getAttribute("data-theme");
            var next = current === "light" ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("miva-theme", next);
        });
    }
});

/* Modal helpers */
window.openConfigModal = function() {
    var m = document.getElementById("configModal");
    if (m) m.classList.remove("hidden");
};
window.closeConfigModal = function() {
    var m = document.getElementById("configModal");
    if (m) m.classList.add("hidden");
};

/* Custom toast instead of alert */
window.alert = function(message) {
    console.warn("Intercepted alert:", message);
    var toast = document.getElementById("custom-app-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "custom-app-toast";
        toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-20px);background:#1e1b4b;color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.6);z-index:9999999;font-weight:600;font-size:0.85rem;transition:all 0.3s;opacity:0;pointer-events:none;border-left:4px solid #a855f7;font-family:sans-serif;text-align:center;width:88%;max-width:340px;white-space:normal;line-height:1.4;';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
    setTimeout(function() {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(-20px)";
    }, 3500);
};
