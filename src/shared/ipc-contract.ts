/**
 * Single source of truth for everything that crosses the main <-> renderer
 * boundary. Imported by main (to type handlers), preload (to type the
 * exposed bridge), and renderer (via the autoaiClient wrapper) so the three
 * processes can never silently drift out of sync.
 *
 * Nothing in here ever carries a raw password past the initial IPC call -
 * see PasswordHasher in main/services for where it gets hashed and dropped.
 */

export const UserRole = {
  ManualTester: 'manual_tester',
  AutomationEngineer: 'automation_engineer',
  QaLead: 'qa_lead',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface RoleOption {
  readonly role: UserRole;
  readonly title: string;
  readonly description: string;
}

export const ROLE_OPTIONS: readonly RoleOption[] = [
  {
    role: UserRole.ManualTester,
    title: 'Manual QA Tester',
    description:
      "I test by hand today and want AutoAI to turn what I already do into automated runs.",
  },
  {
    role: UserRole.AutomationEngineer,
    title: 'Automation Engineer',
    description:
      'I write and maintain automated tests and want direct control over configuration and code.',
  },
  {
    role: UserRole.QaLead,
    title: 'QA Lead',
    description:
      "I plan coverage and review results across a team's automation, more than writing tests myself.",
  },
];

/** Public-safe view of a local profile. Never includes password material. */
export interface SessionState {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole | null;
  readonly onboardingCompleted: boolean;
}

export interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export type AuthResult =
  | { readonly ok: true; readonly session: SessionState }
  | { readonly ok: false; readonly error: AuthErrorCode };

export type AuthErrorCode =
  | 'PROFILE_ALREADY_EXISTS'
  | 'PROFILE_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'WEAK_PASSWORD'
  | 'INVALID_EMAIL'
  | 'NAME_REQUIRED';

export interface OnboardingResult {
  readonly ok: true;
  readonly session: SessionState;
}

// ---------------------------------------------------------------------------
// Projects: importing a target codebase and detecting what kind of app it is
// ---------------------------------------------------------------------------

export const TargetType = {
  Mobile: 'mobile',
  Web: 'web',
  Desktop: 'desktop',
  Unknown: 'unknown',
} as const;

export type TargetType = (typeof TargetType)[keyof typeof TargetType];

export const TARGET_TYPE_LABEL: Record<TargetType, string> = {
  [TargetType.Mobile]: 'Mobile (iOS / Android)',
  [TargetType.Web]: 'Web',
  [TargetType.Desktop]: 'Desktop',
  [TargetType.Unknown]: 'Unknown',
};

export type DetectionConfidence = 'low' | 'medium' | 'high';

export interface DetectionEvidence {
  /** Path relative to the project root that produced this signal. */
  readonly path: string;
  /** Plain-language reason this file/folder counts as evidence. */
  readonly reason: string;
  readonly pointsTo: TargetType;
}

export interface DetectionResult {
  readonly targetType: TargetType;
  readonly confidence: DetectionConfidence;
  readonly evidence: readonly DetectionEvidence[];
  readonly generatedAt: string;
}

export type ProjectSource =
  | { readonly type: 'git'; readonly url: string; readonly branch: string | null }
  | { readonly type: 'local'; readonly path: string };

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly source: ProjectSource;
  /** Where the project's files actually live on this machine - a managed
   *  clone destination for git sources, or the chosen path for local ones. */
  readonly localPath: string;
  readonly createdAt: string;
  readonly detection: DetectionResult | null;
  /** Explicit user override - always wins over `detection`. Nothing in
   *  AutoAI should guess silently when this is set. */
  readonly overriddenTargetType: TargetType | null;
  /** The base URL a real Playwright run navigates against - e.g.
   *  `http://localhost:8080`. Null means "not set yet": TestRunnerService
   *  refuses to run a case rather than guess one. Same explicit-null
   *  convention as `overriddenTargetType`. */
  readonly baseUrl: string | null;
  /** A folder on disk, chosen by the user, that AutoAI mirrors its test
   *  cases into as real JSON files - see TestCaseFileMirror. Null means no
   *  folder has been chosen, in which case nothing is written to disk. */
  readonly testCaseFolderPath: string | null;
}

/** What a project screen should actually treat as "the" target type. */
export function effectiveTargetType(project: Project): TargetType {
  return project.overriddenTargetType ?? project.detection?.targetType ?? TargetType.Unknown;
}

