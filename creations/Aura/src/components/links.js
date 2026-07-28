/**
 * Links Component
 * Full CRUD — add, edit (double-click), delete.
 * Persisted to localStorage. Starts empty.
 */

const STORAGE_KEY = "aura_links";

let editingIndex = -1;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(links) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

function render(links, gridEl) {
  gridEl.innerHTML = "";

  for (const [i, link] of links.entries()) {
    const card = document.createElement("a");
    card.className = "link-card";
    card.href = link.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const title = document.createElement("span");
    title.className = "link-card-title";
    title.textContent = link.title;

    const url = document.createElement("span");
    url.className = "link-card-url";
    try {
      const u = new URL(link.url);
      url.textContent = u.hostname;
    } catch {
      url.textContent = link.url;
    }

    // Edit on double-click
    card.addEventListener("dblclick", (e) => {
      e.preventDefault();
      openEditModal(links, i, gridEl);
    });

    const del = document.createElement("button");
    del.className = "link-delete";
    del.textContent = "✕";
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      links.splice(i, 1);
      save(links);
      render(links, gridEl);
      updateCount(links);
    });

    card.appendChild(title);
    card.appendChild(url);
    card.appendChild(del);
    gridEl.appendChild(card);
  }
}

function updateCount(links) {
  document.getElementById("stat-links").textContent = links.length;
}

function openAddModal(modalTitle, modalUrl, overlay, links, gridEl) {
  editingIndex = -1;
  modalTitle.value = "";
  modalUrl.value = "";
  document.querySelector("#link-modal h3").textContent = "Add Link";
  overlay.classList.add("open");
  modalTitle.focus();
}

function openEditModal(links, index, gridEl) {
  editingIndex = index;
  const link = links[index];
  const modalTitle = document.getElementById("link-modal-title");
  const modalUrl = document.getElementById("link-modal-url");
  const overlay = document.getElementById("link-modal-overlay");

  modalTitle.value = link.title;
  modalUrl.value = link.url;
  document.querySelector("#link-modal h3").textContent = "Edit Link";
  overlay.classList.add("open");
  modalTitle.focus();
  modalTitle.select();
}

function closeModal(overlay) {
  overlay.classList.remove("open");
  editingIndex = -1;
}

function saveModal(links, gridEl, overlay) {
  const modalTitle = document.getElementById("link-modal-title");
  const modalUrl = document.getElementById("link-modal-url");
  const title = modalTitle.value.trim();
  let url = modalUrl.value.trim();
  if (!title || !url) return;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  if (editingIndex > -1) {
    links[editingIndex] = { title, url };
  } else {
    links.push({ title, url });
  }

  save(links);
  render(links, gridEl);
  updateCount(links);
  closeModal(overlay);
}

export function initLinks() {
  const gridEl = document.getElementById("links-grid");
  const addBtn = document.getElementById("link-add-btn");
  const overlay = document.getElementById("link-modal-overlay");
  const modalTitle = document.getElementById("link-modal-title");
  const modalUrl = document.getElementById("link-modal-url");
  const modalSave = document.getElementById("link-modal-save");
  const modalCancel = document.getElementById("link-modal-cancel");

  let links = load();
  render(links, gridEl);
  updateCount(links);

  addBtn.addEventListener("click", () =>
    openAddModal(modalTitle, modalUrl, overlay, links, gridEl)
  );
  modalSave.addEventListener("click", () =>
    saveModal(links, gridEl, overlay)
  );
  modalCancel.addEventListener("click", () => closeModal(overlay));

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal(overlay);
  });

  modalUrl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveModal(links, gridEl, overlay);
  });
  modalTitle.addEventListener("keydown", (e) => {
    if (e.key === "Enter") modalUrl.focus();
  });
}
