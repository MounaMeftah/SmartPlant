/* ============================================
   SMARTPLANT DASHBOARD - JAVASCRIPT COMPLET
   Version avec 3 modes d'arrosage : Automatique, Manuel, Programmé
   ============================================ */

// ============================================
// CONFIGURATION
// ============================================
const ROBOFLOW_PUBLISHABLE_KEY = "rf_kw1r2TticSP3SoDsARINZDjrnYk2"; // ta clé publishable
const ROBOFLOW_MODEL_NAME = "plant-disease-classification"; // adapte si besoin
const ROBOFLOW_MODEL_VERSION = "1"; // version du modèle

// URL principale utilisée par les fonctions
const ROBOFLOW_API_URL = `https://detect.roboflow.com/${ROBOFLOW_MODEL_NAME}/${ROBOFLOW_MODEL_VERSION}?api_key=${ROBOFLOW_PUBLISHABLE_KEY}`;

// Aliases (pour couvrir les variantes de nommage rencontrées)
const ROBofLOW_API_URL = ROBOFLOW_API_URL;
const ROBoflow_API_URL = ROBOFLOW_API_URL;

// Expose aussi sur window (au cas où le code inline l'attendrait)
if (typeof window !== 'undefined') {
  window.ROBOFLOW_API_URL = ROBOFLOW_API_URL;
  window.ROBofLOW_API_URL = ROBOFLOW_API_URL;
  window.ROBoflow_API_URL = ROBOFLOW_API_URL;
}


const CONFIG = {
    weatherLatitude: 35.5047,
    weatherLongitude: 11.0622,
    weatherCity: 'Mahdia',
    weatherTimezone: 'Africa/Tunis',
    
    firebase: {
        apiKey: "AIzaSyA6MQnlHhpSVlOrefaRIA9vrf9rh6oZeHw",
        authDomain: "smartpant-4bc8f.firebaseapp.com",
        databaseURL: "https://smartpant-4bc8f-default-rtdb.firebaseio.com",
        projectId: "smartpant-4bc8f",
        storageBucket: "smartpant-4bc8f.firebasestorage.app",
        messagingSenderId: "676711203842",
        appId: "1:676711203842:web:e598dfd928dc3dc801931b",
        measurementId: "G-4RXG3QH604"
    },
    
    refreshInterval: 2000,
    diseaseCheckInterval: 1800000,
    weatherRefreshInterval: 1800000
};

// Variables globales
let database, charts = {}, firebaseData = {
    capteurs: { temperature: 0, humiditeAir: 0, humiditeSol: 0, pluie: 0, timestamp: 0 },
    systeme: { mode: 'automatique', pompeActive: false, maladieDetectee: false, typeMaladie: '', dernierArrosage: 0 },
    commandes: { mode: 'automatique', activerPompe: false, capturerPhoto: false },
    configuration: { 
        seuilHumiditeBas: 30, 
        seuilHumiditeHaut: 70, 
        dureeArrosage: 5,
        delaiMinArrosage: 60,
        mode: 'automatique'
    },
    arrosage: {
        automatique: { seuilMin: 30, duree: 5, delaiMin: 60 },
        manuel: { duree: 5 },
        programme: {
            prog1: { actif: true, heure: 7, minute: 0, duree: 5 },
            prog2: { actif: false, heure: 18, minute: 0, duree: 5 }
        }
    },
    historique: {},
    alertes: { arrosage: '', dernierEmail: '' }
};
let weatherData = null;
let currentTimeRange = 'realtime';
let tmModel = null, tmMaxPredictions = 0;
let currentWateringMode = 'automatique';

// INITIALISATION
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌿 SmartPlant Dashboard - Démarrage...');
    console.log('📡 Connexion à Firebase:', CONFIG.firebase.databaseURL);
    initFirebase();
    loadTeachableMachineModel();
    loadWeatherData();
    setTimeout(() => { initCharts(); console.log('📊 Graphiques initialisés'); }, 1000);
    setInterval(() => {
        console.log('🔄 Actualisation automatique...');
        updateDashboard();
    }, CONFIG.refreshInterval);
    setInterval(loadWeatherData, CONFIG.weatherRefreshInterval);
    console.log('✅ Dashboard initialisé !');
});

// ============================================
// TEACHABLE MACHINE
// ============================================
async function loadTeachableMachineModel() {
    try {
        console.log('🤖 Chargement modèle Teachable Machine...');
        const modelURL = './models/model.json';
        const metadataURL = './models/metadata.json';
        tmModel = await tmImage.load(modelURL, metadataURL);
        tmMaxPredictions = tmModel.getTotalClasses();
        console.log('✅ Modèle chargé:', tmMaxPredictions, 'classes');
    } catch (error) {
        console.error('❌ Erreur chargement modèle:', error);
    }
}

// ============================================
// FIREBASE - ÉCOUTE EN TEMPS RÉEL
// ============================================
function initFirebase() {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(CONFIG.firebase);
            console.log('🔥 Firebase: Initialisation...');
        }
        database = firebase.database();
        
        // Écouter les capteurs
        database.ref('/capteurs').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                firebaseData.capteurs = data;
                console.log('📡 Capteurs mis à jour:', {
                    temp: data.temperature,
                    sol: data.humiditeSol,
                    air: data.humiditeAir,
                    pluie: data.pluie
                });
                updateSensorCards();
                updateChartsWithRealData();
                calculateGlobalHealth();
            }
        }, (error) => console.error('❌ Erreur capteurs:', error));
        
        // Écouter le système
        database.ref('/systeme').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                firebaseData.systeme = data;
                console.log('⚙️ Système mis à jour:', {
                    mode: data.mode,
                    pompe: data.pompeActive,
                    maladie: data.maladieDetectee
                });
                updateSystemDisplay();
                updatePumpStatus();
            }
        });
        
        // Écouter la configuration d'arrosage
        database.ref('/arrosage').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                firebaseData.arrosage = data;
                console.log('💧 Config arrosage mise à jour:', data);
                updateWateringUI();
            }
        });
        
        // Écouter l'historique d'arrosage
        database.ref('/historique_arrosage').limitToLast(20).on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                updateWateringHistory(data);
            }
        });
        
        // Écouter la configuration
        database.ref('/configuration').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                firebaseData.configuration = data;
                console.log('⚙️ Configuration mise à jour:', data);
                updateConfigurationUI();
            }
        });
        
        // Écouter les commandes
        database.ref('/commandes').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                firebaseData.commandes = data;
                console.log('🎮 Commandes mises à jour:', data);
                if (data.mode) {
                    currentWateringMode = data.mode;
                    updateModeDisplay();
                }
            }
        });
        
        // Vérifier connexion
        database.ref('.info/connected').on('value', (snapshot) => {
            if (snapshot.val() === true) {
                console.log('✅ Firebase connecté !');
                updateSystemStatus('firebase', 'connected');
            } else {
                console.log('⚠️ Firebase déconnecté');
                updateSystemStatus('firebase', 'disconnected');
            }
        });
        
        // Dernière mise à jour
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            setInterval(() => {
                lastUpdate.textContent = new Date().toLocaleTimeString('fr-FR');
            }, 1000);
        }
        
    } catch (error) {
        console.error('❌ Erreur init Firebase:', error);
    }
}

// ============================================
// GESTION DES MODES D'ARROSAGE
// ============================================
function setWateringMode(mode) {
    console.log('🎮 Changement mode arrosage:', mode);
    currentWateringMode = mode;
    
    // Sauvegarder dans Firebase
    if (database) {
        database.ref('/commandes').update({ 
            mode: mode 
        })
        .then(() => {
            console.log('✅ Mode arrosage sauvegardé:', mode);
            updateModeDisplay();
            showModePanel(mode);
        })
        .catch(err => {
            console.error('❌ Erreur sauvegarde mode:', err);
            alert('❌ Erreur de connexion Firebase');
        });
    }
}

function updateModeDisplay() {
    // Réinitialiser tous les cards
    const allCards = ['modeAutoCard', 'modeManuelCard', 'modeProgrammeCard'];
    const allIndicators = ['modeAutoIndicator', 'modeManuelIndicator', 'modeProgrammeIndicator'];
    
    allCards.forEach(cardId => {
        const card = document.getElementById(cardId);
        if (card) {
            card.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            card.style.background = 'var(--card-bg)';
        }
    });
    
    allIndicators.forEach(indicatorId => {
        const indicator = document.getElementById(indicatorId);
        if (indicator) {
            indicator.innerHTML = '<span class="status-badge status-info">Disponible</span>';
        }
    });
    
    // Activer le mode sélectionné
    let activeCardId, activeIndicatorId, modeText, modeDescription;
    
    switch(currentWateringMode) {
        case 'automatique':
            activeCardId = 'modeAutoCard';
            activeIndicatorId = 'modeAutoIndicator';
            modeText = 'Mode Actuel : Automatique';
            modeDescription = `Le système arrose automatiquement quand l'humidité du sol < ${firebaseData.arrosage?.automatique?.seuilMin || 30}%`;
            break;
        case 'manuel':
            activeCardId = 'modeManuelCard';
            activeIndicatorId = 'modeManuelIndicator';
            modeText = 'Mode Actuel : Manuel';
            modeDescription = 'Vous contrôlez directement l\'arrosage avec le bouton';
            break;
        case 'programme':
            activeCardId = 'modeProgrammeCard';
            activeIndicatorId = 'modeProgrammeIndicator';
            modeText = 'Mode Actuel : Programmé';
            modeDescription = 'Arrosage selon les horaires programmés';
            break;
    }
    
    const activeCard = document.getElementById(activeCardId);
    if (activeCard) {
        activeCard.style.border = '2px solid var(--primary)';
        activeCard.style.background = 'rgba(16, 185, 129, 0.1)';
    }
    
    const activeIndicator = document.getElementById(activeIndicatorId);
    if (activeIndicator) {
        activeIndicator.innerHTML = '<span class="status-badge status-success">✅ Actif</span>';
    }
    
    const currentModeText = document.getElementById('currentModeText');
    if (currentModeText) currentModeText.textContent = modeText;
    
    const currentModeDescription = document.getElementById('currentModeDescription');
    if (currentModeDescription) currentModeDescription.textContent = modeDescription;
}

function showModePanel(mode) {
    // Cacher tous les panneaux
    document.getElementById('panelAutomatic').style.display = 'none';
    document.getElementById('panelManual').style.display = 'none';
    document.getElementById('panelScheduled').style.display = 'none';
    
    // Afficher le panneau correspondant
    switch(mode) {
        case 'automatique':
            document.getElementById('panelAutomatic').style.display = 'block';
            break;
        case 'manuel':
            document.getElementById('panelManual').style.display = 'block';
            break;
        case 'programme':
            document.getElementById('panelScheduled').style.display = 'block';
            break;
    }
}