export type AddProjectErrorCode =
  | 'NAME_REQUIRED'
  | 'INVALID_GIT_URL'
  | 'GIT_NOT_INSTALLED'
  | 'CLONE_FAILED'
  | 'INVALID_LOCAL_PATH'
  | 'PATH_NOT_FOUND';

export type AddProjectResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly error: AddProjectErrorCode; readonly detail?: string };

// ---------------------------------------------------------------------------
// Test plans: areas and test cases that belong to a project
// ---------------------------------------------------------------------------

export interface AreaRecord {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly createdAt: string;
}

/** The kinds of HTML/template attributes AutoAI grounds a selector in - see
 *  SelectorScanner. Lives in the shared contract (rather than only in the
 *  scanner) because TestStepAction and SuggestedFlow's grounding rules
 *  reference it directly. */
export const SelectorAttributeKind = {
  Id: 'id',
  Name: 'name',
  DataTestId: 'data-testid',
  For: 'for',
  AriaLabel: 'aria-label',
} as const;

export type SelectorAttributeKind = (typeof SelectorAttributeKind)[keyof typeof SelectorAttributeKind];

export const TestActionKind = {
  Goto: 'goto',
  Click: 'click',
  Fill: 'fill',
  Check: 'check',
  Select: 'select',
  AssertText: 'assertText',
} as const;

export type TestActionKind = (typeof TestActionKind)[keyof typeof TestActionKind];

/**
 * One machine-executable step in a runnable test case. `value` means a
 * different thing depending on `action`:
 * - `goto`: a path relative to the project's `baseUrl` (e.g. `/checkout`).
 * - `fill`: the text to type into the matched field.
 * - `select`: the option value to choose.
 * - `assertText`: a substring expected to appear in the matched element.
 * - `click` / `check`: unused - the selector alone is the whole step.
 *
 * `selectorKind`/`selectorValue` are omitted for `goto`, which has no
 * element to target, and are otherwise always a real id/name/data-testid/
 * for/aria-label pair the scan actually found - never invented.
 */
export interface TestStepAction {
  readonly action: TestActionKind;
  readonly selectorKind?: SelectorAttributeKind;
  readonly selectorValue?: string;
  readonly value?: string;
}

export interface TestCaseRecord {
  readonly id: string;
  readonly projectId: string;
  /** Null means Unsorted - every project has it, and nobody owns it. */
  readonly areaId: string | null;
  readonly name: string;
  readonly steps: readonly string[];
  readonly createdAt: string;
  /** The machine-executable subset of `steps`, or null when this case isn't
   *  runnable at all. Only chat-generated and scan-suggested cases ever get
   *  one - manually-typed cases and CSV imports stay plain-language-only.
   *  Explicit null over invented data, same convention as
   *  `overriddenTargetType`. Not required to line up 1:1 with `steps`:
   *  `steps` stays the source of truth for what's displayed; `script` is
   *  whatever subset could actually be grounded in a real selector. */
  readonly script: readonly TestStepAction[] | null;
}

export interface TestPlan {
  readonly areas: readonly AreaRecord[];
  readonly cases: readonly TestCaseRecord[];
}

export interface CreateAreaInput {
  readonly projectId: string;
  readonly name: string;
}

export interface RenameAreaInput {
  readonly areaId: string;
  readonly name: string;
}

export interface CreateTestCaseInput {
  readonly projectId: string;
  readonly areaId: string | null;
  readonly name: string;
  readonly steps: readonly string[];
  /** Optional; defaults to null (not runnable) when omitted. Carried
   *  through as-is by TestPlanService.createCase - always null for
   *  importCases rows, which never carry a script. */
  readonly script?: readonly TestStepAction[] | null;
}

export interface MoveTestCaseInput {
  readonly caseId: string;
  readonly areaId: string | null;
}

export interface ImportedCase {
  readonly name: string;
  readonly steps: readonly string[];
}

export interface ImportTestCasesInput {
  readonly projectId: string;
  readonly areaId: string | null;
  readonly cases: readonly ImportedCase[];
}

export type TestPlanErrorCode =
  | 'INVALID_INPUT'
  | 'NAME_REQUIRED'
  | 'STEPS_REQUIRED'
  | 'PROJECT_NOT_FOUND'
  | 'AREA_NOT_FOUND'
  | 'AREA_ALREADY_EXISTS'
  | 'CASE_NOT_FOUND'
  | 'NOTHING_TO_IMPORT';

export type AreaResult =
  | { readonly ok: true; readonly area: AreaRecord }
  | { readonly ok: false; readonly error: TestPlanErrorCode };

