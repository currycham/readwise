// SQLite 数据库（WAL 模式，网站进程和后台任务进程可同时读写）。
// 单台服务器起步足够；用户量上来后可以迁到 PostgreSQL，表结构保持不变。
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeCategory } from '../config/categories.mjs';
import { dataPath } from '../engine/paths.mjs';

const FILE = process.env.DATABASE_FILE || dataPath('readwise.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE,                          -- 手机号和邮箱至少有一个
  email TEXT UNIQUE,                          -- 小写
  nickname TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',          -- user / admin
  credits INTEGER NOT NULL DEFAULT 0,
  member_until TEXT,                          -- 会员到期时间（ISO），空表示非会员
  banned INTEGER NOT NULL DEFAULT 0,
  unlimited INTEGER NOT NULL DEFAULT 0,       -- 内测白名单：不受生成、提问、播客额度限制
  signup_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- 登录验证码：target 是手机号或邮箱
CREATE TABLE IF NOT EXISTS login_codes (
  target TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  norm_key TEXT UNIQUE NOT NULL,              -- 规范化书名，用于去重
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  categories TEXT NOT NULL DEFAULT '[]',      -- JSON [{top, sub}]
  one_line TEXT NOT NULL DEFAULT '',
  douban_rating REAL,
  douban_count INTEGER,
  douban_via TEXT,                            -- douban（直接取自豆瓣）/ search（检索资料抽取）/ admin
  douban_id TEXT,                             -- 豆瓣 subject id，书页上链接到豆瓣
  douban_at TEXT,                             -- 上次从豆瓣取评分的时间
  page_json TEXT NOT NULL,
  model TEXT,
  source TEXT,                                -- search / upload
  check_score INTEGER,
  first_user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'ready',       -- ready / hidden
  views INTEGER NOT NULL DEFAULT 0,
  podcast_status TEXT NOT NULL DEFAULT 'none',-- none / queued / running / ready / failed
  podcast_file TEXT,
  podcast_ms INTEGER,
  podcast_script TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,                         -- generate / podcast
  status TEXT NOT NULL DEFAULT 'queued',      -- queued / running / done / failed / insufficient / ambiguous / review
  user_id INTEGER REFERENCES users(id),
  book_id INTEGER REFERENCES books(id),
  input TEXT NOT NULL DEFAULT '{}',
  progress TEXT NOT NULL DEFAULT '',
  result TEXT,
  error TEXT,
  charge TEXT,                                -- free / credits / member / admin
  charged_credits INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, id);
CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id, created_at);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_id INTEGER, book_id INTEGER, job_id INTEGER,
  task TEXT NOT NULL, model TEXT,
  input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, chars INTEGER,
  ms INTEGER, cost REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS usage_at ON usage(at);
CREATE INDEX IF NOT EXISTS usage_user_task ON usage(user_id, task, at);
CREATE TABLE IF NOT EXISTS credit_tx (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,                       -- signup / generate / ask / refund / admin / purchase
  ref TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS credit_tx_user ON credit_tx(user_id, reason, at);
CREATE INDEX IF NOT EXISTS credit_tx_reason ON credit_tx(reason, at);
CREATE TABLE IF NOT EXISTS book_opens (         -- 登录用户第一次打开书页的时间（闯关计分的最短阅读时间从这里算）
  user_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, book_id)
);
CREATE TABLE IF NOT EXISTS quiz_answers (       -- 每题只记第一次作答，计分只看第一次
  user_id INTEGER NOT NULL, book_id INTEGER NOT NULL, q INTEGER NOT NULL,
  choice INTEGER NOT NULL, correct INTEGER NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, book_id, q)
);
CREATE TABLE IF NOT EXISTS completions (        -- 首次闯关结果，一人一书一条
  user_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
  score INTEGER NOT NULL, total INTEGER NOT NULL, passed INTEGER NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0, note TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, book_id)
);
CREATE INDEX IF NOT EXISTS completions_book ON completions(book_id, passed);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  user_id INTEGER, book_id INTEGER,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',        -- open / resolved
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

let db;
export function getDb() {
  if (db) return db;
  mkdirSync(dirname(FILE), { recursive: true });
  db = new Database(FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// 给已有数据库补新增的列（CREATE TABLE IF NOT EXISTS 不会改旧表）
function migrate(db) {
  const cols = table => db.prepare(`PRAGMA table_info(${table})`).all();
  const has = (table, col) => cols(table).some(c => c.name === col);
  if (!has('users', 'unlimited')) db.exec('ALTER TABLE users ADD COLUMN unlimited INTEGER NOT NULL DEFAULT 0');
  if (!has('books', 'douban_id')) db.exec('ALTER TABLE books ADD COLUMN douban_id TEXT');
  if (!has('books', 'douban_at')) db.exec('ALTER TABLE books ADD COLUMN douban_at TEXT');

  // 支持邮箱登录：手机号改为可空，新增 email、signup_ip。SQLite 改不了 NOT NULL，只能重建表。
  // 网站和 worker 可能同时启动，检查放在 IMMEDIATE 事务里，只有一个进程会真正执行。
  if (cols('users').find(c => c.name === 'phone')?.notnull) {
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        if (!cols('users').find(c => c.name === 'phone')?.notnull) return;
        db.exec(`CREATE TABLE users_new (
          id INTEGER PRIMARY KEY, phone TEXT UNIQUE, email TEXT UNIQUE, nickname TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user', credits INTEGER NOT NULL DEFAULT 0, member_until TEXT,
          banned INTEGER NOT NULL DEFAULT 0, unlimited INTEGER NOT NULL DEFAULT 0, signup_ip TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), last_login_at TEXT);
          INSERT INTO users_new (id, phone, nickname, role, credits, member_until, banned, unlimited, created_at, last_login_at)
            SELECT id, phone, nickname, role, credits, member_until, banned, unlimited, created_at, last_login_at FROM users;
          DROP TABLE users;
          ALTER TABLE users_new RENAME TO users;`);
      }).immediate();
    } finally { db.pragma('foreign_keys = ON'); }
  }

  // 分类改为每本书只属于一个子问题：多于一个的只保留第一个（主分类）
  db.exec(`UPDATE books SET
      categories = json_array(json_extract(categories, '$[0]')),
      page_json = json_set(page_json, '$.book.categories', json_array(json_extract(categories, '$[0]')))
    WHERE json_array_length(categories) > 1`);

  // 分类表调整后，把旧分类名换成新分类（见 config/categories.mjs 的 RENAMES）
  const upd = db.prepare('UPDATE books SET categories = ?, page_json = json_set(page_json, \'$.book.categories\', json(?)) WHERE id = ?');
  for (const b of db.prepare('SELECT id, categories FROM books').all()) {
    const cur = JSON.parse(b.categories || '[]')[0];
    const to = normalizeCategory(cur);
    if (to && (to.top !== cur.top || to.sub !== cur.sub)) upd.run(JSON.stringify([to]), JSON.stringify([to]), b.id);
  }
}

export const now = () => new Date().toISOString();
export const tx = fn => getDb().transaction(fn)();
