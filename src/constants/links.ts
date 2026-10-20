/** Public links used in shares and invites. */
export const APP_STORE_URL = 'https://apps.apple.com/us/app/accountabuild/id6757963838';

/** Universal invite link: opens the app if installed, else the landing page with the code. */
export function inviteUrl(joinCode: string): string {
  return `https://app.munitor.ai/join/${String(joinCode).trim().toUpperCase()}`;
}
