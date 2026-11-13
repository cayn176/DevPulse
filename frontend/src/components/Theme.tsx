import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
type Preference = Theme | 'system'
type ThemeValue = { theme: Theme; preference: Preference; setPreference: (p:Preference)=>void; toggleTheme:()=>void }
const ThemeContext = createContext<ThemeValue|null>(null)

export function ThemeProvider({children}:{children:React.ReactNode}) {
  const [choice,setChoice] = useState<Preference>(() => {
    const value=localStorage.getItem('devpulse-theme')
    return value==='system'||value==='light'?value:'dark'
  })
  const query='(prefers-color-scheme: dark)'
  const [system,setSystem]=useState(window.matchMedia(query).matches)
  const theme:Theme=choice==='system'?(system?'dark':'light'):choice
  useEffect(()=>{
    const observer=window.matchMedia(query)
    const change=()=>setSystem(observer.matches)
    observer.addEventListener('change',change)
    return ()=>observer.removeEventListener('change',change)
  },[])
  useEffect(()=>{
    localStorage.setItem('devpulse-theme',choice)
    document.documentElement.dataset.theme=theme
    document.documentElement.dataset.preference=choice
  },[choice,theme])
  return <ThemeContext.Provider value={{theme,preference:choice,setPreference:setChoice,toggleTheme:()=>setChoice(theme==='dark'?'light':'dark')}}>{children}</ThemeContext.Provider>
}
export function useTheme(){
  const theme=useContext(ThemeContext)
  if(!theme)throw new Error('Theme provider is unavailable')
  return theme
}
