import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannel } from '@shared/ipc-contract';
import type { LoginInput, RegisterInput, TargetType } from '@shared/ipc-contract';
import type { AssistantService } from '../services/AssistantService';
import type { AuthService } from '../services/AuthService';
import type { CaseGenerationService } from '../services/CaseGenerationService';
import type { ClaudeConnectionService } from '../services/ClaudeConnectionService';
import { parseAddMcpServerInput } from '../services/McpServerService';
import type { McpServerService } from '../services/McpServerService';
import type { SystemToolInstaller } from '../services/SystemToolInstaller';
import type { PlaywrightBrowserInstaller } from '../services/PlaywrightBrowserInstaller';
import type { UrlOpener } from '../services/UrlOpener';
import type { UrlReachabilityChecker } from '../services/UrlReachabilityChecker';
import { parseModelPreference } from '../services/ModelPreferenceService';
import type { ModelPreferenceService } from '../services/ModelPreferenceService';
import type { ProjectSetupService } from '../services/ProjectSetupService';
import type { ProjectScanService } from '../services/ProjectScanService';
import type { ProjectService } from '../services/ProjectService';
import type { TestRunnerService } from '../services/TestRunnerService';
import type { TestPlanService } from '../services/TestPlanService';
import {
  parseCreateAreaInput,
  parseCreateTestCaseInput,
  parseImportTestCasesInput,
  parseMoveTestCaseInput,
  parseRenameAreaInput,
} from '../services/TestPlanService';

/**
 * Every channel the renderer can reach, registered in one place so the set
 * of things a compromised or buggy renderer could ask the main process to
 * do is easy to audit at a glance. The auth/session channels touch only the
 * local profile store; the project channels are the only ones that spawn a
 * process (git clone) or read from an arbitrary path the user picks via a
 * native, OS-mediated dialog - never a raw path typed into a text field. The
 * scan channels are the only ones that send a project's code to Claude, and
 * only when this handler is actually invoked - never silently.
 */
