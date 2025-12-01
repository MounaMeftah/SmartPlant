/* ============================================
   EMAILJS CONFIGURATION - SmartPlant
   Configuration pour les notifications par email
   ============================================ */
const EMAILJS_CONFIG = {
    // ⚠️ VOS VRAIES CLÉS EMAILJS (du test qui fonctionne)
    publicKey: 'CDN3p6l0QoJvNWnI0',  // Votre Public Key
    serviceID: 'service_9zpnxfx',     // Votre Service ID
    templateID: 'template_q8nwry2',   // Votre Template ID
    
    // Configuration des alertes à notifier
    alertTypes: {
        soilCritical: true,        // ✅ Sol très sec (< 20%)
        soilDry: true,            // ✅ Sol sec (< seuil min)
        diseaseDetected: true,    // ✅ Maladie détectée
        temperatureExtreme: true, // ✅ Température extrême
        airHumidity: true,        // ✅ Humidité air inadaptée
        pumpFailure: false,       // ❌ Désactivé par défaut
        systemOffline: false      // ❌ Désactivé par défaut
    },
    
    // Délai minimum entre deux emails (en minutes)
    minEmailDelay: 2,  // Un email max toutes les 30 min par type d'alerte
    
    // Adresse email de réception
    recipientEmail: 'meftahmouna691@gmail.com'
};

// ============================================
// INITIALISATION EMAILJS
// ============================================
(function(){
    console.log('📧 Initialisation EmailJS...');
    
    // Attendre que EmailJS soit chargé
    const initEmailJS = () => {
        if (typeof emailjs !== 'undefined') {
            try {
                emailjs.init(EMAILJS_CONFIG.publicKey);
                console.log('✅ EmailJS initialisé avec succès');
                console.log('📧 Service ID:', EMAILJS_CONFIG.serviceID);
                console.log('📧 Template ID:', EMAILJS_CONFIG.templateID);
                console.log('📧 Email destinataire:', EMAILJS_CONFIG.recipientEmail);
            } catch (error) {
                console.error('❌ Erreur initialisation EmailJS:', error);
            }
        } else {
            console.warn('⚠️ EmailJS SDK non encore chargé, nouvelle tentative...');
            setTimeout(initEmailJS, 500);
        }
    };
    
    // Démarrer l'initialisation
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEmailJS);
    } else {
        initEmailJS();
    }
})();

// ============================================
// ÉTAT DES EMAILS ENVOYÉS
// ============================================
let lastEmailSent = {
    timestamp: {},
    count: 0
};

/**
 * Vérifie si on peut envoyer un email (respect du délai minimum)
 */
function canSendEmail(alertType) {
    const now = Date.now();
    const lastSent = lastEmailSent.timestamp[alertType] || 0;
    const delayMs = EMAILJS_CONFIG.minEmailDelay * 60 * 1000;
    
    const canSend = (now - lastSent) > delayMs;
    
    if (!canSend) {
        const minutesRemaining = Math.ceil((delayMs - (now - lastSent)) / 60000);
        console.log(`⏳ Délai non respecté pour ${alertType}. Attendre ${minutesRemaining} min`);
    }
    
    return canSend;
}

/**
 * Envoie un email de notification d'alerte
 */
