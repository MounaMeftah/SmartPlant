/*
 * SMART PLANTE - Arduino UNO + ESP8266 WiFi
 * Système d'arrosage intelligent avec 3 modes
 * Compatible: Arduino UNO, Nano, Mega
 */

#include <SoftwareSerial.h>
#include <DHT.h>

// ============================================
// CONFIGURATION WiFi (ESP8266 via AT Commands)
// ============================================
#define WIFI_SSID "LENOVO 6584"
#define WIFI_PASSWORD "5126Gh8:"

// Configuration Firebase
#define FIREBASE_HOST "smartpant-4bc8f-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "PPNrPocgs5voYbAuySHcaBP9XVuXySKUizsNYQxH"

// ============================================
// PINS CONFIGURATION
// ============================================
#define DHT_PIN 2
#define DHT_TYPE DHT22
#define CAPTEUR_HUMIDITE_SOL A0
#define CAPTEUR_PLUIE A1
#define RELAIS_POMPE 7
#define LED_STATUS 13

// Communication ESP8266 (RX, TX)
SoftwareSerial esp8266(10, 11); // RX=10, TX=11

// ============================================
// OBJETS ET VARIABLES GLOBALES
// ============================================
DHT dht(DHT_PIN, DHT_TYPE);

// Variables capteurs
float temperature = 0;
float humiditeAir = 0;
int humiditeSol = 0;
int pluie = 0;

// Variables système
String modeArrosage = "automatique"; // automatique, manuel, programme
bool pompeActive = false;
unsigned long dernierArrosage = 0;
unsigned long derniereLecture = 0;
unsigned long derniereSyncCommandes = 0;
unsigned long derniereConnexion = 0;

// Configuration Mode Automatique
struct ConfigAuto {
  int seuilMin;
  int duree;
  unsigned long delaiMin;
};
ConfigAuto configAuto = {30, 5, 60};

// Configuration Mode Manuel
struct ConfigManuel {
  int duree;
};
ConfigManuel configManuel = {5};

// Configuration Mode Programmé
struct Programme {
  bool actif;
  int heure;
  int minute;
  int duree;
  bool effectue;
};
Programme prog1 = {true, 7, 0, 5, false};
Programme prog2 = {false, 18, 0, 5, false};

// Variables temps (simulé sans RTC)
int heureActuelle = 0;
int minuteActuelle = 0;
unsigned long derniereTempsMaj = 0;

// État connexion
bool wifiConnecte = false;
bool firebaseConnecte = false;

// ============================================
// SETUP
// ============================================
void setup() {
  Serial.begin(9600);
  esp8266.begin(9600);
  
  Serial.println(F("\n🌿 SmartPlant - Arduino UNO"));
  Serial.println(F("============================"));
  
  // Configuration des pins
  pinMode(RELAIS_POMPE, OUTPUT);
  pinMode(LED_STATUS, OUTPUT);
  digitalWrite(RELAIS_POMPE, LOW);
  digitalWrite(LED_STATUS, LOW);
  
  // Initialisation capteurs
  dht.begin();
  
  // Connexion WiFi
  Serial.println(F("📡 Connexion WiFi..."));
  if (connecterWiFi()) {
    Serial.println(F("✅ WiFi connecté !"));
    wifiConnecte = true;
    digitalWrite(LED_STATUS, HIGH);
  } else {
    Serial.println(F("❌ Échec connexion WiFi"));
  }
  
  // Chargement configuration
  if (wifiConnecte) {
    chargerConfigurationFirebase();
  }
  
  Serial.println(F("\n✅ Système prêt !"));
  Serial.println(F("🤖 Auto | 👆 Manuel | ⏰ Programmé"));
  Serial.println(F("============================\n"));
}

// ============================================
// LOOP PRINCIPAL
// ============================================
void loop() {
  // Mise à jour du temps simulé (1 minute = 60 secondes)
  if (millis() - derniereTempsMaj > 60000) {
    minuteActuelle++;
    if (minuteActuelle >= 60) {
      minuteActuelle = 0;
      heureActuelle++;
      if (heureActuelle >= 24) {
        heureActuelle = 0;
        // Réinitialiser les programmes
        prog1.effectue = false;
        prog2.effectue = false;
      }
    }
    derniereTempsMaj = millis();
  }
  
  // Vérifier connexion WiFi
  if (millis() - derniereConnexion > 30000) {
    verifierConnexion();
    derniereConnexion = millis();
  }
  
  // Lecture des capteurs toutes les 2 secondes
  if (millis() - derniereLecture > 2000) {
    lireCapteurs();
    if (wifiConnecte) {
      sauvegarderDonneesFirebase();
    }
    derniereLecture = millis();
  }
  
  // Synchronisation commandes Firebase
  if (wifiConnecte && millis() - derniereSyncCommandes > 1000) {
    lireCommandesFirebase();
    derniereSyncCommandes = millis();
  }
  
  // Gestion de l'arrosage selon le mode
  gererArrosage();
  
  delay(100);
}

