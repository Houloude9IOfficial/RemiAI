import { NextResponse } from 'next/server'
import { deletePreset } from '@/lib/presets'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  const decoded = decodeURIComponent(name)
  const deleted = deletePreset(decoded)
  if (!deleted) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}