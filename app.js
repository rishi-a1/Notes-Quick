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
    data.pages[id] = { title: "", blocks: [] };
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

const aiSettingsBtn   = document.getElementById("ai-settings-btn");
const aiSettingsModal = document.getElementById("ai-settings-modal");
const aiEndpointIn    = document.getElementById("ai-endpoint");
const aiKeyIn         = document.getElementById("ai-key");
const aiModelIn       = document.getElementById("ai-model");
const aiSaveBtn       = document.getElementById("ai-save");
const aiCancelBtn     = document.getElementById("ai-cancel");

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
  data.pages[id] = { title: "", blocks: [] };
  data.currentPageId = id;
  saveData();
  renderPages();
  renderBlocks();
  setTimeout(() => pageTitleEl.focus(), 50);
});

// ==================== Page Title (Notion-style) ====================
pageTitleEl.addEventListener("input", () => {
  const page = data.pages[data.currentPageId];
  if (!page) return;
  page.title = pageTitleEl.textContent.trim();
  saveData();
  renderPages();
});

pageTitleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const page = data.pages[data.currentPageId];
    if (page) {
      page.title = pageTitleEl.textContent.trim() || "Untitled";
      saveData();
      renderPages();
    }
    ensureTrailingParagraph();
    renderBlocks();
    focusBlock(0);
  }
});

// ==================== Click empty space → focus last block ====================
blocksContainer.addEventListener("click", (e) => {
  // Only trigger if the click was directly on the container, not on a child block
  if (e.target === blocksContainer) {
    const page = data.pages[data.currentPageId];
    if (!page) return;
    ensureTrailingParagraph();
    // If the last block is empty, focus it. Otherwise create a new one.
    const last = page.blocks[page.blocks.length - 1];
    if (last && last.type === "paragraph" && (last.content || "").trim() === "") {
      renderBlocks();
      focusBlock(page.blocks.length - 1);
    } else {
      page.blocks.push({ type: "paragraph", content: "" });
      saveData();
      renderBlocks();
      focusBlock(page.blocks.length - 1);
    }
  }
});

// ==================== Blocks ====================
function ensureTrailingParagraph() {
  const page = data.pages[data.currentPageId];
  if (!page) return;
  if (page.blocks.length === 0 || page.blocks[page.blocks.length - 1].type !== "paragraph"
      || (page.blocks[page.blocks.length - 1].content || "").trim() !== "") {
    page.blocks.push({ type: "paragraph", content: "" });
    saveData();
  }
}

function renderBlocks() {
  const page = data.pages[data.currentPageId];
  if (!page) return;
  pageTitleEl.textContent = page.title;
  blocksContainer.innerHTML = "";
  ensureTrailingParagraph();
  page.blocks.forEach((blk, idx) => {
    blocksContainer.appendChild(buildBlockEl(blk, idx));
  });
}

function focusBlock(idx) {
  setTimeout(() => {
    const el = blocksContainer.querySelector(`[data-idx="${idx}"]`);
    if (!el) return;
    const editable = el.querySelector(".block-content") || el.querySelector("[contenteditable]") || el;
    editable.focus();
    // Place cursor at end
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editable);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, 20);
}

// ==================== Build block element ====================
// Structure:  <div class="block" data-idx>
//               <div class="block-content" contenteditable> ... </div>
//               <span class="ai-send">🤖</span>   ← OUTSIDE the editable area
//             </div>

function buildBlockEl(block, index) {
  let wrapper;

  switch (block.type) {
    case "heading-1":
    case "heading-2":
    case "heading-3":
      wrapper = buildHeadingEl(block, index);
      break;
    case "toggle-list":
      wrapper = buildToggleEl(block, index);
      break;
    case "bulleted-list":
      wrapper = buildBulletEl(block, index);
      break;
    case "table":
      wrapper = buildTableEl(block, index);
      break;
    case "divider":
      wrapper = document.createElement("div");
      wrapper.className = "block";
      wrapper.dataset.idx = index;
      wrapper.innerHTML = '<hr class="divider-block">';
      return wrapper;
    default: // paragraph
      wrapper = buildParagraphEl(block, index);
      break;
  }

  wrapper.dataset.idx = index;

  // AI send button – appended to wrapper, OUTSIDE the editable content
  if (block.type !== "divider") {
    const aiBtn = document.createElement("span");
    aiBtn.className = "ai-send";
    aiBtn.textContent = "🤖";
    aiBtn.title = "Send block to AI";
    aiBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendBlockToAI(index);
    });
    wrapper.appendChild(aiBtn);
  }

  return wrapper;
}

