/**
 * Diálogos do próprio Android que podem cobrir o app, principalmente em
 * emuladores recém-iniciados ("System UI isn't responding", permissões).
 */
const DISMISS_SELECTORS = [
  'id=android:id/aerr_wait',
  'id=com.android.permissioncontroller:id/permission_allow_button',
  'id=com.android.permissioncontroller:id/permission_allow_foreground_only_button',
];

export async function dismissSystemDialogs(): Promise<void> {
  for (const selector of DISMISS_SELECTORS) {
    const button = $(selector);
    if (await button.isDisplayed().catch(() => false)) {
      console.log(`[system-dialog] fechando ${selector}`);
      await button.click();
    }
  }
}
