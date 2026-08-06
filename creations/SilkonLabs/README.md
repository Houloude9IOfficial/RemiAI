# Silkon Labs

> Building the silicon foundation for AGI.

A production-ready Next.js 15 website for Silkon Labs, featuring a Linear-inspired industrial/metallic design system, complete with models showcase, documentation, blog, careers, and waitlist pages.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS with custom design tokens
- **Animations**: Framer Motion (Linear-style micro-interactions)
- **Language**: TypeScript
- **Package Manager**: pnpm
- **Deployment**: Vercel

## Design System

### Colors (Industrial/Metallic)
- **Canvas**: `#010102` — near-black with cool blue undertone
- **Surface Ladder**: 4 elevation steps (`#0f1011` → `#191a1b`)
- **Copper**: Primary accent (`#e0551a`) — CTAs, focus rings, brand mark
- **Steel**: Secondary accent (`#637385`) — borders, muted elements
- **Platinum**: Tertiary accent (`#707a8e`) — highlights, active states
- **Hairlines**: 1px borders (`#23252a`) — no shadows, geometry does the work

### Typography
- **Display**: Geist/Inter with aggressive negative tracking (−3px at 80px)
- **Body**: Geist/Inter, single voice from display → body
- **Mono**: Geist Mono/JetBrains Mono for code and specs

### Motion
- **Easing**: `cubic-bezier(0.2, 0.8, 0.2, 1)` (Linear signature)
- **Durations**: 150ms default, 300ms page transitions
- **Respects**: `prefers-reduced-motion`

## Project Structure

```
silkon-labs/
├── tokens/                 # Design tokens (colors, typography, spacing)
├── components/
│   ├── ui/                # Primitive components (Button, Card, Input, Badge, Logomark)
│   ├── layout/            # Layout components (Header, Footer, DocsLayout)
│   └── animations/        # Framer Motion wrappers (PageTransition, ScrollReveal, etc.)
├── src/
│   ├── app/               # Next.js App Router pages
│   │   ├── page.tsx       # Landing
│   │   ├── models/        # Models index + Silkon 1T detail
│   │   ├── about/         # About/Team
│   │   ├── careers/       # Careers with filters
│   │   ├── blog/          # Blog + Research + post detail
│   │   ├── docs/          # Documentation with sidebar
│   │   └── waitlist/      # Waitlist form
│   └── globals.css        # Tailwind + CSS variables + components
├── data/                  # Content layer (jobs, posts, docs)
├── tailwind.config.ts     # Tailwind with design tokens
├── next.config.mjs        # Next.js config
└── vercel.json            # Vercel deployment config
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with hero, features, stats, CTA |
| `/models` | Models index (Silkon 1T, 7B, 400M) |
| `/models/silkon-1t` | Flagship model detail (specs, benchmarks, capabilities, use cases) |
| `/about` | Mission, values, team, timeline |
| `/careers` | Job listings with filters, expandable details, benefits |
| `/blog` | Blog index with tag filters, pagination |
| `/research` | Research papers index |
| `/blog/[slug]` | Post detail with related posts |
| `/docs` | Documentation home with quick links |
| `/docs/api` | API reference with endpoints, params, code samples |
| `/waitlist` | Waitlist form with validation, honeypot |

## Getting Started

```bash
# Install dependencies
pnpm install

# Development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint
pnpm lint

# Format
pnpm format
```

## Environment Variables

Create `.env.local`:

```env
# API (for waitlist submissions)
NEXT_PUBLIC_API_URL=https://api.silkonlabs.com
WAITLIST_API_SECRET=your-secret
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

The `vercel.json` includes security headers and caching rules.

### Docker

```bash
docker build -t silkon-labs .
docker run -p 3000:3000 silkon-labs
```

## Design Principles

1. **No AI slop** — No purple gradients, glowing orbs, or floating particles
2. **Precision engineering** — Every element has a calibrated luminance value
3. **Geometry over decoration** — Hairline borders, no shadows
4. **Single chromatic accent** — Copper used sparingly (brand, focus, primary CTA)
5. **Product screenshots as protagonists** — Marketing chrome is a dark frame
6. **Subtle motion** — Micro-interactions only, respects reduced-motion
7. **Dark-mode native** — Light mode is an explicit override

## License

Proprietary — Silkon Labs