# Minimalist Local Notion-like Notes Web App

This project implements a lightweight, client‑side notes application with a clean, Notion‑inspired interface.

## Features
- **Local storage** – All pages and blocks are stored in the browser's `localStorage` (or `IndexedDB` in the future). No server is required.
- **Pages** – Create, rename, delete and switch between pages.
- **Blocks** – Supports headings, toggle (collapsible) list items and plain paragraphs.
- **Slash commands** – Type `/` in a block to open a small command palette to insert a heading, toggle list, or a new page.
- **AI integration** – Users can supply an external AI endpoint (e.g., OpenAI, Anthropic) and an API key. Selected block content can be sent to the AI and the response inserted.

## How to run
1. Open `index.html` in a modern browser (Chrome, Edge, Safari, Firefox). No build step or server is required.
2. Use the UI on the left to manage pages.
3. Inside a page, press `Enter` to create a new block. Type `/` at the start of a block to see the command palette.
4. To use AI, click the gear icon in the top‑right, fill in the **AI Endpoint** and **API Key**, then select a block and click **Send to AI**.

## Project structure
```
├─ index.html        # Main HTML page
├─ style.css         # Minimal styling
├─ app.js            # Application logic
└─ README.md         # This file
```

Feel free to extend the app – add more block types, richer storage, or a more sophisticated AI UI.
