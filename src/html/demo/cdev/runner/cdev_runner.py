#!/usr/bin/env python3
"""
CDev local runner
=================

A tiny, dependency-free (Python standard library only) local server that lets the
static CDev web editor (e.g. hosted on GitHub Pages) read/write files in a local
workspace and run compilers / interpreters defined in each project's
``exec_settings.json``.

Usage:
    python cdev_runner.py --root "D:/Projects" [--port 8787] [--open]

Security:
  * Binds to 127.0.0.1 only (by default).
  * Every /api call (except /api/ping) needs the session token printed at start.
  * Only whitelisted browser origins may call it (see --allow-origin).
  * File access is confined to the workspace root.
"""

import argparse
import codecs
import fnmatch
import glob
import json
import mimetypes
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlparse

VERSION = "1.0.0"
RUNNER_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(RUNNER_DIR)
SETTINGS_NAME = "exec_settings.json"
DEFAULTS_FILE = os.path.join(APP_DIR, "defaults", "exec_settings.default.json")
CONFIG_FILE = os.path.join(RUNNER_DIR, "runner_config.json")
PLATFORM = "windows" if os.name == "nt" else ("darwin" if sys.platform == "darwin" else "linux")
PLATFORM_KEYS = {"windows", "linux", "darwin", "default"}
HIDDEN_NAMES = {".git", "__pycache__", ".DS_Store", "Thumbs.db"}
MAX_BODY = 64 * 1024 * 1024
MAX_READ = 8 * 1024 * 1024

DEFAULT_ORIGINS = [
    "http://localhost:*",
    "http://127.0.0.1:*",
    "http://[::1]:*",
    "https://*.github.io",
]

CFG = {
    "root": os.getcwd(),
    "host": "127.0.0.1",
    "port": 8787,
    "token": None,
    "allowOrigins": [],
    "uiUrl": "",
    "serveUi": True,
}
PROCS = {}
PROCS_LOCK = threading.Lock()


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# --------------------------------------------------------------------------- paths

def norm(p):
    return os.path.normcase(os.path.normpath(os.path.abspath(p)))


def is_inside(child, parent):
    try:
        return os.path.commonpath([norm(child), norm(parent)]) == norm(parent)
    except ValueError:  # different drives
        return False


def safe_path(rel):
    rel = (rel or "").replace("\\", "/").strip()
    if rel.startswith("/"):
        rel = rel.lstrip("/")
    if re.match(r"^[A-Za-z]:", rel):
        raise ApiError(400, "Absolute paths are not allowed")
    p = os.path.normpath(os.path.join(CFG["root"], rel))
    if not is_inside(p, CFG["root"]):
        raise ApiError(403, "Path is outside the workspace root")
    return p


def to_rel(p):
    r = os.path.relpath(p, CFG["root"]).replace("\\", "/")
    return "" if r == "." else r


# --------------------------------------------------------------------------- settings

def read_json(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        text = f.read()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ApiError(400, f"{os.path.basename(path)}: invalid JSON at line {e.lineno}, col {e.colno}: {e.msg}")


def load_defaults():
    if os.path.isfile(DEFAULTS_FILE):
        return read_json(DEFAULTS_FILE)
    return {"languages": {}, "tools": {}}


def deep_merge(base, over):
    if not isinstance(base, dict) or not isinstance(over, dict):
        return over
    out = dict(base)
    for k, v in over.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict) and not (set(v) & PLATFORM_KEYS):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def pick(value):
    """Resolve platform specific values: {"windows": ..., "linux": ..., "default": ...}."""
    if isinstance(value, dict) and value and set(value) <= PLATFORM_KEYS:
        return value.get(PLATFORM, value.get("default"))
    return value


def find_settings_file(start_abs):
    d = start_abs if os.path.isdir(start_abs) else os.path.dirname(start_abs)
    while True:
        cand = os.path.join(d, SETTINGS_NAME)
        if os.path.isfile(cand):
            return cand
        parent = os.path.dirname(d)
        if norm(d) == norm(CFG["root"]) or parent == d or not is_inside(parent, CFG["root"]):
            return None
        d = parent


def effective_settings(path_abs):
    sfile = find_settings_file(path_abs)
    defaults = load_defaults()
    if sfile:
        user = read_json(sfile)
        settings = user if user.get("inheritDefaults") is False else deep_merge(defaults, user)
        project_dir = os.path.dirname(sfile)
    else:
        settings = defaults
        project_dir = path_abs if os.path.isdir(path_abs) else os.path.dirname(path_abs)
    return settings, project_dir, sfile


def requires_ok(req, project_dir):
    if not req:
        return True
    pats = req if isinstance(req, list) else [req]
    for pat in pats:
        if glob.glob(os.path.join(project_dir, pat)):
            return True
    return False


