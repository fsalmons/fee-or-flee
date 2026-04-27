'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Room } from '@/types'

export default function JoinRoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = (params.roomCode as string).toUpperCase()

  const [room, setRoom] = useState<Room | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    async function checkRoom() {
      const { data, error: fetchError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomCode)
        .single()

      if (fetchError || !data) {
        setError('ROOM NOT FOUND')
        setLoading(false)
        return
      }

      if (data.status !== 'lobby') {
        // If this player already joined (e.g. they refreshed), send them back in
        const existingId = localStorage.getItem(`player_${roomCode}`)
        if (existingId) {
          router.replace(`/play/${roomCode}?playerId=${existingId}`)
          return
        }
        setError('GAME ALREADY STARTED')
        setLoading(false)
        return
      }

      setRoom(data as Room)
      setLoading(false)
    }

    checkRoom()
  }, [roomCode])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || !room) return

    setJoining(true)

    // Check if name already taken in this room
    const { data: existing } = await supabase
      .from('room_players')
      .select('id')
      .eq('room_id', roomCode)
      .eq('player_name', trimmedName)
      .single()

    if (existing) {
      setError('NAME ALREADY TAKEN')
      setJoining(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('room_players')
      .insert({
        room_id: roomCode,
        player_name: trimmedName,
        strikes: 0,
        is_eliminated: false,
        joined_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError || !data) {
      setError('FAILED TO JOIN. TRY AGAIN.')
      setJoining(false)
      return
    }

    localStorage.setItem(`player_${roomCode}`, String(data.id))
    router.push(`/play/${roomCode}?playerId=${data.id}`)
  }

  if (loading) {
    return (
      <div style={centeredStyle}>
        <div style={{ fontSize: '12px', color: '#ffd700' }}>CHECKING ROOM...</div>
      </div>
    )
  }

  if (error && error !== 'NAME ALREADY TAKEN') {
    return (
      <div style={centeredStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>❌</div>
          <div style={{ fontSize: '12px', color: '#e63946', marginBottom: '24px' }}>{error}</div>
          <button onClick={() => router.push('/join')} style={backBtnStyle}>
            TRY ANOTHER CODE
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={centeredStyle}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ fontSize: '9px', color: '#457b9d', marginBottom: '12px' }}>JOINING ROOM</div>
        <div style={{ fontSize: '28px', color: '#ffd700', letterSpacing: '6px', textShadow: '3px 3px 0px #000' }}>
          {roomCode}
        </div>
      </div>

      {error === 'NAME ALREADY TAKEN' && (
        <div style={{ fontSize: '9px', color: '#e63946', marginBottom: '20px', textAlign: 'center' }}>
          NAME ALREADY TAKEN
        </div>
      )}

      <form onSubmit={handleJoin} style={{ width: '100%', maxWidth: '300px' }}>
        <label style={{ display: 'block', fontSize: '9px', color: '#f0f0f0', marginBottom: '12px' }}>
          YOUR NAME
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value.slice(0, 20))}
          placeholder="ENTER NAME"
          maxLength={20}
          autoFocus
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '13px',
            fontFamily: '"Press Start 2P", monospace',
            background: '#0d1a2e',
            color: '#f0f0f0',
            border: '4px solid #f0f0f0',
            boxShadow: '4px 4px 0px #000',
            outline: 'none',
            marginBottom: '20px',
            boxSizing: 'border-box',
            textTransform: 'uppercase',
          }}
        />
        <button
          type="submit"
          disabled={!name.trim() || joining}
          style={{
            width: '100%',
            padding: '18px',
            fontSize: '14px',
            fontFamily: '"Press Start 2P", monospace',
            background: name.trim() && !joining ? '#3a7d44' : '#333',
            color: '#f0f0f0',
            border: '4px solid #f0f0f0',
            boxShadow: name.trim() && !joining ? '4px 4px 0px #000' : 'none',
            cursor: name.trim() && !joining ? 'pointer' : 'not-allowed',
            opacity: name.trim() && !joining ? 1 : 0.5,
          }}
        >
          {joining ? 'JOINING...' : 'JOIN GAME'}
        </button>
      </form>

      <button onClick={() => router.push('/join')} style={{ ...backBtnStyle, marginTop: '32px' }}>
        BACK
      </button>
    </div>
  )
}

const centeredStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#1a1a2e',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: '"Press Start 2P", monospace',
  padding: '20px',
}

const backBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#457b9d',
  border: 'none',
  fontSize: '9px',
  fontFamily: '"Press Start 2P", monospace',
  cursor: 'pointer',
}
