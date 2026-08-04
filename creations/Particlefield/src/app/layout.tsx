import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'particlefield — Generative Particle Art',
  description: 'A generative particle art playground with live controls on canvas'
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}