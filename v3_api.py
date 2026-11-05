"""学线 LearnL1ne v3: 考试复习计划、异步 PK、我来讲解、拍照批阅、代码题。

Every route lives under /api/v3 and is registered at the very end of app.py so
the core module object is fully initialised when we capture it here.
"""
import base64
import json
import math
import re
import secrets
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, redirect, render_template, request, session

import judge

bp = Blueprint("v3", __name__)
core = None
TZ = ZoneInfo("Asia/Shanghai")

DUEL_SIZE = 5
DUEL_MINUTES = 8
EXPLAIN_TURNS = 5


def register(app, core_module):
    global core
    core = core_module
    app.register_blueprint(bp)


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------
def db():
    return core.get_db()


def uid():
    return core.current_user()["id"]


def body():
    return request.get_json(silent=True) or {}


def fail(message, status=400):
    raise core.ApiError(message, status)


def now():
    return datetime.now(TZ)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M")


def parse_dt(value, field="时间"):
    text = str(value or "").strip().replace(" ", "T")
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=TZ)
        except ValueError:
            continue
    fail(f"{field}格式不正确")


def json_list(value):
    return core.parse_json_field(value, [])


def entry_label(row):
    return (row["title"] or (row["problem"] or "")[:18] or "未命名题目").strip()


def require_page_login():
    user = core.current_user()
    if not user:
        return None, redirect("/login")
    return user, None


# ---------------------------------------------------------------------------
# 考试倒计时 & 复习计划
# ---------------------------------------------------------------------------
@bp.get("/api/v3/exams")
def api_exams():
    db_ = db()
    rows = db_.execute(
        "SELECT * FROM exams WHERE user_id=? ORDER BY exam_at", (uid(),)
    ).fetchall()
    today = now().date()
    result = []
    for row in rows:
        exam_at = parse_dt(row["exam_at"])
        days_left = (exam_at.date() - today).days
        plan = db_.execute(
            "SELECT COUNT(*) AS days, COALESCE(SUM(target),0) AS target, "
            "COALESCE(SUM(done),0) AS done FROM exam_plans WHERE exam_id=?",
            (row["id"],),
        ).fetchone()
        result.append({
            "id": row["id"],
            "title": row["title"],
            "subject": row["subject"],
            "subject_name": core.subject_name(uid(), row["subject"], db_),
            "exam_at": row["exam_at"],
            "note": row["note"],
            "days_left": days_left,
            "urgent": 0 <= days_left <= 3,
            "plan_days": plan["days"],
            "plan_target": plan["target"],
            "plan_done": plan["done"],
        })
    return jsonify(exams=result)


@bp.post("/api/v3/exams")
def api_exam_create():
    data = body()
    title = str(data.get("title") or "").strip()
    if not title:
        fail("请填写考试名称")
    exam_at = parse_dt(data.get("exam_at"), "考试时间")
    if exam_at < now() - timedelta(days=1):
        fail("考试时间不能早于今天")
    subject = str(data.get("subject") or "analysis")
    if subject not in {s["id"] for s in core.list_subjects(db(), uid())}:
        fail("科目不存在")
    exam_id = "e_" + uuid.uuid4().hex
    db().execute(
        "INSERT INTO exams(id,user_id,title,subject,exam_at,note,created_at,updated_at) "
        "VALUES(?,?,?,?,?,?,?,?)",
        (exam_id, uid(), title[:40], subject, iso(exam_at), str(data.get("note") or "")[:200],
         core.now_utc(), core.now_utc()),
    )
    db().commit()
    return jsonify(ok=True, id=exam_id)


@bp.put("/api/v3/exams/<exam_id>")
def api_exam_update(exam_id):
    row = db().execute("SELECT * FROM exams WHERE id=? AND user_id=?", (exam_id, uid())).fetchone()
    if not row:
        fail("考试不存在", 404)
    data = body()
    fields, values = [], []
    if "title" in data:
        title = str(data.get("title") or "").strip()
        if not title:
            fail("请填写考试名称")
        fields.append("title=?")
        values.append(title[:40])
    if "exam_at" in data:
        fields.append("exam_at=?")
        values.append(iso(parse_dt(data.get("exam_at"), "考试时间")))
    if "note" in data:
        fields.append("note=?")
        values.append(str(data.get("note") or "")[:200])
    if "subject" in data:
        fields.append("subject=?")
        values.append(str(data.get("subject") or row["subject"]))
    if not fields:
        fail("没有需要更新的内容")
    fields.append("updated_at=?")
    values.append(core.now_utc())
    values.append(exam_id)
    db().execute(f"UPDATE exams SET {', '.join(fields)} WHERE id=?", values)
    db().commit()
    return jsonify(ok=True)


@bp.delete("/api/v3/exams/<exam_id>")
def api_exam_delete(exam_id):
    db().execute("DELETE FROM exams WHERE id=? AND user_id=?", (exam_id, uid()))
    db().commit()
    return jsonify(ok=True)


def build_plan(db_, exam):
    """Spread due entries across the days left, respecting their next review date."""
    exam_at = parse_dt(exam["exam_at"])
    today = now().date()
    days_left = max((exam_at.date() - today).days, 1)
    horizon = min(days_left, 21)
    rows = db_.execute(
        "SELECT * FROM entries WHERE user_id=? AND status!='mastered' "
        "AND (subject=? OR ?='') ORDER BY review_count, occurred_at",
        (exam["user_id"], exam["subject"], exam["subject"]),
    ).fetchall()
    if not rows:
        return []
    # priority: overdue first, then never reviewed, then weak mastery
    def priority(row):
        due = row["next_review_at"] or ""
        overdue = 0 if not due or due <= core.now_utc() else 1
        return (overdue, row["review_count"] or 0, -(row["difficulty"] or 3))
    ordered = sorted(rows, key=priority)
    per_day = max(1, min(20, math.ceil(len(ordered) / horizon)))
    plan = []
    cursor = 0
    for i in range(horizon):
        day = (today + timedelta(days=i)).isoformat()
        if cursor >= len(ordered):
            break
        chunk = ordered[cursor:cursor + per_day]
        cursor += per_day
        plan.append({
            "day": day,
            "entry_ids": [r["id"] for r in chunk],
            "target": len(chunk),
        })
    return plan


@bp.post("/api/v3/exams/<exam_id>/plan")
def api_exam_plan_build(exam_id):
    db_ = db()
    exam = db_.execute("SELECT * FROM exams WHERE id=? AND user_id=?", (exam_id, uid())).fetchone()
    if not exam:
        fail("考试不存在", 404)
    plan = build_plan(db_, exam)
    if not plan:
        fail("这个科目还没有待复习的题目，先去添加几道错题吧")
    db_.execute("DELETE FROM exam_plans WHERE exam_id=?", (exam_id,))
    for item in plan:
        db_.execute(
            "INSERT INTO exam_plans(id,exam_id,day,entry_ids,target,done,note) VALUES(?,?,?,?,?,0,'')",
            ("p_" + uuid.uuid4().hex, exam_id, item["day"], json.dumps(item["entry_ids"]), item["target"]),
        )
    db_.commit()
    return jsonify(ok=True, plan=_plan_payload(db_, exam_id))


def _plan_payload(db_, exam_id):
    rows = db_.execute("SELECT * FROM exam_plans WHERE exam_id=? ORDER BY day", (exam_id,)).fetchall()
    days = []
    for row in rows:
        ids = json_list(row["entry_ids"])
        entries = []
        if ids:
            marks = ",".join("?" * len(ids))
            for entry in db_.execute(f"SELECT id,title,problem,subject,status,next_review_at FROM entries WHERE id IN ({marks})", ids):
                entries.append({
                    "id": entry["id"],
                    "title": entry_label(entry),
                    "status": entry["status"],
                    "next_review_at": entry["next_review_at"],
                })
        days.append({
            "day": row["day"], "target": row["target"], "done": row["done"],
            "entries": entries,
        })
    return days


