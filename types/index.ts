export interface Player {
  id: number
  name: string
  club: string
  nationality: string
  position: string
  original_fee_millions: number
  original_year: number
  adjusted_fee_2026_millions: number
  image_url: string | null
  order_index: number
}

export interface Room {
  id: string
  status: 'lobby' | 'active' | 'finished'
  current_round: number
  host_id: string
  created_at: string
}

export interface RoomPlayer {
  id: number
  room_id: string
  player_name: string
  strikes: number
  is_eliminated: boolean
  joined_at: string
}

export interface Answer {
  id: number
  room_id: string
  room_player_id: number
  round: number
  answer: 'higher' | 'lower'
  is_correct: boolean
  answered_at: string
}
