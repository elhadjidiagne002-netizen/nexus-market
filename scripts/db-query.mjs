// Exécute du SQL sur la base Supabase DÉPLOYÉE via l'API de management.
// Token : %TEMP%/sb-token.txt (sbp_…, extrait du credential manager de la CLI)
//         ou variable d'environnement SUPABASE_ACCESS_TOKEN.
// Usage : node scripts/db-query.mjs "SELECT 1"
//         node scripts/db-query.mjs --file database/migrations/xxx.sql
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REF = 'pqcqbstbdujzaclsiosv';
let token = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!token) {
  try { token = readFileSync(join(process.env.TEMP || '/tmp', 'sb-token.txt'), 'utf8').trim(); } catch {}
}
if (!token) { console.error('Token absent (sb-token.txt ou SUPABASE_ACCESS_TOKEN)'); process.exit(1); }

const arg = process.argv[2];
const sql = arg === '--file' ? readFileSync(process.argv[3], 'utf8') : arg;
if (!sql) { console.error('SQL manquant'); process.exit(1); }

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await r.json().catch(() => null);
if (!r.ok) { console.error(`HTTP ${r.status}:`, JSON.stringify(body, null, 1)); process.exit(1); }
console.log(JSON.stringify(body, null, 1));