export type TestCaseResult =
  | { readonly ok: true; readonly testCase: TestCaseRecord }
  | { readonly ok: false; readonly error: TestPlanErrorCode };

export type DeleteTestCaseResult =
  | { readonly ok: true; readonly caseId: string }
  | { readonly ok: false; readonly error: TestPlanErrorCode };

export type ImportTestCasesResult =
  | { readonly ok: true; readonly cases: readonly TestCaseRecord[] }
  | { readonly ok: false; readonly error: TestPlanErrorCode };

// ---------------------------------------------------------------------------
// Claude connection: an explicit, in-app probe that a real query() call
// succeeds right now. There is no lightweight "am I logged in" check in the
// Agent SDK - this runs a minimal query and reports what actually happened.
// No credential of any kind is stored or read directly by AutoAI.
// ---------------------------------------------------------------------------

export type ClaudeConnectionStatus =
  | { readonly connected: true }
  | {
      readonly connected: false;
      readonly reason: 'NOT_LOGGED_IN' | 'SDK_ERROR';
      readonly detail?: string;
    };

// ---------------------------------------------------------------------------
// Project scan: Claude reads a project with its own Read/Grep/Glob tools and
// hands back a plain-language read plus suggested test flows; folded
// together with a deterministic, local "what's missing to run tests" check.
// ---------------------------------------------------------------------------

export interface SuggestedFlow {
  readonly name: string;
  readonly description: string;
  readonly steps: readonly string[];
  /** Only ever real id/name/data-testid/for/aria-label values the scan (or
   *  Claude's own reading) actually found - never invented. */
  readonly targetSelectors?: readonly string[];
  /** The machine-executable subset of `steps`, grounded the same way
   *  `targetSelectors` is - absent or empty means "not runnable." Present
   *  on both scan-suggested flows and chat-generated ones. */
  readonly script?: readonly TestStepAction[];
}

/** One well-known tool AutoAI checked for on this machine, for the target
 *  type this project needs. Presence is a plain local check - see
 *  EnvironmentCheckService - never something Claude guesses. */
export interface EnvironmentCheckItem {
  readonly name: string;
  readonly present: boolean;
  /** The exact command to run to fix it. Null when there's nothing to run -
   *  either it's already present, or (mobile/desktop) the checker for this
   *  target type doesn't exist in AutoAI yet. */
  readonly installHint: string | null;
}

/** What Claude proposes to actually get this project running, grounded the
 *  same way `suggestedFlows` is: a `composer.json` -> `composer install`, a
 *  `package.json` with a `dev`/`start` script -> `npm run <script>`, plain
 *  `.php` files with no framework marker -> `php -S localhost:8000 -t .`.
 *  `startCommand` stays null (with an explanation) rather than guessing when
 *  Claude isn't confident - same "never invent" discipline as a selector. */
export interface ProjectSetupProposal {
  readonly installCommands: readonly string[];
  readonly startCommand: string | null;
  readonly startCommandExplanation: string | null;
}

export interface ProjectScanResult {
  readonly description: string;
  readonly suggestedFlows: readonly SuggestedFlow[];
  /** Short, project-specific things Claude noticed while reading (a
   *  database dependency, a required env var) - distinct from `environment`,
   *  which is the deterministic well-known-tooling checklist. */
  readonly environmentNotes: readonly string[];
  readonly environment: readonly EnvironmentCheckItem[];
  /** Null when Claude found nothing it was confident enough to propose. */
  readonly setup: ProjectSetupProposal | null;
  readonly generatedAt: string;
}

export type ScanErrorCode = 'NOT_CONNECTED' | 'PROJECT_NOT_FOUND' | 'SCAN_FAILED';

export type ScanRunResult =
  | { readonly ok: true; readonly result: ProjectScanResult }
  | { readonly ok: false; readonly error: ScanErrorCode; readonly detail?: string };

// ---------------------------------------------------------------------------
// Case generation: turning one plain-language chat prompt into a single
// SuggestedFlow, the same shape the scan produces - a smaller, targeted
// sibling of ProjectScanService rather than a second data model.
// ---------------------------------------------------------------------------

export type CaseGenerationErrorCode =
  | 'NOT_CONNECTED'
  | 'PROJECT_NOT_FOUND'
  | 'PROMPT_REQUIRED'
  | 'GENERATION_FAILED';

export type CaseGenerationResult =
  | { readonly ok: true; readonly flow: SuggestedFlow }
  | { readonly ok: false; readonly error: CaseGenerationErrorCode; readonly detail?: string };

