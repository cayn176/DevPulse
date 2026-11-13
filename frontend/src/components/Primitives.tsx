import { useEffect, useRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion } from 'motion/react'
import { LoaderCircle, Search } from 'lucide-react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  size?: 'normal' | 'small'
  loading?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'normal', loading = false, icon, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button className={'button button-' + variant + ' button-' + size + ' ' + className} disabled={disabled || loading} {...props}>
      {loading ? <LoaderCircle size={16} className="spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({ label, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={'icon-button ' + className} aria-label={label} title={label} {...props}>{children}</button>
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={'text-input ' + className} {...props} />
}

export function SearchInput({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="search-field">
      <Search size={16} aria-hidden="true" />
      <input className="text-input" type="search" {...props} />
      <kbd>⌘ K</kbd>
    </label>
  )
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
  )
}

export function Panel({ children, className = '', ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={'panel ' + className} {...props}>{children}</section>
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function LoadingPanel({ label = 'Loading your GitHub data' }: { label?: string }) {
  return <div className="state-panel" role="status"><span className="loading-ring" /><span>{label}</span></div>
}

export function ErrorPanel({ title = 'Could not load this data', detail, onRetry }: { title?: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="state-panel state-error" role="alert">
      <span className="state-symbol">!</span>
      <strong>{title}</strong>
      <span>{detail || 'Check your connection and try again.'}</span>
      {onRetry && <Button variant="quiet" size="small" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyPanel({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <motion.div className="state-panel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><span className="empty-orbit"><span /></span><strong>{title}</strong><span>{detail}</span>{action}</motion.div>
}

export function Dialog({ title, description, onClose, children, footer }: { title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const panel=useRef<HTMLElement>(null)
  const close=useRef(onClose)
  useEffect(()=>{close.current=onClose},[onClose])
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null
    const select='button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'
    const focusable=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>(select)||[]).filter(el=>el.offsetParent!==null)
    if(!panel.current?.contains(document.activeElement))focusable()[0]?.focus()
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close.current();return}
      if(event.key!=='Tab')return
      const nodes=focusable(),first=nodes[0],last=nodes.at(-1)
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus()}
    }
    document.addEventListener('keydown',key)
    return ()=>{document.removeEventListener('keydown',key);before?.focus()}
  },[])
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <motion.section ref={panel} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.99 }}>
        <div className="modal-heading">
          <div><h2 id="dialog-title">{title}</h2>{description && <p>{description}</p>}</div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </motion.section>
    </div>
  )
}
