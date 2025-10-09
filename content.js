// Content script for Text2Latex extension

let settings = null;
let conversionTimeout = null;
let isEnabled = false;
let currentInput = null;
let latexOverlay = null;

let currentConversionId = null;
let convertingDotsTimer = null;
let convertingDotsStep = 0;
let suppressAutoConvertOnce = false;


let lastSelectionInfo = null; // { type: 'range'|'indices'|'all', start, end }
let lastSelectionRange = null; // Range for contenteditable

// Initialize (guard against double-injection)
if (!window.__TEXT2LATEX_LOADED__) {
    window.__TEXT2LATEX_LOADED__ = true;
    init();
}

async function init() {
    // Get settings
    settings = await getSettings();
    if (settings) { settings.delay = Math.max(600, settings.delay || 1000); }
    isEnabled = settings.enabled;

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.settings) {
            settings = changes.settings.newValue;
            if (settings) { settings.delay = Math.max(600, settings.delay || 1000); }
            isEnabled = settings.enabled;
        }
    });

    // Listen for messages (settings updates and commands)
    chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
        if (request.action === 'settingsUpdated') {
            // Reload settings
            getSettings().then(newSettings => {
                settings = newSettings;
                if (settings) { settings.delay = Math.max(600, settings.delay || 1000); }
                isEnabled = settings.enabled;
            });
            return;
        }

        // Resolve target input element (currentInput or activeElement)
        const target = currentInput && isInputElement(currentInput)
            ? currentInput
            : (isInputElement(document.activeElement) ? document.activeElement : null);

        if (!target) return;

        if (request.action === 'command_convert') {
            captureSelectionInfo(target);
            let text = getSelectedText(target);
            if (!text) text = getInputText(target);
            if (text && text.trim()) {
                convertText(text, target);
            }
        } else if (request.action === 'command_accept') {
            acceptLatexSuggestion(target);
        } else if (request.action === 'command_hide') {
            hideLatexOverlay();
        }
    });

    // Set up input listeners
    setupInputListeners();

    // Create LaTeX overlay element
    createLatexOverlay();

    // Global key handling when overlay is visible
    document.addEventListener('keydown', (e) => {
        if (!latexOverlay || latexOverlay.style.display === 'none') return;
        if (e.key === 'Tab') {
            e.preventDefault();
            if (currentInput) acceptLatexSuggestion(currentInput);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideLatexOverlay();
        }
    }, true);
    // Cancel in-flight conversion if navigating away
    window.addEventListener('beforeunload', cancelCurrentConversion);

}

// Get settings from background
function getSettings() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
            resolve(response);
        });
    });
}

// Set up listeners for input fields
function setupInputListeners() {
    // Listen for focus on input fields
    document.addEventListener('focusin', (e) => {
        const target = e.target;
        if (isInputElement(target)) {
            currentInput = target;
            attachInputListener(target);
        }
    }, true);

    // Listen for focus out (do not hide if focus moves into overlay)
    document.addEventListener('focusout', (e) => {
        if (currentInput === e.target) {
            const next = e.relatedTarget;
            if (latexOverlay && next && latexOverlay.contains(next)) {
                return; // keep overlay if focusing inside it
            }
            hideLatexOverlay();
        }
    }, true);
}

// Check if element is an input field
function isInputElement(element) {
    const tagName = element.tagName.toLowerCase();
    const isTextInput = tagName === 'input' &&
        ['text', 'search', 'email', 'url'].includes(element.type);
    const isTextarea = tagName === 'textarea';
    const isContentEditable = element.isContentEditable;

    return isTextInput || isTextarea || isContentEditable;
}

// Attach input listener to element
function attachInputListener(element) {
    if (element.dataset.latexListenerAttached) return;

    element.dataset.latexListenerAttached = 'true';

    element.addEventListener('input', handleInput);
    element.addEventListener('keydown', handleKeydown);
}

// Handle input events
function handleInput(e) {
    if (!isEnabled || !settings.autoConvert) return;

    // If change is programmatic (accept replaced text), skip one auto-convert
    if (suppressAutoConvertOnce) {
        suppressAutoConvertOnce = false;
        return;
    }

    clearTimeout(conversionTimeout);
    const element = e.target;

    // Debounce conversion: wait full delay of inactivity before sending request
    conversionTimeout = setTimeout(() => {
        if (!isEnabled || !settings.autoConvert) return;
        if (!element || !isInputElement(element)) return;
        const txt = getInputText(element) || '';
        if (txt.trim().length < 3) { hideLatexOverlay(); return; }
        lastSelectionInfo = { type: 'all' };
        lastSelectionRange = null;
        convertText(txt, element);
    }, settings.delay);
}

