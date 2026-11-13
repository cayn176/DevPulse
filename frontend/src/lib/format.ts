export function formatNumber(value: number | null | undefined) {
  return value == null ? '—' : new Intl.NumberFormat('en-US', { notation: value > 9999 ? 'compact' : 'standard' }).format(value)
}

export function relativeDate(value: string | null | undefined) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Date unavailable'
  const days = Math.round((date.valueOf() - Date.now()) / 86_400_000)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (Math.abs(days) < 1) return formatter.format(0, 'day')
  if (Math.abs(days) < 30) return formatter.format(days, 'day')
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) return formatter.format(months, 'month')
  return formatter.format(Math.round(months / 12), 'year')
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Not available'
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)
}

export function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

export function languageHue(language: string) {
  const colors: Record<string, string> = {
    TypeScript: '#5c9eff', JavaScript: '#eac54f', Python: '#58a6ff', Rust: '#e27b54',
    Go: '#38bdf8', HTML: '#e88157', CSS: '#a78bfa', Java: '#e68a5f',
    Swift: '#f16f4e', Kotlin: '#bc8cff', Ruby: '#ed6a72', Shell: '#59bd88',
    PHP: '#9896e8', C: '#739ad1', 'C++': '#e56d84', Vue: '#45b883',
  }
  return colors[language] ?? '#9a7bff'
}
