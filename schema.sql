PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    last_login_at   TEXT
);

CREATE TABLE IF NOT EXISTS invite_codes (
    code            TEXT PRIMARY KEY,
    created_by      TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    used_by         TEXT,
    used_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_invite_created ON invite_codes (created_at DESC);

CREATE TABLE IF NOT EXISTS entries (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL DEFAULT '',
    subject         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'unsolved'
                    CHECK (status IN ('unsolved', 'wrong', 'reviewing', 'mastered')),
    title           TEXT NOT NULL DEFAULT '',
    problem         TEXT NOT NULL DEFAULT '',
    answer          TEXT NOT NULL DEFAULT '',
    solution        TEXT NOT NULL DEFAULT '',
    error_type      TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT '',
    source_detail   TEXT NOT NULL DEFAULT '',
    chapter         TEXT NOT NULL DEFAULT '',
    tags            TEXT NOT NULL DEFAULT '[]',
    difficulty      INTEGER NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
    starred         INTEGER NOT NULL DEFAULT 0,
    attachments     TEXT NOT NULL DEFAULT '[]',
    ocr_text        TEXT NOT NULL DEFAULT '',
    ocr_status      TEXT NOT NULL DEFAULT 'idle',
    ocr_error       TEXT NOT NULL DEFAULT '',
    ocr_updated_at  TEXT,
    ai_status       TEXT NOT NULL DEFAULT 'idle',
    ai_answer       TEXT NOT NULL DEFAULT '',
    ai_solution     TEXT NOT NULL DEFAULT '',
    ai_error        TEXT NOT NULL DEFAULT '',
    ai_model        TEXT NOT NULL DEFAULT '',
    ai_generated_at TEXT,
    ai_updated_at   TEXT,
    ai_job_token    TEXT NOT NULL DEFAULT '',
    ai_metadata_version INTEGER NOT NULL DEFAULT 0,
    occurred_at     TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    review_count    INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at TEXT,
    next_review_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_entries_occurred ON entries (occurred_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_subject ON entries (subject);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries (status);
CREATE INDEX IF NOT EXISTS idx_entries_next_review ON entries (next_review_at);

CREATE TABLE IF NOT EXISTS reviews (
    id              TEXT PRIMARY KEY,
    entry_id        TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    reviewed_at     TEXT NOT NULL,
    result          TEXT NOT NULL CHECK (result IN ('again', 'hard', 'good', 'easy')),
    interval_days   INTEGER NOT NULL DEFAULT 1,
    note            TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_reviews_entry ON reviews (entry_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_time ON reviews (reviewed_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
    id          TEXT PRIMARY KEY,
    entry_id    TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_entry ON ai_messages (entry_id, created_at ASC);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    entry_id    TEXT,
    kind        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_time ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subjects (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_id, id)
);
