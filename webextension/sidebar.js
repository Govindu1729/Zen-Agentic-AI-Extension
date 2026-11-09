// ============================================================
// Go to URL Handler — Phase 1C: confirmation then URL prompt
// ============================================================

/** Go to URL — requires confirmation, then prompts for URL */
btnGo.addEventListener('click', async () => {
  addMessage('Navigate — confirmation required.', 'system');

  try {
    // Step 1: Ask for confirmation
    const confirmed = await showConfirmation({
      title: 'Confirm Navigation',
      text: 'This will navigate the browser to a new URL. Proceed?',
      confirmText: 'Go',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      addMessage('Navigation cancelled by user.', 'system');
      return;
    }

    // Step 2: Prompt for the URL
    const url = prompt('Enter the URL to navigate to:\n(e.g., "https://example.com", "https://github.com"):');
    if (!url) {
      addMessage('No URL provided. Navigation cancelled.', 'system');
      return;
    }

    addMessage('Preparing navigation to: ' + url, 'system');

    // Step 3: Send to native host with confirmation wrapper
    const res = await sendToNativeWithConfirmation('go_to_url', {
      url,
    });
    addMessage(`Navigation result: ${JSON.stringify(res)}`, 'assistant');
  } catch (err) {
    addMessage(`Navigation failed: ${err.message}`, 'error');
  }
});