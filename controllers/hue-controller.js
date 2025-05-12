class HueController {
    // Inizializza la classe HueController con il client MQTT e axios
    constructor(mqttClient, axiosP) {
        this.client = mqttClient;
        this.axios = axiosP;
        
        // Configurazione Philips Hue
        this.config = {
            username: 'newdeveloper', // Sostituisci con il tuo username Hue
            bridgeIp: 'localhost:8000'
        };
        
        // Inizializza la connessione con il bridge Hue
        this.updateRobotStatus('idle');
        this.updateParkingStatus(false);
        this.updateEntryStatus(false);
        
        // Sottoscrivi al topic MQTT per gli aggiornamenti di stato del robot
        this.subscribeToTopics();
    }
    
    // Sottoscrivi ai topic MQTT per gli aggiornamenti di stato del robot, parcheggio e entrata
    subscribeToTopics() {
        this.client.subscribe('robocharge/status/robot');
        this.client.subscribe('robocharge/status/parcheggio');
        this.client.subscribe('robocharge/status/entrata');
       
        this.entryActive = false;
        this.entryTimer = null;
    
        this.client.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                
                switch(topic) {
                    case 'robocharge/status/robot':
                        this.updateRobotStatus(data.status);
                        break;
                    
                    case 'robocharge/status/parcheggio':
                        this.updateParkingStatus(data.full);
                        break;
                    
                    case 'robocharge/status/entrata':
                        this.updateEntryStatus(data.entered);
                        break;
                }
            } catch (error) {
                console.error(`Errore durante l'elaborazione del messaggio MQTT: ${error.message}`);
            }
        });
       
        //console.log('Sottoscritto ai topic MQTT per stato robot, parcheggio ed entrata');
    }
    
    async updateRobotStatus(robotStatus) {
        switch (robotStatus) {
            case 'charging':
                this.lightState = { on: true, hue: 0, sat: 254, bri: 254 };
                //console.log('Impostazione lampadina a ROSSO (ricarica in corso)');
                break;
            case 'moving':
                this.lightState = { on: true, hue: 10000, sat: 254, bri: 254 };
                //console.log('Impostazione lampadina a GIALLO (robot in movimento)');
                break;
            case 'idle':
            default:
                this.lightState = { on: true, hue: 25500, sat: 254, bri: 254 };
                //console.log('Impostazione lampadina a VERDE (robot libero)');
                break;
        }

        await this.setLightState(1, this.lightState);
    }
    
    async updateParkingStatus(isFull) {
        if (isFull) {
            this.lightState = { on: true, hue: 0, sat: 254, bri: 254 };
            //console.log('Impostazione lampadina a ROSSO (parcheggio pieno)');
            await this.setLightState(2, this.lightState);
        } else {
            this.lightState = { on: true, hue: 25500, sat: 254, bri: 254 };
            //console.log('Impostazione lampadina a VERDE (parcheggio con posti liberi)');
            await this.setLightState(2, this.lightState);
        }
    }
    
    async updateEntryStatus(entered) {
        if (entered) {
            // Annulla il timer precedente se esistente
            if (this.entryTimer) {
                clearTimeout(this.entryTimer);
            }
           
            // Imposta un timer per riportare la luce a rosso dopo 30 secondi
            this.entryTimer = setTimeout(() => {
                this.lightState = { on: true, hue: 0, sat: 254, bri: 254 };
                //console.log('Impostazione lampadina a ROSSO (entrata chiusa)');
                this.setLightState(3, this.lightState);
            }, 30000);
    
            this.lightState = { on: true, hue: 25500, sat: 254, bri: 254 };
            //console.log('Impostazione lampadina a VERDE (entrata attiva)');
            await this.setLightState(3, this.lightState);
        } else {
            this.lightState = { on: true, hue: 0, sat: 254, bri: 254 };
            //console.log('Impostazione lampadina a ROSSO (entrata chiusa)');
            await this.setLightState(3, this.lightState);
        }
    }
    
    // Metodo per cambiare il colore della luce
    // lightId: ID della luce da modificare (1, 2 o 3)
    async setLightState(lightId) {
        try {
            await this.axios.put(`http://${this.config.bridgeIp}/api/${this.config.username}/lights/${lightId}/state`, {
                on: this.lightState.on,
                hue: this.lightState.hue,  // Valore tra 0 e 65535
                sat: this.lightState.sat,  // Valore tra 0 e 254
                bri: this.lightState.bri   // Valore tra 1 e 254
            });
            //console.log(`Colore della luce ${lightId} cambiato con successo`);
        } catch (error) {
            console.error(`Errore durante la modifica del colore della luce: ${error.message}`);
        }
    }
}

module.exports = HueController;