def pick_language(settings, file_abs, project_dir, hint=None):
    langs = settings.get("languages", {}) or {}
    if hint and hint in langs:
        return hint, langs[hint]
    ext = os.path.splitext(file_abs)[1].lower()
    name = os.path.basename(file_abs).lower()
    with_req, without_req = [], []
    for key, lang in langs.items():
        exts = [e.lower() for e in lang.get("extensions", [])]
        names = [n.lower() for n in lang.get("filenames", [])]
        if ext in exts or name in names:
            if lang.get("requires"):
                if requires_ok(lang["requires"], project_dir):
                    with_req.append((key, lang))
            else:
                without_req.append((key, lang))
    found = with_req or without_req
    return found[0] if found else (None, None)


# --------------------------------------------------------------------------- variables

VAR_RE = re.compile(r"\$\{(raw:)?([A-Za-z0-9_.+:\-]+)\}")


def quote_arg(s):
    s = str(s)
    if s == "":
        return '""'
    if PLATFORM == "windows":
        if re.search(r'[\s&()\[\]{}^=;!\'+,`~|<>]', s) and not (s.startswith('"') and s.endswith('"')):
            return '"' + s + '"'
        return s
    import shlex
    return shlex.quote(s)


def expand(template, variables, quote=True):
    def rep(m):
        raw, name = m.group(1), m.group(2)
        if name.startswith("env:"):
            val = os.environ.get(name[4:], "")
        elif name in variables:
            val = variables[name]
        else:
            raise ApiError(400, f"Unknown variable ${{{name}}} in: {template}")
        if val is None:
            val = ""
        return quote_arg(val) if (quote and not raw) else str(val)
    return VAR_RE.sub(rep, template)


def resolve_tool(value, base_vars, project_dir):
    v = pick(value)
    if not v:
        return v
    v = expand(str(v), base_vars, quote=False)
    if os.path.isabs(v):
        return os.path.normpath(v)
    if "/" in v or "\\" in v or v.startswith("."):
        return os.path.normpath(os.path.join(project_dir, v))
    return v  # bare command, looked up in PATH


def build_context(settings, project_dir, file_abs=None, check_file=None, tmp_dir=None):
    exe = ".exe" if PLATFORM == "windows" else ""
    tools_dir = pick(settings.get("toolsDir")) or "tools"
    tools_dir = tools_dir if os.path.isabs(tools_dir) else os.path.normpath(os.path.join(project_dir, tools_dir))
    out_dir = pick(settings.get("outDir")) or "build"
    out_dir = out_dir if os.path.isabs(out_dir) else os.path.normpath(os.path.join(project_dir, out_dir))
    v = {
        "root": CFG["root"],
        "projectDir": project_dir,
        "runnerDir": RUNNER_DIR,
        "toolsDir": tools_dir,
        "outDir": out_dir,
        "tmpDir": tmp_dir or tempfile.gettempdir(),
        "exe": exe,
        "sep": os.sep,
        "platform": PLATFORM,
    }
    for k, val in (settings.get("vars") or {}).items():
        v[k] = expand(str(pick(val)), v, quote=False)
    tools = {}
    for name, val in (settings.get("tools") or {}).items():
        tools[name] = resolve_tool(val, v, project_dir)
    for name, val in tools.items():
        if val is not None:
            v[name] = val
    if file_abs:
        real = check_file or file_abs
        base, ext = os.path.splitext(os.path.basename(file_abs))
        v.update({
            "file": real,
            "fileRel": os.path.relpath(file_abs, project_dir).replace("\\", "/"),
            "fileDir": os.path.dirname(real),
            "fileName": os.path.basename(file_abs),
            "fileBase": base,
            "fileExt": ext,
            "srcFile": file_abs,
            "srcDir": os.path.dirname(file_abs),
            "outFile": os.path.join(out_dir, base + exe),
        })
    return v, tools


def build_env(settings, variables, tools, project_dir):
    env = dict(os.environ)
    for k, val in (settings.get("env") or {}).items():
        val = pick(val)
        if val is None:
            env.pop(k, None)
        else:
            env[k] = expand(str(val), variables, quote=False)
    extra = []
    for p in pick(settings.get("path")) or []:
        p = expand(str(pick(p)), variables, quote=False)
        if not os.path.isabs(p):
            p = os.path.normpath(os.path.join(project_dir, p))
        extra.append(p)
    for val in tools.values():
        if val and os.path.isabs(val):
            d = os.path.dirname(val)
            if d not in extra:
                extra.append(d)
    if extra:
        key = next((k for k in env if k.upper() == "PATH"), "PATH")
        env[key] = os.pathsep.join(extra + [env.get(key, "")])
    return env


