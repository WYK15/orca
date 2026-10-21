export async function pasteFromMenu(
  read: () => Promise<{ text: string; png: string | null }>,
  targetDocument: Document = document
): Promise<void> {
  const target = targetDocument.activeElement
  if (!(target instanceof HTMLElement)) {
    return
  }
  const clipboard = await read()
  if (targetDocument.activeElement !== target || !target.isConnected) {
    return
  }
  const data = new DataTransfer()
  if (clipboard.text) {
    data.setData('text/plain', clipboard.text)
  }
  if (clipboard.png) {
    const bytes = Uint8Array.from(atob(clipboard.png), (character) => character.charCodeAt(0))
    data.items.add(new File([bytes], 'clipboard.png', { type: 'image/png' }))
  }
  const paste = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: data
  })
  if (target.dispatchEvent(paste) && target.isContentEditable && clipboard.text) {
    targetDocument.execCommand('insertText', false, clipboard.text)
  }
}
