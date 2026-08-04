# particlefield

A generative particle art playground with live controls on HTML5 Canvas. Built with Next.js 14 App Router, TypeScript, and Tailwind CSS. The simulation runs entirely in memory with custom particle pooling for performance.

## Features
- Real-time particle simulation with 3000+ particles
- Gravity physics and mouse interaction (attract/repel)
- Three color modes: rainbow, monochrome, velocity gradient
- Motion trails with additive blending
- Glassmorphic control panel with backdrop blur
- Save/load presets via JSON API
- Responsive canvas with device pixel ratio scaling

## Setup

```bash
npm install
```

Copy environment example:

```bash
cp .env.example .env
```

Run development server:

```bash
npm run dev
```

## Project Structure

- `src/lib/particleEngine.ts` - Standalone simulation class
- `src/lib/presets.ts` - Server-side preset management
- `src/app/api/presets/*` - REST API for presets
- `src/app/components/*` - UI components
- `data/presets.json` - Preset storage (auto-created)

## Controls
- Adjust particle count, speed, trail fade with sliders
- Toggle gravity on/off
- Select color mode and mouse interaction
- Save current configuration as named preset
- Load/delete presets from the control panel

## Tech Stack
- Next.js 14 App Router
- TypeScript
- Tailwind CSS (3.4)
- HTML5 Canvas (no external libraries)
- Node.js fs for file operations

## Performance Notes
- Particles use object pooling to avoid allocation per frame
- Canvas is scaled with device pixel ratio for crisp rendering
- Animation loop uses requestAnimationFrame for smooth 60fps

## License
MIT