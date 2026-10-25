/** The MA Studio mark: an M drawn as two peaks, with a red record light. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="MA Studio" style={{ flex: "none" }}>
      <rect width="32" height="32" rx="6" fill="var(--accent)" />
      <path d="M6.5 24V9.5L13 18l6.5-8.5V24" fill="none" stroke="var(--accent-ink)" strokeWidth="3.2" strokeLinejoin="miter" strokeLinecap="butt" />
      <rect x="22.5" y="6.5" width="4" height="4" rx="1" fill="#ff4b3a" />
    </svg>
  );
}
