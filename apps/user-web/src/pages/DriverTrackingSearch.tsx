import { useState } from 'react'
import styles from './DriverPage.module.css'

export function DriverTrackingSearch({
  initialCode, disabled, onSearch,
}: { initialCode: string; disabled: boolean; onSearch: (code: string) => void }) {
  const [input, setInput] = useState(initialCode)
  return (
    <form className={styles.searchContainer} onSubmit={(event) => {
      event.preventDefault()
      const code = input.trim()
      if (code) onSearch(code)
    }}>
      <input
        type="search" aria-label="Mã vận đơn" className={styles.searchInput}
        placeholder="Nhập mã vận đơn" value={input} onChange={(event) => setInput(event.target.value)}
        autoCapitalize="characters" spellCheck={false} maxLength={80}
      />
      <button type="submit" className={styles.searchBtn} disabled={disabled || !input.trim()}>Tìm đơn</button>
    </form>
  )
}
