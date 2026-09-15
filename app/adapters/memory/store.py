"""Memory: SQLite محليًا / Supabase Postgres إنتاجيًا. طبقات: profile/prefs/people/lessons/episodic."""
import time
import json

_store: dict[str, dict] = {}  # fallback in-memory (tests)


async def remember(kind: str, key: str, value: str) -> None:
    _store[f"{kind}:{key}"] = {"kind": kind, "key": key, "value": value, "ts": time.time()}


async def recall(query: str, limit: int = 5) -> list[dict]:
    q = query.lower()
    hits = [v for v in _store.values() if q in v["key"].lower() or q in v["value"].lower()]
    return hits[:limit] or list(_store.values())[:limit]


async def forget(key: str) -> bool:
    found = [k for k in _store if k.endswith(f":{key}") or k == key]
    for k in found:
        del _store[k]
    return bool(found)


async def snapshot() -> str:
    return json.dumps(_store, ensure_ascii=False)
