'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length >= 4) {
      router.push(`/join/${trimmed}`)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1a2e',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '"Press Start 2P", monospace',
      padding: '20px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ fontSize: '10px', color: '#457b9d', marginBottom: '12px' }}>FEE OR FLEE</div>
        <h1 style={{ fontSize: '20px', color: '#ffd700', margin: 0, textShadow: '3px 3px 0px #000' }}>
          JOIN GAME
        </h1>
      </div>

      <form onSubmit={handleJoin} style={{ width: '100%', maxWidth: '320px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '9px', color: '#f0f0f0', marginBottom: '12px' }}>
            ENTER ROOM CODE
          </label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="XXXX00"
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '22px',
              fontFamily: '"Press Start 2P", monospace',
              background: '#0d1a2e',
              color: '#ffd700',
              border: '4px solid #f0f0f0',
              boxShadow: '4px 4px 0px #000',
              outline: 'none',
              letterSpacing: '6px',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={code.trim().length < 4}
          style={{
            width: '100%',
            padding: '18px',
            fontSize: '14px',
            fontFamily: '"Press Start 2P", monospace',
            background: code.trim().length >= 4 ? '#3a7d44' : '#333',
            color: '#f0f0f0',
            border: '4px solid #f0f0f0',
            boxShadow: code.trim().length >= 4 ? '4px 4px 0px #000' : 'none',
            cursor: code.trim().length >= 4 ? 'pointer' : 'not-allowed',
            opacity: code.trim().length >= 4 ? 1 : 0.5,
          }}
        >
          JOIN
        </button>
      </form>

      <button
        onClick={() => router.push('/')}
        style={{
          marginTop: '32px',
          background: 'transparent',
          color: '#457b9d',
          border: 'none',
          fontSize: '9px',
          fontFamily: '"Press Start 2P", monospace',
          cursor: 'pointer',
        }}
      >
        BACK
      </button>
    </div>
  )
}
