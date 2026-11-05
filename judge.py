"""Isolated C++ judge: every compile and run happens inside a throwaway container.

The Flask process never executes user code itself, so a bad submission cannot
touch the host, the SQLite database or any of the neighbouring Docker services.
"""
import json
import os
import shutil
import subprocess
import tempfile

JUDGE_IMAGE = os.environ.get("MATH_JUDGE_IMAGE", "secondpass-judge:latest")
COMPILE_TIMEOUT = 20
RUN_TIMEOUT = 3
MAX_SOURCE = 60000
MAX_TESTS = 8


class JudgeUnavailable(RuntimeError):
    """Raised when the judge image or the Docker daemon is missing."""


def _docker(args, **kwargs):
    cmd = ["docker"] + args
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)


def image_ready():
    try:
        probe = _docker(["image", "inspect", JUDGE_IMAGE, "--format", "{{.Id}}"], timeout=10)
    except (OSError, subprocess.SubprocessError):
        return False
    return probe.returncode == 0


def _limits(extra=()):
    return [
        "run",
        "--rm",
        "--network", "none",
        "--memory", "256m",
        "--memory-swap", "256m",
        "--cpus", "1",
        "--pids-limit", "64",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        *extra,
    ]


def _normalize(text):
    if not isinstance(text, str):
        return ""
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def judge_cpp(source, tests):
    """Compile and run one submission.

    Returns ``{"compiled": bool, "compile_error": str, "results": [...]}`` where
    each result is ``{"ok": bool, "output": str, "stderr": str, "timeout": bool}``.
    """
    source = (source or "").strip()
    if not source:
        return {"compiled": False, "compile_error": "代码为空", "results": []}
    if len(source) > MAX_SOURCE:
        raise ValueError("代码过长，请精简到 60000 字符以内")
    tests = [t for t in (tests or []) if isinstance(t, dict)][:MAX_TESTS]
    if not image_ready():
        raise JudgeUnavailable("判题镜像尚未安装，请联系管理员")

    workdir = tempfile.mkdtemp(prefix="sp-judge-")
    try:
        with open(os.path.join(workdir, "main.cpp"), "w", encoding="utf-8") as fh:
            fh.write(source)
        os.chmod(workdir, 0o777)
        compile_cmd = _limits(["-v", f"{workdir}:/box", "-w", "/box", JUDGE_IMAGE,
                               "g++", "-O2", "-std=c++17", "-pipe", "-o", "prog", "main.cpp"])
        try:
            built = _docker(compile_cmd, timeout=COMPILE_TIMEOUT)
        except subprocess.TimeoutExpired:
            return {"compiled": False, "compile_error": "编译超时", "results": []}
        if built.returncode != 0:
            return {"compiled": False, "compile_error": (built.stderr or built.stdout)[-2000:], "results": []}

        results = []
        for test in tests:
            stdin_text = test.get("input") or ""
            expected = _normalize(test.get("expected") or test.get("output") or "")
            cmd = _limits(["-i", "-v", f"{workdir}:/box:ro", "-w", "/box", JUDGE_IMAGE, "./prog"])
            timeout = False
            try:
                run = _docker(cmd, input=stdin_text, timeout=RUN_TIMEOUT)
                output, stderr, code = run.stdout, run.stderr, run.returncode
            except subprocess.TimeoutExpired as exc:
                timeout = True
                output = (exc.stdout or "") if isinstance(exc.stdout, str) else ""
                stderr = "运行超时（超过 %d 秒）" % RUN_TIMEOUT
                code = -1
            actual = _normalize(output)
            results.append({
                "ok": (not timeout) and code == 0 and actual == expected,
                "output": output[-4000:],
                "stderr": (stderr or "")[-2000:],
                "timeout": timeout,
                "exit": code,
                "expected": expected[-2000:],
                "input": stdin_text[-2000:],
            })
        return {"compiled": True, "compile_error": "", "results": results}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def judge_self_test():
    """Tiny smoke test used by the health probe."""
    try:
        out = judge_cpp("#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}", [{"input": "1 2", "output": "3"}])
    except JudgeUnavailable as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": bool(out.get("compiled") and out["results"] and out["results"][0]["ok"]),
            "detail": json.dumps(out, ensure_ascii=False)[:400]}
