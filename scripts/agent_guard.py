"""PreToolUse hook for the project's agents: blocks any tool call outside the agent's job.

Usage (set in the agent's frontmatter, .claude/agents/<agent>.md):
  uv run python -m scripts.agent_guard calculator
Claude Code passes the tool call as JSON on stdin. Exit 0 lets it run; exit 2 blocks it
and the reason on stderr goes back to the agent. Anything unreadable is blocked.

Each agent may run only its own `uv run python -m scripts.<module>` commands, with no
shell operators or expansions, write only JSON files directly in its drafts folder, and
never read .env files (secrets). Edit and web tools are blocked.
"""
import json
import os
import re
import shlex
import sys
from pathlib import Path

from scripts.paths import ROOT

AGENTS = {
    "calculator": {"modules": ("scripts.query", "scripts.run_calc", "scripts.write_finding"),
                   "drafts": ROOT / "stages" / "04_calcular" / "output" / "drafts"},
    "investigator": {"modules": ("scripts.write_investigation", "scripts.build_snapshot"),
                     "drafts": ROOT / "stages" / "03_investigar" / "output" / "drafts"},
}
PREFIX = ["uv", "run", "python", "-m"]
# Tools that change files or reach outside the repository. Other tools (such as the
# harness's own hand-back of the final report) are left to the agent's `tools:` list.
BLOCKED_TOOLS = {"Edit", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch", "Agent", "Task"}
OPERATORS = set(";&|<>()\n\r`")
EXPANSION = re.compile(r"\$[({A-Za-z_0-9@*#?!$-]")


def _shell_problem(command: str) -> str | None:
    """Why the command could run more than one program, or None. Tracks bash quoting."""
    quote, i = None, 0
    while i < len(command):
        ch = command[i]
        if quote == "'":
            quote = None if ch == "'" else quote
        elif ch == "\\":
            i += 1  # the next character is literal
        elif quote == '"':
            if ch == '"':
                quote = None
            elif ch == "`" or EXPANSION.match(command, i):
                return "command substitution or variables are not allowed"
        elif ch in "'\"":
            quote = ch
        elif ch in OPERATORS:
            return f"shell operator {ch!r} is not allowed"
        elif EXPANSION.match(command, i):
            return "command substitution or variables are not allowed"
        i += 1
    return "unterminated quote" if quote else None


def _bash(agent: dict, command: str) -> str | None:
    allowed = "; ".join(f"uv run python -m {m}" for m in agent["modules"])
    problem = _shell_problem(command)
    if problem:
        return f"{problem}. Allowed commands: {allowed}"
    try:
        words = shlex.split(command)
    except ValueError as error:
        return f"cannot read the command ({error}). Allowed commands: {allowed}"
    if words[:4] != PREFIX or len(words) < 5 or words[4] not in agent["modules"]:
        return f"not an allowed command. Allowed commands: {allowed}"
    return None


def _path(value) -> Path:
    path = Path(str(value or ""))
    return (path if path.is_absolute() else ROOT / path).resolve()


def _same(a: Path, b: Path) -> bool:
    return os.path.normcase(str(a)) == os.path.normcase(str(b))


def check(agent_name: str, event: dict) -> str | None:
    """The reason to block this tool call, or None to let it run."""
    agent = AGENTS.get(agent_name)
    if agent is None:
        return f"unknown agent {agent_name!r}"
    tool = event.get("tool_name")
    data = event.get("tool_input") or {}
    if tool == "Bash":
        return _bash(agent, str(data.get("command", "")))
    if tool == "Write":
        path = _path(data.get("file_path"))
        if _same(path.parent, agent["drafts"].resolve()) and path.suffix == ".json":
            return None
        return f"you may write only JSON files directly in {agent['drafts'].relative_to(ROOT).as_posix()}/"
    if tool == "Read":
        name = _path(data.get("file_path")).name.lower()
        if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
            return ".env files hold secrets and may not be read"
        return None
    if tool in BLOCKED_TOOLS:
        return f"tool {tool!r} is not allowed for the {agent_name}"
    return None


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    try:
        event = json.loads(sys.stdin.read())
        if not isinstance(event, dict):
            raise ValueError("not a JSON object")
        reason = check(argv[0] if argv else "", event)
    except (ValueError, OSError) as error:
        reason = f"blocked: cannot read the tool call ({error})"
    if reason:
        print(reason, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
