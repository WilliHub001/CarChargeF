// Servizio di gestione dei pagamenti

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const DataBase = require('../../models/db');
require('dotenv').config();

const database = new DataBase();
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
const PORT = process.env.PORT || 3004;
const AUTH_SERVICE_URL = 'http://localhost:3001';

// Middleware
app.use(cors());
app.use(express.json());

// Configurazione per la documentazione Swagger
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./documentation/swagger/payment-service.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Funzione per generare il token di accesso PayPal
async function generateAccessToken() {
    const response = await axios({
        url: process.env.PAYPAL_BASE_URL + '/v1/oauth2/token',
        method: 'post',
        data: 'grant_type=client_credentials',
        auth: {
            username: process.env.PAYPAL_CLIENT_ID,
            password: process.env.PAYPAL_CLIENT_SECRET
        }
    });

    return response.data.access_token;
}

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

// Routes --------------------------------------------------------

app.post('/create-order', authMiddleware, async (req, res) => {
    try {
        const amount=req.body.amount;
        const payType=req.body.payType; // 0: Premium, 1: Prenotazione, 2: Penale
        const parkNowURL=`http://localhost:8080/park-now/complete-order/` + req.body.idPrenotazione + `/`;
        const payPenaleURL=`http://localhost:8080/paga-penale/complete-order/` + req.body.idPrenotazione + `/`;

        //console.log(amount);
        
        const accessToken = await generateAccessToken();
        //console.log("Access token:", accessToken);
        
        // Invia la richiesta per creare l'ordine PayPal
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v2/checkout/orders',
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            data: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    items: [
                        {
                            name: payType == 1 ? 'Pagamento Prenotazione' : payType == 2 ? 'Pagamento Penale' : 'Abbonamento Premium',
                            description: payType == 1 ? 'Pagamento Prenotazione Posto Auto' : payType == 2 ? 'Pagamento Penale' : 'Abbonamento Premium',
                            quantity: 1,
                            unit_amount: {
                                currency_code: 'EUR',
                                value: `${amount}`
                            }
                        }
                    ],
                    amount: {
                        currency_code: 'EUR',
                        value: `${amount}`,
                        breakdown: {
                            item_total: {
                                currency_code: 'EUR',
                                value: `${amount}`
                            }
                        }
                    }
                }],
                application_context: {
                    return_url: payType == 1 ? parkNowURL : payType == 2 ? payPenaleURL : `http://localhost:8080/premium/complete-order`,
                    cancel_url: payType >= 1 ? `http://localhost:8080/park-now/cancel-order` : `http://localhost:8080/premium/cancel-order`,
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'PAY_NOW',
                    brand_name: 'RoboCharge'
                }
            })
        });
        
        const approveUrl = response.data.links.find(link => link.rel === 'approve').href;
        //res.redirect(approveUrl);

        res.json({
            orderId: response.data.id,
            approveUrl: approveUrl
        });
    } catch (error) {
        console.error('Error creating PayPal order:', error);
        res.status(500).json({ message: 'Errore nella creazione dell\'ordine PayPal' });
    }
});

// Cattura il pagamento PayPal per premium
app.get('/premium/capture', async (req, res) => {
    try {
        const orderId = req.query.token;

        //console.log("Capturing order:", orderId);
        
        const accessToken = await generateAccessToken();
        
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + `/v2/checkout/orders/${orderId}/capture`,
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            }
        });
        
        // Controlla lo stato della transazione
        if (response.data.status === 'COMPLETED') {
            const userId = req.query.userId;
            const amount = 10.00;
            const currentDate = new Date().toISOString();
            const transactionId = orderId;
            
            // Inserisci il pagamento nel database
            const paymentId = await database.insertPagamentoPremium(
                userId,
                amount,
                'premium',
                currentDate,
                transactionId
            );
            
            // Notifica al servizio di autenticazione
            const userData = await axios.put(`${AUTH_SERVICE_URL}/premium/` + userId);
            
            // Risposta con successo
            res.status(201).json({
                success: true,
                message: 'Pagamento completato. Sei ora un utente premium! Puoi prenotare posti in anticipo.',
                paymentId: paymentId,
                token: userData.data.token,
            });
        } else {
            res.status(400).json({ message: 'Pagamento fallito' });
        }
    } catch (error) {
        console.error('Error capturing PayPal order:', error);
        res.status(500).json({ message: 'Errore durante la cattura del pagamento PayPal' });
    }
});

// Cattura il pagamento PayPal per prenotazione
app.get('/reservation/capture', async (req, res) => {
    try {
        const orderId = req.query.token;

        //console.log("Capturing order:", orderId);
        
        const accessToken = await generateAccessToken();
        
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + `/v2/checkout/orders/${orderId}/capture`,
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            }
        });
        
        // Controlla lo stato della transazione
        if (response.data.status === 'COMPLETED') {
            const userId = req.query.userId;
            const idPrenotazione = req.query.idPrenotazione;
            const currentDate = new Date().toISOString();
            const transactionId = orderId;
            
            const reservation = await database.getReservationById(idPrenotazione);
            if (!reservation) {
                return res.status(404).json({ message: 'Prenotazione non trovata' });
            }

            // Verifica che la prenotazione appartenga all'utente
            if (reservation.idUtente != userId) {
                return res.status(403).json({ message: 'Non sei autorizzato a pagare questa prenotazione' });
            }

            const paymentId = await database.insertPagamento(
                userId,
                reservation.costo,
                'reservation',
                currentDate,
                transactionId,
                idPrenotazione
            );
            
            // Risposta con successo
            res.status(201).json({
                success: true,
                message: 'Pagamento completato per la prenotazione',
                paymentId: paymentId,
            });
        } else {
            res.status(400).json({ message: 'Pagamento fallito' });
        }
    } catch (error) {
        console.error('Error capturing PayPal order:', error);
        res.status(500).json({ message: 'Errore durante la cattura del pagamento PayPal' });
    }
});

// Cattura il pagamento PayPal per penale
app.get('/paga-penale/capture', async (req, res) => {
    try {
        const orderId = req.query.token;

        //console.log("Capturing order:", orderId);
        
        const accessToken = await generateAccessToken();
        
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + `/v2/checkout/orders/${orderId}/capture`,
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            }
        });
        
        // Controlla lo stato della transazione
        if (response.data.status === 'COMPLETED') {
            const userId = req.query.userId;
            const idPrenotazione = req.query.idPrenotazione;
            const currentDate = new Date().toISOString();
            const transactionId = orderId;
            
            const reservation = await database.getReservationById(idPrenotazione);
            if (!reservation) {
                return res.status(404).json({ message: 'Prenotazione non trovata' });
            }

            // Verifica che la prenotazione appartenga all'utente
            if (reservation.idUtente != userId) {
                return res.status(403).json({ message: 'Non sei autorizzato a pagare questa penale' });
            }

            const paymentId = await database.insertPagamento(
                userId,
                (reservation.costo / 2).toFixed(2),
                'penale',
                currentDate,
                transactionId,
                idPrenotazione
            );
            
            // Risposta con successo
            res.status(201).json({
                success: true,
                message: 'Pagamento completato per la penale',
                paymentId: paymentId,
            });
        } else {
            res.status(400).json({ message: 'Pagamento fallito' });
        }
    } catch (error) {
        console.error('Error capturing PayPal order:', error);
        res.status(500).json({ message: 'Errore durante la cattura del pagamento PayPal' });
    }
});
  
process.on('SIGINT', () => {
    database.close();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Payment Service running on port ${PORT}`);
});