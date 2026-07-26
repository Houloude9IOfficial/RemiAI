/**
 * Todos Component
 * Full CRUD — add, check/uncheck, edit (double-click), delete.
 * Persisted to localStorage. Nothing hardcoded.
 */

const STORAGE_KEY = "aura_todos";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(todos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function stats(todos) {
  const total = todos.length;
  const done = todos.filter((t) => t.done).length;
  document.getElementById("stat-todos").textContent = total;
  document.getElementById("stat-done").textContent = done;
  document.getElementById("todo-count").textContent = `${done}/${total}`;
}

function render(todos, listEl, inputEl) {
  const active = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);
  const sorted = [...active, ...completed];

  listEl.innerHTML = "";

  if (sorted.length === 0) {
    const empty = document.createElement("li");
    empty.className = "todo-empty";
    empty.textContent = "No tasks yet. Add one above.";
    listEl.appendChild(empty);
    return;
  }

  for (const todo of sorted) {
    const li = document.createElement("li");
    li.className = `todo-item${todo.done ? " done" : ""}`;

    // Checkbox
    const check = document.createElement("button");
    check.className = `todo-check${todo.done ? " checked" : ""}`;
    check.innerHTML =
      `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4 7L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    check.addEventListener("click", () => {
      todo.done = !todo.done;
      save(todos);
      render(todos, listEl, inputEl);
      stats(todos);
    });

    // Text (with inline edit on double-click)
    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = todo.text;
    text.addEventListener("dblclick", () => {
      const editInput = document.createElement("input");
      editInput.type = "text";
      editInput.className = "todo-text";
      editInput.value = todo.text;
      editInput.style.background = "var(--bg-active)";
      editInput.style.border = "1px solid var(--border-default)";
      editInput.style.borderRadius = "4px";
      editInput.style.padding = "2px 6px";
      editInput.style.fontSize = "0.9rem";
      editInput.style.color = "var(--text-primary)";
      editInput.style.fontFamily = "var(--font-sans)";
      editInput.style.outline = "none";
      editInput.autocomplete = "off";

      text.replaceWith(editInput);
      editInput.focus();
      editInput.select();

      function finishEdit() {
        const val = editInput.value.trim();
        if (val) {
          todo.text = val;
          save(todos);
        }
        render(todos, listEl, inputEl);
        stats(todos);
      }

      editInput.addEventListener("blur", finishEdit);
      editInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          editInput.blur();
        }
        if (e.key === "Escape") {
          editInput.value = todo.text;
          editInput.blur();
        }
      });
    });

    // Delete button
    const del = document.createElement("button");
    del.className = "todo-delete";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      const idx = todos.indexOf(todo);
      if (idx > -1) {
        todos.splice(idx, 1);
        save(todos);
        render(todos, listEl, inputEl);
        stats(todos);
      }
    });

    li.appendChild(check);
    li.appendChild(text);
    li.appendChild(del);
    listEl.appendChild(li);
  }

  inputEl.focus();
}

export function initTodos() {
  const input = document.getElementById("todo-input");
  const addBtn = document.getElementById("todo-add");
  const listEl = document.getElementById("todo-list");

  let todos = load();
  render(todos, listEl, input);
  stats(todos);

  function add() {
    const text = input.value.trim();
    if (!text) return;
    todos.push({ text, done: false, createdAt: Date.now() });
    save(todos);
    render(todos, listEl, input);
    stats(todos);
    input.value = "";
  }

  addBtn.addEventListener("click", add);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") add();
  });
}
