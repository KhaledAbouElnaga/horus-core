"""Browser provider — Playwright محليًا الآن، Steel Cloud لاحقًا بنفس الواجهة."""
STATUS = "DESIGNED"


async def run_task(url: str, actions: list[dict] | None = None) -> dict:
    """PoC: يفتح صفحة ويرجع العنوان + نص. يدعم JS/dynamic عبر Chromium حقيقي."""
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, timeout=30000)
        title = await page.title()
        body = (await page.inner_text("body"))[:3000]
        await browser.close()
        return {"ok": True, "url": url, "title": title, "text": body}
