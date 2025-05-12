class MQTTClient {
    //Inizializzo il client MQTT
    constructor() {
        this.client = null;
        this.topics = {
            //chargingStatus: 'robocharge/charging/',
            notifications: 'robocharge/notification/#'
        };
        this.messageHandlers = {};
        this.connected = false;
    }
  
    // Connessione al MQTT broker
    connect() {
        // Controllo se MQTT.js è disponibile
        if (typeof mqtt === 'undefined') {
            console.error('MQTT.js library not loaded');
            return;
        }
    
        try {
            // Connessione al broker
            const brokerUrl = 'ws://localhost:9001'; // WebSocket MQTT broker
            const clientId = 'web-client-' + Math.random().toString(16).substring(2, 10);
            
            this.client = mqtt.connect(brokerUrl, { clientId: clientId });
    
            // Set up degli event handlers
            this.client.on('connect', () => {
                console.log('Connected to MQTT broker');
                this.connected = true;
                this.subscribeToDefaultTopics();
                this.notifyConnectionStatus(true);
            });
    
            this.client.on('error', (error) => {
                console.error('MQTT connection error:', error);
                this.notifyConnectionStatus(false);
            });
    
            this.client.on('offline', () => {
                console.log('MQTT client is offline');
                this.connected = false;
                this.notifyConnectionStatus(false);
            });
    
            this.client.on('reconnect', () => {
                console.log('Trying to reconnect to MQTT broker...');
            });
    
            this.client.on('message', (topic, message) => {
                const messageStr = message.toString();
                try {
                    const parsedMessage = JSON.parse(messageStr);
                    this.handleMessage(topic, parsedMessage);
                } catch (e) {
                    console.error('Failed to parse MQTT message:', e);
                    this.handleMessage(topic, messageStr);
                }
            });
        } catch (error) {
            console.error('Failed to connect to MQTT broker:', error);
        }
    }
  
    // Iscrizione ai topic di default
    subscribeToDefaultTopics() {
        if (!this.connected || !this.client) return;
        
        Object.values(this.topics).forEach(topic => {
            this.client.subscribe(topic, (err) => {
            if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err);
            } else {
                console.log(`Subscribed to ${topic}`);
            }
            });
        });
    }
  
    // Iscrizione a un topic specifico
    subscribe(topic, callback) {
        if (!this.connected || !this.client) {
            console.warn('Cannot subscribe: MQTT client not connected');
            return;
        }
        
        this.client.subscribe(topic, (err) => {
            if (err) {
                console.error(`Failed to subscribe to ${topic}:`, err);
                return;
            }
            
            console.log(`Subscribed to ${topic}`);
            
            // Store callback for this topic
            if (callback && typeof callback === 'function') {
                if (!this.messageHandlers[topic]) {
                    this.messageHandlers[topic] = [];
                }
                this.messageHandlers[topic].push(callback);
            }
        });
    }
  
    // Pubblicazione di un messaggio su un topic
    publish(topic, message) {
        if (!this.connected || !this.client) {
            console.warn('Cannot publish: MQTT client not connected');
            return false;
        }
        
        const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
        
        this.client.publish(topic, messageStr, {}, (err) => {
            if (err) {
                console.error(`Failed to publish to ${topic}:`, err);
                return false;
            }
            console.log(`Published to ${topic}: ${messageStr}`);
        });
        
        return true;
    }
  
    // Gestione di un messaggio ricevuto
    handleMessage(topic, message) {
        console.log(`Received message on ${topic}:`, message);
    
        // Gestione di messaggi topic specifici per aggiornamenti UI
        this.updateUI(topic, message);
    }
  
    // Registrazione di un handler per un topic specifico
    onMessage(topic, callback) {
        if (!this.messageHandlers[topic]) {
            this.messageHandlers[topic] = [];
            
            // Iscrizione al topic se connesso
            if (this.connected && this.client) {
                this.subscribe(topic);
            }
        }
        
        this.messageHandlers[topic].push(callback);
    }
  
    // Aggiornamento dell'interfaccia utente in base al messaggio ricevuto
    updateUI(topic, message) {

        this.showNotification(message);

        /*switch (topic) {
            case this.topics.chargingStatus:
                this.updateChargingStatus(message);
            break;
            
            case this.topics.notifications:
                this.showNotification(message);
            break;
        }*/
    }
  
    // Mostra una notifica all'utente
    showNotification(message) {
        const userId = window.USER_ID || null;

        if (message.userId != userId) return;

        //Controllo di sicurezza se Bootstrap è disponibile
        if (typeof bootstrap !== 'undefined') {
            const toastContainer = document.getElementById('toast-container');
            if (!toastContainer) {
                // Create toast container se non esiste
                const container = document.createElement('div');
                container.id = 'toast-container';
                container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
                document.body.appendChild(container);
            }
            
            //const data = JSON.parse(message.toString());
            const toastId = 'toast-' + Date.now();
            const toastElement = document.createElement('div');
            toastElement.id = toastId;
            toastElement.className = 'toast';
            toastElement.setAttribute('role', 'alert');
            toastElement.setAttribute('aria-live', 'assertive');
            toastElement.setAttribute('aria-atomic', 'true');
            
            toastElement.innerHTML = `
                <div class="toast-header">
                    <strong class="me-auto">${message.title || 'Notifica'}</strong>
                    <small>${new Date().toLocaleTimeString()}</small>
                    <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body">
                    ${message.message}
                </div>
            `;
            
            document.getElementById('toast-container').appendChild(toastElement);
            
            const toast = new bootstrap.Toast(toastElement, { autohide: false });
            toast.show();
        } else {
            // Fallback to alert se Bootstrap non è disponibile
            alert(`${message.title || 'Notification'}: ${message.body || message.toString()}`);
        }
    }
  
    // Aggiorna lo stato della connessione nell'interfaccia utente
    notifyConnectionStatus(isConnected) {
        const statusElement = document.getElementById('mqtt-connection-status');
        if (statusElement) {
            statusElement.innerHTML = isConnected 
            ? '<span class="badge bg-success">Connected</span>' 
            : '<span class="badge bg-danger">Disconnected</span>';
        }
    }
  
    // Disconnessione dal broker MQTT
    disconnect() {
        if (this.client && this.connected) {
            this.client.end();
            this.connected = false;
            console.log('Disconnected from MQTT broker');
        }
    }
}
  
// Inizializzazione del client MQTT all'avvio
document.addEventListener('DOMContentLoaded', function() {
    // Create global MQTT client instance
    window.mqttClient = new MQTTClient();
    
    // Connessione al MQTT broker
    window.mqttClient.connect();
});