async function sendAlertEmail(alertData) {
    // Vérifier si EmailJS est disponible
    if (typeof emailjs === 'undefined') {
        console.warn('⚠️ EmailJS non disponible');
        return { success: false, error: 'EmailJS non chargé' };
    }
    
    // Vérifier si ce type d'alerte doit être notifié
    if (!EMAILJS_CONFIG.alertTypes[alertData.type]) {
        console.log('ℹ️ Type d\'alerte non notifié:', alertData.type);
        return { success: false, error: 'Type d\'alerte désactivé' };
    }
    
    // Vérifier le délai minimum
    if (!canSendEmail(alertData.type)) {
        return { success: false, error: 'Délai minimum non respecté' };
    }
    
    try {
        // Obtenir les données capteurs depuis firebaseData (global)
        const capteurs = window.firebaseData?.capteurs || {};
        const systeme = window.firebaseData?.systeme || {};
        
        // Préparer les données pour le template
        const templateParams = {
            // En-tête
            title: alertData.title || '🚨 Alerte SmartPlant',
            
            // Informations de l'alerte
            alert_type: alertData.type,
            alert_level: alertData.level || 'warning',
            alert_message: alertData.message,
            alert_detail: alertData.detail || '',
            
            // Données capteurs actuels
            soil_humidity: capteurs.humiditeSol || 0,
            temperature: capteurs.temperature || 0,
            air_humidity: capteurs.humiditeAir || 0,
            rain: capteurs.pluie || 0,
            
            // Informations système
            system_mode: window.currentWateringMode || 'automatique',
            pump_active: systeme.pompeActive ? 'Oui' : 'Non',
            disease_detected: systeme.maladieDetectee ? 'Oui' : 'Non',
            
            // Métadonnées
            timestamp: new Date().toLocaleString('fr-FR'),
            source_page: window.location.href,
            
            // Email destinataire
            to_email: EMAILJS_CONFIG.recipientEmail
        };
        
        console.log('📧 Envoi email alerte...', alertData.type);
        console.log('📊 Données:', templateParams);
        
        // Envoyer l'email via EmailJS
        const response = await emailjs.send(
            EMAILJS_CONFIG.serviceID,
            EMAILJS_CONFIG.templateID,
            templateParams
        );
        
        // Mettre à jour l'état
        lastEmailSent.timestamp[alertData.type] = Date.now();
        lastEmailSent.count++;
        
        // Sauvegarder dans Firebase (optionnel)
        if (window.database) {
            window.database.ref('/alertes/dernierEmail').update({
                type: alertData.type,
                timestamp: Date.now(),
                status: 'success',
                response: response.text
            }).catch(err => console.warn('⚠️ Erreur sauvegarde Firebase:', err));
        }
        
        console.log('✅ Email envoyé avec succès:', response);
        return { success: true, response };
        
    } catch (error) {
        console.error('❌ Erreur envoi email:', error);
        
        // Sauvegarder l'erreur dans Firebase (optionnel)
        if (window.database) {
            window.database.ref('/alertes/dernierEmail').update({
                type: alertData.type,
                timestamp: Date.now(),
                status: 'error',
                error: error.text || error.message
            }).catch(err => console.warn('⚠️ Erreur sauvegarde Firebase:', err));
        }
        
        return { success: false, error: error.text || error.message };
    }
}

/**
 * Fonction helper pour créer et envoyer une alerte
 */
async function createAndSendAlert(type, level, message, detail) {
    const alertData = {
        type: type,
        level: level,
        title: `${level === 'danger' ? '🚨' : '⚠️'} Alerte SmartPlant`,
        message: message,
        detail: detail
    };
    
    return await sendAlertEmail(alertData);
}

/**
 * Test de la configuration EmailJS
 */
async function testEmailConfiguration() {
    console.log('🧪 Test configuration EmailJS...');
    
    const result = await sendAlertEmail({
        type: 'test',
        level: 'info',
        title: '🧪 Test SmartPlant',
        message: 'Email de test - Configuration OK',
        detail: 'Ceci est un email de test pour vérifier la configuration EmailJS.'
    });
    
    if (result.success) {
        alert('✅ Email de test envoyé avec succès !\n\nVérifiez votre boîte mail: ' + EMAILJS_CONFIG.recipientEmail);
        console.log('✅ Test réussi !');
    } else {
        alert('❌ Erreur lors du test :\n\n' + result.error);
        console.error('❌ Test échoué:', result.error);
    }
    
    return result;
}

// ============================================
// EXPORT DES FONCTIONS GLOBALES
// ============================================
window.sendAlertEmail = sendAlertEmail;
window.createAndSendAlert = createAndSendAlert;
window.testEmailConfiguration = testEmailConfiguration;
window.EMAILJS_CONFIG = EMAILJS_CONFIG;
window.canSendEmail = canSendEmail;

console.log('✅ Module EmailJS chargé avec succès');
console.log('📧 Configuration:', {
    publicKey: EMAILJS_CONFIG.publicKey ? '✅ Défini' : '❌ Manquant',
    serviceID: EMAILJS_CONFIG.serviceID ? '✅ Défini' : '❌ Manquant',
    templateID: EMAILJS_CONFIG.templateID ? '✅ Défini' : '❌ Manquant',
    recipientEmail: EMAILJS_CONFIG.recipientEmail
});