// ============================================
// CONFIGURATION MODE AUTOMATIQUE
// ============================================
function saveAutomaticConfig() {
    const seuilMin = parseInt(document.getElementById('autoSeuilMin').value);
    const duree = parseInt(document.getElementById('autoDuree').value);
    const delaiMin = parseInt(document.getElementById('autoDelai').value);
    
    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }
    
    if (isNaN(seuilMin) || isNaN(duree) || isNaN(delaiMin)) {
        alert('❌ Veuillez remplir tous les champs avec des valeurs valides');
        return;
    }
    
    if (seuilMin < 0 || seuilMin > 100) {
        alert('❌ Le seuil doit être entre 0 et 100%');
        return;
    }
    
    database.ref('/arrosage/automatique').update({
        seuilMin: seuilMin,
        duree: duree,
        delaiMin: delaiMin
    })
    .then(() => {
        alert(`✅ Configuration automatique sauvegardée:\n• Seuil: ${seuilMin}%\n• Durée: ${duree}s\n• Délai min: ${delaiMin}min`);
        console.log('✅ Config auto mise à jour:', { seuilMin, duree, delaiMin });
    })
    .catch(err => {
        console.error('❌ Erreur sauvegarde:', err);
        alert('❌ Erreur lors de la sauvegarde');
    });
}

// ============================================
// CONTRÔLE MANUEL
// ============================================
function toggleManualPump() {
    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }
    
    const pompeActive = firebaseData.systeme?.pompeActive || false;
    const duree = parseInt(document.getElementById('manualDuree').value) || 5;
    
    if (!pompeActive) {
        // Démarrer l'arrosage manuel
        database.ref('/commandes').update({
            activerPompe: true,
            mode: 'manuel',
            dureeManuelle: duree
        })
        .then(() => {
            console.log('💧 Arrosage manuel démarré');
            // L'Arduino gérera la durée et désactivera automatiquement
        })
        .catch(err => {
            console.error('❌ Erreur:', err);
            alert('❌ Erreur de connexion Firebase');
        });
    } else {
        // Arrêter l'arrosage manuel
        database.ref('/commandes').update({
            activerPompe: false
        })
        .then(() => {
            console.log('⏸️ Arrosage manuel arrêté');
        })
        .catch(err => {
            console.error('❌ Erreur:', err);
        });
    }
}

function updateManualDuration() {
    const duree = parseInt(document.getElementById('manualDuree').value) || 5;
    const display = document.getElementById('manualDurationDisplay');
    if (display) {
        display.textContent = duree + ' seconde' + (duree > 1 ? 's' : '');
    }
}

function updatePumpStatus() {
    const pompeActive = firebaseData.systeme?.pompeActive || false;
    
    // Mise à jour du badge de statut
    const badge = document.getElementById('pumpStatusBadge');
    if (badge) {
        if (pompeActive) {
            badge.innerHTML = '<span class="status-badge status-success">✅ Pompe Active</span>';
        } else {
            badge.innerHTML = '<span class="status-badge status-info">⏸️ En Attente</span>';
        }
    }
    
    // Mise à jour du panneau manuel
    if (currentWateringMode === 'manuel') {
        const icon = document.getElementById('pumpIcon');
        const statusText = document.getElementById('pumpStatusText');
        const btn = document.getElementById('btnTogglePump');
        
        if (pompeActive) {
            if (icon) icon.textContent = '💧';
            if (statusText) statusText.textContent = 'Pompe Active - Arrosage en cours';
            if (btn) {
                btn.innerHTML = '<span style="font-size: 24px;">⏸️</span><span>Arrêter l\'Arrosage</span>';
                btn.style.background = 'var(--danger)';
            }
        } else {
            if (icon) icon.textContent = '💧';
            if (statusText) statusText.textContent = 'Pompe Désactivée';
            if (btn) {
                btn.innerHTML = '<span style="font-size: 24px;">▶️</span><span>Démarrer l\'Arrosage</span>';
                btn.style.background = 'var(--primary)';
            }
        }
    }
}

// ============================================
// CONFIGURATION MODE PROGRAMMÉ
// ============================================
function saveScheduledConfig() {
    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }
    
    const prog1 = {
        actif: document.getElementById('prog1Toggle').classList.contains('active'),
        heure: parseInt(document.getElementById('prog1Heure').value),
        minute: parseInt(document.getElementById('prog1Minute').value),
        duree: parseInt(document.getElementById('prog1Duree').value)
    };
    
    const prog2 = {
        actif: document.getElementById('prog2Toggle').classList.contains('active'),
        heure: parseInt(document.getElementById('prog2Heure').value),
        minute: parseInt(document.getElementById('prog2Minute').value),
        duree: parseInt(document.getElementById('prog2Duree').value)
    };
    
    // Validation
    if (isNaN(prog1.heure) || isNaN(prog1.minute) || isNaN(prog1.duree) ||
        isNaN(prog2.heure) || isNaN(prog2.minute) || isNaN(prog2.duree)) {
        alert('❌ Veuillez remplir tous les champs avec des valeurs valides');
        return;
    }
    
    database.ref('/arrosage/programme').update({
        prog1: prog1,
        prog2: prog2
    })
    .then(() => {
        let message = '✅ Programmes sauvegardés:\n\n';
        if (prog1.actif) {
            message += `Programme 1: ${String(prog1.heure).padStart(2,'0')}:${String(prog1.minute).padStart(2,'0')} (${prog1.duree}s)\n`;
        }
        if (prog2.actif) {
            message += `Programme 2: ${String(prog2.heure).padStart(2,'0')}:${String(prog2.minute).padStart(2,'0')} (${prog2.duree}s)`;
        }
        if (!prog1.actif && !prog2.actif) {
            message += 'Aucun programme actif';
        }
        alert(message);
        console.log('✅ Programmes mis à jour:', { prog1, prog2 });
    })
    .catch(err => {
        console.error('❌ Erreur sauvegarde:', err);
        alert('❌ Erreur lors de la sauvegarde');
    });
}

// ============================================
// MISE À JOUR UI ARROSAGE
// ============================================
function updateWateringUI() {
    const config = firebaseData.arrosage || {};
    
    // Mode automatique
    if (config.automatique) {
        const autoSeuilMin = document.getElementById('autoSeuilMin');
        const autoDuree = document.getElementById('autoDuree');
        const autoDelai = document.getElementById('autoDelai');
        
        if (autoSeuilMin) autoSeuilMin.value = config.automatique.seuilMin || 30;
        if (autoDuree) autoDuree.value = config.automatique.duree || 5;
        if (autoDelai) autoDelai.value = config.automatique.delaiMin || 60;
    }
    
    // Mode manuel
    if (config.manuel) {
        const manualDuree = document.getElementById('manualDuree');
        if (manualDuree) manualDuree.value = config.manuel.duree || 5;
        updateManualDuration();
    }
    
    // Mode programmé
    if (config.programme) {
        // Programme 1
        if (config.programme.prog1) {
            const p1 = config.programme.prog1;
            const prog1Heure = document.getElementById('prog1Heure');
            const prog1Minute = document.getElementById('prog1Minute');
            const prog1Duree = document.getElementById('prog1Duree');
            const prog1Toggle = document.getElementById('prog1Toggle');
            
            if (prog1Heure) prog1Heure.value = p1.heure || 7;
            if (prog1Minute) prog1Minute.value = p1.minute || 0;
            if (prog1Duree) prog1Duree.value = p1.duree || 5;
            if (prog1Toggle) {
                if (p1.actif) prog1Toggle.classList.add('active');
                else prog1Toggle.classList.remove('active');
            }
        }
        
        // Programme 2
        if (config.programme.prog2) {
            const p2 = config.programme.prog2;
            const prog2Heure = document.getElementById('prog2Heure');
            const prog2Minute = document.getElementById('prog2Minute');
            const prog2Duree = document.getElementById('prog2Duree');
            const prog2Toggle = document.getElementById('prog2Toggle');
            
            if (prog2Heure) prog2Heure.value = p2.heure || 18;
            if (prog2Minute) prog2Minute.value = p2.minute || 0;
            if (prog2Duree) prog2Duree.value = p2.duree || 5;
            if (prog2Toggle) {
                if (p2.actif) prog2Toggle.classList.add('active');
                else prog2Toggle.classList.remove('active');
            }
        }
    }
}

// ============================================
// HISTORIQUE D'ARROSAGE
// ============================================
function updateWateringHistory(data) {
    const tbody = document.getElementById('wateringHistory');
    if (!tbody) return;
    
    if (!data || Object.keys(data).length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">Aucun historique disponible</td></tr>';
        return;
    }
    
    let html = '';
    const entries = Object.entries(data).sort((a, b) => b[1].timestamp - a[1].timestamp).slice(0, 10);
    
    entries.forEach(([key, entry]) => {
        const date = new Date(entry.timestamp * 1000);
        const dateStr = date.toLocaleDateString('fr-FR');
        const timeStr = date.toLocaleTimeString('fr-FR');
        
        const modeText = entry.mode === 'automatique' ? '🤖 Auto' : 
                        entry.mode === 'manuel' ? '👆 Manuel' : 
                        '⏰ Programmé';
        
        const statusClass = entry.reussi ? 'status-success' : 'status-warning';
        const statusText = entry.reussi ? '✅ Réussi' : '⚠️ Erreur';
        
        html += `
            <tr>
                <td>${dateStr} ${timeStr}</td>
                <td>${modeText}</td>
                <td>${entry.duree || 0}s</td>
                <td>${entry.humiditeSolAvant || 0}%</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            </tr>`;
    });
    
    tbody.innerHTML = html;
    
    // Calculer les statistiques
    calculateWateringStats(data);
}

function calculateWateringStats(data) {
    if (!data) return;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const weekStart = todayStart - (7 * 24 * 60 * 60);
    const monthStart = todayStart - (30 * 24 * 60 * 60);
    
    let todayCount = 0, todayVolume = 0;
    let weekCount = 0, weekVolume = 0;
    let monthVolume = 0;
    let totalDuration = 0, totalCount = 0;
    
    Object.values(data).forEach(entry => {
        const timestamp = entry.timestamp || 0;
        const duree = entry.duree || 5;
        const volume = (duree / 60) * 4; // Environ 4L/min
        
        totalDuration += duree;
        totalCount++;
        
        if (timestamp >= todayStart) {
            todayCount++;
            todayVolume += volume;
        }
        if (timestamp >= weekStart) {
            weekCount++;
            weekVolume += volume;
        }
        if (timestamp >= monthStart) {
            monthVolume += volume;
        }
    });
    
    // Mise à jour UI
    const waterToday = document.getElementById('waterToday');
    const waterTodayCount = document.getElementById('waterTodayCount');
    const waterWeek = document.getElementById('waterWeek');
    const waterMonth = document.getElementById('waterMonth');
    const waterAvgDuration = document.getElementById('waterAvgDuration');
    
    if (waterToday) waterToday.textContent = todayVolume.toFixed(1) + 'L';
    if (waterTodayCount) waterTodayCount.textContent = todayCount + ' arrosage' + (todayCount > 1 ? 's' : '');
    if (waterWeek) waterWeek.textContent = weekVolume.toFixed(1) + 'L';
    if (waterMonth) waterMonth.textContent = monthVolume.toFixed(1) + 'L';
    if (waterAvgDuration && totalCount > 0) {
        waterAvgDuration.textContent = Math.round(totalDuration / totalCount) + 's';
    }
}

