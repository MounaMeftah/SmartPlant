/* ============================================
   SMARTPLANT DASHBOARD - JAVASCRIPT COMPLET
   Version avec 3 modes d'arrosage + Notifications Email
   ============================================ */

// ============================================
// CONFIGURATION
// ============================================
const ROBOFLOW_PUBLISHABLE_KEY = "rf_kw1r2TticSP3SoDsARINZDjrnYk2";
const ROBOFLOW_MODEL_NAME = "plant-disease-classification";
const ROBOFLOW_MODEL_VERSION = "1";

const ROBOFLOW_API_URL = `https://detect.roboflow.com/${ROBOFLOW_MODEL_NAME}/${ROBOFLOW_MODEL_VERSION}?api_key=${ROBOFLOW_PUBLISHABLE_KEY}`;
const ROBofLOW_API_URL = ROBOFLOW_API_URL;
const ROBoflow_API_URL = ROBOFLOW_API_URL;

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
// CALCUL SANTÉ GLOBALE + NOTIFICATIONS EMAIL
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
        const issue = { 
            type: 'danger', 
            message: '🚨 Sol TRÈS sec - CRITIQUE !', 
            detail: `Humidité: ${capteurs.humiditeSol}% (Seuil critique: 20%)` 
        };
        issues.push(issue);
        
        // 📧 Envoyer email pour alerte critique
        if (typeof createAndSendAlert === 'function') {
            createAndSendAlert(
                'soilCritical',
                'danger',
                '🚨 Sol TRÈS SEC - Action Immédiate Requise',
                `L'humidité du sol est à ${capteurs.humiditeSol}%, en dessous du seuil critique de 20%. Vos plantes sont en danger !`
            ).then(result => {
                if (result.success) {
                    console.log('✅ Email alerte critique envoyé');
                }
            }).catch(err => {
                console.warn('⚠️ Erreur envoi email:', err);
            });
        }
    } else if (capteurs.humiditeSol < seuilMin) {
        score -= 20;
        const issue = { 
            type: 'warning', 
            message: '⚠️ Sol sec - Arrosage recommandé', 
            detail: `Humidité: ${capteurs.humiditeSol}% (Seuil min: ${seuilMin}%)` 
        };
        issues.push(issue);
        
        // 📧 Envoyer email pour sol sec
        if (typeof createAndSendAlert === 'function') {
            createAndSendAlert(
                'soilDry',
                'warning',
                '⚠️ Sol Sec - Arrosage Recommandé',
                `L'humidité du sol est à ${capteurs.humiditeSol}%, en dessous du seuil minimum de ${seuilMin}%. Un arrosage est recommandé.`
            ).then(result => {
                if (result.success) {
                    console.log('✅ Email alerte sol sec envoyé');
                }
            }).catch(err => {
                console.warn('⚠️ Erreur envoi email:', err);
            });
        }
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
        const issue = { 
            type: 'warning', 
            message: '🌡️ Température extrême', 
            detail: `Température: ${capteurs.temperature.toFixed(1)}°C` 
        };
        issues.push(issue);
        
        // 📧 Envoyer email pour température extrême
        if (typeof createAndSendAlert === 'function') {
            createAndSendAlert(
                'temperatureExtreme',
                'warning',
                '🌡️ Température Extrême Détectée',
                `La température est à ${capteurs.temperature.toFixed(1)}°C, en dehors de la plage optimale (10-35°C). Vos plantes pourraient être stressées.`
            ).then(result => {
                if (result.success) {
                    console.log('✅ Email alerte température envoyé');
                }
            }).catch(err => {
                console.warn('⚠️ Erreur envoi email:', err);
            });
        }
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
        const typeMaladie = systeme.typeMaladie || 'Type inconnu - Vérification recommandée';
        const issue = { 
            type: 'danger', 
            message: '🩺 Maladie détectée !', 
            detail: typeMaladie
        };
        issues.push(issue);
        
        // 📧 Envoyer email pour maladie détectée
        if (typeof createAndSendAlert === 'function') {
            createAndSendAlert(
                'diseaseDetected',
                'danger',
                '🩺 Maladie Détectée sur Vos Plantes',
                `Une maladie a été détectée par l'IA : ${typeMaladie}. Une intervention rapide est recommandée pour éviter la propagation.`
            ).then(result => {
                if (result.success) {
                    console.log('✅ Email alerte maladie envoyé');
                }
            }).catch(err => {
                console.warn('⚠️ Erreur envoi email:', err);
            });
        }
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
    } else if (pageId === 'plants') {
        // Charger les plantes depuis Firebase
        if (typeof loadPlants === 'function') {
            loadPlants();
        } else {
            console.log('🌱 Chargement des plantes...');
            loadPlantsFromFirebase();
        }
    } else if (pageId === 'health') {
        // La page Santé est gérée par health-module.js
        console.log('🏥 Page Santé activée');
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
// ANALYSE D'IMAGE - Roboflow
// ============================================
async function analyzeWithRoboflow(file) {
  const controller = new AbortController();
  const timeoutMs = 20000;
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

async function analyzeImage(files) {
  if (!files || files.length === 0) return;
  console.log('📸 Analyse image (Roboflow) ...');

  const file = files[0];

  // Appel Roboflow
  const rf = await analyzeWithRoboflow(file);

  if (!rf || !rf.ok) {
    const msg = rf && (rf.error || rf.body) ? (rf.error || rf.body) : 'Erreur inconnue';
    console.warn('Analyse échouée:', msg);
    alert('❌ Erreur d\'analyse: ' + msg);
    return;
  }

  // Parse résultat
  const rfResult = rf.body;
  const predictions = rfResult && rfResult.predictions ? rfResult.predictions : [];
  const top = predictions.length > 0 ? predictions[0] : null;
  const className = top ? (top.class || top.label || 'Inconnu') : 'Inconnu';
  const confidence = top ? (top.confidence || top.confidence_score || top.probability || 0) : 0;
  const confPct = (Number(confidence) * 100).toFixed(1);

  // Afficher le résultat
  alert(`✅ Analyse terminée\n\nClasse: ${className}\nConfiance: ${confPct}%`);

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

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}

// ============================================
// GESTION DES PLANTES
// ============================================
function updateEnvironmentDisplay() {
    if (!database) return;
    
    database.ref('capteurs').once('value')
        .then(snapshot => {
            const capteurs = snapshot.val();
            if (!capteurs) return;
            
            const envHumiditeSol = document.getElementById('envHumiditeSol');
            const envTemperature = document.getElementById('envTemperature');
            const envHumiditeAir = document.getElementById('envHumiditeAir');
            const envPluie = document.getElementById('envPluie');
            
            if (envHumiditeSol) {
                envHumiditeSol.textContent = capteurs.humiditeSol + '%';
            }
            if (envTemperature) {
                envTemperature.textContent = capteurs.temperature + '°C';
            }
            if (envHumiditeAir) {
                envHumiditeAir.textContent = capteurs.humiditeAir + '%';
            }
            if (envPluie) {
                envPluie.textContent = capteurs.pluie + '%';
            }
            
            console.log('✅ Conditions environnementales mises à jour');
        })
        .catch(error => {
            console.error('❌ Erreur lecture capteurs:', error);
        });
}

function loadPlantsFromFirebase() {
    if (!database) {
        console.error('❌ Firebase non connecté');
        return;
    }
    
    console.log('🌱 Chargement des plantes depuis Firebase...');
    
    updateEnvironmentDisplay();
    
    const plantsRef = database.ref('plants');
    plantsRef.once('value')
        .then(snapshot => {
            const plantsContainer = document.getElementById('plantsContainer');
            if (!plantsContainer) {
                console.error('❌ Container plantsContainer introuvable');
                return;
            }
            
            const plants = snapshot.val();
            
            if (!plants || Object.keys(plants).length === 0) {
                plantsContainer.innerHTML = `
                    <div class="alert alert-info">
                        <span style="font-size: 24px;">ℹ️</span>
                        <div>
                            <strong>Aucune plante</strong>
                            <p style="margin-top: 5px; color: var(--text-secondary);">
                                Ajoutez votre première plante pour commencer le suivi
                            </p>
                        </div>
                    </div>
                `;
                
                document.getElementById('totalPlants').textContent = '0';
                document.getElementById('healthyPlants').textContent = '0';
                document.getElementById('warningPlants').textContent = '0';
                document.getElementById('avgAge').textContent = '0j';
                return;
            }
            
            const plantsArray = Object.values(plants);
            const totalPlants = plantsArray.length;
            const healthyPlants = plantsArray.filter(p => !p.diseaseDetected).length;
            const warningPlants = plantsArray.filter(p => p.diseaseDetected).length;
            
            const today = new Date();
            const avgAgeInDays = Math.floor(
                plantsArray.reduce((sum, p) => {
                    const plantDate = new Date(p.plantDate);
                    return sum + (today - plantDate) / (1000 * 60 * 60 * 24);
                }, 0) / totalPlants
            );
            
            document.getElementById('totalPlants').textContent = totalPlants;
            document.getElementById('healthyPlants').textContent = healthyPlants;
            document.getElementById('warningPlants').textContent = warningPlants;
            document.getElementById('avgAge').textContent = avgAgeInDays + 'j';
            
            let html = '<div class="plants-grid">';
            
            Object.keys(plants).forEach(plantId => {
                const plant = plants[plantId];
                const diseaseIcon = plant.diseaseDetected ? '🦠' : '✅';
                const diseaseClass = plant.diseaseDetected ? 'status-disease' : 'status-healthy';
                const diseaseText = plant.diseaseDetected ? 'Maladie détectée' : 'Saine';
                
                const plantDate = new Date(plant.plantDate);
                const ageInDays = Math.floor((today - plantDate) / (1000 * 60 * 60 * 24));
                const ageText = ageInDays < 30 ? `${ageInDays} jours` : `${Math.floor(ageInDays / 30)} mois`;
                
                const lastWatered = plant.lastWatered ? new Date(plant.lastWatered) : null;
                const lastWateredText = lastWatered ? 
                    lastWatered.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : 
                    'Jamais';
                
                html += `
                    <div class="plant-card" onclick="showPlantDetails('${plantId}')">
                        <div class="plant-header">
                            <h3 class="plant-name">🌱 ${escapeHtml(plant.name)}</h3>
                            <span class="plant-status ${diseaseClass}">
                                ${diseaseIcon} ${diseaseText}
                            </span>
                        </div>
                        
                        <div class="plant-info">
                            <div class="info-row">
                                <span class="info-label">Variété:</span>
                                <span class="info-value">${escapeHtml(plant.variety)}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Âge:</span>
                                <span class="info-value">${ageText}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Emplacement:</span>
                                <span class="info-value">${escapeHtml(plant.location || 'Non spécifié')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Dernier arrosage:</span>
                                <span class="info-value">${lastWateredText}</span>
                            </div>
                        </div>
                        
                        <div class="plant-stats">
                            <div class="stat-item">
                                <span class="stat-icon">💧</span>
                                <span class="stat-value">${plant.waterCount || 0}</span>
                                <span class="stat-label">Arrosages</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-icon">📸</span>
                                <span class="stat-value">${plant.aiScans || 0}</span>
                                <span class="stat-label">Scans IA</span>
                            </div>
                        </div>
                        
                        <div class="plant-actions">
                            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); waterPlant('${plantId}')">
                                💧 Arroser
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); scanPlant('${plantId}')">
                                📸 Scanner
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            plantsContainer.innerHTML = html;
            
            console.log(`✅ ${Object.keys(plants).length} plante(s) chargée(s)`);
        })
        .catch(error => {
            console.error('❌ Erreur chargement plantes:', error);
            const plantsContainer = document.getElementById('plantsContainer');
            if (plantsContainer) {
                plantsContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <span style="font-size: 24px;">❌</span>
                        <div>
                            <strong>Erreur de chargement</strong>
                            <p style="margin-top: 5px; color: var(--text-secondary);">
                                ${error.message}
                            </p>
                        </div>
                    </div>
                `;
            }
        });
}

function showPlantDetails(plantId) {
    console.log('🔍 Affichage détails plante:', plantId);
    alert('Détails de la plante ' + plantId + '\n\nCette fonctionnalité sera implémentée prochainement.');
}

function waterPlant(plantId) {
    console.log('💧 Arrosage plante:', plantId);
    
    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }
    
    const confirmed = confirm('Voulez-vous arroser cette plante maintenant ?');
    if (!confirmed) return;
    
    const updates = {};
    updates[`plants/${plantId}/lastWatered`] = Date.now();
    updates[`plants/${plantId}/waterCount`] = firebase.database.ServerValue.increment(1);
    
    database.ref().update(updates)
        .then(() => {
            alert('✅ Plante arrosée avec succès !');
            loadPlantsFromFirebase();
        })
        .catch(error => {
            alert('❌ Erreur: ' + error.message);
        });
}

function scanPlant(plantId) {
    console.log('📸 Scan IA plante:', plantId);
    alert('Scan IA de la plante ' + plantId + '\n\nRedirection vers la page Santé...');
    showPage('health');
}

function openAddPlantModal() {
    const modal = document.getElementById('plantModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('modalTitle').textContent = '➕ Ajouter un Plant';
        document.getElementById('plantName').value = '';
        document.getElementById('plantVariety').value = 'Cœur de Bœuf';
        document.getElementById('plantDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('plantLocation').value = '';
        document.getElementById('plantNotes').value = '';
    }
}

function showAddPlantModal() {
    openAddPlantModal();
}

function closePlantModal() {
    const modal = document.getElementById('plantModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function savePlant() {
    if (!database) {
        alert('❌ Firebase non connecté');
        return;
    }
    
    const name = document.getElementById('plantName').value.trim();
    const variety = document.getElementById('plantVariety').value;
    const plantDate = document.getElementById('plantDate').value;
    const location = document.getElementById('plantLocation').value.trim();
    const notes = document.getElementById('plantNotes').value.trim();
    
    if (!name || !plantDate) {
        alert('⚠️ Veuillez remplir au moins le nom et la date de plantation');
        return;
    }
    
    const newPlant = {
        name: name,
        variety: variety,
        plantDate: plantDate,
        location: location,
        notes: notes,
        waterCount: 0,
        lastWatered: null,
        aiScans: 0,
        lastScan: null,
        diseaseDetected: false,
        lastUpdated: Date.now()
    };
    
    database.ref('plants').push(newPlant)
        .then(() => {
            alert('✅ Plante ajoutée avec succès !');
            closePlantModal();
            loadPlantsFromFirebase();
        })
        .catch(error => {
            alert('❌ Erreur: ' + error.message);
        });
}

// ============================================
// EXPORT FONCTIONS GLOBALES
// ============================================
window.showPage = showPage;
window.analyzeImage = analyzeImage;
window.updateEnvironmentDisplay = updateEnvironmentDisplay;
window.loadPlantsFromFirebase = loadPlantsFromFirebase;
window.showPlantDetails = showPlantDetails;
window.waterPlant = waterPlant;
window.scanPlant = scanPlant;
window.openAddPlantModal = openAddPlantModal;
window.showAddPlantModal = showAddPlantModal;
window.closePlantModal = closePlantModal;
window.savePlant = savePlant;
window.saveThresholds = saveThresholds;
window.exportData = exportData;
window.changeTimeRange = changeTimeRange;
window.setWateringMode = setWateringMode;
window.saveAutomaticConfig = saveAutomaticConfig;
window.toggleManualPump = toggleManualPump;
window.updateManualDuration = updateManualDuration;
window.saveScheduledConfig = saveScheduledConfig;

console.log('✅ SmartPlant Dashboard - Version avec Notifications Email - Prêt !');