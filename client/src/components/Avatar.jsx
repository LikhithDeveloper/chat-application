// A coloured circle with the first letter. The colour is derived from the name, so it's stable.
export default function Avatar({ name, square = false }) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  return (
    <div
      className={`avatar ${square ? 'square' : ''}`}
      style={{ background: `linear-gradient(135deg, hsl(${hash} 70% 55%), hsl(${(hash + 40) % 360} 70% 45%))` }}
    >
      {name[0].toUpperCase()}
    </div>
  )
}
