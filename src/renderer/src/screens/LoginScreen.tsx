import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { describeAuthError } from '../lib/authErrors';
import { useSessionStore } from '../state/useSessionStore';

export function LoginScreen(): JSX.Element {
  const login = useSessionStore((s) => s.login);
  const lastError = useSessionStore((s) => s.lastError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await login({ email, password });
    setSubmitting(false);
  }

  return (
    <AuthLayout width="form">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-display font-bold text-ink">Welcome back</h1>
          <p className="text-ui text-muted">Log in to your local AutoAI profile.</p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {lastError && <p className="text-ui text-danger">{describeAuthError(lastError)}</p>}

          <PrimaryButton type="submit" size="lg" loading={submitting}>
            Log in
          </PrimaryButton>
        </form>
      </div>
    </AuthLayout>
  );
}
