'use strict';
// SQLite qua module có sẵn của Node (node:sqlite) - không cần biên dịch native, hợp với hosting chia sẻ.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tbgroup.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const ML = (n) => `${n}_vi TEXT DEFAULT '', ${n}_zh TEXT DEFAULT '', ${n}_en TEXT DEFAULT ''`;

db.exec(`
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  ${ML('name')},
  city TEXT DEFAULT '',
  type TEXT DEFAULT 'university',
  image TEXT DEFAULT '',
  ${ML('summary')},
  ${ML('majors')},
  ${ML('requirements')},
  ${ML('scholarship')},
  tuition TEXT DEFAULT '',
  intake TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  website TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'labor',
  ${ML('title')},
  ${ML('description')},
  ${ML('requirements')},
  ${ML('benefits')},
  industry TEXT DEFAULT '',
  location TEXT DEFAULT '',
  salary TEXT DEFAULT '',
  headcount TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  age TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  image TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'news',
  ${ML('title')},
  ${ML('excerpt')},
  ${ML('body')},
  image TEXT DEFAULT '',
  published INTEGER DEFAULT 1,
  published_at TEXT DEFAULT (date('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  program TEXT DEFAULT 'engineer',
  detail TEXT DEFAULT '',
  ${ML('quote')},
  image TEXT DEFAULT '',
  published INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  program TEXT DEFAULT 'other',
  ref_title TEXT DEFAULT '',
  message TEXT DEFAULT '',
  lang TEXT DEFAULT 'vi',
  source TEXT DEFAULT '',
  status TEXT DEFAULT 'new',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, created_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Cột bổ sung cho bài viết (ghi nguồn trích dẫn, chú thích/bản quyền ảnh) - thêm an toàn cho CSDL đã có
for (const col of ['image_alt', 'image_credit', 'sources', 'source_file', 'publish_at', 'gallery']) {
  try { db.exec(`ALTER TABLE posts ADD COLUMN ${col} TEXT DEFAULT ''`); } catch { /* đã có */ }
}

for (const col of ['image_credit', 'sources', 'source_file']) {
  try { db.exec(`ALTER TABLE schools ADD COLUMN ${col} TEXT DEFAULT ''`); } catch { /* đã có */ }
}

// Cột đa ngôn ngữ cho các trường ngắn của đơn tuyển dụng (ngành, địa điểm, lương, giới tính, độ tuổi)
for (const f of ['industry', 'location', 'salary', 'gender', 'age']) {
  for (const l of ['en', 'zh']) {
    try { db.exec(`ALTER TABLE jobs ADD COLUMN ${f}_${l} TEXT DEFAULT ''`); } catch { /* đã có */ }
  }
}
try { db.exec("ALTER TABLE jobs ADD COLUMN source_file TEXT DEFAULT ''"); } catch { /* đã có */ }

// node:sqlite không nhận undefined -> chuyển thành null
const clean = (args) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a));
const all = (sql, ...args) => db.prepare(sql).all(...clean(args));
const get = (sql, ...args) => db.prepare(sql).get(...clean(args));
const run = (sql, ...args) => db.prepare(sql).run(...clean(args));

const getSettings = () => Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
const setSetting = (k, v) =>
  run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v ?? '');

module.exports = { db, all, get, run, getSettings, setSetting, DB_PATH };
