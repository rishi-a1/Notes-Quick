// app.js – Local Notion-like notes app
// All data persisted in localStorage. No server required.

// ==================== Storage ====================
const STORAGE_KEY = "local-notion-data";
let data = {
  pages: {},
  currentPageId: null,
  ai: { endpoint: "", key: "", model: "gpt-3.5-turbo" },
};

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { data = JSON.parse(raw); } catch (_) { /* ignore */ }
  }
  if (!data.ai) data.ai = { endpoint: "", key: "", model: "gpt-3.5-turbo" };
  if (!data.currentPageId || !data.pages[data.currentPageId]) {
    const id = uid();
    data.pages[id] = { title: "Untitled", blocks: [] };
    data.currentPageId = id;
    saveData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  return "id_" + Math.random().toString(36).substr(2, 9);
}

// ==================== DOM refs ====================
const pagesListEl     = document.getElementById("pages-list");
const addPageBtn      = document.getElementById("add-page");
const pageTitleEl     = document.getElementById("current-page-title");
const blocksContainer = document.getElementById("blocks-container");
const palette         = document.getElementById("command-palette");

// AI Settings modal
const aiSettingsBtn   = document.getElementById("ai-settings-btn");
const aiSettingsModal = document.getElementById("ai-settings-modal");
const aiEndpointIn    = document.getElementById("ai-endpoint");
const aiKeyIn         = document.getElementById("ai-key");
const aiModelIn       = document.getElementById("ai-model");
const aiSaveBtn       = document.getElementById("ai-save");
const aiCancelBtn     = document.getElementById("ai-cancel");

// AI Prompt modal
const aiPromptBtn     = document.getElementById("ai-prompt-btn");
const aiPromptModal   = document.getElementById("ai-prompt-modal");
const aiPromptInput   = document.getElementById("ai-prompt-input");
const aiPromptSend    = document.getElementById("ai-prompt-send");
const aiPromptInsert  = document.getElementById("ai-prompt-insert");
const aiPromptCancel  = document.getElementById("ai-prompt-cancel");
const aiResponseArea  = document.getElementById("ai-response-area");

// ==================== Pages ====================
function renderPages() {
  pagesListEl.innerHTML = "";
  Object.entries(data.pages).forEach(([id, page]) => {
    const li = document.createElement("li");
    li.textContent = page.title || "Untitled";
    li.dataset.id = id;
    if (id === data.currentPageId) li.classList.add("active");
    li.addEventListener("click", () => switchPage(id));
    pagesListEl.appendChild(li);
  });
}

function switchPage(id) {
  data.currentPageId = id;
  saveData();
  renderPages();
  renderBlocks();
}

addPageBtn.addEventListener("click", () => {
  const id = uid();
  data.pages[id] = { title: "New Page", blocks: [] };
  data.currentPageId = id;
  saveData();
  renderPages();
  renderBlocks();
});

// ==================== Page Title ====================
pageTitleEl.addEventListener("input", () => {
  const page = data.pages[data.currentPageId];
  if (!page) return;
  page.title = pageTitleEl.textContent.trim() || "Untitled";
  saveData();
  renderPages();
});

// ==================== Blocks ====================
function renderBlocks() {
  const page = data.pages[data.currentPageId];
  if (!page) return;
  pageTitleEl.textContent = page.title;
  blocksContainer.innerHTML = "";

  page.blocks.forEach((blk, idx) => {
    blocksContainer.appendChild(buildBlockEl(blk, idx));
  });

  // Always have an empty paragraph at the end so users can keep typing
  if (page.blocks.length === 0 || lastBlockType(page) !== "paragraph") {
    page.blocks.push({ type: "paragraph", content: "" });
    saveData();
    blocksContainer.appendChild(buildBlockEl(page.blocks[page.blocks.length - 1], page.blocks.length - 1));
  }
}

function lastBlockType(page) {
  return page.blocks.length ? page.blocks[page.blocks.length - 1].type : null;
}

