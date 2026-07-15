import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

let cachedBuffer: Buffer | null = null;

export async function GET() {
  if (!cachedBuffer) {
    const filePath = join(process.cwd(), 'public', 'favicon.ico');
    cachedBuffer = readFileSync(filePath);
  }

  return new NextResponse(new Uint8Array(cachedBuffer!), {
    headers: {
      'Content-Type': 'image/x-icon',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