export function registerIpcHandlers(
  authService: AuthService,
  projectService: ProjectService,
  testPlanService: TestPlanService,
  claudeConnectionService: ClaudeConnectionService,
  modelPreferenceService: ModelPreferenceService,
  projectScanService: ProjectScanService,
  caseGenerationService: CaseGenerationService,
  testRunnerService: TestRunnerService,
  projectSetupService: ProjectSetupService,
  assistantService: AssistantService,
  mcpServerService: McpServerService,
  systemToolInstaller: SystemToolInstaller,
  playwrightBrowserInstaller: PlaywrightBrowserInstaller,
  urlOpener: UrlOpener,
  urlReachabilityChecker: UrlReachabilityChecker,
): void {
  ipcMain.handle(IpcChannel.AuthHasProfile, () => {
    return authService.hasProfile();
  });

  ipcMain.handle(IpcChannel.AuthRegister, (_event, input: RegisterInput) => {
    return authService.register(input);
  });

  ipcMain.handle(IpcChannel.AuthLogin, (_event, input: LoginInput) => {
    return authService.login(input);
  });

  ipcMain.handle(IpcChannel.AuthLogout, () => {
    return authService.logout();
  });

  ipcMain.handle(IpcChannel.SessionGetCurrent, () => {
    return authService.getCurrentSession();
  });

  ipcMain.handle(IpcChannel.ProjectsAddFromGit, (_event, input: { url: string; branch?: string; name?: string }) => {
    return projectService.addFromGit(input);
  });

  ipcMain.handle(IpcChannel.ProjectsAddFromLocalPath, (_event, input: { path: string; name?: string }) => {
    return projectService.addFromLocalPath(input);
  });

  ipcMain.handle(IpcChannel.ProjectsPickLocalFolder, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(IpcChannel.ProjectsList, () => {
    return projectService.list();
  });

  ipcMain.handle(IpcChannel.ProjectsRemove, (_event, id: string) => {
    projectService.remove(id);
  });

  ipcMain.handle(IpcChannel.ProjectsSetOverride, (_event, id: string, targetType: TargetType | null) => {
    return projectService.setOverride(id, targetType);
  });

  ipcMain.handle(IpcChannel.ProjectsRunDetection, (_event, id: string) => {
    return projectService.runDetection(id);
  });

  ipcMain.handle(IpcChannel.ProjectsSetBaseUrl, (_event, id: unknown, url: unknown) => {
    if (typeof id !== 'string') return null;
    if (url !== null && typeof url !== 'string') return null;
    return projectService.setBaseUrl(id, url);
  });

  ipcMain.handle(IpcChannel.ProjectsSetTestCaseFolder, (_event, id: unknown, path: unknown) => {
    if (typeof id !== 'string') return null;
    if (path !== null && typeof path !== 'string') return null;
    return projectService.setTestCaseFolder(id, path);
  });

  // Every payload below is parsed before it touches the service, same
  // reasoning as the note at the top of this file: a renderer that is
  // sandboxed is not the same thing as a renderer that is trusted.
  ipcMain.handle(IpcChannel.TestPlanList, (_event, projectId: unknown) => {
    if (typeof projectId !== 'string') return { areas: [], cases: [] };
    return testPlanService.list(projectId);
  });

  ipcMain.handle(IpcChannel.TestPlanCreateArea, (_event, rawInput: unknown) => {
    const input = parseCreateAreaInput(rawInput);
    if (input === null) return { ok: false, error: 'INVALID_INPUT' };
    return testPlanService.createArea(input);
  });

  ipcMain.handle(IpcChannel.TestPlanRenameArea, (_event, rawInput: unknown) => {
    const input = parseRenameAreaInput(rawInput);
    if (input === null) return { ok: false, error: 'INVALID_INPUT' };
    return testPlanService.renameArea(input);
  });

  ipcMain.handle(IpcChannel.TestPlanCreateCase, (_event, rawInput: unknown) => {
    const input = parseCreateTestCaseInput(rawInput);
    if (input === null) return { ok: false, error: 'INVALID_INPUT' };
    return testPlanService.createCase(input);
  });

  ipcMain.handle(IpcChannel.TestPlanMoveCase, (_event, rawInput: unknown) => {
    const input = parseMoveTestCaseInput(rawInput);
    if (input === null) return { ok: false, error: 'INVALID_INPUT' };
    return testPlanService.moveCase(input);
  });

  ipcMain.handle(IpcChannel.TestPlanDeleteCase, (_event, caseId: unknown) => {
    if (typeof caseId !== 'string') return { ok: false, error: 'INVALID_INPUT' };
    return testPlanService.deleteCase(caseId);
  });

  ipcMain.handle(IpcChannel.TestPlanImportCases, (_event, rawInput: unknown) => {
    const input = parseImportTestCasesInput(rawInput);
    if (input === null) return { ok: false, error: 'INVALID_INPUT' };
    return testPlanService.importCases(input);
  });

  ipcMain.handle(IpcChannel.ClaudeCheckConnection, () => {
    return claudeConnectionService.check();
  });

  ipcMain.handle(IpcChannel.ClaudeGetModelPreference, () => {
    return modelPreferenceService.get();
  });

  ipcMain.handle(IpcChannel.ClaudeSetModelPreference, (_event, preference: unknown) => {
    const parsed = parseModelPreference(preference);
    if (!parsed) return modelPreferenceService.get();
    return modelPreferenceService.set(parsed);
  });

  ipcMain.handle(IpcChannel.ProjectScanRun, (_event, projectId: unknown) => {
    if (typeof projectId !== 'string') return { ok: false, error: 'PROJECT_NOT_FOUND' };
    return projectScanService.run(projectId);
  });

  ipcMain.handle(IpcChannel.ProjectScanGetLast, (_event, projectId: unknown) => {
    if (typeof projectId !== 'string') return null;
    return projectScanService.getLast(projectId);
  });

  ipcMain.handle(IpcChannel.CaseGenerationRun, (_event, projectId: unknown, prompt: unknown) => {
    if (typeof projectId !== 'string') return { ok: false, error: 'PROJECT_NOT_FOUND' };
    if (typeof prompt !== 'string') return { ok: false, error: 'PROMPT_REQUIRED' };
    return caseGenerationService.generate(projectId, prompt);
  });

  ipcMain.handle(IpcChannel.RunsRun, (_event, caseId: unknown) => {
    if (typeof caseId !== 'string') return { ok: false, error: 'CASE_NOT_FOUND' };
    return testRunnerService.run(caseId);
  });

  ipcMain.handle(IpcChannel.RunsListForProject, (_event, projectId: unknown) => {
    if (typeof projectId !== 'string') return [];
    return testRunnerService.listForProject(projectId);
  });

  ipcMain.handle(IpcChannel.RunsListAll, () => {
    return testRunnerService.listAll();
  });

  ipcMain.handle(IpcChannel.SetupRun, (_event, projectId: unknown) => {
    if (typeof projectId !== 'string') return { ok: false, error: 'PROJECT_NOT_FOUND' };
    return projectSetupService.run(projectId);
  });

  ipcMain.handle(IpcChannel.SetupStop, (_event, projectId: unknown) => {
    if (typeof projectId !== 'string') return;
    projectSetupService.stop(projectId);
  });

  ipcMain.handle(IpcChannel.AssistantSend, (_event, message: unknown, sessionId: unknown) => {
    if (typeof message !== 'string') return { ok: false, error: 'ASSISTANT_FAILED', detail: 'Invalid message.' };
    return assistantService.send(message, typeof sessionId === 'string' ? sessionId : null);
  });

  ipcMain.handle(IpcChannel.McpServersList, () => {
    return mcpServerService.list();
  });

  ipcMain.handle(IpcChannel.McpServersAdd, (_event, input: unknown) => {
    const parsed = parseAddMcpServerInput(input);
    if (!parsed) return { ok: false, error: 'COMMAND_REQUIRED' };
    return mcpServerService.add(parsed);
  });

  ipcMain.handle(IpcChannel.McpServersRemove, (_event, id: unknown) => {
    if (typeof id !== 'string') return;
    mcpServerService.remove(id);
  });

  ipcMain.handle(IpcChannel.SystemToolInstall, (_event, binary: unknown) => {
    if (typeof binary !== 'string') return { ok: false, error: 'NOT_INSTALLABLE' };
    return systemToolInstaller.install(binary);
  });

  ipcMain.handle(IpcChannel.PlaywrightBrowsersInstall, () => {
    return playwrightBrowserInstaller.install();
  });

  ipcMain.handle(IpcChannel.SystemOpenUrl, (_event, url: unknown) => {
    if (typeof url !== 'string') return { ok: false, error: 'INVALID_URL' };
    return urlOpener.open(url);
  });

  ipcMain.handle(IpcChannel.SystemCheckUrlReachable, (_event, url: unknown) => {
    if (typeof url !== 'string') return { reachable: false, status: null };
    return urlReachabilityChecker.check(url);
  });
}
