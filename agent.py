"""
Website Generator Agent — calls Gemini API directly via httpx.

Flow:
1. run_clarify(prompt)  → returns list of 6 clarifying questions
2. run_generate(prompt, answers) → returns full self-contained HTML
"""

import json
import re
import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

GEMINI_MODEL = "gemini-3.1-flash-lite"
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
REQUEST_TIMEOUT = 90  # seconds


# ---------------------------------------------------------------------------
# Core API call
# ---------------------------------------------------------------------------

def _call_gemini(api_key: str, system: str, user: str, max_tokens: int = 2048) -> str:
    """Call Gemini generateContent and return the text response. Retries on 503."""
    url = f"{GEMINI_API_BASE}/{GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": user}]}
        ],
        "systemInstruction": {
            "parts": [{"text": system}]
        },
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.7,
        }
    }

    max_retries = 4
    delay = 3  # seconds between retries

    for attempt in range(max_retries):
        response = httpx.post(url, json=payload, timeout=REQUEST_TIMEOUT)

        if response.status_code == 200:
            data = response.json()
            try:
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError) as e:
                raise RuntimeError(f"Unexpected Gemini response shape: {data}") from e

        if response.status_code == 503:
            if attempt < max_retries - 1:
                import time
                time.sleep(delay * (attempt + 1))
                continue

        err = response.json().get("error", {})
        raise RuntimeError(
            f"Gemini API error {response.status_code}: {err.get('message', response.text)}"
        )

    raise RuntimeError("Gemini API returned 503 after all retries — model is overloaded. Please try again.")


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

CLARIFY_SYSTEM = """You are an expert web designer and developer assistant.
Your job is to understand exactly what kind of website the user wants before building it.

When given a website idea, generate exactly 6 specific, helpful clarifying questions.
These questions should cover:
- Primary purpose and goal of the website
- Target audience
- Preferred color scheme or brand colors
- Key sections or pages needed (e.g. Hero, About, Services, Portfolio, Contact)
- Specific features (contact form, gallery, booking, animations, etc.)
- Style/tone (modern, minimal, bold, corporate, playful, elegant, dark, etc.)

Respond ONLY with a valid JSON object — no extra text, no markdown fences:
{
  "questions": [
    "Question 1?",
    "Question 2?",
    "Question 3?",
    "Question 4?",
    "Question 5?",
    "Question 6?"
  ]
}"""

GENERATE_SYSTEM = """You are an elite full-stack web developer and UI/UX designer.
Build a stunning, fully functional single-file website based on the user's requirements.

STRICT RULES:
1. Output ONLY raw HTML — absolutely NO markdown fences, NO explanation text, NO comments outside the HTML.
2. The file must be completely self-contained: all CSS inside <style> tags, all JS inside <script> tags.
3. Use modern CSS: custom properties (CSS variables), flexbox/grid, smooth transitions, hover effects.
4. The website must be fully responsive (mobile-first with media queries).
5. Include: a sticky navigation bar, hero section, at least 3 content sections relevant to the topic, and a footer.
6. Use beautiful typography — import from Google Fonts (e.g. Inter, Poppins, Playfair Display).
7. Add subtle CSS animations: fade-in on scroll (using IntersectionObserver), hover effects, smooth scrolling.
8. Make it visually impressive — use gradients, box-shadows, glassmorphism or neumorphism where appropriate.
9. All sections must have real, meaningful content (not "Lorem ipsum") based on the user's answers.
10. The very first character of your response MUST be < (the opening of <!DOCTYPE html>).
11. Navigation links must smoothly scroll to their sections.
12. Add a working mobile hamburger menu."""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_clarify(prompt: str, api_key: str) -> list[str]:
    """Step 1: return 6 clarifying questions for the given website prompt."""
    raw = _call_gemini(
        api_key=api_key,
        system=CLARIFY_SYSTEM,
        user=f"Website idea: {prompt}",
        max_tokens=512,
    )

    # Strip markdown fences if the model added them anyway
    raw = raw.strip()
    raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        data = json.loads(raw)
        questions = data.get("questions", [])
        if questions:
            return questions
    except json.JSONDecodeError:
        pass

    # Fallback: extract any lines containing "?"
    questions = [line.strip().lstrip("-•*0123456789. ") for line in raw.split("\n") if "?" in line]
    if questions:
        return questions

    raise RuntimeError("Could not parse clarifying questions from model response.")


def run_generate(prompt: str, answers: str, api_key: str) -> str:
    """Step 2: return the full self-contained HTML website."""
    user_msg = (
        f"Website description: {prompt}\n\n"
        f"User's answers to clarifying questions:\n{answers}\n\n"
        "Generate the complete website HTML now. Remember: output ONLY raw HTML starting with <!DOCTYPE html>."
    )

    html = _call_gemini(
        api_key=api_key,
        system=GENERATE_SYSTEM,
        user=user_msg,
        max_tokens=8192,
    )

    html = html.strip()

    # Strip any accidental markdown fences
    html = re.sub(r"^```[a-z]*\n?", "", html, flags=re.IGNORECASE)
    html = re.sub(r"\n?```$", "", html)

    # Find the actual start of the HTML document
    idx = html.lower().find("<!doctype")
    if idx == -1:
        idx = html.lower().find("<html")
    if idx != -1:
        html = html[idx:]

    return html
