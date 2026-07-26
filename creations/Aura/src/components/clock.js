/**
 * Clock Component
 * Live time display with smooth second updates.
 */

export function initClock() {
  const timeEl = document.getElementById("clock-time");
  const secondsEl = document.getElementById("clock-seconds");
  const dateEl = document.getElementById("clock-date");
  const liveDateEl = document.getElementById("live-date");
  const greetingEl = document.getElementById("greeting");

  function getGreeting(h) {
    if (h < 5) return "Late night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Good night";
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function update() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();

    timeEl.textContent = `${pad(h)}:${pad(m)}`;
    secondsEl.textContent = pad(s);

    const opts = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const formatted = now.toLocaleDateString("en-US", opts);
    dateEl.textContent = formatted;
    liveDateEl.textContent = formatted;
    greetingEl.textContent = getGreeting(h);

    requestAnimationFrame(() => {
      setTimeout(update, 1000 - (Date.now() % 1000));
    });
  }

  const now = new Date();
  greetingEl.textContent = getGreeting(now.getHours());

  update();

  setInterval(() => {
    const h = new Date().getHours();
    greetingEl.textContent = getGreeting(h);
  }, 60_000);
}