def command_for(lang, action, variables):
    def one(val):
        val = pick(val)
        if val is None:
            return None
        if isinstance(val, list):
            parts = [expand(str(pick(x)), variables) for x in val if pick(x)]
            return " && ".join(parts) if parts else None
        return expand(str(val), variables)

    if action == "run":
        steps = []
        if lang.get("build") and lang.get("buildBeforeRun", True):
            b = one(lang.get("build"))
            if b:
                steps.append(b)
        r = one(lang.get("run"))
        if r is None:
            return None
        steps.append(r)
        return " && ".join(steps)
    return one(lang.get(action))


def uses_outdir(lang):
    s = json.dumps([lang.get("build"), lang.get("run")])
    return "outDir" in s or "outFile" in s


def shell_prefix():
    return "chcp 65001>nul & " if PLATFORM == "windows" else ""


# --------------------------------------------------------------------------- processes

class Proc:
    def __init__(self, cmd, cwd, env, encoding="utf-8", label=""):
        self.id = uuid.uuid4().hex[:12]
        self.cmd = cmd
        self.label = label
        self.events = []
        self.cond = threading.Condition()
        self.finished = False
        self.code = None
        self.started = time.time()
        self.encoding = encoding
        kwargs = dict(cwd=cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                      stderr=subprocess.PIPE, shell=True, bufsize=0)
        if PLATFORM == "windows":
            kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        else:
            kwargs["start_new_session"] = True
        self.p = subprocess.Popen(shell_prefix() + cmd, **kwargs)
        self.readers = [
            threading.Thread(target=self._read, args=(self.p.stdout, "out"), daemon=True),
            threading.Thread(target=self._read, args=(self.p.stderr, "err"), daemon=True),
        ]
        for t in self.readers:
            t.start()
        threading.Thread(target=self._wait, daemon=True).start()

    def push(self, typ, data=None, **extra):
        with self.cond:
            ev = {"type": typ, "data": data, "t": round(time.time() - self.started, 3)}
            ev.update(extra)
            self.events.append(ev)
            self.cond.notify_all()

    def _read(self, stream, typ):
        dec = codecs.getincrementaldecoder(self.encoding)(errors="replace")
        try:
            while True:
                chunk = stream.read1(8192) if hasattr(stream, "read1") else stream.read(8192)
                if not chunk:
                    break
                text = dec.decode(chunk)
                if text:
                    self.push(typ, text)
            tail = dec.decode(b"", final=True)
            if tail:
                self.push(typ, tail)
        except Exception as e:  # pragma: no cover
            self.push("err", f"\n[runner read error: {e}]\n")

    def _wait(self):
        code = self.p.wait()
        for t in self.readers:
            t.join(timeout=5)
        self.code = code
        with self.cond:
            self.finished = True
        self.push("exit", code, elapsed=round(time.time() - self.started, 3))

    def write(self, data, eof=False):
        if self.finished:
            return
        try:
            if data:
                self.p.stdin.write(data.encode(self.encoding, errors="replace"))
                self.p.stdin.flush()
            if eof:
                self.p.stdin.close()
        except (BrokenPipeError, OSError, ValueError):
            pass

    def kill(self):
        if self.finished:
            return
        try:
            if PLATFORM == "windows":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.p.pid)],
                               capture_output=True, creationflags=0x08000000)
            else:
                os.killpg(os.getpgid(self.p.pid), signal.SIGKILL)
        except Exception:
            try:
                self.p.kill()
            except Exception:
                pass


def gc_procs():
    now = time.time()
    with PROCS_LOCK:
        for pid in [k for k, p in PROCS.items() if p.finished and now - p.started > 1800]:
            PROCS.pop(pid, None)


# --------------------------------------------------------------------------- diagnostics

DIAG_RE = re.compile(
    r"^(?P<file>(?:[A-Za-z]:)?[^:\n]*?[^:\s\n]):(?P<line>\d+):(?:(?P<col>\d+):)?\s*"
    r"(?:(?P<sev>fatal error|error|warning|note|info|hint|help)(?:\[(?P<code>[^\]]+)\])?\s*:\s*)?"
    r"(?P<msg>.*)$",
    re.I,
)
FIXIT_RE = re.compile(r'^fix-it:"(?P<file>.+?)":\{(\d+):(\d+)-(\d+):(\d+)\}:"(?P<text>.*)"\s*$')


def _unescape_c(s):
    try:
        return codecs.decode(s.encode("latin-1", "backslashreplace"), "unicode_escape").encode("latin-1").decode("utf-8", "replace")
    except Exception:
        return s.replace('\\"', '"').replace("\\\\", "\\")


