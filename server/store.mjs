import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import sanitizeHtml from 'sanitize-html';

const derive = promisify(scrypt);
export const id = (prefix = 'id') => `${prefix}-${randomBytes(16).toString('hex')}`;
export const token = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export const now = () => new Date().toISOString();
export const cleanHtml = html => sanitizeHtml(String(html || '').slice(0, 100000), {
  allowedTags: ['p','br','div','span','strong','b','em','i','u','s','h1','h2','h3','h4','ul','ol','li','blockquote','table','thead','tbody','tr','td','th','font'],
  allowedAttributes: { '*': ['style'], font: ['color','face','size'], td: ['colspan','rowspan'], th: ['colspan','rowspan'] },
  allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/], color: [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d,\s]+\)$/], 'font-weight': [/^(bold|normal|[1-9]00)$/], 'font-style': [/^(italic|normal)$/], 'text-decoration': [/^(underline|line-through)$/], 'font-family': [/^[a-zA-Z ,"'-]+$/], 'font-size': [/^\d{1,2}(px|pt)$/] } }
});
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  const [, salt, digest] = (stored || '').split('$');
  const expected = Buffer.from(digest || '00'.repeat(64), 'hex');
  const actual = await derive(String(password || ''), salt || 'no-account', 64, { N:32768, r:8, p:1, maxmem:64*1024*1024 });
  return expected.length === actual.length && timingSafeEqual(actual, expected) && !!digest;
}
export function openStore(directory, encryptionKey) {
  const key = Buffer.from(encryptionKey || '', 'base64');
  if (key.length !== 32) throw new Error('SETTINGS_ENCRYPTION_KEY must contain 32 random bytes encoded as base64. Run npm run setup.');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(directory, 'radaz.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','doctor','clinic')), approved INTEGER NOT NULL DEFAULT 0, profile TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_scope ON records(kind,owner);
    CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS launches (digest TEXT PRIMARY KEY, case_id TEXT NOT NULL, user_id TEXT NOT NULL, origin TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
  const store = {
    db,
    records(kind, owner) { return (owner === undefined ? db.prepare('SELECT value FROM records WHERE kind=? ORDER BY created_at DESC').all(kind) : db.prepare('SELECT value FROM records WHERE kind=? AND owner=? ORDER BY created_at DESC').all(kind, owner)).map(r => JSON.parse(r.value)); },
    get(recordId, kind) { const row = db.prepare('SELECT value FROM records WHERE id=? AND kind=?').get(recordId, kind); return row ? JSON.parse(row.value) : null; },
    put(kind, owner, value) { db.prepare('INSERT INTO records VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value.id, kind, owner, JSON.stringify(value), value.created_at || now()); return value; },
    remove(recordId, kind, owner) { return db.prepare('DELETE FROM records WHERE id=? AND kind=? AND owner=?').run(recordId, kind, owner); },
    setting(name, fallback = null) { const row = db.prepare('SELECT value FROM settings WHERE name=?').get(name); return row ? JSON.parse(row.value) : fallback; },
    set(name, value) { db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name, JSON.stringify(value)); },
    seal(name, value) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(name)); const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]); store.set(name,{iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}); },
    unseal(name, fallback = {}) { const value=store.setting(name); if(!value)return fallback; const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64')); decipher.setAAD(Buffer.from(name)); decipher.setAuthTag(Buffer.from(value.tag,'base64')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8')); },
    audit(actor, action, target='') { db.prepare('INSERT INTO audit(actor,action,target,at) VALUES(?,?,?,?)').run(actor,action,target,now()); },
    transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const value=fn(); db.exec('COMMIT'); return value; } catch(error) { db.exec('ROLLBACK'); throw error; } },
    close() { db.close(); }
  };
  return store;
}
export const safeUser = row => row ? { ...JSON.parse(row.profile), id:row.id, email:row.email, role:row.role, approved:!!row.approved } : null;
export async function createOwner(store, { email, password, name='RADAZ administrator' }) {
  if (store.setting('owner_id')) throw new Error('Owner already exists. Owner changes must be performed through a reviewed database migration.');
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12) throw new Error('A valid email and a password of at least 12 characters are required.');
  const owner=id('owner'), digest=await passwordHash(password);
  store.transaction(()=>{
    store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(owner,email.toLowerCase(),digest,'admin',1,JSON.stringify({name}),now());
    store.set('owner_id',owner);
    store.audit(owner,'owner_created');
  });
  return owner;
}
