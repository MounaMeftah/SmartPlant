/* ============================================
   SMARTPLANT - SYSTÈME D'AUTHENTIFICATION
   Protection du Dashboard
   ============================================ */

// ============================================
// VÉRIFICATION SESSION AU CHARGEMENT
// ============================================
(function() {
    'use strict';
    
    console.log('🔐 Vérification authentification...');
    
    // Liste des pages qui ne nécessitent pas d'authentification
    const PUBLIC_PAGES = ['login.html'];
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // Si on est sur une page publique, pas besoin de vérifier
    if (PUBLIC_PAGES.includes(currentPage)) {
        console.log('📄 Page publique - Pas d\'authentification requise');
        return;
    }
    
    // Vérifier si l'utilisateur est connecté
    const savedUser = localStorage.getItem('smartplant_user');
    const savedSession = sessionStorage.getItem('smartplant_session');
    
    if (!savedUser && !savedSession) {
        console.log('❌ Non authentifié - Redirection vers login');
        window.location.href = 'login.html';
        return;
    }
    
    // Vérifier l'expiration de la session (localStorage uniquement)
    if (savedUser) {
        const expirationTime = localStorage.getItem('smartplant_expiration');
        if (!expirationTime || Date.now() >= parseInt(expirationTime)) {
            console.log('⏰ Session expirée - Redirection vers login');
            localStorage.removeItem('smartplant_user');
            localStorage.removeItem('smartplant_expiration');
            window.location.href = 'login.html';
            return;
        }
    }
    
    // Récupérer les données utilisateur
    const userData = JSON.parse(savedUser || savedSession);
    console.log('✅ Utilisateur authentifié:', userData.name);
    
    // Afficher les informations utilisateur dans l'interface
    displayUserInfo(userData);
    
})();

// ============================================
// AFFICHER INFORMATIONS UTILISATEUR
// ============================================
function displayUserInfo(userData) {
    // Attendre que le DOM soit prêt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => displayUserInfoDOM(userData));
    } else {
        displayUserInfoDOM(userData);
    }
}

function displayUserInfoDOM(userData) {
    // Chercher ou créer une zone pour afficher l'utilisateur
    let userInfoContainer = document.getElementById('userInfo');
    
    if (!userInfoContainer) {
        // Créer un conteneur dans la sidebar
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            userInfoContainer = document.createElement('div');
            userInfoContainer.id = 'userInfo';
            userInfoContainer.style.cssText = `
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                padding: 20px;
                background: rgba(0, 0, 0, 0.3);
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            `;
            sidebar.appendChild(userInfoContainer);
        }
    }
    
    if (userInfoContainer) {
        const roleIcon = userData.role === 'admin' ? '👑' : 
                        userData.role === 'owner' ? '🌿' : '👤';
        
        const roleText = userData.role === 'admin' ? 'Administrateur' : 
                        userData.role === 'owner' ? 'Propriétaire' : 'Invité';
        
        userInfoContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <div style="font-size: 32px;">${roleIcon}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; color: var(--text-primary); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${userData.name}
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        ${roleText}
                    </div>
                </div>
            </div>
            <button onclick="logout()" style="
                width: 100%;
                padding: 10px;
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 8px;
                color: #fca5a5;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-weight: 500;
            " onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'" 
               onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'">
                <span style="font-size: 16px;">🚪</span>
                <span>Déconnexion</span>
            </button>
        `;
    }
}

// ============================================
// FONCTION DÉCONNEXION
// ============================================
function logout() {
    const confirmed = confirm('Êtes-vous sûr de vouloir vous déconnecter ?');
    
    if (confirmed) {
        console.log('👋 Déconnexion...');
        
        // Effacer toutes les données de session
        localStorage.removeItem('smartplant_user');
        localStorage.removeItem('smartplant_expiration');
        sessionStorage.removeItem('smartplant_session');
        
        // Rediriger vers la page de connexion
        window.location.href = 'login.html';
    }
}

// ============================================
// OBTENIR DONNÉES UTILISATEUR
// ============================================
function getCurrentUser() {
    const savedUser = localStorage.getItem('smartplant_user');
    const savedSession = sessionStorage.getItem('smartplant_session');
    
    if (savedUser || savedSession) {
        return JSON.parse(savedUser || savedSession);
    }
    
    return null;
}

// ============================================
// VÉRIFIER PERMISSIONS
// ============================================
function hasPermission(requiredRole) {
    const user = getCurrentUser();
    if (!user) return false;
    
    const roleHierarchy = {
        'viewer': 1,
        'owner': 2,
        'admin': 3
    };
    
    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    return userLevel >= requiredLevel;
}

// ============================================
// APPLIQUER PERMISSIONS
// ============================================
function applyPermissions() {
    const user = getCurrentUser();
    if (!user) return;
    
    // Masquer les éléments admin pour les utilisateurs non-admin
    if (user.role !== 'admin') {
        const adminElements = document.querySelectorAll('[data-admin-only]');
        adminElements.forEach(element => {
            element.style.display = 'none';
        });
    }
    
    // Désactiver les contrôles pour les viewers
    if (user.role === 'viewer') {
        const controlElements = document.querySelectorAll('button:not(#logoutBtn), input[type="number"], select');
        controlElements.forEach(element => {
            if (!element.classList.contains('read-only-allowed')) {
                element.disabled = true;
                element.style.opacity = '0.5';
                element.style.cursor = 'not-allowed';
                element.title = 'Vous n\'avez pas les permissions pour modifier cette valeur';
            }
        });
    }
}

// Appliquer les permissions quand le DOM est prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPermissions);
} else {
    applyPermissions();
}

// ============================================
// EXPORT FONCTIONS GLOBALES
// ============================================
window.logout = logout;
window.getCurrentUser = getCurrentUser;
window.hasPermission = hasPermission;
window.applyPermissions = applyPermissions;

console.log('✅ Système d\'authentification chargé');