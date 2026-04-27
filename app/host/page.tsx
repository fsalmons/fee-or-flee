'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateRoomCode } from '@/lib/roomCode'

export default function HostSetupPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'creating' | 'error'>('creating')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function createRoom() {
      const roomCode = generateRoomCode()
      const hostId = crypto.randomUUID()

      const { error: insertError } = await supabase.from('rooms').insert({
        id: roomCode,
        status: 'lobby',
        current_round: 0,
        host_id: hostId,
      })

      if (insertError) {
        // Room code collision — try once more
        const newCode = generateRoomCode()
        const { error: retryError } = await supabase.from('rooms').insert({
          id: newCode,
          status: 'lobby',
          current_round: 0,
          host_id: hostId,
        })
        if (retryError) {
          setError(retryError.message)
          setStatus('error')
          return
        }
        localStorage.setItem(`host_${newCode}`, hostId)
        router.replace(`/host/${newCode}`)
        return
      }

      localStorage.setItem(`host_${roomCode}`, hostId)
      router.replace(`/host/${roomCode}`)
    }

    createRoom()
  }, [router])

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
      {status === 'error' ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#e63946', marginBottom: '24px' }}>
            ERROR CREATING ROOM
          </div>
          <div style={{ fontSize: '9px', color: '#f0f0f0', marginBottom: '32px', opacity: 0.7 }}>
            {error}
          </div>
          <button
            onClick={() => router.push('/')}
            style={{
              background: '#457b9d',
              color: '#f0f0f0',
              fontSize: '11px',
              padding: '16px 24px',
              border: '4px solid #f0f0f0',
              boxShadow: '4px 4px 0px #000',
              cursor: 'pointer',
              fontFamily: '"Press Start 2P", monospace',
            }}
          >
            GO BACK
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#ffd700', marginBottom: '20px' }}>
            CREATING ROOM...
          </div>
          <div style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
          }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: '12px',
                  height: '12px',
                  background: '#ffd700',
                  animation: `blink 1s steps(1) ${i * 0.33}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