// Handle keyboard shortcuts
function handleKeydown(e) {
    if (!isEnabled) return;

    let handled = false;
    // Ctrl+Shift+L or Cmd+Shift+L to trigger conversion
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        handled = true;
        // Capture selection info and get text
        captureSelectionInfo(e.target);
        let text = getSelectedText(e.target);
        if (!text) text = getInputText(e.target);
        if (text.trim()) {
            // Manual conversion: clear any pending auto timer
            clearTimeout(conversionTimeout);
            convertText(text, e.target);
        }
    }

    // Ctrl+Shift+A or Cmd+Shift+A to accept LaTeX suggestion (still supported)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        handled = true;
        acceptLatexSuggestion(e.target);
    }

    // Escape to hide overlay (also cancels any in-flight conversion)
    if (e.key === 'Escape') {
        handled = true;
        hideLatexOverlay();
    }

    // Auto-convert: Only trigger after no key has been pressed for delay
    if (!handled && isEnabled && settings.autoConvert) {
        if (suppressAutoConvertOnce) { suppressAutoConvertOnce = false; return; }
        // Ignore Tab while overlay handles it
        if (e.key === 'Tab') return;
        clearTimeout(conversionTimeout);
        const element = e.target;
        conversionTimeout = setTimeout(() => {
            if (!isEnabled || !settings.autoConvert) return;
            if (!element || !isInputElement(element)) return;
            const txt = getInputText(element) || '';
            if (txt.trim().length < 3) { hideLatexOverlay(); return; }
            lastSelectionInfo = { type: 'all' };
            lastSelectionRange = null;
            convertText(txt, element);
        }, settings.delay);
    }
}

// Get selected text from input element
function getSelectedText(element) {
    if (element.isContentEditable) {
        const selection = window.getSelection();
        return selection.toString();
    } else {
        const start = element.selectionStart;
        const end = element.selectionEnd;
        if (start !== end) {
            return element.value.substring(start, end);
        }
    }
    return '';
}

// Get text from input element
// Capture selection info from an element before conversion (global)
function captureSelectionInfo(element) {
    lastSelectionInfo = null;
    lastSelectionRange = null;

    if (element && element.isContentEditable) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.toString()) {
            const range = sel.getRangeAt(0).cloneRange();
            lastSelectionRange = range;
            lastSelectionInfo = { type: 'range' };
            return;
        }
        lastSelectionInfo = { type: 'all' };
        return;
    }

    if (element && typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
        const start = element.selectionStart;
        const end = element.selectionEnd;
        if (start !== end) {
            lastSelectionInfo = { type: 'indices', start, end };
            return;
        }
    }
    lastSelectionInfo = { type: 'all' };
}

