const sqlite3 = require('sqlite3').verbose();

class DataBase {
    constructor() {
        this.db = new sqlite3.Database("./pissir.db", sqlite3.OPEN_READWRITE, (err) => {
            if (err) {
                console.error(err.message);
            }
        });
    }

    close() {
        this.db.close((err) => {
            if (err) {
                console.error(err.message);
            } else {
                console.log("Connessione al database chiusa.");
            }
        });
    }

    testConnection() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT 1", [], (err, row) => {
                if (err) {
                    console.error("Database connection test failed:", err);
                    reject(err);
                } else {
                    console.log("Database connection test successful");
                    resolve(true);
                }
            });
        });
    }

    insertPagamento(idUtente, prezzo, paymentType, data, paypalOrderID, idPrenotazione) {
        const sql = `
            INSERT INTO Pagamento(idUtente, prezzo, paymentType, data, paypalOrderID, idPrenotazione)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        return new Promise((resolve, reject) => {
            this.db.run(sql, [idUtente, prezzo, paymentType, data, paypalOrderID, idPrenotazione], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);  // Restituisce l'ID dell'ultimo pagamento inserito
                }
            });
        });
    }

    insertPagamentoPremium(idUtente, prezzo, paymentType, data, paypalOrderID) {
        const sql = `
            INSERT INTO Pagamento(idUtente, prezzo, paymentType, data, paypalOrderID, idPrenotazione)
            VALUES (?, ?, ?, ?, ?, NULL)`;

        return new Promise((resolve, reject) => {
            this.db.run(sql, [idUtente, prezzo, paymentType, data, paypalOrderID], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);  // Restituisce l'ID dell'ultimo pagamento inserito
                }
            });
        });
    }

    /*
    async changePaymentStatus(idPrenotazione) {
        const sql = `UPDATE Prenotazione SET isActivate = 0 WHERE idPrenotazione = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [idPrenotazione], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }*/

    insertNewPrenotazione(idUtente, idPosto, idTarga, startTime, endTime, chargeRequest, targetBattery, amount) {
        const sql = `INSERT INTO Prenotazione (idUtente, idPosto, idTarga, startTime, endTime, chargeRequest, isActivate, targetBattery, costo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            this.db.run(sql, [idUtente, idPosto, idTarga, startTime, endTime, chargeRequest, 0, targetBattery == '' ? null : targetBattery, amount], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    addNewUser(newUser, hashedPassword) {
        const sql = `INSERT INTO Utente(nome, email, password, ruoloUtente, googleId)
                     VALUES(?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            this.db.run(
                sql,
                [
                    newUser.name,
                    newUser.email,
                    hashedPassword,
                    'base', //ruoloUtente presettato ad utente base
                    null
                ],
                function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID });
                    }
                }
            );
        });
    }

    getUserByEmail(email) {
        const sql = `SELECT * FROM Utente WHERE email = ?`;
        return new Promise((resolve, reject) => {
            this.db.get(sql, [email], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    getAllUsers() {
        const sql = `SELECT * FROM Utente`;
        return new Promise((resolve, reject) => {
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getUserById(userId) {
        const sql = `SELECT * FROM Utente WHERE id = ?`;
        return new Promise((resolve, reject) => {
            this.db.get(sql, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    updateUserGoogleId(userId, googleId) {
        const sql = `UPDATE Utente SET googleId = ? WHERE id = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [googleId, userId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    updateUsertoAdmin(userId) {
        const sql = `UPDATE Utente SET ruoloUtente = 'admin' WHERE id = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [userId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    getPaymentByUserId(userId) {
        const sql = `SELECT * FROM Pagamento WHERE idUtente = ? AND paymentType = 'premium'`;
        return new Promise((resolve, reject) => {
            this.db.all(sql, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    upgradeToPremium(userId) {
        const sql = `UPDATE Utente SET ruoloUtente = 'premium' WHERE id = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [userId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    getSpotById(idPosto) {
        const sql = `SELECT * FROM Posto WHERE idPosto = ?`;
        return new Promise((resolve, reject) => {
            this.db.all(sql, [idPosto], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    getAllSpots() {
        const sql = `SELECT * FROM Posto`;
        return new Promise((resolve, reject) => {
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getAvailableSpots(isCharging) {
        let sql = `SELECT * FROM Posto WHERE isOccupato = 0`;
        if (isCharging !== undefined) {
            sql += ` AND isOnCharge = ?`;
            return new Promise((resolve, reject) => {
                this.db.all(sql, [isCharging ? 1 : 0], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        } else {
            return new Promise((resolve, reject) => {
                this.db.all(sql, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        }
    }

    initializeSpots() {
        return new Promise((resolve, reject) => {
            // Elimina tutti i posti
            this.db.run('DELETE FROM Posto', [], (err) => {
                if (err) {
                    reject(err);
                }

                try {

                    // Parcheggi normali
                    for (let i = 1; i <= 20; i++) {
                        this.db.run('INSERT INTO Posto (idPosto, isOccupato, isOnCharge) VALUES (?, 0, 0)', i);
                    }

                    // Parcheggi di ricarica
                    for (let i = 21; i <= 30; i++) {
                        this.db.run('INSERT INTO Posto (idPosto, isOccupato, isOnCharge) VALUES (?, 0, 1)', i);
                    }

                    resolve(true);
                    
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    resumeSpots() {
        const sql = `UPDATE Posto
        SET isOccupato = 1
        WHERE idPosto IN (
            SELECT idPosto FROM Prenotazione
            WHERE isActivate = 1
        )`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    getSpotById(spotId) {
        const sql = `SELECT * FROM Posto WHERE idPosto = ?`;
        return new Promise((resolve, reject) => {
            this.db.get(sql, [spotId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    updateSpotStatus(spotId, isOccupato) {
        const sql = `UPDATE Posto SET isOccupato = ? WHERE idPosto = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [isOccupato ? 1 : 0, spotId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    updateSpotChargeStatus(spotId, isOnCharge) {
        const sql = `UPDATE Posto SET isOnCharge = ? WHERE idPosto = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [isOnCharge ? 1 : 0, spotId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    getReservationById(reservationId) {
        const sql = `SELECT * FROM Prenotazione WHERE idPrenotazione = ?`;
        return new Promise((resolve, reject) => {
            this.db.get(sql, [reservationId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    getReservationByUserId(userId) {
        const sql = `SELECT * FROM Prenotazione WHERE idUtente = ?`;
        return new Promise((resolve, reject) => {
            this.db.all(sql, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    getUserReservations(userId) {
        const sql = `
            SELECT 
                p.*, 
                ps.isOccupato, 
                ps.isOnCharge
            FROM Prenotazione p
            JOIN Posto ps ON p.idPosto = ps.idPosto
            WHERE p.idUtente = ?
            ORDER BY p.startTime DESC`;

        return new Promise((resolve, reject) => {
            this.db.all(sql, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getFutureReservations(isCompletata, Penale) {
        const sql = `
            SELECT * FROM Prenotazione 
            WHERE completata = ?
            AND penale = ?`;

        return new Promise((resolve, reject) => {
            this.db.all(sql, [isCompletata, Penale], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getActiveReservationsbyUserId(idUtente) {
        const sql = `
            SELECT * FROM Prenotazione 
            WHERE isActivate = 1
            AND idUtente = ?`;

        return new Promise((resolve, reject) => {
            this.db.all(sql, [idUtente], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getReservationsPenali(idUtente) {
        const sql = `
            SELECT * FROM Prenotazione 
            WHERE penale = 1 AND completata = 0
            AND idUtente = ?`;

        return new Promise((resolve, reject) => {
            this.db.all(sql, [idUtente], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getStatusReservations(isActive, isCompletata, penale) {
        const sql = `
            SELECT * FROM Prenotazione 
            WHERE isActivate = ? 
            AND completata = ?
            AND penale = ?`;

        return new Promise((resolve, reject) => {
            this.db.all(sql, [isActive, isCompletata, penale], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    deleteReservationById(reservationId) {
        const sql = `DELETE FROM Prenotazione WHERE idPrenotazione = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [reservationId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    updateReservationStatus(reservationId, isActive) {
        const sql = `UPDATE Prenotazione SET isActivate = ? WHERE idPrenotazione = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [isActive ? 1 : 0, reservationId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    updateReservationPenale(reservationId, penale) {
        const sql = `UPDATE Prenotazione SET penale = ? WHERE idPrenotazione = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [penale, reservationId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    updateReservationPenalePaid(reservationId) {
        const sql = `UPDATE Prenotazione SET completata = 1 WHERE idPrenotazione = ? AND penale = 1`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [reservationId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    updateReservationCompletata(reservationId, completata) {
        const sql = `UPDATE Prenotazione SET completata = ?, isActivate = ? WHERE idPrenotazione = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [completata, completata == 1 ? 0 : 1, reservationId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    updateReservationSpot(reservationId, idPosto) {
        const sql = `UPDATE Prenotazione SET idPosto = ? WHERE idPrenotazione = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [idPosto, reservationId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    updateReservationCharge(reservationId, chargeRequest) {
        const sql = `UPDATE Prenotazione SET chargeRequest = ? WHERE idPrenotazione = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(sql, [chargeRequest, reservationId], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    getPayments(userId) {
        const sql = `
            SELECT 
                pg.*,
                p.startTime,
                p.endTime,
                p.idPosto
            FROM Pagamento pg
            LEFT JOIN Prenotazione p ON pg.idPrenotazione = p.idPrenotazione
            WHERE pg.idUtente = ?
            ORDER BY pg.data DESC`;

        return new Promise((resolve, reject) => {
            this.db.all(sql, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getAllPayments(userId) {
        const sql = `
                SELECT 
                    pg.idPayment,
                    ut.email,
                    ut.ruoloUtente,
                    pg.prezzo,
                    pg.data,
                    pg.paymentType
                FROM Pagamento pg
                LEFT JOIN Utente ut ON pg.idUtente = ut.id
                ORDER BY pg.data DESC`;

        return new Promise((resolve, reject) => {
            this.db.all(sql, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    findReservationsByLicensePlate(idTarga, startTime, endTime) {
        const sql = `
                SELECT * FROM Prenotazione 
                WHERE idTarga = ? 
                AND startTime >= ? 
                AND startTime < ? 
                AND completata = 0
                ORDER BY startTime ASC
            `;
        return new Promise((resolve, reject) => {
            this.db.all(sql, [idTarga, startTime, endTime], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    updatePrezzi(costoOra, costoRicarica) {
        const sql = `
            UPDATE Prezzi
            SET costoOra = ?, costoRicarica = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.run(sql, [costoOra, costoRicarica], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    getPrezzi() {
        const sql = `SELECT * FROM Prezzi`;
        return new Promise((resolve, reject) => {
            this.db.get(sql, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }


    // Helper per runnare query
    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }
}

module.exports = DataBase;