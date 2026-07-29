export interface OpponentSecretOverlayPresenterHost<Window> {
  readonly ensureWindow: (options: { readonly showWhenReady: false }) => Promise<Window>;
  readonly isStillValid: (window: Window) => boolean;
  readonly showInactive: () => void | Promise<void>;
}

export async function presentOpponentSecretOverlay<Window>(
  host: OpponentSecretOverlayPresenterHost<Window>
): Promise<void> {
  const window = await host.ensureWindow({ showWhenReady: false });
  if (!host.isStillValid(window)) {
    return;
  }
  await host.showInactive();
}
