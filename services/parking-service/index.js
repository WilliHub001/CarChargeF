// Servizio di gestione delle prenotazioni e dei posti auto

const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const DataBase = require('../../models/db');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const database = new DataBase();
const JWT_SECRET = process.env.JWT_SECRET;

const PORT = process.env.PORT || 3002;
const app = express();
const client = mqtt.connect(process.env.MQTT_BROKER || 'mqtt://localhost:1883', {
    clientId: 'parking-service',
    clean: false, // mantiene la sessione tra le connessioni
    reconnectPeriod: 1000 // riconnessione automatica
});

app.use(cors());
app.use(express.json());

// Configurazione per la documentazione Swagger
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./documentation/swagger/parking-service.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ----------------------------------------------------- MQTT client
client.on('connect', () => {
    console.log('Parking Service connected to MQTT broker');
    client.subscribe('robocharge/charging/#');
});

client.on('message', (topic, message) => {
    //console.log(`Received message on ${topic}: ${message.toString()}`);
  
    // Processa i messaggi MQTT e aggiorna lo stato dei posti auto
    if (topic === 'robocharge/charging/completed') {
        const data = JSON.parse(message.toString());
        publishParkingChargingCompleted(data.userId, data.reservationId);
    }
});

// Funzione per pubblicare la notifica di completamento della ricarica
async function publishParkingChargingCompleted(userId, reservationId) {
    try {
        //Aggiorna lo stato del posto auto
        //await database.updateSpotChargeStatus(spotId, false);
        
        await database.updateReservationCharge(reservationId, 0);

        // Pubblica al topic MQTT per notificare il completamento della ricarica
        client.publish('robocharge/notification/charging-completed', JSON.stringify({ 
            reservationId: reservationId,
            userId: userId,
            message: 'Ricarica completata alla percentuale specificata.',
            title: 'Notifica di ricarica'
        }));
    } catch (error) {
        console.error('Error updating after charging:', error);
    }
}

