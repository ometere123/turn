export function installLatencyCopy(): () => void {
  const apply = () => {
    document.querySelectorAll<HTMLElement>('.pending-panel').forEach((panel) => {
      const copy = panel.querySelector<HTMLElement>('span')
      if (copy) copy.textContent = 'Your transaction hash is saved. Nimiq confirmation can take several minutes. Do not pay again while this receipt is confirming.'
    })
  }
  apply()
  const observer = new MutationObserver(apply)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}
