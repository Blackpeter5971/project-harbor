const colors = ['var(--primary)', 'var(--destructive)', 'var(--accent)', 'var(--chart-2, var(--primary))', 'var(--chart-4, var(--accent))'];

/** Decorative CSS balloons + congratulations banner; plays once per mount. */
export function Balloons() {
  return <>
    <div className="balloon-banner" role="status">🎉 Congratulations on your victory!</div>
    <div className="balloons" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => <span key={i} className="balloon" style={{ left: `${(i * 37) % 95}%`, background: colors[i % colors.length], animationDuration: `${5 + (i % 5) * 0.8}s`, animationDelay: `${(i % 6) * 0.35}s` }} />)}
    </div>
  </>;
}
