import asyncio
from app.tasks import engine
from app.adapters.memory import store
from app.core import agent
from app.core.gates import needs_human, gate_message


def test_task_lifecycle():
    t = engine.create_task("مكالمة أحمد", ["call", "negotiate", "calendar"])
    assert t["status"] == "CREATED"
    engine.set_status(t["task_id"], "RUNNING")
    engine.set_status(t["task_id"], "WAITING_FOR_HUMAN", "2FA at login")
    assert engine.get_task(t["task_id"])["status"] == "WAITING_FOR_HUMAN"
    engine.set_status(t["task_id"], "COMPLETED", "done")
    assert engine.get_task(t["task_id"])["status"] == "COMPLETED"


def test_memory():
    asyncio.run(store.remember("prefs", "lang", "مصري"))
    hits = asyncio.run(store.recall("مصري"))
    assert any(h["key"] == "lang" for h in hits)
    assert asyncio.run(store.forget("lang")) is True


def test_local_commands():
    r, m, c = asyncio.run(agent.handle_text("/voice status"))
    assert "الصوت" in r and m == "local" and c == 0.0
    r, _, _ = asyncio.run(agent.handle_text("/tasks"))
    assert isinstance(r, str)


def test_gates():
    assert needs_human("payment checkout") is True
    assert needs_human("read website") is False
    assert "HUMAN GATE" in gate_message("captcha", "at login", "حلها", "أكمل الحجز")
