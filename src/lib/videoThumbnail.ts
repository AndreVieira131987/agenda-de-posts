export function captureVideoThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    const objectUrl = URL.createObjectURL(file)
    video.src = objectUrl

    function cleanup() {
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute('src')
      video.load()
    }

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.1, video.duration / 2 || 0)
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        cleanup()
        reject(new Error('Não foi possível gerar a miniatura do vídeo.'))
        return
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          cleanup()
          if (blob) resolve(blob)
          else reject(new Error('Não foi possível gerar a miniatura do vídeo.'))
        },
        'image/jpeg',
        0.8,
      )
    }

    video.onerror = () => {
      cleanup()
      reject(new Error('Não foi possível carregar o vídeo para gerar a miniatura.'))
    }
  })
}
