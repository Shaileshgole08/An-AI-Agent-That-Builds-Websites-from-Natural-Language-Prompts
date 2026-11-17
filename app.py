"""
Flask backend for the Website Generator Agent.

Endpoints:
  POST /api/clarify   - accepts { prompt } → returns { questions: [...] }
  POST /api/generate  - accepts { prompt, answers } → returns { html: "..." }
  GET  /              - serves the main UI
"""

import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv

from agent import run_clarify, run_generate

load_dotenv()

app = Flask(__name__)
CORS(app)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/clarify", methods=["POST"])
def clarify():
    data = request.get_json(force=True)
    prompt = (data.get("prompt") or "").strip()

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    try:
        questions = run_clarify(prompt, GEMINI_API_KEY)
        return jsonify({"questions": questions})
    except Exception as exc:
        app.logger.error("Clarify error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.get_json(force=True)
    prompt = (data.get("prompt") or "").strip()
    answers = (data.get("answers") or "").strip()

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    if not answers:
        return jsonify({"error": "answers are required"}), 400

    try:
        html = run_generate(prompt, answers, GEMINI_API_KEY)
        return jsonify({"html": html})
    except Exception as exc:
        app.logger.error("Generate error: %s", exc)
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, port=5000)
