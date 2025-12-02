/* ============================================
   SMARTPLANT - GESTION AUTHENTIFICATION
   Connexion & Inscription avec Firebase
   ============================================ */

// ============================================
// CONFIGURATION FIREBASE
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyA6MQnlHhpSVlOrefaRIA9vrf9rh6oZeHw",
    authDomain: "smartpant-4bc8f.firebaseapp.com",
    databaseURL: "https://smartpant-4bc8f-default-rtdb.firebaseio.com",
    projectId: "smartpant-4bc8f",
    storageBucket: "smartpant-4bc8f.firebasestorage.app",
    messagingSenderId: "676711203842",
    appId: "1:676711203842:web:e598dfd928dc3dc801931b"
};

// Initialiser Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// ============================================
// VÉRIFIER SESSION EXISTANTE
// ============================================
window.addEventListener('DOMContentLoaded', function() {
    const savedUser = localStorage.getItem('smartplant_user');
    const savedSession = sessionStorage.getItem('smartplant_session');
    
    if (savedUser || savedSession) {
        const userData = JSON.parse(savedUser || savedSession);
        const expirationTime = localStorage.getItem('smartplant_expiration');
        
        if (expirationTime && Date.now() < parseInt(expirationTime)) {
            showAlert('success', '✅', 'Session active - Redirection...');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } else {
            localStorage.removeItem('smartplant_user');
            localStorage.removeItem('smartplant_expiration');
        }
    }

    // Remplir automatiquement si "Se souvenir" était coché
    const savedUsername = localStorage.getItem('smartplant_remembered_user');
    if (savedUsername) {
        const loginUsername = document.getElementById('loginUsername');
        if (loginUsername) {
            loginUsername.value = savedUsername;
            const rememberMe = document.getElementById('rememberMe');
            if (rememberMe) rememberMe.checked = true;
        }
    }
});

// ============================================
// CHANGEMENT D'ONGLET
// ============================================
function switchTab(tab) {
    // Mettre à jour les tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.remove('active'));
    
    // Mettre à jour les formulaires
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (tab === 'login') {
        tabs[0].classList.add('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    } else {
        tabs[1].classList.add('active');
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    }
    
    // Réinitialiser les alertes
    hideAlert();
}

// ============================================
// AFFICHAGE/MASQUAGE MOT DE PASSE
// ============================================
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
    
    // Trouver l'icône toggle associée
    const toggleIcon = input.parentElement.querySelector('.password-toggle');
    if (toggleIcon) {
        toggleIcon.textContent = type === 'password' ? '👁️' : '🙈';
    }
}

// ============================================
// VÉRIFICATION FORCE DU MOT DE PASSE
// ============================================
function checkPasswordStrength() {
    const password = document.getElementById('registerPassword').value;
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');
    
    if (!password) {
        strengthFill.className = 'strength-fill';
        strengthText.textContent = '';
        return;
    }
    
    let strength = 0;
    
    // Critères de force
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    
    // Affichage
    if (strength <= 2) {
        strengthFill.className = 'strength-fill strength-weak';
        strengthText.textContent = '⚠️ Mot de passe faible';
        strengthText.style.color = 'var(--danger)';
    } else if (strength <= 4) {
        strengthFill.className = 'strength-fill strength-medium';
        strengthText.textContent = '⚡ Mot de passe moyen';
        strengthText.style.color = 'var(--warning)';
    } else {
        strengthFill.className = 'strength-fill strength-strong';
        strengthText.textContent = '✅ Mot de passe fort';
        strengthText.style.color = 'var(--primary)';
    }
}

// ============================================
// GESTION CONNEXION
// ============================================
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('loginUsername').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    if (!username || !password) {
        showAlert('error', '❌', 'Veuillez remplir tous les champs');
        return;
    }

    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<div class="loading-spinner"></div><span>Connexion...</span>';

    try {
        // Vérifier dans Firebase
        const userSnapshot = await database.ref(`users/${username}`).once('value');
        const user = userSnapshot.val();
        
        if (!user || user.password !== password) {
            showAlert('error', '❌', 'Identifiants incorrects');
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>🔐</span><span>Se connecter</span>';
            await logLoginAttempt(username, false);
            return;
        }

        // Connexion réussie
        showAlert('success', '✅', `Bienvenue ${user.name} ! Redirection...`);

        // Créer session
        const sessionData = {
            username: username,
            name: user.name,
            role: user.role,
            loginTime: Date.now()
        };

        // Sauvegarder session
        if (rememberMe) {
            const expirationTime = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 jours
            localStorage.setItem('smartplant_user', JSON.stringify(sessionData));
            localStorage.setItem('smartplant_expiration', expirationTime.toString());
            localStorage.setItem('smartplant_remembered_user', username);
        } else {
            sessionStorage.setItem('smartplant_session', JSON.stringify(sessionData));
            localStorage.removeItem('smartplant_remembered_user');
        }

        // Mettre à jour la dernière connexion
        await database.ref(`users/${username}`).update({
            lastLogin: Date.now()
        });

        // Log connexion réussie
        await logLoginAttempt(username, true, user.name);

        // Rediriger vers le dashboard
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
        
    } catch (error) {
        console.error('Erreur connexion:', error);
        showAlert('error', '❌', 'Erreur de connexion. Réessayez.');
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>🔐</span><span>Se connecter</span>';
    }
}

