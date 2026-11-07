// app.js
// Minimal local Notion‑like notes with slash commands and optional AI integration.

// ---------- Utility ----------
const STORAGE_KEY = "local-notion-data";
let data = {
  pages: {}, // pageId => { title, blocks: [] }
  currentPageId: null,
  ai: { endpoint: "", key: "" },
};

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { data = JSON.parse(raw); } catch (_) { console.error("Failed to parse storage"); }
  }
  if (!data.currentPageId) {
    // ensure at least one page
    const id = generateId();
    data.pages[id] = { title: "Untitled", blocks: [] };
    data.currentPageId = id;
    saveData();
  }
}
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function generateId() { return "id_" + Math.random().toString(36).substr(2, 9); }

// ---------- DOM Elements ----------
const pagesListEl = document.getElementById("pages-list");
const addPageBtn = document.getElementById("add-page");
const currentTitleEl = document.getElementById("current-page-title");
const blocksContainer = document.getElementById("blocks-container");
const commandPalette = document.getElementById("command-palette");
const aiModal = document.getElementById("ai-modal");
const aiEndpointInput = document.getElementById("ai-endpoint");
const aiKeyInput = document.getElementById("ai-key");
const aiSaveBtn = document.getElementById("ai-save");
const aiCancelBtn = document.getElementById("ai-cancel");
const aiSettingsBtn = document.getElementById("ai-settings");

// ---------- Page Management ----------
function renderPages() {
  pagesListEl.innerHTML = "";
  Object.entries(data.pages).forEach(([id, page]) => {
    const li = document.createElement("li");
    li.textContent = page.title;
    li.dataset.id = id;
    if (id === data.currentPageId) li.classList.add("active");
    li.addEventListener("click", () => switchPage(id));
    pagesListEl.appendChild(li);
  });
}
function switchPage(id) {
  data.currentPageId = id;
  renderCurrentPage();
  renderPages();
  saveData();
}
addPageBtn.addEventListener("click", () => {
  const id = generateId();
  data.pages[id] = { title: "New Page", blocks: [] };
  data.currentPageId = id;
  renderCurrentPage();
  renderPages();
  saveData();
});

// ---------- Page Title ----------
currentTitleEl.addEventListener("input", (e) => {
  const page = data.pages[data.currentPageId];
  page.title = e.target.textContent.trim() || "Untitled";
  renderPages();
  saveData();
});

