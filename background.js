// Background service worker for Text2Latex extension

// Load shared secure storage helpers
try {
    importScripts('secure-storage.js');
} catch (error) {
    console.error('Failed to load secure storage helpers:', error);
}

// Default settings
const DEFAULT_SETTINGS = {
    enabled: true,
    delay: 1000,
    provider: 'openai',
    temperature: 0.3,
    maxTokens: 500,
    autoConvert: false,  // Changed to false by default
    showNotifications: true,
    renderPreview: true, // Render LaTeX preview in overlay by default
    providers: {
        openai: {
            apiKey: '',
            model: '',
            endpoint: 'https://api.openai.com/v1/chat/completions'
        },
        anthropic: {
            apiKey: '',
            model: '',
            endpoint: 'https://api.anthropic.com/v1/messages'
        },
        google: {
            apiKey: '',
            model: '',
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/'
        },
        openrouter: {
            apiKey: '',
            model: '',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions'
        }
    }
};
// Track in-flight conversions for cancellation
const inflightConversions = new Map(); // requestId -> AbortController

// Encryption state (lives only in memory, cleared when the service worker stops)
let encryptionCryptoKey = null;
let encryptionConfigCache = null;

async function refreshEncryptionConfig() {
    try {
        encryptionConfigCache = await SECURE_STORAGE.getConfig();
        if (!encryptionConfigCache?.enabled) {
            encryptionCryptoKey = null;
        }
    } catch (error) {
        console.error('Failed to load encryption config:', error);
        encryptionConfigCache = null;
        encryptionCryptoKey = null;
    }
}

refreshEncryptionConfig();


// Initialize settings on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get('settings', (data) => {
        if (!data.settings) {
            chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
        }
    });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'convertToLatex') {
        handleConversion(request.text, request.requestId, sendResponse);
        return true; // Keep channel open for async response
    } else if (request.action === 'cancelConversion') {
        const id = request.requestId;
        const ctrl = id ? inflightConversions.get(id) : null;
        if (ctrl) {
            try { ctrl.abort(); } catch (_) { }
            inflightConversions.delete(id);
        }
        sendResponse({ ok: true });
        return false;
    } else if (request.action === 'getSettings') {
        getSanitizedSettings().then(sendResponse).catch((error) => {
            console.error('Failed to get settings:', error);
            sendResponse(DEFAULT_SETTINGS);
        });
        return true;
    } else if (request.action === 'unlockEncryption') {
        unlockEncryption(request.passphrase).then(sendResponse).catch((error) => {
            console.error('Unlock failed:', error);
            sendResponse({ success: false, error: error.message || 'Failed to unlock' });
        });
        return true;
    } else if (request.action === 'lockEncryption') {
        encryptionCryptoKey = null;
        sendResponse({ success: true });
        return false;
    } else if (request.action === 'getEncryptionStatus') {
        getEncryptionStatus().then(sendResponse).catch((error) => {
            console.error('Failed to get encryption status:', error);
            sendResponse({ enabled: false, unlocked: false, providers: {} });
        });
        return true;
    } else if (request.action === 'getDecryptedApiKeys') {
        getDecryptedApiKeys().then(sendResponse).catch((error) => {
            console.error('Failed to get decrypted keys:', error);
            sendResponse({ success: false, error: error.message || 'Unable to decrypt keys' });
        });
        return true;
    }
});

// Listen for keyboard shortcuts (commands)
chrome.commands.onCommand.addListener(async (command) => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;

        const map = {
            'convert-to-latex': 'command_convert',
            'accept-latex': 'command_accept',
            'hide-overlay': 'command_hide'
        };
        const action = map[command];
        if (!action) return;

        // Try send, if fails inject content.js then retry
        try {
            await chrome.tabs.sendMessage(tab.id, { action });
        } catch (e) {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
            await chrome.tabs.sendMessage(tab.id, { action });
        }
    } catch (err) {
        console.error('Command handling error:', err);
    }
});

// Handle text to LaTeX conversion
async function handleConversion(text, requestId, sendResponse) {
    try {
        const settings = await getSettingsForRuntime();

        if (!settings.enabled) {
            sendResponse({ success: false, error: 'Extension is disabled' });
            return;
        }

        const provider = settings.provider;
        const providerConfig = settings.providers[provider];

        if (!providerConfig.apiKey) {
            sendResponse({ success: false, error: `API key not set for ${provider}` });
            return;
        }

        if (!providerConfig.model) {
            sendResponse({ success: false, error: `Model not selected for ${provider}` });
            return;
        }

        // Setup abort controller for this request
        const controller = new AbortController();
        if (requestId) inflightConversions.set(requestId, controller);

        try {
            const latex = await convertWithAI(text, provider, providerConfig, settings, controller.signal);
            sendResponse({ success: true, latex });
        } catch (err) {
            if (err && (err.name === 'AbortError' || err.message === 'The user aborted a request.')) {
                sendResponse({ success: false, error: 'cancelled' });
            } else {
                throw err;
            }
        } finally {
            if (requestId) inflightConversions.delete(requestId);
        }

    } catch (error) {
        console.error('Conversion error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Get sanitized settings (without decrypted API keys) for UI consumers
async function getSanitizedSettings() {
    const settings = await getRawSettings();
    for (const provider of Object.keys(settings.providers || {})) {
        if (!settings.providers[provider]) continue;
        settings.providers[provider].apiKey = '';
    }
    return settings;
}

// Get settings merged with decrypted API keys for runtime conversion
async function getSettingsForRuntime() {
    const settings = await getRawSettings();
    const config = encryptionConfigCache || await SECURE_STORAGE.getConfig();

    if (config?.enabled) {
        if (!encryptionCryptoKey) {
            throw new Error('Encryption is locked. Unlock the extension from the popup or options page.');
        }
        const decrypted = await SECURE_STORAGE.getDecryptedApiKeys(encryptionCryptoKey);
        for (const provider of Object.keys(settings.providers || {})) {
            if (!settings.providers[provider]) continue;
            settings.providers[provider].apiKey = decrypted[provider] || '';
        }
    }

    return settings;
}

function getRawSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (data) => {
            resolve(data.settings ? JSON.parse(JSON.stringify(data.settings)) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
        });
    });
}

