import { NextResponse } from 'next/server'
import { readPresets, savePreset } from '@/lib/presets'
import { EngineConfig } from '@/lib/particleEngine'

export async function GET() {
  const presets = readPresets()
  return NextResponse.json(presets)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, config } = body as { name: string; config: EngineConfig }
    if (!name || !config) {
      return NextResponse.json({ error: 'Missing name or config' }, { status: 400 })
    }
    savePreset({ name, config })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}