@bp.get("/api/v3/exams/<exam_id>")
def api_exam_detail(exam_id):
    db_ = db()
    exam = db_.execute("SELECT * FROM exams WHERE id=? AND user_id=?", (exam_id, uid())).fetchone()
    if not exam:
        fail("考试不存在", 404)
    exam_at = parse_dt(exam["exam_at"])
    return jsonify(
        exam={
            "id": exam["id"],
            "title": exam["title"],
            "subject": exam["subject"],
            "subject_name": core.subject_name(uid(), exam["subject"], db_),
            "exam_at": exam["exam_at"],
            "note": exam["note"],
            "days_left": (exam_at.date() - now().date()).days,
        },
        plan=_plan_payload(db_, exam_id),
    )


@bp.post("/api/v3/exams/<exam_id>/plan/<day>/done")
def api_plan_day_done(exam_id, day):
    row = db().execute(
        "SELECT p.* FROM exam_plans p JOIN exams e ON e.id=p.exam_id WHERE p.exam_id=? AND p.day=? AND e.user_id=?",
        (exam_id, day, uid()),
    ).fetchone()
    if not row:
        fail("计划不存在", 404)
    value = 1 if body().get("done", True) else 0
    db().execute("UPDATE exam_plans SET done=? WHERE id=?", (value, row["id"]))
    db().commit()
    return jsonify(ok=True, done=value)


# ---------------------------------------------------------------------------
# 异步 PK
# ---------------------------------------------------------------------------
def _duel_payload(db_, duel, viewer_id):
    ids = json_list(duel["questions"])
    questions = []
    if ids:
        marks = ",".join("?" * len(ids))
        by_id = {r["id"]: r for r in db_.execute(
            f"SELECT id,title,problem,ocr_text,subject,answer FROM entries WHERE id IN ({marks})", ids)}
        for index, entry_id in enumerate(ids):
            row = by_id.get(entry_id)
            if not row:
                continue
            questions.append({
                "idx": index,
                "id": row["id"],
                "title": entry_label(row),
                "problem": (row["problem"] or row["ocr_text"] or "")[:2000],
            })
    answers = {}
    for row in db_.execute("SELECT * FROM duel_answers WHERE duel_id=? AND user_id=?", (duel["id"], viewer_id)):
        answers[row["idx"]] = {"answered": True, "seconds": row["seconds"],
                               "image": bool(row["image"]), "text": row["text"]}
    mine = {"answers": answers}
    opponent_id = duel["guest_id"] if duel["host_id"] == viewer_id else duel["host_id"]
    done_counts = {}
    for row in db_.execute(
        "SELECT user_id, COUNT(*) AS n FROM duel_answers WHERE duel_id=? GROUP BY user_id", (duel["id"],)
    ):
        done_counts[row["user_id"]] = row["n"]
    return {
        "id": duel["id"],
        "code": duel["code"],
        "subject": duel["subject"],
        "subject_name": core.subject_name(viewer_id, duel["subject"], db_),
        "status": duel["status"],
        "is_host": duel["host_id"] == viewer_id,
        "questions": questions,
        "mine": mine,
        "opponent_done": done_counts.get(opponent_id, 0),
        "total": len(questions),
        "created_at": duel["created_at"],
        "finished_at": duel["finished_at"],
        "player_done": done_counts.get(viewer_id, 0) >= len(questions),
    }


def _pick_questions(db_, subject):
    rows = db_.execute(
        "SELECT id FROM entries WHERE subject=? AND problem!='' ORDER BY RANDOM() LIMIT ?",
        (subject, DUEL_SIZE),
    ).fetchall()
    if not rows:
        rows = db_.execute(
            "SELECT id FROM entries WHERE subject=? ORDER BY RANDOM() LIMIT ?", (subject, DUEL_SIZE)
        ).fetchall()
    return [row["id"] for row in rows]


