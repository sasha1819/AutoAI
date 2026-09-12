import { useState } from 'react';
import { ROLE_OPTIONS } from '@shared/ipc-contract';
import type { UserRole } from '@shared/ipc-contract';
import { AuthLayout } from '../components/AuthLayout';
import { PrimaryButton } from '../components/PrimaryButton';
import { RoleCard } from '../components/RoleCard';
import { useSessionStore } from '../state/useSessionStore';

export function OnboardingScreen(): JSX.Element {
  const setRole = useSessionStore((s) => s.setRole);
  const session = useSessionStore((s) => s.session);
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue(): Promise<void> {
    if (!selected) return;
    setSubmitting(true);
    await setRole(selected);
    setSubmitting(false);
  }

  return (
    <AuthLayout width="wide">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-display font-bold text-ink">
            {session ? `One more thing, ${session.name.split(' ')[0]}` : 'One more thing'}
          </h1>
          <p className="text-ui text-muted">
            Which of these best describes you? This just shapes how AutoAI talks to you - you can
            change it later.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {ROLE_OPTIONS.map((option) => (
            <RoleCard
              key={option.role}
              option={option}
              selected={selected === option.role}
              onSelect={() => setSelected(option.role)}
            />
          ))}
        </div>

        <PrimaryButton size="lg" onClick={handleContinue} disabled={!selected} loading={submitting}>
          Continue
        </PrimaryButton>
      </div>
    </AuthLayout>
  );
}