// ---------------------------------------------------------------------------
// Runs: a real, deterministic Playwright execution of one runnable test
// case - headless Chromium, stop at the first failed step, remaining steps
// recorded skipped. Per-case only; there is no "run all" in this pass.
// ---------------------------------------------------------------------------

export type RunErrorCode =
  | 'CASE_NOT_FOUND'
  | 'NO_SCRIPT'
  | 'NO_BASE_URL'
  | 'UNSUPPORTED_TARGET'
  | 'BROWSER_NOT_READY'
  | 'RUN_FAILED';

export interface RunStepResult {
  readonly action: TestStepAction;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly error: string | null;
  readonly durationMs: number;
}

export interface RunRecord {
  readonly id: string;
  readonly projectId: string;
  readonly caseId: string;
  /** Copied at run time so a run still reads sensibly if the case is later
   *  renamed or deleted. */
  readonly caseName: string;
  readonly status: 'passed' | 'failed';
  readonly steps: readonly RunStepResult[];
  readonly startedAt: string;
  readonly finishedAt: string;
}

export type RunResult =
  | { readonly ok: true; readonly run: RunRecord }
  | { readonly ok: false; readonly error: RunErrorCode; readonly detail?: string };

// ---------------------------------------------------------------------------
// Project setup: AutoAI installing what a project needs and starting it,
// gated on a hard local allowlist (CommandAllowlist) and one batch approval -
// see ProjectSetupService. Every command Claude proposed is untrusted until
// it passes that allowlist; nothing here ever runs anything else.
// ---------------------------------------------------------------------------

export type SetupCommandStatus = 'passed' | 'failed' | 'skipped';

