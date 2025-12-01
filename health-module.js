/* ============================================
   SMARTPLANT - MODULE SANTÉ DES PLANTES
   Détection des maladies par IA (Roboflow API)
   ============================================ */

// Configuration API Roboflow
const ROBOFLOW_CONFIG = {
    API_URL: 'https://detect.roboflow.com/plant_disease-js4pr/2',
    API_KEY: 'jSVNDbrSrPadgAdEJYLz'
};

// Variables globales
let selectedHealthFile = null;
let analysisHistory = [];

// ============================================
// INITIALISATION
// ============================================
function initHealthPage() {
    console.log('🏥 Module Santé initialisé');
    
    const uploadArea = document.getElementById('healthUploadArea');
    const fileInput = document.getElementById('healthFileInput');
    const analyzeBtn = document.getElementById('healthAnalyzeBtn');
    
    if (!uploadArea || !fileInput || !analyzeBtn) {
        console.error('❌ Éléments de la page Santé non trouvés');
        return;
    }
    
    // Gestion du clic sur la zone d'upload
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Gestion de la sélection de fichier
    fileInput.addEventListener('change', (e) => {
        handleHealthFileSelect(e.target.files[0]);
    });
    
    // Gestion du drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleHealthFileSelect(e.dataTransfer.files[0]);
    });
    
    // Bouton d'analyse
    analyzeBtn.addEventListener('click', () => {
        analyzeHealthImage();
    });
    
    // Charger l'historique depuis Firebase
    loadAnalysisHistory();
}

// ============================================
// GESTION DU FICHIER
// ============================================
function handleHealthFileSelect(file) {
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showHealthError('Veuillez sélectionner une image valide (JPG, PNG)');
        return;
    }
    
    selectedHealthFile = file;
    
    // Afficher l'aperçu
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('healthImagePreview');
        const previewContainer = document.getElementById('healthPreviewContainer');
        const resultsContainer = document.getElementById('healthResultsContainer');
        
        preview.src = e.target.result;
        previewContainer.style.display = 'block';
        resultsContainer.style.display = 'none';
        
        // Scroll vers l'aperçu
        previewContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    reader.readAsDataURL(file);
    
    console.log('📸 Image sélectionnée:', file.name);
}