// ============================================
// MISE À JOUR UI CONFIGURATION
// ============================================
function updateConfigurationUI() {
    const config = firebaseData.configuration || {};
    
    const seuilMinInput = document.getElementById('seuilMin');
    const seuilMaxInput = document.getElementById('seuilMax');
    const tempMaxInput = document.getElementById('tempMax');
    
    if (seuilMinInput) seuilMinInput.value = config.seuilHumiditeBas || 30;
    if (seuilMaxInput) seuilMaxInput.value = config.seuilHumiditeHaut || 70;
    if (tempMaxInput) tempMaxInput.value = 35;
}

// ============================================
// MISE À JOUR UI SYSTÈME
// ============================================
function updateSystemDisplay() {
    const systeme = firebaseData.systeme || {};
    
    // Mise à jour du mode
    if (systeme.mode) {
        currentWateringMode = systeme.mode;
        updateModeDisplay();
    }
    
    // Mise à jour des alertes si maladie détectée
    if (systeme.maladieDetectee) {
        console.log('🩺 Maladie détectée:', systeme.typeMaladie);
    }
}

// ============================================
// MÉTÉO
// ============================================
async function loadWeatherData() {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.weatherLatitude}&longitude=${CONFIG.weatherLongitude}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,precipitation,windspeed_10m&timezone=${CONFIG.weatherTimezone}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur: ${response.status}`);
        weatherData = await response.json();
        updateWeatherUI();
    } catch (error) {
        console.error('❌ Météo:', error);
    }
}

function updateWeatherUI() {
    if (!weatherData) return;
    const current = weatherData.current_weather;
    const temp = Math.round(current.temperature);
    const windSpeed = Math.round(current.windspeed);
    
    const weatherWidget = document.querySelector('.weather-widget');
    if (weatherWidget) {
        weatherWidget.innerHTML = `
            <h3>☀️ Météo - ${CONFIG.weatherCity}</h3>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div><div class="weather-temp">${temp}°C</div></div>
                <div class="weather-details">
                    <div class="weather-item">
                        <div>💨 Vent</div>
                        <div><b>${windSpeed} km/h</b></div>
                    </div>
                </div>
            </div>`;
    }
}

// ============================================
// CHANGEMENT PLAGE TEMPORELLE
// ============================================
function changeTimeRange(range) {
    currentTimeRange = range;
    console.log('📅 Plage:', range);
    document.querySelectorAll('#analyse .btn-secondary').forEach(btn => btn.style.opacity = '0.7');
    event.target.style.opacity = '1';
    updateChartsWithRealData();
}

// ============================================
// CALCUL SANTÉ GLOBALE
// ============================================
function calculateGlobalHealth() {
    const capteurs = firebaseData.capteurs || {};
    const systeme = firebaseData.systeme || {};
    const config = firebaseData.configuration || {};
    
    let score = 100, issues = [];
    
    const seuilMin = config.seuilHumiditeBas || 30;
    const seuilMax = config.seuilHumiditeHaut || 70;
    
    // Vérification humidité sol
    if (capteurs.humiditeSol < 20) {
        score -= 30;
        issues.push({ 
            type: 'danger', 
            message: '🚨 Sol TRÈS sec - CRITIQUE !', 
            detail: `Humidité: ${capteurs.humiditeSol}% (Seuil critique: 20%)` 
        });
    } else if (capteurs.humiditeSol < seuilMin) {
        score -= 20;
        issues.push({ 
            type: 'warning', 
            message: '⚠️ Sol sec - Arrosage recommandé', 
            detail: `Humidité: ${capteurs.humiditeSol}% (Seuil min: ${seuilMin}%)` 
        });
    } else if (capteurs.humiditeSol > seuilMax) {
        score -= 10;
        issues.push({ 
            type: 'warning', 
            message: '💧 Sol trop humide', 
            detail: `Humidité: ${capteurs.humiditeSol}% (Seuil max: ${seuilMax}%)` 
        });
    }
    
    // Vérification température
    if (capteurs.temperature < 10 || capteurs.temperature > 35) {
        score -= 15;
        issues.push({ 
            type: 'warning', 
            message: '🌡️ Température extrême', 
            detail: `Température: ${capteurs.temperature.toFixed(1)}°C` 
        });
    }
    
    // Vérification humidité air
    if (capteurs.humiditeAir < 30 || capteurs.humiditeAir > 90) {
        score -= 10;
        issues.push({ 
            type: 'warning', 
            message: '💨 Humidité air inadaptée', 
            detail: `Humidité air: ${capteurs.humiditeAir}%` 
        });
    }
    
    // Vérification maladies
    if (systeme.maladieDetectee) {
        score -= 30;
        issues.push({ 
            type: 'danger', 
            message: '🩺 Maladie détectée !', 
            detail: systeme.typeMaladie || 'Type inconnu - Vérification recommandée' 
        });
    }
    
    score = Math.max(0, Math.min(100, score));
    updateHealthDisplay(score, issues);
    return { score, issues };
}

function updateHealthDisplay(score, issues) {
    // Mise à jour du score de santé
    const healthElements = document.querySelectorAll('.card-value');
    healthElements.forEach((element, index) => {
        const title = element.parentElement?.querySelector('.card-title');
        if (title && (title.textContent.includes('Score') || title.textContent.includes('Santé'))) {
            element.textContent = score + '%';
            element.style.color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
            const statusElement = element.nextElementSibling;
            if (statusElement) {
                statusElement.textContent = score >= 80 ? '✅ Excellent' : score >= 60 ? '⚠️ Correct' : '🚨 Attention requise';
            }
        }
    });
    
    displayAlerts(issues);
    
    const avgHealthElement = document.getElementById('avgHealth');
    if (avgHealthElement) {
        avgHealthElement.textContent = score + '%';
        avgHealthElement.style.color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
    }
    
    const healthTrendElement = document.getElementById('healthTrend');
    if (healthTrendElement) {
        healthTrendElement.textContent = score >= 80 ? '📈 Excellent état' : 
                                        score >= 60 ? '📊 État correct' : '📉 Nécessite attention';
        healthTrendElement.style.color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
    }
}

function displayAlerts(issues) {
    const alertsContainer = document.getElementById('alertsContainer');
    if (!alertsContainer) return;
    
    if (issues.length === 0) {
        alertsContainer.innerHTML = `
            <div class="alert alert-info">
                <span style="font-size: 24px;">✅</span>
                <div>
                    <strong>Système OK - Aucune alerte</strong>
                    <p style="margin-top: 5px; color: var(--text-secondary);">
                        Toutes les valeurs sont dans les plages normales. La surveillance continue.
                    </p>
                </div>
            </div>`;
        return;
    }
    
    let html = '';
    issues.forEach(issue => {
        const icon = issue.type === 'danger' ? '🚨' : '⚠️';
        html += `
            <div class="alert alert-${issue.type}">
                <span style="font-size: 24px;">${icon}</span>
                <div>
                    <strong>${issue.message}</strong>
                    <p style="margin-top: 5px; color: var(--text-secondary);">${issue.detail}</p>
                </div>
            </div>`;
    });
    alertsContainer.innerHTML = html;
}

// ============================================
// MISE À JOUR CAPTEURS
// ============================================
function updateSensorCards() {
    const capteurs = firebaseData.capteurs || {};
    console.log('📊 Mise à jour UI - Capteurs:', capteurs);
    
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        const title = card.querySelector('.card-title');
        if (!title) return;
        const titleText = title.textContent;
        const valueElement = card.querySelector('.card-value');
        const statusElement = card.querySelector('.status-badge, .card-label');
        
        // Humidité du Sol
        if (titleText.includes('Humidité Sol') || titleText.includes('Humidité du Sol')) {
            const humiditeSol = capteurs.humiditeSol !== undefined ? capteurs.humiditeSol : 0;
            if (valueElement) {
                valueElement.textContent = humiditeSol + '%';
                valueElement.style.color = humiditeSol < 30 ? 'var(--danger)' : 
                                          humiditeSol > 70 ? 'var(--info)' : 'var(--success)';
            }
            if (statusElement) {
                const status = humiditeSol < 30 ? { text: '⚠️ Sol Sec', class: 'status-warning' } : 
                               humiditeSol > 70 ? { text: '💧 Humide', class: 'status-info' } :
                               { text: '✅ Optimal', class: 'status-success' };
                statusElement.textContent = status.text;
                if (statusElement.className.includes('status-badge')) {
                    statusElement.className = 'status-badge ' + status.class;
                }
            }
        }
        
        // Température
        if (titleText.includes('Température')) {
            const temperature = capteurs.temperature !== undefined ? capteurs.temperature : 0;
            if (valueElement) {
                valueElement.textContent = temperature.toFixed(1) + '°C';
                valueElement.style.color = temperature < 10 || temperature > 35 ? 'var(--warning)' : 'var(--success)';
            }
            if (statusElement) {
                const status = temperature === 0 ? { text: 'Chargement...', class: 'status-info' } :
                               temperature < 10 || temperature > 35 ? { text: '⚠️ Extrême', class: 'status-warning' } :
                               { text: '✅ Normal', class: 'status-success' };
                statusElement.textContent = status.text;
                if (statusElement.className.includes('status-badge')) {
                    statusElement.className = 'status-badge ' + status.class;
                }
            }
        }
        
        // Humidité Air
        if (titleText.includes('Humidité Air')) {
            const humiditeAir = capteurs.humiditeAir !== undefined ? capteurs.humiditeAir : 0;
            if (valueElement) {
                valueElement.textContent = humiditeAir + '%';
                valueElement.style.color = humiditeAir < 40 || humiditeAir > 80 ? 'var(--warning)' : 'var(--success)';
            }
            if (statusElement && !statusElement.className.includes('card-icon')) {
                const status = humiditeAir < 40 ? { text: 'Air Sec', class: 'status-warning' } :
                               humiditeAir > 80 ? { text: 'Très Humide', class: 'status-info' } :
                               { text: 'Normal', class: 'status-success' };
                statusElement.textContent = status.text;
                if (statusElement.className.includes('status-badge')) {
                    statusElement.className = 'status-badge ' + status.class;
                }
            }
        }
        
        // Pluie
        if (titleText.includes('Pluie')) {
            const pluie = capteurs.pluie !== undefined ? capteurs.pluie : 0;
            if (valueElement) {
                valueElement.textContent = pluie + '%';
                valueElement.style.color = pluie > 50 ? 'var(--info)' : 'var(--text-primary)';
            }
            if (statusElement && !statusElement.className.includes('card-icon')) {
                const status = pluie > 50 ? { text: '🌧️ Pluie détectée', class: 'status-info' } :
                               { text: 'Pas de pluie', class: 'status-success' };
                statusElement.textContent = status.text;
                if (statusElement.className.includes('card-label')) {
                    statusElement.textContent = status.text;
                }
            }
        }
    });
    
    updateHomePageSensors(capteurs);
    updatePlantsPageSensors(capteurs);
}

function updateHomePageSensors(capteurs) {
    // Humidité Air
    const homeHumiditeAir = document.getElementById('homeHumiditeAir');
    const homeHumiditeAirStatus = document.getElementById('homeHumiditeAirStatus');
    if (homeHumiditeAir) {
        const ha = capteurs.humiditeAir || 0;
        homeHumiditeAir.textContent = ha + '%';
        homeHumiditeAir.style.color = ha < 40 || ha > 80 ? 'var(--warning)' : 'var(--success)';
    }
    if (homeHumiditeAirStatus) {
        const ha = capteurs.humiditeAir || 0;
        homeHumiditeAirStatus.textContent = ha < 40 ? 'Air Sec' : ha > 80 ? 'Très Humide' : 'Normal';
    }
    
    // Humidité Sol
    const homeHumiditeSol = document.getElementById('homeHumiditeSol');
    const homeHumiditeSolStatus = document.getElementById('homeHumiditeSolStatus');
    if (homeHumiditeSol) {
        const hs = capteurs.humiditeSol || 0;
        homeHumiditeSol.textContent = hs + '%';
        homeHumiditeSol.style.color = hs < 30 ? 'var(--danger)' : hs > 70 ? 'var(--info)' : 'var(--success)';
    }
    if (homeHumiditeSolStatus) {
        const hs = capteurs.humiditeSol || 0;
        homeHumiditeSolStatus.textContent = hs < 30 ? '⚠️ Sol Sec' : hs > 70 ? '💧 Humide' : '✅ Optimal';
    }
    
    // Température
    const homeTemperature = document.getElementById('homeTemperature');
    const homeTemperatureStatus = document.getElementById('homeTemperatureStatus');
    if (homeTemperature) {
        const temp = capteurs.temperature || 0;
        homeTemperature.textContent = temp.toFixed(1) + '°C';
        homeTemperature.style.color = temp < 10 || temp > 35 ? 'var(--warning)' : 'var(--success)';
    }
    if (homeTemperatureStatus) {
        const temp = capteurs.temperature || 0;
        homeTemperatureStatus.textContent = temp === 0 ? 'Chargement...' :
                                           temp < 10 || temp > 35 ? '⚠️ Extrême' : '✅ Normal';
    }
    
    // Pluie
    const homePluie = document.getElementById('homePluie');
    const homePluieStatus = document.getElementById('homePluieStatus');
    if (homePluie) {
        const pluie = capteurs.pluie || 0;
        homePluie.textContent = pluie + '%';
        homePluie.style.color = pluie > 50 ? 'var(--info)' : 'var(--text-primary)';
    }
    if (homePluieStatus) {
        const pluie = capteurs.pluie || 0;
        homePluieStatus.textContent = pluie > 50 ? '🌧️ Pluie détectée' : 'Pas de pluie';
    }
}

function updatePlantsPageSensors(capteurs) {
    const plant1Humidity = document.getElementById('plant1-humidity');
    const plant1Temp = document.getElementById('plant1-temp');
    if (plant1Humidity) plant1Humidity.textContent = (capteurs.humiditeSol || 0) + '%';
    if (plant1Temp) plant1Temp.textContent = (capteurs.temperature || 0).toFixed(1) + '°C';
    
    const plant2Humidity = document.getElementById('plant2-humidity');
    const plant2Temp = document.getElementById('plant2-temp');
    if (plant2Humidity) plant2Humidity.textContent = (capteurs.humiditeSol || 0) + '%';
    if (plant2Temp) plant2Temp.textContent = (capteurs.temperature || 0).toFixed(1) + '°C';
}

// ============================================
// GRAPHIQUES
// ============================================
function initCharts() {
    const chartConfig = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#f1f5f9' } } },
        scales: {
            y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
    };
    
    const moistureCtx = document.getElementById('moistureChart');
    if (moistureCtx) {
        charts.moisture = new Chart(moistureCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Humidité Sol (%)',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: chartConfig
        });
    }
    
    const tempCtx = document.getElementById('tempChart');
    if (tempCtx) {
        charts.temp = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { 
                        label: 'Température (°C)', 
                        data: [], 
                        borderColor: '#f59e0b', 
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4
                    },
                    { 
                        label: 'Humidité Air (%)', 
                        data: [], 
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                        yAxisID: 'y1',
                        tension: 0.4
                    }
                ]
            },
            options: {
                ...chartConfig,
                scales: {
                    y: { 
                        type: 'linear', 
                        position: 'left', 
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y1: { 
                        type: 'linear', 
                        position: 'right', 
                        ticks: { color: '#94a3b8' }, 
                        grid: { display: false } 
                    },
                    x: { 
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }
    
    const healthCtx = document.getElementById('healthChart');
    if (healthCtx) {
        charts.health = new Chart(healthCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Score Santé (%)',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: { 
                ...chartConfig, 
                scales: { 
                    ...chartConfig.scales, 
                    y: { ...chartConfig.scales.y, min: 0, max: 100 } 
                } 
            }
        });
    }
    
    const waterCtx = document.getElementById('waterChart');
    if (waterCtx) {
        charts.water = new Chart(waterCtx, {
            type: 'doughnut',
            data: {
                labels: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
                datasets: [{
                    data: [120, 85, 65, 42],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)', 
                        'rgba(59, 130, 246, 0.8)', 
                        'rgba(245, 158, 11, 0.8)', 
                        'rgba(139, 92, 246, 0.8)'
                    ]
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { 
                        position: 'right', 
                        labels: { color: '#f1f5f9' } 
                    } 
                } 
            }
        });
    }
}

function updateChartsWithRealData() {
    if (!database) {
        console.log('⚠️ Firebase non connecté');
        return;
    }
    
    let limitPoints = currentTimeRange === 'realtime' ? 24 : 
                     currentTimeRange === 'week' ? 168 : 
                     currentTimeRange === 'month' ? 720 : 2160;
    
    console.log(`📊 Chargement historique Firebase (${limitPoints} points)`);
    
    database.ref('/historique').limitToLast(limitPoints).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data || Object.keys(data).length === 0) {
            console.log('⚠️ Aucun historique trouvé');
            updateChartsWithCurrentData();
            return;
        }
        
        const timestamps = [], soilHumidity = [], temperature = [], airHumidity = [], healthScores = [];
        
        Object.keys(data).sort().forEach(key => {
            const entry = data[key];
            const date = new Date(entry.timestamp * 1000);
            
            let label;
            if (currentTimeRange === 'realtime') {
                label = date.getHours() + 'h' + String(date.getMinutes()).padStart(2, '0');
            } else if (currentTimeRange === 'week') {
                label = date.getDate() + '/' + (date.getMonth() + 1) + ' ' + date.getHours() + 'h';
            } else {
                label = date.getDate() + '/' + (date.getMonth() + 1);
            }
            
            timestamps.push(label);
            soilHumidity.push(entry.humiditeSol || 0);
            temperature.push(entry.temperature || 0);
            airHumidity.push(entry.humiditeAir || 0);
            
            let score = 100;
            if (entry.humiditeSol < 30) score -= 20;
            if (entry.temperature < 10 || entry.temperature > 35) score -= 15;
            healthScores.push(score);
        });
        
        console.log(`✅ ${timestamps.length} points chargés`);
        
        if (charts.moisture) {
            charts.moisture.data.labels = timestamps;
            charts.moisture.data.datasets[0].data = soilHumidity;
            charts.moisture.update('none');
        }
        
        if (charts.temp) {
            charts.temp.data.labels = timestamps;
            charts.temp.data.datasets[0].data = temperature;
            charts.temp.data.datasets[1].data = airHumidity;
            charts.temp.update('none');
        }
        
        if (charts.health) {
            charts.health.data.labels = timestamps;
            charts.health.data.datasets[0].data = healthScores;
            charts.health.update('none');
        }
        
    }).catch(error => {
        console.error('❌ Erreur historique:', error);
        updateChartsWithCurrentData();
    });
}

function updateChartsWithCurrentData() {
    const capteurs = firebaseData.capteurs || {};
    const timestamps = [], soilHumidity = [], temperature = [], airHumidity = [], healthScores = [];
    
    for (let i = 0; i < 24; i++) {
        const date = new Date();
        date.setHours(date.getHours() - (24 - i));
        timestamps.push(date.getHours() + 'h');
        soilHumidity.push(capteurs.humiditeSol + (Math.random() * 10 - 5));
        temperature.push(capteurs.temperature + (Math.random() * 5 - 2.5));
        airHumidity.push(capteurs.humiditeAir + (Math.random() * 10 - 5));
        healthScores.push(85 + (Math.random() * 15 - 7.5));
    }
    
    if (charts.moisture) {
        charts.moisture.data.labels = timestamps;
        charts.moisture.data.datasets[0].data = soilHumidity;
        charts.moisture.update('none');
    }
    if (charts.temp) {
        charts.temp.data.labels = timestamps;
        charts.temp.data.datasets[0].data = temperature;
        charts.temp.data.datasets[1].data = airHumidity;
        charts.temp.update('none');
    }
    if (charts.health) {
        charts.health.data.labels = timestamps;
        charts.health.data.datasets[0].data = healthScores;
        charts.health.update('none');
    }
}

// ============================================
// CONTRÔLES
// ============================================
function updateDashboard() {
    console.log('🔄 Dashboard actualisé');
}

function updateSystemStatus(system, status) {
    const element = document.getElementById(system + 'Status');
    if (!element) return;
    element.textContent = status === 'connected' ? '✅ Connecté' : '⚠️ Déconnecté';
    element.className = 'status-badge ' + (status === 'connected' ? 'status-success' : 'status-danger');
}

function showPage(pageId) {
    console.log('📄 Navigation vers:', pageId);
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');
    
    const navItem = event?.target?.closest('.nav-item');
    if (navItem) navItem.classList.add('active');
    
    // Actualiser selon la page
    if (pageId === 'analyse') {
        setTimeout(updateChartsWithRealData, 300);
    } else if (pageId === 'watering') {
        updateModeDisplay();
        showModePanel(currentWateringMode);
    }
}

function saveThresholds() {
    const seuilMin = document.getElementById('seuilMin')?.value;
    const seuilMax = document.getElementById('seuilMax')?.value;
    
    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }
    
    if (seuilMin && seuilMax) {
        const min = parseInt(seuilMin);
        const max = parseInt(seuilMax);
        
        if (min >= max) {
            alert('❌ Le seuil minimum doit être inférieur au maximum');
            return;
        }
        
        database.ref('/configuration').update({
            seuilHumiditeBas: min,
            seuilHumiditeHaut: max
        })
        .then(() => {
            alert(`✅ Seuils sauvegardés:\n• Minimum: ${min}%\n• Maximum: ${max}%`);
            console.log('✅ Seuils mis à jour:', { min, max });
        })
        .catch(err => {
            console.error('❌ Erreur:', err);
            alert('❌ Erreur lors de la sauvegarde');
        });
    } else {
        alert('❌ Veuillez remplir tous les champs');
    }
}

function exportData(format) {
    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }
    
    alert(`📥 Préparation export ${format.toUpperCase()}...`);
    
    database.ref('/').once('value', (snapshot) => {
        const data = snapshot.val();
        console.log('📊 Données à exporter:', data);
        alert(`📥 Export ${format.toUpperCase()} - Fonctionnalité à venir !`);
    }).catch(err => {
        console.error('❌ Erreur export:', err);
        alert('❌ Erreur lors de l\'export');
    });
}

// ============================================
// ANALYSE D'IMAGE (remplacer l'ancienne analyzeImage)
// ============================================
// ==============================
// ROBoflow upload + analyse (robuste)
// Remplace toute ancienne implémentation d'analyseWithRoboflow/analyzeImage
// ==============================

/**
 * Envoi et lecture réponse Roboflow (avec timeout et retour structuré)
 * @param {File} file
 * @returns {Object} { ok: boolean, status, body, error }
 */
async function analyzeWithRoboflow(file) {
  const resultsDiv = document.getElementById('results');
  const controller = new AbortController();
  const timeoutMs = 20000; // 20s
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log('📤 Envoi au Roboflow:', file.name, file.size, 'bytes');

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(ROBofLOW_API_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(t);

    // Toujours lire le corps pour debug, même si erreur HTTP
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch(e) { /* non JSON */ }

    console.log('🔁 Roboflow status:', res.status, res.statusText);

    if (!res.ok) {
      console.error('❌ Roboflow réponse erreur:', res.status, text);
      return { ok: false, status: res.status, body: text };
    }

    return { ok: true, status: res.status, body: json || text };
  } catch (err) {
    clearTimeout(t);
    console.error('❌ Erreur fetch Roboflow:', err);
    const message = err.name === 'AbortError' ? 'Timeout - requête stoppée.' : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Analyse d'image (appelée depuis l'UI)
 * Remplace/écrase toute ancienne analyzeImage(files)
 */
async function analyzeImage(files) {
  if (!files || files.length === 0) return;
  console.log('📸 Analyse image (Roboflow) ...');

  const file = files[0];
  const resultsDiv = document.getElementById('results');

  // Affichage "loading"
  if (resultsDiv) {
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `
      <div class="card">
        <h3>🔬 Analyse en cours...</h3>
        <div class="loading-spinner"></div>
        <p style="margin-top: 15px; color: var(--text-secondary);">Envoi au modèle Roboflow...</p>
      </div>`;
  }

  // Appel Roboflow
  const rf = await analyzeWithRoboflow(file);

  if (!rf || !rf.ok) {
    const msg = rf && (rf.error || rf.body) ? (rf.error || rf.body) : 'Erreur inconnue';
    console.warn('Analyse échouée:', msg);

    if (resultsDiv) {
      resultsDiv.innerHTML = `
        <div class="card">
          <h3 style="color: var(--danger);">❌ Erreur d'analyse</h3>
          <p style="margin-top:10px;color:var(--text-secondary);">${escapeHtml(String(msg))}</p>
          <p style="font-size:12px;color:var(--text-secondary);">Vérifie la console DevTools (Network & Console). Si l'erreur mentionne CORS, utilise un proxy serveur.</p>
        </div>`;
    }
    return;
  }

  // Parse résultat
  const rfResult = rf.body;
  const predictions = rfResult && rfResult.predictions ? rfResult.predictions : [];
  const top = predictions.length > 0 ? predictions[0] : null;
  const className = top ? (top.class || top.label || 'Inconnu') : 'Inconnu';
  const confidence = top ? (top.confidence || top.confidence_score || top.probability || 0) : 0;
  const confPct = (Number(confidence) * 100).toFixed(1);

  // Afficher à l'utilisateur
  if (resultsDiv) {
    resultsDiv.innerHTML = `
      <div class="card">
        <h3 style="color: var(--success);">✅ Analyse terminée</h3>
        <p style="margin-top:10px;color:var(--text-secondary);">
          <strong>Classe détectée :</strong> ${escapeHtml(className)} <br/>
          <strong>Confiance :</strong> ${confPct}% <br/>
        </p>
        <div style="margin-top:10px;">
          <button class="btn btn-secondary" onclick="document.getElementById('results').style.display='none'">Fermer</button>
        </div>
      </div>`;
  }

  // Mise à jour Firebase (optionnelle)
  try {
    const diseaseDetected = top && className.toLowerCase() !== 'healthy' && Number(confidence) >= 0.4;
    const typeMaladie = diseaseDetected ? className : '';

    firebaseData.systeme.maladieDetectee = diseaseDetected;
    firebaseData.systeme.typeMaladie = typeMaladie;

    if (database) {
      database.ref('/systeme').update({
        maladieDetectee: diseaseDetected,
        typeMaladie: typeMaladie,
        dernierScanIA: Date.now()
      }).then(() => {
        console.log('✅ Résultat IA sauvegardé dans Firebase:', { diseaseDetected, typeMaladie });
      }).catch(err => {
        console.warn('⚠️ Impossible sauvegarder résultat IA:', err);
      });
    }
  } catch (err) {
    console.error('❌ Erreur sauvegarde résultat IA:', err);
  }
}

// helper safe
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}



// ============================================
// EXPORT FONCTIONS GLOBALES
// ============================================
window.showPage = showPage;
window.analyzeImage = analyzeImage;
window.saveThresholds = saveThresholds;
window.exportData = exportData;
window.changeTimeRange = changeTimeRange;
window.setWateringMode = setWateringMode;
window.saveAutomaticConfig = saveAutomaticConfig;
window.toggleManualPump = toggleManualPump;
window.updateManualDuration = updateManualDuration;
window.saveScheduledConfig = saveScheduledConfig;

console.log('✅ SmartPlant Dashboard - 3 Modes d\'Arrosage - Prêt !')
/* ============================================
   GESTION DES PLANTS DE TOMATES - FIREBASE
   ============================================ */

// Variables globales pour les plants
let plantsData = {};
let currentEditingPlantId = null;
let currentDetailsPlantId = null;

// ============================================
// INITIALISATION - ÉCOUTE FIREBASE
// ============================================
function initPlantsModule() {
    if (!database) {
        console.error('❌ Firebase non disponible pour le module plants');
        return;
    }

    // Écouter les plants en temps réel
    database.ref('/plants').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            plantsData = data;
            console.log('🌱 Plants chargés:', Object.keys(data).length);
            updatePlantsDisplay();
        } else {
            plantsData = {};
            showNoPlantsMessage();
        }
    }, (error) => {
        console.error('❌ Erreur chargement plants:', error);
    });

    // Mettre à jour l'environnement
    updateEnvironmentDisplay();
}

// ============================================
// AFFICHAGE DES PLANTS
// ============================================
function updatePlantsDisplay() {
    const container = document.getElementById('plantsContainer');
    const noMessage = document.getElementById('noPlantsMessage');
    
    if (!container) return;

    const plantsList = Object.entries(plantsData);
    
    if (plantsList.length === 0) {
        showNoPlantsMessage();
        return;
    }

    // Cacher le message "aucun plant"
    if (noMessage) noMessage.style.display = 'none';

    // Appliquer les filtres et tri
    let filteredPlants = applyFiltersAndSort(plantsList);

    // Générer le HTML
    let html = '';
    filteredPlants.forEach(([plantId, plant]) => {
        html += generatePlantCard(plantId, plant);
    });

    container.innerHTML = html;

    // Mettre à jour les statistiques
    updatePlantsStatistics(plantsList);
}

function generatePlantCard(plantId, plant) {
    const age = calculateAge(plant.plantDate);
    const health = calculatePlantHealth(plant);
    const lastWatered = plant.lastWatered ? formatLastWatered(plant.lastWatered) : 'Jamais';
    const needsAttention = health < 70 || shouldWaterPlant(plant);

    return `
        <div class="plant-card" data-plant-id="${plantId}" data-health="${health}">
            <div class="plant-card-header">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                        <div style="font-size: 48px;">🍅</div>
                        <div>
                            <h3 style="color: var(--text-primary); margin-bottom: 5px;">${plant.name}</h3>
                            <p style="color: var(--text-secondary); font-size: 14px;">
                                ${plant.variety} • ${plant.location || 'Non spécifié'}
                            </p>
                        </div>
                    </div>
                </div>
                <div>
                    ${getHealthBadge(health, needsAttention)}
                </div>
            </div>

            <div class="plant-card-body">
                <div class="plant-metric">
                    <div class="plant-metric-icon">📅</div>
                    <div class="plant-metric-value">${age}j</div>
                    <div class="plant-metric-label">Âge</div>
                </div>
                <div class="plant-metric">
                    <div class="plant-metric-icon">🩺</div>
                    <div class="plant-metric-value" style="color: ${getHealthColor(health)}">${health}%</div>
                    <div class="plant-metric-label">Santé</div>
                </div>
                <div class="plant-metric">
                    <div class="plant-metric-icon">💧</div>
                    <div class="plant-metric-value">${plant.waterCount || 0}</div>
                    <div class="plant-metric-label">Arrosages</div>
                </div>
                <div class="plant-metric">
                    <div class="plant-metric-icon">⏱️</div>
                    <div class="plant-metric-value" style="font-size: 14px;">${lastWatered}</div>
                    <div class="plant-metric-label">Dernier arrosage</div>
                </div>
            </div>

            ${needsAttention ? `
                <div class="alert alert-warning" style="margin-bottom: 15px;">
                    <span style="font-size: 20px;">⚠️</span>
                    <div>
                        <strong>Attention requise</strong>
                        <p style="margin-top: 5px; font-size: 14px;">
                            ${getAttentionMessage(plant, health)}
                        </p>
                    </div>
                </div>
            ` : ''}

            <div class="plant-actions">
                <button class="btn btn-primary" onclick="waterPlant('${plantId}')">
                    💧 Arroser
                </button>
                <button class="btn btn-secondary" onclick="showPlantDetails('${plantId}')">
                    📊 Détails
                </button>
                <button class="btn btn-secondary" onclick="editPlant('${plantId}')">
                    ✏️ Modifier
                </button>
                <button class="btn btn-secondary" onclick="scanPlant('${plantId}')">
                    📸 Scanner IA
                </button>
            </div>
        </div>
    `;
}

// ============================================
// CALCULS ET UTILITAIRES
// ============================================
function calculateAge(plantDate) {
    if (!plantDate) return 0;
    const planted = new Date(plantDate);
    const today = new Date();
    const diffTime = Math.abs(today - planted);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function calculatePlantHealth(plant) {
    let health = 100;
    const capteurs = firebaseData.capteurs || {};

    // Facteur âge (jeunes plants plus fragiles)
    const age = calculateAge(plant.plantDate);
    if (age < 14) health -= 10; // Plants jeunes

    // Facteur humidité sol
    if (capteurs.humiditeSol < 30) {
        health -= 30;
    } else if (capteurs.humiditeSol < 40) {
        health -= 15;
    } else if (capteurs.humiditeSol > 80) {
        health -= 20;
    }

    // Facteur température
    if (capteurs.temperature < 15 || capteurs.temperature > 35) {
        health -= 25;
    } else if (capteurs.temperature < 18 || capteurs.temperature > 30) {
        health -= 10;
    }

    // Facteur humidité air
    if (capteurs.humiditeAir < 40 || capteurs.humiditeAir > 85) {
        health -= 10;
    }

    // Facteur arrosage
    if (shouldWaterPlant(plant)) {
        health -= 15;
    }

    // Maladie détectée
    if (plant.diseaseDetected) {
        health -= 40;
    }

    return Math.max(0, Math.min(100, Math.round(health)));
}

function shouldWaterPlant(plant) {
    if (!plant.lastWatered) return true;
    
    const lastWater = new Date(plant.lastWatered);
    const now = new Date();
    const hoursSinceWater = (now - lastWater) / (1000 * 60 * 60);
    
    // Besoin d'arrosage si > 24h et humidité < 40%
    const capteurs = firebaseData.capteurs || {};
    return (hoursSinceWater > 24 && capteurs.humiditeSol < 40);
}

function getAttentionMessage(plant, health) {
    const capteurs = firebaseData.capteurs || {};
    let messages = [];

    if (capteurs.humiditeSol < 30) {
        messages.push('Sol très sec - arrosage urgent');
    } else if (shouldWaterPlant(plant)) {
        messages.push('Arrosage recommandé');
    }

    if (capteurs.temperature < 15) {
        messages.push('Température trop basse');
    } else if (capteurs.temperature > 35) {
        messages.push('Température trop élevée');
    }

    if (plant.diseaseDetected) {
        messages.push('Maladie détectée - traitement requis');
    }

    if (messages.length === 0) {
        messages.push('Surveillance recommandée');
    }

    return messages.join(' • ');
}

function getHealthBadge(health, needsAttention) {
    if (needsAttention) {
        return '<span class="status-badge status-warning">⚠️ Attention</span>';
    } else if (health >= 80) {
        return '<span class="status-badge status-success">✅ Excellente santé</span>';
    } else if (health >= 60) {
        return '<span class="status-badge status-info">👍 Bonne santé</span>';
    } else {
        return '<span class="status-badge status-danger">🚨 Nécessite soins</span>';
    }
}

function getHealthColor(health) {
    if (health >= 80) return 'var(--success)';
    if (health >= 60) return 'var(--info)';
    if (health >= 40) return 'var(--warning)';
    return 'var(--danger)';
}

function formatLastWatered(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.round((now - date) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Il y a < 1h';
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    
    const diffDays = Math.round(diffHours / 24);
    return `Il y a ${diffDays}j`;
}

// ============================================
// STATISTIQUES GLOBALES
// ============================================
function updatePlantsStatistics(plantsList) {
    const total = plantsList.length;
    let healthyCount = 0;
    let warningCount = 0;
    let totalAge = 0;

    plantsList.forEach(([plantId, plant]) => {
        const health = calculatePlantHealth(plant);
        const age = calculateAge(plant.plantDate);
        
        if (health >= 70 && !shouldWaterPlant(plant)) {
            healthyCount++;
        } else {
            warningCount++;
        }
        
        totalAge += age;
    });

    const avgAge = total > 0 ? Math.round(totalAge / total) : 0;

    // Mise à jour UI
    const totalElement = document.getElementById('totalPlants');
    const healthyElement = document.getElementById('healthyPlants');
    const warningElement = document.getElementById('warningPlants');
    const avgAgeElement = document.getElementById('avgAge');

    if (totalElement) totalElement.textContent = total;
    if (healthyElement) {
        healthyElement.textContent = healthyCount;
        healthyElement.style.color = 'var(--success)';
    }
    if (warningElement) {
        warningElement.textContent = warningCount;
        warningElement.style.color = warningCount > 0 ? 'var(--warning)' : 'var(--success)';
    }
    if (avgAgeElement) avgAgeElement.textContent = avgAge + 'j';
}

// ============================================
// ENVIRONNEMENT
// ============================================
function updateEnvironmentDisplay() {
    setInterval(() => {
        const capteurs = firebaseData.capteurs || {};
        
        const elements = {
            envHumiditeSol: (capteurs.humiditeSol || 0) + '%',
            envTemperature: (capteurs.temperature || 0).toFixed(1) + '°C',
            envHumiditeAir: (capteurs.humiditeAir || 0) + '%',
            envPluie: (capteurs.pluie || 0) + '%'
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }, 2000);
}

// ============================================
// FILTRES ET TRI
// ============================================
function applyFiltersAndSort(plantsList) {
    const filterValue = document.getElementById('filterPlants')?.value || 'all';
    const sortValue = document.getElementById('sortPlants')?.value || 'name';

    // Filtrer
    let filtered = plantsList.filter(([plantId, plant]) => {
        const health = calculatePlantHealth(plant);
        const needsAttention = health < 70 || shouldWaterPlant(plant);

        switch(filterValue) {
            case 'healthy':
                return !needsAttention;
            case 'warning':
                return needsAttention;
            case 'disease':
                return plant.diseaseDetected;
            default:
                return true;
        }
    });

    // Trier
    filtered.sort((a, b) => {
        const [idA, plantA] = a;
        const [idB, plantB] = b;

        switch(sortValue) {
            case 'name':
                return plantA.name.localeCompare(plantB.name);
            case 'age':
                return calculateAge(plantB.plantDate) - calculateAge(plantA.plantDate);
            case 'health':
                return calculatePlantHealth(plantB) - calculatePlantHealth(plantA);
            case 'lastWatered':
                const dateA = plantA.lastWatered ? new Date(plantA.lastWatered) : new Date(0);
                const dateB = plantB.lastWatered ? new Date(plantB.lastWatered) : new Date(0);
                return dateB - dateA;
            default:
                return 0;
        }
    });

    return filtered;
}

function filterPlants() {
    updatePlantsDisplay();
}

function sortPlants() {
    updatePlantsDisplay();
}

// ============================================
// MODAL AJOUT/MODIFICATION
// ============================================
function showAddPlantModal() {
    const modal = document.getElementById('plantModal');
    const modalTitle = document.getElementById('modalTitle');
    
    if (!modal) return;

    // Réinitialiser le formulaire
    document.getElementById('plantName').value = '';
    document.getElementById('plantVariety').value = 'Cœur de Bœuf';
    document.getElementById('plantDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('plantLocation').value = '';
    document.getElementById('plantNotes').value = '';

    if (modalTitle) modalTitle.textContent = '➕ Ajouter un Plant de Tomate';
    currentEditingPlantId = null;

    modal.style.display = 'flex';
}

function editPlant(plantId) {
    const plant = plantsData[plantId];
    if (!plant) return;

    const modal = document.getElementById('plantModal');
    const modalTitle = document.getElementById('modalTitle');
    
    if (!modal) return;

    // Remplir le formulaire
    document.getElementById('plantName').value = plant.name || '';
    document.getElementById('plantVariety').value = plant.variety || 'Cœur de Bœuf';
    document.getElementById('plantDate').value = plant.plantDate || '';
    document.getElementById('plantLocation').value = plant.location || '';
    document.getElementById('plantNotes').value = plant.notes || '';

    if (modalTitle) modalTitle.textContent = '✏️ Modifier le Plant';
    currentEditingPlantId = plantId;

    modal.style.display = 'flex';
}

function closePlantModal() {
    const modal = document.getElementById('plantModal');
    if (modal) modal.style.display = 'none';
    currentEditingPlantId = null;
}

function savePlant() {
    const name = document.getElementById('plantName').value.trim();
    const variety = document.getElementById('plantVariety').value;
    const plantDate = document.getElementById('plantDate').value;
    const location = document.getElementById('plantLocation').value.trim();
    const notes = document.getElementById('plantNotes').value.trim();

    if (!name || !plantDate) {
        alert('❌ Veuillez remplir au minimum le nom et la date de plantation');
        return;
    }

    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }

    const plantData = {
        name: name,
        variety: variety,
        plantDate: plantDate,
        location: location,
        notes: notes,
        waterCount: 0,
        aiScans: 0,
        diseaseDetected: false,
        lastUpdated: Date.now()
    };

    if (currentEditingPlantId) {
        // Modification
        const existingPlant = plantsData[currentEditingPlantId];
        plantData.waterCount = existingPlant.waterCount || 0;
        plantData.aiScans = existingPlant.aiScans || 0;
        plantData.lastWatered = existingPlant.lastWatered;
        plantData.diseaseDetected = existingPlant.diseaseDetected || false;

        database.ref(`/plants/${currentEditingPlantId}`).update(plantData)
            .then(() => {
                console.log('✅ Plant modifié:', name);
                alert('✅ Plant modifié avec succès !');
                closePlantModal();
            })
            .catch(err => {
                console.error('❌ Erreur:', err);
                alert('❌ Erreur lors de la modification');
            });
    } else {
        // Ajout
        database.ref('/plants').push(plantData)
            .then(() => {
                console.log('✅ Plant ajouté:', name);
                alert('✅ Plant ajouté avec succès !');
                closePlantModal();
            })
            .catch(err => {
                console.error('❌ Erreur:', err);
                alert('❌ Erreur lors de l\'ajout');
            });
    }
}

// ============================================
// MODAL DÉTAILS
// ============================================
function showPlantDetails(plantId) {
    const plant = plantsData[plantId];
    if (!plant) return;

    const modal = document.getElementById('plantDetailsModal');
    if (!modal) return;

    currentDetailsPlantId = plantId;

    const age = calculateAge(plant.plantDate);
    const health = calculatePlantHealth(plant);
    const lastWatered = plant.lastWatered ? 
        new Date(plant.lastWatered).toLocaleString('fr-FR') : 
        'Jamais arrosé';

    // Remplir les informations
    document.getElementById('detailsPlantName').textContent = `🍅 ${plant.name}`;
    document.getElementById('detailsVariety').textContent = plant.variety || '--';
    document.getElementById('detailsPlantDate').textContent = 
        new Date(plant.plantDate).toLocaleDateString('fr-FR');
    document.getElementById('detailsAge').textContent = age + ' jours';
    document.getElementById('detailsLocation').textContent = plant.location || 'Non spécifié';
    
    const statusElement = document.getElementById('detailsStatus');
    if (statusElement) {
        statusElement.innerHTML = getHealthBadge(health, health < 70);
    }

    document.getElementById('detailsHealth').textContent = health + '%';
    document.getElementById('detailsHealth').style.color = getHealthColor(health);
    document.getElementById('detailsWaterCount').textContent = (plant.waterCount || 0) + ' fois';
    document.getElementById('detailsLastWater').textContent = lastWatered;
    document.getElementById('detailsAIScans').textContent = (plant.aiScans || 0) + ' analyses';
    document.getElementById('detailsNotes').textContent = plant.notes || 'Aucune note';

    modal.style.display = 'flex';
}

function closePlantDetailsModal() {
    const modal = document.getElementById('plantDetailsModal');
    if (modal) modal.style.display = 'none';
    currentDetailsPlantId = null;
}

function waterPlantFromDetails() {
    if (currentDetailsPlantId) {
        waterPlant(currentDetailsPlantId);
        closePlantDetailsModal();
    }
}

function scanPlantFromDetails() {
    if (currentDetailsPlantId) {
        scanPlant(currentDetailsPlantId);
    }
}

function editPlantFromDetails() {
    closePlantDetailsModal();
    if (currentDetailsPlantId) {
        editPlant(currentDetailsPlantId);
    }
}

function deletePlantFromDetails() {
    if (!currentDetailsPlantId) return;

    const plant = plantsData[currentDetailsPlantId];
    if (!plant) return;

    const confirmed = confirm(
        `⚠️ Êtes-vous sûr de vouloir supprimer "${plant.name}" ?\n\nCette action est irréversible.`
    );

    if (!confirmed) return;

    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }

    database.ref(`/plants/${currentDetailsPlantId}`).remove()
        .then(() => {
            console.log('✅ Plant supprimé');
            alert('✅ Plant supprimé avec succès');
            closePlantDetailsModal();
        })
        .catch(err => {
            console.error('❌ Erreur:', err);
            alert('❌ Erreur lors de la suppression');
        });
}

// ============================================
// ACTIONS SUR LES PLANTS
// ============================================
function waterPlant(plantId) {
    const plant = plantsData[plantId];
    if (!plant) return;

    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }

    const confirmed = confirm(
        `💧 Arroser "${plant.name}" ?\n\nCela activera le système d'arrosage manuel.`
    );

    if (!confirmed) return;

    // Mettre à jour le plant
    database.ref(`/plants/${plantId}`).update({
        lastWatered: Date.now(),
        waterCount: (plant.waterCount || 0) + 1
    })
    .then(() => {
        // Activer l'arrosage manuel
        return database.ref('/commandes').update({
            mode: 'manuel',
            activerPompe: true,
            dureeManuelle: 5
        });
    })
    .then(() => {
        console.log('✅ Arrosage déclenché pour:', plant.name);
        alert(`✅ Arrosage de "${plant.name}" en cours...\nDurée: 5 secondes`);
    })
    .catch(err => {
        console.error('❌ Erreur:', err);
        alert('❌ Erreur lors de l\'arrosage');
    });
}
// ============================================
// SCRIPT D'AJOUT AUTOMATIQUE DES PLANTS
// À exécuter dans la console du navigateur (F12)
// ============================================

