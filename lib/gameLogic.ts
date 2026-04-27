import { supabase } from './supabase'
import { Player, Answer, RoomPlayer } from '@/types'

export function getCorrectAnswer(leftPlayer: Player, rightPlayer: Player): 'higher' | 'lower' {
  return rightPlayer.adjusted_fee_2026_millions > leftPlayer.adjusted_fee_2026_millions ? 'higher' : 'lower'
}

export async function resolveRound(
  roomId: string,
  round: number,
  leftPlayer: Player,
  rightPlayer: Player,
  answers: Answer[],
  activePlayers: RoomPlayer[]
) {
  const correctAnswer = getCorrectAnswer(leftPlayer, rightPlayer)
  const answeredPlayerIds = new Set(answers.map(a => a.room_player_id))

  for (const rp of activePlayers) {
    const playerAnswer = answers.find(a => a.room_player_id === rp.id)
    const isCorrect = playerAnswer?.answer === correctAnswer
    const didNotAnswer = !answeredPlayerIds.has(rp.id)

    if (playerAnswer) {
      await supabase.from('answers').update({ is_correct: isCorrect }).eq('id', playerAnswer.id)
    }

    if (!isCorrect || didNotAnswer) {
      const newStrikes = rp.strikes + 1
      const eliminated = newStrikes >= 3
      await supabase.from('room_players').update({
        strikes: newStrikes,
        is_eliminated: eliminated
      }).eq('id', rp.id)
    }
  }
}
