document.addEventListener('DOMContentLoaded', async () => {
    const firebaseConfig = {
        apiKey: "AIzaSyBQa0qbVaqTvpFGAJjFj2BTRm1c29z48fw",
        authDomain: "k-i-b-o-24cbe.firebaseapp.com",
        projectId: "k-i-b-o-24cbe",
        storageBucket: "k-i-b-o-24cbe.firebasestorage.app",
        messagingSenderId: "983754137013",
        appId: "1:983754137013:web:31731ce76eb8c036d7cdfc",
        measurementId: "G-0YHHMQ08BF"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const storage = firebase.storage();
    const auth = firebase.auth();

    const sidebar = document.querySelector('.sidebar-right');
    if (sidebar) {
        sidebar.addEventListener('click', function () {
            if (window.innerWidth <= 1200) {
                sidebar.classList.toggle('expanded');
            }
        });
    }

    const USER_ROLES_MAP = {
        'alumno': 'Alumno',
        'profesor': 'Profesor',
        'padre': 'Padre',
        'desarrollador': 'Desarrollador',
        'default': 'Usuario'
    };

    const INDEX_PAGES = {
        'alumno': '/index_alumno',
        'profesor': '/index_profesor',
        'padre': '/index_padre',
        'desarrollador': '/index_desarrollador',
        'default': '/'
    };

    function redirectToRoleIndex(role, currentPath) {
        const targetPath = INDEX_PAGES[role] || INDEX_PAGES['default'];
        if (currentPath === '/login' || currentPath === '/') {
            window.location.replace(targetPath);
        }
    }

    // --- FUNCIONES DE SOPORTE GLOBALES ---

    function showToast(message, type = 'success', duration = 4000) {
        const toastContainer = document.getElementById('toast-container') || document.body.appendChild(document.createElement('div'));
        toastContainer.id = 'toast-container';

        const toast = document.createElement('div');
        toast.classList.add('toast', type);

        let iconClass = '';
        if (type === 'success') {
            iconClass = 'fas fa-check-circle';
        } else if (type === 'error') {
            iconClass = 'fas fa-times-circle';
        } else {
            iconClass = 'fas fa-info-circle';
        }

        toast.innerHTML = `<i class="${iconClass}"></i><span>${message}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            }, {
                once: true
            });
        }, duration);
    }
    window.showToast = showToast;

    // --- LÓGICA DE MONITOREO Y VINCULACIÓN (MOVIDA A ESTE ÁMBITO) ---

    async function loadTeachersForSelects() {
        const monitorSelect = document.getElementById('teacher-monitor-select');
        const assignSelect = document.getElementById('teacher-assign-select');

        if (!monitorSelect && !assignSelect) return;

        try {
            const snapshot = await db.collection('users').where('role', '==', 'profesor').get();

            const optionsHtml = snapshot.docs.map(doc => {
                const teacher = doc.data();
                return `<option value="${doc.id}">${teacher.name} (${teacher.email})</option>`;
            }).join('');

            const placeholderOption = '<option value="">Cargando Profesores...</option>';

            if (monitorSelect) {
                monitorSelect.innerHTML = placeholderOption + optionsHtml;
                if (!monitorSelect.dataset.listenerAdded) {
                    monitorSelect.addEventListener('change', (e) => loadTeacherStudents(e.target.value));
                    monitorSelect.dataset.listenerAdded = 'true';
                }
            }

            if (assignSelect) {
                assignSelect.innerHTML = placeholderOption + optionsHtml;
            }

        } catch (error) {
            console.error("Error cargando profesores:", error);
            const errorOption = '<option value="">Error al cargar profesores</option>';
            if (monitorSelect) monitorSelect.innerHTML = errorOption;
            if (assignSelect) assignSelect.innerHTML = errorOption;
        }
    }

    async function loadTeacherStudents(teacherId) {
        const container = document.getElementById('students-grid-container');
        if (!container) return;

        container.innerHTML = '<p class="empty-state">Cargando alumnos...</p>';

        if (!teacherId) {
            container.innerHTML = '<p class="empty-state">Selecciona un profesor para cargar la lista de alumnos.</p>';
            return;
        }

        try {
            const studentsSnap = await db.collection('users').where('teacherId', '==', teacherId).get();

            if (studentsSnap.empty) {
                container.innerHTML = '<p class="empty-state">Este profesor no tiene alumnos vinculados.</p>';
                return;
            }

            let studentsHtml = '<div class="student-list-monitor" style="display: flex; flex-direction: column; gap: 10px;">';
            studentsSnap.forEach(doc => {
                const student = doc.data();
                studentsHtml += `
                    <div class="monitor-student-card" style="display: flex; align-items: center; background-color: #102540; padding: 10px; border-radius: 8px; border: 1px solid #172e4d;">
                        <img src="${student.avatarUrl || 'static/images/Icon.png'}" alt="Avatar" class="monitor-avatar" style="width: 35px; height: 35px; border-radius: 50%; margin-right: 15px; object-fit: cover;">
                        <div class="monitor-info" style="flex-grow: 1;">
                            <h4 style="margin: 0; font-size: 0.95em; color: #ebf0f5; font-weight: 600;">${student.name}</h4>
                            <p style="margin: 0; font-size: 0.8em; color: #7d96b3;">${student.email}</p>
                        </div>
                        <span class="monitor-role" style="font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; background: #50BB6920; color: #50BB69; border: 1px solid #50BB69;">Alumno</span>
                    </div>
                `;
            });
            studentsHtml += '</div>';

            container.innerHTML = studentsHtml;

        } catch (error) {
            console.error("Error cargando alumnos del profesor:", error);
            container.innerHTML = '<p class="empty-state" style="color:#FF5E61;">Error al cargar la lista de alumnos.</p>';
        }
    }

    async function linkStudentToTeacher() {
        const teacherId = document.getElementById('teacher-assign-select').value;
        const studentEmail = document.getElementById('link-student-email').value.trim();
        const linkBtn = document.getElementById('btn-link-student');

        if (!teacherId || !studentEmail) {
            showToast("Selecciona un profesor e ingresa un correo de estudiante.", 'warning');
            return;
        }

        linkBtn.disabled = true;
        linkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const studentSnapshot = await db.collection('users').where('email', '==', studentEmail).get();

            if (studentSnapshot.empty) {
                showToast("No se encontró un usuario estudiante con ese correo.", 'error');
                return;
            }

            const studentDoc = studentSnapshot.docs[0];

            if (studentDoc.data().role !== 'alumno') {
                showToast(`El usuario ${studentDoc.data().name} no es un Alumno.`, 'error');
                return;
            }

            await db.collection('users').doc(studentDoc.id).update({
                teacherId: teacherId
            });

            showToast(`¡${studentDoc.data().name} ha sido asignado correctamente!`, 'success');
            document.getElementById('link-student-email').value = '';

            const selectedMonitorId = document.getElementById('teacher-monitor-select').value;
            if (selectedMonitorId === teacherId) {
                loadTeacherStudents(teacherId);
            }

        } catch (error) {
            console.error("Error al vincular estudiante-profesor:", error);
            showToast("Error al vincular. Verifica los permisos de Firebase.", 'error');
        } finally {
            linkBtn.disabled = false;
            linkBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        }
    }

    function initializeTeacherMonitorLogic() {
        const linkStudentBtn = document.getElementById('btn-link-student');

        if (document.getElementById('teacher-monitor-select') || document.getElementById('teacher-assign-select')) {
            loadTeachersForSelects();
        }

        if (linkStudentBtn) {
            const newLinkBtn = linkStudentBtn.cloneNode(true);
            linkStudentBtn.parentNode.replaceChild(newLinkBtn, linkStudentBtn);
            newLinkBtn.addEventListener('click', linkStudentToTeacher);
        }
    }

    // --- FIN LÓGICA DE MONITOREO Y VINCULACIÓN ---

    auth.onAuthStateChanged(async (user) => {
        const currentPath = window.location.pathname;

        if (user) {
            const userDocRef = db.collection('users').doc(user.uid);
            const userDoc = await userDocRef.get();

            let role = 'alumno';
            let userData;
            let shouldShowTour = false;

            if (userDoc.exists) {
                userData = userDoc.data();
                role = (userData.role || 'alumno').toLowerCase();
                userData.role = role;
                userData.displayRole = USER_ROLES_MAP[role] || USER_ROLES_MAP['default'];

                updateUserProfileUI(userData);
                populateSettingsPage(userData);

                if (userData.tutorialVisto === false || userData.tutorialVisto === undefined) {
                    shouldShowTour = true;
                }

            } else {
                userData = {
                    name: user.displayName || "Usuario Nuevo",
                    email: user.email || "",
                    role: role,
                    displayRole: USER_ROLES_MAP[role],
                    avatarUrl: user.photoURL || `https://api.dicebear.com/8.x/initials/svg?seed=${user.displayName || 'A'}`,
                    tutorialVisto: false
                };
                await userDocRef.set(userData);

                updateUserProfileUI(userData);
                populateSettingsPage(userData);

                shouldShowTour = true;
            }

            document.body.classList.add('role-' + role);

            redirectToRoleIndex(role, currentPath);

            initializeAppLogic(user, userData.role, shouldShowTour);

            initializeSettingsListeners(user);
            initializeUserManagementLogic();
        } else {
            if (currentPath !== '/login') {
                window.location.replace('/login');
            }
        }
    });

    function initializeSettingsListeners(user) {
        const saveProfileBtn = document.getElementById('save-profile-btn');
        const avatarInput = document.getElementById('avatar-upload-input');
        const settingsAvatar = document.getElementById('settings-avatar');
        const nameInput = document.getElementById('settings-name-input');
        const changePasswordBtnUI = document.getElementById('change-password-btn');
        const initialDeleteBtn = document.getElementById('delete-account-btn');

        const changePasswordModalOverlay = document.getElementById('change-password-modal-overlay');
        const cancelPasswordChangeBtn = document.getElementById('cancel-password-change-btn');
        const newPasswordInput = document.getElementById('new-password-input');
        const confirmPasswordInput = document.getElementById('confirm-password-input');
        const confirmPasswordChangeBtn = document.getElementById('confirm-password-change-btn');
        const passwordErrorMessage = document.getElementById('password-error-message');

        const deleteAccountModalOverlay = document.getElementById('delete-account-modal-overlay');
        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

        let selectedAvatarFile = null;

        if (avatarInput && settingsAvatar) {
            avatarInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    if (!file.type.startsWith('image/')) {
                        alert("Por favor, selecciona un archivo de imagen válido.");
                        return;
                    }
                    selectedAvatarFile = file;
                    settingsAvatar.src = URL.createObjectURL(file);
                }
            });
        }

        if (saveProfileBtn) {
            const newSaveBtn = saveProfileBtn.cloneNode(true);
            saveProfileBtn.parentNode.replaceChild(newSaveBtn, saveProfileBtn);

            newSaveBtn.addEventListener('click', async () => {
                const newName = nameInput.value.trim();
                if (!newName) {
                    alert("El nombre no puede estar vacío.");
                    return;
                }

                newSaveBtn.disabled = true;
                newSaveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

                try {
                    let avatarUrl = settingsAvatar.src;

                    if (selectedAvatarFile) {
                        const storageRef = storage.ref(`profile_images/${user.uid}/${Date.now()}_${selectedAvatarFile.name}`);
                        const snapshot = await storageRef.put(selectedAvatarFile);
                        avatarUrl = await snapshot.ref.getDownloadURL();
                    }

                    await db.collection('users').doc(user.uid).update({
                        name: newName,
                        avatarUrl: avatarUrl
                    });

                    await user.updateProfile({
                        displayName: newName,
                        photoURL: avatarUrl
                    });

                    updateUserProfileUI({ name: newName, avatarUrl: avatarUrl });

                    alert("¡Perfil actualizado correctamente!");
                    selectedAvatarFile = null;

                } catch (error) {
                    console.error("Error al actualizar perfil:", error);
                    alert("Hubo un error al guardar los cambios.");
                } finally {
                    newSaveBtn.disabled = false;
                    newSaveBtn.textContent = "Guardar Cambios";
                }
            });
        }

        if (changePasswordBtnUI) {
            changePasswordBtnUI.addEventListener('click', () => {
                if (changePasswordModalOverlay) {
                    changePasswordModalOverlay.classList.remove('hidden');
                    newPasswordInput.value = '';
                    confirmPasswordInput.value = '';
                    passwordErrorMessage.style.display = 'none';
                }
            });
        }

        if (cancelPasswordChangeBtn) {
            cancelPasswordChangeBtn.addEventListener('click', () => {
                if (changePasswordModalOverlay) {
                    changePasswordModalOverlay.classList.add('hidden');
                }
            });
        }

        if (changePasswordModalOverlay) {
            changePasswordModalOverlay.addEventListener('click', (e) => {
                if (e.target === changePasswordModalOverlay) {
                    changePasswordModalOverlay.classList.add('hidden');
                }
            });
        }

        if (confirmPasswordChangeBtn) {
            confirmPasswordChangeBtn.addEventListener('click', async () => {
                const newPassword = newPasswordInput.value;
                const confirmPassword = confirmPasswordInput.value;
                const user = firebase.auth().currentUser;

                passwordErrorMessage.style.display = 'none';

                if (newPassword.length < 6) {
                    passwordErrorMessage.textContent = "La contraseña debe tener al menos 6 caracteres.";
                    passwordErrorMessage.style.display = 'block';
                    return;
                }

                if (newPassword !== confirmPassword) {
                    passwordErrorMessage.textContent = "Las contraseñas no coinciden.";
                    passwordErrorMessage.style.display = 'block';
                    return;
                }

                if (!user) {
                    alert("Sesión expirada. Por favor, vuelve a iniciar sesión.");
                    window.location.replace('/login');
                    return;
                }

                try {
                    await user.updatePassword(newPassword);
                    alert("Contraseña actualizada con éxito.");
                    changePasswordModalOverlay.classList.add('hidden');
                } catch (error) {
                    console.error("Error al actualizar contraseña:", error);
                    if (error.code === 'auth/requires-recent-login') {
                        passwordErrorMessage.textContent = "Seguridad: Debes volver a iniciar sesión para cambiar la contraseña.";
                    } else {
                        passwordErrorMessage.textContent = "Error al cambiar contraseña. Revisa la consola.";
                    }
                    passwordErrorMessage.style.display = 'block';
                }
            });
        }

        if (initialDeleteBtn) {
            initialDeleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (deleteAccountModalOverlay) {
                    deleteAccountModalOverlay.classList.remove('hidden');
                }
            });
        }

        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', () => {
                if (deleteAccountModalOverlay) {
                    deleteAccountModalOverlay.classList.add('hidden');
                }
            });
        }

        if (deleteAccountModalOverlay) {
            deleteAccountModalOverlay.addEventListener('click', (e) => {
                if (e.target === deleteAccountModalOverlay) {
                    deleteAccountModalOverlay.classList.add('hidden');
                }
            });
        }

        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', async () => {
                const user = firebase.auth().currentUser;

                if (!user) {
                    alert("No se encontró usuario autenticado.");
                    window.location.replace('/login');
                    return;
                }

                try {
                    await db.collection('users').doc(user.uid).delete();
                    await user.delete();
                    deleteAccountModalOverlay.classList.add('hidden');
                    window.location.replace('/login');
                } catch (error) {
                    console.error("Error al eliminar la cuenta:", error);
                    deleteAccountModalOverlay.classList.add('hidden');
                    if (error.code === 'auth/requires-recent-login') {
                        alert("Seguridad: Debes volver a iniciar sesión (hace menos de 5 minutos) para eliminar tu cuenta.");
                    } else {
                        alert(`No se pudo eliminar la cuenta. Error: ${error.code}`);
                    }
                }
            });
        }
    }

    function updateUserProfileUI(userData) {
        const userAvatarElement = document.querySelector('.header .avatar-img');
        if (userAvatarElement) userAvatarElement.src = userData.avatarUrl;

        const userNameElement = document.querySelector('.header .user-name');
        if (userNameElement) userNameElement.textContent = userData.name;

        const userRoleElement = document.querySelector('.header .user-role');
        if (userRoleElement) {
            const roleKey = userData.role ? userData.role.toLowerCase() : 'default';
            userRoleElement.textContent = USER_ROLES_MAP[roleKey] || USER_ROLES_MAP['default'];
        }

        const welcomeMessageElement = document.getElementById('welcome-message');
        if (welcomeMessageElement) {
            welcomeMessageElement.textContent = `¡Bienvenido de nuevo, ${userData.name.split(' ')[0]}!`;
        }
    }

    function populateSettingsPage(userData) {
        const settingsAvatar = document.getElementById('settings-avatar');
        const settingsNameInput = document.getElementById('settings-name-input');
        const settingsEmailInput = document.getElementById('settings-email-input');

        if (settingsAvatar) settingsAvatar.src = userData.avatarUrl;
        if (settingsNameInput) settingsNameInput.value = userData.name;
        if (settingsEmailInput) settingsEmailInput.value = userData.email;
    }

    async function initializeAppLogic(user, userRole, shouldShowTour) {
        if (!user) return;
        userRole = userRole ? userRole.toLowerCase() : 'alumno';
        const userId = user.uid;

        const navItems = document.querySelectorAll('.nav-card');
        const contentSections = document.querySelectorAll('.content-section');
        const indicator = document.querySelector('.active-indicator');
        const navContainer = document.querySelector('.nav-container');
        const sidebarRight = document.querySelector('.sidebar-right');
        const toggleBtn = document.getElementById('toggle-sidebar-btn');
        const panel = document.querySelector('.panel');
        const chatListContainer = document.querySelector('.chat-list');
        const chatCounter = document.querySelector('.nav-card.chats .nav-card__pill');
        const addChatBtn = document.getElementById('add-chat-btn');
        const chatMessages = document.getElementById("chat-messages");
        const sendBtn = document.getElementById("send-btn");
        const messageInput = document.getElementById("message-input");
        const sendAudioBtn = document.getElementById("send-audio-btn");
        const trophyDisplay = document.getElementById("trophy-display");
        const nextGoalCard = document.getElementById("next-goal");
        const modalOverlay = document.getElementById('add-chat-modal-overlay');
        const newChatNameInput = document.getElementById('new-chat-name-input');
        const confirmChatBtn = document.getElementById('confirm-chat-btn');
        const cancelChatBtn = document.getElementById('cancel-chat-btn');
        const dateTimeCardDate = document.getElementById('datetime-card-date');
        const dateTimeCardTime = document.getElementById('datetime-card-time');
        const logoutBtn = document.getElementById('logout-btn');
        const historialTitle = document.querySelector('.historial-title');

        let mediaRecorder;
        let audioChunks = [];
        let isRecording = false;
        let currentChatId = null;
        let unsubscribeChatHistory = null;
        let unsubscribeMessages = null;

        if (userRole === 'padre') {
            const chatsNavLink = document.getElementById('chats-link');
            if (chatsNavLink) chatsNavLink.style.display = 'none';
            if (chatListContainer) chatListContainer.style.display = 'none';
            if (historialTitle) historialTitle.style.display = 'none';
        }

        if (userRole === 'profesor') {
            const chatsNavLink = document.getElementById('chats-link');
            if (chatsNavLink) chatsNavLink.style.display = 'none';
            if (chatListContainer) chatListContainer.style.display = 'none';
            if (historialTitle) historialTitle.style.display = 'none';
        }

        const attachFileBtn = document.getElementById("attach-file-btn");
        const fileInput = document.getElementById("hidden-file-input");

        if (attachFileBtn && fileInput) {
            attachFileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                fileInput.click();
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    handleFileUpload(file);
                    fileInput.value = '';
                }
            });
        } else {
            if (!attachFileBtn) console.warn("Falta el botón 'attach-file-btn' en el HTML");
            if (!fileInput) console.warn("Falta el input oculto 'hidden-file-input' en el HTML");
        }

        async function buscarPictogramas(texto) {
            const palabras = texto.toLowerCase().replace(/[.,!?;¿¡]/g, '').split(' ');
            const pictogramasUnicos = new Map();
            for (const palabra of palabras) {
                if (palabra.length > 2) {
                    try {
                        const response = await fetch(`https://api.arasaac.org/v1/pictograms/es/search/${palabra}`);
                        if (response.ok) {
                            const resultados = await response.json();
                            if (resultados.length > 0 && !pictogramasUnicos.has(resultados[0]._id)) {
                                pictogramasUnicos.set(resultados[0]._id, `https://api.arasaac.org/v1/pictograms/${resultados[0]._id}`);
                            }
                        }
                    } catch (error) {
                        console.error("Error buscando pictograma:", error);
                    }
                }
            }
            return Array.from(pictogramasUnicos.values());
        }

        const TOUR_STEPS = [{
            target: '#add-chat-btn',
            title: 'Empieza aquí',
            description: 'Haz clic aquí para iniciar una nueva conversación con K-I-B-O sobre cualquier tema.'
        }, {
            target: '.chat-list',
            title: 'Tu Historial',
            description: 'Aquí se guardarán todas tus conversaciones anteriores para que puedas consultarlas cuando quieras.'
        }, {
            target: '.nav-card.configuracion',
            title: 'Configuración',
            description: 'En configuración puedes cambiar tu avatar, contraseña y ajustar tus preferencias.'
        }, {
            target: '#trophy-display',
            title: 'Gana Logros',
            description: '¡Cuanto más aprendas y chatees, desbloquearás nuevos trofeos aquí!'
        }, {
            target: '#message-input',
            title: 'Escribe tu Mensaje',
            description: 'Usa este cuadro para escribir tus preguntas, tareas o cualquier consulta que tengas para K-I-B-O.',
            placement: 'top'
        }, {
            target: '#attach-file-btn',
            title: 'Adjuntar Archivos',
            description: 'Presiona este icono para subir imágenes, documentos o cualquier otro archivo relevante a tu consulta.',
            placement: 'top'
        }, {
            target: '#send-audio-btn',
            title: 'Enviar Audio',
            description: 'Si prefieres hablar, presiona y mantén para grabar tu voz. K-I-B-O transcribirá y responderá.',
            placement: 'top'
        }, {
            target: '#send-btn',
            title: '¡A Enviar!',
            description: 'Una vez que termines de escribir, pulsa este botón para enviar tu mensaje.',
            placement: 'top'
        }];
        let currentTourStep = 0;
        let currentUserIdForTour = null;

        function iniciarTour(userIdTour) {
            const inicioLink = document.querySelector('.nav-card.inicio');
            if (inicioLink) handleNavClick(inicioLink);

            currentUserIdForTour = userIdTour;
            currentTourStep = 0;

            const overlay = document.getElementById('tour-overlay');
            const card = document.getElementById('tour-card');

            if (!overlay || !card) {
                console.warn("Faltan elementos HTML del tour (overlay o card). Revisa tu index.html");
                return;
            }

            overlay.classList.remove('hidden');
            card.classList.remove('hidden');

            mostrarPaso(currentTourStep);

            const nextBtn = document.getElementById('tour-next-btn');
            const prevBtn = document.getElementById('tour-prev-btn');
            const skipBtn = document.getElementById('tour-skip-btn');

            if (nextBtn) {
                const newNext = nextBtn.cloneNode(true);
                nextBtn.parentNode.replaceChild(newNext, nextBtn);
                newNext.addEventListener('click', () => {
                    if (currentTourStep < TOUR_STEPS.length - 1) {
                        currentTourStep++;
                        mostrarPaso(currentTourStep);
                    } else {
                        finalizarTour();
                    }
                });
            }

            if (prevBtn) {
                const newPrev = prevBtn.cloneNode(true);
                prevBtn.parentNode.replaceChild(newPrev, prevBtn);
                newPrev.addEventListener('click', () => {
                    if (currentTourStep > 0) {
                        currentTourStep--;
                        mostrarPaso(currentTourStep);
                    }
                });
            }

            if (skipBtn) {
                const newSkip = skipBtn.cloneNode(true);
                skipBtn.parentNode.replaceChild(newSkip, skipBtn);
                newSkip.addEventListener('click', finalizarTour);
            }
        }

        function mostrarPaso(index) {
            document.querySelectorAll('.tour-element-highlight').forEach(el => {
                el.classList.remove('tour-element-highlight');
            });

            const step = TOUR_STEPS[index];
            let targetEl = document.querySelector(step.target);
            const card = document.getElementById('tour-card');
            const arrow = card ? card.querySelector('.tour-arrow') : null;

            if (index >= 3) {
                const chatsLink = document.querySelector('.nav-card.chats');
                if (chatsLink && !chatsLink.classList.contains('active-nav')) {
                    chatsLink.click();
                    setTimeout(() => {
                        targetEl = document.querySelector(step.target);
                        if (targetEl) {
                            mostrarPaso(index);
                        } else {
                            if (index < TOUR_STEPS.length - 1) {
                                currentTourStep++;
                                mostrarPaso(currentTourStep);
                            } else {
                                finalizarTour();
                            }
                        }
                    }, 300);
                    return;
                }
            }

            if (!targetEl || !card) {
                if (index < TOUR_STEPS.length - 1) mostrarPaso(index + 1);
                else finalizarTour();
                return;
            }

            document.getElementById('tour-title').textContent = step.title;
            document.getElementById('tour-desc').textContent = step.description;
            document.getElementById('tour-step-count').textContent = `Paso ${index + 1} de ${TOUR_STEPS.length}`;

            const nextBtn = document.getElementById('tour-next-btn');
            const prevBtn = document.getElementById('tour-prev-btn');

            if (nextBtn) nextBtn.textContent = (index === TOUR_STEPS.length - 1) ? '¡Entendido!' : 'Siguiente';
            if (prevBtn) prevBtn.style.display = (index === 0) ? 'none' : 'block';

            targetEl.classList.add('tour-element-highlight');
            targetEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            const rect = targetEl.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            const margin = 15;

            let top, left, arrowClass;
            const isRightSidebar = targetEl.closest('.sidebar-right');
            const forcedPlacement = step.placement;

            if (isRightSidebar) {
                left = rect.left - cardRect.width - margin;
                top = rect.top + (rect.height / 2) - (cardRect.height / 2);
                arrowClass = 'right';
            } else if (forcedPlacement === 'top') {
                left = rect.left + (rect.width / 2) - (cardRect.width / 2);
                top = rect.top - cardRect.height - margin;
                arrowClass = 'bottom';
            } else {
                left = rect.right + margin;
                top = rect.top + (rect.height / 2) - (cardRect.height / 2);
                arrowClass = 'left';

                if (left + cardRect.width > window.innerWidth) {
                    left = rect.left - cardRect.width - margin;
                    arrowClass = 'right';
                }
            }

            if (top < 10) top = 10;
            if (top + cardRect.height > window.innerHeight - 10) top = window.innerHeight - cardRect.height - 10;

            card.style.top = `${top}px`;
            card.style.left = `${left}px`;

            if (arrow) {
                arrow.style.top = '';
                arrow.style.bottom = '';
                arrow.style.left = '';
                arrow.style.right = '';
                arrow.style.transform = '';

                if (arrowClass === 'left') {
                    arrow.style.left = '-7px';
                    arrow.style.top = '50%';
                    arrow.style.transform = 'translateY(-50%) rotate(45deg)';
                } else if (arrowClass === 'right') {
                    arrow.style.right = '-7px';
                    arrow.style.top = '50%';
                    arrow.style.transform = 'translateY(-50%) rotate(225deg)';
                } else if (arrowClass === 'bottom') {
                    arrow.style.bottom = '-7px';
                    arrow.style.left = '50%';
                    arrow.style.transform = 'translateX(-50%) rotate(315deg)';
                }
            }
        }

        async function finalizarTour() {
            const overlay = document.getElementById('tour-overlay');
            const card = document.getElementById('tour-card');

            if (overlay) overlay.classList.add('hidden');
            if (card) card.classList.add('hidden');

            document.querySelectorAll('.tour-element-highlight').forEach(el => {
                el.classList.remove('tour-element-highlight');
            });

            if (currentUserIdForTour) {
                try {
                    await db.collection('users').doc(currentUserIdForTour).update({
                        tutorialVisto: true
                    });
                } catch (error) {
                    console.error("Error guardando estado del tour:", error);
                }
            }
        }

        if (shouldShowTour) {
            setTimeout(() => {
                iniciarTour(userId);
            }, 1500);
        }


        async function loadStudents() {
            const listPage = document.getElementById('students-list-page');
            const listDashboard = document.getElementById('students-list-dashboard');

            if (listPage) listPage.innerHTML = '<p style="color: #a0a8c2; padding: 20px;">Cargando lista de alumnos...</p>';
            if (listDashboard) listDashboard.innerHTML = '<p style="color: #a0a8c2;">Cargando...</p>';

            try {
                const snapshot = await db.collection('users').where('role', '==', 'alumno').get();

                const generateCardHTML = (student, isDashboard = false) => {
                    return `
                        <div class="student-card">
                            <img src="${student.avatarUrl || 'static/images/Icon.png'}" alt="Avatar">
                            <div class="student-info">
                                <h4>${student.name}</h4>
                                <p>${student.email}</p>
                            </div>
                            <button class="view-chats-btn" data-student-id="${student.uid}">
                                <i class="fa-solid fa-comment-dots"></i> ${isDashboard ? '' : 'Ver Chats'}
                            </button>
                        </div>
                    `;
                };

                let htmlContent = '';
                let dashboardContent = '';

                if (snapshot.empty) {
                    const emptyMsg = '<p style="padding: 20px; color: #fff;">No hay alumnos registrados.</p>';
                    if (listPage) listPage.innerHTML = emptyMsg;
                    if (listDashboard) listDashboard.innerHTML = emptyMsg;
                    return;
                }

                snapshot.forEach(doc => {
                    const student = {
                        uid: doc.id,
                        ...doc.data()
                    };
                    htmlContent += generateCardHTML(student);
                    if (snapshot.docs.indexOf(doc) < 3) {
                        dashboardContent += generateCardHTML(student, true);
                    }
                });

                if (listPage) listPage.innerHTML = htmlContent;
                if (listDashboard) listDashboard.innerHTML = dashboardContent;

                document.querySelectorAll('.view-chats-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const studentId = e.currentTarget.dataset.studentId;
                        openStudentChats(studentId);
                    });
                });

            } catch (error) {
                console.error("Error cargando alumnos:", error);
                if (listPage) listPage.innerHTML = '<p style="color: #FF5E61;">Error al cargar alumnos.</p>';
            }
        }

        function openStudentChats(studentId) {
            document.body.classList.add('showing-history');
            const chatListContainer = document.querySelector('.chat-list');
            const historialTitle = document.querySelector('.historial-title');

            if (chatListContainer) chatListContainer.style.display = 'flex';
            if (historialTitle) historialTitle.style.display = 'flex';

            renderChatHistory(studentId);

            const chatsNavLink = document.getElementById('chats-link');
            if (chatsNavLink) {
                chatsNavLink.style.display = 'flex';
                chatsNavLink.style.opacity = '0';
                setTimeout(() => chatsNavLink.style.opacity = '1', 50);
            }

            const titleText = document.querySelector('.historial-title .historial-text');
            if (titleText) titleText.textContent = `Viendo Alumno`;

            const inputArea = document.querySelector('.chat-input-area');
            if (inputArea) inputArea.style.display = 'none';

            if (chatsNavLink) handleNavClick(chatsNavLink);
        }

        async function loadProfessorDashboardData() {
            try {
                const studentsSnap = await db.collection('users').where('role', '==', 'alumno').get();
                const countStudents = studentsSnap.size;
                const kpiStudents = document.getElementById('kpi-total-students');
                if (kpiStudents) kpiStudents.textContent = countStudents;
            } catch (e) {
                console.error("Error cargando KPIs", e);
            }
        }

        async function loadDeveloperDashboardData() {
            const totalQueriesEl = document.getElementById('stats-queries-today');
            const speedEl = document.querySelector('.stat-item:nth-child(1) .stat-value');
            const successRateEl = document.querySelector('.stat-item:nth-child(3) .stat-value');
            const usersContainer = document.getElementById('all-users-container');
            const totalChatsEl = document.getElementById('stats-total-chats');
            const totalLogrosEl = document.getElementById('stats-unlocked-trophies');
            const chartTotalLabel = document.querySelector('.donut-chart-center .total-value');

            if (usersContainer) usersContainer.innerHTML = '<p style="padding: 20px; color: #a0a8c2;">Cargando datos del sistema...</p>';

            try {
                const usersSnap = await db.collection('users').get();
                const chatsSnap = await db.collection('chats').get();

                let totalSystemTrophies = 0;
                chatsSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.unlockedTrophies) totalSystemTrophies += data.unlockedTrophies.length;
                });

                if (totalQueriesEl) totalQueriesEl.textContent = chatsSnap.size;
                if (totalChatsEl) totalChatsEl.textContent = chatsSnap.size;
                if (totalLogrosEl) totalLogrosEl.textContent = totalSystemTrophies;
                if (chartTotalLabel) chartTotalLabel.textContent = chatsSnap.size;

                if (speedEl) speedEl.innerHTML = '0.4<small>s</small>';
                if (successRateEl) successRateEl.innerHTML = '99<small>%</small>';

                if (usersContainer) {
                    usersContainer.innerHTML = '';
                    if (usersSnap.empty) {
                        usersContainer.innerHTML = '<p class="empty-state">No hay usuarios registrados.</p>';
                    } else {
                        const userListDiv = document.createElement('div');
                        userListDiv.className = 'dev-user-list';

                        usersSnap.forEach(doc => {
                            const userData = doc.data();
                            const roleColor = userData.role === 'profesor' ? '#F47432' : (userData.role === 'desarrollador' ? '#FF5E61' : '#50BB69');

                            const userItem = document.createElement('div');
                            userItem.style.cssText = `display: flex; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); gap: 10px;`;

                            userItem.innerHTML = `
                                <img src="${userData.avatarUrl || 'static/images/Icon.png'}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover;">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; font-size: 0.9rem; color: #fff;">${userData.name}</div>
                                    <div style="font-size: 0.75rem; color: #7D96B3;">${userData.email}</div>
                                </div>
                                <span style="font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; background: ${roleColor}20; color: ${roleColor}; border: 1px solid ${roleColor};">
                                    ${(userData.role || 'user').toUpperCase()}
                                </span>
                            `;
                            userListDiv.appendChild(userItem);
                        });
                        usersContainer.appendChild(userListDiv);
                    }
                }

                const donutChart = document.querySelector('.donut-chart-placeholder');
                if (donutChart) {
                    donutChart.style.background = `conic-gradient(#4D6BFE 0% 35%, #50BB69 35% 60%, #F47432 60% 80%, #FF5E61 80% 100%)`;
                }

            } catch (error) {
                console.error("Error cargando dashboard de desarrollador:", error);
            }
        }

        async function loadStatistics() {
            const statsSection = document.getElementById('estadisticas');
            if (!statsSection) return;

            statsSection.innerHTML = '<h2 style="padding: 24px; color: #fff;">Estadísticas de Alumnos</h2><p style="padding: 24px; color:#a0a8c2">Cargando tarjetas individuales...</p>';

            try {
                const studentsSnap = await db.collection('users').where('role', '==', 'alumno').get();

                if (studentsSnap.empty) {
                    statsSection.innerHTML = '<h2 style="padding: 24px; color: #fff;">Estadísticas</h2><p style="padding: 24px;">No hay alumnos registrados.</p>';
                    return;
                }

                const chartsData = [];

                let cardsHTML = '<div class="stats-grid">';

                for (const doc of studentsSnap.docs) {
                    const student = doc.data();
                    const studentId = doc.id;

                    const chatsSnap = await db.collection('chats').where('userId', '==', studentId).get();

                    let unlockedCount = 0;
                    chatsSnap.forEach(c => {
                        const data = c.data();
                        if (data.unlockedTrophies) unlockedCount += data.unlockedTrophies.length;
                    });

                    const totalTrophiesPossible = 9;
                    const lockedCount = Math.max(0, totalTrophiesPossible - unlockedCount);

                    chartsData.push({
                        canvasId: `chart-${studentId}`,
                        unlocked: unlockedCount,
                        locked: lockedCount
                    });

                    cardsHTML += `
                        <div class="student-stat-card">
                            <div class="stat-card-header">
                                <img src="${student.avatarUrl || 'static/images/Icon.png'}" alt="Avatar">
                                <div>
                                    <h4>${student.name}</h4>
                                    <span>${student.email}</span>
                                </div>
                            </div>
                            
                            <div class="chart-mini-wrapper">
                                <canvas id="chart-${studentId}"></canvas>
                            </div>

                            <div class="stat-card-metrics">
                                <div class="metric-box">
                                    <span class="value" style="color: #3a8ee6;">${chatsSnap.size}</span>
                                    <span class="label">Chats</span>
                                </div>
                                <div class="metric-box">
                                    <span class="value" style="color: #50BB69;">${unlockedCount}</span>
                                    <span class="label">Logros</span>
                                </div>
                                <div class="metric-box">
                                    <span class="value" style="color: #FF5E61;">${lockedCount}</span>
                                    <span class="label">Faltan</span>
                                </div>
                            </div>
                        </div>
                    `;
                }

                cardsHTML += '</div>';
                statsSection.innerHTML = '<h2 style="padding: 24px 24px 0 24px; color: #fff;">Progreso por Alumno</h2>' + cardsHTML;

                chartsData.forEach(data => {
                    const ctx = document.getElementById(data.canvasId).getContext('2d');

                    new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: ['Conseguidos', 'Pendientes'],
                            datasets: [{
                                data: [data.unlocked, data.locked],
                                backgroundColor: [
                                    '#50BB69',
                                    '#1a2a4a'
                                ],
                                borderColor: '#102540',
                                borderWidth: 4,
                                hoverOffset: 4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '70%',
                            plugins: {
                                legend: {
                                    display: false
                                },
                                tooltip: {
                                    backgroundColor: '#102540',
                                    bodyColor: '#fff',
                                    borderColor: '#2b3a5b',
                                    borderWidth: 1,
                                    callbacks: {
                                        label: function (context) {
                                            return ` ${context.label}: ${context.raw}`;
                                        }
                                    }
                                }
                            }
                        },
                        plugins: [{
                            id: 'textCenter',
                            beforeDraw: function (chart) {
                                var width = chart.width,
                                    height = chart.height,
                                    ctx = chart.ctx;

                                ctx.restore();
                                var fontSize = (height / 100).toFixed(2);
                                ctx.font = "bold " + fontSize + "em sans-serif";
                                ctx.textBaseline = "middle";
                                ctx.fillStyle = "#fff";

                                var total = data.unlocked + data.locked;
                                var percentage = total > 0 ? Math.round((data.unlocked / total) * 100) + "%" : "0%";

                                var text = percentage,
                                    textX = Math.round((width - ctx.measureText(text).width) / 2),
                                    textY = height / 2;

                                ctx.fillText(text, textX, textY);
                                ctx.save();
                            }
                        }]
                    });
                });

            } catch (error) {
                console.error("Error cargando stats:", error);
                statsSection.innerHTML += '<p style="color: #FF5E61; padding: 24px;">Error al cargar estadísticas.</p>';
            }
        }


        async function loadChildrenSummaryForDashboard(parentId) {
            const container = document.getElementById('children-list-container');
            if (!container) return;

            try {
                const snapshot = await db.collection('users').where('parentId', '==', parentId).get();
                container.innerHTML = '';

                if (snapshot.empty) {
                    container.innerHTML = '<p class="empty-state" style="padding:10px;">No tienes hijos registrados aún.</p>';
                    return;
                }

                snapshot.forEach((doc) => {
                    const child = doc.data();
                    const childId = doc.id;

                    const card = document.createElement('div');
                    card.className = 'child-summary-card';
                    card.innerHTML = `
                        <img src="${child.avatarUrl || 'static/images/Icon.png'}" class="child-mini-avatar">
                        <div class="child-info">
                            <h4>${child.name}</h4>
                            <span>${child.email}</span>
                        </div>
                        <i class="fa-solid fa-chevron-right child-arrow"></i>
                    `;

                    card.addEventListener('click', () => {
                        openStudentChats(childId);
                    });

                    container.appendChild(card);
                });

            } catch (error) {
                console.error("Error cargando dashboard hijos:", error);
                container.innerHTML = '<p style="color: #FF5E61;">Error al cargar.</p>';
            }
        }

        async function loadMyChildren(parentId) {
            const dbSection = document.getElementById('database');
            if (!dbSection) return;

            if (!document.getElementById('children-grid-container')) {
                dbSection.innerHTML = `
                    <div class="dashboard-centered-wrapper">
                        <h2 class="section-title-large">Mis Hijos</h2>
                        <p class="section-subtitle">Monitorea el progreso académico y las actividades de tus hijos.</p>
                        
                        <div id="children-grid-container">
                            <p style="color: #7D96B3;">Cargando perfiles...</p>
                        </div>

                        <div class="link-section-container">
                            <h3><i class="fa-solid fa-link" style="color: #50BB69; margin-right: 10px;"></i>Vincular nuevo dispositivo</h3>
                            <p style="color: #7D96B3; font-size: 0.9rem;">Ingresa el correo electrónico del estudiante para conectarlo a tu cuenta.</p>
                            
                            <div class="big-input-wrapper">
                                <input type="email" id="link-child-email" placeholder="ejemplo@correo.com">
                                <button id="btn-link-child" class="btn-link-big"><i class="fa-solid fa-plus"></i></button>
                            </div>
                        </div>
                    </div>
                `;

                document.getElementById('btn-link-child').addEventListener('click', () => {
                    const email = document.getElementById('link-child-email').value;
                    if (email) linkChildToParent(parentId, email);
                });
            }

            const container = document.getElementById('children-grid-container');

            try {
                const snapshot = await db.collection('users').where('parentId', '==', parentId).get();

                if (snapshot.empty) {
                    container.innerHTML = `
                        <div style="grid-column: 1/-1; padding: 40px; border: 2px dashed #172E4D; border-radius: 20px; color: #7D96B3;">
                            <i class="fa-solid fa-child-reaching" style="font-size: 40px; margin-bottom: 15px; display: block;"></i>
                            No tienes hijos vinculados aún.
                        </div>`;
                    return;
                }

                container.innerHTML = '';

                for (const doc of snapshot.docs) {
                    const child = doc.data();
                    const childId = doc.id;

                    let realChatCount = 0;
                    let realTrophyCount = 0;

                    try {
                        const chatsSnapshot = await db.collection('chats').where('userId', '==', childId).get();
                        realChatCount = chatsSnapshot.size;
                        const uniqueTrophies = new Set();
                        chatsSnapshot.forEach(chatDoc => {
                            const cData = chatDoc.data();
                            if (Array.isArray(cData.unlockedTrophies)) {
                                cData.unlockedTrophies.forEach(t => uniqueTrophies.add(t));
                            }
                        });
                        realTrophyCount = uniqueTrophies.size;
                    } catch (err) {
                        console.error(err);
                    }

                    const childCard = document.createElement('div');
                    childCard.className = 'child-profile-card';

                    childCard.innerHTML = `
                        <button class="unlink-child-btn" title="Desvincular hijo" style="position:absolute; top:15px; right:15px; background:transparent; border:none; color:#FF5E61; cursor:pointer; font-size:16px; z-index:10;">
                            <i class="fa-solid fa-user-xmark"></i>
                        </button>
                        <div class="child-card-header">
                            <img src="${child.avatarUrl || 'static/images/Icon.png'}" class="child-avatar-large">
                            <h3 class="child-name">${child.name}</h3>
                            <span class="child-email">${child.email}</span>
                        </div>
                        <div class="child-stats-row">
                            <div class="stat-box">
                                <span class="stat-number" style="color: #0077FF;">${realChatCount}</span>
                                <span class="label">Chats</span>
                            </div>
                            <div class="stat-box" style="border-left: 1px solid rgba(255,255,255,0.1); padding-left: 20px;">
                                <span class="stat-number" style="color: #F47432;">${realTrophyCount}</span>
                                <span class="label">Logros</span>
                            </div>
                        </div>
                        <button class="action-btn-full view-child-chats" data-child-id="${doc.id}">
                            Ver Actividad <i class="fa-solid fa-arrow-right"></i>
                        </button>
                    `;

                    childCard.querySelector('.unlink-child-btn').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm(`¿Estás seguro de que quieres desvincular a ${child.name}?`)) {
                            await db.collection('users').doc(doc.id).update({
                                parentId: null
                            });
                            loadMyChildren(parentId);
                        }
                    });

                    childCard.querySelector('.view-child-chats').addEventListener('click', (e) => {
                        openStudentChats(e.currentTarget.dataset.childId);
                    });

                    container.appendChild(childCard);
                }
            } catch (error) {
                console.error("Error cargando hijos:", error);
                container.innerHTML = '<p style="color: #FF5E61;">Error al cargar la lista de hijos.</p>';
            }
        }

        async function linkChildToParent(parentId, childEmail) {
            try {
                const snapshot = await db.collection('users').where('email', '==', childEmail).get();
                if (snapshot.empty) {
                    alert("No se encontró ningún usuario con ese correo.");
                    return;
                }
                const childDoc = snapshot.docs[0];
                await db.collection('users').doc(childDoc.id).update({
                    parentId: parentId
                });
                alert(`¡${childDoc.data().name} ha sido vinculado correctamente!`);
                loadMyChildren(parentId);
                loadChildrenSummaryForDashboard(parentId);
                document.getElementById('link-child-email').value = '';
            } catch (error) {
                alert("Error al vincular. Verifica los permisos.");
            }
        }

        function handleNavClick(item) {
            if (!item || item.id === 'logout-btn') return;

            if (!panel.classList.contains('expanded')) {
                panel.classList.add('expanded');
                if (toggleBtn) toggleBtn.querySelector('i').className = 'fa-solid fa-arrow-left';
            }
            navItems.forEach(nav => nav.classList.remove('active-nav'));
            item.classList.add('active-nav');

            if (indicator && navContainer) {
                indicator.style.top = `${navContainer.offsetTop + item.offsetTop}px`;
                indicator.style.height = `${item.offsetHeight}px`;
            }

            const targetId = item.dataset.target;

            if (userRole === 'padre' || userRole === 'profesor') {
                if (targetId !== 'chats') {
                    document.body.classList.remove('showing-history');
                    const chatsNavLink = document.getElementById('chats-link');
                    if (chatsNavLink) chatsNavLink.style.display = 'none';
                    if (chatListContainer) chatListContainer.style.display = 'none';
                    if (historialTitle) historialTitle.style.display = 'none';
                }
                if (userRole === 'padre' && targetId === 'inicio') {
                    loadChildrenSummaryForDashboard(userId);
                }
            }

            if (userRole === 'profesor' && targetId !== 'chats') {
                const chatsNavLink = document.getElementById('chats-link');
                if (chatsNavLink) chatsNavLink.style.display = 'none';
                if (chatListContainer) chatListContainer.style.display = 'none';
                if (historialTitle) historialTitle.style.display = 'none';
            }

            contentSections.forEach(section => section.classList.remove('active'));
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            if (sidebarRight) sidebarRight.style.display = targetId === 'chats' ? 'flex' : 'none';

            if (userRole === 'profesor') {
                if (targetId === 'chats') {
                    const chatInputArea = document.querySelector('.chat-input-area');
                    if (chatInputArea) chatInputArea.style.display = 'none';

                    const titleText = document.querySelector('.historial-title .historial-text');
                    if (titleText && (titleText.textContent === 'Historial de Chats' || titleText.textContent === 'Mis Chats')) {
                        if (chatListContainer) chatListContainer.innerHTML = '<p style="padding:20px; text-align:center; color:#a0a8c2">Selecciona un alumno desde la sección "Alumnos" para ver sus chats.</p>';
                        document.querySelector('.historial-title .historial-text').textContent = 'Vista de Profesor';
                    }
                }
                if (targetId === 'estadisticas') {
                    loadStatistics();
                }
                if (targetId === 'Alumnos') {
                    loadStudents();
                }
            }

            if (targetId === 'chats') {
                const chatInputArea = document.querySelector('.chat-input-area');
                if (userRole === 'padre') {
                    if (chatInputArea) chatInputArea.style.display = 'none';
                } else if (userRole !== 'profesor') {
                    if (chatInputArea) {
                        chatInputArea.style.display = '';
                    }
                    renderChatHistory(userId);
                }
            }

            if (targetId === 'database') {
                const dbSection = document.getElementById('database');
                if (userRole === 'padre') {
                    loadMyChildren(userId);
                } else if (userRole !== 'profesor') {
                    const googleSheetIframe = `<iframe src="https://docs.google.com/spreadsheets/d/1hwiHpKXNqfelqAbD1VjXloBOBdWYV6Kk/edit?usp=sharing&ouid=114527888935603933122&rtpof=true&sd=true" style="width:100%; height:100%; border:none; border-radius:15px;"></iframe>`;
                    if (dbSection && !dbSection.querySelector('iframe')) {
                        dbSection.innerHTML = googleSheetIframe;
                    }
                }
            }
        }

        navItems.forEach(item => item.addEventListener('click', () => handleNavClick(item)));

        const defaultActiveItem = document.querySelector('.nav-card.inicio');
        if (defaultActiveItem) {
            setTimeout(() => {
                indicator.style.transition = 'none';
                handleNavClick(defaultActiveItem);
                setTimeout(() => indicator.style.transition = 'top 0.4s cubic-bezier(0.23, 1, 0.32, 1), height 0.4s cubic-bezier(0.23, 1, 0.32, 1)', 50);
            }, 10);
        }


        function initializeCustomAudioPlayer(playerElement) {
            const audioSrc = playerElement.dataset.audioSrc;
            const playBtn = playerElement.querySelector('.play-pause-btn');
            const icon = playBtn.querySelector('i');
            const timeDisplay = playerElement.querySelector('.audio-time');
            const canvas = playerElement.querySelector('.audio-waveform');
            const ctx = canvas ? canvas.getContext('2d') : null;

            const audio = new Audio(audioSrc);

            if (canvas) {
                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
                drawVisualizer(ctx, canvas.width, canvas.height, 0);
            }

            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (audio.paused) {
                    audio.play();
                    icon.classList.remove('fa-play');
                    icon.classList.add('fa-pause');
                } else {
                    audio.pause();
                    icon.classList.remove('fa-pause');
                    icon.classList.add('fa-play');
                }
            });

            audio.addEventListener('timeupdate', () => {
                const current = formatTime(audio.currentTime);
                const total = audio.duration ? formatTime(audio.duration) : "0:00";
                timeDisplay.textContent = audio.duration ? `${current} / ${total}` : current;

                if (canvas && audio.duration) {
                    const percent = audio.currentTime / audio.duration;
                    drawVisualizer(ctx, canvas.width, canvas.height, percent);
                }
            });

            audio.addEventListener('ended', () => {
                icon.classList.remove('fa-pause');
                icon.classList.add('fa-play');
                if (canvas) drawVisualizer(ctx, canvas.width, canvas.height, 0);
            });
        }

        function formatTime(seconds) {
            const min = Math.floor(seconds / 60);
            const sec = Math.floor(seconds % 60);
            return `${min}:${sec < 10 ? '0' : ''}${sec}`;
        }

        function drawVisualizer(ctx, width, height, progressPercent) {
            if (!ctx) return;
            ctx.clearRect(0, 0, width, height);

            const barWidth = 3;
            const gap = 2;
            const bars = Math.floor(width / (barWidth + gap));

            for (let i = 0; i < bars; i++) {
                const barHeight = Math.random() * height * 0.8 + (height * 0.2);
                const x = i * (barWidth + gap);
                const y = (height - barHeight) / 2;

                if (i / bars < progressPercent) {
                    ctx.fillStyle = '#50BB69';
                } else {
                    ctx.fillStyle = '#ccc';
                }

                ctx.beginPath();
                ctx.roundRect(x, y, barWidth, barHeight, 5);
                ctx.fill();
            }
        }


        function renderChatHistory(ownerId) {
            if (unsubscribeChatHistory) unsubscribeChatHistory();
            unsubscribeChatHistory = db.collection('chats')
                .where('userId', '==', ownerId)
                .orderBy('createdAt', 'desc')
                .onSnapshot(snapshot => {
                    if (!chatListContainer) return;
                    chatListContainer.innerHTML = '';

                    if (ownerId === userId && chatCounter) {
                        chatCounter.textContent = snapshot.size;
                        if (userRole === 'alumno') {
                            const chats = snapshot.docs.map(doc => ({
                                id: doc.id,
                                ...doc.data()
                            }));
                            updateDashboard(chats);
                        }
                    } else if (chatCounter && userRole === 'alumno') {
                        chatCounter.textContent = snapshot.size;
                    }

                    if (snapshot.empty) {
                        chatListContainer.innerHTML = "<p style='color: #a0a8c2; padding: 20px; text-align: center;'>No hay chats para mostrar.</p>";
                    }

                    snapshot.docs.forEach(doc => {
                        const chat = {
                            id: doc.id,
                            ...doc.data()
                        };
                        const chatItem = document.createElement('div');
                        chatItem.className = 'chat-item';
                        chatItem.setAttribute('data-chat-id', chat.id);
                        const avatar = chat.avatar || "static/images/Icon.png";
                        chatItem.innerHTML = `<div class="chat-avatar-container"><div class="chat-avatar-bg"></div><img class="chat-avatar" src="${avatar}" alt="Avatar" /><div class="chat-status-green"></div></div><div class="chat-name">${chat.name}</div><div class="chat-item__icon green"><i class="fa-solid fa-comment-dots"></i></div>`;
                        chatListContainer.appendChild(chatItem);

                        chatItem.addEventListener('click', () => {
                            if (currentChatId === chat.id) return;
                            currentChatId = chat.id;
                            if (chatMessages) chatMessages.innerHTML = '';
                            loadChatMessages(currentChatId);
                            updateTrophyPanel(chat);

                            document.querySelectorAll('.chat-item').forEach(item => {
                                item.classList.remove('active-chat');
                                item.style.backgroundColor = '';
                            });
                            chatItem.classList.add('active-chat');
                        });
                    });

                    if (!currentChatId && snapshot.docs.length > 0) {
                        if (userRole !== 'profesor' && userRole !== 'padre') {
                            const firstChatItem = chatListContainer.querySelector('.chat-item');
                            if (firstChatItem) firstChatItem.click();
                        }
                    } else if (currentChatId) {
                        const activeChatItem = chatListContainer.querySelector(`.chat-item[data-chat-id="${currentChatId}"]`);
                        if (activeChatItem) activeChatItem.classList.add('active-chat');
                    }

                }, error => {
                    if (error.code === 'failed-precondition') {
                        chatListContainer.innerHTML = "<p style='color: #FF5E61; padding: 20px;'>Error de base de datos.</p>";
                    }
                });
        }

        function loadChatMessages(chatId) {
            if (!chatMessages) return;
            if (unsubscribeMessages) unsubscribeMessages();
            chatMessages.innerHTML = 'Cargando mensajes...';
            let isInitialLoad = true;
            unsubscribeMessages = db.collection('chats').doc(chatId).collection('messages').orderBy('timestamp', 'asc')
                .onSnapshot(snapshot => {
                    if (isInitialLoad) {
                        chatMessages.innerHTML = '';
                    }
                    snapshot.docChanges().forEach(change => {
                        if (change.type === 'added' || change.type === 'modified') {
                            const msgData = {
                                id: change.doc.id,
                                ...change.doc.data()
                            };
                            const existingMessageElement = chatMessages.querySelector(`[data-message-id="${msgData.id}"]`);
                            if (existingMessageElement) {
                                renderMessage(msgData, false, existingMessageElement);
                            } else if (change.type === 'added') {
                                const shouldAnimate = !isInitialLoad && msgData.type === 'bot';
                                renderMessage(msgData, shouldAnimate, null);
                            }
                        }
                    });
                    isInitialLoad = false;
                    const lastChange = snapshot.docChanges().length > 0 ? snapshot.docChanges()[snapshot.docChanges().length - 1] : null;
                    if (lastChange && lastChange.type === 'added') {
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                }, error => {
                    chatMessages.innerHTML = 'Error al cargar los mensajes.';
                });
        }

        async function sendMessage() {
            if (userRole === 'padre' || userRole === 'profesor') return;
            const texto = messageInput.value.trim();
            if (texto === "" || !currentChatId) return;

            const pictogramas = await buscarPictogramas(texto);

            const messageData = {
                type: 'user',
                text: texto,
                pictogramas,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                contentType: 'text'
            };
            const chatRef = db.collection('chats').doc(currentChatId);
            chatRef.collection('messages').add(messageData)
                .then(() => {
                    messageInput.value = "";
                    return chatRef.update({
                        userMessageCount: firebase.firestore.FieldValue.increment(1)
                    });
                })
                .then(() => {
                    checkAndUnlockTrophies(currentChatId);
                    llamarApiDelBot(texto, currentChatId);
                })
                .catch(error => console.error(error));
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', sendMessage);
        }

        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
        if (sendAudioBtn) {
            sendAudioBtn.addEventListener('click', handleAudioRecording);
        }



        async function llamarApiDelBot(userText, chatId) {
            try {
                await fetch('/api/get_bot_response', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: userText,
                        chatId: chatId
                    })
                });
            } catch (error) {
                console.error(error);
            }
        }

        async function llamarApiDeTranscripcion(audioUrl, chatId, messageId) {
            try {
                await fetch('/api/process_audio', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        audioUrl: audioUrl,
                        chatId: chatId,
                        messageId: messageId
                    })
                });
            } catch (error) {
                console.error(error);
            }
        }



        async function handleFileUpload(file) {
            if (userRole === 'padre') return;

            if (!file || !currentChatId) {
                alert("Por favor, selecciona un chat primero.");
                return;
            }

            if (file.size === 0) {
                try {
                    await db.collection('chats').doc(currentChatId).collection('messages').add({
                        type: 'bot',
                        text: '⚠️ No se puede enviar este archivo porque está vacío (0 MB) o dañado. Por favor intenta con otro.',
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        contentType: 'text'
                    });
                } catch (e) {
                    console.error(e);
                }
                return;
            }

            try {
                const storageRef = storage.ref(`chats/${currentChatId}/${Date.now()}_${file.name}`);
                const snapshot = await storageRef.put(file);
                const downloadURL = await snapshot.ref.getDownloadURL();

                let contentType = 'file';
                if (file.type.startsWith('image/')) {
                    contentType = 'image';
                } else if (file.type.startsWith('audio/')) {
                    contentType = 'audio';
                }

                const userMessageData = {
                    type: 'user',
                    text: '',
                    pictogramas: [],
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    contentType: contentType,
                    fileUrl: downloadURL,
                    fileName: file.name
                };

                await db.collection('chats').doc(currentChatId).collection('messages').add(userMessageData);

                if (contentType === 'image') {
                    const botResponseData = {
                        type: 'bot',
                        text: '¡Imagen recibida! 🖼️ ¿Qué te gustaría hacer con ella?',
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        contentType: 'text'
                    };

                    await db.collection('chats').doc(currentChatId).collection('messages').add(botResponseData);
                }

            } catch (error) {
                console.error("Error subiendo archivo:", error);
                alert("Hubo un error al subir el archivo.");
            }
        }

        function renderRatingStarsHTML(rating) {
            let html = '';
            for (let i = 1; i <= 5; i++) {
                const className = i <= rating ? 'rated' : '';
                html += `<i class="rating-star ${className} fa-solid fa-star" data-value="${i}"></i>`;
            }
            return html;
        }

        function initializeRating(ratingStarsElement, messageId) {
            if (userRole === 'padre') return;
            const stars = ratingStarsElement.querySelectorAll('.rating-star');
            const chatId = currentChatId;
            let currentRating = parseInt(ratingStarsElement.dataset.currentRating);
            const updateStars = (rating) => {
                stars.forEach(star => {
                    const starValue = parseInt(star.dataset.value);
                    star.classList.remove('rated', 'temp-hover');
                    if (starValue <= rating) {
                        star.classList.add('rated');
                    }
                });
            };
            updateStars(currentRating);
            ratingStarsElement.addEventListener('mouseover', (e) => {
                if (e.target.classList.contains('rating-star')) {
                    const hoverValue = parseInt(e.target.dataset.value);
                    stars.forEach(star => {
                        const starValue = parseInt(star.dataset.value);
                        star.classList.remove('temp-hover');
                        if (starValue <= hoverValue) {
                            star.classList.add('temp-hover');
                        }
                    });
                    updateStars(hoverValue);
                }
            });
            ratingStarsElement.addEventListener('mouseout', () => {
                stars.forEach(star => star.classList.remove('temp-hover'));
                updateStars(currentRating);
            });
            ratingStarsElement.addEventListener('click', async (e) => {
                if (e.target.classList.contains('rating-star')) {
                    const newRating = parseInt(e.target.dataset.value);
                    currentRating = newRating;
                    ratingStarsElement.dataset.currentRating = newRating;
                    updateStars(newRating);
                    try {
                        const messageRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
                        await messageRef.update({
                            rating: newRating
                        });
                        const label = ratingStarsElement.previousElementSibling;
                        if (label) {
                            label.textContent = `¡Gracias por tu valoración (${newRating}/5)!`;
                            setTimeout(() => {
                                label.textContent = '¿Te ha servido?';
                            }, 3000);
                        }
                    } catch (error) {
                        alert("Hubo un error al guardar tu valoración.");
                    }
                }
            });
        }

        function getLanguageIcon(language) {
            const lang = (language || 'code').toLowerCase();
            if (lang === 'python' || lang === 'py') return 'fa-brands fa-python';
            if (lang === 'javascript' || lang === 'js') return 'fa-brands fa-js-square';
            if (lang === 'html') return 'fa-brands fa-html5';
            if (lang === 'css') return 'fa-brands fa-css3-alt';
            if (lang === 'código' || lang === 'code') return 'fa-solid fa-code';
            return 'fa-solid fa-file-lines';
        }

        function renderMessage(msg, animate = false, existingElement = null) {
            if (!chatMessages) return;
            const isUpdate = existingElement !== null;
            const chatMessageElement = existingElement || document.createElement("div");
            if (!isUpdate) {
                chatMessageElement.classList.add("chat-bubble", msg.type === 'user' ? "user-message" : "bot-message");
                if (msg.id) chatMessageElement.setAttribute('data-message-id', msg.id);
            }
            const messageDate = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
            const formattedTime = messageDate.toLocaleTimeString("es-ES", {
                hour: '2-digit',
                minute: '2-digit'
            });
            const userAvatarUrl = document.querySelector('.header .avatar-img').src;
            const userAvatar = `<img src="${userAvatarUrl}" alt="User" class="message-avatar">`;
            const botAvatar = `<img src="static/images/Icon.png" alt="Bot" class="message-avatar">`;
            const metaHTML = `<div class="message-meta"><span>${formattedTime}</span></div>`;
            let bubbleContentHTML = '';
            const escapeHTML = (str) => str ? str.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';

            if (msg.contentType === 'code' && msg.codeContent) {
                const language = (msg.codeLanguage || 'código').toLowerCase();
                const iconClass = getLanguageIcon(language);
                bubbleContentHTML = `
                    <div class="code-block">
                        <div class="code-header">
                            <div class="lang-tabs">
                                <button class="tab active">
                                    <i class="${iconClass}"></i> 
                                    <span>${language}</span>
                                </button>
                            </div>
                            <button class="copy-code-btn"><i class="fa-solid fa-copy"></i> Copy code</button>
                        </div>
                        <div class="code-body">
                            <pre><code class="language-${language}">${escapeHTML(msg.codeContent)}</code></pre>
                        </div>
                    </div>
                `;
                chatMessageElement.classList.add('code-bubble-container');
            } else {
                let contentHTML = '',
                    pictogramasHTML = '',
                    feedbackHTML = '';
                if (msg.pictogramas && msg.pictogramas.length > 0) {
                    pictogramasHTML = `<div class="pictogram-container">${msg.pictogramas.map(url => `<img src="${url}" class="pictogram-image">`).join('')}</div>`;
                }
                if (msg.contentType === 'audio' && msg.fileUrl) {
                    contentHTML = `
                        <div class="custom-audio-player" data-audio-src="${msg.fileUrl}">
                            <button class="play-pause-btn"><i class="fa-solid fa-play"></i></button>
                            <div class="waveform-container">
                                <canvas class="audio-waveform"></canvas>
                            </div>
                            <span class="audio-time">0:00</span>
                        </div>
                    `;
                    if (msg.text && msg.text !== '[Procesando audio...]') {
                        contentHTML += `<p class="transcribed-text"><em>${escapeHTML(msg.text)}</em></p>`;
                    }
                } else if (msg.contentType === 'image' && msg.fileUrl) {
                    contentHTML = `<img src="${msg.fileUrl}" alt="${msg.fileName || 'Imagen'}" class="attached-image">`;
                } else if (msg.contentType === 'file' && msg.fileUrl) {
                    contentHTML = `<a href="${msg.fileUrl}" target="_blank" class="file-attachment"><i class="fa-solid fa-file-arrow-down"></i> ${escapeHTML(msg.fileName || 'Descargar archivo')}</a>`;
                } else {
                    contentHTML = (msg.type === 'user') ? `<p>${escapeHTML(msg.text || '')}</p>` : `<p class="bot-text-container"></p>`;
                }
                if (msg.type === 'bot' && msg.rating !== undefined) {
                    const rating = msg.rating || 0;
                    feedbackHTML = `<div class="bot-feedback-container"><span class="rating-label">¿Te ha servido?</span><div class="rating-stars" data-message-id="${msg.id}" data-current-rating="${rating}">${renderRatingStarsHTML(rating)}</div></div>`;
                }
                bubbleContentHTML = `<div class="message-content">${pictogramasHTML}${contentHTML}${feedbackHTML}</div>`;
            }
            chatMessageElement.innerHTML = `
                ${msg.type === 'bot' ? botAvatar : ''}
                <div class="message-and-meta">
                    ${bubbleContentHTML}
                    ${metaHTML}
                </div>
                ${msg.type === 'user' ? userAvatar : ''}
            `;
            if (!isUpdate) {
                chatMessages.appendChild(chatMessageElement);
            }
            if (msg.type === 'bot' && msg.text && msg.contentType === 'text') {
                const textContainer = chatMessageElement.querySelector('.bot-text-container');
                if (textContainer) {
                    if (animate) {
                        if (typeof typewriterEffect !== 'undefined') typewriterEffect(textContainer, msg.text);
                        else textContainer.textContent = msg.text;
                    } else {
                        textContainer.textContent = msg.text;
                    }
                }
                const ratingStarsElement = chatMessageElement.querySelector('.rating-stars');
                if (ratingStarsElement && msg.id) {
                    initializeRating(ratingStarsElement, msg.id);
                }
            }
            const customPlayer = chatMessageElement.querySelector('.custom-audio-player');
            if (customPlayer && !customPlayer.classList.contains('initialized')) {
                setTimeout(() => {
                    const waveformCanvas = customPlayer.querySelector('.audio-waveform');
                    if (waveformCanvas) {
                        if (typeof initializeCustomAudioPlayer !== 'undefined') initializeCustomAudioPlayer(customPlayer);
                    }
                }, 0);
                customPlayer.classList.add('initialized');
            }
            if (msg.contentType === 'code' && msg.codeContent && window.Prism) {
                const codeElement = chatMessageElement.querySelector('code');
                if (codeElement) {
                    setTimeout(() => {
                        Prism.highlightElement(codeElement);
                    }, 0);
                }
                const copyButton = chatMessageElement.querySelector('.copy-code-btn');
                if (copyButton) {
                    copyButton.addEventListener('click', () => {
                        navigator.clipboard.writeText(msg.codeContent).then(() => {
                            copyButton.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                            setTimeout(() => {
                                copyButton.innerHTML = '<i class="fa-solid fa-copy"></i> Copy code';
                            }, 2000);
                        }).catch(err => {
                            copyButton.innerHTML = 'Error!';
                            setTimeout(() => {
                                copyButton.innerHTML = '<i class="fa-solid fa-copy"></i> Copy code';
                            }, 2000);
                        });
                    });
                }
            }
            if (!isUpdate) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }

        async function handleAudioRecording() {
            if (userRole === 'padre') return;
            if (!isRecording) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true
                    });
                    mediaRecorder = new MediaRecorder(stream, {
                        mimeType: 'audio/webm'
                    });
                    audioChunks = [];
                    mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
                    mediaRecorder.onstop = async () => {
                        const audioBlob = new Blob(audioChunks, {
                            type: 'audio/webm'
                        });
                        const fileName = `grabacion_${Date.now()}.webm`;
                        audioChunks = [];
                        stream.getTracks().forEach(track => track.stop());
                        if (!currentChatId) {
                            alert("Por favor, selecciona un chat primero.");
                            return;
                        }
                        try {
                            const storageRef = storage.ref(`chats/${currentChatId}/${fileName}`);
                            const snapshot = await storageRef.put(audioBlob);
                            const downloadURL = await snapshot.ref.getDownloadURL();
                            const messageData = {
                                type: 'user',
                                text: '[Procesando audio...]',
                                pictogramas: [],
                                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                                contentType: 'audio',
                                fileUrl: downloadURL,
                                fileName: 'Grabación de voz'
                            };
                            const messageRef = await db.collection('chats').doc(currentChatId).collection('messages').add(messageData);
                            await llamarApiDeTranscripcion(downloadURL, currentChatId, messageRef.id);
                        } catch (error) {
                            alert("No se pudo subir el audio.");
                        }
                    };
                    mediaRecorder.start();
                    isRecording = true;
                    sendAudioBtn.style.color = '#FF5E61';
                } catch (error) {
                    alert("No se pudo acceder al micrófono.");
                }
            } else {
                mediaRecorder.stop();
                isRecording = false;
                sendAudioBtn.style.color = '';
            }
        }

        if (addChatBtn) {
            addChatBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                modalOverlay.classList.remove('hidden');
                newChatNameInput.focus();
            });
        }
        if (cancelChatBtn) {
            cancelChatBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));
        }
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
            });
        }

        if (confirmChatBtn) {
            confirmChatBtn.addEventListener('click', () => {
                const newChatName = newChatNameInput.value.trim();
                if (newChatName) {
                    db.collection('chats').add({
                        name: newChatName,
                        avatar: 'static/images/Icon.png',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        userMessageCount: 0,
                        unlockedTrophies: [],
                        userId: userId
                    }).then(() => {
                        handleNavClick(document.getElementById('chats-link'));
                        modalOverlay.classList.add('hidden');
                        newChatNameInput.value = '';
                    }).catch(error => console.error(error));
                } else {
                    alert("Por favor, ingresa un nombre para el chat.");
                }
            });
        }

        if (userRole === 'profesor') {
            loadProfessorDashboardData();
            loadStudents();

            const homeVerAlumnosBtn = document.getElementById('home-new-chat-btn');
            const homeVerChatsBtn = document.getElementById('home-go-to-chats-btn');
            const homeVerStatsBtn = document.getElementById('home-go-to-db-btn');
            const homeConfigBtn = document.getElementById('home-go-to-config-btn');

            if (homeVerAlumnosBtn) {
                homeVerAlumnosBtn.addEventListener('click', () => {
                    const alumnosLink = document.querySelector('.nav-card.alumnos');
                    if (alumnosLink) handleNavClick(alumnosLink);
                });
            }
            if (homeVerChatsBtn) {
                homeVerChatsBtn.addEventListener('click', () => {
                    const alumnosLink = document.querySelector('.nav-card.alumnos');
                    if (alumnosLink) handleNavClick(alumnosLink);
                });
            }
            if (homeVerStatsBtn) {
                homeVerStatsBtn.addEventListener('click', () => {
                    const statsLink = document.querySelector('.nav-card[data-target="estadisticas"]');
                    if (statsLink) handleNavClick(statsLink);
                });
            }
            if (homeConfigBtn) {
                homeConfigBtn.addEventListener('click', () => {
                    const configLink = document.querySelector('.nav-card.configuracion');
                    if (configLink) handleNavClick(configLink);
                });
            }
        } else if (userRole === 'alumno') {
            const homeNewChatBtn = document.getElementById('home-new-chat-btn');
            const homeConfigBtn = document.getElementById('home-go-to-config-btn');

            if (homeNewChatBtn) {
                homeNewChatBtn.addEventListener('click', () => {
                    if (addChatBtn) {
                        addChatBtn.click();
                    } else if (modalOverlay) {
                        modalOverlay.classList.remove('hidden');
                        if (newChatNameInput) newChatNameInput.focus();
                    }
                });
            }
            if (homeConfigBtn) {
                homeConfigBtn.addEventListener('click', () => {
                    const configLink = document.querySelector('.nav-card.configuracion');
                    if (configLink) handleNavClick(configLink);
                });
            }
        }

        function updateDashboard(chats) {
            if (userRole === 'alumno') {
                const statsTotalChatsEl = document.querySelector('#inicio #stats-total-chats');
                const statsUnlockedTrophiesEl = document.querySelector('#inicio #stats-unlocked-trophies');
                const recentChatsContainer = document.getElementById('recent-chats-container');

                if (!statsTotalChatsEl || !statsUnlockedTrophiesEl || !recentChatsContainer) return;

                let totalTrophies = 0;
                chats.forEach(chat => {
                    totalTrophies += (chat.unlockedTrophies || []).length;
                });

                statsTotalChatsEl.textContent = chats.length;
                statsUnlockedTrophiesEl.textContent = totalTrophies;

                recentChatsContainer.innerHTML = '';
                if (chats.length === 0) {
                    recentChatsContainer.innerHTML = '<p class="empty-state">Aún no hay chats.</p>';
                    return;
                }
                const recentChats = chats.slice(0, 3);
                recentChats.forEach(chat => {
                    const chatElement = document.createElement('div');
                    chatElement.className = 'recent-chat-item';
                    chatElement.innerHTML = `<img src="${chat.avatar || 'static/images/Icon.png'}" alt="Avatar"><span class="chat-name">${chat.name}</span><span class="go-to-chat">Abrir chat <i class="fa-solid fa-arrow-right"></i></span>`;
                    chatElement.addEventListener('click', () => {
                        const chatLinkInSidebar = document.querySelector(`.chat-item[data-chat-id="${chat.id}"]`);
                        if (chatLinkInSidebar) {
                            document.getElementById('chats-link')?.click();
                            setTimeout(() => chatLinkInSidebar.click(), 50);
                        }
                    });
                    recentChatsContainer.appendChild(chatElement);
                });
            }
        }

        const tips = [
            "Puedes expandir y contraer el panel lateral haciendo clic en la flecha verde.",
            "Los botones en 'Inicio' son atajos rápidos para ir a 'Gestionar Alumnos' y 'Ver Estadísticas'.",
            "Al revisar el chat de un alumno, la barra de escritura se oculta. ¡Estás en modo de observación!",
            "La pestaña 'Estadísticas' te permite comparar la actividad de todos tus alumnos en una sola tabla.",
            "Revisa las listas de 'Alumnos Más Activos' y 'Menos Activos' en 'Inicio' para un resumen rápido.",
            "¡Toda la información de los alumnos y sus chats se actualiza en tiempo real!"
        ];

        function displayRandomTip() {
            const tipBody = document.getElementById('tip-of-the-day-body');
            if (tipBody) {
                tipBody.innerHTML = `<p>${tips[Math.floor(Math.random() * tips.length)]}</p>`;
            }
        }

        function updateClock() {
            if (dateTimeCardDate && dateTimeCardTime) {
                const now = new Date();
                dateTimeCardDate.textContent = now.toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                dateTimeCardTime.textContent = now.toLocaleTimeString('es-ES');
            }
        }

        const TROPHY_GOALS = {
            5: {
                id: 't1',
                emoji: '👍'
            },
            10: {
                id: 't2',
                emoji: '🧠'
            },
            15: {
                id: 't3',
                emoji: '🔍'
            },
            20: {
                id: 't4',
                emoji: '🚀'
            },
            25: {
                id: 't5',
                emoji: '🌟'
            },
            30: {
                id: 't6',
                emoji: '🦾'
            },
            35: {
                id: 't7',
                emoji: '🎓'
            },
            40: {
                id: 't8',
                id: '🌈'
            },
            45: {
                id: 't9',
                emoji: '🏆'
            }
        };

        async function checkAndUnlockTrophies(chatId) {
            const chatRef = db.collection('chats').doc(chatId);
            const doc = await chatRef.get();
            if (!doc.exists) return;
            const chatData = doc.data();
            const currentCount = chatData.userMessageCount || 0;
            const currentTrophies = chatData.unlockedTrophies || [];
            const newTrophiesToUnlock = [];
            Object.keys(TROPHY_GOALS).forEach(countStr => {
                const count = parseInt(countStr);
                const goal = TROPHY_GOALS[count];
                if (currentCount >= count && !currentTrophies.includes(goal.id)) {
                    newTrophiesToUnlock.push(goal.id);
                }
            });
            if (newTrophiesToUnlock.length > 0) {
                await chatRef.update({
                    unlockedTrophies: firebase.firestore.FieldValue.arrayUnion(...newTrophiesToUnlock)
                });
            }
            updateTrophyPanel({
                ...chatData,
                id: chatId,
                userMessageCount: currentCount,
                unlockedTrophies: [...currentTrophies, ...newTrophiesToUnlock]
            });
        }

        async function updateTrophyPanel(chat) {
            if (!trophyDisplay) return;
            const sidebarProfileAvatar = document.querySelector('.sidebar-right .profile-avatar');
            const sidebarProfileName = document.querySelector('.sidebar-right .profile-name');
            const sidebarProfileRole = document.querySelector('.sidebar-right .profile-role');

            if (!chat) {
                try {
                    const userDoc = await db.collection('users').doc(userId).get();
                    if (userDoc.exists && sidebarProfileAvatar) {
                        const userData = userDoc.data();
                        sidebarProfileAvatar.src = userData.avatarUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${userData.name}`;
                        sidebarProfileName.textContent = userData.name;
                        sidebarProfileRole.textContent = USER_ROLES_MAP[userData.role] || 'Usuario';
                    }
                } catch (e) {
                    console.error(e);
                }

                trophyDisplay.querySelectorAll(".achievement-slot").forEach(slot => {
                    slot.textContent = '❓';
                    slot.classList.remove('unlocked');
                });
                if (nextGoalCard) nextGoalCard.innerHTML = `<h3>¡Selecciona un chat!</h3><p>Elige una conversación para ver tu progreso.</p>`;
                const profChecklist = document.querySelector('.prof-checklist');
                if (userRole === 'profesor' && profChecklist) {
                    profChecklist.style.display = 'block';
                }
                return;
            }

            try {
                const chatOwnerDoc = await db.collection('users').doc(chat.userId).get();
                if (chatOwnerDoc.exists && sidebarProfileAvatar) {
                    const ownerData = chatOwnerDoc.data();
                    sidebarProfileAvatar.src = ownerData.avatarUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${ownerData.name}`;
                    sidebarProfileName.textContent = ownerData.name;
                    sidebarProfileRole.textContent = USER_ROLES_MAP[ownerData.role] || 'Usuario';
                }
            } catch (error) {
                if (sidebarProfileName) sidebarProfileName.textContent = "Error al cargar";
            }

            const profChecklist = document.querySelector('.prof-checklist');
            if (profChecklist) profChecklist.style.display = 'none';

            const messageCount = chat.userMessageCount || 0;
            const unlockedTrophies = chat.unlockedTrophies || [];
            const slots = trophyDisplay.querySelectorAll(".achievement-slot");
            let nextGoalCount = Infinity,
                nextGoalInfo = null;
            Object.keys(TROPHY_GOALS).forEach((count, index) => {
                if (index >= slots.length) return;
                const goal = TROPHY_GOALS[count];
                const slot = slots[index];
                if (unlockedTrophies.includes(goal.id)) {
                    slot.textContent = goal.emoji;
                    slot.classList.add('unlocked');
                } else {
                    slot.textContent = '❓';
                    slot.classList.remove('unlocked');
                }
                if (!unlockedTrophies.includes(goal.id) && parseInt(count) < nextGoalCount) {
                    nextGoalCount = parseInt(count);
                    nextGoalInfo = goal;
                }
            });
            const updateCard = (card, info) => {
                if (!card) return;
                if (info) {
                    const remaining = nextGoalCount - messageCount;
                    card.innerHTML = `<h3>¡Siguiente misión!</h3><p>Escribe ${remaining} mensajes más para ganar el trofeo ${info.emoji}</p>`;
                } else {
                    card.innerHTML = `<h3>¡Misión completada!</h3><p>Has desbloqueado todos los logros 🎉</p>`;
                }
            };
            updateCard(nextGoalCard, nextGoalInfo);
        }

        if (logoutBtn) {
            const newLogoutBtn = logoutBtn.cloneNode(true);
            logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);

            newLogoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                console.log("Iniciando cierre de sesión...");

                try {
                    await auth.signOut();
                    console.log("Sesión finalizada en Firebase.");
                    window.location.replace('/login');
                } catch (error) {
                    console.error("Error al cerrar sesión:", error);
                    alert("Hubo un problema al cerrar sesión. Intenta recargar la página.");
                }
            });
        }


        displayRandomTip();
        updateClock();
        setInterval(updateClock, 1000);
        if (userRole === 'profesor') {
            loadProfessorDashboardData();
            loadStudents();
        } else if (userRole === 'desarrollador') {
            loadDeveloperDashboardData();
            renderChatHistory(userId);
        } else if (userRole === 'alumno') {
            renderChatHistory(userId);
        } else if (userRole === 'padre') {
            loadChildrenSummaryForDashboard(userId);
        }
    }

    function handleSignupFormSubmit(signupForm) {
        if (!signupForm) return;

        const submitButton = signupForm.querySelector('button[type="submit"]');
        if (!submitButton) return;

        const clonedButton = submitButton.cloneNode(true);
        submitButton.parentNode.replaceChild(clonedButton, submitButton);

        clonedButton.addEventListener('click', async (e) => {
            e.preventDefault();

            clonedButton.disabled = true;
            clonedButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CREANDO...';

            const name = document.getElementById('signup-name').value;
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const roleEl = document.querySelector('input[name="role"]:checked');
            const role = roleEl ? roleEl.value : 'alumno';

            const currentAdminUser = firebase.auth().currentUser;
            if (!currentAdminUser) {
                showToast("Error: Sesión de administrador no activa. Por favor, reinicie la sesión.", 'error');
                clonedButton.disabled = false;
                clonedButton.textContent = 'CREAR CUENTA';
                return;
            }

            try {
                const response = await fetch('/api/admin/create_user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name, email, password, role })
                });

                const data = await response.json();

                if (response.ok) {

                    showToast(`Cuenta para ${name} creada exitosamente.`, 'success');

                    signupForm.reset();

                    if (window.loadDeveloperDashboardData) {
                        window.loadDeveloperDashboardData();
                    }


                } else {
                    let userMessage = data.error || "Error desconocido al crear usuario.";
                    if (response.status === 409) {
                        userMessage = data.error;
                    }
                    showToast(userMessage, 'error');

                }

            } catch (error) {
                console.error('Error de red al crear usuario:', error);
                showToast("Error de red: No se pudo contactar al servidor.", 'error');

            } finally {
                clonedButton.disabled = false;
                clonedButton.textContent = 'CREAR CUENTA';
                clonedButton.innerHTML = 'CREAR CUENTA';
            }
        });
    }

    function initializeUserManagementLogic() {
        const signupForm = document.getElementById('signup-form');
        const closeSuccessModalBtn = document.getElementById('close-success-modal-btn');
        const creationSuccessModal = document.getElementById('creation-success-modal');

        handleSignupFormSubmit(signupForm);

        if (closeSuccessModalBtn && creationSuccessModal) {
            closeSuccessModalBtn.addEventListener('click', () => {
                creationSuccessModal.classList.add('hidden');
            });

            creationSuccessModal.addEventListener('click', (e) => {
                if (e.target === creationSuccessModal) {
                    creationSuccessModal.classList.add('hidden');
                }
            });
        }

        initializeTeacherMonitorLogic();
    }
});