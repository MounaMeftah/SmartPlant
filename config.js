// ============================================
// CONFIGURATION SENSIBLE - NE PAS COMMITER
// ============================================

const API_CONFIG = {
    // Plant.id API Key
    // ⚠️ IMPORTANT: Créez votre propre clé sur https://plant.id/
    // Cette clé est temporaire et a un quota limité
    plantIdApiKey: 'YQxOUl3ys6ECuCPh6yFdJ7Xd0g4t6DGfYmfTbwkWJLxnq1aPme',
    
    // Alternative : API Locale (nécessite installation Flask)
    localApiUrl: 'http://127.0.0.1:5000/predict',
    
    // ======================================
    // CHOISIR QUELLE API UTILISER
    // ======================================
    // false = Plant.id (fonctionne immédiatement mais quota limité)
    // true  = API locale (gratuit illimité mais nécessite installation)
    useLocalApi: false
};

// Export pour utilisation dans app.js
window.API_CONFIG = API_CONFIG;