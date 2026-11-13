import { Link } from 'react-router-dom'

export function Brand({ compact = false, asLink = true }: { compact?: boolean; asLink?: boolean }) {
  const contents = <><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><polygon fill="currentColor" points="4,3 18,3 28,12 28,20 18,29 4,29 4,22 9,22 9,24 16,24 23,18 23,14 16,8 4,8"/><polygon fill="var(--accent)" points="4,13 14,13 18,16 14,19 4,19 4,17 11,17 13,16 11,15 4,15"/></svg></span>{!compact && <span className="brand-name">DevPulse</span>}</>
  return asLink ? <Link className="brand" to="/app" aria-label="DevPulse home">{contents}</Link> : <div className="brand">{contents}</div>
}
