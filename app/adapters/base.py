"""Provider interfaces — ممنوع استيراد SDK مباشرة في الـcore، فقط عبر هذه الواجهات."""
from typing import Protocol, Any


class LLMProvider(Protocol):
    async def complete(self, messages: list[dict], model_tier: str = "fast") -> str: ...


class SpeechToTextProvider(Protocol):
    async def transcribe(self, audio_path: str, lang: str = "ar") -> str: ...


class TextToSpeechProvider(Protocol):
    async def synthesize(self, text: str, voice: str = "") -> str: ...  # returns audio file path


class MessagingProvider(Protocol):
    async def send_text(self, chat_id: str, text: str) -> dict: ...
    async def send_voice(self, chat_id: str, audio_path: str) -> dict: ...


class TelephonyProvider(Protocol):
    async def place_call(self, to: str, script: str) -> dict: ...
    def status(self) -> dict: ...


class BrowserProvider(Protocol):
    async def run_task(self, steps: list[dict]) -> dict: ...


class MemoryProvider(Protocol):
    async def remember(self, kind: str, key: str, value: str) -> None: ...
    async def recall(self, query: str, limit: int = 5) -> list[dict]: ...
    async def forget(self, key: str) -> bool: ...