// Replace selection or full content with latex (global)
function applyLatexToElement(element, latex) {
    // Prevent auto-convert from retriggering due to programmatic input event
    suppressAutoConvertOnce = true;
    if (!element) return;

    if (element.isContentEditable) {
        if (lastSelectionInfo?.type === 'range' && lastSelectionRange) {
            const range = lastSelectionRange;
            range.deleteContents();
            const tn = document.createTextNode(latex);
            range.insertNode(tn);
            // Move caret after inserted text
            const sel = window.getSelection();
            sel.removeAllRanges();
            const after = document.createRange();
            after.setStartAfter(tn);
            after.collapse(true);
            sel.addRange(after);
        } else {
            element.innerText = latex;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    // input/textarea
    const val = element.value || '';
    if (lastSelectionInfo?.type === 'indices') {
        const { start, end } = lastSelectionInfo;
        element.value = val.slice(0, start) + latex + val.slice(end);
        const caret = start + latex.length;
        element.selectionStart = element.selectionEnd = caret;
    } else {
        element.value = latex;
        element.selectionStart = element.selectionEnd = element.value.length;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

function getInputText(element) {
    if (element.isContentEditable) {
        return element.innerText || element.textContent;
    }
    return element.value;
}

// Set text in input element
function setInputText(element, text) {
    if (element.isContentEditable) {
        element.innerText = text;
    } else {
        element.value = text;
    }

    // Trigger input event
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

// Convert text to LaTeX
// Persist preview preference globally
function updateRenderPreviewSetting(value) {
    try {
        chrome.storage.sync.get('settings', (data) => {
            const s = data.settings || {};
            s.renderPreview = value;
            chrome.storage.sync.set({ settings: s });
        });
    } catch (_) {
        // ignore
    }
}

async function convertText(text, inputElement) {
    try {
        // Start converting animation and set current request ID
        const requestId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        currentConversionId = requestId;

        showLatexOverlay(inputElement, 'Converting', false);
        startConvertingAnimation();

        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'convertToLatex', text, requestId },
                resolve
            );
        });

        // If user cancelled/navigated and another request started, ignore this result
        if (requestId !== currentConversionId) return;

        stopConvertingAnimation();
        currentConversionId = null;

        if (response && response.success) {
            showLatexOverlay(inputElement, response.latex, true);
        } else if (response && response.error === 'cancelled') {
            // Do nothing if cancelled
        } else {
            const errMsg = response && response.error ? response.error : 'Unknown error';
            if (/encryption/i.test(errMsg)) {
                showNotification('Text2Latex is locked. Unlock your API keys from the popup or options page.');
            }
            showLatexOverlay(inputElement, `Error: ${errMsg}`, false);
            setTimeout(hideLatexOverlay, 3000);
        }
    } catch (error) {
        // Only act if still the active request
        if (currentConversionId) {
            stopConvertingAnimation();
            currentConversionId = null;
            console.error('Conversion error:', error);
            showLatexOverlay(inputElement, `Error: ${error.message}`, false);
            setTimeout(hideLatexOverlay, 3000);
        }
    }
}
function startConvertingAnimation() {
    stopConvertingAnimation();
    convertingDotsStep = 0;
    convertingDotsTimer = setInterval(() => {
        if (!latexOverlay || latexOverlay.style.display === 'none') return;
        const contentDiv = latexOverlay.querySelector('#text2latex-content');
        if (!contentDiv) return;
        const dots = '.'.repeat((convertingDotsStep % 3) + 1);
        contentDiv.textContent = `Converting${dots}`;
        convertingDotsStep++;
    }, 400);
}

function stopConvertingAnimation() {
    if (convertingDotsTimer) {
        clearInterval(convertingDotsTimer);
        convertingDotsTimer = null;
    }
}

function cancelCurrentConversion() {
    if (!currentConversionId) return;
    try {
        chrome.runtime.sendMessage({ action: 'cancelConversion', requestId: currentConversionId }, () => { });
    } catch (_) { }
    currentConversionId = null;
}


// Create LaTeX overlay element
function createLatexOverlay() {
    latexOverlay = document.createElement('div');
    latexOverlay.id = 'text2latex-overlay';
    latexOverlay.style.cssText = `
        position: absolute;
        background: #0a1929;
        color: #e3f2fd;
        border: 2px solid #1e88e5;
        border-radius: 8px;
        padding: 12px;
        font-family: 'Courier New', monospace;
        font-size: 15px;
        z-index: 999999;
        /* allow the overlay to grow larger on wide screens but respect viewport */
        max-width: 90vw;
        max-height: 80vh;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: none;
        white-space: pre-wrap;
        word-wrap: break-word;
    `;

    // Content container
    const contentDiv = document.createElement('div');
    contentDiv.id = 'text2latex-content';
    contentDiv.style.cssText = `
        white-space: pre-wrap;
        word-break: break-word;
        margin-bottom: 8px;
        /* allow larger preview area and scroll if needed */
        max-height: 60vh;
        overflow: auto;
    `;
    latexOverlay.appendChild(contentDiv);

    // Add accept button
    const acceptBtn = document.createElement('button');
    acceptBtn.id = 'text2latex-accept-btn';
    acceptBtn.textContent = 'Accept (Tab)';
    acceptBtn.style.cssText = `
        margin-top: 4px;
        padding: 6px 12px;
        background: #1e88e5;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        display: none;
    `;
    // Prevent button from stealing focus; accept on click
    acceptBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    acceptBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentInput) acceptLatexSuggestion(currentInput);
    });

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.id = 'text2latex-close-btn';
    closeBtn.textContent = 'Close (Esc)';
    closeBtn.style.cssText = `
        margin-top: 4px;
        margin-left: 8px;
        padding: 6px 12px;
        background: #1e88e5;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        display: none;
    `;
    closeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideLatexOverlay();
    });

    latexOverlay.appendChild(acceptBtn);
    latexOverlay.appendChild(closeBtn);

    // Add preview toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'text2latex-toggle-preview-btn';
    toggleBtn.textContent = 'View: Plain';
    toggleBtn.style.cssText = `
        margin-top: 4px;
        margin-left: 8px;
        padding: 6px 12px;
        background: #1e88e5;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        display: none;
    `;
    toggleBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const next = !(settings && settings.renderPreview !== false);
        updateRenderPreviewSetting(next);
        if (!settings) settings = {}; settings.renderPreview = next;
        const latex = latexOverlay.dataset.latex || '';
        if (currentInput && latex) {
            showLatexOverlay(currentInput, latex, true);
        }
    });

    latexOverlay.appendChild(toggleBtn);

    // Prevent overlay from stealing focus; clicking it should not blur the input
    latexOverlay.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Keep focus on current input
        if (currentInput && typeof currentInput.focus === 'function') currentInput.focus();
    }, true);

    document.body.appendChild(latexOverlay);
}

