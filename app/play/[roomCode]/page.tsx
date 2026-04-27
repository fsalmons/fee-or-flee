'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Room, RoomPlayer, Player, Answer } from '@/types'

const ROUND_DURATION = 10

export default function PlayPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomCode = (params.roomCode as string).toUpperCase()

  const [room, setRoom] = useState<Room | null>(null)
  const [myPlayer, setMyPlayer] = useState<RoomPlayer | null>(null)
  const [leftPlayer, setLeftPlayer] = useState<Player | null>(null)
  const [rightPlayer, setRightPlayer] = useState<Player | null>(null)
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION)
  const [timerActive, setTimerActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastResult, setLastResult] = useState<'correct' | 'wrong' | null>(null)
  const [showResult, setShowResult] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastRoundRef = useRef<number>(0)
  const roundStartedAtRef = useRef<number>(0)

  // Get player ID from URL or localStorage
  const playerId = searchParams.get('playerId') ||
    (typeof window !== 'undefined' ? localStorage.getItem(`player_${roomCode}`) : null)

  // Load player info
  useEffect(() => {
    if (!playerId) {
      router.push(`/join/${roomCode}`)
      return
    }

    async function loadPlayer() {
      const { data } = await supabase
        .from('room_players')
        .select('*')
        .eq('id', playerId)
        .single()
      if (data) setMyPlayer(data as RoomPlayer)
      setLoading(false)
    }

    loadPlayer()

    const playerSub = supabase
      .channel(`my-player-${playerId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'room_players',
        filter: `id=eq.${playerId}`,
      }, (payload) => {
        setMyPlayer(payload.new as RoomPlayer)
      })
      .subscribe()

    return () => { supabase.removeChannel(playerSub) }
  }, [playerId, roomCode, router])

  // Load and subscribe to room
  useEffect(() => {
    async function loadRoom() {
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomCode)
        .single()
      if (data) setRoom(data as Room)
    }
    loadRoom()

    const roomSub = supabase
      .channel(`play-room-${roomCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomCode}`,
      }, (payload) => {
        const newRoom = payload.new as Room
        // Capture the DB commit time so all clients share the same round start reference
        if (newRoom.current_round !== lastRoundRef.current && newRoom.status === 'active') {
          roundStartedAtRef.current = new Date(payload.commit_timestamp).getTime()
        }
        setRoom(newRoom)
      })
      .subscribe()

    return () => { supabase.removeChannel(roomSub) }
  }, [roomCode])

  // Subscribe to my answers to detect reveal (is_correct gets set)
  useEffect(() => {
    if (!room || room.status !== 'active' || !playerId) return

    const round = room.current_round

    const answerSub = supabase
      .channel(`my-answer-${roomCode}-${round}-${playerId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'answers',
        filter: `room_player_id=eq.${playerId}`,
      }, (payload) => {
        const updated = payload.new as Answer
        if (updated.round === round) {
          setMyAnswer(updated)
          setLastResult(updated.is_correct ? 'correct' : 'wrong')
          setShowResult(true)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(answerSub) }
  }, [roomCode, room?.current_round, room?.status, playerId])

  // Load round players when round changes
  useEffect(() => {
    if (!room || room.status !== 'active' || room.current_round < 1) return
    if (room.current_round === lastRoundRef.current) return
    lastRoundRef.current = room.current_round

    // Reset state for new round
    setMyAnswer(null)
    setLastResult(null)
    setShowResult(false)

    // Sync timer to actual round start (from realtime commit_timestamp when available)
    const startedAt = roundStartedAtRef.current
    const elapsed = startedAt > 0 ? Math.floor((Date.now() - startedAt) / 1000) : 0
    const remaining = Math.max(0, ROUND_DURATION - elapsed)
    setTimeLeft(remaining)
    setTimerActive(remaining > 0)

    async function loadRoundPlayers() {
      const round = room!.current_round
      const { data } = await supabase
        .from('players')
        .select('*')
        .in('order_index', [round, round + 1])
        .order('order_index', { ascending: true })

      if (data && data.length >= 2) {
        setLeftPlayer(data[0] as Player)
        setRightPlayer(data[1] as Player)
      }

      // Check if I already answered this round
      if (playerId) {
        const { data: existingAnswer } = await supabase
          .from('answers')
          .select('*')
          .eq('room_id', roomCode)
          .eq('round', round)
          .eq('room_player_id', playerId)
          .single()
        if (existingAnswer) setMyAnswer(existingAnswer as Answer)
      }
    }

    loadRoundPlayers()
  }, [room?.current_round, room?.status, roomCode, playerId])

  // Timer
  useEffect(() => {
    if (!timerActive) return

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          setTimerActive(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [timerActive])

  // Re-fetch on tab return — catches missed realtime events when phone was backgrounded
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return

      const [{ data: roomData }, { data: playerData }] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomCode).single(),
        playerId ? supabase.from('room_players').select('*').eq('id', playerId).single() : Promise.resolve({ data: null }),
      ])

      if (roomData) setRoom(roomData as Room)
      if (playerData) setMyPlayer(playerData as RoomPlayer)

      // Re-sync timer from the stored round start time
      if (roundStartedAtRef.current > 0) {
        const elapsed = Math.floor((Date.now() - roundStartedAtRef.current) / 1000)
        const remaining = Math.max(0, ROUND_DURATION - elapsed)
        setTimeLeft(remaining)
        if (remaining === 0) setTimerActive(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [roomCode, playerId])

  const submitAnswer = async (answer: 'higher' | 'lower') => {
    if (!playerId || !room || myAnswer || submitting || myPlayer?.is_eliminated) return
    if (timeLeft === 0) return

    setSubmitting(true)

    const { data } = await supabase
      .from('answers')
      .insert({
        room_id: roomCode,
        room_player_id: Number(playerId),
        round: room.current_round,
        answer,
        is_correct: false, // will be set by host on reveal
        answered_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (data) setMyAnswer(data as Answer)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div style={fullScreen}>
        <div style={{ fontSize: '11px', color: '#ffd700' }}>LOADING...</div>
      </div>
    )
  }

  if (!myPlayer) {
    return (
      <div style={fullScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#e63946', marginBottom: '20px' }}>PLAYER NOT FOUND</div>
          <button onClick={() => router.push(`/join/${roomCode}`)} style={smallBtnStyle}>
            REJOIN
          </button>
        </div>
      </div>
    )
  }

  // ELIMINATED
  if (myPlayer.is_eliminated) {
    return (
      <div style={fullScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '24px' }}>💀</div>
          <div style={{ fontSize: '18px', color: '#e63946', marginBottom: '16px' }}>YOU ARE OUT</div>
          <div style={{ fontSize: '9px', color: '#f0f0f0', opacity: 0.7, marginBottom: '32px' }}>
            {myPlayer.player_name}
          </div>
          <div style={{ fontSize: '9px', color: '#457b9d', marginBottom: '8px' }}>SURVIVED TO ROUND</div>
          <div style={{ fontSize: '20px', color: '#ffd700' }}>{room?.current_round ?? '?'}</div>
        </div>
      </div>
    )
  }

  // WON
  if (room?.status === 'finished' && !myPlayer.is_eliminated) {
    return (
      <div style={fullScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '24px' }}>🏆</div>
          <div style={{ fontSize: '20px', color: '#ffd700', marginBottom: '16px' }}>WINNER!</div>
          <div style={{ fontSize: '12px', color: '#f0f0f0', marginBottom: '32px' }}>
            {myPlayer.player_name}
          </div>
          <div style={{ fontSize: '9px', color: '#3a7d44' }}>YOU SURVIVED ALL ROUNDS!</div>
        </div>
      </div>
    )
  }

  // FINISHED but eliminated
  if (room?.status === 'finished') {
    return (
      <div style={fullScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '24px' }}>💀</div>
          <div style={{ fontSize: '18px', color: '#e63946', marginBottom: '16px' }}>GAME OVER</div>
        </div>
      </div>
    )
  }

  // LOBBY
  if (!room || room.status === 'lobby') {
    return (
      <div style={fullScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: '#457b9d', marginBottom: '20px' }}>FEE OR FLEE</div>
          <div style={{ fontSize: '16px', color: '#ffd700', marginBottom: '32px' }}>
            {myPlayer.player_name}
          </div>
          <div style={{ padding: '20px', border: '4px solid #ffd700', boxShadow: '4px 4px 0px #000', marginBottom: '32px' }}>
            <div style={{ fontSize: '10px', color: '#ffd700', marginBottom: '8px' }}>
              WAITING FOR HOST...
            </div>
            <div className="blink" style={{ fontSize: '16px', color: '#ffd700', display: 'block' }}>_</div>
          </div>
          <div style={{ fontSize: '8px', color: '#457b9d', marginBottom: '16px' }}>
            ROOM: {roomCode}
          </div>
          <div style={{ fontSize: '9px', color: '#f0f0f0', opacity: 0.6 }}>
            {renderHearts(myPlayer.strikes, false)}
          </div>
        </div>
      </div>
    )
  }

  // ACTIVE — show result briefly after host reveals
  if (showResult && lastResult) {
    return (
      <div style={{ ...fullScreen, background: lastResult === 'correct' ? '#0d2a0d' : '#2a0d0d' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '24px' }}>
            {lastResult === 'correct' ? '✅' : '❌'}
          </div>
          <div style={{
            fontSize: '20px',
            color: lastResult === 'correct' ? '#3a7d44' : '#e63946',
            marginBottom: '16px',
          }}>
            {lastResult === 'correct' ? 'CORRECT!' : 'WRONG!'}
          </div>
          <div style={{ fontSize: '9px', color: '#f0f0f0', marginBottom: '32px' }}>
            {renderHearts(myPlayer.strikes, false)}
          </div>
          <div style={{ fontSize: '8px', color: '#457b9d' }}>
            WAITING FOR HOST...
          </div>
        </div>
      </div>
    )
  }

  // ACTIVE — playing
  const answered = !!myAnswer
  const timerFlash = timeLeft <= 3 && !answered

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', fontFamily: '"Press Start 2P", monospace', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ background: '#0d1220', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '4px solid #457b9d' }}>
        <div style={{ fontSize: '8px', color: '#457b9d' }}>ROUND {room.current_round}</div>
        <div style={{ fontSize: '9px', color: '#f0f0f0' }}>{myPlayer.player_name}</div>
        <div style={{ fontSize: '9px' }}>{renderHearts(myPlayer.strikes, false)}</div>
      </div>

      {/* Timer */}
      <div style={{ textAlign: 'center', padding: '16px 20px 8px' }}>
        <div style={{
          fontSize: '40px',
          color: timerFlash ? '#e63946' : '#ffd700',
          textShadow: '3px 3px 0px #000',
          ...(timerFlash ? { animation: 'flashRed 0.5s steps(1) infinite' } : {}),
        }}>
          {String(timeLeft).padStart(2, '0')}
        </div>
      </div>

      {/* Question */}
      {leftPlayer && rightPlayer && (
        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
          {/* Left player info */}
          <div style={{ background: '#0d1a2e', border: '4px solid #457b9d', boxShadow: '4px 4px 0px #000', padding: '16px', marginBottom: '20px' }}>
            <div style={{ fontSize: '7px', color: '#457b9d', marginBottom: '8px' }}>PLAYER A</div>
            <div style={{ fontSize: '11px', color: '#ffd700', marginBottom: '8px', lineHeight: '1.6' }}>{leftPlayer.name}</div>
            <div style={{ fontSize: '7px', color: '#f0f0f0', opacity: 0.7, marginBottom: '4px' }}>{leftPlayer.club} · {leftPlayer.nationality}</div>
            <div style={{ fontSize: '7px', color: '#f0f0f0', opacity: 0.7, marginBottom: '10px' }}>{leftPlayer.position}</div>
            <div style={{ fontSize: '14px', color: '#ffd700', background: '#0d2a0d', padding: '8px', border: '2px solid #3a7d44', textAlign: 'center' }}>
              £{leftPlayer.adjusted_fee_2026_millions}m
            </div>
          </div>

          {/* Question text */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '9px', color: '#f0f0f0', lineHeight: '1.8' }}>
              IS <span style={{ color: '#f4a261' }}>{rightPlayer.name}</span>
            </div>
            <div style={{ fontSize: '9px', color: '#f0f0f0', marginTop: '8px' }}>
              HIGHER OR LOWER?
            </div>
          </div>

          {/* Answer buttons */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
            <button
              onClick={() => submitAnswer('higher')}
              disabled={answered || submitting || timeLeft === 0}
              style={{
                flex: 1,
                padding: '24px 16px',
                fontSize: '13px',
                fontFamily: '"Press Start 2P", monospace',
                background: answered
                  ? myAnswer?.answer === 'higher'
                    ? '#3a7d44'
                    : '#1a2e1a'
                  : '#3a7d44',
                color: '#f0f0f0',
                border: `4px solid ${answered && myAnswer?.answer === 'higher' ? '#ffd700' : '#f0f0f0'}`,
                boxShadow: answered && myAnswer?.answer === 'higher' ? '4px 4px 0px #ffd700' : '4px 4px 0px #000',
                cursor: answered || timeLeft === 0 ? 'not-allowed' : 'pointer',
                opacity: answered && myAnswer?.answer !== 'higher' ? 0.4 : 1,
              }}
            >
              HIGHER
            </button>
            <button
              onClick={() => submitAnswer('lower')}
              disabled={answered || submitting || timeLeft === 0}
              style={{
                flex: 1,
                padding: '24px 16px',
                fontSize: '13px',
                fontFamily: '"Press Start 2P", monospace',
                background: answered
                  ? myAnswer?.answer === 'lower'
                    ? '#e63946'
                    : '#2e1a1a'
                  : '#e63946',
                color: '#f0f0f0',
                border: `4px solid ${answered && myAnswer?.answer === 'lower' ? '#ffd700' : '#f0f0f0'}`,
                boxShadow: answered && myAnswer?.answer === 'lower' ? '4px 4px 0px #ffd700' : '4px 4px 0px #000',
                cursor: answered || timeLeft === 0 ? 'not-allowed' : 'pointer',
                opacity: answered && myAnswer?.answer !== 'lower' ? 0.4 : 1,
              }}
            >
              LOWER
            </button>
          </div>

          {/* Status message */}
          <div style={{ textAlign: 'center', fontSize: '9px' }}>
            {answered && (
              <div style={{ color: '#ffd700' }}>
                LOCKED IN: {myAnswer?.answer?.toUpperCase()}
              </div>
            )}
            {timeLeft === 0 && !answered && (
              <div style={{ color: '#e63946' }}>TIME IS UP!</div>
            )}
            {!answered && timeLeft > 0 && (
              <div style={{ color: '#457b9d' }}>CHOOSE QUICKLY!</div>
            )}
          </div>

          {/* Right player teaser */}
          <div style={{ background: '#111827', border: '4px solid #333', padding: '16px', marginTop: 'auto' }}>
            <div style={{ fontSize: '7px', color: '#f4a261', marginBottom: '8px' }}>PLAYER B</div>
            <div style={{ fontSize: '11px', color: '#f4a261', marginBottom: '8px', lineHeight: '1.6' }}>{rightPlayer.name}</div>
            <div style={{ fontSize: '7px', color: '#f0f0f0', opacity: 0.5, marginBottom: '10px' }}>{rightPlayer.club} · {rightPlayer.position}</div>
            <div style={{ fontSize: '14px', color: '#555', background: '#0d0d0d', padding: '8px', border: '2px solid #333', textAlign: 'center', letterSpacing: '4px' }}>
              ???
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function renderHearts(strikes: number, eliminated: boolean): string {
  if (eliminated) return '💀'
  const hearts = []
  for (let i = 0; i < 3; i++) {
    hearts.push(i < strikes ? '🖤' : '❤️')
  }
  return hearts.join('')
}

const fullScreen: React.CSSProperties = {
  minHeight: '100vh',
  background: '#1a1a2e',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: '"Press Start 2P", monospace',
  padding: '20px',
}

const smallBtnStyle: React.CSSProperties = {
  background: '#457b9d',
  color: '#f0f0f0',
  border: '4px solid #f0f0f0',
  boxShadow: '4px 4px 0px #000',
  fontSize: '10px',
  fontFamily: '"Press Start 2P", monospace',
  padding: '14px 20px',
  cursor: 'pointer',
}