// Funzione per controllare le prenotazioni e i posti auto
async function checkReservations(){
    try {
        const currentTime = new Date();
        //console.log(`Esecuzione controllo prenotazioni e posti: ${currentTime.toISOString()}`);
        
        const activeReservations = await database.getStatusReservations(1, 0, 0);

        for (const reservation of activeReservations) {
            // Se mancano meno di 2 minuti dallo startTime e la prenotazione è attiva
            if(new Date(reservation.startTime) < new Date(currentTime.getTime() + 2 * 60 * 1000) && new Date(reservation.endTime) > new Date()){
                if (reservation.idPosto == null) {
                    // Trova un posto disponibile
                    const spots = await database.getAvailableSpots(reservation.chargeRequest);
                    
                    const spot = spots[0];
    
                    // Imposta il posto come occupato
                    await database.updateSpotStatus(spot.idPosto, true);
    
                    // Aggiorna la prenotazione con l'ID del posto e lo stato
                    await database.updateReservationSpot(reservation.idPrenotazione, spot.idPosto);
    
                    console.log(`Posto assegnato per la prenotazione ID: ${reservation.idPrenotazione}`);
                }
    
                // Se la prenotazione ha un posto associato e mancano meno di 2 minuti dallo startTime
                if (reservation.idPosto != null) {
                    const response = await database.getSpotById(reservation.idPosto);
                    if(response.isOccupato == 0){
                        // Imposta il posto come occupato
                        await database.updateSpotStatus(reservation.idPosto, true);
    
                        console.log(`Aggiorno tabella Posto per la prenotazione ID: ${reservation.idPrenotazione}`);
                    }
                }
            }

            if(reservation.idPosto != null && new Date(reservation.startTime) < new Date() && new Date(reservation.endTime) > new Date()){
                // Pubblica un messaggio MQTT per la nuova richiesta dello stato di ricarica
                if (reservation.chargeRequest == 1) {
                    client.publish('robocharge/charging/new-request', JSON.stringify({
                        reservationId: reservation.idPrenotazione,
                        userId: reservation.idUtente,
                        spotId: reservation.idPosto,
                        targetBattery: reservation.targetBattery
                    }));
                }
                if(new Date() < new Date(new Date(reservation.startTime).getTime() + 1 * 60 * 1000)){
                    client.publish('robocharge/status/entrata', JSON.stringify({
                        entered: true
                    }));
                }
            }
        }

        const ongoingReservations = await database.getStatusReservations(1, 0, 0);
        
        // Imposta le prenotazioni come completate se il tempo corrente è maggiore del tempo di fine prenotazione
        for (const reservation of ongoingReservations) {
            const endTime = new Date(reservation.endTime);
            
            // Se il tempo corrente è maggiore del tempo di fine prenotazione
            if (currentTime > endTime) {
                console.log(`Impostazione completata per la prenotazione ID: ${reservation.idPrenotazione}`);
                
                // Aggiorna la prenotazione come completata
                await database.updateReservationCompletata(reservation.idPrenotazione, 1);
                
                // Se la prenotazione ha un posto associato, imposta il posto come libero
                if (reservation.idPosto) {
                    await database.updateSpotStatus(reservation.idPosto, 0);
                    await database.updateReservationSpot(reservation.idPosto, null);
                }
            }
        }
        
        // Controllo le prenotazioni che non sono attive, non sono completate e non hanno penali
        const inactiveReservations = await database.getStatusReservations(0, 0, 0);
        
        for (const reservation of inactiveReservations) {
            const startTime = new Date(reservation.startTime);
            
            // Calcola la differenza in minuti tra il tempo corrente e lo startTime
            const diffMinutes = Math.floor((currentTime - startTime) / (1000 * 60));
            
            // Se sono passati almeno 20 minuti dallo startTime e la prenotazione non è ancora attiva
            if (diffMinutes > 20) {
                console.log(`Applicazione penale alla prenotazione ID: ${reservation.idPrenotazione}`);
                
                // Aggiorna la prenotazione con penale = 1
                await database.updateReservationPenale(reservation.idPrenotazione, 1);
            }
        }
    } catch (error) {
        console.error('Errore durante il controllo dei posti:', error);
    }
}

// Funzione per controllare se ci sono posti auto disponibili
async function checkSpots(){
    try {
        const spots = await database.getAvailableSpots();
        const full = spots.length == 0 ? true : false;

        client.publish('robocharge/status/parcheggio', JSON.stringify({ 
            full: full
        }));
    } catch (error) {        
        console.error('Errore durante il controllo dei posti:', error);
    }
}

// Esegui il controllo ogni minuto
cron.schedule('*/1 * * * *', () => {
    checkReservations();
    checkSpots();
});

async function setupSpots(){
    await database.initializeSpots();
}

// Controllo iniziale all'avvio
console.log('Servizio di controllo prenotazioni avviato!');
setupSpots();
checkReservations();

