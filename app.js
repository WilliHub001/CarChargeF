// Web application entry point
//Inizializzo moduli e variabili
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const axios = require('axios');
const DataBase = require('./models/db');
const db = new DataBase();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000/api';

//Inizializzo i moduli in express
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 ore
}));

// Configurazione per la documentazione Swagger
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./documentation/swagger/app.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(expressLayouts);
app.set('layout', 'partials/main');
app.use(express.static(path.join(__dirname, 'public')));

// Middleware per verificare l'autenticazione
const authMiddleware = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Middleware per verificare l'utente premium
const premiumMiddleware = (req, res, next) => {
    if (!req.session.user || req.session.user.ruoloUtente === 'base') {
        return res.redirect('/premium');
    }
    next();
};

// Middleware per verificare l'utente admin
const adminMiddleware = (req, res, next) => {
    if (!req.session.user || req.session.user.ruoloUtente !== 'admin') {
        return res.redirect('/');
    }
    next();
};

// Middleware per aggiungere l'utente alle views, e altri valori utili
app.use((req, res, next) => {
    res.locals.isAuthenticated = false;
    res.locals.user = req.session.user || null;
    checkPenale = false;
    prenotazioni = [];
    next();
});

// ROUTES --------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.render('home.ejs', { 
        user: req.session.user || null,
        path: req.path 
    });
});

app.get('/home', (req, res) => {
    res.render('home.ejs', { 
        user: req.session.user || null,
        path: req.path 
    });
});

// Visualizza login
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login', { error: null });
});

// Richiesta di Login
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const response = await axios.post(`${API_GATEWAY_URL}/auth/login`, { email, password });
        
        if (response.data.token) {
            // Viene salvato sia il token che l'utente nella sessione
            req.session.token = response.data.token;
            req.session.user = response.data.user;
            res.redirect('/');
        } 
        else {
            res.render('login.ejs', { error: 'Credenziali non valide' });
        }
    } catch (error) {
        console.error('Login error:', error.message);
        res.render('login.ejs', { error: 'Login failed. Please try again.' });
    }
});

app.get('/login-with-google', (req, res) => {
    res.redirect(`${API_GATEWAY_URL}/auth/auth/google`);
});

