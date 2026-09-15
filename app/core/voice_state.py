"""Voice mode state + STT/TTS adapters (Groq Whisper free + Edge-TTS free)."""
mode: str = "off"  # on|off — يُضبط بـ /voice


async def transcribe(audio_path: str) -> str:
    from app.core.config import settings
    try:
        from groq import AsyncGroq
        if settings.groq_api_key:
            c = AsyncGroq(api_key=settings.groq_api_key)
            with open(audio_path, "rb") as f:
                r = await c.audio.transcriptions.create(
                    file=(audio_path, f.read()), model="whisper-large-v3-turbo",
                    language="ar", response_format="text")
            return str(r)
    except Exception:
        pass
    if settings.openai_api_key:
        from openai import AsyncOpenAI
        c = AsyncOpenAI(api_key=settings.openai_api_key)
        with open(audio_path, "rb") as f:
            r = await c.audio.transcriptions.create(file=f, model="whisper-1", language="ar")
            return r.text
    return ""


async def speak(text: str, out_path: str = "reply.mp3") -> str:
    from app.core.config import settings
    import edge_tts
    try:
        tts = edge_tts.Communicate(text, settings.horus_tts_voice or "ar-EG-SalmaNeural")
        await tts.save(out_path)
        return out_path
    except Exception:
        if settings.openai_api_key:
            from openai import AsyncOpenAI
            c = AsyncOpenAI(api_key=settings.openai_api_key)
            r = await c.audio.speech.create(model="tts-1", voice="alloy", input=text)
            r.stream_to_file(out_path)
            return out_path
        raise
