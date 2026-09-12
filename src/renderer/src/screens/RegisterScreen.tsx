import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { BackButton } from '../components/BackButton';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { describeAuthError } from '../lib/authErrors';
import { useSessionStore } from '../state/useSessionStore';

export function RegisterScreen(): JSX.Element {
  const register = useSessionStore((s) => s.register);
  const lastError = useSessionStore((s) => s.lastError);
  const clearError = useSessionStore((s) => s.clearError);
  const backToWelcome = useSessionStore((s) => s.backToWelcome);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmMismatch, setConfirmMismatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    clearError();
    setConfirmMismatch(false);

    if (password !== confirmPassword) {
      setConfirmMismatch(true);
      return;
    }

    setSubmitting(true);
    await register({ name, email, password });
    setSubmitting(false);
  }

  return (
    <AuthLayout width="form">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-display font-bold text-ink">Set up AutoAI</h1>
          <p className="text-ui text-muted">Create your local profile. Everything stays on this machine.</p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormField
            id="name"
            label="Your name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <FormField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <FormField
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <FormField
            id="confirmPassword"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {confirmMismatch && <p className="text-ui text-danger">Passwords don’t match.</p>}
          {lastError && <p className="text-ui text-danger">{describeAuthError(lastError)}</p>}

          <PrimaryButton type="submit" size="lg" loading={submitting}>
            Create profile
          </PrimaryButton>
          <BackButton type="button" onClick={backToWelcome} disabled={submitting} className="self-center">
            Back
          </BackButton>
        </form>
      </div>
    </AuthLayout>
  );
}