// Convert text to LaTeX using AI
async function convertWithAI(text, provider, config, settings, signal) {
    const systemPrompt = `You are a natural language to LaTeX conversion expert. Your task is to convert mathematical expressions in the user's text into proper LaTeX format while leaving non-mathematical text unchanged.

- Intelligently recognize mathematical expressions, equations, symbols, and formatting intent.
- For inline math, use $...$ and for display math use $$...$$ or \\[...\\].
- Return ONLY the converted text without explanations, markdown code blocks, or additional commentary.
- Preserve all non-mathematical text exactly as it appears.

Some examples of common patterns:
- Fractions: "x over y" → $\\frac{x}{y}$
- Superscripts: "x squared" → $x^2$, "x to the power of n" → $x^n$
- Subscripts: "x sub i" → $x_i$
- Greek letters: "alpha", "beta" → $\\alpha$, $\\beta$
- Integrals: "integral from a to b of f(x) dx" → $\\int_a^b f(x) \\, dx$
- Sums: "sum from i=1 to n of x_i" → $\\sum_{i=1}^n x_i$
- Limits: "limit as x approaches 0 of f(x)" → $\\lim_{x \\to 0} f(x)$
- Roots: "square root of x" → $\\sqrt{x}$, "nth root of x" → $\\sqrt[n]{x}$
- Derivatives: "d/dx of f(x)" → $\\frac{d}{dx} f(x)$
- Matrices and vectors: Use appropriate LaTeX environments like \\begin{pmatrix}...\\end{pmatrix}
- Special symbols: pi → $\\pi$, infinity → $\\infty$, etc.
- Operators: plus, minus, times, divided by, equals, etc.

Handle mixed content by converting only the mathematical parts.`;

    switch (provider) {
        case 'openai':
            return await convertWithOpenAI(text, config, settings, systemPrompt, signal);
        case 'anthropic':
            return await convertWithAnthropic(text, config, settings, systemPrompt, signal);
        case 'google':
            return await convertWithGoogle(text, config, settings, systemPrompt, signal);
        case 'openrouter':
            return await convertWithOpenRouter(text, config, settings, systemPrompt, signal);
        default:
            throw new Error('Unknown provider');
    }
}

async function unlockEncryption(passphrase) {
    if (typeof passphrase !== 'string' || !passphrase.trim()) {
        throw new Error('Passphrase is required');
    }

    await refreshEncryptionConfig();
    if (!encryptionConfigCache?.enabled) {
        return { success: false, error: 'Encryption has not been configured yet.' };
    }

    const { valid, cryptoKey } = await SECURE_STORAGE.verifyPassphrase(passphrase);
    if (!valid) {
        return { success: false, error: 'Invalid passphrase' };
    }
    encryptionCryptoKey = cryptoKey;
    return { success: true, enabled: true, unlocked: true };
}

async function getEncryptionStatus() {
    await refreshEncryptionConfig();
    const encryptedKeys = await SECURE_STORAGE.getEncryptedApiKeys();
    const providers = Object.keys(encryptedKeys).reduce((acc, provider) => {
        acc[provider] = true;
        return acc;
    }, {});

    return {
        enabled: !!encryptionConfigCache?.enabled,
        unlocked: !!encryptionCryptoKey,
        providers
    };
}

async function getDecryptedApiKeys() {
    if (!encryptionCryptoKey) {
        throw new Error('Encryption is locked');
    }
    const keys = await SECURE_STORAGE.getDecryptedApiKeys(encryptionCryptoKey);
    return { success: true, keys };
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.encryptionConfig || changes.encryptedApiKeys)) {
        refreshEncryptionConfig();
        if (changes.encryptionConfig) {
            encryptionCryptoKey = null;
        }
    }
});

// OpenAI API
async function convertWithOpenAI(text, config, settings, systemPrompt, signal) {
    const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        signal,
        body: JSON.stringify({
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            temperature: settings.temperature,
            max_tokens: settings.maxTokens
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// Anthropic API
async function convertWithAnthropic(text, config, settings, systemPrompt, signal) {
    const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01'
        },
        signal,
        body: JSON.stringify({
            model: config.model,
            max_tokens: settings.maxTokens,
            temperature: settings.temperature,
            system: systemPrompt,
            messages: [
                { role: 'user', content: text }
            ]
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Anthropic API error');
    }

    const data = await response.json();
    return data.content[0].text.trim();
}

// Google Gemini API
async function convertWithGoogle(text, config, settings, systemPrompt, signal) {
    const endpoint = `${config.endpoint}${config.model}:generateContent?key=${config.apiKey}`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        signal,
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `${systemPrompt}\n\nUser text: ${text}`
                }]
            }],
            generationConfig: {
                temperature: settings.temperature,
                maxOutputTokens: settings.maxTokens
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Google API error');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text.trim();
}

// OpenRouter API
async function convertWithOpenRouter(text, config, settings, systemPrompt, signal) {
    const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
            'HTTP-Referer': chrome.runtime.getURL(''),
            'X-Title': 'Text2Latex Extension'
        },
        signal,
        body: JSON.stringify({
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            temperature: settings.temperature,
            max_tokens: settings.maxTokens
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenRouter API error');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

