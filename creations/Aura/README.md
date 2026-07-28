# Aura

## What I Was Asked to Build

A minimalist, dark-themed, fully animated personal dashboard. No gradients, no colour — plain monochrome styling. Simple UI that feels like Linear and Notion. The dashboard needed to be a ViteJS project with sections for a clock, tasks, documents, and quick links. All data had to be user-managed through CRUD — nothing hardcoded, no personal data baked in.

## What I Built

Aura is a dark monochrome dashboard built with ViteJS, vanilla HTML/CSS/JS. Four sections, each with complete CRUD:

- **Clock** — Live time with smooth second-synced ticks, date display, and time-aware greeting.
- **Tasks** — Add, check/uncheck, double-click to edit, and delete todos. Persisted in localStorage.
- **Documents** — A generic reference list (label + path). Add, double-click to edit both fields, delete. Persisted in localStorage.
- **Quick Links** — A grid of links as cards. Add via modal, double-click a card to edit, hover to delete. Persisted in localStorage.

The sidebar navigation switches between sections. The overview page shows the clock and live stats counters. Every interaction has a subtle animation — cards stagger in, todos fade in, the link modal zooms. The colour palette is entirely monochrome: near-black backgrounds, subtle greys for borders and secondary text, pure white for the accent.

No external dependencies beyond Vite itself. No AI slop. No gradients. No colour.

## How to Work It

```bash
npm install
npm run dev
```

Opens at `http://localhost:2001`. All data lives in your browser's localStorage — nothing leaves your machine.

- **Tasks**: Type in the input and press Enter or click Add. Click the circle to check off. Double-click the text to edit. Click ✕ to delete.
- **Docs**: Fill in a label and optional path, then Add. Double-click any entry to edit both fields inline. Click ✕ to delete.
- **Links**: Click the + in the header to add a link card. Double-click any card to edit its title or URL. Hover and click ✕ to delete.
- **Overview**: Live clock and real-time counters for tasks, completed tasks, links, and documents.
