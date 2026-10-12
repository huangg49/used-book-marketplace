import {
  createContext, useContext, useLayoutEffect, useRef, useState,
  type ComponentProps, type SubmitEvent,
} from 'react';
import { CircleAlert, Check } from 'lucide-react';
import { authFieldError, authFieldSuccess, type AuthFieldSnapshot } from './auth-field-validation';
import styles from './LoginPage.module.css';

type Feedback = { touched: boolean; error?: string; success?: string; hint?: string };
const FeedbackContext = createContext<Record<string, Feedback>>({});

function snapshot(input: HTMLInputElement): AuthFieldSnapshot {
  const password = input.form?.elements.namedItem('password');
  return {
    name: input.name, value: input.value, minLength: input.minLength,
    maxLength: input.maxLength, validity: input.validity,
    password: password instanceof HTMLInputElement ? password.value : undefined,
  };
}

function feedback(input: HTMLInputElement, touched: boolean): Feedback {
  const field = snapshot(input);
  return {
    touched,
    error: touched ? authFieldError(field) : undefined,
    success: authFieldSuccess(field),
    hint: field.name === 'password' && field.minLength > 0 && field.value
      ? `Mật khẩu từ ${field.minLength} đến ${field.maxLength} ký tự.` : undefined,
  };
}

/** Native constraints still gate submission; this only replaces browser tooltips. */
export function AuthForm({ children, onSubmit, ...props }: ComponentProps<'form'>) {
  const [fields, setFields] = useState<Record<string, Feedback>>({});
  const focusAfterValidation = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    focusAfterValidation.current?.focus();
    focusAfterValidation.current = null;
  }, [fields]);

  function update(input: HTMLInputElement, reveal: boolean) {
    if (!input.id || !input.willValidate) return;
    setFields((previous) => {
      const next = { ...previous, [input.id]: feedback(input, reveal || !!previous[input.id]?.touched) };
      // Editing the original password must refresh an already visited confirmation.
      const confirmation = input.form?.elements.namedItem('passwordConfirmation');
      if (input.name === 'password' && confirmation instanceof HTMLInputElement && previous[confirmation.id])
        next[confirmation.id] = feedback(confirmation, previous[confirmation.id].touched);
      return next;
    });
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, Feedback> = {};
    let firstInvalid: HTMLInputElement | undefined;
    for (const control of Array.from(event.currentTarget.elements)) {
      if (!(control instanceof HTMLInputElement) || !control.willValidate || !control.id) continue;
      next[control.id] = feedback(control, true);
      if (next[control.id].error && !firstInvalid) firstInvalid = control;
    }
    setFields(next);
    if (firstInvalid) {
      focusAfterValidation.current = firstInvalid;
      return;
    }
    onSubmit?.(event);
  }

  return <FeedbackContext.Provider value={fields}>
    <form {...props} noValidate onSubmit={submit}
      onBlur={(event) => { props.onBlur?.(event); if (event.target instanceof HTMLInputElement) update(event.target, true); }}
      onChange={(event) => {
        props.onChange?.(event);
        // Read controlled/sanitized values after React commits the input event.
        const input = event.target;
        queueMicrotask(() => {
          if (input instanceof HTMLInputElement && input.isConnected) update(input, false);
        });
      }}>
      {children}
    </form>
  </FeedbackContext.Provider>;
}

export function AuthFieldFeedback({ id, fieldError }: { id: string; fieldError?: string }) {
  const field = useContext(FeedbackContext)[id];
  const error = field?.error || fieldError;
  const message = error || field?.success || field?.hint;
  return <p id={id + '-feedback'} className={styles.fieldFeedback}
    data-tone={error ? 'error' : field?.success ? 'success' : undefined}
    data-empty={!message || undefined} aria-live="polite" aria-atomic="true">
    {message && <>{error ? <CircleAlert size={14} aria-hidden="true" /> : field?.success ? <Check size={14} aria-hidden="true" /> : null}<span>{message}</span></>}
  </p>;
}

export function AuthInput({ fieldError, ...props }: ComponentProps<'input'> & { id: string; fieldError?: string }) {
  const field = useContext(FeedbackContext)[props.id];
  const hasFeedback = field?.error || fieldError || field?.success || field?.hint;
  const describedBy = [props['aria-describedby'], hasFeedback ? props.id + '-feedback' : undefined].filter(Boolean).join(' ') || undefined;
  return <>
    <input {...props} aria-invalid={field?.error || fieldError ? true : props['aria-invalid']}
      aria-describedby={describedBy} />
    {props.type !== 'checkbox' && <AuthFieldFeedback id={props.id} fieldError={fieldError} />}
  </>;
}