// ============================================
// GESTION INSCRIPTION
// ============================================
async function handleRegister(event) {
    event.preventDefault();
    
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim().toLowerCase();
    const username = document.getElementById('registerUsername').value.trim().toLowerCase();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    
    // Validations
    if (!name || !email || !username || !password || !passwordConfirm) {
        showAlert('error', '❌', 'Veuillez remplir tous les champs');
        return;
    }
    
    // Validation nom d'utilisateur
    if (username.length < 3 || username.length > 20) {
        showAlert('error', '❌', 'Le nom d\'utilisateur doit contenir entre 3 et 20 caractères');
        return;
    }
    
    if (!/^[a-z0-9]+$/.test(username)) {
        showAlert('error', '❌', 'Le nom d\'utilisateur ne peut contenir que des lettres et chiffres');
        return;
    }
    
    // Validation email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('error', '❌', 'Email invalide');
        return;
    }
    
    // Validation mot de passe
    if (password.length < 6) {
        showAlert('error', '❌', 'Le mot de passe doit contenir au moins 6 caractères');
        return;
    }
    
    if (password !== passwordConfirm) {
        showAlert('error', '❌', 'Les mots de passe ne correspondent pas');
        return;
    }

    const registerBtn = document.getElementById('registerBtn');
    registerBtn.disabled = true;
    registerBtn.innerHTML = '<div class="loading-spinner"></div><span>Création...</span>';

    try {
        // Vérifier si l'utilisateur existe déjà
        const userSnapshot = await database.ref(`users/${username}`).once('value');
        if (userSnapshot.exists()) {
            showAlert('error', '❌', 'Ce nom d\'utilisateur est déjà pris');
            registerBtn.disabled = false;
            registerBtn.innerHTML = '<span>➕</span><span>Créer mon compte</span>';
            return;
        }
        
        // Vérifier si l'email existe déjà
        const emailSnapshot = await database.ref('users').orderByChild('email').equalTo(email).once('value');
        if (emailSnapshot.exists()) {
            showAlert('error', '❌', 'Cet email est déjà utilisé');
            registerBtn.disabled = false;
            registerBtn.innerHTML = '<span>➕</span><span>Créer mon compte</span>';
            return;
        }

        // Créer le nouvel utilisateur
        const newUser = {
            name: name,
            email: email,
            password: password,
            role: 'owner', // Nouveau compte = owner par défaut
            createdAt: Date.now(),
            lastLogin: null
        };

        await database.ref(`users/${username}`).set(newUser);

        showAlert('success', '✅', `Compte créé avec succès ! Bienvenue ${name} !`);

        // Log la création
        await database.ref('user_registrations').push({
            username: username,
            name: name,
            email: email,
            timestamp: Date.now()
        });

        // Connexion automatique
        const sessionData = {
            username: username,
            name: name,
            role: 'owner',
            loginTime: Date.now()
        };

        sessionStorage.setItem('smartplant_session', JSON.stringify(sessionData));

        // Rediriger vers le dashboard
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        
    } catch (error) {
        console.error('Erreur inscription:', error);
        showAlert('error', '❌', 'Erreur lors de la création du compte. Réessayez.');
        registerBtn.disabled = false;
        registerBtn.innerHTML = '<span>➕</span><span>Créer mon compte</span>';
    }
}

// ============================================
// LOGGER LES TENTATIVES DE CONNEXION
// ============================================
async function logLoginAttempt(username, success, name = '') {
    try {
        const logRef = database.ref('login_logs');
        await logRef.push({
            username: username,
            name: name,
            success: success,
            timestamp: Date.now(),
            userAgent: navigator.userAgent
        });
    } catch (error) {
        console.warn('Erreur log connexion:', error);
    }
}

// ============================================
// GESTION ALERTES
// ============================================
function showAlert(type, icon, message) {
    const alertBox = document.getElementById('alertBox');
    const alertIcon = document.getElementById('alertIcon');
    const alertMessage = document.getElementById('alertMessage');
    
    if (!alertBox || !alertIcon || !alertMessage) return;
    
    alertBox.className = 'alert alert-' + type;
    alertBox.style.display = 'flex';
    alertIcon.textContent = icon;
    alertMessage.textContent = message;

    setTimeout(() => {
        hideAlert();
    }, 5000);
}

function hideAlert() {
    const alertBox = document.getElementById('alertBox');
    if (alertBox) {
        alertBox.style.display = 'none';
    }
}

// ============================================
// MOT DE PASSE OUBLIÉ
// ============================================
function handleForgotPassword(e) {
    e.preventDefault();
    showAlert('info', '🔒', 'Contactez l\'administrateur pour réinitialiser votre mot de passe');
}

console.log('🔐 SmartPlant Auth - Ready');