// ---------- Paragraph ----------
function buildParagraphEl(block, index) {
  const wrapper = document.createElement("div");
  wrapper.className = "block";

  const content = document.createElement("div");
  content.className = "block-content";
  content.contentEditable = "true";
  content.textContent = block.content || "";
  content.addEventListener("input", () => { block.content = content.textContent; saveData(); });
  content.addEventListener("keydown", (e) => onBlockKeyDown(e, content, block, index));

  wrapper.appendChild(content);
  return wrapper;
}

// ---------- Heading ----------
function buildHeadingEl(block, index) {
  const wrapper = document.createElement("div");
  wrapper.className = "block";

  const tag = block.type === "heading-1" ? "h1" : block.type === "heading-2" ? "h2" : "h3";
  const content = document.createElement(tag);
  content.className = "block-content";
  content.contentEditable = "true";
  content.textContent = block.content || "";
  content.addEventListener("input", () => { block.content = content.textContent; saveData(); });
  content.addEventListener("keydown", (e) => onBlockKeyDown(e, content, block, index));

  wrapper.appendChild(content);
  return wrapper;
}

// ---------- Bulleted list item ----------
function buildBulletEl(block, index) {
  const wrapper = document.createElement("div");
  wrapper.className = "block bulleted-item";

  const content = document.createElement("div");
  content.className = "block-content";
  content.contentEditable = "true";
  content.textContent = block.content || "";
  content.addEventListener("input", () => { block.content = content.textContent; saveData(); });
  content.addEventListener("keydown", (e) => onBlockKeyDown(e, content, block, index));

  wrapper.appendChild(content);
  return wrapper;
}

// ---------- Toggle list ----------
function buildToggleEl(block, index) {
  if (!block.children) block.children = [{ content: "" }];

  const wrapper = document.createElement("div");
  wrapper.className = "block toggle-wrapper";

  const header = document.createElement("div");
  header.className = "toggle-header";

  const arrow = document.createElement("span");
  arrow.className = "toggle-arrow" + (block.open ? " open" : "");
  arrow.textContent = "▸";
  arrow.addEventListener("click", (e) => {
    e.stopPropagation();
    block.open = !block.open;
    arrow.classList.toggle("open", block.open);
    childrenDiv.classList.toggle("collapsed", !block.open);
    saveData();
  });

  const content = document.createElement("span");
  content.className = "toggle-content block-content";
  content.contentEditable = "true";
  content.textContent = block.content || "";
  content.addEventListener("input", () => { block.content = content.textContent; saveData(); });
  content.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      block.children.push({ content: "" });
      block.open = true;
      saveData();
      renderBlocks();
      const w = blocksContainer.querySelector(`[data-idx="${index}"]`);
      const kids = w ? w.querySelectorAll(".toggle-child") : [];
      if (kids.length) kids[kids.length - 1].focus();
    }
  });

  header.appendChild(arrow);
  header.appendChild(content);
  wrapper.appendChild(header);

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
        const w = blocksContainer.querySelector(`[data-idx="${index}"]`);
        const kids = w ? w.querySelectorAll(".toggle-child") : [];
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
  return wrapper;
}

// ---------- Table ----------
function buildTableEl(block, index) {
  if (!block.rows) block.rows = [["", ""], ["", ""]];

  const wrapper = document.createElement("div");
  wrapper.className = "block";

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

  const actions = document.createElement("div");
  actions.className = "table-actions";

  const addRow = document.createElement("button");
  addRow.textContent = "＋ Row";
  addRow.addEventListener("click", () => {
    block.rows.push(new Array(block.rows[0].length).fill(""));
    saveData(); renderBlocks();
  });

  const addCol = document.createElement("button");
  addCol.textContent = "＋ Column";
  addCol.addEventListener("click", () => {
    block.rows.forEach(r => r.push(""));
    saveData(); renderBlocks();
  });

  actions.appendChild(addRow);
  actions.appendChild(addCol);
  wrapper.appendChild(actions);
  return wrapper;
}

// ==================== Block keyboard ====================
function onBlockKeyDown(e, contentEl, block, idx) {
  const page = data.pages[data.currentPageId];

  // SLASH: if block content is empty and user presses "/", open palette
  if (e.key === "/" && contentEl.textContent.trim() === "") {
    e.preventDefault();
    openPalette(contentEl, idx);
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    const newBlock = { type: "paragraph", content: "" };
    page.blocks.splice(idx + 1, 0, newBlock);
    saveData();
    renderBlocks();
    focusBlock(idx + 1);
    return;
  }

  if (e.key === "Backspace" && contentEl.textContent === "" && page.blocks.length > 1) {
    e.preventDefault();
    page.blocks.splice(idx, 1);
    saveData();
    renderBlocks();
    focusBlock(Math.max(0, idx - 1));
    return;
  }

  if (e.key === "ArrowDown") {
    const next = blocksContainer.querySelector(`[data-idx="${idx + 1}"]`);
    if (next) { e.preventDefault(); focusBlock(idx + 1); }
  }
  if (e.key === "ArrowUp" && idx > 0) {
    e.preventDefault();
    focusBlock(idx - 1);
  }
}

