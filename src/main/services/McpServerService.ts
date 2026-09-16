import { randomUUID } from 'node:crypto';
import type { AddMcpServerInput, AddMcpServerResult, McpServerEntry } from '@shared/ipc-contract';
import { RESERVED_MCP_SERVER_NAME } from '@shared/ipc-contract';
import type { McpServerRepository } from './McpServerStore';

/** Renderer-supplied input parsed before it ever reaches disk - the same
 *  "never trust the annotation" discipline every other IPC handler in this
 *  app applies to user-supplied data. Returns null for a payload that
 *  isn't even the right shape; field-level problems (empty name, reserved
 *  name, ...) are McpServerService.add's job, since those need the
 *  existing list to check against (uniqueness) and produce a real
 *  McpServerErrorCode, not just a parse failure. */
export function parseAddMcpServerInput(raw: unknown): AddMcpServerInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const name = row['name'];
  const command = row['command'];
  const argsRaw = row['args'];
  const envRaw = row['env'];

  if (typeof name !== 'string') return null;
  if (typeof command !== 'string') return null;
  if (!Array.isArray(argsRaw) || !argsRaw.every((a) => typeof a === 'string')) return null;
  if (typeof envRaw !== 'object' || envRaw === null) return null;
  const env = envRaw as Record<string, unknown>;
  if (!Object.values(env).every((v) => typeof v === 'string')) return null;

  return { name, command, args: argsRaw as string[], env: env as Record<string, string> };
}

/**
 * Owns the user's own MCP servers - reachable only from "Ask AutoAI," never
 * from a scan or case generation, which keep their narrow, fixed tool lists
 * on purpose (see AssistantService, the only reader of this list). Adding
 * one runs a real command with real access on this machine the moment
 * it's actually used - this service only ever stores the configuration,
 * it never starts anything itself.
 */
export class McpServerService {
  constructor(private readonly repository: McpServerRepository) {}

  public list(): McpServerEntry[] {
    return this.repository.list();
  }

  public add(input: AddMcpServerInput): AddMcpServerResult {
    const name = input.name.trim();
    if (name.length === 0) {
      return { ok: false, error: 'NAME_REQUIRED' };
    }
    if (name === RESERVED_MCP_SERVER_NAME) {
      return { ok: false, error: 'NAME_RESERVED' };
    }
    if (input.command.trim().length === 0) {
      return { ok: false, error: 'COMMAND_REQUIRED' };
    }
    if (this.repository.list().some((s) => s.name === name)) {
      return { ok: false, error: 'NAME_TAKEN' };
    }

    const server: McpServerEntry = {
      id: randomUUID(),
      name,
      command: input.command.trim(),
      args: input.args,
      env: input.env,
    };
    this.repository.add(server);
    return { ok: true, server };
  }

  public remove(id: string): void {
    this.repository.remove(id);
  }
}