@bp.post("/api/v3/duels")
def api_duel_create():
    db_ = db()
    data = body()
    subject = str(data.get("subject") or "analysis")
    if subject not in {s["id"] for s in core.list_subjects(db_, uid())}:
        fail("科目不存在")
    ids = _pick_questions(db_, subject)
    if len(ids) < 1:
        fail("这个科目还没有题目，先添加几道再来 PK")
    code = secrets.token_hex(3).upper()
    duel_id = "d_" + uuid.uuid4().hex
    db_.execute(
        "INSERT INTO duels(id,code,subject,host_id,guest_id,questions,status,created_at,expires_at,duration) "
        "VALUES(?,?,?,?,'',?,'waiting',?,?,?)",
        (duel_id, code, subject, uid(), json.dumps(ids), core.now_utc(),
         (now() + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M"), DUEL_MINUTES * 60),
    )
    db_.commit()
    return jsonify(ok=True, id=duel_id, code=code)


@bp.get("/api/v3/duels")
def api_duel_list():
    db_ = db()
    me = uid()
    rows = db_.execute(
        "SELECT * FROM duels WHERE host_id=? OR guest_id=? ORDER BY created_at DESC LIMIT 30", (me, me)
    ).fetchall()
    out = []
    for row in rows:
        out.append({
            "id": row["id"], "code": row["code"], "status": row["status"],
            "subject": row["subject"], "subject_name": core.subject_name(me, row["subject"], db_),
            "is_host": row["host_id"] == me,
            "created_at": row["created_at"],
            "opponent": "等待对手" if (row["host_id"] == me and not row["guest_id"]) or (row["guest_id"] == me and not row["host_id"]) else "已匹配",
            "result": _duel_result(db_, row, me) if row["status"] == "finished" else "",
        })
    return jsonify(duels=out)


def _duel_result(db_, duel, viewer_id):
    rows = db_.execute(
        "SELECT user_id, SUM(correct) AS score, SUM(seconds) AS secs, COUNT(*) AS n "
        "FROM duel_answers WHERE duel_id=? GROUP BY user_id", (duel["id"],)
    ).fetchall()
    stats = {row["user_id"]: row for row in rows}
    if len(stats) < 2:
        return "已结束"
    opponent = duel["guest_id"] if duel["host_id"] == viewer_id else duel["host_id"]
    if viewer_id not in stats or opponent not in stats:
        return "已结束"
    a, b = stats[viewer_id], stats[opponent]
    if a["score"] != b["score"]:
        return "胜利" if a["score"] > b["score"] else "惜败"
    if abs((a["secs"] or 0) - (b["secs"] or 0)) > 0.5:
        return "胜利" if (a["secs"] or 0) < (b["secs"] or 0) else "惜败"
    return "平局"


@bp.get("/api/v3/duels/lobby")
def api_duel_lobby():
    db_ = db()
    subject = request.args.get("subject", "")
    rows = db_.execute(
        "SELECT d.*, u.username FROM duels d JOIN users u ON u.id=d.host_id "
        "WHERE d.status='waiting' AND d.host_id!=? AND d.subject LIKE ? ORDER BY d.created_at DESC LIMIT 20",
        (uid(), f"%{subject}%"),
    ).fetchall()
    return jsonify(duels=[{
        "id": row["id"], "code": row["code"], "host": row["username"],
        "subject_name": core.subject_name(uid(), row["subject"], db_),
        "count": len(json_list(row["questions"])), "created_at": row["created_at"],
    } for row in rows])


@bp.post("/api/v3/duels/join")
def api_duel_join():
    db_ = db()
    code = str(body().get("code") or "").strip().upper()
    if not code:
        fail("请填写邀请码")
    row = db_.execute("SELECT * FROM duels WHERE code=? AND status='waiting' ORDER BY created_at DESC", (code,)).fetchone()
    if not row:
        fail("邀请码不存在或已失效", 404)
    if row["host_id"] == uid():
        fail("这是你自己创建的对局")
    db_.execute("UPDATE duels SET guest_id=?, status='ready', started_at=? WHERE id=?", (uid(), core.now_utc(), row["id"]))
    db_.commit()
    return jsonify(ok=True, id=row["id"])


@bp.get("/api/v3/duels/<duel_id>")
def api_duel_get(duel_id):
    db_ = db()
    row = db_.execute("SELECT * FROM duels WHERE id=?", (duel_id,)).fetchone()
    if not row or uid() not in (row["host_id"], row["guest_id"]):
        fail("对局不存在", 404)
    return jsonify(duel=_duel_payload(db_, row, uid()))


DUEL_GRADE_SYSTEM = (
    "你是批改手写解答的助教。会给你一道题、它的标准答案，以及学生写在纸上的解答照片。\n"
    "判断学生这次解答对不对：只看结论和关键步骤；符号写法不同但数学等价算对；\n"
    "只写最终答案且答案正确也算对；有明显推导错误、结论错误、只写了一半算错。\n"
    "reason 用一句中文说清对在哪 / 错在哪一步，不要复述整道题。\n"
    '只返回 JSON：{"correct": true, "reason": "..."}，不要代码围栏。'
)


def _grade_handwriting(entry, data_url):
    """把手写解答照片交给 AI 判对错，返回 (correct, reason)。"""
    config = core.get_ai_config(db())
    core.check_ai_quota(db(), uid(), "grade")
    answer = (entry["answer"] or entry["solution"] or "")[:2000]
    prompt = "题目：\n%s\n\n标准答案：\n%s\n\n下面是学生的手写解答照片。" % (
        (entry["problem"] or entry["ocr_text"] or "")[:3000],
        answer or "（题库里没写标准答案，请你自己解一遍再判断）",
    )
    messages = [
        {"role": "system", "content": DUEL_GRADE_SYSTEM},
        {"role": "user", "content": core.image_content([prompt], [data_url])},
    ]
    try:
        reply, _model, _usage = core.call_ai(
            {**config, "structured_output": True}, messages, config.get("model"))
    except core.AIError as exc:
        fail(str(exc), 502)
    parsed = _parse_json(reply)
    return bool(parsed.get("correct")), str(parsed.get("reason") or "")[:300]


@bp.post("/api/v3/duels/<duel_id>/answer")
def api_duel_answer(duel_id):
    db_ = db()
    duel = db_.execute("SELECT * FROM duels WHERE id=?", (duel_id,)).fetchone()
    me = uid()
    if not duel or me not in (duel["host_id"], duel["guest_id"]):
        fail("对局不存在", 404)
    if duel["status"] not in {"ready", "playing"}:
        fail("对局尚未开始或已经结束")
    data = body()
    index = int(data.get("idx", -1))
    text = str(data.get("text") or "").strip()[:2000]
    image = str(data.get("image") or "")
    seconds = max(0.0, min(600.0, float(data.get("seconds") or 0)))
    ids = json_list(duel["questions"])
    if not 0 <= index < len(ids):
        fail("题号不正确")
    entry = db_.execute("SELECT * FROM entries WHERE id=?", (ids[index],)).fetchone()
    if not entry:
        fail("题目已不存在", 404)
    saved = ""
    reason = ""
    if image.startswith("data:image/"):
        item = core.save_image_attachment(image, "PK 手写解答", "solution")
        saved = item["thumb"]
        correct, reason = _grade_handwriting(entry, image)
    elif text:
        correct = _answer_matches(text, entry["answer"])
        reason = "答案一致" if correct else "和参考答案不一致"
    else:
        fail("先写答案或者拍一张解答再提交")
    db_.execute(
        "INSERT INTO duel_answers(duel_id,user_id,idx,choice,correct,seconds,answered_at,text,image,verdict,reason) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(duel_id,user_id,idx) DO UPDATE SET choice=excluded.choice, correct=excluded.correct, "
        "seconds=excluded.seconds, answered_at=excluded.answered_at, text=excluded.text, "
        "image=excluded.image, verdict=excluded.verdict, reason=excluded.reason",
        (duel_id, me, index, 0, 1 if correct else 0, seconds, core.now_utc(),
         text[:2000], saved, "AC" if correct else "WA", reason),
    )
    if duel["status"] == "ready":
        db_.execute("UPDATE duels SET status='playing' WHERE id=?", (duel_id,))
    db_.commit()
    done = db_.execute(
        "SELECT COUNT(*) AS n FROM duel_answers WHERE duel_id=? AND user_id=?", (duel_id, me)
    ).fetchone()["n"]
    # 对局过程中不透露对错，交卷后统一看解析
    return jsonify(ok=True, idx=index, answered=done, total=len(ids))


def _normalize_answer(text):
    value = str(text or "").strip().lower()
    value = re.sub(r"[\s$，。；：、（）()\[\]{}]", "", value)
    value = value.replace("，", "").replace(",", "")
    return value


def _answer_matches(given, expected):
    a, b = _normalize_answer(given), _normalize_answer(expected)
    if not a or not b:
        return False
    if a == b:
        return True
    if len(b) >= 3 and (b in a or a in b):
        return True
    return False


@bp.post("/api/v3/duels/<duel_id>/submit")
def api_duel_submit(duel_id):
    db_ = db()
    duel = db_.execute("SELECT * FROM duels WHERE id=?", (duel_id,)).fetchone()
    me = uid()
    if not duel or me not in (duel["host_id"], duel["guest_id"]):
        fail("对局不存在", 404)
    ids = json_list(duel["questions"])
    answered = {row["idx"] for row in db_.execute(
        "SELECT idx FROM duel_answers WHERE duel_id=? AND user_id=?", (duel_id, me))}
    for index in range(len(ids)):
        if index not in answered:
            db_.execute(
                "INSERT INTO duel_answers(duel_id,user_id,idx,choice,correct,seconds,answered_at) VALUES(?,?,?,0,0,0,?)",
                (duel_id, me, index, core.now_utc()),
            )
    both = db_.execute(
        "SELECT COUNT(DISTINCT user_id) AS n FROM duel_answers WHERE duel_id=?", (duel_id,)
    ).fetchone()["n"]
    status = "finished" if both >= 2 else "playing"
    db_.execute(
        "UPDATE duels SET status=?, finished_at=? WHERE id=?",
        (status, core.now_utc() if status == "finished" else "", duel_id),
    )
    db_.commit()
    return jsonify(ok=True, status=status, result=_duel_result(db_, duel, me))


@bp.get("/api/v3/duels/<duel_id>/result")
def api_duel_result(duel_id):
    db_ = db()
    me = uid()
    duel = db_.execute("SELECT * FROM duels WHERE id=?", (duel_id,)).fetchone()
    if not duel or me not in (duel["host_id"], duel["guest_id"]):
        fail("对局不存在", 404)
    rows = db_.execute(
        "SELECT user_id, COUNT(*) AS n, SUM(correct) AS score, SUM(seconds) AS secs "
        "FROM duel_answers WHERE duel_id=? GROUP BY user_id", (duel_id,)
    ).fetchall()
    names = {row["id"]: row["username"] for row in db_.execute("SELECT id,username FROM users")}
    players = [{
        "user_id": row["user_id"],
        "name": names.get(row["user_id"], "同学"),
        "score": row["score"] or 0,
        "total": row["n"],
        "seconds": round(row["secs"] or 0, 1),
        "you": row["user_id"] == me,
    } for row in rows]
    questions = []
    finished = duel["status"] == "finished"
    if finished:
        ids = json_list(duel["questions"])
        marks = ",".join("?" * len(ids)) if ids else ""
        entries = {}
        if ids:
            entries = {r["id"]: r for r in db_.execute(
                "SELECT id,title,problem,ocr_text,answer,solution,ai_solution FROM entries "
                f"WHERE id IN ({marks})", ids)}
        mine = {r["idx"]: r for r in db_.execute(
            "SELECT * FROM duel_answers WHERE duel_id=? AND user_id=?", (duel_id, me))}
        for index, entry_id in enumerate(ids):
            entry = entries.get(entry_id)
            if not entry:
                continue
            answer = mine.get(index)
            questions.append({
                "idx": index,
                "id": entry_id,
                "title": entry_label(entry),
                "problem": (entry["problem"] or entry["ocr_text"] or "")[:1500],
                "correct_answer": entry["answer"] or "",
                "solution": (entry["solution"] or entry["ai_solution"] or "")[:1500],
                "your_text": answer["text"] if answer else "",
                "your_image": answer["image"] if answer else "",
                "verdict": ("AC" if answer and answer["correct"] else "WA") if answer else "—",
                "reason": answer["reason"] if answer else "",
                "seconds": round(answer["seconds"], 1) if answer else 0,
            })
    return jsonify(ok=True, status=duel["status"], players=players, questions=questions,
                   analysis=json.loads(duel["analysis"]) if duel["analysis"] else [])


DUEL_ANALYSIS_SYSTEM = (
    "你是程序设计/数学课的助教。下面是学生在一次 PK 里的错题，请逐题写解析。\n"
    "每题给三个字段：point（这题考什么，10 字内）、why（他大概错在哪，结合他的答案说）、\n"
    "how（正确思路两三句，能直接看懂）。\n"
    '只返回 JSON：{"items":[{"idx":0,"point":"...","why":"...","how":"..."}]}，不要代码围栏。'
)


@bp.post("/api/v3/duels/<duel_id>/analysis")
def api_duel_analysis(duel_id):
    db_ = db()
    me = uid()
    duel = db_.execute("SELECT * FROM duels WHERE id=?", (duel_id,)).fetchone()
    if not duel or me not in (duel["host_id"], duel["guest_id"]):
        fail("对局不存在", 404)
    if duel["analysis"]:
        return jsonify(ok=True, analysis=json.loads(duel["analysis"]))
    if duel["status"] != "finished":
        fail("对手还没交卷，等结束后再看解析")
    ids = json_list(duel["questions"])
    entries = {r["id"]: r for r in db_.execute(
        "SELECT id,title,problem,ocr_text,answer FROM entries WHERE id IN (%s)" % ",".join("?" * len(ids)), ids)}
    mine = {r["idx"]: r for r in db_.execute(
        "SELECT * FROM duel_answers WHERE duel_id=? AND user_id=?", (duel_id, me))}
    wrong = []
    for index, entry_id in enumerate(ids):
        entry = entries.get(entry_id)
        answer = mine.get(index)
        if not entry or (answer and answer["correct"]):
            continue
        wrong.append({
            "idx": index,
            "problem": (entry["problem"] or entry["ocr_text"] or "")[:1200],
            "correct_answer": entry["answer"] or "",
            "your_answer": (answer["text"] if answer and answer["text"] else "") or
                           ("（拍照提交：" + (answer["reason"] if answer else "") + "）" if answer and answer["image"] else "（没答）"),
        })
    if not wrong:
        db_.execute("UPDATE duels SET analysis=? WHERE id=?", (json.dumps([]), duel_id))
        db_.commit()
        return jsonify(ok=True, analysis=[])
    config = core.get_ai_config(db_)
    core.check_ai_quota(db_, me, "analysis")
    messages = [
        {"role": "system", "content": DUEL_ANALYSIS_SYSTEM},
        {"role": "user", "content": json.dumps(wrong, ensure_ascii=False)[:12000]},
    ]
    try:
        reply, _model, _usage = core.call_ai(
            {**config, "structured_output": True}, messages, config.get("model"))
    except core.AIError as exc:
        fail(str(exc), 502)
    items = _parse_json(reply).get("items") or []
    clean = []
    for item in items:
        if not isinstance(item, dict):
            continue
        clean.append({
            "idx": int(item.get("idx") or 0),
            "point": str(item.get("point") or "")[:60],
            "why": str(item.get("why") or "")[:400],
            "how": str(item.get("how") or "")[:800],
        })
    db_.execute("UPDATE duels SET analysis=? WHERE id=?", (json.dumps(clean, ensure_ascii=False), duel_id))
    db_.commit()
    return jsonify(ok=True, analysis=clean)


# ---------------------------------------------------------------------------
# 我来讲解
# ---------------------------------------------------------------------------
EXPLAIN_SYSTEM = (
    "你是一个刚学这一章的大一学生，正在听同学给你讲题。规则：\n"
    "1. 你只能以学生的身份提问，绝对不能给出正确解法或答案，也不要说“你应该……”。\n"
    "2. 每次只问一个问题，1–2 句话，口语化，符合大一学生的水平。\n"
    "3. 优先追问对方跳过的步骤、用到的公式为什么成立、以及“为什么要这样做”。\n"
    "4. 如果对方讲错了，用疑问句引导他自己发现，例如“可是这里符号是不是反了？”。\n"
    "5. 如果对方讲清楚了，就表现出“哦——原来是这样”，并提出一个更深一点的小追问。\n"
    "只输出你要说的话，不要 JSON，不要旁白。"
)

EXPLAIN_EVAL = (
    "你是数学/编程课的助教。下面是一个学生给 AI 学生讲题的完整对话。请评价他是否真的讲懂了。\n"
    "只返回 JSON：{\"score\": 0-100 的整数, \"verdict\": \"一句话总评\", "
    "\"weak_points\": [\"没讲清楚的点\", ...], \"next_step\": \"下一步建议\"}。\n"
    "评分标准：概念准确 40、步骤完整 30、能回答追问 30。只返回 JSON，不要代码围栏。"
)


def _entry_for_explain(row):
    parts = [f"科目：{core.subject_name(row['user_id'], row['subject'])}",
             f"题目：{row['problem'] or row['ocr_text'] or ''}"]
    if row["solution"]:
        parts.append(f"标准解析（只有你知道，不要直接告诉对方）：{row['solution'][:3000]}")
    if row["answer"]:
        parts.append(f"标准答案（保密）：{row['answer'][:500]}")
    return "\n".join(parts)


@bp.post("/api/v3/explain/start")
def api_explain_start():
    db_ = db()
    data = body()
    entry_id = str(data.get("entry_id") or "")
    entry = db_.execute("SELECT * FROM entries WHERE id=? AND user_id=?", (entry_id, uid())).fetchone()
    if not entry:
        fail("题目不存在", 404)
    open_row = db_.execute(
        "SELECT * FROM explain_sessions WHERE entry_id=? AND user_id=? AND done=0 ORDER BY created_at DESC",
        (entry_id, uid()),
    ).fetchone()
    if open_row:
        return jsonify(ok=True, id=open_row["id"], resumed=True, turns=open_row["turns"])
    config = core.get_ai_config(db_)
    core.check_ai_quota(db_, uid(), "chat")
    messages = [
        {"role": "system", "content": EXPLAIN_SYSTEM + "\n\n你手里的题目信息：\n" + _entry_for_explain(entry)},
        {"role": "user", "content": "（同学坐下了，准备开始讲题。你先开口问他。）"},
    ]
    try:
        text, _model, _usage = core.call_ai(config, messages)
    except core.AIError as exc:
        fail(str(exc), 502)
    session_id = "x_" + uuid.uuid4().hex
    db_.execute(
        "INSERT INTO explain_sessions(id,entry_id,user_id,created_at,updated_at,turns,score,verdict,weak_points,done) "
        "VALUES(?,?,?,?,?,0,NULL,'','[]',0)",
        (session_id, entry_id, uid(), core.now_utc(), core.now_utc()),
    )
    db_.execute(
        "INSERT INTO explain_messages(id,session_id,role,content,created_at) VALUES(?,?,?,?,?)",
        ("m_" + uuid.uuid4().hex, session_id, "assistant", text.strip()[:4000], core.now_utc()),
    )
    db_.commit()
    return jsonify(ok=True, id=session_id, message=text.strip())


@bp.get("/api/v3/explain/<session_id>")
def api_explain_get(session_id):
    db_ = db()
    row = db_.execute("SELECT * FROM explain_sessions WHERE id=? AND user_id=?", (session_id, uid())).fetchone()
    if not row:
        fail("会话不存在", 404)
    messages = [{"role": m["role"], "content": m["content"], "at": m["created_at"]}
                for m in db_.execute("SELECT * FROM explain_messages WHERE session_id=? ORDER BY created_at", (session_id,))]
    entry = db_.execute("SELECT * FROM entries WHERE id=?", (row["entry_id"],)).fetchone()
    return jsonify(
        session={"id": row["id"], "entry_id": row["entry_id"], "turns": row["turns"],
                 "score": row["score"], "verdict": row["verdict"],
                 "weak_points": json_list(row["weak_points"]), "done": bool(row["done"])},
        entry={"id": entry["id"], "title": entry_label(entry), "problem": entry["problem"] or entry["ocr_text"]} if entry else None,
        messages=messages,
    )


@bp.post("/api/v3/explain/<session_id>/message")
def api_explain_message(session_id):
    db_ = db()
    row = db_.execute("SELECT * FROM explain_sessions WHERE id=? AND user_id=?", (session_id, uid())).fetchone()
    if not row:
        fail("会话不存在", 404)
    if row["done"]:
        fail("这轮讲解已经结束了")
    content = str(body().get("content") or "").strip()
    if not content:
        fail("说点什么再发出去")
    content = content[:4000]
    entry = db_.execute("SELECT * FROM entries WHERE id=?", (row["entry_id"],)).fetchone()
    db_.execute(
        "INSERT INTO explain_messages(id,session_id,role,content,created_at) VALUES(?,?,?,?,?)",
        ("m_" + uuid.uuid4().hex, session_id, "user", content, core.now_utc()),
    )
    turns = row["turns"] + 1
    config = core.get_ai_config(db_)
    core.check_ai_quota(db_, uid(), "chat")
    history = [{"role": "system", "content": EXPLAIN_SYSTEM + "\n\n你手里的题目信息：\n" + _entry_for_explain(entry)}]
    for msg in db_.execute("SELECT role,content FROM explain_messages WHERE session_id=? ORDER BY created_at", (session_id,)):
        history.append({"role": "assistant" if msg["role"] == "assistant" else "user", "content": msg["content"]})
    finished = turns >= EXPLAIN_TURNS
    if finished:
        history.append({"role": "user", "content": "（讲解结束。请按助教要求给出 JSON 评价。）"})
        history[0] = {"role": "system", "content": EXPLAIN_EVAL}
    try:
        text, model, _usage = core.call_ai({**config, "structured_output": finished}, history)
    except core.AIError as exc:
        fail(str(exc), 502)
    reply = text.strip()
    evaluation = None
    if finished:
        evaluation = _parse_eval(reply)
        db_.execute(
            "UPDATE explain_sessions SET done=1, score=?, verdict=?, weak_points=?, turns=?, updated_at=? WHERE id=?",
            (evaluation["score"], evaluation["verdict"][:200],
             json.dumps(evaluation["weak_points"], ensure_ascii=False), turns, core.now_utc(), session_id),
        )
    else:
        db_.execute("UPDATE explain_sessions SET turns=?, updated_at=? WHERE id=?", (turns, core.now_utc(), session_id))
    db_.execute(
        "INSERT INTO explain_messages(id,session_id,role,content,created_at) VALUES(?,?,?,?,?)",
        ("m_" + uuid.uuid4().hex, session_id, "assistant", reply[:4000], core.now_utc()),
    )
    db_.commit()
    return jsonify(ok=True, reply=reply, turns=turns, finished=finished, evaluation=evaluation,
                   remaining=max(0, EXPLAIN_TURNS - turns))


def _parse_eval(text):
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        data = json.loads(cleaned)
    except ValueError:
        match = re.search(r"\{.*\}", cleaned, re.S)
        try:
            data = json.loads(match.group(0)) if match else {}
        except ValueError:
            data = {}
    try:
        score = max(0, min(100, int(data.get("score", 60))))
    except (TypeError, ValueError):
        score = 60
    weak = data.get("weak_points") or []
    if isinstance(weak, str):
        weak = [weak]
    return {
        "score": score,
        "verdict": str(data.get("verdict") or "讲得还不错，再练一次会更稳。"),
        "weak_points": [str(w)[:120] for w in weak][:5],
        "next_step": str(data.get("next_step") or ""),
    }


# ---------------------------------------------------------------------------
# 拍照批阅（复习后把写的过程拍给 AI）
# ---------------------------------------------------------------------------
GRADE_SYSTEM = (
    "你是严格的助教。用户在做完这道题后上传了自己手写的过程照片，你要批阅并给出明确的分数。\n"
    "只返回 JSON：{\"score\": 0-100, \"verdict\": \"一句话结论，对/部分对/错\", "
    "\"error_step\": \"错在第几步，没错写空字符串\", "
    "\"error_type\": \"概念错误|计算失误|思路错误|审题错误|步骤跳跃|无错误\", "
    "\"detail\": \"80 字以内的具体点评\", \"correct_solution\": \"如果错了，给出关键正确步骤\"}\n"
    "不要代码围栏，不要多余文字。"
)


@bp.post("/api/v3/grade")
def api_grade():
    db_ = db()
    data = body()
    entry_id = str(data.get("entry_id") or "")
    image = str(data.get("image") or "")
    if not image.startswith("data:image/"):
        fail("请上传拍到的解题过程图片")
    if len(image) > 8_000_000:
        fail("图片太大，请压缩后再上传")
    entry = db_.execute("SELECT * FROM entries WHERE id=? AND user_id=?", (entry_id, uid())).fetchone()
    if not entry:
        fail("题目不存在", 404)
    config = core.get_ai_config(db_)
    core.check_ai_quota(db_, uid(), "ocr")
    parts = [
        "科目：" + core.subject_name(uid(), entry["subject"], db_),
        "原题：" + (entry["problem"] or entry["ocr_text"] or "")[:3000],
        "标准答案（仅供你批阅参考）：" + (entry["answer"] or "")[:1000],
        "标准解析：" + (entry["solution"] or "")[:3000],
        "下面是学生手写过程的照片，请批阅。",
    ]
    messages = [
        {"role": "system", "content": GRADE_SYSTEM},
        {"role": "user", "content": core.image_content(parts, [image])},
    ]
    try:
        text, model, _usage = core.call_ai({**config, "structured_output": True}, messages,
                                           config.get("vision_model") or config.get("model"))
    except core.AIError as exc:
        fail(str(exc), 502)
    result = _parse_grade(text)
    db_.execute(
        "INSERT INTO grade_runs(id,entry_id,user_id,score,verdict,error_type,detail,created_at) VALUES(?,?,?,?,?,?,?,?)",
        ("g_" + uuid.uuid4().hex, entry_id, uid(), result["score"], result["verdict"][:120],
         result["error_type"][:20], json.dumps(result, ensure_ascii=False)[:8000], core.now_utc()),
    )
    if entry["error_type"] != result["error_type"]:
        db_.execute("UPDATE entries SET error_type=? WHERE id=?", (result["error_type"][:40], entry_id))
    db_.commit()
    return jsonify(ok=True, grade=result)


def _salvage_tests(text):
    """JSON 被 token 上限截断时，捞回已经写完整的测试点。"""
    pairs = re.findall(
        r'"input"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"output"\s*:\s*"((?:[^"\\]|\\.)*)"',
        str(text or ""), re.S)
    tests = []
    for raw_in, raw_out in pairs:
        try:
            stdin = json.loads('"' + raw_in + '"')
            stdout = json.loads('"' + raw_out + '"')
        except ValueError:
            continue
        if stdin.strip() or stdout.strip():
            tests.append({"input": stdin, "output": stdout})
    return tests


def _parse_json(text):
    """把模型返回的文本解析成 dict（容忍代码围栏、前后废话，以及被截断的 JSON）。"""
    cleaned = re.sub(r"^```(?:json)?|```$", "", str(text or "").strip(), flags=re.M).strip()
    candidates = [cleaned]
    match = re.search(r"\{.*\}", cleaned, re.S)
    if match:
        candidates.append(match.group(0))
    for candidate in candidates:
        if not candidate:
            continue
        try:
            parsed = json.loads(candidate)
        except ValueError:
            continue
        if isinstance(parsed, dict):
            return parsed
    rescued = _salvage_tests(cleaned)
    if rescued:
        return {"tests": rescued, "truncated": True}
    return {}


def _parse_grade(text):
    data = _parse_json(text)
    try:
        score = max(0, min(100, int(data.get("score", 0))))
    except (TypeError, ValueError):
        score = 0
    return {
        "score": score,
        "verdict": str(data.get("verdict") or "无法判断")[:120],
        "error_step": str(data.get("error_step") or "")[:120],
        "error_type": str(data.get("error_type") or "无错误")[:20],
        "detail": str(data.get("detail") or "")[:400],
        "correct_solution": str(data.get("correct_solution") or "")[:2000],
    }


@bp.get("/api/v3/grade/<entry_id>")
def api_grade_history(entry_id):
    rows = db().execute(
        "SELECT * FROM grade_runs WHERE entry_id=? AND user_id=? ORDER BY created_at DESC LIMIT 10",
        (entry_id, uid()),
    ).fetchall()
    return jsonify(runs=[{
        "id": row["id"], "score": row["score"], "verdict": row["verdict"],
        "error_type": row["error_type"], "detail": json.loads(row["detail"] or "{}"),
        "created_at": row["created_at"],
    } for row in rows])


# ---------------------------------------------------------------------------
# 代码题：在线编译运行 + AI 评分
# ---------------------------------------------------------------------------
_SAMPLE_IN = {"样例输入", "输入样例", "示例输入", "输入示例", "sampleinput"}
_SAMPLE_OUT = {"样例输出", "输出样例", "示例输出", "输出示例", "sampleoutput"}
_WEAK_IN = {"输入"}
_WEAK_OUT = {"输出"}


def _marker_kind(line):
    """判断一行是不是样例区的标题行，返回 (kind, weak)。"""
    text = str(line or "").strip()
    if not text:
        return None, False
    text = re.sub(r"^[#>*\-—\s]+", "", text).rstrip("：: 　")
    text = re.sub(r"\s*[#＃]?\s*\d+\s*$", "", text)        # 「样例输入 1」→「样例输入」
    text = re.sub(r"[（(][^）)]*[)）]", "", text).strip()   # 去掉括号备注
    key = text.replace(" ", "").replace("\u3000", "").lower()
    if key in _SAMPLE_IN:
        return "in", False
    if key in _SAMPLE_OUT:
        return "out", False
    if key in _WEAK_IN:
        return "in", True
    if key in _WEAK_OUT:
        return "out", True
    return None, False


def _sample_blocks(text, weak=False):
    """把题面切成 [(kind, [行...])]，遇到空行就结束当前样例。"""
    blocks = []
    kind = None
    lines = []
    for raw in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        found, is_weak = _marker_kind(raw)
        if found:
            if kind:
                blocks.append((kind, lines))
                kind, lines = None, []
            if not is_weak or weak:
                kind = found
            continue
        if kind is None:
            continue
        if raw.strip():
            lines.append(raw.rstrip())
        else:
            blocks.append((kind, lines))
            kind, lines = None, []
    if kind:
        blocks.append((kind, lines))
    return blocks


def _extract_sample_tests(text):
    """先用「样例输入/样例输出」配对，再退回「输入：/输出：」。"""
    for weak in (False, True):
        blocks = _sample_blocks(text, weak=weak)
        ins = [b[1] for b in blocks if b[0] == "in"]
        outs = [b[1] for b in blocks if b[0] == "out"]
        tests = []
        for i in range(min(len(ins), len(outs))):
            stdin = "\n".join(ins[i]).strip("\n")[:2000]
            stdout = "\n".join(outs[i]).strip("\n")[:2000]
            if stdin or stdout:
                tests.append({"input": stdin, "output": stdout})
        if tests:
            return tests
    return []


CODE_EXTRACT_SYSTEM = (
    "你负责从 C++ 题目文字里提取样例测试点。只返回 JSON："
    "{\"tests\": [{\"input\": \"标准输入原文\", \"output\": \"期望输出原文\"}], \"note\": \"一句话说明\"}\n"
    "规则：1) 只提取题面里真实给出的样例/示例/测试用例，没有就给空数组，绝不自己编测试数据。"
    "2) input 是程序要从键盘(stdin)读到的原文，output 是期望输出原文，保留换行与空格。"
    "3) 题目描述、解释、提示、数据范围都不是样例。4) 最多 8 组，不要代码围栏。"
)


@bp.post("/api/v3/code/extract")
def api_code_extract():
    """从题面里抽出「样例输入 / 样例输出」，没有样例时可选让 AI 再看一遍。"""
    data = body()
    text = str(data.get("requirement") or "")[:20000]
    entry_id = str(data.get("entry_id") or "")
    if not text.strip() and entry_id:
        row = db().execute("SELECT problem, ocr_text FROM entries WHERE id=? AND user_id=?",
                           (entry_id, uid())).fetchone()
        if row:
            text = (row["problem"] or row["ocr_text"] or "")[:20000]
    if not text.strip():
        fail("先把题目要求贴进来")
    tests = _extract_sample_tests(text)
    if tests:
        return jsonify(ok=True, tests=tests[:8], mode="pattern",
                       note="从题面识别到 %d 组样例" % len(tests))
    if not data.get("use_ai"):
        return jsonify(ok=True, tests=[], mode="pattern", note="题面里没找到「样例输入 / 样例输出」")

    db_ = db()
    config = core.get_ai_config(db_)
    core.check_ai_quota(db_, uid(), "solve")
    messages = [
        {"role": "system", "content": CODE_EXTRACT_SYSTEM},
        {"role": "user", "content": text[:16000]},
    ]
    try:
        reply, _model, _usage = core.call_ai({**config, "structured_output": True}, messages, config.get("model"))
    except core.AIError as exc:
        fail(str(exc), 502)
    parsed = _parse_json(reply)
    picked = []
    for item in parsed.get("tests") or []:
        if not isinstance(item, dict):
            continue
        stdin = str(item.get("input") or "").strip("\n")[:2000]
        stdout = str(item.get("output") or "").strip("\n")[:2000]
        if stdin or stdout:
            picked.append({"input": stdin, "output": stdout})
    note = str(parsed.get("note") or "") or ("AI 提取到 %d 组样例" % len(picked) if picked else "题面里没有可用的样例")
    return jsonify(ok=True, tests=picked[:8], mode="ai", note=note)


def _verdict(item):
    """单个测试点的判定：AC / WA / TLE / RE。"""
    if item.get("timeout"):
        return "TLE"
    if item.get("ok"):
        return "AC"
    exit_code = item.get("exit")
    if isinstance(exit_code, int) and exit_code != 0:
        return "RE"
    return "WA"


@bp.post("/api/v3/code/run")
def api_code_run():
    data = body()
    source = str(data.get("source") or "")
    console = data.get("stdin") is not None
    if console:
        tests = [{"input": str(data.get("stdin") or "")[:4000], "output": ""}]
        preview = False
    else:
        tests = data.get("tests") or []
        if not isinstance(tests, list):
            fail("测试数据格式不正确")
        tests = [t for t in tests if str((t or {}).get("input") or "").strip()
                 or str((t or {}).get("output") or "").strip()]
        preview = not tests
        if preview:
            tests = [{"input": "", "output": ""}]
    try:
        result = judge.judge_cpp(source, tests)
    except judge.JudgeUnavailable as exc:
        fail(str(exc), 503)
    except ValueError as exc:
        fail(str(exc))
    if result.get("compiled"):
        for item in result.get("results") or []:
            item["verdict"] = _verdict(item)
        verdicts = [item.get("verdict") for item in result.get("results") or []]
        result["verdict"] = "AC" if verdicts and all(v == "AC" for v in verdicts) else (
            next((v for v in verdicts if v != "AC"), "WA"))
        result["passed"] = sum(1 for v in verdicts if v == "AC")
        result["total"] = len(verdicts)
    else:
        result["verdict"] = "CE"
        result["passed"] = 0
        result["total"] = 0
    return jsonify(ok=True, preview=preview, console=console, **result)


@bp.post("/api/v3/code/save")
def api_code_save():
    data = body()
    entry_id = str(data.get("entry_id") or "")
    entry = db().execute("SELECT id FROM entries WHERE id=? AND user_id=?", (entry_id, uid())).fetchone()
    if not entry:
        fail("题目不存在", 404)
    tests = data.get("tests") or []
    if not isinstance(tests, list):
        fail("测试数据格式不正确")
    db().execute(
        "UPDATE entries SET code=?, code_tests=?, code_notes=? WHERE id=?",
        (str(data.get("source") or "")[:60000], json.dumps(tests[:8], ensure_ascii=False),
         str(data.get("notes") or "")[:2000], entry_id),
    )
    db().commit()
    return jsonify(ok=True)


CODE_REVIEW_SYSTEM = (
    "你是 C++ 程序设计课的助教。用户提交了题目要求和代码，请点评并打分。\n"
    "只返回 JSON：{\"score\": 0-100, \"verdict\": \"一句话结论\", \"bugs\": [\"问题1\", \"问题2\"], "
    "\"style\": \"代码风格建议\", \"hint\": \"下一步最该练的点\"}\n"
    "重点看：逻辑是否正确、边界条件、复杂度、是否用了课程要求的知识点。不要代码围栏。"
)


@bp.post("/api/v3/code/review")
def api_code_review():
    db_ = db()
    data = body()
    source = str(data.get("source") or "")
    entry_id = str(data.get("entry_id") or "")
    if not source.strip():
        fail("先写点代码再让 AI 看")
    requirement = str(data.get("requirement") or "")[:4000]
    if entry_id:
        entry = db_.execute("SELECT * FROM entries WHERE id=? AND user_id=?", (entry_id, uid())).fetchone()
        if entry:
            requirement = (entry["problem"] or entry["ocr_text"] or requirement)[:4000]
    config = core.get_ai_config(db_)
    core.check_ai_quota(db_, uid(), "solve")
    messages = [
        {"role": "system", "content": CODE_REVIEW_SYSTEM},
        {"role": "user", "content": f"题目要求：\n{requirement or '（未提供）'}\n\n学生代码：\n```cpp\n{source[:20000]}\n```"},
    ]
    try:
        text, model, _usage = core.call_ai({**config, "structured_output": True}, messages, config.get("model"))
    except core.AIError as exc:
        fail(str(exc), 502)
    return jsonify(ok=True, review=_parse_grade(text))


@bp.get("/api/v3/code/entry/<entry_id>")
def api_code_entry(entry_id):
    row = db().execute("SELECT * FROM entries WHERE id=? AND user_id=?", (entry_id, uid())).fetchone()
    if not row:
        fail("题目不存在", 404)
    return jsonify(
        ok=True,
        id=row["id"],
        title=entry_label(row),
        problem=(row["problem"] or row["ocr_text"] or ""),
        code=row["code"] or "",
        tests=json_list(row["code_tests"]),
        notes=row["code_notes"] or "",
    )


@bp.get("/api/v3/code/bank")
def api_code_bank():
    """用户题库里程序设计类的题目，供 IDE 直接选用。"""
    db_ = db()
    rows = db_.execute(
        "SELECT e.id, e.title, e.chapter, e.status, e.code, e.code_tests, e.problem, e.ocr_text "
        "FROM entries e JOIN subjects s ON s.id = e.subject AND s.user_id = e.user_id "
        "WHERE e.user_id = ? AND s.kind = 'cpp' "
        "ORDER BY e.created_at DESC LIMIT 100",
        (uid(),),
    ).fetchall()
    items = []
    for row in rows:
        problem = (row["problem"] or row["ocr_text"] or "").strip()
        tests = json_list(row["code_tests"])
        items.append({
            "id": row["id"],
            "title": entry_label(row),
            "chapter": row["chapter"] or "",
            "status": row["status"],
            "has_code": bool((row["code"] or "").strip()),
            "test_count": len(tests),
            "preview": " ".join(problem.split())[:110],
        })
    return jsonify(ok=True, items=items)


CODE_GENERATE_SYSTEM = (
    "你是程序设计课的命题助教。请根据题面生成一套能真正判出对错的测试数据。\n"
    "目标：让「样例对了但逻辑错了」的程序也过不了，别只抄题面样例。\n"
    "每组必须给出：程序读入的完整标准输入 input，以及标准解法应输出的 output。\n"
    "格式铁律（最容易错的地方，务必按题面逐字满足）：\n"
    "- 题面说「第二行 n 个整数」，那这一行就必须真的有 n 个整数，一个不能少；\n"
    "- 题面说「接下来 m 行」，就必须真的有 m 行，每行字段数与题面一致；\n"
    "- 输出行数/个数要与题面要求一致（例如要求输出 n 个数，output 里就必须是 n 个数）；\n"
    "- 每个数字都要在题面给的数据范围内。\n"
    "覆盖建议（按题目实际调整）：样例 1~2 组；边界（最小/最大规模、0、负数、单个元素）；"
    "特殊情况（全相同、已有序、逆序、重复、无解）；易错点（溢出、多组数据、多余空格换行）。\n"
    "输入输出都必须是确定性纯文本，行尾不要多余空格，不要写解释。\n"
    "why 用 6 个字说明这组在考什么（如「最大规模」「负数边界」）。\n"
    "只返回 JSON：{\"tests\":[{\"input\":\"1 2\",\"output\":\"3\",\"why\":\"样例\"}]}，"
    "给 {count} 组。不要代码围栏。"
)


CODE_VERIFY_SYSTEM = (
    "你是判题数据审核员。下面是题面和一批测试数据，请逐组核对两件事：\n"
    "A. 输入是否符合题面格式与数据范围——按题面把每个数字数一遍："
    "该有 n 个数的那一行是不是真有 n 个？该有 m 行的是不是真有 m 行？数值是否越界？\n"
    "B. 用标准程序跑这组输入，输出是否真的等于期望输出（条数也要一致）。\n"
    "处理规则：\n"
    "1) 输入格式不对（数少了/多了、行数不对）→ 补齐或改正成合法输入，再重算期望输出；\n"
    "2) 期望输出算错 → 改正；\n"
    "3) 题意不清、答案不唯一、无法判定 → 直接删掉这一组；\n"
    "4) 保持原有顺序和 why 字段，可以补充遗漏的边界组，总数不超过 {count} 组。\n"
    "只返回 JSON：{\"tests\":[{\"input\":\"...\",\"output\":\"...\",\"why\":\"...\"}]}，不要代码围栏。"
)


CODE_PRACTICE_SYSTEM = (
    "你是 C++ 程序设计课的出题老师。按学生给的知识点和难度，出一道能在线判题里"
    "直接测试的题目（标准输入 / 标准输出）。\n"
    "硬性要求：\n"
    "1) 只能是一次读入若干数据、写出结果的题，不要出交互题，不要要求图形库或多文件；\n"
    "2) 题面必须写清楚：题目描述、输入格式、输出格式、数据范围；\n"
    "3) 必须给 1 组样例，样例输出必须真的等于正确程序的输出（你自己先算一遍）；\n"
    "4) 难度与知识点匹配，不要出超大规模数据；题面用中文，描述不超过 320 字。\n"
    "只返回 JSON：{\"title\":\"题名（≤ 16 字）\",\"description\":\"题目描述 + 输入格式 + "
    "输出格式 + 数据范围\",\"input_sample\":\"\",\"output_sample\":\"\",\"hint\":\""
    "一句提示（可选）\"}，不要代码围栏。"
)

def _ai_json(config, system, payload, limit=16000):
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": payload[:limit]},
    ]
    try:
        reply, _model, _usage = core.call_ai(
            {**config, "structured_output": True}, messages, config.get("model"))
    except core.AIError as exc:
        fail(str(exc), 502)
    return _parse_json(reply)


def _clean_tests(parsed, limit):
    picked = []
    for item in parsed.get("tests") or []:
        if not isinstance(item, dict):
            continue
        stdin = str(item.get("input") or "").strip("\n")[:2000]
        stdout = str(item.get("output") or "").strip("\n")[:2000]
        if stdin.strip() or stdout.strip():
            picked.append({"input": stdin, "output": stdout, "ai": True,
                           "why": str(item.get("why") or "")[:60]})
    return picked[:limit]


@bp.post("/api/v3/code/generate")
def api_code_generate():
    """让 AI 读题后自己出测试数据（不只是抄题面里的样例），并复核期望输出。"""
    data = body()
    text = str(data.get("requirement") or "")[:20000]
    entry_id = str(data.get("entry_id") or "")
    if not text.strip() and entry_id:
        row = db().execute("SELECT problem, ocr_text FROM entries WHERE id=? AND user_id=?",
                           (entry_id, uid())).fetchone()
        if row:
            text = (row["problem"] or row["ocr_text"] or "")[:20000]
    if not text.strip():
        fail("先把题目要求贴进来，AI 才有得分析")
    try:
        count = max(1, min(12, int(data.get("count") or 10)))
    except (TypeError, ValueError):
        count = 10
    db_ = db()
    config = core.get_ai_config(db_)
    core.check_ai_quota(db_, uid(), "solve")
    try:
        parsed = _ai_json(config, CODE_GENERATE_SYSTEM.replace("{count}", str(count)), text)
    except Exception:
        # 输出太长被截断或解析失败时，退一步只要少量测试点再试一次
        count = max(4, min(6, count))
        parsed = _ai_json(config, CODE_GENERATE_SYSTEM.replace("{count}", str(count)), text)
    picked = _clean_tests(parsed, count)
    if not picked:
        fail("AI 没给出可用的测试数据，换个说法再试一次")
    checked = picked
    if data.get("verify", True) and picked:
        try:
            # 复核属于同一次出题动作，不受 3 秒最小间隔限制
            core.check_ai_quota(db_, uid(), "solve", enforce_interval=False)
        except Exception:
            checked = picked
        else:
            payload = "题面：\n" + text[:9000] + "\n\n现有测试数据：\n" + json.dumps(
                [{"input": t["input"], "output": t["output"], "why": t.get("why", "")} for t in picked],
                ensure_ascii=False)
            try:
                fixed = _clean_tests(
                    _ai_json(config, CODE_VERIFY_SYSTEM.replace("{count}", str(count)), payload), count)
            except Exception:
                fixed = []
            if fixed:
                checked = fixed
    return jsonify(ok=True, tests=checked, mode="ai", verified=bool(checked is not picked),
                   note="AI 出了 %d 组测试点并复核了期望输出" % len(checked))


@bp.post("/api/v3/code/practice")
def api_code_practice():
    """按知识点现场出一道题，交给同一个 IDE 判分。"""
    data = body()
    topic = str(data.get("topic") or "").strip()[:120]
    level = str(data.get("level") or "基础").strip()[:20]
    if len(topic) < 2:
        fail("先写一个想练的知识点，比如「二分查找」「前缀和」")
    db_ = db()
    config = core.get_ai_config(db_)
    core.check_ai_quota(db_, uid(), "solve")
    parsed = _ai_json(config, CODE_PRACTICE_SYSTEM.replace("{level}", level),
                      "知识点：" + topic + "\n难度：" + level)
    desc = str(parsed.get("description") or "").strip()[:4000]
    if not desc:
        fail("AI 没给出题目，换个知识点再试一次")
    title = str(parsed.get("title") or topic).strip()[:40]
    s_in = str(parsed.get("input_sample") or "").strip("\n")[:600]
    s_out = str(parsed.get("output_sample") or "").strip("\n")[:600]
    hint = str(parsed.get("hint") or "").strip()[:200]
    text = desc
    if s_in or s_out:
        if s_in:
            text += "\n\n样例输入\n" + s_in
        if s_out:
            text += "\n\n样例输出\n" + s_out
    if hint:
        text += "\n\n提示：" + hint
    return jsonify(ok=True, title=title, requirement=text, topic=topic, level=level,
                   samples=[{"input": s_in, "output": s_out}] if (s_in or s_out) else [])


@bp.get("/api/v3/code/health")
def api_code_health():
    return jsonify(ok=True, judge=judge.image_ready(), image=judge.JUDGE_IMAGE)


# ---------------------------------------------------------------------------
# 页面
# ---------------------------------------------------------------------------
def _page(template, **extra):
    user = core.current_user()
    if not user:
        return redirect("/login")
    return render_template(template, version=core.APP_VERSION, asset_version=core.APP_VERSION,
                           username=user["username"], is_admin=(user["role"] == "admin"), **extra)


@bp.get("/exam")
def page_exam():
    return _page("exam.html")


@bp.get("/duel")
def page_duel():
    return _page("duel.html")


@bp.get("/code")
def page_code():
    return _page("code.html", entry_id=request.args.get("entry", ""))


@bp.get("/explain/<entry_id>")
def page_explain(entry_id):
    return _page("explain.html", entry_id=entry_id)
