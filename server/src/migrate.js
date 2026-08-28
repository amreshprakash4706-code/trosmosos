import { getDb, closeDb } from './db.js';
getDb();
console.log('[trosmos] migrations complete');
closeDb();
