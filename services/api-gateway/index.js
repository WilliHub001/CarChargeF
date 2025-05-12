// API Gateway per reindirizzare le richieste ai microservizi

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Service URLs
const AUTH_SERVICE_URL = 'http://localhost:3001';
const PARKING_SERVICE_URL = 'http://localhost:3002';
const CHARGING_SERVICE_URL = 'http://localhost:3003';
const PAYMENT_SERVICE_URL = 'http://localhost:3004';

// Middleware
app.use(cors());
app.use(express.json());

// Auth service proxy
app.use('/api/auth', createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    pathRewrite: {
        '^/api/auth': '/'
    },
    changeOrigin: true,
    on: {
        proxyReq: fixRequestBody,
    },
}));

// Parking service proxy
app.use('/api/parking', createProxyMiddleware({
    target: PARKING_SERVICE_URL,
    pathRewrite: {
        '^/api/parking': '/'
    },
    changeOrigin: true,
    on: {
        proxyReq: fixRequestBody,
    },
}));

// Charging service proxy
app.use('/api/charging', createProxyMiddleware({
    target: CHARGING_SERVICE_URL,
    pathRewrite: {
        '^/api/charging': '/'
    },
    changeOrigin: true,
    on: {
        proxyReq: fixRequestBody,
    },
}));

// Payment service proxy
app.use('/api/payments', createProxyMiddleware({
    target: PAYMENT_SERVICE_URL,
    pathRewrite: {
        '^/api/payments': '/'
    },
    changeOrigin: true,
    on: {
        proxyReq: fixRequestBody,
    },
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', services: ['api-gateway', 'auth', 'parking', 'charging', 'payment'] });
});

app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});