console.log('🍅 Démarrage création automatique des plants...');

// Vérifier que Firebase est disponible
if (typeof database === 'undefined') {
    console.error('❌ Firebase non disponible. Assurez-vous d\'être sur votre dashboard SmartPlant.');
    alert('❌ Erreur: Ouvrez d\'abord votre dashboard SmartPlant, puis réessayez.');
} else {
    console.log('✅ Firebase détecté');
    
    // Données des 8 plants
    const plants = [
        {
            name: "Tomate Coeur de Boeuf 1",
            variety: "Coeur de Boeuf",
            plantDate: "2025-01-15",
            location: "Potager Zone A",
            notes: "Plant vigoureux, bien expose au soleil",
            waterCount: 12,
            lastWatered: 1732618800000,
            aiScans: 3,
            lastScan: 1732618800000,
            diseaseDetected: false,
            lastUpdated: Date.now()
        },
        {
            name: "Tomate Cherry 1",
            variety: "Cherry",
            plantDate: "2025-01-10",
            location: "Serre 1 Rangee B",
            notes: "Petites tomates cerises tres productives",
            waterCount: 15,
            lastWatered: 1732532400000,
            aiScans: 2,
            lastScan: 1732532400000,
            diseaseDetected: false,
            lastUpdated: Date.now()
        },
        {
            name: "Tomate Roma 1",
            variety: "Roma",
            plantDate: "2025-01-20",
            location: "Potager Zone B",
            notes: "Variete italienne ideale pour sauces",
            waterCount: 8,
            lastWatered: 1732446000000,
            aiScans: 1,
            lastScan: 1732446000000,
            diseaseDetected: false,
            lastUpdated: Date.now()
        },
        {
            name: "Tomate Beefsteak 1",
            variety: "Beefsteak",
            plantDate: "2025-01-12",
            location: "Potager Zone A Coin sud",
            notes: "Plant a tres gros fruits",
            waterCount: 10,
            lastWatered: 1732359600000,
            aiScans: 4,
            lastScan: 1732359600000,
            diseaseDetected: true,
            typeMaladie: "Suspicion mildiou",
            lastUpdated: Date.now()
        },
        {
            name: "Tomate Coeur de Boeuf 2",
            variety: "Coeur de Boeuf",
            plantDate: "2025-01-18",
            location: "Potager Zone A",
            notes: "Deuxieme plant de la meme variete",
            waterCount: 9,
            lastWatered: 1732627200000,
            aiScans: 2,
            lastScan: 1732627200000,
            diseaseDetected: false,
            lastUpdated: Date.now()
        },
        {
            name: "Tomate San Marzano 1",
            variety: "San Marzano",
            plantDate: "2025-01-08",
            location: "Serre 1 Rangee A",
            notes: "Variete italienne authentique",
            waterCount: 18,
            lastWatered: 1732633200000,
            aiScans: 5,
            lastScan: 1732633200000,
            diseaseDetected: false,
            lastUpdated: Date.now()
        },
        {
            name: "Tomate Cherry 2",
            variety: "Cherry",
            plantDate: "2025-01-14",
            location: "Balcon Pot 30L",
            notes: "Plant en pot pour culture balcon",
            waterCount: 14,
            lastWatered: 1732624800000,
            aiScans: 2,
            lastScan: 1732624800000,
            diseaseDetected: false,
            lastUpdated: Date.now()
        },
        {
            name: "Tomate Noire de Crimee",
            variety: "Autre",
            plantDate: "2025-01-16",
            location: "Potager Zone C",
            notes: "Variete ancienne russe",
            waterCount: 11,
            lastWatered: 1732621200000,
            aiScans: 3,
            lastScan: 1732621200000,
            diseaseDetected: false,
            lastUpdated: Date.now()
        }
    ];
    
    // Fonction pour ajouter un plant
    async function addPlant(plantData, index) {
        return new Promise((resolve, reject) => {
            database.ref('/plants').push(plantData)
                .then(() => {
                    console.log(`✅ Plant ${index + 1}/8 ajouté: ${plantData.name}`);
                    resolve();
                })
                .catch(error => {
                    console.error(`❌ Erreur plant ${index + 1}:`, error);
                    reject(error);
                });
        });
    }
    
    // Ajouter tous les plants séquentiellement
    async function addAllPlants() {
        console.log('🚀 Début ajout des 8 plants...');
        
        for (let i = 0; i < plants.length; i++) {
            try {
                await addPlant(plants[i], i);
                // Petit délai entre chaque ajout
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`❌ Arrêt à cause d'une erreur`);
                alert(`❌ Erreur lors de l'ajout du plant ${i + 1}. Vérifiez la console.`);
                return;
            }
        }
        
        console.log('🎉 TERMINÉ ! 8 plants ajoutés avec succès !');
        alert('🎉 SUCCESS ! 8 plants de tomates ont été ajoutés !\n\nAllez sur la page "Mes Plantes" pour les voir.');
    }
    
    // Lancer l'ajout
    addAllPlants();
}
function scanPlant(plantId) {
    const plant = plantsData[plantId];
    if (!plant) return;

    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }

    alert(
        `📸 Scanner "${plant.name}" avec l'IA\n\n` +
        `L'ESP32-CAM va prendre une photo et l'analyser avec Teachable Machine.\n\n` +
        `Résultat disponible dans quelques secondes...`
    );

    // Déclencher la capture photo
    database.ref('/commandes').update({
        capturerPhoto: true,
        plantIdPourScan: plantId
    })
    .then(() => {
        // Incrémenter le compteur de scans
        return database.ref(`/plants/${plantId}`).update({
            aiScans: (plant.aiScans || 0) + 1,
            lastScan: Date.now()
        });
    })
    .then(() => {
        console.log('✅ Scan IA déclenché pour:', plant.name);
    })
    .catch(err => {
        console.error('❌ Erreur:', err);
        alert('❌ Erreur lors du scan');
    });
}

