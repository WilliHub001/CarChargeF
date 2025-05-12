// Servizio di gestione ricarica per il robot

const express = require('express');
const mqtt = require('mqtt');
const axios = require('axios');
const ChargerController = require('../../controllers/charge-controller');
const HueController = require('../../controllers/hue-controller');

const app = express();

// Configurazione per la documentazione Swagger
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./documentation/swagger/charging-service.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Connessione al broker MQTT
const client = mqtt.connect(process.env.MQTT_BROKER || 'mqtt://localhost:1883', {
    clientId: 'charging-service',
    clean: false, // mantiene la sessione tra le connessioni
    reconnectPeriod: 1000 // riconnessione automatica
});

// Avvio i controller
const chargerController = new ChargerController(client);
const hueController = new HueController(client, axios);
const PORT = process.env.PORT || 3003;

client.on('connect', () => {
    console.log('Charging Service connected to MQTT broker');
    client.subscribe('robocharge/charging/#');
});

client.on('message', (topic, message) => {
    //console.log(`Received message on ${topic}: ${message.toString()}`);
  
    if (topic === 'robocharge/charging/new-request') {
        //console.log("Ricarica in coda");
        const data = JSON.parse(message.toString());
        chargerController.addToQueue(data);
    }
  
    if (topic === 'robocharge/charging/cancel') {
        const data = JSON.parse(message.toString());
        chargerController.removeFromQueue(data.reservationId);
    }
});

// Routes per il servizio di ricarica (admin panel)

app.get('/status', (req, res) => {
    const status = chargerController.getStatus();
    res.json(status);
});
  
app.put('/start', (req, res) => {
    chargerController.startCharging();
    res.json({ message: 'Robot di ricarica avviato' });
});
  
app.put('/stop', (req, res) => {
    chargerController.stopCharging();
    res.json({ message: 'Robot di ricarica fermato' });
});
  
app.listen(PORT, () => {
    console.log(`Charging Service running on port ${PORT}`);
    chargerController.startCharging(); // Start automatico del robot
});