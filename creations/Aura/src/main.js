/**
 * AURA — Main Entry Point
 * Dark monochrome personal dashboard.
 * All data is user-managed via CRUD, nothing hardcoded.
 */

import { initClock } from "./components/clock.js";
import { initTodos } from "./components/todos.js";
import { initDocuments } from "./components/documents.js";
import { initLinks } from "./components/links.js";

// --- Navigation ---
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".section");

  function switchSection(sectionId) {
    navItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.section === sectionId);
    });
    sections.forEach((section) => {
      section.classList.toggle("active", section.id === `section-${sectionId}`);
    });
  }

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchSection(item.dataset.section);
    });
  });
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initClock();
  initTodos();
  initDocuments();
  initLinks();
});
