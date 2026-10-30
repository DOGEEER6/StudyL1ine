"""Per-account subject names and the one-time legacy SQLite migration."""
import re

DEFAULT_SUBJECTS = {"analysis": "工科数学分析", "linear": "线性代数"}
MAX_SUBJECTS = 50


def normalize_name(value):
    if not isinstance(value, str):
        raise ValueError("请填写科目名称")
    name = " ".join(value.split())
    if not name or len(name) > 24:
        raise ValueError("科目名称请填写 1–24 个字")
    if any(ord(c) < 32 for c in name):
        raise ValueError("科目名称包含无效字符")
    return name


def list_subjects(db, user_id):
    subjects = {key: {"id": key, "name": name} for key, name in DEFAULT_SUBJECTS.items()}
    for row in db.execute("SELECT id,name FROM subjects WHERE user_id=? ORDER BY created_at,id", (user_id,)):
        subjects[row["id"]] = {"id": row["id"], "name": row["name"]}
    return list(subjects.values())


def expand_legacy_subject_column(db):
    """Rebuild only the legacy entries CHECK, retaining every column and child row."""
    source = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='entries'").fetchone()[0]
    expanded, count = re.subn(r"CHECK\s*\(\s*subject\s+IN\s*\(\s*'analysis'\s*,\s*'linear'\s*\)\s*\)", "", source, flags=re.I)
    if not count:
        return
    indexes = [row[0] for row in db.execute("SELECT sql FROM sqlite_master WHERE tbl_name='entries' AND type IN ('index','trigger') AND sql IS NOT NULL")]
    columns = ','.join('"'+row['name']+'"' for row in db.execute('PRAGMA table_info(entries)'))
    db.commit()
    db.execute('PRAGMA foreign_keys=OFF')
    try:
        db.execute('BEGIN IMMEDIATE')
        db.execute(re.sub(r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`]?entries["`]?', 'CREATE TABLE entries_subject_migration', expanded, count=1, flags=re.I))
        db.execute(f'INSERT INTO entries_subject_migration ({columns}) SELECT {columns} FROM entries')
        db.execute('DROP TABLE entries')
        db.execute('ALTER TABLE entries_subject_migration RENAME TO entries')
        for sql in indexes:
            db.execute(sql)
        if db.execute('PRAGMA foreign_key_check').fetchone():
            raise RuntimeError('科目迁移外键检查失败')
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.execute('PRAGMA foreign_keys=ON')
