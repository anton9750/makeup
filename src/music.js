// Finds assets/music/song-01.* at build time (also checks src/assets/music).
const found = import.meta.glob(['/assets/music/song-01.*', '/src/assets/music/song-01.*'], {
  query: '?url',
  import: 'default',
  eager: true,
})

export const SONG_URL = Object.values(found)[0] || null