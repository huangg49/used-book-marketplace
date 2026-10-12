import { useEffect, useRef, useState } from 'react';
import { accountError, accountErrorField } from '../services/account-auth';

export function useAccountForm() {
  const active = useRef(true);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setErrorText] = useState('');
  const [errorField, setErrorField] = useState<'code'>();
  function setError(value: string) { setErrorText(value); setErrorField(undefined); }
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    update();
    if (!until) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [until]);
  async function run(task: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError('');
    try { await task(); } catch (caught) {
      if (active.current) { setErrorText(accountError(caught)); setErrorField(accountErrorField(caught)); }
    }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return { busy, error, errorField, message, remaining, active, run, setError, setMessage,
    cooldown: () => { setUntil(Date.now() + 60_000); setRemaining(60); } };
}
