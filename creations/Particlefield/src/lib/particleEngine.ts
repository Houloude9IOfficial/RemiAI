export type ColorMode = 'rainbow' | 'mono' | 'gradient'
export type MouseMode = 'attract' | 'repel' | 'none'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  hue: number
}

export interface EngineConfig {
  particleCount: number
  speed: number
  gravity: boolean
  colorMode: ColorMode
  trailFade: number
  mouseMode: MouseMode
  mouseX: number
  mouseY: number
  mouseActive: boolean
  canvasWidth: number
  canvasHeight: number
}

const defaultConfig: EngineConfig = {
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

export class ParticleEngine {
  private particles: Particle[] = []
  private config: EngineConfig
  private ctx: CanvasRenderingContext2D
  private hueOffset = 0
  private pool: Particle[] = []
  private poolIndex = 0

  constructor(ctx: CanvasRenderingContext2D, config: Partial<EngineConfig> = {}) {
    this.ctx = ctx
    this.config = { ...defaultConfig, ...config }
    this.initPool()
    this.spawnAll()
  }

  private initPool() {
    this.pool = new Array(this.config.particleCount)
    for (let i = 0; i < this.config.particleCount; i++) {
      this.pool[i] = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        hue: 0
      }
    }
    this.poolIndex = 0
  }

  private spawnAll() {
    const { canvasWidth, canvasHeight, particleCount } = this.config
    for (let i = 0; i < particleCount; i++) {
      this.spawn(i)
    }
  }

  private spawn(index: number) {
    const { canvasWidth, canvasHeight, speed } = this.config
    const angle = Math.random() * Math.PI * 2
    const velocity = (0.5 + Math.random() * 1.5) * speed
    const p = this.pool[index]
    p.x = Math.random() * canvasWidth
    p.y = Math.random() * canvasHeight
    p.vx = Math.cos(angle) * velocity
    p.vy = Math.sin(angle) * velocity
    p.life = 60 + Math.random() * 120
    p.maxLife = p.life
    p.hue = Math.random() * 360
  }

  setConfig(config: Partial<EngineConfig>) {
    const oldCount = this.config.particleCount
    this.config = { ...this.config, ...config }
    if (config.particleCount && config.particleCount !== oldCount) {
      this.resizePool(config.particleCount)
    }
  }

  private resizePool(newCount: number) {
    const oldPool = this.pool
    const oldCount = oldPool.length
  
    this.pool = new Array(newCount)
  
    const copyCount = Math.min(oldCount, newCount)
  
    for (let i = 0; i < copyCount; i++) {
      this.pool[i] = oldPool[i]
    }
  
    for (let i = copyCount; i < newCount; i++) {
      this.pool[i] = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        hue: 0,
      }
    }
  
    if (newCount > oldCount) {
      for (let i = oldCount; i < newCount; i++) {
        this.spawn(i)
      }
    }
  
    this.poolIndex = 0
  }

  setMouse(x: number, y: number, active: boolean) {
    this.config.mouseX = x
    this.config.mouseY = y
    this.config.mouseActive = active
  }

  update() {
    const { gravity, mouseMode, mouseX, mouseY, mouseActive, canvasWidth, canvasHeight, speed } = this.config
    const mouseForce = 0.3 * speed

    for (let i = 0; i < this.config.particleCount; i++) {
      const p = this.pool[i]

      if (gravity) {
        p.vy += 0.02 * speed
      }

      if (mouseActive && mouseMode !== 'none') {
        const dx = mouseX - p.x
        const dy = mouseY - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 300 && dist > 1) {
          const force = (mouseForce * 300) / dist
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          if (mouseMode === 'attract') {
            p.vx += fx
            p.vy += fy
          } else {
            p.vx -= fx
            p.vy -= fy
          }
        }
      }

      p.x += p.vx
      p.y += p.vy
      p.life--

      if (p.life <= 0 || p.x < -50 || p.x > canvasWidth + 50 || p.y < -50 || p.y > canvasHeight + 50) {
        this.spawn(i)
      }

      const maxSpeed = 8 * speed
      const vMag = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (vMag > maxSpeed) {
        p.vx = (p.vx / vMag) * maxSpeed
        p.vy = (p.vy / vMag) * maxSpeed
      }
    }

    this.hueOffset = (this.hueOffset + 0.5) % 360
  }

  render() {
    const { trailFade, colorMode, canvasWidth, canvasHeight } = this.config
    const ctx = this.ctx

    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = `rgba(0, 0, 0, ${trailFade})`
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    ctx.globalCompositeOperation = 'lighter'

    for (let i = 0; i < this.config.particleCount; i++) {
      const p = this.pool[i]
      const lifeRatio = p.life / p.maxLife
      const size = 1.5 + lifeRatio * 2.5

      let hue: number
      switch (colorMode) {
        case 'rainbow':
          hue = (p.hue + this.hueOffset) % 360
          break
        case 'mono':
          hue = 220
          break
        case 'gradient':
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
          hue = 180 + (speed / 8) * 120
          break
        default:
          hue = p.hue
      }

      const alpha = lifeRatio * 0.8
      ctx.beginPath()
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${alpha})`
      ctx.fill()
    }
  }

  resize(width: number, height: number) {
    this.config.canvasWidth = width
    this.config.canvasHeight = height
  }

  getConfig(): EngineConfig {
    return { ...this.config }
  }
}