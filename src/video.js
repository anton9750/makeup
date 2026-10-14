// @ts-nocheck
// Finds assets/videos/video-01.* at build time (also checks src/assets/videos).
// mp4 / webm / mov / m4v are picked up; if several exist, mp4 wins.
const found = import.meta.glob(['/assets/videos/video-01.*', '/src/assets/videos/video-01.*'], {
  query: '?url',
  import: 'default',
  eager: true,
})

const rank = (p) => {
  const i = ['.mp4', '.webm', '.m4v', '.mov'].findIndex((e) => p.toLowerCase().endsWith(e))
  return i === -1 ? 99 : i
}

const entries = Object.entries(found).sort((a, b) => rank(a[0]) - rank(b[0]))

export const VIDEO_URL = entries.length ? entries[0][1] : null