// Auth middleware
function authMiddleware(req, res, next) {
    const token = req.header('x-auth-token');
    
    if (!token) {
        return res.status(401).json({ message: 'Token mancante, autorizzazione negata' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Aggiungi le informazioni dell'utente decodificate alla richiesta
        req.user = decoded.user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token non valido' });
    }
}

// ROUTES -----------------------------------------------------
  
// Restituisce i posti di parcheggio disponibili
app.post('/spots', async (req, res) => {
    try {
        const { type } = req.body;
        
        var spots;

        if (type === 'charging') {
            spots = await database.getAvailableSpots(true);
        } else if (type === 'normal') {
            spots = await database.getAvailableSpots(false);
        } else if (type === 'all') {
            var spotsRic = await database.getAvailableSpots(true);
            var spotsNoRic = await database.getAvailableSpots(false);
            return res.json({ spotsRic: spotsRic.length, spotsNoRic: spotsNoRic.length });
        } else {
            spots = await database.getAvailableSpots();
        }

        res.json(spots);
    } catch (error) {
        console.error('Get spots error:', error);
        res.status(500).json({ message: 'Errore del server' });
    }
});

// Crea una nuova prenotazione
app.post('/new-reservation', authMiddleware, async (req, res) => {
    try {
        let { licensePlate, startDate, duration, parkingType, targetBattery, totalCost, userId } = req.body;

        // Controllo se la targa è valida
        const licensePlateRegex = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
        if (!licensePlateRegex.test(licensePlate)) {
            return res.status(400).json({ message: 'Targa non valida' });
        }
        
        // Controllo se è una prenotazione o un parcheggio sul momento
        if(startDate == undefined){
            startDate = new Date().toISOString();
        }
        else{
            startDate = new Date(startDate).toISOString();
        }
        const endTime = new Date(new Date(startDate).getTime() + duration * 60 * 60 * 1000).toISOString();

        // Ottieni tutte le prenotazioni attive
        const activeReservations = await database.getFutureReservations(0, 0);
        
        const requestStart = new Date(startDate);
        const requestEnd = new Date(endTime);
        
        // Conta le prenotazioni sovrapposte e quelle con ricarica
        let overlappingParking = 0;
        let overlappingCharging = 0;
        
        for (const reservation of activeReservations) {
            const reservationStart = new Date(reservation.startTime);
            const reservationEnd = new Date(reservation.endTime);
            
            // Controlla se c'è sovrapposizione di orari
            if ((requestStart < reservationEnd && requestEnd > reservationStart)) {
                if (licensePlate == reservation.idTarga) {
                    return res.status(400).json({ message: 'Prenotazione già effettuata con questa targa, in questo intervallo di tempo' });
                }
                // Controlla se è una prenotazione con ricarica
                if (reservation.targetBattery != null) {
                    overlappingCharging++;
                }
                else{
                    overlappingParking++;
                }
            }
        }

        //console.log(`Posti di parcheggio sovrapposti: ${overlappingParking}, Posti di ricarica sovrapposti: ${overlappingCharging}`);

        // Controlla se tutti i posti sono occupati
        if (overlappingParking >= 20) {
            return res.status(500).json({ message: 'Tutti i posti di parcheggio sono occupati nel periodo selezionato' });
        }
        
        // Controlla se tutti i posti di ricarica sono occupati
        if (parkingType == 'charging' && overlappingCharging >= 10) {
            return res.status(500).json({ message: 'Tutti i posti di ricarica sono occupati nel periodo selezionato' });
        }

        // Nuova prenotazione
        const reservationId = await database.insertNewPrenotazione(
            userId, 
            null,
            licensePlate,
            startDate, 
            endTime, 
            parkingType == 'charging' ? 1 : 0,
            targetBattery == undefined ? null : targetBattery,
            totalCost
        );

        const newReservation = await database.getReservationById(reservationId);
      
        res.status(201).json({
            reservation: newReservation,
            message: 'Prenotazione effettuata. Ricordati di pagare all\'arrivo!'
        });
    } catch (error) {
        console.error('Create reservation error:', error);
        res.status(500).json({ message: 'Errore del server' });
    }
});

// Verifica la prenotazione
app.get('/check-reservation', authMiddleware, async (req, res) => {
    try {
        const { licensePlate } = req.query;
        
        if (!licensePlate) {
            return res.status(400).json({ message: 'La targa è obbligatoria' });
        }
        
        const today = new Date();
        
        // Cerca prenotazioni per la targa specificata per il giorno corrente
        const reservations = await database.findReservationsByLicensePlate(
            licensePlate,
            new Date(today.getTime() - 20 * 60 * 1000).toISOString(), // Da 20 minuti fa
            new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString() // Fino a domani
        );
        
        if (!reservations || reservations.length === 0) {
            return res.json({ message: 'Nessuna prenotazione trovata', reservation: null });
        }
        
        // Trova la prenotazione con l'ora più vicina a quella attuale
        let closestReservation = reservations[0];
        let minTimeDiff = Math.abs(new Date(closestReservation.startTime).getTime() - today.getTime());
        
        for (let i = 1; i < reservations.length; i++) {
            const reservation = reservations[i];
            const timeDiff = Math.abs(new Date(reservation.startTime).getTime() - today.getTime());
            
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestReservation = reservation;
            }
        }
        
        res.status(201).json({ 
            message: 'Prenotazione trovata', 
            reservation: closestReservation 
        });
    } catch (error) {
        console.error('Check reservation error:', error);
        res.status(500).json({ message: 'Errore del server' });
    }
});

// Parcheggia un veicolo ora
app.post('/park-now', authMiddleware, async (req, res) => {
    try {
        const { reservationId } = req.body;
        
        const reservation = await database.getReservationById(reservationId);
    
        if (!reservation) {
            return res.status(404).json({ message: 'Prenotazione non trovata' });
        }
        
        if (reservation.completata == 1) {
            return res.status(400).json({ 
                message: 'Questa prenotazione è già stata utilizzata' 
            });
        }

        // Se l'utente arriva fino a 5 minuti prima dell'orario di inizio della prenotazione
        // gli viene assegnato un posto immediatamente
        if(new Date(reservation.startTime) < new Date(new Date().getTime() + 5 * 60 * 1000)){
            // Trova un posto disponibile
            const spots = await database.getAvailableSpots(reservation.chargeRequest);
            
            if (!spots || spots.length === 0) {
                return res.status(400).json({ 
                    message: `Errore inaspettato: Nessun posto ${reservation.chargeRequest == 1 ? 'di ricarica' : ''} disponibile` 
                });
            }
            
            const spot = spots[0];

            // Imposta il posto come occupato
            await database.updateSpotStatus(spot.idPosto, true);

            // Aggiorna la prenotazione con l'ID del posto e lo stato
            await database.updateReservationSpot(reservationId, spot.idPosto);
            await database.updateReservationStatus(reservationId, true);

            client.publish('robocharge/status/entrata', JSON.stringify({
                entered: true
            }));

            // Ottieni la prenotazione aggiornata
            const updatedReservation = await database.getReservationById(reservationId);
            
            res.status(200).json({
                message: 'Accesso al parcheggio confermato',
                reservation: updatedReservation,
                spot: {
                    id: spot.idPosto,
                    type: spot.isOnCharge ? 'charging' : 'normal'
                }
            });
        }
        else{
            await database.updateReservationStatus(reservationId, true);

            res.status(200).json({ message: 'Parcheggio pagato. Ti verrà assegnato un posto poco prima dell\'orario impostato' });
        }
    } catch (error) {
        console.error('Park now error:', error);
        res.status(500).json({ message: 'Errore del server' });
    }
});

// Restituisce i prezzi di ricarica e parcheggio
app.get('/prezzi', async (req, res) => {
    try {
        const prezzi = await database.getPrezzi();
        res.json(prezzi);
    } catch (error) {
        console.error('Get prices error:', error);
        res.status(500).json({ message: 'Errore del server' });
    }
});

// Aggiorna i prezzi di ricarica e parcheggio
app.put('/update-prezzi', async (req, res) => {
    try {
        const { prezzoOra, prezzoRicarica } = req.body;
        
        await database.updatePrezzi(prezzoOra, prezzoRicarica);
        const prezzi = await database.getPrezzi();
        
        res.json({ costoOra: prezzi.costoOra, costoRicarica: prezzi.costoRicarica, message: 'Prezzi aggiornati con successo' });
    } catch (error) {
        console.error('Update prices error:', error);
        res.status(500).json({ message: 'Errore del server durante l\'aggiornamento dei prezzi' });
    }
});

app.listen(PORT, () => {
    console.log(`Parking Service running on port ${PORT}`);

    process.on('SIGINT', () => {
        console.log('Closing database connection...');
        database.close();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('Chiusura del servizio di controllo prenotazioni...');
        process.exit(0);
    });
});