app.get('/auth-success', (req, res) => {
    const token = req.query.token;
    
    if (!token) {
        return res.redirect('/login?error=authentication_failed');
    }
    
    // Memorizza il token nella sessione
    req.session.token = token;
    
    // Fetch i dati dell'utente dalla sessione
    axios.get(`${API_GATEWAY_URL}/auth/verify`, {
        headers: {
            'x-auth-token': token
        }
    })
    .then(response => {
        // Memorizza l'utente nella sessione
        req.session.user = response.data.user;
        
        // Salva la sessione
        req.session.save(err => {
            if (err) {
                console.error('Session save error:', err);
                return res.redirect('/login?error=session_error');
            }
            
            res.redirect('/');
        });
    })
    .catch(error => {
        console.error('Token verification error:', error);
        res.redirect('/login?error=verification_failed');
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Visualizza registrazione
app.get('/register', (req, res) => {
    if (req.session.user) {
      return res.redirect('/');
    }
    res.render('register.ejs', { error: null });
});

// Richiesta registrazione
app.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        //console.log("Registration request received:", email);
        
        const response = await axios.post(`${API_GATEWAY_URL}/auth/register`, { 
            name, email, password 
        });
        
        if (response.data.token) {
            // Salviamo sia il token che l'utente nella sessione
            req.session.token = response.data.token;
            req.session.user = response.data.user;
            res.redirect('/');
        } else {
            res.render('register', { error: 'Registrazione fallita' });
        }
    } catch (error) {
        console.error('Registration error:', error.message);
        const errorMessage = error.response?.data?.message || 'Registrazione fallita. Riprova.';
        res.render('register', { error: errorMessage });
    }
});

// Pagina di prenotazione - solo per utenti premium
app.get('/prenota', premiumMiddleware, async (req, res) => {

    if (req.session.user.ruoloUtente == 'base') {
        return res.render('premium', { message: 'Diventa un utente premium per prenotare in anticipo!', checkP: false });
    }

    res.render('prenota.ejs');
});

// Pagina di parcheggio e pagamento
app.get('/parcheggia', authMiddleware, async (req, res) => {
    try {
        const prenotazioniPenali = await db.getReservationsPenali(req.session.user.id);
        //console.log(prenotazioniPenali);
        if(prenotazioniPenali.length > 0){
            return res.render('parcheggia.ejs', { message: 'Hai delle prenotazioni non pagate. Paga le penali per poter parcheggiare', checkPenale: true, prenotazioni: prenotazioniPenali});
        }
        res.render('parcheggia.ejs', { 
            checkPenale: false,
        });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('parcheggia.ejs', { message: 'Errore durante il caricamento dei dati della pagina' });
    }
});

// Premium upgrade page
app.get('/premium', authMiddleware, (req, res) => {
    if (req.session.user.ruoloUtente == 'premium') {
        return res.render('premium.ejs', { page: 'premium', message: 'Sei già un utente premium!', checkP: true});
        //return res.redirect('/');
    }
    return res.render('premium.ejs', { message: null, checkP: false});
});

// Process premium upgrade
app.post('/premium', authMiddleware, async (req, res) => {
    try {
        const response = await axios.post(
            `${API_GATEWAY_URL}/payments/create-order`,
            {
                amount: 10,
                payType: 0
            },
            { headers: { 'x-auth-token': req.session.token } }
        );

        res.redirect(response.data.approveUrl);
    } catch (error) {
        console.error('Premium upgrade error:', error.response?.data || error.message);
        res.render('premium', { 
            message: 'Errore durante l\'upgrade a premium. Riprova più tardi.',
            checkP: false
        });
    }
});

// Completamento upgrade a premium
app.get('/premium/complete-order', async (req, res) => {
    try {
        const response = await axios.get(
            `${API_GATEWAY_URL}/payments/premium/capture`,
            { 
                params: { 
                    token: req.query.token,
                    userId: req.session.user.id
                 } 
            }
        );

        // Salvo il nuovo session token
        req.session.token = response.data.token;

        // Update user in session
        const userResponse = await axios.get(
            `${API_GATEWAY_URL}/auth/verify`,
            { headers: { 'x-auth-token': req.session.token } }
        );
        
        req.session.user = userResponse.data.user;
        
        res.render('premium', { 
            page: 'premium', 
            message: response.data.message,
            checkP: true, 
            user: userResponse.data.user
        });
    } catch (error) {
        console.error('Premium upgrade error:', error.response?.data || error.message);
        res.render('premium', { 
            page: 'premium', 
            message: error.response.data.message,
            checkP: false
        });
    }
})

app.get('/premium/cancel-order', (req, res) => {
    res.render('premium', {
        message: 'Pagamento annullato dall\'utente',
        checkP: false
    });
})

// Richiesta nuova prenotazione
app.post('/new-reservation', authMiddleware, async (req, res) => {
    try {
        if (req.session.user.ruoloUtente === 'base') {
            return res.status(403).json({ message: 'Solo gli utenti premium possono prenotare' });
        }
        
        const bookingData = req.body;
        
        // Crea una nuova prenotazione
        const reservationResponse = await axios.post(
            `${API_GATEWAY_URL}/parking/new-reservation`,
            {
                ...bookingData,
                userId: req.session.user.id
            },
            { headers: { 'x-auth-token': req.session.token } }
        );
        
        res.render('prenota', {  
            message: reservationResponse.data.message
        });
    } catch (error) {
        console.error('Booking error:', error.response?.data || error.message);
        res.render('prenota', { message: 'Errore durante la prenotazione: ' + error.response.data.message });
    }
});

// Richiesta di verifica prenotazione
app.get('/park-now/check-reservation', authMiddleware, async (req, res) => {
    try {
        const { licensePlate } = req.query;
        
        if (!licensePlate) {
            return res.status(400).json({ message: 'La targa è obbligatoria' });
        }

        //console.log(licensePlate);
        
        // Chiamata al servizio di parcheggio per verificare la prenotazione
        const response = await axios.get(
            `${API_GATEWAY_URL}/parking/check-reservation`,
            { 
                params: { licensePlate },
                headers: { 'x-auth-token': req.session.token } 
            }
        );
        
        res.json(response.data);
    } catch (error) {
        console.error('Check reservation error:', error.response?.data || error.message);
        res.render('parcheggia', { message: 'Errore durante la verifica della prenotazione: ' + error.response.data.message });
    }
});

// Richiesta di parcheggio e pagamento
app.post('/park-now', authMiddleware, async (req, res) => {
    try {
        const parkData = req.body;
        
        let idPrenotazione=parkData.idPrenotazione;
        
        if(parkData.parkReserved == 'park'){
            const reservationResponse = await axios.post(
                `${API_GATEWAY_URL}/parking/new-reservation`,
                {
                    ...parkData,
                    userId: req.session.user.id
                },
                { headers: { 'x-auth-token': req.session.token } }
            );

            idPrenotazione=reservationResponse.data.reservation.idPrenotazione;
        }

        //console.log("idPrenotazione: ", idPrenotazione);
        //console.log("totalCost: ", parkData.totalCost);

        // Process payment
        const response = await axios.post(
            `${API_GATEWAY_URL}/payments/create-order`,
            {
                amount: parkData.totalCost,
                payType: 1,
                idPrenotazione: idPrenotazione
            },
            { headers: { 'x-auth-token': req.session.token } }
        );
        
        res.redirect(response.data.approveUrl);
    } catch (error) {
        console.error('Park-now error:', error.response?.data || error.message);
        res.render('parcheggia', { message: 'Errore durante il parcheggio: ' + error.response.data.message });
    }
});

// Completamento ordine di parcheggio
app.get('/park-now/complete-order/:idPrenotazione', async (req, res) => {
    try {
        await axios.get(
            `${API_GATEWAY_URL}/payments/reservation/capture`,
            { 
                params: { 
                    token: req.query.token,
                    userId: req.session.user.id,
                    idPrenotazione: req.params.idPrenotazione
                 } 
            }
        );

        // Completo la procedura di parcheggio dopo l'avvenuto pagamento
        const response = await axios.post(
            `${API_GATEWAY_URL}/parking/park-now`,
            {
                reservationId: req.params.idPrenotazione
            },
            { headers: { 'x-auth-token': req.session.token } }
        );
        
        //res.json(response.data);
        
        res.render('parcheggia', { 
            page: 'parcheggia', 
            message: 'Pagamento effettuato e posto confermato!'
        });
    } catch (error) {
        console.error('Errore prenotazione:', error.response?.data || error.message);
        res.render('parcheggia.ejs', {
            message: 'Errore durante la procedura di pagamento del parcheggio. Riprova più tardi.'
        });
    }
})

app.get('/park-now/cancel-order', (req, res) => {
    res.render('parcheggia', { 
        page: 'parcheggia', 
        message: 'Pagamento annullato dall\'utente'
    });
})

// Richiesta di pagamento penale
app.post('/paga-penale', authMiddleware, async (req, res) => {
    try {
        const parkData = req.body;
        
        const idPrenotazione = parkData.idPrenotazione;

        //console.log("idPrenotazione: ", idPrenotazione);
        //console.log("totalCost: ", parkData.costoPenaleV);

        // Process payment
        const response = await axios.post(
            `${API_GATEWAY_URL}/payments/create-order`,
            {
                amount: parkData.costoPenaleV,
                payType: 2,
                idPrenotazione: idPrenotazione
            },
            { headers: { 'x-auth-token': req.session.token } }
        );
        
        res.redirect(response.data.approveUrl);
    } catch (error) {
        console.error('Park-now error:', error.response?.data || error.message);
        res.render('parcheggia', { message: 'Errore durante il pagamento della penale: ' + error.response.data.message });
    }
});

// Completo il processo di pagamento della penale
app.get('/paga-penale/complete-order/:idPrenotazione', async (req, res) => {
    try {
        await axios.get(
            `${API_GATEWAY_URL}/payments/paga-penale/capture`,
            { 
                params: { 
                    token: req.query.token,
                    userId: req.session.user.id,
                    idPrenotazione: req.params.idPrenotazione
                 } 
            }
        );

        await db.updateReservationPenalePaid(req.params.idPrenotazione);

        var checkPenale = false;
        const prenotazioniPenali = await db.getReservationsPenali(req.session.user.id);
        if(prenotazioniPenali.length > 0){
            checkPenale = true;
        }
        //res.json(response.data);
        
        res.render('parcheggia', { 
            page: 'parcheggia', 
            message: 'Pagamento Penale confermato!',
            checkPenale: checkPenale,
            prenotazioni: prenotazioniPenali
        });
    } catch (error) {
        console.error('Errore prenotazione:', error.response?.data || error.message);
        res.render('parcheggia.ejs', { 
            message: 'Errore durante la procedura di pagamento della penale. Riprova più tardi.'
        });
    }
})

// Visualizza numero di parcheggi disponibili
app.get('/available-spots', authMiddleware, premiumMiddleware, async (req, res) => {
    try {
        const spots = await axios.post(
            `${API_GATEWAY_URL}/parking/spots`,
            { 
                type: 'all'
            }
        );
        
        res.render('parcheggi-liberi.ejs', { spotsWithCharge: spots.data.spotsRic, spotsNoCharge: spots.data.spotsNoRic });
    } catch (error) {
        console.error('Get spots error:', error.response?.data || error.message);
        res.render('parcheggi-liberi.ejs', { message: 'Errore durante il recupero dei posti disponibili' });
    }
});

// Pagina Profilo
app.get('/profilo', authMiddleware, async (req, res) => {
    try {
        var pagamenti = await db.getPayments(req.session.user.id);
        res.render('profilo', { payments: pagamenti });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('profilo', { message: 'Errore durante il caricamento del profilo' });
    }
});

// Le mie prenotazioni
app.get('/my-reservations', authMiddleware, async (req, res) => {
    try {
        const prenotazioni = await db.getReservationByUserId(req.session.user.id);
        //console.log(prenotazioni);
        res.render('reservations', { bookings:prenotazioni });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('reservations', { message: 'Errore durante la ricerca delle tue prenotazioni' });
    }
});

// Richiesta di cancellazione prenotazione
app.delete('/delete-prenotazione/:idPrenotazione', authMiddleware, async (req, res) => {
    try {
        const prenotazione = await db.getReservationById(req.params.idPrenotazione);
        if(req.session.user.id === prenotazione.idUtente){
            const check = await db.deleteReservationById(req.params.idPrenotazione);
            if(check){
                return res.json({ message: 'Cancellazione avvenuta con successo!' });
            }
        }
        res.status(404).json({ message: 'Errore durante la cancellazione della prenotazione' });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Errore durante la cancellazione della prenotazione' });
    }
});

// Visualizza Prenotazioni attive
app.get('/active-reservations', authMiddleware, async (req, res) => {
    try {
        const prenotazioni = await db.getActiveReservationsbyUserId(req.session.user.id);
        //console.log(prenotazioni);
        res.render('activeRes', { prenotazioni: prenotazioni });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('activeRes', { message: 'Errore durante la ricerca delle prenotazioni attive' });
    }
});

// Pagina di controllo del robot - solo admin
app.get('/robot-status', adminMiddleware, async (req, res) => {
    try {
        const status = await axios.get(`${API_GATEWAY_URL}/charging/status`);
        res.render('robot-status', { status: status.data });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('robot-status', { message: 'Errore durante il recupero dello stato del robot' });
    }
});

// Richiesta di dati del robot - solo admin
app.get('/get-robot-status', adminMiddleware, async (req, res) => {
    try {
        const status = await axios.get(`${API_GATEWAY_URL}/charging/status`);
        res.json(status.data);
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('robot-status', { message: 'Errore durante il recupero dello stato del robot' });
    }
});

// Richiesta di azione del robot - solo admin
app.put('/robot/:action', adminMiddleware, async (req, res) => {
    try {
        if (req.params.action === 'start') {
            await axios.put(`${API_GATEWAY_URL}/charging/start`);
            const status = await axios.get(`${API_GATEWAY_URL}/charging/status`);
            res.json({ status: status.data });
        } else if (req.params.action === 'stop') {
            await axios.put(`${API_GATEWAY_URL}/charging/stop`);
            const status = await axios.get(`${API_GATEWAY_URL}/charging/status`);
            res.json({ status: status.data });
        }
        else {
            res.json({ message: 'Azione non valida' });
        }
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Errore durante l\'invio di azioni al robot' });
    }
});

