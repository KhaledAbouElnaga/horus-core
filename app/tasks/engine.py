"""Task state machine + checkpoints. الحالات: CREATED/RUNNING/WAITING_FOR_TOOL/
WAITING_FOR_HUMAN/RETRYING/COMPLETED/FAILED/CANCELLED"""
import time
import uuid

STATUSES = {"CREATED", "RUNNING", "WAITING_FOR_TOOL", "WAITING_FOR_HUMAN",
            "RETRYING", "COMPLETED", "FAILED", "CANCELLED"}

_tasks: dict[str, dict] = {}


def create_task(title: str, steps: list[str] | None = None) -> dict:
    tid = f"T-{uuid.uuid4().hex[:6].upper()}"
    t = {"task_id": tid, "title": title, "status": "CREATED",
         "steps": [{"name": s, "done": False} for s in (steps or [])],
         "progress": 0, "checkpoints": [], "evidence": [],
         "errors": [], "retry_count": 0, "created_at": time.time(), "updated_at": time.time()}
    _tasks[tid] = t
    return t


def get_task(tid: str) -> dict | None:
    return _tasks.get(tid)


def set_status(tid: str, status: str, note: str = "") -> dict:
    t = _tasks[tid]
    assert status in STATUSES, status
    t["status"] = status
    t["updated_at"] = time.time()
    if note:
        t["checkpoints"].append({"ts": time.time(), "note": note, "status": status})
    return t


def add_evidence(tid: str, evidence: dict) -> None:
    _tasks[tid]["evidence"].append({**evidence, "ts": time.time()})


def active_tasks() -> list[dict]:
    return [t for t in _tasks.values() if t["status"] not in ("COMPLETED", "FAILED", "CANCELLED")]
