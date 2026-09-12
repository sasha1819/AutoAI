import { AuthLayout } from '../components/AuthLayout';
import { PrimaryButton } from '../components/PrimaryButton';
import { useSessionStore } from '../state/useSessionStore';

/**
 * First thing anyone sees on a machine with no profile yet. It exists so
 * the app opens by explaining what it is, rather than by demanding a
 * password from someone who hasn't been told what they're signing up for.
 *
 * Copy here is in the plain register on purpose: at this point nobody has
 * picked a role yet, so it has to read for a manual tester, which per the
 * component-patterns skill is the safe default when the audience is unknown.
 */

const SETUP_STEPS = [
  {
    step: '01',
    title: 'Create your profile',
    text: 'Name, email, and a password. It stays on this machine - nothing is uploaded.',
  },
  {
    step: '02',
    title: 'Tell us how you work',
    text: 'Manual testing, automation, or leading a team. It shapes how AutoAI talks to you.',
  },
  {
    step: '03',
    title: 'Point AutoAI at your app',
    text: 'Mobile, web, or desktop. AutoAI looks through it and shows you what it found.',
  },
] as const;

export function WelcomeScreen(): JSX.Element {
  const startRegistration = useSessionStore((s) => s.startRegistration);

  return (
    <AuthLayout width="wide">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-display font-bold text-ink">
            Turn the testing you already do into automated runs
          </h1>
          <p className="text-ui text-muted">
            You don&rsquo;t need to know Appium, Playwright, or any of the tools underneath. Setting
            up takes three steps, and you can change any of your answers later.
          </p>
        </div>

        <ol className="flex flex-col gap-3">
          {SETUP_STEPS.map((item) => (
            <li
              key={item.step}
              className="flex flex-col gap-2 rounded-lg border border-hairline bg-raised p-4"
            >
              <span className="font-mono text-caption font-semibold text-accent-deep">{item.step}</span>
              <div className="flex flex-col gap-1">
                <p className="font-display text-card font-bold text-ink">{item.title}</p>
                <p className="text-caption text-muted">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <PrimaryButton size="lg" className="w-full" onClick={startRegistration}>
          Start guided setup
        </PrimaryButton>
      </div>
    </AuthLayout>
  );
}
