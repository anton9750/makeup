// @ts-nocheck
// Touch-first devices (phones, tablets) report a coarse primary pointer.
export const isTouch =
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches

// Used to lower render cost on phones: smaller shadow/mirror textures, lower pixel ratio.
export const isMobile = isTouch || (typeof window !== 'undefined' && window.innerWidth < 700)
