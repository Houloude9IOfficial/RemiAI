'use client'

import { useEffect, useRef, useState } from 'react'
import { ParticleEngine, EngineConfig, ColorMode, MouseMode } from '@/lib/particleEngine'

interface ParticleCanvasProps {
  initialConfig: EngineConfig
  onConfigChange: (config: EngineConfig) => void
}

export default function ParticleCanvas({ initialConfig, onConfigChange }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ParticleEngine | null>(null)
  const animationRef = useRef<number>()
  const configRef = useRef<EngineConfig>(initialConfig)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.scale(dpr, dpr)
      engineRef.current?.resize(window.innerWidth, window.innerHeight)
    }

    engineRef.current = new ParticleEngine(ctx, {
      ...initialConfig,
      canvasWidth: window.innerWidth,
      canvasHeight: window.innerHeight
    })
    configRef.current = initialConfig

    resize()
    setReady(true)

    window.addEventListener('resize', resize)

    const handleMouseMove = (e: MouseEvent) => {
      engineRef.current?.setMouse(e.clientX, e.clientY, true)
      configRef.current = { ...configRef.current, mouseX: e.clientX, mouseY: e.clientY, mouseActive: true }
    }

    const handleMouseLeave = () => {
      engineRef.current?.setMouse(0, 0, false)
      configRef.current = { ...configRef.current, mouseActive: false }
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)

    const loop = () => {
      const engine = engineRef.current
      if (engine) {
        engine.update()
        engine.render()
        onConfigChange(engine.getConfig())
      }
      animationRef.current = requestAnimationFrame(loop)
    }

    animationRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [onConfigChange])

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setConfig(initialConfig)
      configRef.current = initialConfig
    }
  }, [initialConfig])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full block"
      style={{ background: '#000' }}
      aria-label="Particle field canvas"
    />
  )
}