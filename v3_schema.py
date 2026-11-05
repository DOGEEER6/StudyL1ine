"""v3 schema: subject kinds, exams, explain sessions, grading, duels.

Everything here is additive. `apply` is called from app.migrate_db so the
production schema stays in sync without a separate migration tool.
"""

# (table, column, ddl) — added to existing tables when missing.
COLUMNS = [
    ("subjects", "kind", "TEXT NOT NULL DEFAULT 'math'"),
    ("entries", "code", "TEXT NOT NULL DEFAULT ''"),
    ("entries", "code_tests", "TEXT NOT NULL DEFAULT '[]'"),
    ("entries", "code_notes", "TEXT NOT NULL DEFAULT ''"),
    ("duel_answers", "text", "TEXT NOT NULL DEFAULT ''"),
    ("duel_answers", "image", "TEXT NOT NULL DEFAULT ''"),
    ("duel_answers", "verdict", "TEXT NOT NULL DEFAULT ''"),
    ("duel_answers", "reason", "TEXT NOT NULL DEFAULT ''"),
    ("duels", "analysis", "TEXT NOT NULL DEFAULT ''"),
]

TABLES = [
    """
    CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        exam_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS exam_plans (
        id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        entry_ids TEXT NOT NULL DEFAULT '[]',
        target INTEGER NOT NULL DEFAULT 0,
        done INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS explain_sessions (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        turns INTEGER NOT NULL DEFAULT 0,
        score INTEGER,
        verdict TEXT NOT NULL DEFAULT '',
        weak_points TEXT NOT NULL DEFAULT '[]',
        done INTEGER NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS explain_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES explain_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS grade_runs (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        verdict TEXT NOT NULL DEFAULT '',
        error_type TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS duels (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        subject TEXT NOT NULL,
        host_id TEXT NOT NULL,
        guest_id TEXT NOT NULL DEFAULT '',
        questions TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'waiting',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT '',
        finished_at TEXT NOT NULL DEFAULT '',
        duration INTEGER NOT NULL DEFAULT 300
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS duel_answers (
        duel_id TEXT NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        choice INTEGER NOT NULL DEFAULT -1,
        correct INTEGER NOT NULL DEFAULT 0,
        seconds REAL NOT NULL DEFAULT 0,
        answered_at TEXT NOT NULL,
        PRIMARY KEY (duel_id, user_id, idx)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS code_submissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entry_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        problem TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        tests TEXT NOT NULL DEFAULT '[]',
        verdict TEXT NOT NULL DEFAULT '',
        passed INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        elapsed_ms INTEGER NOT NULL DEFAULT 0,
        detail TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
    )
    """,
]


INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_code_submissions_user ON code_submissions(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_exams_user ON exams (user_id, exam_at)",
    "CREATE INDEX IF NOT EXISTS idx_exam_plans_exam ON exam_plans (exam_id, day)",
    "CREATE INDEX IF NOT EXISTS idx_explain_sessions_entry ON explain_sessions (entry_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_explain_messages_session ON explain_messages (session_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_grade_runs_entry ON grade_runs (entry_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_duels_status ON duels (status, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_duels_code ON duels (code)",
]


def _table_exists(db, name):
    return db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def _columns(db, table):
    return {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}


def apply(db):
    for table, column, ddl in COLUMNS:
        if not _table_exists(db, table):
            continue
        if column not in _columns(db, table):
            db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
    for sql in TABLES:
        db.execute(sql)
    for sql in INDEXES:
        db.execute(sql)
