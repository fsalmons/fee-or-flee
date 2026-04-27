import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fee or Flee',
  description: 'The football transfer fee party game',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: '"Press Start 2P", monospace', background: '#1a1a2e', color: '#f0f0f0', margin: 0, minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
