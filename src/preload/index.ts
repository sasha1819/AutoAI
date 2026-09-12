import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel } from '@shared/ipc-contract';
import type {
  AddProjectResult,
  AreaResult,
  AssistantSendResult,
  AuthResult,
  AutoaiApi,
  CaseGenerationResult,
  ClaudeConnectionStatus,
  CreateAreaInput,
  CreateTestCaseInput,
  DeleteTestCaseResult,
  ImportTestCasesInput,
  ImportTestCasesResult,
  LoginInput,
  MoveTestCaseInput,
  OnboardingResult,
  Project,
  ProjectScanResult,
  RegisterInput,
  RenameAreaInput,
  RunRecord,
  RunResult,
  ScanRunResult,
  SessionState,
  SetupRunResult,
  TargetType,
  TestCaseResult,
  TestPlan,
  UserRole,
} from '@shared/ipc-contract';

/**
 * The only door between the (sandboxed, no-Node-access) renderer and the
 * main process. Every function here maps 1:1 to one IPC channel and one
 * typed payload - the renderer never gets ipcRenderer itself, so it cannot
 * invoke an arbitrary channel or listen on one it wasn't given.
 */
const autoaiApi: AutoaiApi = {
  auth: {
    hasProfile: (): Promise<boolean> => ipcRenderer.invoke(IpcChannel.AuthHasProfile),
    register: (input: RegisterInput): Promise<AuthResult> =>
      ipcRenderer.invoke(IpcChannel.AuthRegister, input),
    login: (input: LoginInput): Promise<AuthResult> => ipcRenderer.invoke(IpcChannel.AuthLogin, input),
    logout: (): Promise<void> => ipcRenderer.invoke(IpcChannel.AuthLogout),
  },
  onboarding: {
    setRole: (role: UserRole): Promise<OnboardingResult> =>
      ipcRenderer.invoke(IpcChannel.OnboardingSetRole, role),
  },
  session: {
    getCurrent: (): Promise<SessionState | null> => ipcRenderer.invoke(IpcChannel.SessionGetCurrent),
  },
  projects: {
    addFromGit: (input): Promise<AddProjectResult> => ipcRenderer.invoke(IpcChannel.ProjectsAddFromGit, input),
    addFromLocalPath: (input): Promise<AddProjectResult> =>
      ipcRenderer.invoke(IpcChannel.ProjectsAddFromLocalPath, input),
    pickLocalFolder: (): Promise<string | null> => ipcRenderer.invoke(IpcChannel.ProjectsPickLocalFolder),
    list: (): Promise<Project[]> => ipcRenderer.invoke(IpcChannel.ProjectsList),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ProjectsRemove, id),
    setOverride: (id: string, targetType: TargetType | null): Promise<Project | null> =>
      ipcRenderer.invoke(IpcChannel.ProjectsSetOverride, id, targetType),
    runDetection: (id: string): Promise<Project | null> => ipcRenderer.invoke(IpcChannel.ProjectsRunDetection, id),
    setBaseUrl: (id: string, url: string | null): Promise<Project | null> =>
      ipcRenderer.invoke(IpcChannel.ProjectsSetBaseUrl, id, url),
    setTestCaseFolder: (id: string, path: string | null): Promise<Project | null> =>
      ipcRenderer.invoke(IpcChannel.ProjectsSetTestCaseFolder, id, path),
  },
  testPlan: {
    list: (projectId: string): Promise<TestPlan> => ipcRenderer.invoke(IpcChannel.TestPlanList, projectId),
    createArea: (input: CreateAreaInput): Promise<AreaResult> =>
      ipcRenderer.invoke(IpcChannel.TestPlanCreateArea, input),
    renameArea: (input: RenameAreaInput): Promise<AreaResult> =>
      ipcRenderer.invoke(IpcChannel.TestPlanRenameArea, input),
    createCase: (input: CreateTestCaseInput): Promise<TestCaseResult> =>
      ipcRenderer.invoke(IpcChannel.TestPlanCreateCase, input),
    moveCase: (input: MoveTestCaseInput): Promise<TestCaseResult> =>
      ipcRenderer.invoke(IpcChannel.TestPlanMoveCase, input),
    deleteCase: (caseId: string): Promise<DeleteTestCaseResult> =>
      ipcRenderer.invoke(IpcChannel.TestPlanDeleteCase, caseId),
    importCases: (input: ImportTestCasesInput): Promise<ImportTestCasesResult> =>
      ipcRenderer.invoke(IpcChannel.TestPlanImportCases, input),
  },
  claude: {
    checkConnection: (): Promise<ClaudeConnectionStatus> => ipcRenderer.invoke(IpcChannel.ClaudeCheckConnection),
  },
  scan: {
    run: (projectId: string): Promise<ScanRunResult> => ipcRenderer.invoke(IpcChannel.ProjectScanRun, projectId),
    getLast: (projectId: string): Promise<ProjectScanResult | null> =>
      ipcRenderer.invoke(IpcChannel.ProjectScanGetLast, projectId),
  },
  caseGeneration: {
    run: (projectId: string, prompt: string): Promise<CaseGenerationResult> =>
      ipcRenderer.invoke(IpcChannel.CaseGenerationRun, projectId, prompt),
  },
  runs: {
    run: (caseId: string): Promise<RunResult> => ipcRenderer.invoke(IpcChannel.RunsRun, caseId),
    listForProject: (projectId: string): Promise<RunRecord[]> =>
      ipcRenderer.invoke(IpcChannel.RunsListForProject, projectId),
    listAll: (): Promise<RunRecord[]> => ipcRenderer.invoke(IpcChannel.RunsListAll),
  },
  setup: {
    run: (projectId: string): Promise<SetupRunResult> => ipcRenderer.invoke(IpcChannel.SetupRun, projectId),
    stop: (projectId: string): Promise<void> => ipcRenderer.invoke(IpcChannel.SetupStop, projectId),
  },
  assistant: {
    send: (message: string, sessionId: string | null): Promise<AssistantSendResult> =>
      ipcRenderer.invoke(IpcChannel.AssistantSend, message, sessionId),
  },
};

contextBridge.exposeInMainWorld('autoai', autoaiApi);
