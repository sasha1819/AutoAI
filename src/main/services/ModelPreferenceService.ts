import type { ModelPreference } from '@shared/ipc-contract';
import { CLAUDE_EFFORT_OPTIONS, CLAUDE_MODEL_OPTIONS } from '@shared/ipc-contract';
import type { ModelPreferenceRepository } from './ModelPreferenceStore';

const VALID_MODEL_IDS = new Set<string>(CLAUDE_MODEL_OPTIONS.map((option) => option.id));
const VALID_EFFORT_LEVELS = new Set<string>(CLAUDE_EFFORT_OPTIONS);

/** Renderer-supplied input parsed and validated before it ever reaches
 *  disk - an invalid model id or effort level is silently dropped to null
 *  (the safe "use the account default" state) rather than persisted, the
 *  same defensive-parsing discipline this app applies to any other
 *  renderer-supplied value that crosses the IPC boundary. */
export function parseModelPreference(raw: unknown): ModelPreference | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const model = row['model'];
  const effort = row['effort'];

  if (model !== null && typeof model !== 'string') return null;
  if (effort !== null && typeof effort !== 'string') return null;

  return {
    model: typeof model === 'string' && VALID_MODEL_IDS.has(model) ? model : null,
    effort: typeof effort === 'string' && VALID_EFFORT_LEVELS.has(effort) ? (effort as ModelPreference['effort']) : null,
  };
}

/** Owns which Claude model/effort every Agent SDK call in this app uses -
 *  see AgentRunner, which reads this at call time so existing callers never
 *  need to know the setting exists. */
export class ModelPreferenceService {
  constructor(private readonly repository: ModelPreferenceRepository) {}

  public get(): ModelPreference {
    return this.repository.get();
  }

  public set(preference: ModelPreference): ModelPreference {
    this.repository.set(preference);
    return preference;
  }
}