def parse_diagnostics(output, target_name):
    lines = output.splitlines()
    diags = []
    target = target_name.lower()
    last = None
    for i, raw in enumerate(lines):
        line = raw.rstrip()
        fm = FIXIT_RE.match(line)
        if fm:
            if last is not None and os.path.basename(fm.group("file")).lower() == target:
                last.setdefault("fixes", []).append({
                    "range": [int(fm.group(2)), int(fm.group(3)), int(fm.group(4)), int(fm.group(5))],
                    "text": _unescape_c(fm.group("text")),
                })
            continue
        m = DIAG_RE.match(line.strip())
        if not m:
            continue
        fname = m.group("file").strip()
        for prefix in ("vet: ", "In file included from "):
            if fname.startswith(prefix):
                fname = fname[len(prefix):]
        if os.path.basename(fname).lower() != target:
            last = None
            continue
        sev = (m.group("sev") or "").lower()
        msg = m.group("msg").strip()
        if not sev:
            sev = "error" if re.search(r"error|undefined|syntax|cannot|expected", msg, re.I) else "warning"
        sev = {"fatal error": "error", "note": "info", "help": "hint"}.get(sev, sev)
        col = m.group("col")
        if col is None and i + 2 < len(lines) and re.match(r"^\s*\^\s*$", lines[i + 2]):
            col = lines[i + 2].index("^") + 1
        d = {
            "line": int(m.group("line")),
            "col": int(col) if col else 1,
            "severity": sev,
            "message": msg,
            "code": m.group("code"),
        }
        if sev in ("info", "hint") and last is not None:
            last.setdefault("related", []).append(d)
            continue
        diags.append(d)
        last = d
    # de-duplicate
    rank = {"error": 3, "warning": 2, "info": 1, "hint": 0}
    seen, out = {}, []
    for d in diags:
        k = (d["line"], d["col"], d["message"])
        if k in seen:
            prev = seen[k]
            if rank.get(d["severity"], 0) > rank.get(prev["severity"], 0):
                prev["severity"] = d["severity"]
            if d.get("fixes"):
                prev.setdefault("fixes", []).extend(d["fixes"])
            continue
        seen[k] = d
        out.append(d)
    return out


# --------------------------------------------------------------------------- tool detection

COMMON_TOOLS = ["gcc", "g++", "clang", "clang++", "cl", "python", "python3", "py", "java", "javac",
                "rustc", "cargo", "node", "deno", "bun", "go", "dotnet", "php", "ruby", "lua",
                "bash", "kotlinc", "swift", "tsc", "make", "cmake"]


def detect_tools(names, search_dirs, project_dir):
    res = {}
    exe_ext = [".exe", ".cmd", ".bat", ""] if PLATFORM == "windows" else [""]
    dirs = []
    for d in search_dirs:
        d = d if os.path.isabs(d) else os.path.join(project_dir, d)
        if os.path.isdir(d):
            dirs.append(os.path.normpath(d))
    found_in_dirs = {}
    budget = [4000]
    for base in dirs:
        base_depth = base.rstrip(os.sep).count(os.sep)
        for cur, subdirs, files in os.walk(base):
            budget[0] -= 1
            if budget[0] <= 0:
                break
            if cur.count(os.sep) - base_depth >= 5:
                subdirs[:] = []
            subdirs[:] = [s for s in subdirs if s not in ("node_modules", ".git", "__pycache__", "include", "share", "doc", "docs", "lib")]
            lower = {f.lower(): f for f in files}
            for n in names:
                for e in exe_ext:
                    if (n + e).lower() in lower:
                        found_in_dirs.setdefault(n, []).append(os.path.join(cur, lower[(n + e).lower()]))
                        break
    for n in names:
        res[n] = {"path": shutil.which(n), "candidates": found_in_dirs.get(n, [])[:10]}
    return res


# --------------------------------------------------------------------------- http

def ui_origin():
    """Origin of the hosted editor (uiUrl), e.g. https://example.com for https://example.com/apps/cdev/."""
    u = urlparse(CFG.get("uiUrl") or "")
    return f"{u.scheme}://{u.netloc}" if u.scheme in ("http", "https") and u.netloc else None


def origin_allowed(origin):
    pats = DEFAULT_ORIGINS + list(CFG.get("allowOrigins") or [])
    if ui_origin():
        pats.append(ui_origin())
    return any(fnmatch.fnmatch(origin.lower(), p.lower()) for p in pats)


