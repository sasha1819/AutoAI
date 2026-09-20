import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { ClaudeAgentRunner } from './services/AgentRunner';
import { AssistantService } from './services/AssistantService';
import { AuthService } from './services/AuthService';
import { CaseGenerationService } from './services/CaseGenerationService';
import { ClaudeConnectionService } from './services/ClaudeConnectionService';
import { EnvironmentCheckService } from './services/EnvironmentCheckService';
import { McpServerService } from './services/McpServerService';
import { McpServerStore } from './services/McpServerStore';
import { SystemToolInstaller } from './services/SystemToolInstaller';
import { PlaywrightBrowserInstaller } from './services/PlaywrightBrowserInstaller';
import { ElectronExternalOpener, UrlOpener } from './services/UrlOpener';
import { UrlReachabilityChecker } from './services/UrlReachabilityChecker';
import { ModelPreferenceService } from './services/ModelPreferenceService';
import { ModelPreferenceStore } from './services/ModelPreferenceStore';
import { ProfileStore } from './services/ProfileStore';
import { NodeProcessSpawner, ProjectSetupService } from './services/ProjectSetupService';
import { ProjectScanService } from './services/ProjectScanService';
import { ProjectService } from './services/ProjectService';
import { ProjectStore } from './services/ProjectStore';
import { RunStore } from './services/RunStore';
import { ScanStore } from './services/ScanStore';
import { FsTestCaseFileMirror } from './services/TestCaseFileMirror';
import { PlaywrightBrowserDriver, TestRunnerService } from './services/TestRunnerService';
import { TestPlanService } from './services/TestPlanService';
import { TestPlanStore } from './services/TestPlanStore';

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // Security baseline for a renderer that will eventually display
      // scan results and project data we don't fully control the shape
      // of: no Node access from web content, isolated context for the
      // preload bridge, sandboxed renderer process.
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Any attempt to open a new window (e.g. a target="_blank" link) goes to
  // the OS browser instead of a second unmanaged Electron window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  const profileStore = new ProfileStore();
  const authService = new AuthService(profileStore);

  const projectStore = new ProjectStore();
  const projectWorkspaceRoot = join(app.getPath('userData'), 'projects');

  const testPlanStore = new TestPlanStore();
  const testCaseFileMirror = new FsTestCaseFileMirror();
  const testPlanService = new TestPlanService(testPlanStore, projectStore, testCaseFileMirror);

  const modelPreferenceStore = new ModelPreferenceStore();
  const modelPreferenceService = new ModelPreferenceService(modelPreferenceStore);
  const agentRunner = new ClaudeAgentRunner(modelPreferenceStore);
  const claudeConnectionService = new ClaudeConnectionService(agentRunner);
  const environmentCheckService = new EnvironmentCheckService();
  const scanStore = new ScanStore();
  const projectScanService = new ProjectScanService(scanStore, projectStore, agentRunner, environmentCheckService);
  const caseGenerationService = new CaseGenerationService(projectStore, agentRunner);

  const runStore = new RunStore();
  const testRunnerService = new TestRunnerService(
    testPlanStore,
    projectStore,
    runStore,
    new PlaywrightBrowserDriver(),
  );

  // testPlanService, projectScanService, and testRunnerService are all
  // ProjectDataOwners: their data is dropped when the project it belongs to
  // is removed - see ProjectService.remove.
  const projectService = new ProjectService(projectStore, projectWorkspaceRoot, [
    testPlanService,
    projectScanService,
    testRunnerService,
  ]);

  // Built after projectService (not a ProjectDataOwner - it persists
  // nothing that needs cascading deletion) so it can reuse
  // ProjectService.setBaseUrl directly, same as the plan calls for.
  const projectSetupService = new ProjectSetupService(scanStore, projectStore, projectService, new NodeProcessSpawner());

  const mcpServerStore = new McpServerStore();
  const mcpServerService = new McpServerService(mcpServerStore);
  const systemToolInstaller = new SystemToolInstaller();
  const playwrightBrowserInstaller = new PlaywrightBrowserInstaller(app.getAppPath());
  const urlOpener = new UrlOpener(new ElectronExternalOpener());
  const urlReachabilityChecker = new UrlReachabilityChecker();

  const assistantService = new AssistantService(agentRunner, {
    projectRepository: projectStore,
    runRepository: runStore,
    scanRunner: projectScanService,
    caseGenerator: caseGenerationService,
    mcpServerRepository: mcpServerStore,
  });

  registerIpcHandlers(
    authService,
    projectService,
    testPlanService,
    claudeConnectionService,
    modelPreferenceService,
    projectScanService,
    caseGenerationService,
    testRunnerService,
    projectSetupService,
    assistantService,
    mcpServerService,
    systemToolInstaller,
    playwrightBrowserInstaller,
    urlOpener,
    urlReachabilityChecker,
  );

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  // Nothing AutoAI started on this machine's behalf should outlive the app.
  app.on('before-quit', () => {
    projectSetupService.stopAll();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
