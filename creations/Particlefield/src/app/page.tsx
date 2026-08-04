'use client'

import { useState, useCallback } from 'react'
import ParticleCanvas from './components/ParticleCanvas'
import ControlPanel from './components/ControlPanel'
import { EngineConfig } from '@/lib/particleEngine'

const initialConfig: EngineConfig = {
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

export default function Page() {
  const [config, setConfig] = useState(initialConfig)

  const handleCanvasConfig = useCallback((c: EngineConfig) => {
    setConfig(prev =>
      prev.mouseX === c.mouseX && prev.mouseY === c.mouseY ? prev : { ...c }
    )
  }, [])

  const handlePanelConfig = useCallback((patch: Partial<EngineConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }))
  }, [])

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      <ParticleCanvas initialConfig={config} onConfigChange={handleCanvasConfig} />
      <ControlPanel config={config} onConfigChange={handlePanelConfig} />
    </main>
  )
}