export interface SetupCommandOutcome {
  readonly command: string;
  readonly status: SetupCommandStatus;
  /** Null for a skipped command, or one that failed the allowlist (never
   *  actually spawned). */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SetupStartOutcome {
  readonly command: string;
  readonly status: 'started' | 'crashed' | 'rejected' | 'skipped';
  /** Truncated stdout/stderr captured before a crash, the allowlist-refusal
   *  message for `rejected`, or empty otherwise. */
  readonly output: string;
}

export interface SetupRunResultData {
  readonly installResults: readonly SetupCommandOutcome[];
  /** Null only when the proposal had no `startCommand` at all. */
  readonly start: SetupStartOutcome | null;
  /** Set when a recognized start-command pattern (e.g. `php -S host:port`)
   *  let AutoAI fill in `project.baseUrl` automatically. */
  readonly baseUrlAutoFilled: string | null;
}

export type SetupErrorCode = 'PROJECT_NOT_FOUND' | 'NO_PROPOSAL' | 'COMMAND_REJECTED' | 'INSTALL_FAILED' | 'ALREADY_RUNNING';

export type SetupRunResult =
  | { readonly ok: true; readonly result: SetupRunResultData }
  | { readonly ok: false; readonly error: SetupErrorCode; readonly detail?: string };

// ---------------------------------------------------------------------------
// General assistant: a conversational chat available from anywhere in the
// app, backed by five in-process custom tools (never Read/Write/Edit/Bash) -
// see AssistantService. It can read (list projects, list runs) and trigger
// the same one-click actions that already exist outside chat (run a scan,
// generate a case draft, open the Setup card) - never install or start
// anything itself.
// ---------------------------------------------------------------------------

export interface AssistantReply {
  readonly text: string;
  /** Carried forward on the next `send` call to resume this conversation -
   *  see the Agent SDK's `resume` option. */
  readonly sessionId: string;
  /** Set when the assistant used its `open_project_setup` tool - the
   *  renderer navigates to this project so the person can review and
   *  approve the proposed commands themselves. Null otherwise. */
  readonly openProjectSetupId: string | null;
}

export type AssistantErrorCode = 'NOT_CONNECTED' | 'ASSISTANT_FAILED';

export type AssistantSendResult =
  | { readonly ok: true; readonly reply: AssistantReply }
  | { readonly ok: false; readonly error: AssistantErrorCode; readonly detail?: string };

/** Channel names, kept as constants so a typo becomes a compile error, not a silent no-op handler. */
export const IpcChannel = {
  AuthHasProfile: 'auth:has-profile',
  AuthRegister: 'auth:register',
  AuthLogin: 'auth:login',
  AuthLogout: 'auth:logout',
  OnboardingSetRole: 'onboarding:set-role',
  SessionGetCurrent: 'session:get-current',
  ProjectsAddFromGit: 'projects:add-from-git',
  ProjectsAddFromLocalPath: 'projects:add-from-local-path',
  ProjectsPickLocalFolder: 'projects:pick-local-folder',
  ProjectsList: 'projects:list',
  ProjectsRemove: 'projects:remove',
  ProjectsSetOverride: 'projects:set-override',
  ProjectsRunDetection: 'projects:run-detection',
  ProjectsSetBaseUrl: 'projects:set-base-url',
  ProjectsSetTestCaseFolder: 'projects:set-test-case-folder',
  TestPlanList: 'testplan:list',
  TestPlanCreateArea: 'testplan:create-area',
  TestPlanRenameArea: 'testplan:rename-area',
  TestPlanCreateCase: 'testplan:create-case',
  TestPlanMoveCase: 'testplan:move-case',
  TestPlanDeleteCase: 'testplan:delete-case',
  TestPlanImportCases: 'testplan:import-cases',
  ClaudeCheckConnection: 'claude:check-connection',
  ProjectScanRun: 'scan:run',
  ProjectScanGetLast: 'scan:get-last',
  CaseGenerationRun: 'case-generation:run',
  RunsRun: 'runs:run',
  RunsListForProject: 'runs:list-for-project',
  RunsListAll: 'runs:list-all',
  SetupRun: 'setup:run',
  SetupStop: 'setup:stop',
  AssistantSend: 'assistant:send',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

/** The full typed surface the preload script exposes on window.autoai. */
export interface AutoaiApi {
  auth: {
    hasProfile: () => Promise<boolean>;
    register: (input: RegisterInput) => Promise<AuthResult>;
    login: (input: LoginInput) => Promise<AuthResult>;
    logout: () => Promise<void>;
  };
  onboarding: {
    setRole: (role: UserRole) => Promise<OnboardingResult>;
  };
  session: {
    getCurrent: () => Promise<SessionState | null>;
  };
  projects: {
    addFromGit: (input: { url: string; branch?: string; name?: string }) => Promise<AddProjectResult>;
    addFromLocalPath: (input: { path: string; name?: string }) => Promise<AddProjectResult>;
    /** Opens a native folder picker in the main process; null if the user cancels. */
    pickLocalFolder: () => Promise<string | null>;
    list: () => Promise<Project[]>;
    remove: (id: string) => Promise<void>;
    setOverride: (id: string, targetType: TargetType | null) => Promise<Project | null>;
    runDetection: (id: string) => Promise<Project | null>;
    setBaseUrl: (id: string, url: string | null) => Promise<Project | null>;
    setTestCaseFolder: (id: string, path: string | null) => Promise<Project | null>;
  };
  testPlan: {
    list: (projectId: string) => Promise<TestPlan>;
    createArea: (input: CreateAreaInput) => Promise<AreaResult>;
    renameArea: (input: RenameAreaInput) => Promise<AreaResult>;
    createCase: (input: CreateTestCaseInput) => Promise<TestCaseResult>;
    moveCase: (input: MoveTestCaseInput) => Promise<TestCaseResult>;
    deleteCase: (caseId: string) => Promise<DeleteTestCaseResult>;
    importCases: (input: ImportTestCasesInput) => Promise<ImportTestCasesResult>;
  };
  claude: {
    /** Runs a real, minimal query and reports whether it worked - see
     *  ClaudeConnectionService. Not a cached flag. */
    checkConnection: () => Promise<ClaudeConnectionStatus>;
  };
  scan: {
    run: (projectId: string) => Promise<ScanRunResult>;
    /** The last scan persisted for this project, or null if it has never
     *  been scanned. */
    getLast: (projectId: string) => Promise<ProjectScanResult | null>;
  };
  caseGeneration: {
    /** Not persisted - the renderer holds the returned flow locally until
     *  "Add as test case" turns it into a real TestCaseRecord via
     *  testPlan.createCase. */
    run: (projectId: string, prompt: string) => Promise<CaseGenerationResult>;
  };
  runs: {
    run: (caseId: string) => Promise<RunResult>;
    listForProject: (projectId: string) => Promise<RunRecord[]>;
    listAll: () => Promise<RunRecord[]>;
  };
  setup: {
    /** Runs a project's setup proposal: installs, then the start command -
     *  see ProjectSetupService. One batch approval on the renderer side;
     *  this call itself is the approval. */
    run: (projectId: string) => Promise<SetupRunResult>;
    /** Kills the process AutoAI started for this project, if one is
     *  tracked. A no-op otherwise. */
    stop: (projectId: string) => Promise<void>;
  };
  assistant: {
    send: (message: string, sessionId: string | null) => Promise<AssistantSendResult>;
  };
}
