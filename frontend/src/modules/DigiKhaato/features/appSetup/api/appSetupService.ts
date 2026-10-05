import { api, ubConfig } from 'src/api/AxiosInstances';

/**
 * docs/platform/14 step 5 — an app's setup checklist, per business per app.
 * The steps are the server's facts ("a fee plan exists"); the client only
 * draws them and links each to the page that does it.
 */
export interface AppSetupStep {
  readonly key: string;
  readonly labelId: string;
  readonly path: string;
  readonly done: boolean;
}

export interface AppSetup {
  readonly app: string;
  readonly steps: readonly AppSetupStep[];
  readonly complete: boolean;
  readonly hidden: boolean;
  readonly canHide: boolean;
}

interface AppSetupWire {
  readonly app: string;
  readonly steps: readonly { key: string; label_id: string; path: string; done: boolean }[];
  readonly complete: boolean;
  readonly hidden: boolean;
  readonly can_hide: boolean;
}

const toSetup = (wire: AppSetupWire): AppSetup => ({
  app: wire.app,
  steps: wire.steps.map((step) => ({
    key: step.key,
    labelId: step.label_id,
    path: step.path,
    done: step.done,
  })),
  complete: wire.complete,
  hidden: wire.hidden,
  canHide: wire.can_hide,
});

const setupPath = (app: string): string => `/apps/${encodeURIComponent(app)}/setup`;

/** GET /apps/{app}/setup — quiet: a home that cannot read its checklist still works. */
export const getAppSetup = async (app: string, signal?: AbortSignal): Promise<AppSetup> => {
  const response = await api.get<{ data: AppSetupWire }>(
    setupPath(app),
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toSetup(response.data.data);
};

/** POST /apps/{app}/setup/hide — the owner or an admin hides it for the business. */
export const hideAppSetup = async (app: string): Promise<AppSetup> => {
  const response = await api.post<{ data: AppSetupWire }>(`${setupPath(app)}/hide`);
  return toSetup(response.data.data);
};
