/** Desktop copying goes through the trusted preload, not browser permission prompts. */
export async function copyText(text: string): Promise<void> {
  const desktop = (window as unknown as { workbenchDesktop?: { copyText?: (text: string) => Promise<boolean> } }).workbenchDesktop;
  if (desktop?.copyText) {
    if (!await desktop.copyText(text)) throw new Error('复制失败');
    return;
  }
  try { await navigator.clipboard.writeText(text); return; } catch { /* Browser fallback for denied async clipboard permission. */ }
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(field);
  try {
    field.focus(); field.select();
    if (!document.execCommand('copy')) throw new Error('无法复制，请手动复制');
  } finally { field.remove(); if (previous instanceof HTMLElement) previous.focus(); }
}
