
# SignVoice — Local Folder Version

## Open the website
1. Extract this folder completely.
2. Double-click `index.html`. The CSS and JavaScript are in separate files and use relative paths.
3. An internet connection is required for the Google Fonts and MediaPipe/Lenis CDN libraries referenced by the original website.

## If the webcam does not start
Browser camera permissions can depend on browser security rules. Double-click `Open SignVoice Locally.bat`, or run `python python/app.py`, then visit `http://127.0.0.1:8000`. Keep the terminal window open.

## Files
- `index.html` — page structure
- `css/style.css` — extracted styles
- `js/script.js` — extracted application JavaScript
- `python/app.py` — optional Python standard-library static server

Important: Python does not execute inside a browser tab opened directly from `index.html`. This original website's gesture logic runs in JavaScript (MediaPipe in the browser), not in Python. The Python file is only an optional local web server; it is not a separate AI recognition model.

