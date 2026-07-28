/**
 * Documents Component
 * Full CRUD — add, edit (double-click), delete.
 * Persisted to localStorage. Starts empty.
 * A generic reference list — name/label + path.
 */

const STORAGE_KEY = "aura_docs";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(docs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

function render(docs, listEl, inputEl, pathInputEl) {
  listEl.innerHTML = "";

  if (docs.length === 0) {
    const empty = document.createElement("li");
    empty.className = "todo-empty";
    empty.textContent = "No documents yet. Add one above.";
    listEl.appendChild(empty);
    document.getElementById("stat-files").textContent = "0";
    return;
  }

  for (const doc of docs) {
    const li = document.createElement("li");
    li.className = "file-item";

    // Icon
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "file-icon");
    icon.setAttribute("viewBox", "0 0 14 18");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.5");
    icon.innerHTML =
      '<path d="M2 1.5H9L12.5 5V16C12.5 16.2761 12.2761 16.5 12 16.5H2C1.72386 16.5 1.5 16.2761 1.5 16V2C1.5 1.72386 1.72386 1.5 2 1.5Z" stroke-linejoin="round"/><path d="M9 1.5V5H12.5" stroke-linejoin="round"/>';

    // Name (editable on double-click)
    const nameSpan = document.createElement("span");
    nameSpan.className = "file-name";
    nameSpan.innerHTML = `<span style="color:var(--text-secondary);font-weight:400">${escapeHtml(doc.label)}</span>`;
    if (doc.path) {
      nameSpan.innerHTML +=
        ` <span style="color:var(--text-quaternary);font-weight:400">— ${escapeHtml(doc.path)}</span>`;
    }
    nameSpan.addEventListener("dblclick", () => {
      startInlineEdit(li, doc, docs, listEl, inputEl, pathInputEl);
    });

    // Delete
    const del = document.createElement("button");
    del.className = "todo-delete";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      const idx = docs.indexOf(doc);
      if (idx > -1) {
        docs.splice(idx, 1);
        save(docs);
        render(docs, listEl, inputEl, pathInputEl);
        updateCount(docs);
      }
    });

    li.appendChild(icon);
    li.appendChild(nameSpan);
    li.appendChild(del);
    listEl.appendChild(li);
  }

  updateCount(docs);
  inputEl.focus();
}

function startInlineEdit(li, doc, docs, listEl, inputEl, pathInputEl) {
  // Replace content with inline inputs
  li.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;flex:1;gap:8px;align-items:center;width:100%;";

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.value = doc.label;
  labelInput.style.cssText =
    "flex:1;background:var(--bg-active);border:1px solid var(--border-default);border-radius:4px;padding:4px 8px;font-size:0.85rem;color:var(--text-primary);font-family:var(--font-sans);outline:none;";
  labelInput.autocomplete = "off";
  labelInput.placeholder = "Label";

  const pathInput = document.createElement("input");
  pathInput.type = "text";
  pathInput.value = doc.path || "";
  pathInput.style.cssText =
    "flex:1;background:var(--bg-active);border:1px solid var(--border-default);border-radius:4px;padding:4px 8px;font-size:0.85rem;color:var(--text-primary);font-family:var(--font-sans);outline:none;";
  pathInput.autocomplete = "off";
  pathInput.placeholder = "Path (optional)";

  const saveBtn = document.createElement("button");
  saveBtn.className = "primary-btn";
  saveBtn.textContent = "Save";
  saveBtn.style.padding = "4px 12px";
  saveBtn.style.fontSize = "0.8rem";

  wrapper.appendChild(labelInput);
  wrapper.appendChild(pathInput);
  wrapper.appendChild(saveBtn);
  li.appendChild(wrapper);

  labelInput.focus();
  labelInput.select();

  function finish() {
    const label = labelInput.value.trim();
    const path = pathInput.value.trim();
    if (label) {
      doc.label = label;
      doc.path = path;
      save(docs);
    }
    render(docs, listEl, inputEl, pathInputEl);
    updateCount(docs);
  }

  saveBtn.addEventListener("click", finish);
  labelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pathInput.focus();
    }
    if (e.key === "Escape") finish();
  });
  pathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish();
    }
    if (e.key === "Escape") finish();
  });
}

function updateCount(docs) {
  document.getElementById("stat-files").textContent = docs.length;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function initDocuments() {
  const input = document.getElementById("doc-input");
  const pathInput = document.getElementById("doc-path-input");
  const addBtn = document.getElementById("doc-add");
  const listEl = document.getElementById("files-list");

  let docs = load();
  render(docs, listEl, input, pathInput);

  function add() {
    const label = input.value.trim();
    if (!label) return;
    docs.push({ label, path: pathInput.value.trim() });
    save(docs);
    render(docs, listEl, input, pathInput);
    updateCount(docs);
    input.value = "";
    pathInput.value = "";
  }

  addBtn.addEventListener("click", add);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pathInput.focus();
    }
  });
  pathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  });
}
