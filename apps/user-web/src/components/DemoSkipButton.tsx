import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commandOutcomeUnknown, useIntentKey } from '../hooks/useAuctionClock'
import { commandError } from '../lib/auction-errors'
import { getDemoSkipStatus } from '../services/auctions'
import styles from './DemoSkipButton.module.css'

type Props = {
  label: string
  note?: string
  /** One idempotent command. A retry reuses the same key. */
  run: (key: string) => Promise<unknown>
  onDone: () => Promise<unknown>
}

/**
 * Visible local-demo skip. It renders only when the server enables the gate,
 * so a normal deployment never shows a demo control. The command is the only
 * thing that can change state; this button never edits data on its own.
 */
export function DemoSkipButton({ label, note, run, onDone }: Props) {
  const status = useQuery({
    queryKey: ['demo-skip'],
    queryFn: getDemoSkipStatus,
    staleTime: Infinity,
    retry: false,
  })
  const intent = useIntentKey()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingSignature, setPendingSignature] = useState<string | null>(null)
  if (!status.data?.enabled) return null
  const skip = async () => {
    const signature = pendingSignature ?? `${label}:${note ?? ''}`
    setPendingSignature(signature)
    setBusy(true)
    setError(null)
    try {
      await run(intent.keyFor(signature))
      intent.settle()
      setPendingSignature(null)
      await onDone()
    } catch (caught) {
      if (!commandOutcomeUnknown(caught)) {
        intent.settle()
        setPendingSignature(null)
      }
      setError(commandError(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.skip}
        disabled={busy}
        onClick={() => void skip()}
      >
        {busy ? 'Đang bỏ qua chờ…' : label}
      </button>
      {note && !error && <p className={styles.note}>{note}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
