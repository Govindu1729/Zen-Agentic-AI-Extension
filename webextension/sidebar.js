// ============================================================
// Click Element Handler — Phase 1A: Refined flow
// ============================================================

/** Click element — requires confirmation, then prompts for selector */
btnClick.addEventListener('click', async () => {
  addMessage('Click element — confirmation required.', 'system');

  try {
    // Step 1: Ask for confirmation
    const confirmed = await showConfirmation({
      title: 'Confirm Element Click',
      text: 'This will simulate a click on a DOM element. Proceed?',
      confirmText: 'Click',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      addMessage('Click cancelled by user.', 'system');
      return;
    }

    // Step 2: Prompt for CSS selector
    const selector = prompt('Enter CSS selector for the element to click:\n(e.g., "button.submit", "#submit-btn", ".menu-item"):');
    if (!selector) {
      addMessage('No selector provided. Click cancelled.', 'system');
      return;
    }

    addMessage('Preparing to click: ' + selector, 'system');

    // Step 3: Send to native host with confirmation wrapper
    // Using sendToNativeWithConfirmation which handles the consent flow
    // and calls click_by_uid with the selector as the UID
    const res = await sendToNativeWithConfirmation('click_by_uid', {
      uid: selector,
    });
    addMessage(`Click result: ${JSON.stringify(res)}`, 'assistant');
  } catch (err) {
    addMessage(`Click failed: ${err.message}`, 'error');
  }
});