class Handler(BaseHTTPRequestHandler):
    server_version = "CDevRunner/" + VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if os.environ.get("CDEV_VERBOSE"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---- helpers
    def _cors(self):
        origin = self.headers.get("Origin")
        if origin and origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-CDev-Token")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")

    def _send(self, status, body, ctype="application/json; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _host_ok(self):
        host = (self.headers.get("Host") or "").lower()
        hostname = host.rsplit(":", 1)[0] if not host.startswith("[") else host.split("]")[0] + "]"
        allowed = {"127.0.0.1", "localhost", "[::1]", CFG["host"].lower()}
        return hostname in allowed

    def _auth(self, query):
        origin = self.headers.get("Origin")
        if origin and not origin_allowed(origin):
            raise ApiError(403, f"Origin {origin} is not allowed. Start the runner with --allow-origin {origin}")
        tok = self.headers.get("X-CDev-Token") or (query.get("token") or [None])[0]
        if CFG["token"] and not (tok and secrets.compare_digest(str(tok), CFG["token"])):
            raise ApiError(401, "Invalid or missing runner token")

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ApiError(413, "Request too large")
        raw = self.rfile.read(n) if n else b"{}"
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            raise ApiError(400, "Invalid JSON body")

    # ---- verbs
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method):
        url = urlparse(self.path)
        query = parse_qs(url.query)
        try:
            if not self._host_ok():
                raise ApiError(403, "Bad Host header")
            if not url.path.startswith("/api/"):
                if method == "GET":
                    return self._static(url.path)
                raise ApiError(404, "Not found")
            if url.path == "/api/ping":
                return self._send(200, {"app": "cdev-runner", "version": VERSION, "auth": bool(CFG["token"])})
            self._auth(query)
            name = url.path[len("/api/"):].replace("/", "_")
            fn = getattr(self, f"api_{name}", None)
            if not fn:
                raise ApiError(404, f"Unknown endpoint {url.path}")
            body = self._body() if method == "POST" else {k: v[0] for k, v in query.items()}
            result = fn(body)
            if result is not None:
                self._send(200, result)
        except ApiError as e:
            self._send(e.status, {"error": e.message})
        except FileNotFoundError as e:
            self._send(404, {"error": f"Not found: {e.filename or e}"})
        except PermissionError as e:
            self._send(403, {"error": f"Permission denied: {e.filename or e}"})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as e:  # pragma: no cover
            try:
                self._send(500, {"error": f"{type(e).__name__}: {e}"})
            except Exception:
                pass

    def _static(self, path):
        if not CFG["serveUi"] or not os.path.isfile(os.path.join(APP_DIR, "index.html")):
            ui = CFG.get("uiUrl") or ""
            link = f'<p>Open the editor: <a href="{ui}">{ui}</a></p>' if ui.startswith("https://") else ""
            html = ("<!doctype html><meta charset='utf-8'><title>CDev runner</title>"
                    "<body style='font-family:system-ui;padding:24px'><h2>CDev runner is running</h2>"
                    f"<p>Use the link printed in the runner window (it contains the token).</p>{link}</body>")
            return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
        rel = unquote(path).lstrip("/") or "index.html"
        p = os.path.normpath(os.path.join(APP_DIR, rel))
        if not is_inside(p, APP_DIR) or os.path.basename(p) == "runner_config.json":
            raise ApiError(403, "Forbidden")
        if os.path.isdir(p):
            p = os.path.join(p, "index.html")
        if not os.path.isfile(p):
            raise ApiError(404, "Not found")
        ctype = mimetypes.guess_type(p)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        if p.endswith(".js"):
            ctype = "text/javascript; charset=utf-8"
        with open(p, "rb") as f:
            self._send(200, f.read(), ctype)

    # ---- API: info
    def api_info(self, q):
        return {
            "version": VERSION,
            "root": CFG["root"],
            "rootName": os.path.basename(CFG["root"].rstrip("\\/")) or CFG["root"],
            "platform": PLATFORM,
            "sep": os.sep,
            "python": sys.executable,
            "runnerDir": RUNNER_DIR,
        }

    def api_abs_list(self, q):
        """Browse the local disk (absolute paths) for the folder/file picker."""
        p = (q.get("path") or "").strip().strip('"')
        places = [{"name": "Workspace", "path": CFG["root"]},
                  {"name": "CDev folder", "path": APP_DIR},
                  {"name": "Home", "path": os.path.expanduser("~")}]
        if not p:
            if PLATFORM == "windows":
                import string
                drives = [f"{d}:\\" for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")]
                return {"path": "", "parent": None, "sep": os.sep, "places": places,
                        "entries": [{"name": d, "type": "dir", "path": d} for d in drives]}
            p = "/"
        p = os.path.abspath(os.path.expanduser(p))
        if os.path.isfile(p):
            p = os.path.dirname(p)
        if not os.path.isdir(p):
            raise ApiError(404, f"Folder not found: {p}")
        entries = []
        try:
            with os.scandir(p) as it:
                for e in it:
                    try:
                        is_dir = e.is_dir()
                    except OSError:
                        continue
                    if e.name.startswith("$") or e.name in ("System Volume Information",):
                        continue
                    entries.append({"name": e.name, "type": "dir" if is_dir else "file", "path": e.path})
        except PermissionError:
            raise ApiError(403, f"Permission denied: {p}")
        entries.sort(key=lambda x: (x["type"] != "dir", x["name"].lower()))
        parent = os.path.dirname(p.rstrip("\\/")) if os.path.dirname(p.rstrip("\\/")) != p.rstrip("\\/") else None
        if PLATFORM == "windows" and (parent is None or re.match(r"^[A-Za-z]:\\?$", p)):
            parent = ""  # drive list
        return {"path": p, "parent": parent, "sep": os.sep, "places": places, "entries": entries}

    def api_root_set(self, b):
        p = os.path.abspath(os.path.expanduser(str(b.get("path") or "").strip().strip('"')))
        if not os.path.isdir(p):
            raise ApiError(404, f"Folder not found: {p}")
        CFG["root"] = p
        return self.api_info({})

    # ---- API: file system
    def api_fs_list(self, q):
        p = safe_path(q.get("path", ""))
        if not os.path.isdir(p):
            raise ApiError(404, "Not a directory")
        entries = []
        with os.scandir(p) as it:
            for e in it:
                if e.name in HIDDEN_NAMES:
                    continue
                try:
                    is_dir = e.is_dir()
                    entries.append({"name": e.name, "type": "dir" if is_dir else "file",
                                    "size": 0 if is_dir else e.stat().st_size})
                except OSError:
                    continue
        entries.sort(key=lambda x: (x["type"] != "dir", x["name"].lower()))
        return {"path": to_rel(p), "entries": entries}

    def api_fs_read(self, q):
        p = safe_path(q.get("path"))
        if not os.path.isfile(p):
            raise ApiError(404, "File not found")
        size = os.path.getsize(p)
        if size > MAX_READ:
            raise ApiError(413, f"File too large to edit ({size} bytes)")
        with open(p, "rb") as f:
            data = f.read()
        if b"\x00" in data[:8000]:
            return {"binary": True, "size": size}
        try:
            text, enc = data.decode("utf-8-sig"), "utf-8"
        except UnicodeDecodeError:
            text, enc = data.decode("latin-1"), "latin-1"
        return {"content": text, "encoding": enc, "size": size, "mtime": os.path.getmtime(p)}

    def api_fs_raw(self, q):
        p = safe_path(q.get("path"))
        if not os.path.isfile(p):
            raise ApiError(404, "File not found")
        with open(p, "rb") as f:
            self._send(200, f.read(), mimetypes.guess_type(p)[0] or "application/octet-stream")
        return None

    def api_fs_write(self, b):
        p = safe_path(b.get("path"))
        if os.path.isdir(p):
            raise ApiError(400, "Path is a directory")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding=b.get("encoding") or "utf-8", newline="") as f:
            f.write(b.get("content", ""))
        return {"ok": True, "mtime": os.path.getmtime(p)}

    def api_fs_mkdir(self, b):
        os.makedirs(safe_path(b.get("path")), exist_ok=True)
        return {"ok": True}

    def api_fs_delete(self, b):
        p = safe_path(b.get("path"))
        if norm(p) == norm(CFG["root"]):
            raise ApiError(400, "Refusing to delete the workspace root")
        if os.path.isdir(p):
            shutil.rmtree(p)
        elif os.path.exists(p):
            os.remove(p)
        return {"ok": True}

    def api_fs_rename(self, b):
        src, dst = safe_path(b.get("from")), safe_path(b.get("to"))
        if os.path.exists(dst):
            raise ApiError(409, "Target already exists")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.move(src, dst)
        return {"ok": True}

    def api_fs_exists(self, q):
        p = safe_path(q.get("path"))
        return {"exists": os.path.exists(p), "type": "dir" if os.path.isdir(p) else ("file" if os.path.isfile(p) else None)}

    # ---- API: project
    def api_resolve(self, b):
        p = safe_path(b.get("file") or b.get("dir") or "")
        settings, project_dir, sfile = effective_settings(p)
        out = {
            "projectDir": to_rel(project_dir),
            "projectDirAbs": project_dir,
            "settingsFile": to_rel(sfile) if sfile else None,
            "language": None,
            "commands": {},
        }
        if os.path.isfile(p) or b.get("file"):
            key, lang = pick_language(settings, p, project_dir, b.get("language"))
            if lang:
                variables, _ = build_context(settings, project_dir, p)
                cmds = {}
                for action in ("run", "build", "check", "setup", "clean", "test"):
                    try:
                        c = command_for(lang, action, variables)
                    except ApiError as e:
                        c = f"<error: {e.message}>"
                    if c:
                        cmds[action] = c
                out.update({
                    "language": key,
                    "label": lang.get("label", key),
                    "preview": bool(lang.get("preview")),
                    "browserRuntime": lang.get("browserRuntime"),
                    "checkOnSaved": bool(lang.get("checkOnSaved")),
                    "commands": cmds,
                })
        return out

    def api_settings_defaults(self, q):
        return load_defaults()

    def api_detect(self, b):
        names = b.get("tools") or COMMON_TOOLS
        if isinstance(names, str):
            names = [n for n in names.split(",") if n]
        base = safe_path(b.get("dir", ""))
        dirs = b.get("searchDirs") or []
        if isinstance(dirs, str):
            dirs = [d for d in dirs.split(";") if d]
        return {"tools": detect_tools(names, dirs, base), "platform": PLATFORM}

    # ---- API: run
    def api_run(self, b):
        gc_procs()
        action = b.get("action", "run")
        file_rel = b.get("file")
        if action == "shell":
            cmd = (b.get("command") or "").strip()
            if not cmd:
                raise ApiError(400, "Empty command")
            base = safe_path(b.get("cwd") or (os.path.dirname(file_rel) if file_rel else ""))
            settings, project_dir, _ = effective_settings(base)
            variables, tools = build_context(settings, project_dir, safe_path(file_rel) if file_rel else None)
            cwd = base if os.path.isdir(base) else project_dir
            label = "shell"
        else:
            if not file_rel:
                raise ApiError(400, "No file given")
            p = safe_path(file_rel)
            settings, project_dir, _ = effective_settings(p)
            key, lang = pick_language(settings, p, project_dir, b.get("language"))
            if not lang:
                raise ApiError(400, f"No language in exec_settings.json matches '{os.path.basename(p)}'. Add one under \"languages\".")
            variables, tools = build_context(settings, project_dir, p)
            cmd = command_for(lang, action, variables)
            if not cmd:
                raise ApiError(400, f"No '{action}' command defined for language '{key}' in exec_settings.json")
            if action in ("run", "build") and uses_outdir(lang):
                os.makedirs(variables["outDir"], exist_ok=True)
            cwd = expand(str(pick(lang.get("cwd"))), variables, quote=False) if lang.get("cwd") else project_dir
            label = f"{key}:{action}"
        env = build_env(settings, variables, tools, project_dir)
        proc = Proc(cmd, cwd, env, encoding=pick(settings.get("encoding")) or "utf-8", label=label)
        with PROCS_LOCK:
            PROCS[proc.id] = proc
        return {"id": proc.id, "command": cmd, "cwd": cwd}

    def _proc(self, pid):
        with PROCS_LOCK:
            proc = PROCS.get(pid)
        if not proc:
            raise ApiError(404, "Unknown process")
        return proc

    def api_proc_stdin(self, b):
        self._proc(b.get("id")).write(b.get("data", ""), bool(b.get("eof")))
        return {"ok": True}

    def api_proc_kill(self, b):
        self._proc(b.get("id")).kill()
        return {"ok": True}

    def api_proc_list(self, q):
        with PROCS_LOCK:
            return {"procs": [{"id": p.id, "cmd": p.cmd, "label": p.label, "finished": p.finished, "code": p.code}
                              for p in PROCS.values()]}

    def api_proc_stream(self, q):
        proc = self._proc(q.get("id"))
        idx = int(self.headers.get("Last-Event-ID") or q.get("from") or 0)
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        try:
            self.wfile.write(b"retry: 1500\n\n")
            self.wfile.flush()
            while True:
                with proc.cond:
                    if idx >= len(proc.events) and not proc.finished:
                        proc.cond.wait(timeout=15)
                    batch = proc.events[idx:]
                    start = idx
                    idx = len(proc.events)
                    done = proc.finished and idx >= len(proc.events) and any(e["type"] == "exit" for e in proc.events)
                if batch:
                    buf = []
                    for n, ev in enumerate(batch, start=start + 1):
                        buf.append(f"id: {n}\ndata: {json.dumps(ev, ensure_ascii=False)}\n\n")
                    self.wfile.write("".join(buf).encode("utf-8"))
                else:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
                if done:
                    break
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        return None

    # ---- API: diagnostics
    def api_check(self, b):
        p = safe_path(b.get("file"))
        settings, project_dir, _ = effective_settings(p)
        key, lang = pick_language(settings, p, project_dir, b.get("language"))
        if not lang or not lang.get("check"):
            return {"supported": False, "diagnostics": []}
        tmp = tempfile.mkdtemp(prefix="cdev_check_")
        try:
            content = b.get("content")
            check_file = None
            if content is not None and not lang.get("checkOnSaved"):
                check_file = os.path.join(tmp, os.path.basename(p))
                with open(check_file, "w", encoding="utf-8", newline="") as f:
                    f.write(content)
            variables, tools = build_context(settings, project_dir, p, check_file=check_file, tmp_dir=tmp)
            cmd = command_for(lang, "check", variables)
            env = build_env(settings, variables, tools, project_dir)
            kwargs = {}
            if PLATFORM == "windows":
                kwargs["creationflags"] = 0x08000000
            try:
                r = subprocess.run(shell_prefix() + cmd, shell=True, cwd=project_dir, env=env,
                                   capture_output=True, timeout=float(lang.get("checkTimeout", 30)), **kwargs)
            except subprocess.TimeoutExpired:
                return {"supported": True, "diagnostics": [], "error": "check timed out"}
            enc = pick(settings.get("encoding")) or "utf-8"
            out = r.stdout.decode(enc, "replace") + "\n" + r.stderr.decode(enc, "replace")
            diags = parse_diagnostics(out, os.path.basename(p))
            if r.returncode not in (0, None) and not diags and re.search(r"not recognized|not found|No such file", out, re.I):
                return {"supported": True, "diagnostics": [], "error": out.strip()[-500:], "command": cmd}
            return {"supported": True, "diagnostics": diags, "command": cmd, "exitCode": r.returncode,
                    "raw": out[-4000:]}
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


