// Service di autenticazione con Google e registrazione/creazione utenti

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const DataBase = require('../../models/db');
require('dotenv').config();

const database = new DataBase();

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:3001/auth/google/callback';

// Configurazione per la documentazione Swagger
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./documentation/swagger/auth-service.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());

//console.log("Auth database connection status:", database.db ? "Connected" : "Not connected");

// Verifica la connessione al database
database.testConnection()
  .then(() => console.log("Database connection verified"))
  .catch(err => console.error("Database connection error:", err));

passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    passReqToCallback: true
},
async function(req, accessToken, refreshToken, profile, done) {
  try {
    // Recupera la mail principale dal profilo Google
    const email = profile.emails && profile.emails.length > 0 
        ? profile.emails[0].value 
        : null;
    
    if (!email) {
      return done(new Error("Non è stato possibile ottenere l'email dall'account Google"), null);
    }
    
    // Verifica se l'utente esiste già con questa email
    let user = await database.getUserByEmail(email);
    
    if (user) {
      // Aggiorna l'ID Google se necessario
      if (!user.googleId) {
        await database.updateUserGoogleId(user.id, profile.id);
      }
    } else {
      // Crea un nuovo utente
      const newUser = {
        name: profile.displayName || profile.name.givenName,
        email: email,
        sessionToken: null
      };
      
      // Salva l'utente senza password (solo autenticazione Google)
      const result = await database.addNewUser(newUser, null);
      await database.updateUserGoogleId(result.id, profile.id);
      
      // Recupera l'utente appena creato
      user = await database.getUserById(result.id);
    }
    
    return done(null, user);
  } catch (error) {
    console.error("Errore durante l'autenticazione Google:", error);
    return done(error, null);
  }
}
));

// Serializzazione e deserializzazione dell'utente
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await database.getUserById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Routes ---------------------------------------------------------

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Callback per l'autenticazione Google
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login-failed' }),
  (req, res) => {
    // Genera JWT dopo autenticazione riuscita
    const token = jwt.sign(
      { 
        id: req.user.id, 
        email: req.user.email, 
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    // Reindirizza al frontend con il token
    res.redirect(`http://localhost:8080/auth-success?token=${token}`);
    //res.status(201).json(token);
  }
);

app.get('/login-failed', (req, res) => {
  res.status(401).json({ message: 'Autenticazione con Google fallita' });
});

// Endpoint per la registrazione
app.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        //console.log("Registration request received:", req.body);

        const existingUser = await database.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: 'Utente già registrato' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
          name,
          email
        };
    
        const result = await database.addNewUser(newUser, hashedPassword)

        // Recupera l'utente creato
        const user = await database.getUserById(result.id);

        const token = jwt.sign(
            { id: user.id, email: user.email, ruoloUtente: user.ruoloUtente },
            JWT_SECRET,
            { expiresIn: '1d' }
          );

        res.status(201).json({ token, user: { id: user.id, nome: user.nome, email: user.email, ruoloUtente: user.ruoloUtente } });
    } catch (error) {
        res.status(500).json({ error: 'Errore durante la registrazione' });
    }
});

// Endpoint per il login
app.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Trova l'utente
      const user = await database.getUserByEmail(email);
      if (!user) {
        return res.status(400).json({ message: 'Credenziali non valide' });
      }
      
      // Verifica password (solo se la password esiste - utenti con Google potrebbero non averne)
      if (user.password) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(400).json({ message: 'Credenziali non valide' });
        }
      } else {
        return res.status(400).json({ message: 'Questo account utilizza l\'autenticazione Google. Usare "Login con Google".' });
      }
      
      // Genera JWT
      const token = jwt.sign(
        { id: user.id, email: user.email, ruoloUtente: user.ruoloUtente },
        JWT_SECRET,
        { expiresIn: '1d' }
      );
      
      res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, ruoloUtente: user.ruoloUtente } });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Errore del server' });
    }
});

// Verifica il token JWT
app.get('/verify', async (req, res) => {
    try {
        const token = req.header('x-auth-token');
        if (!token) {
            return res.status(401).json({ message: 'Token mancante, autorizzazione negata' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await database.getUserById(decoded.id);
        
        if (!user) {
            return res.status(404).json({ message: 'Utente non trovato' });
        }
        
        res.json({ user: { id: user.id, nome: user.nome, email: user.email, ruoloUtente: user.ruoloUtente } });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({ message: 'Token non valido' });
    }
});

// Upgrade a premium
app.put('/premium/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;

      const paymentData = await database.getPaymentByUserId(userId);
      if (!paymentData) {
        return res.status(404).json({ message: 'Dati di pagamento non trovati' });
      }

      // Aggiorna lo stato premium dell'utente
      await database.upgradeToPremium(userId);
      
      // Ottieni l'utente aggiornato
      const user = await database.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'Utente non trovato' });
      }
      
      // Genera un nuovo JWT con ruolo premium
      const token = jwt.sign(
        { id: user.id, email: user.email, ruoloUtente: user.ruoloUtente },
        JWT_SECRET,
        { expiresIn: '1d' }
      );
      
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          nome: user.nome, 
          email: user.email, 
          ruoloUtente: user.ruoloUtente
        } 
      });
    } catch (error) {
      console.error('Premium update error:', error);
      res.status(500).json({ message: 'Errore del server' });
    }
});
  
app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);

  process.on('SIGINT', () => {
    console.log('Closing database connection...');
    database.close();
    process.exit(0);
  });
});