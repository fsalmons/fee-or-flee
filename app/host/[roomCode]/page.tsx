'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import { resolveRound, getCorrectAnswer } from '@/lib/gameLogic'
import { Room, RoomPlayer, Player, Answer } from '@/types'

const ROUND_DURATION = 10

export default function HostGamePage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = params.roomCode as string

  const [room, setRoom] = useState<Room | null>(null)
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([])
  const [leftPlayer, setLeftPlayer] = useState<Player | null>(null)
  const [rightPlayer, setRightPlayer] = useState<Player | null>(null)
  const [roundAnswers, setRoundAnswers] = useState<Answer[]>([])
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION)
  const [timerActive, setTimerActive] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [origin, setOrigin] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [loading, setLoading] = useState(true)
  const [roundResolved, setRoundResolved] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealedRef = useRef(false)

  useEffect(() => {
    setOrigin(window.location.origin)
    const storedHostId = localStorage.getItem(`host_${roomCode}`)
    setIsHost(!!storedHostId)
  }, [roomCode])

  // Load room data
  useEffect(() => {
    async function loadRoom() {
      const { data } = await supabase.from('rooms').select('*').eq('id', roomCode).single()
      if (data) setRoom(data as Room)
      setLoading(false)
    }
    loadRoom()

    const roomSub = supabase
      .channel(`room-${roomCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomCode}`,
      }, (payload) => {
        setRoom(payload.new as Room)
      })
      .subscribe()

    return () => { supabase.removeChannel(roomSub) }
  }, [roomCode])

  // Load room players
  useEffect(() => {
    async function loadPlayers() {
      const { data } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_id', roomCode)
        .order('joined_at', { ascending: true })
      if (data) setRoomPlayers(data as RoomPlayer[])
    }
    loadPlayers()

    const playersSub = supabase
      .channel(`room-players-${roomCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_players',
        filter: `room_id=eq.${roomCode}`,
      }, () => {
        loadPlayers()
      })
      .subscribe()

    return () => { supabase.removeChannel(playersSub) }
  }, [roomCode])

  // Load players for current round
  useEffect(() => {
    if (!room || room.status !== 'active' || room.current_round < 1) return

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
      setRevealed(false)
      revealedRef.current = false
      setRoundAnswers([])
      setRoundResolved(false)
      setTimeLeft(ROUND_DURATION)
      setTimerActive(true)
    }

    loadRoundPlayers()
  }, [room?.current_round, room?.status])

  // Subscribe to answers for current round
  useEffect(() => {
    if (!room || room.status !== 'active' || room.current_round < 1) return

    const round = room.current_round
    async function loadAnswers() {
      const { data } = await supabase
        .from('answers')
        .select('*')
        .eq('room_id', roomCode)
        .eq('round', round)
      if (data) setRoundAnswers(data as Answer[])
    }
    loadAnswers()

    const answerSub = supabase
      .channel(`answers-${roomCode}-${round}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'answers',
        filter: `room_id=eq.${roomCode}`,
      }, () => {
        loadAnswers()
      })
      .subscribe()

    return () => { supabase.removeChannel(answerSub) }
  }, [roomCode, room?.current_round, room?.status])

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

  const activePlayers = roomPlayers.filter(p => !p.is_eliminated)

  const handleStartGame = async () => {
    await supabase.from('rooms').update({
      status: 'active',
      current_round: 1,
    }).eq('id', roomCode)
  }

  const handleReveal = useCallback(async () => {
    if (!leftPlayer || !rightPlayer || !room || resolving || revealedRef.current) return
    revealedRef.current = true
    setRevealed(true)
    setTimerActive(false)
    if (timerRef.current) clearInterval(timerRef.current)
    setResolving(true)

    // Reload answers one final time before resolving
    const { data: freshAnswers } = await supabase
      .from('answers')
      .select('*')
      .eq('room_id', roomCode)
      .eq('round', room.current_round)

    const { data: freshPlayers } = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', roomCode)

    const activeNow = (freshPlayers || []).filter((p: RoomPlayer) => !p.is_eliminated)

    await resolveRound(
      roomCode,
      room.current_round,
      leftPlayer,
      rightPlayer,
      (freshAnswers || []) as Answer[],
      activeNow as RoomPlayer[]
    )

    setRoundResolved(true)
    setResolving(false)
  }, [leftPlayer, rightPlayer, room, roomCode, resolving])

  // Auto-reveal when all active players answered or timer hits 0
  useEffect(() => {
    if (revealed || revealedRef.current) return
    if (!room || room.status !== 'active') return
    if (activePlayers.length === 0) return

    const allAnswered = activePlayers.every(p =>
      roundAnswers.some(a => a.room_player_id === p.id)
    )

    if ((allAnswered && activePlayers.length > 0) || timeLeft === 0) {
      // Don't auto-reveal — let host click reveal for dramatic effect
      // But stop the timer
      if (timeLeft === 0 && timerActive) {
        setTimerActive(false)
      }
    }
  }, [roundAnswers, activePlayers, timeLeft, revealed, room, timerActive])

  const handleNextRound = async () => {
    if (!room) return

    // Re-check active players after resolution
    const { data: freshPlayers } = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', roomCode)
    const activeNow = (freshPlayers || []).filter((p: RoomPlayer) => !p.is_eliminated)

    if (activeNow.length <= 1) {
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomCode)
    } else {
      await supabase.from('rooms').update({
        current_round: room.current_round + 1,
      }).eq('id', roomCode)
    }
  }

  const allAnswered = activePlayers.length > 0 && activePlayers.every(p =>
    roundAnswers.some(a => a.room_player_id === p.id)
  )

  const canReveal = (allAnswered || timeLeft === 0) && !revealed

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Press Start 2P", monospace' }}>
        <div style={{ color: '#ffd700', fontSize: '12px' }}>LOADING...</div>
      </div>
    )
  }

  if (!room) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Press Start 2P", monospace' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#e63946', fontSize: '12px', marginBottom: '20px' }}>ROOM NOT FOUND</div>
          <button onClick={() => router.push('/')} style={{ ...btnStyle, background: '#457b9d' }}>GO HOME</button>
        </div>
      </div>
    )
  }

  // FINISHED STATE
  if (room.status === 'finished') {
    const winner = roomPlayers.find(p => !p.is_eliminated)
    return (
      <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '"Press Start 2P", monospace', padding: '20px' }}>
        <div style={{ fontSize: '40px', marginBottom: '24px' }}>🏆</div>
        <div style={{ fontSize: '20px', color: '#ffd700', marginBottom: '16px', textAlign: 'center' }}>
          {winner ? 'WINNER!' : 'GAME OVER!'}
        </div>
        {winner && (
          <div style={{ fontSize: '14px', color: '#f0f0f0', marginBottom: '32px', textAlign: 'center' }}>
            {winner.player_name}
          </div>
        )}
        <div style={{ marginBottom: '40px', width: '100%', maxWidth: '480px' }}>
          <div style={{ fontSize: '10px', color: '#ffd700', marginBottom: '16px' }}>FINAL STANDINGS</div>
          {[...roomPlayers]
            .sort((a, b) => a.strikes - b.strikes)
            .map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', border: '2px solid #f0f0f0', marginBottom: '8px', background: p.is_eliminated ? '#2a1a1a' : '#1a2a1a' }}>
                <span style={{ fontSize: '9px', color: p.is_eliminated ? '#e63946' : '#f0f0f0' }}>{p.player_name}</span>
                <span style={{ fontSize: '9px' }}>{renderHearts(p.strikes, p.is_eliminated)}</span>
              </div>
            ))}
        </div>
        <button onClick={() => router.push('/')} style={{ ...btnStyle, background: '#457b9d', fontSize: '12px', padding: '16px 28px' }}>
          PLAY AGAIN
        </button>
      </div>
    )
  }

  // LOBBY STATE
  if (room.status === 'lobby') {
    const joinUrl = `${origin}/join/${roomCode}`
    return (
      <div style={{ minHeight: '100vh', background: '#1a1a2e', fontFamily: '"Press Start 2P", monospace', padding: '20px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', padding: '30px 0 20px' }}>
            <div style={{ fontSize: '10px', color: '#457b9d', marginBottom: '12px' }}>ROOM CODE</div>
            <div style={{ fontSize: 'clamp(28px, 8vw, 48px)', color: '#ffd700', letterSpacing: '8px', textShadow: '4px 4px 0px #000' }}>
              {roomCode}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '20px' }}>
            {/* QR Code */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#f0f0f0', marginBottom: '16px' }}>SCAN TO JOIN</div>
              <div style={{
                background: '#f0f0f0',
                padding: '16px',
                display: 'inline-block',
                border: '4px solid #ffd700',
                boxShadow: '4px 4px 0px #000',
              }}>
                <QRCodeSVG value={joinUrl} size={180} bgColor="#f0f0f0" fgColor="#1a1a2e" />
              </div>
              <div style={{ fontSize: '7px', color: '#457b9d', marginTop: '12px', wordBreak: 'break-all', maxWidth: '220px' }}>
                {joinUrl}
              </div>
            </div>

            {/* Players list */}
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div style={{ fontSize: '9px', color: '#ffd700', marginBottom: '16px' }}>
                PLAYERS JOINED ({roomPlayers.length})
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {roomPlayers.length === 0 ? (
                  <div style={{ fontSize: '8px', color: '#457b9d', padding: '20px', border: '2px solid #457b9d', textAlign: 'center' }}>
                    WAITING FOR PLAYERS...
                    <span className="blink" style={{ display: 'block', marginTop: '8px' }}>_</span>
                  </div>
                ) : (
                  roomPlayers.map((p, i) => (
                    <div key={p.id} style={{
                      padding: '12px 16px',
                      border: '2px solid #3a7d44',
                      marginBottom: '8px',
                      background: '#0d2211',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}>
                      <span style={{ fontSize: '9px', color: '#3a7d44' }}>{i + 1}.</span>
                      <span style={{ fontSize: '9px', color: '#f0f0f0' }}>{p.player_name}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Start button */}
              {isHost && (
                <button
                  onClick={handleStartGame}
                  disabled={roomPlayers.length < 1}
                  style={{
                    ...btnStyle,
                    background: roomPlayers.length >= 1 ? '#3a7d44' : '#333',
                    marginTop: '24px',
                    width: '100%',
                    fontSize: '12px',
                    padding: '18px',
                    opacity: roomPlayers.length >= 1 ? 1 : 0.5,
                    cursor: roomPlayers.length >= 1 ? 'pointer' : 'not-allowed',
                  }}
                >
                  START GAME
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ACTIVE STATE
  const correctAnswer = leftPlayer && rightPlayer ? getCorrectAnswer(leftPlayer, rightPlayer) : null

  return (
    <div style={{ minHeight: '100vh', background: '#3a7d44', fontFamily: '"Press Start 2P", monospace', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(0,0,0,0.15) 60px, rgba(0,0,0,0.15) 120px)' }}>
      {/* Top bar */}
      <div style={{ background: '#1a1a2e', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '4px solid #ffd700' }}>
        <div style={{ fontSize: '10px', color: '#ffd700' }}>ROOM: {roomCode}</div>
        <div style={{ fontSize: '10px', color: '#f0f0f0' }}>ROUND {room.current_round}</div>
        <div style={{ fontSize: '10px', color: '#457b9d' }}>{activePlayers.length} ACTIVE</div>
      </div>

      <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Timer */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              fontSize: 'clamp(40px, 10vw, 80px)',
              fontWeight: 'bold',
              color: timeLeft <= 3 ? '#e63946' : '#ffd700',
              textShadow: '4px 4px 0px #000',
              ...(timeLeft <= 3 && !revealed ? { animation: 'flashRed 0.5s steps(1) infinite' } : {}),
            }}
          >
            {revealed ? '---' : String(timeLeft).padStart(2, '0')}
          </div>
        </div>

        {/* Player Cards */}
        {leftPlayer && rightPlayer && (
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
            {/* Left Card */}
            <PlayerCard player={leftPlayer} showFee={true} isLeft={true} revealed={revealed} isCorrect={null} />

            {/* VS */}
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '20px', color: '#ffd700', textShadow: '2px 2px 0px #000', fontWeight: 'bold' }}>
              VS
            </div>

            {/* Right Card */}
            <PlayerCard player={rightPlayer} showFee={revealed} isLeft={false} revealed={revealed} isCorrect={null} />
          </div>
        )}

        {/* Answer Stats */}
        <div style={{ textAlign: 'center', marginBottom: '20px', fontSize: '9px', color: '#f0f0f0' }}>
          {roundAnswers.length} / {activePlayers.length} ANSWERED
        </div>

        {/* Action Buttons */}
        {isHost && (
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
            {!revealed && (
              <button
                onClick={handleReveal}
                disabled={resolving}
                style={{
                  ...btnStyle,
                  background: canReveal ? '#f4a261' : '#555',
                  fontSize: '12px',
                  padding: '16px 28px',
                  opacity: resolving ? 0.6 : 1,
                  cursor: resolving ? 'not-allowed' : 'pointer',
                  border: '4px solid #f0f0f0',
                  boxShadow: '4px 4px 0px #000',
                  color: '#1a1a2e',
                }}
              >
                {resolving ? 'RESOLVING...' : 'REVEAL'}
              </button>
            )}
            {revealed && roundResolved && (
              <button
                onClick={handleNextRound}
                style={{
                  ...btnStyle,
                  background: '#3a7d44',
                  fontSize: '12px',
                  padding: '16px 28px',
                  border: '4px solid #f0f0f0',
                  boxShadow: '4px 4px 0px #000',
                }}
              >
                NEXT ROUND
              </button>
            )}
          </div>
        )}

        {/* Reveal result info */}
        {revealed && correctAnswer && leftPlayer && rightPlayer && (
          <div style={{ textAlign: 'center', marginBottom: '20px', padding: '12px', border: '4px solid #ffd700', boxShadow: '4px 4px 0px #000', background: '#1a1a2e', maxWidth: '500px', margin: '0 auto 20px' }}>
            <div style={{ fontSize: '9px', color: '#ffd700' }}>
              CORRECT ANSWER: {correctAnswer.toUpperCase()}
            </div>
            <div style={{ fontSize: '8px', color: '#f0f0f0', marginTop: '8px' }}>
              {rightPlayer.name}: £{rightPlayer.adjusted_fee_2026_millions}m
            </div>
          </div>
        )}

        {/* Leaderboard Strip */}
        <div style={{ background: '#1a1a2e', border: '4px solid #f0f0f0', boxShadow: '4px 4px 0px #000', padding: '16px' }}>
          <div style={{ fontSize: '9px', color: '#ffd700', marginBottom: '12px' }}>LEADERBOARD</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {roomPlayers.map(p => {
              const playerAnswer = roundAnswers.find(a => a.room_player_id === p.id)
              const showResult = revealed && playerAnswer !== undefined
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '10px 14px',
                    border: `2px solid ${p.is_eliminated ? '#e63946' : '#3a7d44'}`,
                    background: p.is_eliminated ? '#2a1a1a' : showResult ? (playerAnswer?.is_correct ? '#0d2a0d' : '#2a0d0d') : '#0d1a0d',
                    minWidth: '140px',
                  }}
                >
                  <div style={{ fontSize: '8px', color: p.is_eliminated ? '#e63946' : '#f0f0f0', marginBottom: '6px' }}>
                    {p.player_name}
                  </div>
                  <div style={{ fontSize: '10px' }}>
                    {renderHearts(p.strikes, p.is_eliminated)}
                  </div>
                  {revealed && playerAnswer && (
                    <div style={{ fontSize: '7px', marginTop: '6px', color: playerAnswer.is_correct ? '#3a7d44' : '#e63946' }}>
                      {playerAnswer.is_correct ? 'CORRECT' : 'WRONG'} ({playerAnswer.answer?.toUpperCase()})
                    </div>
                  )}
                  {revealed && !playerAnswer && !p.is_eliminated && (
                    <div style={{ fontSize: '7px', marginTop: '6px', color: '#e63946' }}>NO ANSWER</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
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

function PlayerCard({
  player,
  showFee,
  isLeft,
}: {
  player: Player
  showFee: boolean
  isLeft: boolean
  revealed: boolean
  isCorrect: boolean | null
}) {
  return (
    <div style={{
      background: '#1a1a2e',
      border: '4px solid #f0f0f0',
      boxShadow: '6px 6px 0px #000',
      padding: '20px',
      width: '280px',
      fontFamily: '"Press Start 2P", monospace',
    }}>
      {/* Position badge */}
      <div style={{
        background: isLeft ? '#457b9d' : '#f4a261',
        color: '#f0f0f0',
        fontSize: '7px',
        padding: '4px 8px',
        display: 'inline-block',
        marginBottom: '12px',
        border: '2px solid #f0f0f0',
      }}>
        {isLeft ? 'PLAYER A' : 'PLAYER B'}
      </div>

      {/* Jersey icon placeholder */}
      <div style={{
        width: '100%',
        height: '80px',
        background: isLeft ? '#457b9d' : '#f4a261',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '40px',
        marginBottom: '16px',
        border: '2px solid rgba(255,255,255,0.2)',
      }}>
        ⚽
      </div>

      <div style={{ fontSize: '11px', color: '#ffd700', marginBottom: '10px', lineHeight: '1.6' }}>
        {player.name}
      </div>

      <div style={{ fontSize: '8px', color: '#457b9d', marginBottom: '6px' }}>{player.club}</div>
      <div style={{ fontSize: '8px', color: '#f0f0f0', opacity: 0.7, marginBottom: '6px' }}>{player.nationality}</div>
      <div style={{ fontSize: '8px', color: '#f0f0f0', opacity: 0.7, marginBottom: '16px' }}>{player.position}</div>

      <div style={{
        background: showFee ? '#3a7d44' : '#333',
        border: `2px solid ${showFee ? '#ffd700' : '#555'}`,
        padding: '10px',
        textAlign: 'center',
      }}>
        {showFee ? (
          <>
            <div style={{ fontSize: '7px', color: '#ffd700', marginBottom: '4px' }}>2026 VALUE</div>
            <div style={{ fontSize: '13px', color: '#ffd700' }}>
              £{player.adjusted_fee_2026_millions}m
            </div>
            <div style={{ fontSize: '6px', color: '#f0f0f0', opacity: 0.6, marginTop: '4px' }}>
              orig: £{player.original_fee_millions}m ({player.original_year})
            </div>
          </>
        ) : (
          <div style={{ fontSize: '20px', color: '#555', letterSpacing: '4px' }}>???</div>
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  fontFamily: '"Press Start 2P", monospace',
  color: '#f0f0f0',
  border: '4px solid #f0f0f0',
  boxShadow: '4px 4px 0px #000',
  cursor: 'pointer',
  fontSize: '11px',
  padding: '14px 20px',
  background: '#457b9d',
}
