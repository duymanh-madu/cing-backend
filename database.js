const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./game.db");

/**
 * USERS
 */

db.run(`
CREATE TABLE IF NOT EXISTS users (

  id INTEGER PRIMARY KEY AUTOINCREMENT,

  user_id TEXT UNIQUE,

  name TEXT,

  coins INTEGER DEFAULT 0,

  spins INTEGER DEFAULT 0,

  score INTEGER DEFAULT 0

)
`);

module.exports = db;