// ==================== Build a single block element ====================
function buildBlockEl(block, index) {
  let el;

  switch (block.type) {
    case "heading-1":
      el = makeEditable("div", "block");
      el.innerHTML = "<h1>" + esc(block.content) + "</h1>";
      break;

    case "heading-2":
      el = makeEditable("div", "block");
      el.innerHTML = "<h2>" + esc(block.content) + "</h2>";
      break;

    case "heading-3":
      el = makeEditable("div", "block");
      el.innerHTML = "<h3>" + esc(block.content) + "</h3>";
      break;

    case "toggle-list":
      el = buildToggleEl(block, index);
      break;

    case "bulleted-list":
      el = makeEditable("div", "block bulleted-item");
      el.textContent = block.content;
      break;

    case "table":
      el = buildTableEl(block, index);
      break;

    case "divider":
      el = document.createElement("div");
      el.className = "block";
      el.innerHTML = '<hr class="divider-block">';
      el.dataset.idx = index;
      return el; // no editing, no AI button

    default: // paragraph
      el = makeEditable("div", "block");
      el.textContent = block.content;
      break;
  }

  el.dataset.idx = index;

  // Per-block AI button
  if (block.type !== "divider") {
    const aiBtn = document.createElement("span");
    aiBtn.className = "ai-send";
    aiBtn.textContent = "🤖";
    aiBtn.title = "Send block to AI";
    aiBtn.addEventListener("click", (e) => { e.stopPropagation(); sendBlockToAI(index); });
    el.appendChild(aiBtn);
  }

  // Block keyboard & input handlers
  if (block.type !== "toggle-list" && block.type !== "table" && block.type !== "divider") {
    el.addEventListener("keydown", (e) => onBlockKeyDown(e, el, block, index));
    el.addEventListener("input", () => onBlockInput(el, block));
  }

  return el;
}

function makeEditable(tag, cls) {
  const el = document.createElement(tag);
  el.className = cls;
  el.contentEditable = "true";
  return el;
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ==================== Toggle List ====================
function buildToggleEl(block, index) {
  if (!block.children) block.children = [{ content: "" }];

  const wrapper = document.createElement("div");
  wrapper.className = "block toggle-wrapper";
  wrapper.dataset.idx = index;

  // Header row
  const header = document.createElement("div");
  header.className = "toggle-header";

  const arrow = document.createElement("span");
  arrow.className = "toggle-arrow" + (block.open ? " open" : "");
  arrow.textContent = "▸";

  const content = document.createElement("span");
  content.className = "toggle-content";
  content.contentEditable = "true";
  content.textContent = block.content || "";
  content.addEventListener("input", () => { block.content = content.textContent; saveData(); });
  content.addEventListener("keydown", (e) => {
    if (e.key === "/") {
      setTimeout(() => { if (content.textContent.trim() === "/") { content.textContent = ""; openPalette(wrapper, index); } }, 0);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Add a child
      block.children.push({ content: "" });
      block.open = true;
      saveData();
      renderBlocks();
      // Focus last child
      const wrapperNew = blocksContainer.querySelector(`[data-idx="${index}"]`);
      const kids = wrapperNew.querySelectorAll(".toggle-child");
      if (kids.length) kids[kids.length - 1].focus();
    }
  });

  header.appendChild(arrow);
  header.appendChild(content);
  wrapper.appendChild(header);

  // Children container
  const childrenDiv = document.createElement("div");
  childrenDiv.className = "toggle-children" + (block.open ? "" : " collapsed");

  block.children.forEach((child, ci) => {
    const childEl = document.createElement("div");
    childEl.className = "toggle-child";
    childEl.contentEditable = "true";
    childEl.textContent = child.content || "";
    childEl.addEventListener("input", () => { child.content = childEl.textContent; saveData(); });
    childEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        block.children.splice(ci + 1, 0, { content: "" });
        saveData();
        renderBlocks();
        const wrapperNew = blocksContainer.querySelector(`[data-idx="${index}"]`);
        const kids = wrapperNew.querySelectorAll(".toggle-child");
        if (kids[ci + 1]) kids[ci + 1].focus();
      }
      if (e.key === "Backspace" && childEl.textContent === "" && block.children.length > 1) {
        e.preventDefault();
        block.children.splice(ci, 1);
        saveData();
        renderBlocks();
      }
    });
    childrenDiv.appendChild(childEl);
  });

  wrapper.appendChild(childrenDiv);

  // Toggle open/close on arrow click
  arrow.addEventListener("click", (e) => {
    e.stopPropagation();
    block.open = !block.open;
    arrow.classList.toggle("open", block.open);
    childrenDiv.classList.toggle("collapsed", !block.open);
    saveData();
  });

  return wrapper;
}