// Show LaTeX overlay
function showLatexOverlay(inputElement, content, showAcceptBtn = false) {
    if (!latexOverlay) return;

    const rect = inputElement.getBoundingClientRect();

    // Position overlay below input
    latexOverlay.style.left = `${rect.left + window.scrollX}px`;
    latexOverlay.style.top = `${rect.bottom + window.scrollY + 5}px`;

    // Update content
    const contentDiv = latexOverlay.querySelector('#text2latex-content');
    const acceptBtn = latexOverlay.querySelector('#text2latex-accept-btn');
    const closeBtn = latexOverlay.querySelector('#text2latex-close-btn');
    const toggleBtn = latexOverlay.querySelector('#text2latex-toggle-preview-btn');

    if (contentDiv) {
        // Decide whether to render LaTeX preview
        const previewEnabled = (settings && settings.renderPreview !== false);
        if (showAcceptBtn && previewEnabled && shouldRenderPreview(content)) {
            renderLatexPreview(contentDiv, content);
        } else {
            contentDiv.textContent = content;
        }
    }

    if (showAcceptBtn) {
        acceptBtn.style.display = 'inline-block';
        if (closeBtn) closeBtn.style.display = 'inline-block';
        if (toggleBtn) {
            toggleBtn.style.display = 'inline-block';
            const previewEnabled = (settings && settings.renderPreview !== false);
            toggleBtn.textContent = previewEnabled ? 'View: Plain' : 'View: Rendered';
        }
        latexOverlay.dataset.latex = content;
    } else {
        acceptBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'none';
        if (toggleBtn) toggleBtn.style.display = 'none';
        delete latexOverlay.dataset.latex;
    }

    latexOverlay.style.display = 'block';

    // Decide if we should attempt a preview render
    function shouldRenderPreview(latex) {
        if (!latex || typeof latex !== 'string') return false;
        if (latex.length > 4000) return false; // safety: too long
        return true;
    }

    // Render LaTeX preview using a safe image-based renderer (CodeCogs SVG)
    function renderLatexPreview(container, latex) {
        try {
            // Reset container
            container.innerHTML = '';
            const hint = document.createElement('div');
            hint.textContent = 'Rendering preview...';
            hint.style.opacity = '0.7';
            hint.style.fontStyle = 'italic';
            container.appendChild(hint);

            const encoded = encodeURIComponent(latex);
            const url = `https://latex.codecogs.com/svg.image?${encoded}`;

            const img = new Image();
            img.alt = 'LaTeX preview';
            // Make the preview substantially larger and responsive to viewport
            img.style.maxWidth = '90vw';
            img.style.maxHeight = '60vh';
            img.style.display = 'block';
            img.style.filter = 'invert(1)';
            img.style.width = 'auto';
            img.style.height = 'auto';

            const timeoutMs = 6000;
            const timer = setTimeout(() => {
                // Fallback to plain text on timeout
                container.textContent = latex;
            }, timeoutMs);

            img.onload = () => {
                clearTimeout(timer);
                container.innerHTML = '';
                container.appendChild(img);
            };
            img.onerror = () => {
                clearTimeout(timer);
                container.textContent = latex;
            };

            // Start loading
            img.src = url;
        } catch (e) {
            console.warn('Preview render failed, falling back to text:', e);
            container.textContent = latex;
        }
    }

}

// Hide LaTeX overlay
function hideLatexOverlay() {
    if (latexOverlay) {
        latexOverlay.style.display = 'none';
    }
    // Cancel any in-flight conversion and stop animation; clear pending auto timer
    cancelCurrentConversion();
    stopConvertingAnimation();
    if (conversionTimeout) { clearTimeout(conversionTimeout); conversionTimeout = null; }
}

// Accept LaTeX suggestion
function acceptLatexSuggestion(inputElement) {
    if (!latexOverlay || !latexOverlay.dataset.latex) return;

    const latex = latexOverlay.dataset.latex;
    applyLatexToElement(inputElement, latex);
    hideLatexOverlay();

    // Show notification
    if (settings.showNotifications) {
        showNotification('LaTeX conversion applied!');
    }
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #1e88e5;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 9999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

