/* ==========================================================================
   MIVAPULSE v2 - ADMIN MODERATION CONSOLE ENGINE
   JWT auth, RBAC, contribution moderation, audit trail verification
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const API = '/api/v2';
    let authToken = localStorage.getItem('mivapulse_auth_token') || '';
    let currentUser = null;

    // DOM refs
    const loginScreen = document.getElementById('adminLogin');
    const dashboard = document.getElementById('adminDashboard');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginError = document.getElementById('loginError');
    const adminUsername = document.getElementById('adminUsername');
    const adminRole = document.getElementById('adminRole');
    const themeBtn = document.getElementById('themeToggleBtn');

    // Theme toggle
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const cur = document.documentElement.getAttribute('data-theme');
            const next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('miva-theme', next);
        });
    }

    // ── AUTH ──
    async function tryAutoLogin() {
        if (!authToken) return false;
        try {
            const res = await fetch(`${API}/admin-auth/verify`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!res.ok) return false;
            const data = await res.json();
            if (data.success) {
                currentUser = data.user;
                showDashboard();
                return true;
            }
        } catch {}
        return false;
    }

    function showDashboard() {
        if (loginScreen) loginScreen.style.display = 'none';
        if (dashboard) dashboard.style.display = 'block';
        if (adminUsername) adminUsername.textContent = currentUser?.username || '';
        if (adminRole) adminRole.textContent = currentUser?.role || '';
        loadQueue();
        loadUsers();
        loadAudit();
    }

    function showLogin() {
        if (loginScreen) loginScreen.style.display = 'block';
        if (dashboard) dashboard.style.display = 'none';
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const username = document.getElementById('loginUsername')?.value || '';
            const password = document.getElementById('loginPassword')?.value || '';
            if (!username || !password) {
                if (loginError) { loginError.style.display = 'block'; loginError.textContent = 'Enter credentials.'; }
                return;
            }
            try {
                const res = await fetch(`${API}/admin-auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.success) {
                    authToken = data.token;
                    currentUser = data.user;
                    localStorage.setItem('mivapulse_auth_token', authToken);
                    if (loginError) loginError.style.display = 'none';
                    showDashboard();
                } else {
                    if (loginError) { loginError.style.display = 'block'; loginError.textContent = data.error || 'Login failed.'; }
                }
            } catch (err) {
                if (loginError) { loginError.style.display = 'block'; loginError.textContent = 'Connection error. Make sure the dev server is running (vercel dev).'; }
            }
        });
    }

    // Enter key login
    document.getElementById('loginPassword')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginBtn?.click();
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            authToken = '';
            currentUser = null;
            localStorage.removeItem('mivapulse_auth_token');
            showLogin();
        });
    }

    // ── TABS ──
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => {
                t.classList.remove('active');
                t.style.borderBottom = 'none';
                t.style.color = 'var(--text-secondary)';
            });
            tab.classList.add('active');
            tab.style.borderBottom = '2px solid #a855f7';
            tab.style.color = 'var(--text-primary)';

            document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
            const target = tab.dataset.tab;
            if (target === 'queue') document.getElementById('tabQueue').style.display = 'block';
            if (target === 'courses') { document.getElementById('tabCourses').style.display = 'block'; loadCourseBuilder(); }
            if (target === 'testbank') { document.getElementById('tabTestbank').style.display = 'block'; loadTestBank(); }
            if (target === 'announcements') { document.getElementById('tabAnnouncements').style.display = 'block'; loadAnnouncements(); }
            if (target === 'users') document.getElementById('tabUsers').style.display = 'block';
            if (target === 'audit') { 
                document.getElementById('tabAudit').style.display = 'block'; 
                // Only load if not already loaded
                const auditList = document.getElementById('auditList');
                if (auditList && auditList.innerHTML.includes('Loading...')) {
                    loadAudit(); 
                }
            }
        });
    });

    // ── PENDING QUEUE ──
    async function loadQueue() {
        const list = document.getElementById('queueList');
        const count = document.getElementById('queueCount');
        if (!list) return;
        try {
            const res = await fetch(`${API}/contributions?status=pending`);
            const data = await res.json();
            const items = data.contributions || [];
            if (count) count.textContent = items.length;

            if (items.length === 0) {
                list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-style:italic;padding:40px;">No pending submissions. Queue is clear.</p>';
                return;
            }

            list.innerHTML = items.map(item => {
                const q = item.question || {};
                return `
                <div style="padding:16px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:12px;" data-id="${item.id}">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                        <div>
                            <span style="font-size:0.7rem;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.1);padding:2px 6px;border-radius:4px;">${q.type || 'MCQ'}</span>
                            <span style="font-size:0.75rem;color:var(--text-secondary);margin-left:8px;">${q.courseCode || 'Unknown'} | ${q.faculty || 'Unknown'}</span>
                        </div>
                        <span style="font-size:0.7rem;color:var(--text-secondary);">${new Date(item.submittedAt).toLocaleDateString()}</span>
                    </div>
                    <p style="font-size:0.9rem;font-weight:600;margin-bottom:8px;">${(q.questionText || q.question || 'No question text').slice(0, 200)}</p>
                    ${q.options ? `<p style="font-size:0.8rem;color:var(--text-secondary);">Options: ${JSON.stringify(q.options).slice(0, 100)}...</p>` : ''}
                    <div style="display:flex;gap:8px;margin-top:12px;">
                        <button class="approve-btn" data-id="${item.id}" style="padding:6px 14px;border:none;border-radius:6px;background:#10b981;color:white;font-weight:600;cursor:pointer;font-size:0.8rem;">Approve</button>
                        <button class="reject-btn" data-id="${item.id}" style="padding:6px 14px;border:none;border-radius:6px;background:#ef4444;color:white;font-weight:600;cursor:pointer;font-size:0.8rem;">Reject</button>
                    </div>
                </div>`;
            }).join('');

            // Bind approve/reject
            list.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', () => moderateAction(btn.dataset.id, 'approve'));
            });
            list.querySelectorAll('.reject-btn').forEach(btn => {
                btn.addEventListener('click', () => moderateAction(btn.dataset.id, 'reject'));
            });

        } catch (err) {
            list.innerHTML = `<p style="color:#ef4444;">Error loading queue: ${err.message}. Make sure the dev server is running.</p>`;
        }
    }

    async function moderateAction(id, action) {
        try {
            const res = await fetch(`${API}/contributions/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ contributionId: id, notes: `Action by ${currentUser?.username || 'admin'}` })
            });
            const data = await res.json();
            if (data.success) {
                loadQueue();
                loadAudit();
            } else {
                alert(`Action failed: ${data.error}`);
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    }

    // ── USERS & ROLES ──
    const createUserBtn = document.getElementById('createUserBtn');
    const createUserForm = document.getElementById('createUserForm');
    const cancelCreateBtn = document.getElementById('cancelCreateBtn');
    const saveUserBtn = document.getElementById('saveUserBtn');

    if (createUserBtn) createUserBtn.addEventListener('click', () => {
        if (createUserForm) createUserForm.style.display = 'block';
    });
    if (cancelCreateBtn) cancelCreateBtn.addEventListener('click', () => {
        if (createUserForm) createUserForm.style.display = 'none';
    });

    if (saveUserBtn) {
        saveUserBtn.addEventListener('click', async () => {
            const username = document.getElementById('newUsername')?.value || '';
            const password = document.getElementById('newPassword')?.value || '';
            const role = document.getElementById('newUserRole')?.value || 'Viewer';

            if (!username || !password) { alert('Enter username and password.'); return; }

            const perms = role === 'SuperAdmin' ? ['*'] :
                          role === 'Reviewer' ? ['review:read','review:approve','review:reject','review:edit','questions:read'] :
                          ['analytics:read','questions:read'];

            try {
                const res = await fetch(`${API}/admin-auth/users`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({ username, password, role, permissions: perms })
                });
                const data = await res.json();
                if (data.success) {
                    if (createUserForm) createUserForm.style.display = 'none';
                    loadUsers();
                } else {
                    alert(`Error: ${data.error}`);
                }
            } catch (err) {
                alert(`Error: ${err.message}`);
            }
        });
    }

    async function loadUsers() {
        const list = document.getElementById('usersList');
        if (!list) return;
        try {
            const res = await fetch(`${API}/admin-auth/users`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();
            const users = data.users || [];
            list.innerHTML = users.map(u => `
                <div style="padding:12px 16px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong style="font-size:0.9rem;">${u.username}</strong>
                        <span style="font-size:0.75rem;color:var(--text-secondary);margin-left:8px;">${u.role}</span>
                    </div>
                    <span style="font-size:0.7rem;color:var(--text-secondary);">${new Date(u.createdAt).toLocaleDateString()}</span>
                </div>
            `).join('');
        } catch {
            list.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;">Could not load users. API may be offline.</p>';
        }
    }

    // ── AUDIT TRAIL ──
    async function loadAudit() {
        const list = document.getElementById('auditList');
        if (!list) return;
        
        // Prevent multiple simultaneous loads
        if (list.dataset.loading === 'true') return;
        list.dataset.loading = 'true';
        try {
            const res = await fetch(`${API}/audit`);
            const data = await res.json();
            const entries = data.entries || [];
            if (entries.length === 0) {
                list.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;">No audit entries yet.</p>';
                return;
            }
            list.innerHTML = entries.map(e => `
                <div style="padding:10px 14px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:8px;font-size:0.8rem;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-weight:700;color:#a855f7;">${e.action}</span>
                        <span style="color:var(--text-secondary);font-size:0.7rem;">${new Date(e.timestamp).toLocaleString()}</span>
                    </div>
                    <div style="color:var(--text-secondary);">
                        Actor: ${e.actorId} (${e.actorRole}) | Resource: ${e.resourceId || 'N/A'}
                    </div>
                    <div style="color:var(--text-secondary);font-size:0.7rem;margin-top:2px;font-family:monospace;">
                        Hash: ${(e.integrityHash || '').slice(0, 16)}...
                    </div>
                </div>
            `).join('');
        } catch {
            list.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;">Audit log unavailable. API may be offline.</p>';
        } finally {
            list.dataset.loading = 'false';
        }
    }

    // Verify chain
    const verifyBtn = document.getElementById('verifyChainBtn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
            const status = document.getElementById('chainStatus');
            if (!status) return;
            status.style.display = 'block';
            status.style.background = 'rgba(168,85,247,0.1)';
            status.style.color = '#a855f7';
            status.textContent = 'Verifying SHA-256 chain integrity...';
            try {
                const res = await fetch(`${API}/audit/verify`);
                const data = await res.json();
                if (data.valid) {
                    status.style.background = 'rgba(16,185,129,0.1)';
                    status.style.color = '#10b981';
                    status.textContent = `Chain verified. ${data.total} entries intact. No tampering detected.`;
                } else {
                    status.style.background = 'rgba(239,68,68,0.1)';
                    status.style.color = '#ef4444';
                    status.textContent = `TAMPER DETECTED! ${data.invalidEntries?.length || 0} invalid entries found.`;
                }
            } catch {
                status.style.background = 'rgba(239,68,68,0.1)';
                status.style.color = '#ef4444';
                status.textContent = 'Verification failed. Audit API may be offline.';
            }
        });
    }

    const refreshBtn = document.getElementById('refreshAuditBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadAudit);


    // ── PASSWORD RESET FLOW ──
    const resetScreen = document.getElementById('adminResetScreen');
    const forgotLink = document.getElementById('forgotPasswordLink');
    const backToLoginLink = document.getElementById('backToLoginLink');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const resetNextBtn = document.getElementById('resetNextBtn');
    const verifyAnswersBtn = document.getElementById('verifyAnswersBtn');
    const saveNewPwBtn = document.getElementById('saveNewPwBtn');
    const resetError = document.getElementById('resetError');

    function showResetScreen() {
        if (loginScreen) loginScreen.style.display = 'none';
        if (resetScreen) resetScreen.style.display = 'block';
        resetToStep1();
    }

    function showLoginFromReset() {
        if (resetScreen) resetScreen.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'block';
        resetToStep1();
    }

    function resetToStep1() {
        document.getElementById('resetStep1').style.display = 'block';
        document.getElementById('resetStep2').style.display = 'none';
        document.getElementById('resetStep3').style.display = 'none';
        document.getElementById('resetStepDone').style.display = 'none';
        if (resetError) resetError.style.display = 'none';
        const sub = document.getElementById('resetSubtitle');
        if (sub) sub.textContent = 'Enter your username to begin';
    }

    if (forgotLink) forgotLink.addEventListener('click', (e) => { e.preventDefault(); showResetScreen(); });
    if (backToLoginLink) backToLoginLink.addEventListener('click', (e) => { e.preventDefault(); showLoginFromReset(); });
    if (backToLoginBtn) backToLoginBtn.addEventListener('click', showLoginFromReset);

    let resetUserId = null;

    if (resetNextBtn) resetNextBtn.addEventListener('click', async () => {
        const username = document.getElementById('resetUsername')?.value?.trim();
        if (!username) { if (resetError) { resetError.style.display = 'block'; resetError.textContent = 'Enter your username.'; } return; }
        try {
            const res = await fetch(`${API}/admin-auth/users`);
            const data = await res.json();
            const user = (data.users || []).find(u => u.username === username);
            if (!user) {
                if (resetError) { resetError.style.display = 'block'; resetError.textContent = 'User not found.'; }
                return;
            }
            resetUserId = user.id;
            // Show security questions (simplified - just confirm identity)
            document.getElementById('resetStep1').style.display = 'none';
            document.getElementById('resetStep2').style.display = 'block';
            const sub = document.getElementById('resetSubtitle');
            if (sub) sub.textContent = `Verify identity for ${username}`;
            const sqContainer = document.getElementById('securityQuestionsContainer');
            sqContainer.innerHTML = `
                <div class="form-group" style="margin-bottom:12px;">
                    <label>Confirm your role</label>
                    <select id="resetRoleConfirm" style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;">
                        <option value="">-- Select your role --</option>
                        <option value="SuperAdmin">SuperAdmin</option>
                        <option value="Reviewer">Reviewer</option>
                        <option value="Viewer">Viewer</option>
                    </select>
                </div>
                <p style="font-size:0.78rem;color:var(--text-secondary);">Select your assigned role to verify identity.</p>
            `;
            if (resetError) resetError.style.display = 'none';
        } catch (err) {
            if (resetError) { resetError.style.display = 'block'; resetError.textContent = 'Could not verify user. Dev server may be offline.'; }
        }
    });

    if (verifyAnswersBtn) verifyAnswersBtn.addEventListener('click', () => {
        const roleConfirm = document.getElementById('resetRoleConfirm')?.value;
        if (!roleConfirm) {
            if (resetError) { resetError.style.display = 'block'; resetError.textContent = 'Please select your role.'; }
            return;
        }
        document.getElementById('resetStep2').style.display = 'none';
        document.getElementById('resetStep3').style.display = 'block';
        const sub = document.getElementById('resetSubtitle');
        if (sub) sub.textContent = 'Set your new password';
        if (resetError) resetError.style.display = 'none';
    });

    if (saveNewPwBtn) saveNewPwBtn.addEventListener('click', async () => {
        const newPw = document.getElementById('resetNewPassword')?.value || '';
        const confirmPw = document.getElementById('resetConfirmPassword')?.value || '';
        if (newPw.length < 6) {
            if (resetError) { resetError.style.display = 'block'; resetError.textContent = 'Password must be at least 6 characters.'; }
            return;
        }
        if (newPw !== confirmPw) {
            if (resetError) { resetError.style.display = 'block'; resetError.textContent = 'Passwords do not match.'; }
            return;
        }
        try {
            const res = await fetch(`${API}/admin-auth/users`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: resetUserId, password: newPw })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('resetStep3').style.display = 'none';
                document.getElementById('resetStepDone').style.display = 'block';
                const sub = document.getElementById('resetSubtitle');
                if (sub) sub.textContent = 'Password updated successfully';
            } else {
                if (resetError) { resetError.style.display = 'block'; resetError.textContent = data.error || 'Reset failed.'; }
            }
        } catch (err) {
            if (resetError) { resetError.style.display = 'block'; resetError.textContent = 'Connection error. Dev server may be offline.'; }
        }
    });


    // ── COURSE BUILDER ──
    async function loadCourseBuilder() {
        const list = document.getElementById('courseList');
        if (!list) return;
        try {
            const res = await fetch('data/manifest.json');
            const manifest = await res.json();
            let html = '<h4 style="font-size:0.9rem;font-weight:700;margin:0 0 12px;color:var(--text-secondary);">Existing Courses</h4>';
            manifest.faculties.forEach(faculty => {
                if (faculty.departments) {
                    faculty.departments.forEach(dept => {
                        if (dept.levels) {
                            dept.levels.forEach(level => {
                                if (level.semesters) {
                                    level.semesters.forEach(sem => {
                                        if (sem.courses) {
                                            sem.courses.forEach(course => {
                                                // Use code and title from manifest
                                                const courseCode = course.code || 'N/A';
                                                const courseTitle = course.title || courseCode;
                                                const courseFile = course.file || '';
                                                html += `<div style="padding:12px 16px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                                                    <div>
                                                        <strong style="font-size:0.88rem;">${courseTitle}</strong>
                                                        <span style="font-size:0.72rem;color:var(--text-secondary);margin-left:8px;">${courseCode}</span>
                                                        <span style="font-size:0.7rem;color:#a855f7;margin-left:8px;">${faculty.name} > ${dept.name} > ${level.name}</span>
                                                    </div>
                                                    <button class="edit-course-btn" data-code="${courseCode}" data-title="${courseTitle}" data-file="${courseFile}" style="padding:6px 12px;border:1px solid var(--border-color);border-radius:6px;background:none;color:var(--text-secondary);cursor:pointer;font-size:0.75rem;"><i class="fas fa-edit"></i> Edit</button>
                                                </div>`;
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
            list.innerHTML = html;
        } catch (err) {
            list.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;">Could not load courses.</p>';
        }
    }
    
    // Modal helpers
    function showModal(title, content) {
        const modal = document.getElementById('adminModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');
        if (modal && modalTitle && modalContent) {
            modalTitle.textContent = title;
            modalContent.innerHTML = content;
            modal.style.display = 'block';
        }
    }
    
    function closeModal() {
        const modal = document.getElementById('adminModal');
        if (modal) modal.style.display = 'none';
    }
    
    // Close modal on X button
    document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
    
    // Close modal on backdrop click
    document.getElementById('adminModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'adminModal') closeModal();
    });
    
    // Course Builder button handlers - use event delegation
    document.addEventListener('click', (e) => {
        // New Course button
        if (e.target.closest('#addCourseBtn')) {
            e.preventDefault();
            
            // Load departments dynamically
            fetch('data/manifest.json')
                .then(r => r.json())
                .then(manifest => {
                    let deptOptions = '';
                    const departments = [];
                    
                    manifest.faculties.forEach(faculty => {
                        if (faculty.departments) {
                            faculty.departments.forEach(dept => {
                                departments.push({ name: dept.name, faculty: faculty.name });
                            });
                        }
                    });
                    
                    deptOptions = departments.map(d => 
                        `<option value="${d.name.toLowerCase().replace(/\s+/g, '-')}">${d.name} (${d.faculty})</option>`
                    ).join('');
                    
                    showModal('Create New Course', `
                        <form id="newCourseForm">
                            <div style="margin-bottom:14px;">
                                <label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Course Code</label>
                                <input type="text" id="newCourseCode" required style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;" placeholder="e.g. COS 102" />
                            </div>
                            <div style="margin-bottom:14px;">
                                <label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Course Name</label>
                                <input type="text" id="newCourseName" required style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;" placeholder="e.g. Problem Solving" />
                            </div>
                            <div style="margin-bottom:14px;">
                                <label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Department</label>
                                <select id="newCourseDept" style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;">
                                    ${deptOptions}
                                </select>
                            </div>
                            <div style="margin-bottom:14px;padding:12px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:8px;">
                                <p style="font-size:0.78rem;color:var(--text-secondary);margin:0;"><strong>Note:</strong> Course code must be unique. Existing courses will be detected to prevent duplicates.</p>
                            </div>
                            <button type="submit" style="width:100%;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#a855f7,#7c3aed);color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">Create Course</button>
                        </form>
                    `);
                    
                    // Handle form submission
                    setTimeout(() => {
                        document.getElementById('newCourseForm')?.addEventListener('submit', (e) => {
                            e.preventDefault();
                            const code = document.getElementById('newCourseCode')?.value?.trim().toUpperCase();
                            const name = document.getElementById('newCourseName')?.value?.trim();
                            const dept = document.getElementById('newCourseDept')?.value;
                            
                            // Check for duplicate course code
                            const existingCourses = [];
                            manifest.faculties.forEach(faculty => {
                                if (faculty.departments) {
                                    faculty.departments.forEach(deptObj => {
                                        if (deptObj.levels) {
                                            deptObj.levels.forEach(level => {
                                                if (level.semesters) {
                                                    level.semesters.forEach(sem => {
                                                        if (sem.courses) {
                                                            sem.courses.forEach(course => {
                                                                existingCourses.push((course.code || '').toUpperCase());
                                                            });
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                            
                            if (existingCourses.includes(code)) {
                                alert(`Course code "${code}" already exists! Please use a different code.`);
                                return;
                            }
                            
                            console.log('Creating course:', { code, name, dept });
                            alert(`Course "${name}" (${code}) created successfully!\n\nDepartment: ${dept}\n\nNote: This will be saved to manifest.json in production.`);
                            closeModal();
                            loadCourseBuilder();
                        });
                    }, 100);
                });
        }
        
        // Edit Course button
        if (e.target.closest('.edit-course-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.edit-course-btn');
            const courseCode = btn.dataset.code;
            const courseTitle = btn.dataset.title;
            const courseFile = btn.dataset.file;
            
            console.log('Edit course:', { courseCode, courseTitle, courseFile });
            
            showModal(`Edit: ${courseTitle}`, `
                <form id="editCourseForm">
                    <div style="margin-bottom:14px;">
                        <label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Course Code</label>
                        <input type="text" id="editCourseCode" value="${courseCode}" style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;" />
                    </div>
                    <div style="margin-bottom:14px;">
                        <label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Course Title</label>
                        <input type="text" id="editCourseTitle" value="${courseTitle}" style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;" />
                    </div>
                    <div style="margin-bottom:14px;padding:12px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:8px;">
                        <p style="font-size:0.75rem;color:var(--text-secondary);margin:0;"><strong>File:</strong> ${courseFile}</p>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button type="submit" style="flex:1;padding:12px;border:none;border-radius:10px;background:#10b981;color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">Save Changes</button>
                        <button type="button" id="cancelEditBtn" style="flex:1;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:none;color:var(--text-secondary);font-weight:600;cursor:pointer;font-size:0.9rem;">Cancel</button>
                    </div>
                </form>
            `);
            
            setTimeout(() => {
                document.getElementById('editCourseForm')?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const newCode = document.getElementById('editCourseCode')?.value;
                    const newTitle = document.getElementById('editCourseTitle')?.value;
                    console.log('Saving course:', { newCode, newTitle, courseFile });
                    alert(`Course "${newTitle}" (${newCode}) updated successfully!\n\nNote: Changes will be saved to manifest.json in production.`);
                    closeModal();
                    loadCourseBuilder();
                });
                document.getElementById('cancelEditBtn')?.addEventListener('click', closeModal);
            }, 100);
        }
        
        // Import Questions button
        if (e.target.closest('#importQuestionsBtn')) {
            e.preventDefault();
            showModal('Import Questions', `
                <form id="importQuestionsForm">
                    <div style="margin-bottom:14px;">
                        <label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Select JSON File</label>
                        <input type="file" id="importFile" accept=".json" required style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;" />
                    </div>
                    <div style="margin-bottom:14px;padding:12px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:8px;">
                        <p style="font-size:0.78rem;color:var(--text-secondary);margin:0;">File should contain questions in JSON format with fields: question, options, correctAnswer, type, courseCode.</p>
                    </div>
                    <button type="submit" style="width:100%;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#a855f7,#7c3aed);color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">Import Questions</button>
                </form>
            `);
            
            setTimeout(() => {
                document.getElementById('importQuestionsForm')?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const fileInput = document.getElementById('importFile');
                    if (fileInput?.files[0]) {
                        alert(`Importing questions from: ${fileInput.files[0].name}\n\nNote: File processing will be implemented in production.`);
                        closeModal();
                    }
                });
            }, 100);
        }
        
        // Add Question button
        if (e.target.closest('#addQuestionBtn')) {
            e.preventDefault();
            showModal('Add New Question', `
                <form id="addQuestionForm">
                    <div style="margin-bottom:14px;">
                        <label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Question Type</label>
                        <select id="questionType" style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;">
                            <option value="MCQ">Multiple Choice (MCQ)</option>
                            <option value="Essay">Essay</option>
                        </select>
                    </div>
                    <div style="margin-bottom:14px;">
                        <label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Question Text</label>
                        <textarea id="questionText" rows="3" required style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;resize:vertical;font-family:inherit;" placeholder="Enter your question..."></textarea>
                    </div>
                    <div style="margin-bottom:14px;">
                        <label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Course Code</label>
                        <input type="text" id="questionCourse" required style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-app);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;" placeholder="e.g. COS 102" />
                    </div>
                    <button type="submit" style="width:100%;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#a855f7,#7c3aed);color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">Add Question</button>
                </form>
            `);
            
            setTimeout(() => {
                document.getElementById('addQuestionForm')?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const type = document.getElementById('questionType')?.value;
                    const text = document.getElementById('questionText')?.value;
                    const course = document.getElementById('questionCourse')?.value;
                    console.log('Adding question:', { type, text, course });
                    alert(`Question added successfully!\n\nType: ${type}\nCourse: ${course}\n\nNote: This will be saved to the test bank in production.`);
                    closeModal();
                });
            }, 100);
        }
    });

    // ── TEST BANK MANAGER ──
    async function loadTestBank() {
        const list = document.getElementById('testBankList');
        const totalEl = document.getElementById('totalQuestionsCount');
        const mcqEl = document.getElementById('mcqCount');
        const essayEl = document.getElementById('essayCount');
        const courseEl = document.getElementById('courseCount');
        if (!list) return;
        
        try {
            const res = await fetch('data/manifest.json');
            const manifest = await res.json();
            
            let totalQ = 0, mcqQ = 0, essayQ = 0, courseCount = 0;
            const fetchPromises = [];
            
            manifest.faculties.forEach(faculty => {
                if (faculty.departments) {
                    faculty.departments.forEach(dept => {
                        if (dept.levels) {
                            dept.levels.forEach(level => {
                                if (level.semesters) {
                                    level.semesters.forEach(sem => {
                                        if (sem.courses) {
                                            sem.courses.forEach(course => {
                                                courseCount++;
                                                // Use the file path from manifest
                                                const coursePath = `data/${course.file}`;
                                                
                                                // Add fetch promise
                                                fetchPromises.push(
                                                    fetch(coursePath)
                                                        .then(r => r.json())
                                                        .then(data => {
                                                            // Questions can be array or object with questions key
                                                            const questions = Array.isArray(data) ? data : (data.questions || []);
                                                            totalQ += questions.length;
                                                            // Count by type (case-insensitive)
                                                            mcqQ += questions.filter(q => (q.type || '').toLowerCase() === 'mcq').length;
                                                            essayQ += questions.filter(q => (q.type || '').toLowerCase() === 'essay').length;
                                                        })
                                                        .catch(err => {
                                                            console.log('Could not load:', coursePath, err.message);
                                                        })
                                                );
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
            
            // Wait for all fetches to complete
            await Promise.all(fetchPromises);
            
            // Update counts
            if (totalEl) totalEl.textContent = totalQ;
            if (mcqEl) mcqEl.textContent = mcqQ;
            if (essayEl) essayEl.textContent = essayQ;
            if (courseEl) courseEl.textContent = courseCount;
            
            list.innerHTML = `<p style="text-align:center;color:var(--text-secondary);font-style:italic;padding:20px;">Test bank loaded. Found <strong>${totalQ}</strong> questions across <strong>${courseCount}</strong> courses.</p>`;
        } catch (err) {
            console.error('Test bank error:', err);
            list.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;">Could not load test bank.</p>';
        }
    }

    // ── ANNOUNCEMENTS ──
    let announcements = JSON.parse(localStorage.getItem('mivapulse_announcements') || '[]');
    
    function loadAnnouncements() {
        const list = document.getElementById('announcementList');
        if (!list) return;
        
        if (announcements.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-style:italic;padding:20px;">No announcements yet.</p>';
            return;
        }
        
        list.innerHTML = announcements.slice(0, 10).map(a => `
            <div style="padding:14px;background:var(--bg-app);border:1px solid var(--border-color);border-radius:10px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                    <strong style="font-size:0.9rem;">${a.title}</strong>
                    <span style="font-size:0.68rem;padding:3px 8px;border-radius:4px;font-weight:600;${a.priority === 'urgent' ? 'background:#ef4444;color:white;' : a.priority === 'high' ? 'background:#f59e0b;color:white;' : 'background:var(--border-color);color:var(--text-secondary);'}">${a.priority || 'normal'}</span>
                </div>
                <p style="font-size:0.82rem;color:var(--text-secondary);margin:0 0 6px;">${a.message}</p>
                <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);">
                    <span>Target: ${a.target}</span>
                    <span>${new Date(a.timestamp).toLocaleString()}</span>
                </div>
            </div>
        `).join('');
    }

    const broadcastBtn = document.getElementById('broadcastBtn');
    if (broadcastBtn) {
        broadcastBtn.addEventListener('click', () => {
            const title = document.getElementById('announcementTitle')?.value?.trim();
            const message = document.getElementById('announcementMessage')?.value?.trim();
            const priority = document.getElementById('announcementPriority')?.value || 'normal';
            const target = document.getElementById('announcementTarget')?.value || 'all';
            const status = document.getElementById('announcementStatus');
            
            if (!title || !message) {
                if (status) {
                    status.style.display = 'block';
                    status.style.background = 'rgba(239,68,68,0.1)';
                    status.style.color = '#ef4444';
                    status.textContent = 'Please enter a title and message.';
                }
                return;
            }
            
            const announcement = { title, message, priority, target, timestamp: new Date().toISOString(), author: currentUser?.username || 'admin' };
            announcements.unshift(announcement);
            localStorage.setItem('mivapulse_announcements', JSON.stringify(announcements));
            
            // Clear form
            document.getElementById('announcementTitle').value = '';
            document.getElementById('announcementMessage').value = '';
            
            if (status) {
                status.style.display = 'block';
                status.style.background = 'rgba(16,185,129,0.1)';
                status.style.color = '#10b981';
                status.textContent = 'Announcement broadcast successfully!';
                setTimeout(() => { status.style.display = 'none'; }, 3000);
            }
            
            loadAnnouncements();
        });
    }

    // Auto-login check
    tryAutoLogin();
});