// ==================== Slash Command Palette ====================
let paletteTargetEl = null;
let paletteTargetIdx = null;
let paletteHL = 0;

function openPalette(contentEl, idx) {
  paletteTargetEl = contentEl;
  paletteTargetIdx = idx;
  paletteHL = 0;

  const rect = contentEl.getBoundingClientRect();
  palette.style.top = (rect.bottom + 4) + "px";
  palette.style.left = rect.left + "px";
  palette.classList.remove("hidden");
  updatePaletteHL();

  setTimeout(() => {
    document.addEventListener("click", onPaletteOutside);
    document.addEventListener("keydown", onPaletteKey, true); // capture phase
  }, 20);
}

function closePalette() {
  palette.classList.add("hidden");
  document.removeEventListener("click", onPaletteOutside);
  document.removeEventListener("keydown", onPaletteKey, true);
  paletteTargetEl = null;
  paletteTargetIdx = null;
}

function onPaletteOutside(e) {
  if (!palette.contains(e.target)) closePalette();
}

function onPaletteKey(e) {
  const items = palette.querySelectorAll("li");
  if (e.key === "ArrowDown") {
    e.preventDefault(); e.stopPropagation();
    paletteHL = (paletteHL + 1) % items.length;
    updatePaletteHL();
  } else if (e.key === "ArrowUp") {
    e.preventDefault(); e.stopPropagation();
    paletteHL = (paletteHL - 1 + items.length) % items.length;
    updatePaletteHL();
  } else if (e.key === "Enter") {
    e.preventDefault(); e.stopPropagation();
    const cmd = items[paletteHL]?.dataset.cmd;
    if (cmd) applyCommand(cmd);
    closePalette();
  } else if (e.key === "Escape") {
    e.preventDefault(); e.stopPropagation();
    closePalette();
  }
}

function updatePaletteHL() {
  palette.querySelectorAll("li").forEach((li, i) => li.classList.toggle("active", i === paletteHL));
}

palette.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li || !li.dataset.cmd) return;
  applyCommand(li.dataset.cmd);
  closePalette();
});

function applyCommand(cmd) {
  const page = data.pages[data.currentPageId];
  if (!page) return;

  if (cmd === "new-page") { addPageBtn.click(); return; }

  const idx = paletteTargetIdx;
  if (idx == null || idx < 0 || idx >= page.blocks.length) return;
  const block = page.blocks[idx];

  switch (cmd) {
    case "heading-1":     block.type = "heading-1"; break;
    case "heading-2":     block.type = "heading-2"; break;
    case "heading-3":     block.type = "heading-3"; break;
    case "toggle-list":
      block.type = "toggle-list";
      block.children = [{ content: "" }];
      block.open = true;
      break;
    case "bulleted-list": block.type = "bulleted-list"; break;
    case "table":
      block.type = "table";
      block.rows = [["", ""], ["", ""]];
      break;
    case "divider": block.type = "divider"; break;
    case "paragraph": block.type = "paragraph"; break;
  }

  saveData();
  renderBlocks();
  focusBlock(idx);
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

// ==================== AI Prompt ====================
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
      const resp = await fetch(data.ai.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + data.ai.key },
        body: JSON.stringify({ model: data.ai.model, messages: [{ role: "user", content: prompt }] }),
      });
      const json = await resp.json();
      lastAIResponse = json.choices?.[0]?.message?.content ?? "[No response]";
    } else {
      lastAIResponse = "AI placeholder response:\n\nYou asked: \"" + prompt + "\"\n\nTo get real responses, click ⚙️ and add your endpoint & API key.";
    }
  } catch (err) {
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
  saveData(); renderBlocks();
  aiPromptModal.classList.add("hidden");
});

// ==================== Per-block AI ====================
async function sendBlockToAI(blockIdx) {
  const page = data.pages[data.currentPageId];
  const block = page.blocks[blockIdx];
  if (!block) return;
  if (!data.ai.endpoint || !data.ai.key) {
    alert("Configure your AI endpoint & key first (⚙️).");
    return;
  }
  try {
    const resp = await fetch(data.ai.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + data.ai.key },
      body: JSON.stringify({ model: data.ai.model, messages: [{ role: "user", content: block.content || "" }] }),
    });
    const json = await resp.json();
    const reply = json.choices?.[0]?.message?.content ?? "[No response]";
    page.blocks.splice(blockIdx + 1, 0, { type: "paragraph", content: reply });
    saveData(); renderBlocks();
  } catch (err) {
    alert("AI error: " + err.message);
  }
}

// ==================== Init ====================
loadData();
renderPages();
renderBlocks();