// ============================================
// MESSAGE AUCUN PLANT
// ============================================
function showNoPlantsMessage() {
    const container = document.getElementById('plantsContainer');
    const noMessage = document.getElementById('noPlantsMessage');
    
    if (container) container.innerHTML = '';
    if (noMessage) noMessage.style.display = 'block';

    // Réinitialiser les stats
    ['totalPlants', 'healthyPlants', 'warningPlants'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '0';
    });

    const avgAgeElement = document.getElementById('avgAge');
    if (avgAgeElement) avgAgeElement.textContent = '0j';
}

// ============================================
// EXPORT DES FONCTIONS GLOBALES
// ============================================
window.showAddPlantModal = showAddPlantModal;
window.editPlant = editPlant;
window.closePlantModal = closePlantModal;
window.savePlant = savePlant;
window.showPlantDetails = showPlantDetails;
window.closePlantDetailsModal = closePlantDetailsModal;
window.waterPlantFromDetails = waterPlantFromDetails;
window.scanPlantFromDetails = scanPlantFromDetails;
window.editPlantFromDetails = editPlantFromDetails;
window.deletePlantFromDetails = deletePlantFromDetails;
window.waterPlant = waterPlant;
window.scanPlant = scanPlant;
window.filterPlants = filterPlants;
window.sortPlants = sortPlants;