// ============================================
// CONNEXION WiFi (ESP8266)
// ============================================
bool connecterWiFi() {
  // Reset ESP8266
  esp8266.println(F("AT+RST"));
  delay(2000);
  
  // Mode Station
  esp8266.println(F("AT+CWMODE=1"));
  delay(1000);
  
  // Connexion WiFi
  String cmd = "AT+CWJAP=\"";
  cmd += WIFI_SSID;
  cmd += "\",\"";
  cmd += WIFI_PASSWORD;
  cmd += "\"";
  
  esp8266.println(cmd);
  delay(5000);
  
  // Vérifier connexion
  if (esp8266.find("OK")) {
    return true;
  }
  return false;
}

void verifierConnexion() {
  esp8266.println(F("AT+CIPSTATUS"));
  delay(500);
  if (esp8266.find("STATUS:2") || esp8266.find("STATUS:3")) {
    if (!wifiConnecte) {
      wifiConnecte = true;
      digitalWrite(LED_STATUS, HIGH);
      Serial.println(F("✅ WiFi reconnecté"));
    }
  } else {
    if (wifiConnecte) {
      wifiConnecte = false;
      digitalWrite(LED_STATUS, LOW);
      Serial.println(F("⚠️ WiFi déconnecté"));
    }
  }
}

// ============================================
// LECTURE DES CAPTEURS
// ============================================
void lireCapteurs() {
  // Lecture DHT22
  temperature = dht.readTemperature();
  humiditeAir = dht.readHumidity();
  
  if (isnan(temperature)) temperature = 0;
  if (isnan(humiditeAir)) humiditeAir = 0;
  
  // Lecture capteur d'humidité du sol
  int valeurBrute = analogRead(CAPTEUR_HUMIDITE_SOL);
  humiditeSol = map(valeurBrute, 1023, 0, 0, 100);
  humiditeSol = constrain(humiditeSol, 0, 100);
  
  // Lecture capteur de pluie
  int valeurPluie = analogRead(CAPTEUR_PLUIE);
  pluie = map(valeurPluie, 1023, 0, 0, 100);
  pluie = constrain(pluie, 0, 100);
  
  Serial.print(F("📊 "));
  Serial.print(temperature, 1);
  Serial.print(F("°C | "));
  Serial.print(humiditeAir, 1);
  Serial.print(F("% Air | "));
  Serial.print(humiditeSol);
  Serial.print(F("% Sol | "));
  Serial.print(pluie);
  Serial.println(F("% Pluie"));
}

// ============================================
// SAUVEGARDE FIREBASE
// ============================================
void sauvegarderDonneesFirebase() {
  // Envoi température
  envoyerFirebase("/capteurs/temperature.json", String(temperature, 1));
  
  // Envoi humidité air
  envoyerFirebase("/capteurs/humiditeAir.json", String(humiditeAir, 1));
  
  // Envoi humidité sol
  envoyerFirebase("/capteurs/humiditeSol.json", String(humiditeSol));
  
  // Envoi pluie
  envoyerFirebase("/capteurs/pluie.json", String(pluie));
  
  // Envoi état système
  envoyerFirebase("/systeme/mode.json", "\"" + modeArrosage + "\"");
  envoyerFirebase("/systeme/pompeActive.json", pompeActive ? "true" : "false");
}

void envoyerFirebase(String path, String valeur) {
  // Fermer connexion précédente
  esp8266.println(F("AT+CIPCLOSE"));
  delay(100);
  
  // Connexion TCP
  String cmd = "AT+CIPSTART=\"TCP\",\"";
  cmd += FIREBASE_HOST;
  cmd += "\",80";
  esp8266.println(cmd);
  delay(1000);
  
  if (!esp8266.find("OK")) {
    return;
  }
  
  // Construire requête HTTP PUT
  String httpRequest = "PUT " + path + "?auth=" + FIREBASE_AUTH + " HTTP/1.1\r\n";
  httpRequest += "Host: " + String(FIREBASE_HOST) + "\r\n";
  httpRequest += "Content-Type: application/json\r\n";
  httpRequest += "Content-Length: " + String(valeur.length()) + "\r\n";
  httpRequest += "\r\n";
  httpRequest += valeur;
  
  // Envoyer taille
  cmd = "AT+CIPSEND=";
  cmd += String(httpRequest.length());
  esp8266.println(cmd);
  delay(500);
  
  if (esp8266.find(">")) {
    // Envoyer requête
    esp8266.print(httpRequest);
    delay(1000);
  }
  
  // Fermer connexion
  esp8266.println(F("AT+CIPCLOSE"));
  delay(100);
}

