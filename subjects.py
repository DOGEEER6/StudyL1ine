"""Per-account subject names, kinds and the one-time legacy SQLite migration."""
import re

DEFAULT_SUBJECTS = {"analysis": "工科数学分析", "linear": "线性代数"}
MAX_SUBJECTS = 50

# A subject kind decides the chapter catalog, the editor and the review flow.
SUBJECT_KINDS = {
    "math": {"label": "数学", "icon": "∑"},
    "cpp": {"label": "程序设计", "icon": "{ }"},
    "english": {"label": "英语", "icon": "A"},
    "other": {"label": "其他", "icon": "·"},
}
DEFAULT_KINDS = {"analysis": "math", "linear": "math"}

SUGGESTIONS = {
    "math": ["高等数学", "概率论与数理统计", "离散数学", "大学物理"],
    "cpp": ["C++ 程序设计", "数据结构", "算法设计与分析"],
    "english": ["大学英语", "英语写作", "雅思阅读"],
    "other": ["思政", "计算机导论"],
}


def normalize_name(value):
    if not isinstance(value, str):
        raise ValueError("请填写科目名称")
    name = " ".join(value.split())
    if not name or len(name) > 24:
        raise ValueError("科目名称请填写 1–24 个字")
    if any(ord(c) < 32 for c in name):
        raise ValueError("科目名称包含无效字符")
    return name


def normalize_kind(value, default="math"):
    if value in (None, ""):
        return default
    value = str(value).strip()
    if value not in SUBJECT_KINDS:
        raise ValueError("科目类型不正确")
    return value


def list_subjects(db, user_id):
    subjects = {
        key: {"id": key, "name": name, "kind": DEFAULT_KINDS.get(key, "math")}
        for key, name in DEFAULT_SUBJECTS.items()
    }
    for row in db.execute(
        "SELECT id,name,kind FROM subjects WHERE user_id=? ORDER BY created_at,id", (user_id,)
    ):
        subjects[row["id"]] = {
            "id": row["id"],
            "name": row["name"],
            "kind": row["kind"] or "math",
        }
    return list(subjects.values())


def subject_kind(db, user_id, subject):
    for item in list_subjects(db, user_id):
        if item["id"] == subject:
            return item["kind"]
    return "math"


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