// Initialiser au chargement
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initPlantsModule();
    }, 2000); // Attendre que Firebase soit initialisé
});

console.log('✅ Module Plants de Tomates chargé !');
/* ============================================
   MODULE CONFIGURATION - GESTION DES PARAMÈTRES
   ============================================ */

// Initialisation de la page configuration
function initConfigurationPage() {
    if (!database) {
        console.error('❌ Firebase non disponible');
        return;
    }

    console.log('⚙️ Initialisation page Configuration...');

    // Écouter les changements Firebase
    database.ref('/configuration').on('value', (snapshot) => {
        const config = snapshot.val();
        if (config) {
            loadConfigurationToUI(config);
        }
    });

    database.ref('/arrosage').on('value', (snapshot) => {
        const arrosage = snapshot.val();
        if (arrosage && arrosage.automatique) {
            document.getElementById('configDelaiMin').value = arrosage.automatique.delaiMin || 60;
            updateDelaiMinDisplay();
        }
    });

    // Mettre à jour les affichages en temps réel
    setupRealTimeUpdates();
}

// Charger la configuration dans l'interface
function loadConfigurationToUI(config) {
    console.log('📥 Chargement configuration:', config);

    // Durée d'arrosage
    if (config.dureeArrosage) {
        const dureeSeconds = config.dureeArrosage / 1000;
        document.getElementById('configDureeArrosage').value = config.dureeArrosage;
        document.getElementById('configDureeArrosageValue').textContent = dureeSeconds + 's';
    }

    // Mode par défaut
    if (config.mode) {
        document.getElementById('configModeDefaut').value = config.mode;
        document.getElementById('configCurrentMode').textContent = 
            config.mode.charAt(0).toUpperCase() + config.mode.slice(1);
    }

    // Heure et minute
    if (config.heureArrosage !== undefined) {
        document.getElementById('configHeureArrosage').value = config.heureArrosage;
    }
    if (config.minuteArrosage !== undefined) {
        document.getElementById('configMinuteArrosage').value = config.minuteArrosage;
    }

    // Seuils
    if (config.seuilHumiditeBas !== undefined) {
        document.getElementById('configSeuilBas').value = config.seuilHumiditeBas;
        updateSeuilBasDisplay();
    }
    if (config.seuilHumiditeHaut !== undefined) {
        document.getElementById('configSeuilHaut').value = config.seuilHumiditeHaut;
        updateSeuilHautDisplay();
    }

    // Température max
    const tempMax = config.tempMax || 35;
    document.getElementById('configTempMax').value = tempMax;
    updateTempMaxDisplay();
}