// ============================================
// LECTURE CONFIGURATION FIREBASE
// ============================================
void chargerConfigurationFirebase() {
  Serial.println(F("📥 Chargement configuration..."));
  
  // Charger mode
  String mode = lireFirebase("/commandes/mode.json");
  if (mode.length() > 0) {
    mode.replace("\"", "");
    modeArrosage = mode;
    Serial.print(F("🎮 Mode: "));
    Serial.println(modeArrosage);
  }
  
  // Charger config automatique
  String seuilStr = lireFirebase("/arrosage/automatique/seuilMin.json");
  if (seuilStr.length() > 0) {
    configAuto.seuilMin = seuilStr.toInt();
  }
  
  String dureeStr = lireFirebase("/arrosage/automatique/duree.json");
  if (dureeStr.length() > 0) {
    configAuto.duree = dureeStr.toInt();
  }
  
  String delaiStr = lireFirebase("/arrosage/automatique/delaiMin.json");
  if (delaiStr.length() > 0) {
    configAuto.delaiMin = delaiStr.toInt();
  }
  
  Serial.print(F("🤖 Auto: "));
  Serial.print(configAuto.seuilMin);
  Serial.print(F("% | "));
  Serial.print(configAuto.duree);
  Serial.print(F("s | "));
  Serial.print(configAuto.delaiMin);
  Serial.println(F("min"));
  
  // Charger config manuel
  dureeStr = lireFirebase("/arrosage/manuel/duree.json");
  if (dureeStr.length() > 0) {
    configManuel.duree = dureeStr.toInt();
  }
  
  Serial.print(F("👆 Manuel: "));
  Serial.print(configManuel.duree);
  Serial.println(F("s"));
  
  Serial.println(F("✅ Configuration chargée !"));
}

String lireFirebase(String path) {
  // Fermer connexion précédente
  esp8266.println(F("AT+CIPCLOSE"));
  delay(100);
  
  // Connexion TCP
  String cmd = "AT+CIPSTART=\"TCP\",\"";
  cmd += FIREBASE_HOST;
  cmd += "\",80";
  esp8266.println(cmd);
  delay(1000);
  
  if (!esp8266.find("OK")) {
    return "";
  }
  
  // Construire requête HTTP GET
  String httpRequest = "GET " + path + "?auth=" + FIREBASE_AUTH + " HTTP/1.1\r\n";
  httpRequest += "Host: " + String(FIREBASE_HOST) + "\r\n";
  httpRequest += "Connection: close\r\n\r\n";
  
  // Envoyer taille
  cmd = "AT+CIPSEND=";
  cmd += String(httpRequest.length());
  esp8266.println(cmd);
  delay(500);
  
  String reponse = "";
  if (esp8266.find(">")) {
    // Envoyer requête
    esp8266.print(httpRequest);
    delay(2000);
    
    // Lire réponse
    while (esp8266.available()) {
      char c = esp8266.read();
      reponse += c;
    }
  }
  
  // Fermer connexion
  esp8266.println(F("AT+CIPCLOSE"));
  delay(100);
  
  // Extraire valeur JSON
  int debut = reponse.lastIndexOf('\n');
  if (debut > 0) {
    reponse = reponse.substring(debut + 1);
    reponse.trim();
  }
  
  return reponse;
}

// ============================================
// LECTURE COMMANDES FIREBASE
// ============================================
void lireCommandesFirebase() {
  // Lire le mode
  String mode = lireFirebase("/commandes/mode.json");
  if (mode.length() > 0) {
    mode.replace("\"", "");
    if (mode != modeArrosage) {
      modeArrosage = mode;
      Serial.print(F("🔄 Mode: "));
      Serial.println(modeArrosage);
      chargerConfigurationFirebase();
    }
  }
  
  // Commande manuelle
  if (modeArrosage == "manuel") {
    String pompeCmd = lireFirebase("/commandes/activerPompe.json");
    if (pompeCmd == "true" && !pompeActive) {
      Serial.println(F("👆 Commande manuelle"));
      
      String dureeStr = lireFirebase("/commandes/dureeManuelle.json");
      int duree = dureeStr.length() > 0 ? dureeStr.toInt() : configManuel.duree;
      
      activerPompe(duree * 1000, "manuel");
      
      // Réinitialiser commande
      envoyerFirebase("/commandes/activerPompe.json", "false");
    }
  }
}