// Visualizza tutti gli utenti - solo admin
app.get('/utentiAdmin', adminMiddleware, async (req, res) => {
    try {
        const utenti = await db.getAllUsers();
        return res.render('utentiAdmin', { users: utenti });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('utentiAdmin', { message: 'Errore durante la ricerca degli utenti' });
    }
});

// Upgrade di un utente a admin - solo admin
app.put('/update-admin/:userId', adminMiddleware, async (req, res) => {
    try {
        await db.updateUsertoAdmin(req.params.userId);
        res.json({ message: 'Utente aggiornato ad admin con successo!' });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Errore durante l\'upgrade ad admin' });
    }
});

// Visualizza Dashboard - solo admin
app.get('/dashboard', adminMiddleware, async (req, res) => {
    res.render('dashboard', { error: null });
});

// Visualizza lo stato di tutti i posti del parcheggio - solo admin
app.get('/parkingStatus', adminMiddleware, async (req, res) => {
    try {
        const parcheggio = await db.getAllSpots();
        return res.render('parkingStatus', { parkings:parcheggio });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('parkingStatus', { message: 'Errore durante la visualizzazione dei parcheggi' });
    }
});

// Visualizza tutti i pagamenti degli utenti - solo admin
app.get('/pagamentiAdmin', adminMiddleware, async (req, res) => {
    try {
        const pagamenti = await db.getAllPayments();
        res.render('pagamentiAdmin', { payments:pagamenti });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('pagamentiAdmin', { message: 'Errore durante la ricerca dei pagamenti' });
    }
});