// ---------- Blocks ----------
function renderCurrentPage() {
  const page = data.pages[data.currentPageId];
  currentTitleEl.textContent = page.title;
  blocksContainer.innerHTML = "";
  page.blocks.forEach((blk, idx) => {
    const el = createBlockElement(blk, idx);
    blocksContainer.appendChild(el);
  });
  // ensure an empty paragraph at end for new content
  if (page.blocks.length === 0 || page.blocks[page.blocks.length - 1].type !== "paragraph") {
    addBlock({ type: "paragraph", content: "" }, true);
  }
}
function addBlock(block, focus = false) {
  const page = data.pages[data.currentPageId];
  page.blocks.push(block);
  const el = createBlockElement(block, page.blocks.length - 1);
  blocksContainer.appendChild(el);
  if (focus) setTimeout(() => el.focus(), 0);
  saveData();
}
function createBlockElement(block, index) {
  const div = document.createElement("div");
  div.className = "block";
  div.dataset.idx = index;
  div.contentEditable = true;
  // set innerHTML based on type
  switch (block.type) {
    case "heading-1":
      div.innerHTML = `<h1>${block.content}</h1>`;
      break;
    case "heading-2":
      div.innerHTML = `<h2>${block.content}</h2>`;
      break;
    case "toggle":
      div.innerHTML = `<div class="toggle-header">${block.content}</div><div class="toggle-children"></div>`;
      break;
    default: // paragraph
      div.innerHTML = block.content;
  }
  // AI send button
  const aiBtn = document.createElement("span");
  aiBtn.className = "ai-send";
  aiBtn.textContent = "🤖";
  aiBtn.title = "Send to AI";
  aiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sendBlockToAI(index);
  });
  div.appendChild(aiBtn);

  // Event listeners
  div.addEventListener("keydown", (e) => handleBlockKeyDown(e, div, block, index));
  div.addEventListener("input", () => handleBlockInput(div, block, index));
  if (block.type === "toggle") {
    const header = div.querySelector(".toggle-header");
    header.addEventListener("click", () => toggleChildren(div));
  }
  return div;
}
function handleBlockKeyDown(e, el, block, idx) {
  if (e.key === "Enter") {
    e.preventDefault();
    // split block at caret
    const sel = window.getSelection();
    const caretPos = sel.focusOffset;
    const html = el.innerHTML;
    const before = html.slice(0, caretPos);
    const after = html.slice(caretPos);
    // update current block
    block.content = before;
    // create new block after current
    const newBlock = { type: "paragraph", content: after };
    const page = data.pages[data.currentPageId];
    page.blocks.splice(idx + 1, 0, newBlock);
    renderCurrentPage();
    // focus new block
    const newEl = blocksContainer.children[idx + 1];
    setTimeout(() => newEl.focus(), 0);
    saveData();
  } else if (e.key === "/" && el.textContent.trim() === "/") {
    // open command palette
    openPalette(el);
  }
}
function handleBlockInput(el, block, idx) {
  // update block content based on innerHTML stripped of tags for simplicity
  if (block.type.startsWith("heading")) {
    block.content = el.textContent.replace(/^#\s*/, "");
  } else if (block.type === "toggle") {
    block.content = el.querySelector('.toggle-header').textContent;
  } else {
    block.content = el.innerHTML;
  }
  saveData();
}

// ---------- Toggle ----------
function toggleChildren(blockEl) {
  const children = blockEl.querySelector('.toggle-children');
  const header = blockEl.querySelector('.toggle-header');
  const expanded = header.classList.toggle('expanded');
  children.style.display = expanded ? 'block' : 'none';
}

// ---------- Slash Command Palette ----------
function openPalette(targetEl) {
  const rect = targetEl.getBoundingClientRect();
  commandPalette.style.top = `${rect.bottom + window.scrollY}px`;
  commandPalette.style.left = `${rect.left + window.scrollX}px`;
  commandPalette.classList.remove('hidden');
  const onSelect = (e) => {
    const cmd = e.target.dataset.cmd;
    if (!cmd) return;
    applyCommand(cmd, targetEl);
    closePalette();
  };
  commandPalette.addEventListener('click', onSelect, { once: true });
  // close on outside click
  const onOutside = (e) => { if (!commandPalette.contains(e.target)) closePalette(); };
  document.addEventListener('click', onOutside, { once: true });
}
function closePalette() {
  commandPalette.classList.add('hidden');
}
function applyCommand(cmd, targetEl) {
  const idx = Number(targetEl.dataset.idx);
  const page = data.pages[data.currentPageId];
  const block = page.blocks[idx];
  // replace current block with selected type
  switch (cmd) {
    case 'heading-1':
      block.type = 'heading-1';
      block.content = '';
      break;
    case 'heading-2':
      block.type = 'heading-2';
      block.content = '';
      break;
    case 'toggle':
      block.type = 'toggle';
      block.content = '';
      break;
    case 'paragraph':
      block.type = 'paragraph';
      block.content = '';
      break;
    case 'new-page':
      addPageBtn.click();
      return;
  }
  renderCurrentPage();
  // focus newly transformed block
  const newEl = blocksContainer.children[idx];
  setTimeout(() => newEl.focus(), 0);
  saveData();
}

// ---------- AI Integration ----------
aiSettingsBtn.addEventListener('click', () => {
  aiEndpointInput.value = data.ai.endpoint;
  aiKeyInput.value = data.ai.key;
  aiModal.classList.remove('hidden');
});
aiCancelBtn.addEventListener('click', () => aiModal.classList.add('hidden'));
aiSaveBtn.addEventListener('click', () => {
  data.ai.endpoint = aiEndpointInput.value.trim();
  data.ai.key = aiKeyInput.value.trim();
  aiModal.classList.add('hidden');
  saveData();
});

async function sendBlockToAI(blockIdx) {
  const page = data.pages[data.currentPageId];
  const block = page.blocks[blockIdx];
  if (!data.ai.endpoint || !data.ai.key) {
    alert('Please configure AI endpoint and key first.');
    return;
  }
  const payload = {
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: block.content }]
  };
  try {
    const resp = await fetch(data.ai.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${data.ai.key}`
      },
      body: JSON.stringify(payload)
    });
    const dataResp = await resp.json();
    const reply = dataResp.choices?.[0]?.message?.content ?? "[No response]";
    // Insert reply as a new paragraph block after current
    page.blocks.splice(blockIdx + 1, 0, { type: "paragraph", content: reply });
    renderCurrentPage();
    saveData();
  } catch (err) {
    console.error(err);
    alert('AI request failed. Check console for details.');
  }
}

// ---------- Init ----------
loadData();
renderPages();
renderCurrentPage();