# --------------------------------------------------------------------------- main

def load_config():
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
            for k, v in data.items():
                if k in CFG or k in ("persistToken",):
                    CFG[k] = v
            if data.get("root") and not os.path.isabs(data["root"]):
                CFG["root"] = os.path.normpath(os.path.join(APP_DIR, data["root"]))
        except Exception as e:
            print(f"[warn] could not read {CONFIG_FILE}: {e}")


def main():
    load_config()
    ap = argparse.ArgumentParser(description="CDev local runner")
    ap.add_argument("--root", help="Workspace folder (default: current dir or runner_config.json)")
    ap.add_argument("--host", default=None)
    ap.add_argument("--port", type=int, default=None)
    ap.add_argument("--token", default=None, help="Fixed token (default: random per start)")
    ap.add_argument("--no-token", action="store_true", help="Disable token auth (NOT recommended)")
    ap.add_argument("--allow-origin", action="append", default=[], help="Extra allowed browser origin (glob)")
    ap.add_argument("--ui-url", default=None, help="URL of the hosted web app (e.g. https://you.github.io/CDev/)")
    ap.add_argument("--no-ui", action="store_true", help="Do not serve the bundled web app")
    ap.add_argument("--open", action="store_true", help="Open the web app in the browser")
    a = ap.parse_args()

    if a.root:
        CFG["root"] = a.root
    CFG["root"] = os.path.abspath(os.path.expanduser(CFG["root"]))
    if not os.path.isdir(CFG["root"]) and is_inside(CFG["root"], APP_DIR):
        os.makedirs(CFG["root"], exist_ok=True)  # e.g. the "workspace" folder of a fresh download
    if not os.path.isdir(CFG["root"]):
        print(f"Workspace folder does not exist: {CFG['root']}")
        sys.exit(1)
    if a.host:
        CFG["host"] = a.host
    if a.port:
        CFG["port"] = a.port
    if a.ui_url:
        CFG["uiUrl"] = a.ui_url
    if a.no_ui:
        CFG["serveUi"] = False
    CFG["allowOrigins"] = list(CFG.get("allowOrigins") or []) + a.allow_origin
    if a.no_token:
        CFG["token"] = None
    elif a.token:
        CFG["token"] = a.token
    elif not CFG.get("token"):
        CFG["token"] = secrets.token_urlsafe(18)

    try:
        server = ThreadingHTTPServer((CFG["host"], CFG["port"]), Handler)
    except OSError as e:
        print(f"Cannot listen on {CFG['host']}:{CFG['port']}: {e}\nIs another runner already running? Use --port.")
        sys.exit(1)
    server.daemon_threads = True

    base = f"http://{'127.0.0.1' if CFG['host'] in ('0.0.0.0', '127.0.0.1') else CFG['host']}:{CFG['port']}"
    frag = f"#runner={quote(base, safe='')}" + (f"&token={quote(CFG['token'], safe='')}" if CFG["token"] else "")
    local_ui = base + "/" + frag
    print("=" * 64)
    print(f" CDev runner v{VERSION}   ({PLATFORM}, Python {sys.version.split()[0]})")
    print(f"  Workspace : {CFG['root']}")
    print(f"  Runner    : {base}")
    print(f"  Token     : {CFG['token'] or '(disabled)'}")
    if CFG["serveUi"] and os.path.isfile(os.path.join(APP_DIR, "index.html")):
        print(f"  Local UI  : {local_ui}")
    if CFG.get("uiUrl"):
        print(f"  Online UI : {CFG['uiUrl'].rstrip('/')}/{frag}")
    print("  Press Ctrl+C to stop.")
    print("=" * 64, flush=True)
    if a.open:
        has_local_ui = CFG["serveUi"] and os.path.isfile(os.path.join(APP_DIR, "index.html"))
        target = (CFG["uiUrl"].rstrip("/") + "/" + frag) if CFG.get("uiUrl") and not has_local_ui else local_ui
        threading.Timer(0.6, lambda: webbrowser.open(target)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping...")
        with PROCS_LOCK:
            for p in PROCS.values():
                p.kill()
        server.server_close()


if __name__ == "__main__":
    main()
