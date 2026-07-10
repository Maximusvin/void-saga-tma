export type AutomaticActionBackendStatus = 'local' | 'loading' | 'synced' | 'error';

export const canDispatchAutomaticGameActions = (
  apiEnabled: boolean,
  backendStatus: AutomaticActionBackendStatus,
) => {
  return !apiEnabled || backendStatus === 'synced';
};
