class ChargerController {
    // Costruttore della classe ChargerController
    // Inizializza il client MQTT e la coda di ricarica
    constructor(mqttClient) {
        this.client = mqttClient;
        this.chargingQueue = [];
        this.currentCharging = null;
        this.isActive = false;
        this.robotStatus = 'idle'; // idle, charging, moving
    }

    // Metodo per pubblicare lo stato del robot su MQTT
    publishRobotStatus() {
        this.client.publish('robocharge/status/robot', JSON.stringify({
            status: this.robotStatus,
            timestamp: new Date().toISOString()
        }));
        //console.log(`Stato del robot pubblicato su MQTT: ${this.robotStatus}`);
    }
    
    // Metodo per iniziare/riprendere la ricarica
    startCharging() {
        this.isActive = true;
        this.processQueue();
    }
    
    // Metodo per fermare la ricarica
    stopCharging() {
        this.isActive = false;
        this.robotStatus = 'idle';

        this.publishRobotStatus();
        
        if (this.currentCharging) {
            this.client.publish('robocharge/notification/charging-interrupted', JSON.stringify({
                reservationId: this.currentCharging.reservationId,
                userId: this.currentCharging.userId,
                message: 'Ricarica interrotta',
                title: 'Notifica di ricarica'
            }));
            this.currentCharging = null;
        }
    }
    
    // Metodo per gestire le richieste di ricarica
    addToQueue(request) {
        // Controlla se la richiesta è già in coda
        if (this.chargingQueue.find(item => item.reservationId === request.reservationId)) return;
        if (this.currentCharging){
            if (this.currentCharging.reservationId === request.reservationId) return;
        }
        
        // Aggiungi alla coda
        this.chargingQueue.push({
            ...request,
            queuedAt: new Date()
        });
        //console.log("Ricarica inserita nella coda");
        
        // Notifica il cliente che la ricarica è in coda
        this.client.publish('robocharge/notification/charging-queued', JSON.stringify({
            reservationId: request.reservationId,
            userId: request.userId,
            message: 'Ricarica del veicolo in coda. Posizione: ' + this.chargingQueue.length,
            title: 'Notifica di ricarica'
        }));
        
        // Processa la coda se il robot è libero
        if (this.isActive && this.robotStatus === 'idle') {
            this.processQueue();
        }
    }
    
    // Metodo per gestire la cancellazione delle richieste di ricarica
    removeFromQueue(reservationId) {
        // Rimuovi dalla coda
        this.chargingQueue = this.chargingQueue.filter(item => item.reservationId !== reservationId);
        
        // Se la richiesta corrente è stata cancellata, interrompi la ricarica
        if (this.currentCharging && this.currentCharging.reservationId === reservationId) {
            this.currentCharging = null;
            this.robotStatus = 'idle';

            this.publishRobotStatus();
            
            // Processa la prossima macchina in coda
            if (this.isActive) {
                this.processQueue();
            }
        }
    }
    
    // Metodo per processare la coda di ricarica
    processQueue() {
        if (!this.isActive || this.robotStatus !== 'idle' || this.chargingQueue.length === 0) {
            return;
        }
        
        // Prendi il prossimo in coda
        this.currentCharging = this.chargingQueue.shift();
        this.robotStatus = 'moving';
        
        this.publishRobotStatus();

        // Simula il movimento
        setTimeout(() => {
            if (!this.currentCharging) return; // Safety check
            
            this.robotStatus = 'charging';

            this.publishRobotStatus();

            // Notifica l'inizio della ricarica all'utente
            this.client.publish('robocharge/notification/charging-started', JSON.stringify({
                reservationId: this.currentCharging.reservationId,
                userId: this.currentCharging.userId,
                message: 'Ricarica del tuo veicolo iniziata',
                title: 'Notifica di ricarica'
            }));
            
            // Simula la ricarica (30-60 secondi)
            const chargingTime = 30000 + Math.random() * 30000;
            setTimeout(() => {
                if (!this.currentCharging) return; // Controlla se la ricarica è stata interrotta
                
                // Notifica il completamento della ricarica
                this.client.publish('robocharge/charging/completed', JSON.stringify({
                    reservationId: this.currentCharging.reservationId,
                    userId: this.currentCharging.userId,
                    spotId: this.currentCharging.spotId,
                    targetBatteryPercentage: this.currentCharging.targetBatteryPercentage
                }));
                
                this.currentCharging = null;
                this.robotStatus = 'idle';

                this.publishRobotStatus();
                
                // Processa la prossima macchina in coda
                this.processQueue();
            }, chargingTime);
        }, 10000); // Simula il movimento (10 secondi)
    }
    
    // Metodo per ottenere lo stato del robot
    getStatus() {
        return {
            isActive: this.isActive,
            robotStatus: this.robotStatus,
            currentCharging: this.currentCharging,
            queueLength: this.chargingQueue.length,
            queue: this.chargingQueue
        };
    }
}
  
module.exports = ChargerController;