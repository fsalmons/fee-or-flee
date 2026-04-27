'use client'

import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1a2e',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: '"Press Start 2P", monospace',
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <div style={{
          fontSize: '14px',
          color: '#ffd700',
          letterSpacing: '4px',
          marginBottom: '16px',
        }}>
          ⚽ FOOTBALL PARTY GAME ⚽
        </div>
        <h1 style={{
          fontSize: 'clamp(28px, 8vw, 56px)',
          color: '#f0f0f0',
          margin: '0 0 8px 0',
          textShadow: '4px 4px 0px #000, 8px 8px 0px #457b9d',
          lineHeight: 1.2,
        }}>
          FEE OR
        </h1>
        <h1 style={{
          fontSize: 'clamp(28px, 8vw, 56px)',
          color: '#ffd700',
          margin: '0',
          textShadow: '4px 4px 0px #000, 8px 8px 0px #e63946',
          lineHeight: 1.2,
        }}>
          FLEE
        </h1>
        <div style={{
          marginTop: '24px',
          fontSize: '9px',
          color: '#457b9d',
          lineHeight: '1.8',
        }}>
          GUESS THE TRANSFER FEE.<br />
          3 STRIKES AND YOU ARE OUT.
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '320px' }}>
        <button
          onClick={() => router.push('/host')}
          className="pixel-btn"
          style={{
            background: '#3a7d44',
            color: '#f0f0f0',
            fontSize: '14px',
            padding: '20px',
            width: '100%',
            textAlign: 'center',
            border: '4px solid #f0f0f0',
            boxShadow: '4px 4px 0px #000',
            cursor: 'pointer',
            fontFamily: '"Press Start 2P", monospace',
          }}
        >
          HOST GAME
        </button>
        <button
          onClick={() => router.push('/join')}
          className="pixel-btn"
          style={{
            background: '#457b9d',
            color: '#f0f0f0',
            fontSize: '14px',
            padding: '20px',
            width: '100%',
            textAlign: 'center',
            border: '4px solid #f0f0f0',
            boxShadow: '4px 4px 0px #000',
            cursor: 'pointer',
            fontFamily: '"Press Start 2P", monospace',
          }}
        >
          JOIN GAME
        </button>
      </div>

      {/* Footer decoration */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        fontSize: '7px',
        color: '#457b9d',
        opacity: 0.6,
        textAlign: 'center',
      }}>
        ALL FEES INFLATION-ADJUSTED TO 2026
      </div>
    </div>
  )
}
