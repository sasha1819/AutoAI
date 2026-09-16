import { describe, expect, it } from 'vitest';
import { McpServerService, parseAddMcpServerInput } from '../src/main/services/McpServerService';
import type { McpServerRepository } from '../src/main/services/McpServerStore';
import type { McpServerEntry } from '../src/shared/ipc-contract';

class FakeMcpServerRepository implements McpServerRepository {
  private servers: McpServerEntry[] = [];

  list(): McpServerEntry[] {
    return this.servers;
  }

  add(server: McpServerEntry): void {
    this.servers.push(server);
  }

  remove(id: string): void {
    this.servers = this.servers.filter((s) => s.id !== id);
  }
}

describe('parseAddMcpServerInput', () => {
  it('accepts a valid shape', () => {
    expect(
      parseAddMcpServerInput({ name: 'weather', command: 'npx', args: ['weather-mcp'], env: { API_KEY: 'x' } }),
    ).toEqual({ name: 'weather', command: 'npx', args: ['weather-mcp'], env: { API_KEY: 'x' } });
  });

  it('accepts empty args and env', () => {
    expect(parseAddMcpServerInput({ name: 'weather', command: 'npx', args: [], env: {} })).toEqual({
      name: 'weather',
      command: 'npx',
      args: [],
      env: {},
    });
  });

  it('rejects a non-object payload', () => {
    expect(parseAddMcpServerInput('weather')).toBeNull();
    expect(parseAddMcpServerInput(null)).toBeNull();
    expect(parseAddMcpServerInput(undefined)).toBeNull();
  });

  it('rejects a missing field', () => {
    expect(parseAddMcpServerInput({ command: 'npx', args: [], env: {} })).toBeNull();
    expect(parseAddMcpServerInput({ name: 'weather', args: [], env: {} })).toBeNull();
    expect(parseAddMcpServerInput({ name: 'weather', command: 'npx', env: {} })).toBeNull();
    expect(parseAddMcpServerInput({ name: 'weather', command: 'npx', args: [] })).toBeNull();
  });

  it('rejects the wrong type for a field rather than coercing it', () => {
    expect(parseAddMcpServerInput({ name: 42, command: 'npx', args: [], env: {} })).toBeNull();
    expect(parseAddMcpServerInput({ name: 'weather', command: 42, args: [], env: {} })).toBeNull();
    expect(parseAddMcpServerInput({ name: 'weather', command: 'npx', args: 'weather-mcp', env: {} })).toBeNull();
    expect(parseAddMcpServerInput({ name: 'weather', command: 'npx', args: [1, 2], env: {} })).toBeNull();
    expect(parseAddMcpServerInput({ name: 'weather', command: 'npx', args: [], env: 'x' })).toBeNull();
    expect(parseAddMcpServerInput({ name: 'weather', command: 'npx', args: [], env: { API_KEY: 1 } })).toBeNull();
  });
});

describe('McpServerService', () => {
  it('adds a server and assigns it an id', () => {
    const service = new McpServerService(new FakeMcpServerRepository());

    const result = service.add({ name: 'weather', command: 'npx', args: ['weather-mcp'], env: {} });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.server.name).toBe('weather');
      expect(result.server.command).toBe('npx');
      expect(result.server.id).toBeTruthy();
    }
    expect(service.list()).toHaveLength(1);
  });

  it('rejects an empty name', () => {
    const service = new McpServerService(new FakeMcpServerRepository());
    expect(service.add({ name: '  ', command: 'npx', args: [], env: {} })).toEqual({
      ok: false,
      error: 'NAME_REQUIRED',
    });
  });

  it('rejects the reserved "autoai" name', () => {
    const service = new McpServerService(new FakeMcpServerRepository());
    expect(service.add({ name: 'autoai', command: 'npx', args: [], env: {} })).toEqual({
      ok: false,
      error: 'NAME_RESERVED',
    });
  });

  it('rejects an empty command', () => {
    const service = new McpServerService(new FakeMcpServerRepository());
    expect(service.add({ name: 'weather', command: '   ', args: [], env: {} })).toEqual({
      ok: false,
      error: 'COMMAND_REQUIRED',
    });
  });

  it('rejects a duplicate name', () => {
    const service = new McpServerService(new FakeMcpServerRepository());
    service.add({ name: 'weather', command: 'npx', args: [], env: {} });

    const result = service.add({ name: 'weather', command: 'other-command', args: [], env: {} });

    expect(result).toEqual({ ok: false, error: 'NAME_TAKEN' });
    expect(service.list()).toHaveLength(1);
  });

  it('lists every added server', () => {
    const service = new McpServerService(new FakeMcpServerRepository());
    service.add({ name: 'weather', command: 'npx', args: [], env: {} });
    service.add({ name: 'search', command: 'uvx', args: [], env: {} });

    expect(service.list().map((s) => s.name).sort()).toEqual(['search', 'weather']);
  });

  it('removes a server by id', () => {
    const service = new McpServerService(new FakeMcpServerRepository());
    const added = service.add({ name: 'weather', command: 'npx', args: [], env: {} });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    service.remove(added.server.id);

    expect(service.list()).toHaveLength(0);
  });
});