// Mise à jour temps réel des sliders
function setupRealTimeUpdates() {
    // Durée d'arrosage
    document.getElementById('configDureeArrosage').addEventListener('input', (e) => {
        const dureeSeconds = e.target.value / 1000;
        document.getElementById('configDureeArrosageValue').textContent = dureeSeconds + 's';
    });

    // Délai minimum
    document.getElementById('configDelaiMin').addEventListener('input', updateDelaiMinDisplay);

    // Seuil bas
    document.getElementById('configSeuilBas').addEventListener('input', updateSeuilBasDisplay);

    // Seuil haut
    document.getElementById('configSeuilHaut').addEventListener('input', updateSeuilHautDisplay);

    // Température max
    document.getElementById('configTempMax').addEventListener('input', updateTempMaxDisplay);
}

function updateDelaiMinDisplay() {
    const value = document.getElementById('configDelaiMin').value;
    document.getElementById('configDelaiMinValue').textContent = value + ' min';
}

function updateSeuilBasDisplay() {
    const value = document.getElementById('configSeuilBas').value;
    document.getElementById('configSeuilBasValue').textContent = value + '%';
    // Mise à jour visualisation
    document.getElementById('visualSeuilBas').textContent = value;
    document.getElementById('visualSeuilBas2').textContent = value;
}

