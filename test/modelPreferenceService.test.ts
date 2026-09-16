import { describe, expect, it } from 'vitest';
import { ModelPreferenceService, parseModelPreference } from '../src/main/services/ModelPreferenceService';
import type { ModelPreferenceRepository } from '../src/main/services/ModelPreferenceStore';
import type { ModelPreference } from '../src/shared/ipc-contract';

class FakeModelPreferenceRepository implements ModelPreferenceRepository {
  private preference: ModelPreference = { model: null, effort: null };

  get(): ModelPreference {
    return this.preference;
  }

  set(preference: ModelPreference): void {
    this.preference = preference;
  }
}

describe('parseModelPreference', () => {
  it('accepts a known model id and effort level', () => {
    expect(parseModelPreference({ model: 'claude-sonnet-5', effort: 'high' })).toEqual({
      model: 'claude-sonnet-5',
      effort: 'high',
    });
  });

  it('accepts explicit nulls - the real "use the account default" state', () => {
    expect(parseModelPreference({ model: null, effort: null })).toEqual({ model: null, effort: null });
  });

  it('drops an unrecognized model id to null rather than persisting a guess', () => {
    expect(parseModelPreference({ model: 'gpt-5', effort: 'medium' })).toEqual({ model: null, effort: 'medium' });
  });

  it('drops an unrecognized effort level to null', () => {
    expect(parseModelPreference({ model: 'claude-sonnet-5', effort: 'ludicrous' })).toEqual({
      model: 'claude-sonnet-5',
      effort: null,
    });
  });

  it('rejects a non-object payload entirely', () => {
    expect(parseModelPreference('claude-sonnet-5')).toBeNull();
    expect(parseModelPreference(null)).toBeNull();
  });

  it('rejects the wrong type for either field rather than coercing it', () => {
    expect(parseModelPreference({ model: 42, effort: 'high' })).toBeNull();
    expect(parseModelPreference({ model: 'claude-sonnet-5', effort: 7 })).toBeNull();
  });
});

describe('ModelPreferenceService', () => {
  it('defaults to "use the account default" (both null) before anything is set', () => {
    const service = new ModelPreferenceService(new FakeModelPreferenceRepository());
    expect(service.get()).toEqual({ model: null, effort: null });
  });

  it('persists and returns what was set', () => {
    const service = new ModelPreferenceService(new FakeModelPreferenceRepository());
    const result = service.set({ model: 'claude-haiku-4-5-20251001', effort: 'low' });

    expect(result).toEqual({ model: 'claude-haiku-4-5-20251001', effort: 'low' });
    expect(service.get()).toEqual({ model: 'claude-haiku-4-5-20251001', effort: 'low' });
  });
});
