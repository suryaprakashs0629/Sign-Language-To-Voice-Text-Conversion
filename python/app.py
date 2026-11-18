
"""
Optional local server for SignVoice.
The website itself is HTML/CSS/JavaScript; this Python file only serves the files.
Run with: python python/app.py
Then open http://127.0.0.1:8000
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import webbrowser

PROJECT_ROOT = Path(__file__).resolve().parent.parent
os.chdir(PROJECT_ROOT)
URL = "http://127.0.0.1:8000"

if __name__ == "__main__":
    print("SignVoice is available at:", URL)
    print("Keep this window open while using the website. Press Ctrl+C to stop.")
    try:
        webbrowser.open(URL)
    except Exception:
        pass
    ThreadingHTTPServer(("127.0.0.1", 8000), SimpleHTTPRequestHandler).serve_forever()

