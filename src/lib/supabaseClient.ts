import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltam as variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copie .env.example para .env e preencha com os dados do seu projeto Supabase.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const MEDIA_BUCKET = 'media'

export function getMediaPublicUrl(storagePath: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl
}

export function sanitizeFileName(name: string): string {
  const withoutAccents = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return withoutAccents.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
}

export async function removeStorageObjects(paths: (string | null | undefined)[]) {
  const validPaths = [...new Set(paths.filter((p): p is string => Boolean(p)))]
  if (validPaths.length === 0) return
  await supabase.storage.from(MEDIA_BUCKET).remove(validPaths)
}

export function getStoragePathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${MEDIA_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}
