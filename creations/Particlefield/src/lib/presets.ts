import fs from 'fs'
import path from 'path'
import { EngineConfig, ColorMode, MouseMode } from './particleEngine'

export interface Preset {
  name: string
  config: EngineConfig
}

const PRESETS_DIR = path.join(process.cwd(), 'data')
const PRESETS_FILE = path.join(PRESETS_DIR, 'presets.json')

const defaultPresets: Preset[] = [
  {
    name: 'default',
    config: {
      particleCount: 3000,
      speed: 1.5,
      gravity: true,
      colorMode: 'rainbow',
      trailFade: 0.15,
      mouseMode: 'attract',
      mouseX: 0,
      mouseY: 0,
      mouseActive: false,
      canvasWidth: 1920,
      canvasHeight: 1080
    }
  }
]

function ensurePresetsDir() {
  if (!fs.existsSync(PRESETS_DIR)) {
    fs.mkdirSync(PRESETS_DIR, { recursive: true })
  }
}

function ensurePresetsFile() {
  ensurePresetsDir()
  if (!fs.existsSync(PRESETS_FILE)) {
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(defaultPresets, null, 2))
  }
}

export function readPresets(): Preset[] {
  ensurePresetsFile()
  try {
    const data = fs.readFileSync(PRESETS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return defaultPresets
  }
}

export function writePresets(presets: Preset[]): void {
  ensurePresetsDir()
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2))
}

export function getPreset(name: string): Preset | undefined {
  const presets = readPresets()
  return presets.find(p => p.name === name)
}

export function savePreset(preset: Preset): void {
  const presets = readPresets()
  const idx = presets.findIndex(p => p.name === preset.name)
  if (idx >= 0) {
    presets[idx] = preset
  } else {
    presets.push(preset)
  }
  writePresets(presets)
}

export function deletePreset(name: string): boolean {
  const presets = readPresets()
  const filtered = presets.filter(p => p.name !== name)
  if (filtered.length === presets.length) {
    return false
  }
  writePresets(filtered)
  return true
}