// Visualizza pagina di modifica dei prezzi - solo admin
app.get('/modificaPrezzi', adminMiddleware, async (req, res) => {
    try {
        const prezzi = await axios.get(`${API_GATEWAY_URL}/parking/prezzi`);
        res.render('modificaPrezzi', { costoOra: prezzi.data.costoOra, costoRicarica: prezzi.data.costoRicarica });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.render('modificaPrezzi', { message: 'Errore durante il caricamento della pagina' });
    }
});

// Richiesta di aggiornamento dei prezzi - solo admin
app.put('/update-prezzi', adminMiddleware, async (req, res) => {
    try {
        const { prezzoOra, prezzoRicarica } = req.body;
        const prezzi = await axios.put(
            `${API_GATEWAY_URL}/parking/update-prezzi`,
            { 
                prezzoOra, prezzoRicarica
            }
        );
        res.json({ message: prezzi.data.message });
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.json({ message: 'Errore: ' + error.response.data.message });
    }
});

// Richiesta dei prezzi aggiornati
app.get('/get-prezzi', async (req, res) => {
    try {
        const prezzi = await axios.get(`${API_GATEWAY_URL}/parking/prezzi`);
        res.json(prezzi.data);
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Errore durante il recupero dei prezzi' });
    }
});

// Pagina documentazione
app.get('/docs', (req, res) => {
    res.render('docs');
});

// Pagina 404
app.get('/*', (req, res) => {
    res.render('404');
});

app.listen(PORT, () => {
    console.log(`Web app running on http://localhost:${PORT}`);
});