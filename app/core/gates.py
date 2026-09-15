"""Human gates — الحالات الوحيدة المسموح فيها إيقاف الاستقلالية."""
HUMAN_GATES = {
    "captcha", "2fa", "passkey", "oauth_consent", "sensitive_password",
    "payment", "financial_commitment", "legal_commitment", "sensitive_decision",
}


def needs_human(action: str, meta: dict | None = None) -> bool:
    a = action.lower()
    return any(g in a for g in HUMAN_GATES)


def gate_message(reason: str, state: str, need: str, after: str) -> str:
    return (f"HUMAN GATE\nReason: {reason}\nCurrent state: {state}\n"
            f"What I need from you: {need}\nWhat happens after: {after}")
