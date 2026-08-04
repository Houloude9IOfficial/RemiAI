'use client'

import { useState, useCallback } from 'react'
import { EngineConfig, ColorMode, MouseMode } from '@/lib/particleEngine'

interface ControlPanelProps {
  config: EngineConfig
  onConfigChange: (config: Partial<EngineConfig>) => void
}

const colorModes: { value: ColorMode; label: string }[] = [
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'mono', label: 'Monochrome' },
  { value: 'gradient', label: 'Velocity Gradient' }
]

const mouseModes: { value: MouseMode; label: string }[] = [
  { value: 'attract', label: 'Attract' },
  { value: 'repel', label: 'Repel' },
  { value: 'none', label: 'None' }
]

export default function ControlPanel({ config, onConfigChange }: ControlPanelProps) {
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<{ name: string; config: EngineConfig }[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch('/api/presets')
      if (res.ok) {
        const data = await res.json()
        setPresets(data)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleSave = async () => {
    if (!presetName.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: presetName.trim(), config })
      })
      if (res.ok) {
        setMessage({ type: 'success', text: `Saved "${presetName}"` })
        setPresetName('')
        fetchPresets()
      } else {
        setMessage({ type: 'error', text: 'Failed to save' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' })
    } finally {
      setLoading(false)
    }
  }

  const handleLoad = async (name: string) => {
    try {
      const res = await fetch(`/api/presets/${encodeURIComponent(name)}`)
      if (res.ok) {
        const data = await res.json()
        onConfigChange(data.config)
        setMessage({ type: 'success', text: `Loaded "${name}"` })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load' })
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete preset "${name}"?`)) return
    try {
      const res = await fetch(`/api/presets/${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (res.ok) {
        setMessage({ type: 'success', text: `Deleted "${name}"` })
        fetchPresets()
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete' })
    }
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-80 glass-panel rounded-xl p-4 backdrop-blur-xs border border-glass-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-medium text-lg">particlefield</h2>
        <span className="text-xs text-gray-400">controls</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="flex items-center justify-between text-sm text-gray-300 mb-1">
            <span>Particles</span>
            <span className="font-mono text-white">{config.particleCount}</span>
          </label>
          <input
            type="range"
            min="1"
            max="25000"
            step="100"
            value={config.particleCount}
            onChange={e => onConfigChange({ particleCount: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </div>

        <div>
          <label className="flex items-center justify-between text-sm text-gray-300 mb-1">
            <span>Speed</span>
            <span className="font-mono text-white">{config.speed.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={config.speed}
            onChange={e => onConfigChange({ speed: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </div>

        <div>
          <label className="flex items-center justify-between text-sm text-gray-300 mb-1">
            <span>Trail Fade</span>
            <span className="font-mono text-white">{config.trailFade.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.01"
            max="0.5"
            step="0.01"
            value={config.trailFade}
            onChange={e => onConfigChange({ trailFade: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-400">Gravity</label>
          <input
            type="checkbox"
            checked={config.gravity}
            onChange={e => onConfigChange({ gravity: e.target.checked })}
            className="w-5 h-5 accent-cyan-400 rounded border-gray-600 bg-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1">Color Mode</label>
          <select
            value={config.colorMode}
            onChange={e => onConfigChange({ colorMode: e.target.value as ColorMode })}
            className="w-full bg-gray-900/50 border border-glass-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
          >
            {colorModes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1">Mouse Mode</label>
          <select
            value={config.mouseMode}
            onChange={e => onConfigChange({ mouseMode: e.target.value as MouseMode })}
            className="w-full bg-gray-900/50 border border-glass-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
          >
            {mouseModes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div className="pt-2 border-t border-glass-border">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              placeholder="Preset name"
              className="flex-1 bg-gray-900/50 border border-glass-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
            />
            <button
              onClick={handleSave}
              disabled={loading || !presetName.trim()}
              className="px-4 py-2 bg-cyan-500/20 border border-cyan-400/50 rounded-lg text-white text-sm hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>

          {presets.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {presets.map(p => (
                <div key={p.name} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-white truncate">{p.name}</span>
                  <button
                    onClick={() => handleLoad(p.name)}
                    className="px-2 py-1 text-xs bg-cyan-500/20 border border-cyan-400/50 rounded text-white hover:bg-cyan-500/30 transition-colors"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDelete(p.name)}
                    className="px-2 py-1 text-xs bg-red-500/20 border border-red-400/50 rounded text-white hover:bg-red-500/30 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {message && (
          <div className={`text-xs ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}