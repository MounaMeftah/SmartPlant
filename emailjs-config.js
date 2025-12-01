/* ============================================
   EMAILJS CONFIGURATION
   Configuration pour les notifications par email
   ============================================ */

const EMAILJS_CONFIG = {
    // ⚠️ REMPLACE CES VALEURS PAR TES PROPRES IDENTIFIANTS EMAILJS
    publicKey: 'CDN3p6l0QoJvNWnI0',  // Ton Public Key EmailJS
    serviceID: 'service_9zpnxfx',           // Ton Service ID
    templateID: 'template_q8nwry2',      // Ton Template ID
    
    // Configuration des alertes à notifier
    alertTypes: {
        soilCritical: true,      // Sol très sec
        soilDry: true,           // Sol sec
        diseaseDetected: true,   // Maladie détectée
        temperatureExtreme: true, // Température extrême
        pumpFailure: true,       // Échec pompe
        systemOffline: false     // Système hors ligne (désactivé par défaut)
    },
    
    // Délai minimum entre deux emails (en minutes)
    minEmailDelay: 30,
    
    // Adresse email de réception
    recipientEmail: 'meftahmouna691@gmail.com'
};

// Initialisation EmailJS
(function(){
    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAILJS_CONFIG.publicKey);
        console.log('✅ EmailJS initialisé');
    } else {
        console.warn('⚠️ EmailJS SDK non chargé');
    }
})();

// État des derniers emails envoyés
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
    
    return (now - lastSent) > delayMs;
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
        console.log('⏳ Email non envoyé (délai minimum non respecté)');
        return { success: false, error: 'Délai minimum non respecté' };
    }
    
    try {
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
            soil_humidity: firebaseData.capteurs?.humiditeSol || 0,
            temperature: firebaseData.capteurs?.temperature || 0,
            air_humidity: firebaseData.capteurs?.humiditeAir || 0,
            rain: firebaseData.capteurs?.pluie || 0,
            
            // Informations système
            system_mode: currentWateringMode || 'automatique',
            pump_active: firebaseData.systeme?.pompeActive ? 'Oui' : 'Non',
            disease_detected: firebaseData.systeme?.maladieDetectee ? 'Oui' : 'Non',
            
            // Métadonnées
            timestamp: new Date().toLocaleString('fr-FR'),
            source_page: window.location.href,
            
            // Email destinataire
            to_email: EMAILJS_CONFIG.recipientEmail
        };
        
        console.log('📧 Envoi email alerte...', alertData.type);
        
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
        if (database) {
            database.ref('/alertes/dernierEmail').update({
                type: alertData.type,
                timestamp: Date.now(),
                status: 'success'
            }).catch(err => console.warn('⚠️ Erreur sauvegarde Firebase:', err));
        }
        
        console.log('✅ Email envoyé avec succès:', response);
        return { success: true, response };
        
    } catch (error) {
        console.error('❌ Erreur envoi email:', error);
        
        // Sauvegarder l'erreur dans Firebase (optionnel)
        if (database) {
            database.ref('/alertes/dernierEmail').update({
                type: alertData.type,
                timestamp: Date.now(),
                status: 'error',
                error: error.message
            }).catch(err => console.warn('⚠️ Erreur sauvegarde Firebase:', err));
        }
        
        return { success: false, error: error.message };
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
        alert('✅ Email de test envoyé avec succès !\n\nVérifiez votre boîte mail.');
    } else {
        alert('❌ Erreur lors du test :\n\n' + result.error);
    }
    
    return result;
}

// Export des fonctions pour utilisation globale
window.sendAlertEmail = sendAlertEmail;
window.createAndSendAlert = createAndSendAlert;
window.testEmailConfiguration = testEmailConfiguration;
window.EMAILJS_CONFIG = EMAILJS_CONFIG;

console.log('✅ Module EmailJS chargé');