// ==================== Table ====================
function buildTableEl(block, index) {
  if (!block.rows) block.rows = [["", ""], ["", ""]];

  const wrapper = document.createElement("div");
  wrapper.className = "block";
  wrapper.dataset.idx = index;

  const table = document.createElement("table");
  table.className = "table-block";

  block.rows.forEach((row, ri) => {
    const tr = document.createElement("tr");
    row.forEach((cell, ci) => {
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.textContent = cell;
      td.addEventListener("input", () => { block.rows[ri][ci] = td.textContent; saveData(); });
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  wrapper.appendChild(table);

  // Add row / col buttons
  const actions = document.createElement("div");
  actions.className = "table-actions";

  const addRow = document.createElement("button");
  addRow.textContent = "＋ Row";
  addRow.addEventListener("click", () => {
    block.rows.push(new Array(block.rows[0].length).fill(""));
    saveData();
    renderBlocks();
  });

  const addCol = document.createElement("button");
  addCol.textContent = "＋ Column";
  addCol.addEventListener("click", () => {
    block.rows.forEach(r => r.push(""));
    saveData();
    renderBlocks();
  });

  actions.appendChild(addRow);
  actions.appendChild(addCol);
  wrapper.appendChild(actions);

  return wrapper;
}

// ==================== Block keyboard ====================
function onBlockKeyDown(e, el, block, idx) {
  const page = data.pages[data.currentPageId];

  if (e.key === "Enter") {
    e.preventDefault();
    const newBlock = { type: "paragraph", content: "" };
    page.blocks.splice(idx + 1, 0, newBlock);
    saveData();
    renderBlocks();
    const next = blocksContainer.querySelector(`[data-idx="${idx + 1}"]`);
    if (next) next.focus();
    return;
  }

  if (e.key === "Backspace" && el.textContent === "" && page.blocks.length > 1) {
    e.preventDefault();
    page.blocks.splice(idx, 1);
    saveData();
    renderBlocks();
    const prev = blocksContainer.querySelector(`[data-idx="${Math.max(0, idx - 1)}"]`);
    if (prev) prev.focus();
    return;
  }

  // Slash command detection
  if (e.key === "/") {
    setTimeout(() => {
      if (el.textContent.trim() === "/") {
        el.textContent = "";
        block.content = "";
        openPalette(el, idx);
      }
    }, 0);
  }
}

function onBlockInput(el, block) {
  if (block.type.startsWith("heading")) {
    block.content = el.textContent;
  } else {
    block.content = el.textContent;
  }
  saveData();
}

// ==================== Slash Command Palette ====================
let paletteTarget = null;
let paletteIdx = null;
let paletteHighlight = 0;

function openPalette(el, idx) {
  paletteTarget = el;
  paletteIdx = idx;
  paletteHighlight = 0;

  const rect = el.getBoundingClientRect();
  palette.style.top = (rect.bottom + 4) + "px";
  palette.style.left = rect.left + "px";
  palette.classList.remove("hidden");

  highlightPaletteItem();

  // Close on outside click (deferred so current click doesn't close it)
  setTimeout(() => {
    document.addEventListener("click", closePaletteOutside);
    document.addEventListener("keydown", paletteKeyHandler);
  }, 10);
}

function closePalette() {
  palette.classList.add("hidden");
  paletteTarget = null;
  paletteIdx = null;
  document.removeEventListener("click", closePaletteOutside);
  document.removeEventListener("keydown", paletteKeyHandler);
}

function closePaletteOutside(e) {
  if (!palette.contains(e.target)) closePalette();
}

function paletteKeyHandler(e) {
  const items = palette.querySelectorAll("li");
  if (e.key === "ArrowDown") { e.preventDefault(); paletteHighlight = (paletteHighlight + 1) % items.length; highlightPaletteItem(); }
  if (e.key === "ArrowUp")   { e.preventDefault(); paletteHighlight = (paletteHighlight - 1 + items.length) % items.length; highlightPaletteItem(); }
  if (e.key === "Enter")     { e.preventDefault(); items[paletteHighlight]?.click(); }
  if (e.key === "Escape")    { closePalette(); }
}

function highlightPaletteItem() {
  const items = palette.querySelectorAll("li");
  items.forEach((li, i) => li.classList.toggle("active", i === paletteHighlight));
}

// Palette item clicks
palette.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li || !li.dataset.cmd) return;
  applyCommand(li.dataset.cmd);
  closePalette();
});

function applyCommand(cmd) {
  const page = data.pages[data.currentPageId];
  if (!page) return;

  if (cmd === "new-page") {
    addPageBtn.click();
    return;
  }

  const idx = paletteIdx;
  if (idx == null || idx < 0 || idx >= page.blocks.length) return;
  const block = page.blocks[idx];

  switch (cmd) {
    case "heading-1":     block.type = "heading-1"; block.content = block.content || ""; break;
    case "heading-2":     block.type = "heading-2"; block.content = block.content || ""; break;
    case "heading-3":     block.type = "heading-3"; block.content = block.content || ""; break;
    case "toggle-list":   block.type = "toggle-list"; block.content = block.content || ""; block.children = [{ content: "" }]; block.open = true; break;
    case "bulleted-list": block.type = "bulleted-list"; block.content = block.content || ""; break;
    case "table":         block.type = "table"; block.rows = [["", ""], ["", ""]]; break;
    case "divider":       block.type = "divider"; break;
    case "paragraph":     block.type = "paragraph"; block.content = block.content || ""; break;
  }

  saveData();
  renderBlocks();

  // Focus the transformed block
  const newEl = blocksContainer.querySelector(`[data-idx="${idx}"]`);
  if (newEl) {
    const editable = newEl.querySelector("[contenteditable]") || newEl;
    setTimeout(() => editable.focus(), 0);
  }
}

// ==================== AI Settings ====================
aiSettingsBtn.addEventListener("click", () => {
  aiEndpointIn.value = data.ai.endpoint || "";
  aiKeyIn.value = data.ai.key || "";
  aiModelIn.value = data.ai.model || "gpt-3.5-turbo";
  aiSettingsModal.classList.remove("hidden");
});
aiCancelBtn.addEventListener("click", () => aiSettingsModal.classList.add("hidden"));
aiSaveBtn.addEventListener("click", () => {
  data.ai.endpoint = aiEndpointIn.value.trim();
  data.ai.key = aiKeyIn.value.trim();
  data.ai.model = aiModelIn.value.trim() || "gpt-3.5-turbo";
  saveData();
  aiSettingsModal.classList.add("hidden");
});

// ==================== AI Prompt (free call UI) ====================
let lastAIResponse = "";

aiPromptBtn.addEventListener("click", () => {
  aiPromptInput.value = "";
  aiResponseArea.textContent = "";
  aiResponseArea.classList.add("hidden");
  aiPromptInsert.classList.add("hidden");
  aiPromptModal.classList.remove("hidden");
  aiPromptInput.focus();
});
aiPromptCancel.addEventListener("click", () => aiPromptModal.classList.add("hidden"));

aiPromptSend.addEventListener("click", async () => {
  const prompt = aiPromptInput.value.trim();
  if (!prompt) return;

  aiPromptSend.disabled = true;
  aiPromptSend.textContent = "Thinking…";
  aiResponseArea.textContent = "";
  aiResponseArea.classList.remove("hidden");

  try {
    if (data.ai.endpoint && data.ai.key) {
      // Real AI call
      const resp = await fetch(data.ai.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + data.ai.key,
        },
        body: JSON.stringify({
          model: data.ai.model || "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const json = await resp.json();
      lastAIResponse = json.choices?.[0]?.message?.content ?? "[No response from AI]";
    } else {
      // Free placeholder response
      lastAIResponse = "AI response placeholder:\n\nYou asked: \"" + prompt + "\"\n\nTo get real AI responses, click ⚙️ and configure your endpoint & API key.";
    }
  } catch (err) {
    console.error(err);
    lastAIResponse = "[Error] " + err.message;
  }

  aiResponseArea.textContent = lastAIResponse;
  aiPromptInsert.classList.remove("hidden");
  aiPromptSend.disabled = false;
  aiPromptSend.textContent = "Send";
});

aiPromptInsert.addEventListener("click", () => {
  if (!lastAIResponse) return;
  const page = data.pages[data.currentPageId];
  page.blocks.push({ type: "paragraph", content: lastAIResponse });
  saveData();
  renderBlocks();
  aiPromptModal.classList.add("hidden");
});

// ==================== Per-block AI send ====================
async function sendBlockToAI(blockIdx) {
  const page = data.pages[data.currentPageId];
  const block = page.blocks[blockIdx];
  if (!block) return;

  const text = block.content || "(empty block)";

  if (!data.ai.endpoint || !data.ai.key) {
    alert("Please configure your AI endpoint and key first (click ⚙️).");
    return;
  }

  try {
    const resp = await fetch(data.ai.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + data.ai.key,
      },
      body: JSON.stringify({
        model: data.ai.model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: text }],
      }),
    });
    const json = await resp.json();
    const reply = json.choices?.[0]?.message?.content ?? "[No response]";
    page.blocks.splice(blockIdx + 1, 0, { type: "paragraph", content: reply });
    saveData();
    renderBlocks();
  } catch (err) {
    console.error(err);
    alert("AI request failed: " + err.message);
  }
}

// ==================== Init ====================
loadData();
renderPages();
renderBlocks();
