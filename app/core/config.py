"""HORUS settings — كل الأسرار من البيئة فقط."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    telegram_bot_token: str = ""
    telegram_allowed_user_ids: str = ""
    openai_api_key: str = ""
    groq_api_key: str = ""
    gemini_api_key: str = ""
    openrouter_api_key: str = ""
    paid_llm_mode: str = "off"
    database_url: str = "sqlite+aiosqlite:///./horus.db"
    supabase_url: str = ""
    supabase_key: str = ""
    horus_voice_default: str = "off"
    horus_tts_voice: str = "ar-EG-SalmaNeural"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    public_base_url: str = ""
    cost_monthly_cap_usd: float = 0.0

    @property
    def allowed_users(self) -> set[int]:
        return {int(x) for x in self.telegram_allowed_user_ids.split(",") if x.strip().isdigit()}

    class Config:
        env_file = ".env"


settings = Settings()
