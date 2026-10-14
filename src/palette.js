// @ts-nocheck
// 75 cheek shades: 5 families x 15 steps, light -> deep
const FAMILIES = [
  { name: 'Petal', h: 350, s: 74, l0: 87, l1: 47 },
  { name: 'Peach', h: 22, s: 86, l0: 86, l1: 50 },
  { name: 'Coral', h: 7, s: 80, l0: 80, l1: 45 },
  { name: 'Berry', h: 338, s: 62, l0: 72, l1: 30 },
  { name: 'Mauve', h: 312, s: 40, l0: 78, l1: 34 },
]

function hslToHex(h, s, l) {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

export const SHADES = FAMILIES.flatMap((f) =>
  Array.from({ length: 15 }, (_, i) => {
    const t = i / 14
    return {
      name: `${f.name} ${String(i + 1).padStart(2, '0')}`,
      hex: hslToHex(f.h + (i - 7) * 0.9, f.s - 6 + t * 10, f.l0 + (f.l1 - f.l0) * t),
    }
  }),
)