function updateSeuilHautDisplay() {
    const value = document.getElementById('configSeuilHaut').value;
    document.getElementById('configSeuilHautValue').textContent = value + '%';
    // Mise à jour visualisation
    document.getElementById('visualSeuilHaut').textContent = value;
    document.getElementById('visualSeuilHaut2').textContent = value;
}

function updateTempMaxDisplay() {
    const value = document.getElementById('configTempMax').value;
    document.getElementById('configTempMaxValue').textContent = value + '°C';
}

// ============================================
// SAUVEGARDER LA CONFIGURATION
// ============================================
function saveConfiguration() {
    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }

    const dureeArrosage = parseInt(document.getElementById('configDureeArrosage').value);
    const mode = document.getElementById('configModeDefaut').value;
    const heureArrosage = parseInt(document.getElementById('configHeureArrosage').value);
    const minuteArrosage = parseInt(document.getElementById('configMinuteArrosage').value);
    const seuilBas = parseInt(document.getElementById('configSeuilBas').value);
    const seuilHaut = parseInt(document.getElementById('configSeuilHaut').value);
    const tempMax = parseInt(document.getElementById('configTempMax').value);
    const delaiMin = parseInt(document.getElementById('configDelaiMin').value);

    // Validation
    if (seuilBas >= seuilHaut) {
        alert('❌ Erreur : Le seuil minimum doit être inférieur au seuil maximum !');
        return;
    }

    if (heureArrosage < 0 || heureArrosage > 23) {
        alert('❌ Erreur : L\'heure doit être entre 0 et 23 !');
        return;
    }

    if (minuteArrosage < 0 || minuteArrosage > 59) {
        alert('❌ Erreur : Les minutes doivent être entre 0 et 59 !');
        return;
    }

    // Sauvegarder dans Firebase
    const updates = {};
    
    // /configuration
    updates['/configuration/dureeArrosage'] = dureeArrosage;
    updates['/configuration/mode'] = mode;
    updates['/configuration/heureArrosage'] = heureArrosage;
    updates['/configuration/minuteArrosage'] = minuteArrosage;
    updates['/configuration/seuilHumiditeBas'] = seuilBas;
    updates['/configuration/seuilHumiditeHaut'] = seuilHaut;
    updates['/configuration/tempMax'] = tempMax;

    // /arrosage/automatique
    updates['/arrosage/automatique/seuilMin'] = seuilBas;
    updates['/arrosage/automatique/duree'] = dureeArrosage / 1000;
    updates['/arrosage/automatique/delaiMin'] = delaiMin;

    // /arrosage/manuel
    updates['/arrosage/manuel/duree'] = dureeArrosage / 1000;

    // /commandes
    updates['/commandes/mode'] = mode;
    updates['/commandes/heureArrosage'] = heureArrosage;
    updates['/commandes/minuteArrosage'] = minuteArrosage;

    database.ref().update(updates)
        .then(() => {
            console.log('✅ Configuration sauvegardée');
            alert(
                `✅ Configuration sauvegardée avec succès !\n\n` +
                `• Durée : ${dureeArrosage/1000}s\n` +
                `• Mode : ${mode}\n` +
                `• Heure : ${String(heureArrosage).padStart(2,'0')}:${String(minuteArrosage).padStart(2,'0')}\n` +
                `• Seuils : ${seuilBas}% - ${seuilHaut}%\n` +
                `• Délai min : ${delaiMin} min`
            );
        })
        .catch(err => {
            console.error('❌ Erreur:', err);
            alert('❌ Erreur lors de la sauvegarde');
        });
}

// ============================================
// CONFIGURATIONS PRÉDÉFINIES
// ============================================
function applyPresetConfig(preset) {
    const presets = {
        mediterraneen: {
            name: 'Climat Méditerranéen',
            dureeArrosage: 7000,
            heureArrosage: 6,
            minuteArrosage: 30,
            mode: 'automatique',
            seuilBas: 30,
            seuilHaut: 70,
            tempMax: 35,
            delaiMin: 60
        },
        pots: {
            name: 'Plants en Pots',
            dureeArrosage: 4000,
            heureArrosage: 7,
            minuteArrosage: 0,
            mode: 'automatique',
            seuilBas: 35,
            seuilHaut: 65,
            tempMax: 35,
            delaiMin: 45
        },
        economie: {
            name: 'Économie d\'Eau',
            dureeArrosage: 3000,
            heureArrosage: 7,
            minuteArrosage: 0,
            mode: 'automatique',
            seuilBas: 25,
            seuilHaut: 60,
            tempMax: 35,
            delaiMin: 90
        },
        potager: {
            name: 'Potager Plein Terre',
            dureeArrosage: 10000,
            heureArrosage: 6,
            minuteArrosage: 0,
            mode: 'automatique',
            seuilBas: 30,
            seuilHaut: 75,
            tempMax: 35,
            delaiMin: 60
        },
        soir: {
            name: 'Arrosage Soir',
            dureeArrosage: 6000,
            heureArrosage: 19,
            minuteArrosage: 30,
            mode: 'automatique',
            seuilBas: 30,
            seuilHaut: 70,
            tempMax: 35,
            delaiMin: 60
        },
        standard: {
            name: 'Standard Universel',
            dureeArrosage: 5000,
            heureArrosage: 7,
            minuteArrosage: 0,
            mode: 'automatique',
            seuilBas: 30,
            seuilHaut: 70,
            tempMax: 35,
            delaiMin: 60
        }
    };

    const config = presets[preset];
    if (!config) {
        console.error('❌ Configuration inconnue:', preset);
        return;
    }

    const confirmed = confirm(
        `🎯 Appliquer la configuration "${config.name}" ?\n\n` +
        `• Durée : ${config.dureeArrosage/1000}s\n` +
        `• Heure : ${String(config.heureArrosage).padStart(2,'0')}:${String(config.minuteArrosage).padStart(2,'0')}\n` +
        `• Seuils : ${config.seuilBas}% - ${config.seuilHaut}%\n` +
        `• Mode : ${config.mode}\n\n` +
        `⚠️ Vos paramètres actuels seront écrasés.`
    );

    if (!confirmed) return;

    // Appliquer dans l'interface
    document.getElementById('configDureeArrosage').value = config.dureeArrosage;
    document.getElementById('configDureeArrosageValue').textContent = (config.dureeArrosage/1000) + 's';
    
    document.getElementById('configHeureArrosage').value = config.heureArrosage;
    document.getElementById('configMinuteArrosage').value = config.minuteArrosage;
    
    document.getElementById('configModeDefaut').value = config.mode;
    
    document.getElementById('configSeuilBas').value = config.seuilBas;
    updateSeuilBasDisplay();
    
    document.getElementById('configSeuilHaut').value = config.seuilHaut;
    updateSeuilHautDisplay();
    
    document.getElementById('configTempMax').value = config.tempMax;
    updateTempMaxDisplay();
    
    document.getElementById('configDelaiMin').value = config.delaiMin;
    updateDelaiMinDisplay();

    alert(`✅ Configuration "${config.name}" appliquée !\n\nCliquez sur "Enregistrer" pour sauvegarder.`);
}

// ============================================
// RÉINITIALISER
// ============================================
function resetConfiguration() {
    const confirmed = confirm(
        '🔄 Restaurer les valeurs par défaut ?\n\n' +
        '• Durée : 5s\n' +
        '• Heure : 07:00\n' +
        '• Seuils : 30% - 70%\n' +
        '• Mode : Automatique\n\n' +
        'Vos paramètres actuels seront perdus.'
    );

    if (!confirmed) return;

    applyPresetConfig('standard');
}

// ============================================
// TESTER LA CONFIGURATION
// ============================================
function testConfiguration() {
    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }

    const duree = parseInt(document.getElementById('configDureeArrosage').value) / 1000;
    
    const confirmed = confirm(
        `🧪 Test de la Configuration\n\n` +
        `Cela va activer la pompe pendant ${duree} secondes.\n\n` +
        `Voulez-vous continuer ?`
    );

    if (!confirmed) return;

    // Activer la pompe pour test
    database.ref('/commandes').update({
        activerPompe: true,
        mode: 'manuel',
        dureeManuelle: duree
    })
    .then(() => {
        alert(`✅ Test lancé !\n\nLa pompe s'active pendant ${duree} secondes...`);
        console.log('🧪 Test configuration - Pompe activée');
    })
    .catch(err => {
        console.error('❌ Erreur test:', err);
        alert('❌ Erreur lors du test');
    });
}

// ============================================
// EXPORT DES FONCTIONS GLOBALES
// ============================================
window.saveConfiguration = saveConfiguration;
window.resetConfiguration = resetConfiguration;
window.testConfiguration = testConfiguration;
window.applyPresetConfig = applyPresetConfig;

// Initialiser au chargement
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initConfigurationPage();
        console.log('✅ Module Configuration chargé');
    }, 2000);
});