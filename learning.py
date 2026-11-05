"""Learning summaries derived from the current user's records, not AI guesses."""
import json
from collections import Counter, defaultdict
from datetime import timedelta

CATALOG = {
    "analysis": {
        "函数与极限": ["数列极限", "函数极限", "等价无穷小", "无穷小比较", "连续性", "极限存在准则"],
        "一元函数微分学": ["导数与微分", "中值定理", "洛必达法则", "泰勒公式", "单调性与极值", "凸性与拐点"],
        "一元函数积分学": ["不定积分", "换元积分法", "分部积分法", "定积分", "反常积分", "积分应用"],
        "多元函数微分学": ["偏导数", "全微分", "多元复合函数求导", "隐函数求导", "多元极值", "条件极值"],
        "多元函数积分学": ["二重积分", "三重积分", "曲线积分", "曲面积分", "格林公式", "高斯公式", "斯托克斯公式"],
        "无穷级数": ["数项级数", "幂级数", "泰勒级数", "傅里叶级数"],
        "常微分方程": ["一阶微分方程", "高阶线性微分方程", "微分方程应用"],
    },
    "linear": {
        "行列式": ["行列式计算", "行列式性质", "克拉默法则"],
        "矩阵": ["矩阵运算", "逆矩阵", "矩阵的秩", "初等变换", "分块矩阵"],
        "线性方程组": ["高斯消元法", "齐次线性方程组", "非齐次线性方程组", "解的结构"],
        "向量空间": ["线性相关性", "向量组的秩", "基与维数", "坐标变换", "线性映射"],
        "特征值与特征向量": ["特征值与特征向量", "相似矩阵", "矩阵对角化", "实对称矩阵"],
        "二次型": ["二次型标准形", "合同变换", "正定二次型", "正交变换"],
    },
}
CATALOG_CPP = {
    "程序设计基础": ["变量与类型", "运算符与表达式", "输入输出", "顺序结构", "常见编译错误"],
    "分支与循环": ["if 语句", "switch 语句", "for 循环", "while 循环", "循环嵌套", "break 与 continue"],
    "函数": ["函数定义与调用", "参数传递", "递归", "函数重载", "作用域与生命周期"],
    "数组与字符串": ["一维数组", "二维数组", "字符数组", "string", "排序与查找"],
    "指针与引用": ["指针基础", "指针与数组", "指针与函数", "引用", "动态内存"],
    "结构体与类": ["结构体", "类与对象", "构造与析构", "封装", "运算符重载", "继承与多态"],
    "STL 与容器": ["vector", "string", "map", "set", "迭代器", "algorithm"],
    "算法与复杂度": ["枚举", "模拟", "贪心", "二分", "递归与分治", "动态规划入门", "复杂度分析"],
    "文件与异常": ["文件读写", "异常处理"],
}

CATALOG_ENGLISH = {
    "词汇与搭配": ["核心词汇", "固定搭配", "词根词缀", "近义辨析"],
    "语法": ["时态", "从句", "非谓语动词", "虚拟语气", "倒装与强调"],
    "阅读理解": ["主旨题", "细节题", "推断题", "词义猜测", "长难句分析"],
    "完形填空": ["语境衔接", "逻辑关系", "词义辨析"],
    "写作": ["应用文", "议论文", "图表作文", "句式升级", "衔接与连贯"],
    "翻译": ["长句翻译", "文化表达", "意译与直译"],
    "听力": ["短对话", "长对话", "篇章听力", "听写"],
}


def catalog_for(kind, subject):
    """Chapter catalog used to canonicalize AI tags for one subject."""
    if kind == "cpp":
        return CATALOG_CPP
    if kind == "english":
        return CATALOG_ENGLISH
    return CATALOG.get(subject, {})


REVIEW_SCORES = {"again": 0, "hard": 40, "good": 80, "easy": 100}

def learning_summary(db, uid, today):
    rows = db.execute(
        "SELECT e.*, (SELECT r.result FROM reviews r WHERE r.entry_id=e.id "
        "ORDER BY r.reviewed_at DESC, r.rowid DESC LIMIT 1) latest_result "
        "FROM entries e WHERE e.user_id=?", (uid,)
    ).fetchall()
    topics = {}
    unclassified = 0
    subject = Counter()
    status = Counter()
    chapters = Counter()
    for row in rows:
        subject[row["subject"]] += 1
        status[row["status"]] += 1
        if row["chapter"]: chapters[(row["subject"], row["chapter"])] += 1
        try: tags = json.loads(row["tags"] or "[]")
        except (TypeError, ValueError): tags = []
        tags = list(dict.fromkeys(t.strip() for t in tags if isinstance(t, str) and t.strip())) if isinstance(tags, list) else []
        if not tags: unclassified += 1
        score = 100 if row["status"] == "mastered" else REVIEW_SCORES.get(row["latest_result"])
        if score is None and row["status"] in ("wrong", "unsolved"): score = 0
        for tag in tags:
            key = (row["subject"], tag)
            item = topics.setdefault(key, {"name": tag, "subject": row["subject"], "chapters": set(), "count": 0, "assessed": 0, "scores": [], "due": 0})
            item["count"] += 1
            if row["chapter"]: item["chapters"].add(row["chapter"])
            if row["next_review_at"] and row["next_review_at"] <= today.isoformat(): item["due"] += 1
            if score is not None:
                item["assessed"] += 1
                item["scores"].append(score)
    knowledge = []
    for item in topics.values():
        scores = item.pop("scores")
        item["mastery"] = round(sum(scores) / len(scores)) if scores else None
        item["chapters"] = sorted(item["chapters"])
        knowledge.append(item)
    knowledge.sort(key=lambda t: (t["mastery"] is None, t["mastery"] or 0, -t["count"], t["name"]))
    first = today - timedelta(days=118)
    added = dict(db.execute("SELECT occurred_at, count(*) FROM entries WHERE user_id=? AND occurred_at BETWEEN ? AND ? GROUP BY occurred_at", (uid,first.isoformat(),today.isoformat())).fetchall())
    reviewed = dict(db.execute("SELECT date(r.reviewed_at, '+8 hours') d,count(*) FROM reviews r JOIN entries e ON e.id=r.entry_id WHERE e.user_id=? AND date(r.reviewed_at, '+8 hours') BETWEEN ? AND ? GROUP BY d",(uid,first.isoformat(),today.isoformat())).fetchall())
    activity = []
    for i in range(119):
        day = (first + timedelta(days=i)).isoformat()
        activity.append({"date":day,"added":added.get(day,0),"reviewed":reviewed.get(day,0)})
    return {
        "total": len(rows), "by_subject": dict(subject), "by_status": dict(status),
        "knowledge": knowledge, "unclassified": unclassified,
        "chapters": [{"subject":s,"name":n,"count":c} for (s,n),c in sorted(chapters.items())],
        "activity": activity, "today": today.isoformat(),
        "mastered": status.get("mastered",0),
        "due": sum(1 for r in rows if r["next_review_at"] and r["next_review_at"] <= today.isoformat()),
        "ai_pending": sum(r["ai_status"] in ("pending","generating") for r in rows),
        "ai_errors": sum(r["ai_status"] in ("error","unconfigured") for r in rows),
        "mastery_note": "按最近复习评分统计：忘记 0、模糊 40、基本掌握 80、熟练 100；手动标记已掌握计 100，不会/错题且未复习计 0，其余待评估。知识点取相关题目评分的平均值。",
    }