// ============================================
// GESTION DE L'ARROSAGE
// ============================================
void gererArrosage() {
  if (pompeActive) {
    return;
  }
  
  if (modeArrosage == "automatique") {
    gererArrosageAutomatique();
  } 
  else if (modeArrosage == "programme") {
    gererArrosageProgramme();
  }
}

void gererArrosageAutomatique() {
  bool besoinArrosage = (humiditeSol < configAuto.seuilMin);
  bool pasDePluie = (pluie < 30);
  unsigned long delaiMs = configAuto.delaiMin * 60000UL;
  bool delaiRespect = ((millis() - dernierArrosage) > delaiMs);
  
  if (besoinArrosage && pasDePluie && delaiRespect && !pompeActive) {
    Serial.println(F("🤖 MODE AUTO - Arrosage déclenché"));
    Serial.print(F("   Sol: "));
    Serial.print(humiditeSol);
    Serial.print(F("% < "));
    Serial.print(configAuto.seuilMin);
    Serial.println(F("%"));
    
    activerPompe(configAuto.duree * 1000, "automatique");
  }
}

void gererArrosageProgramme() {
  // Programme 1
  if (prog1.actif && !prog1.effectue) {
    if (heureActuelle == prog1.heure && minuteActuelle == prog1.minute) {
      Serial.print(F("⏰ PROGRAMME 1 - "));
      Serial.print(prog1.heure);
      Serial.print(F(":"));
      Serial.println(prog1.minute);
      
      activerPompe(prog1.duree * 1000, "programme");
      prog1.effectue = true;
    }
  }
  
  // Programme 2
  if (prog2.actif && !prog2.effectue) {
    if (heureActuelle == prog2.heure && minuteActuelle == prog2.minute) {
      Serial.print(F("⏰ PROGRAMME 2 - "));
      Serial.print(prog2.heure);
      Serial.print(F(":"));
      Serial.println(prog2.minute);
      
      activerPompe(prog2.duree * 1000, "programme");
      prog2.effectue = true;
    }
  }
}

// ============================================
// ACTIVATION/DÉSACTIVATION POMPE
// ============================================
void activerPompe(unsigned long dureeMs, String mode) {
  Serial.println(F("💧========================================"));
  Serial.print(F("💧 ARROSAGE - Mode: "));
  Serial.println(mode);
  Serial.print(F("💧 Durée: "));
  Serial.print(dureeMs / 1000);
  Serial.println(F("s"));
  Serial.print(F("💧 Humidité sol avant: "));
  Serial.print(humiditeSol);
  Serial.println(F("%"));
  Serial.println(F("💧========================================"));
  
  // Activer la pompe
  digitalWrite(RELAIS_POMPE, HIGH);
  pompeActive = true;
  
  if (wifiConnecte) {
    envoyerFirebase("/systeme/pompeActive.json", "true");
  }
  
  unsigned long debut = millis();
  dernierArrosage = millis();
  
  // Attendre la fin de l'arrosage
  while (millis() - debut < dureeMs) {
    // Continuer à lire les capteurs
    if (millis() - derniereLecture > 2000) {
      lireCapteurs();
      derniereLecture = millis();
    }
    delay(100);
  }
  
  // Désactiver la pompe
  desactiverPompe();
  
  // Sauvegarder historique
  if (wifiConnecte) {
    sauvegarderHistoriqueArrosage(mode, dureeMs / 1000, humiditeSol);
  }
  
  Serial.println(F("✅ Arrosage terminé !"));
}

void desactiverPompe() {
  digitalWrite(RELAIS_POMPE, LOW);
  pompeActive = false;
  
  if (wifiConnecte) {
    envoyerFirebase("/systeme/pompeActive.json", "false");
  }
  
  Serial.println(F("⏸️ Pompe désactivée"));
}

// ============================================
// HISTORIQUE ARROSAGE
// ============================================
void sauvegarderHistoriqueArrosage(String mode, int duree, int humiditeSolAvant) {
  unsigned long timestamp = millis() / 1000;
  String path = "/historique_arrosage/" + String(timestamp);
  
  // Créer JSON
  String json = "{";
  json += "\"timestamp\":" + String(timestamp) + ",";
  json += "\"mode\":\"" + mode + "\",";
  json += "\"duree\":" + String(duree) + ",";
  json += "\"humiditeSolAvant\":" + String(humiditeSolAvant) + ",";
  json += "\"reussi\":true";
  json += "}";
  
  // Envoyer à Firebase
  envoyerFirebase(path + ".json", json);
  
  Serial.print(F("📝 Historique sauvegardé - Mode: "));
  Serial.println(mode);
}

