"""Python checker used by CDev: syntax errors via ast, plus pyflakes if installed.
Output format (gcc-like): <file>:<line>:<col>: <severity>: <message>
"""
import ast
import sys


def main():
    if len(sys.argv) < 2:
        print("usage: pycheck.py FILE")
        return 2
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        src = f.read()
    try:
        tree = ast.parse(src, path)
    except SyntaxError as e:
        print(f"{path}:{e.lineno or 1}:{e.offset or 1}: error: {e.__class__.__name__}: {e.msg}")
        return 1
    try:
        compile(src, path, "exec")
    except SyntaxError as e:
        print(f"{path}:{e.lineno or 1}:{e.offset or 1}: error: {e.__class__.__name__}: {e.msg}")
        return 1
    try:
        from pyflakes import checker
    except ImportError:
        return 0
    w = checker.Checker(tree, filename=path)
    w.messages.sort(key=lambda m: (m.lineno, getattr(m, "col", 0)))
    errors = ("UndefinedName", "UndefinedLocal", "UndefinedExport", "ReturnOutsideFunction",
              "YieldOutsideFunction", "ContinueOutsideLoop", "BreakOutsideLoop", "DuplicateArgument")
    for m in w.messages:
        sev = "error" if type(m).__name__ in errors else "warning"
        print(f"{path}:{m.lineno}:{getattr(m, 'col', 0) + 1}: {sev}: {m.message % m.message_args}")
    return 1 if w.messages else 0


if __name__ == "__main__":
    sys.exit(main())
