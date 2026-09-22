export type PostType = 'imagem' | 'carrossel' | 'video' | 'reels' | 'story'
export type PostStatus = 'rascunho' | 'pronto' | 'agendado' | 'publicado'
export type MediaType = 'imagem' | 'video'

export interface Client {
  id: string
  owner_id: string
  name: string
  avatar_url: string | null
  instagram_handle: string | null
  public_token: string
  created_at: string
}

export interface PostMedia {
  id: string
  post_id: string
  media_type: MediaType
  storage_path: string
  thumbnail_path: string | null
  position: number
}

export interface Post {
  id: string
  client_id: string
  caption: string | null
  post_type: PostType
  network: string
  status: PostStatus
  scheduled_at: string | null
  order_index: number
  created_at: string
  updated_at: string
  post_media?: PostMedia[]
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  rascunho: 'Rascunho',
  pronto: 'Pronto',
  agendado: 'Agendado',
  publicado: 'Publicado',
}

export const STATUS_COLOR: Record<PostStatus, string> = {
  rascunho: 'bg-secondary/30 text-dark/70',
  pronto: 'bg-blue-100 text-blue-700',
  agendado: 'bg-brand/15 text-brand-dark',
  publicado: 'bg-green-100 text-green-700',
}

export const POST_TYPE_LABEL: Record<PostType, string> = {
  imagem: 'Imagem',
  carrossel: 'Carrossel',
  video: 'Vídeo',
  reels: 'Reels',
  story: 'Story',
}