// ============================================
// ANALYSE DE L'IMAGE
// ============================================
async function analyzeHealthImage() {
    if (!selectedHealthFile) {
        showHealthError('Veuillez d\'abord sélectionner une image');
        return;
    }
    
    const loadingDiv = document.getElementById('healthLoading');
    const resultsDiv = document.getElementById('healthResultsContainer');
    const analyzeBtn = document.getElementById('healthAnalyzeBtn');
    
    // Afficher le chargement
    loadingDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    analyzeBtn.disabled = true;
    
    // Scroll vers le chargement
    loadingDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    try {
        console.log('🔬 Analyse en cours...');
        
        // Convertir l'image en base64
        const base64Image = await fileToBase64(selectedHealthFile);
        
        // Appel à l'API Roboflow
        const response = await fetch(`${ROBOFLOW_CONFIG.API_URL}?api_key=${ROBOFLOW_CONFIG.API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: base64Image
        });
        
        if (!response.ok) {
            throw new Error(`Erreur API: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Résultats reçus:', data);
        
        // Afficher les résultats
        displayHealthResults(data);
        
        // Sauvegarder dans l'historique
        saveToHistory(data);
        
    } catch (error) {
        console.error('❌ Erreur analyse:', error);
        showHealthError('Erreur lors de l\'analyse: ' + error.message);
    } finally {
        loadingDiv.style.display = 'none';
        analyzeBtn.disabled = false;
    }
}

// ============================================
// AFFICHAGE DES RÉSULTATS
// ============================================
function displayHealthResults(data) {
    const resultsContent = document.getElementById('healthResultsContent');
    const resultsContainer = document.getElementById('healthResultsContainer');
    
    resultsContent.innerHTML = '';
    
    if (!data.predictions || data.predictions.length === 0) {
        // Aucune maladie détectée
        resultsContent.innerHTML = `
            <div class="result-healthy">
                <div class="result-icon">✅</div>
                <div class="result-title">Plante en bonne santé !</div>
                <div class="result-message">
                    Aucune maladie détectée sur votre plante. 
                    Continuez à en prendre soin ! 🌱
                </div>
            </div>
        `;
    } else {
        // Maladies détectées
        let html = '<div class="disease-detected">';
        html += '<h3 style="margin-bottom: 25px; color: var(--danger);">⚠️ Maladies Détectées</h3>';
        
        data.predictions.forEach((prediction, index) => {
            const confidence = (prediction.confidence * 100).toFixed(1);
            const confidenceClass = confidence >= 80 ? 'confidence-high' : 
                                   confidence >= 50 ? 'confidence-medium' : 'confidence-low';
            
            html += `
                <div class="disease-card">
                    <div class="disease-header">
                        <div class="disease-title">
                            <span>🦠</span>
                            <span>Maladie #${index + 1}: ${prediction.class}</span>
                        </div>
                        <span class="confidence-badge ${confidenceClass}">
                            ${confidence}% confiance
                        </span>
                    </div>
                    
                    <div class="disease-info">
                        <div class="info-item">
                            <span class="info-label">Position X</span>
                            <span class="info-value">${Math.round(prediction.x)} px</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Position Y</span>
                            <span class="info-value">${Math.round(prediction.y)} px</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Largeur</span>
                            <span class="info-value">${Math.round(prediction.width)} px</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Hauteur</span>
                            <span class="info-value">${Math.round(prediction.height)} px</span>
                        </div>
                    </div>
                    
                    ${getDiseaseTreatment(prediction.class)}
                </div>
            `;
        });
        
        html += '</div>';
        resultsContent.innerHTML = html;
    }
    
    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// RECOMMANDATIONS DE TRAITEMENT
// ============================================
function getDiseaseTreatment(diseaseName) {
    const treatments = {
        'mildiou': {
            icon: '🍃',
            treatment: 'Retirez les feuilles infectées et appliquez un fongicide à base de cuivre.',
            prevention: 'Évitez l\'arrosage par aspersion et assurez une bonne circulation d\'air.'
        },
        'oïdium': {
            icon: '💨',
            treatment: 'Utilisez un fongicide approprié ou une solution de bicarbonate de soude.',
            prevention: 'Maintenez un espacement adéquat entre les plantes.'
        },
        'pourriture': {
            icon: '🦠',
            treatment: 'Retirez les parties affectées et réduisez l\'arrosage.',
            prevention: 'Assurez un bon drainage et évitez l\'excès d\'humidité.'
        },
        'default': {
            icon: '⚕️',
            treatment: 'Consultez un spécialiste pour un diagnostic précis.',
            prevention: 'Surveillez régulièrement vos plantes et maintenez de bonnes conditions de culture.'
        }
    };
    
    // Chercher le traitement correspondant
    let treatment = treatments.default;
    for (const key in treatments) {
        if (diseaseName.toLowerCase().includes(key)) {
            treatment = treatments[key];
            break;
        }
    }
    
    return `
        <div style="margin-top: 20px; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 10px;">
            <h4 style="margin-bottom: 15px; color: var(--primary);">
                ${treatment.icon} Recommandations
            </h4>
            <p style="margin-bottom: 10px;">
                <strong>Traitement:</strong> ${treatment.treatment}
            </p>
            <p style="color: var(--text-secondary);">
                <strong>Prévention:</strong> ${treatment.prevention}
            </p>
        </div>
    `;
}

// ============================================
// HISTORIQUE
// ============================================
function saveToHistory(data) {
    const timestamp = Date.now();
    const diseaseDetected = data.predictions && data.predictions.length > 0;
    
    const historyItem = {
        timestamp: timestamp,
        image: document.getElementById('healthImagePreview').src,
        diseaseDetected: diseaseDetected,
        diseases: diseaseDetected ? data.predictions.map(p => ({
            class: p.class,
            confidence: (p.confidence * 100).toFixed(1)
        })) : [],
        date: new Date(timestamp).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    };
    
    // Ajouter à l'historique local
    analysisHistory.unshift(historyItem);
    
    // Limiter à 20 entrées
    if (analysisHistory.length > 20) {
        analysisHistory = analysisHistory.slice(0, 20);
    }
    
    // Sauvegarder dans Firebase
    if (typeof firebase !== 'undefined' && firebase.database) {
        const historyRef = firebase.database().ref('historique_sante/' + timestamp);
        historyRef.set({
            timestamp: timestamp,
            diseaseDetected: diseaseDetected,
            diseases: historyItem.diseases,
            date: historyItem.date
        }).catch(error => {
            console.error('❌ Erreur sauvegarde historique:', error);
        });
    }
    
    // Mettre à jour l'affichage
    displayAnalysisHistory();
    
    console.log('💾 Analyse sauvegardée dans l\'historique');
}

function loadAnalysisHistory() {
    if (typeof firebase === 'undefined' || !firebase.database) {
        console.log('⚠️ Firebase non disponible pour l\'historique');
        return;
    }
    
    const historyRef = firebase.database().ref('historique_sante');
    historyRef.orderByChild('timestamp').limitToLast(20).once('value')
        .then(snapshot => {
            analysisHistory = [];
            snapshot.forEach(child => {
                analysisHistory.unshift(child.val());
            });
            displayAnalysisHistory();
            console.log('✅ Historique chargé:', analysisHistory.length, 'analyses');
        })
        .catch(error => {
            console.error('❌ Erreur chargement historique:', error);
        });
}

function displayAnalysisHistory() {
    const historyContainer = document.getElementById('healthHistory');
    
    if (analysisHistory.length === 0) {
        historyContainer.innerHTML = `
            <div class="alert alert-info">
                <span style="font-size: 24px;">ℹ️</span>
                <div>
                    <strong>Aucune analyse</strong>
                    <p style="margin-top: 5px; color: var(--text-secondary);">
                        Commencez par télécharger une photo de votre plante
                    </p>
                </div>
            </div>
        `;
        return;
    }
    
    let html = '';
    analysisHistory.forEach(item => {
        const statusClass = item.diseaseDetected ? 'status-disease' : 'status-healthy';
        const statusText = item.diseaseDetected ? '🦠 Malade' : '✅ Sain';
        const diseaseInfo = item.diseaseDetected ? 
            `<p style="color: var(--text-secondary); font-size: 14px; margin-top: 5px;">
                ${item.diseases.length} maladie(s) détectée(s)
            </p>` : '';
        
        html += `
            <div class="history-item" onclick="showHistoryDetails(${item.timestamp})">
                ${item.image ? `<img src="${item.image}" class="history-image" alt="Analyse">` : ''}
                <div>
                    <h4 style="margin-bottom: 5px;">Analyse du ${item.date}</h4>
                    ${diseaseInfo}
                </div>
                <div class="history-info">
                    <span class="history-date">${item.date}</span>
                    <span class="history-status ${statusClass}">${statusText}</span>
                </div>
            </div>
        `;
    });
    
    historyContainer.innerHTML = html;
}

function showHistoryDetails(timestamp) {
    const item = analysisHistory.find(h => h.timestamp === timestamp);
    if (!item) return;
    
    // Créer une alerte avec les détails
    let message = `Analyse du ${item.date}\n\n`;
    if (item.diseaseDetected) {
        message += 'Maladies détectées:\n';
        item.diseases.forEach((d, i) => {
            message += `${i + 1}. ${d.class} (${d.confidence}% confiance)\n`;
        });
    } else {
        message += 'Aucune maladie détectée ✅';
    }
    
    alert(message);
}

// ============================================
// UTILITAIRES
// ============================================
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showHealthError(message) {
    // Créer une alerte d'erreur
    const resultsContent = document.getElementById('healthResultsContent');
    const resultsContainer = document.getElementById('healthResultsContainer');
    
    resultsContent.innerHTML = `
        <div class="alert alert-danger">
            <span style="font-size: 24px;">❌</span>
            <div>
                <strong>Erreur</strong>
                <p style="margin-top: 5px; color: var(--text-secondary);">
                    ${message}
                </p>
            </div>
        </div>
    `;
    
    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================
// INITIALISATION AU CHARGEMENT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Attendre que Firebase soit initialisé
    setTimeout(() => {
        initHealthPage();
    }, 1000);
});

console.log('🏥 Module Santé chargé');