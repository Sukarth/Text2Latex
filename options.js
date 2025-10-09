// Options page script for Text2Latex extension with secure API key storage

const PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter'];

const DEFAULT_SETTINGS = {
    enabled: true,
    delay: 1000,
    provider: 'openai',
    temperature: 0.3,
    maxTokens: 500,
    autoConvert: false,
    showNotifications: true,
    renderPreview: true,
    providers: {
        openai: {
            apiKey: '',
            model: '',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            hasApiKey: false
        },
        anthropic: {
            apiKey: '',
            model: '',
            endpoint: 'https://api.anthropic.com/v1/messages',
            hasApiKey: false
        },
        google: {
            apiKey: '',
            model: '',
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
            hasApiKey: false
        },
        openrouter: {
            apiKey: '',
            model: '',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            hasApiKey: false
        }
    }
};

let currentSettings = null;
let encryptionState = {
    enabled: false,
    unlocked: false,
    cryptoKey: null,
    decryptedKeys: {},
    encryptedKeys: {},
    config: null
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    await loadSettingsAndEncryptionState();
    initializeUI();
    setupEventListeners();
    await updateEncryptionUI();
    refreshApiKeyInputs();
}

async function loadSettingsAndEncryptionState() {
    currentSettings = await loadSettingsFromSync();
    encryptionState.config = await SECURE_STORAGE.getConfig();
    encryptionState.encryptedKeys = await SECURE_STORAGE.getEncryptedApiKeys();
    encryptionState.enabled = !!encryptionState.config?.enabled;
    encryptionState.unlocked = false;
    encryptionState.cryptoKey = null;
    encryptionState.decryptedKeys = {};
}

function loadSettingsFromSync() {
    return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (data) => {
            const stored = data.settings ? JSON.parse(JSON.stringify(data.settings)) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            stored.providers = stored.providers || {};
            let removedPlainKeys = false;
            for (const provider of PROVIDERS) {
                if (!stored.providers[provider]) {
                    stored.providers[provider] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.providers[provider]));
                }
                if (stored.providers[provider].apiKey) {
                    removedPlainKeys = true;
                }
                stored.providers[provider].hasApiKey = !!stored.providers[provider].hasApiKey;
                stored.providers[provider].apiKey = '';
            }
            if (removedPlainKeys) {
                saveSettingsToSync(stored).catch((err) => console.error('Failed to sanitize stored API keys:', err));
            }
            resolve(stored);
        });
    });
}

function initializeUI() {
    document.getElementById('autoConvert').checked = !!currentSettings.autoConvert;
    document.getElementById('showNotifications').checked = !!currentSettings.showNotifications;
    const renderPreviewEl = document.getElementById('renderPreview');
    if (renderPreviewEl) {
        renderPreviewEl.checked = currentSettings.renderPreview !== false;
    }
    const delay = Math.max(600, currentSettings.delay || 1000);
    document.getElementById('delay').value = delay;
    document.getElementById('delayValue').textContent = `${delay}ms`;
    document.getElementById('temperature').value = currentSettings.temperature;
    document.getElementById('temperatureValue').textContent = currentSettings.temperature.toFixed(1);
    document.getElementById('maxTokens').value = currentSettings.maxTokens;
    document.getElementById('maxTokensValue').textContent = currentSettings.maxTokens;
    document.getElementById('activeProvider').value = currentSettings.provider || 'openai';

    for (const provider of PROVIDERS) {
        const modelSelect = document.getElementById(`${provider}-model`);
        const storedModel = currentSettings.providers[provider]?.model;
        if (modelSelect && storedModel) {
            modelSelect.value = storedModel;
        }
    }
}

function setupEventListeners() {
    document.getElementById('delay').addEventListener('input', (e) => {
        document.getElementById('delayValue').textContent = `${e.target.value}ms`;
    });
    document.getElementById('temperature').addEventListener('input', (e) => {
        document.getElementById('temperatureValue').textContent = parseFloat(e.target.value).toFixed(1);
    });
    document.getElementById('maxTokens').addEventListener('input', (e) => {
        document.getElementById('maxTokensValue').textContent = e.target.value;
    });

    document.querySelectorAll('.provider-tab').forEach(tab => {
        tab.addEventListener('click', () => switchProviderTab(tab.dataset.provider));
    });

    for (const provider of PROVIDERS) {
        const apiInput = document.getElementById(`${provider}-api-key`);
        if (!apiInput) continue;
        apiInput.addEventListener('input', () => {
            apiInput.dataset.dirty = 'true';
        });
        apiInput.addEventListener('blur', async (e) => {
            const apiKey = e.target.value.trim();
            if (!apiKey) return;
            if (encryptionState.enabled && !encryptionState.unlocked) return;
            await loadModelsForProvider(provider, apiKey);
        });
    }

    document.getElementById('saveBtn').addEventListener('click', handleSave);
    document.getElementById('resetBtn').addEventListener('click', handleReset);

    document.getElementById('enableEncryptionBtn').addEventListener('click', enableEncryptionFlow);
    document.getElementById('unlockEncryptionBtn').addEventListener('click', () => {
        const passphrase = document.getElementById('unlockPassphrase').value.trim();
        unlockEncryptionFlow(passphrase);
    });
    document.getElementById('lockEncryptionBtn').addEventListener('click', lockEncryptionFlow);
    document.getElementById('resetEncryptionBtn').addEventListener('click', resetEncryptionFlow);
    document.getElementById('changePassphraseBtn').addEventListener('click', changePassphraseFlow);
}

function switchProviderTab(provider) {
    document.querySelectorAll('.provider-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.provider === provider);
    });
    document.querySelectorAll('.provider-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === provider);
    });
}

function refreshApiKeyInputs() {
    const hasEncryptedData = encryptionState.enabled && Object.keys(encryptionState.encryptedKeys || {}).length > 0;
    for (const provider of PROVIDERS) {
        const input = document.getElementById(`${provider}-api-key`);
        if (!input) continue;

        if (encryptionState.enabled) {
            if (encryptionState.unlocked) {
                input.disabled = false;
                input.dataset.locked = 'false';
                input.value = encryptionState.decryptedKeys[provider] || '';
            } else {
                const hasKey = hasEncryptedData && !!encryptionState.encryptedKeys[provider];
                input.value = hasKey ? '********' : '';
                input.disabled = true;
                input.dataset.locked = 'true';
            }
        } else {
            input.disabled = false;
            input.dataset.locked = 'false';
            input.value = '';
        }
        input.dataset.dirty = 'false';
    }
}

async function enableEncryptionFlow() {
    const passphrase = document.getElementById('encryptionPassphrase').value.trim();
    const confirmPassphrase = document.getElementById('encryptionPassphraseConfirm').value.trim();

    if (!passphrase || passphrase.length < 8) {
        showStatus('Passphrase must be at least 8 characters long.', 'error');
        return;
    }
    if (passphrase !== confirmPassphrase) {
        showStatus('Passphrase confirmation does not match.', 'error');
        return;
    }

    try {
        const plainKeys = collectApiKeysFromInputs();
        const { cryptoKey, config, encryptedKeys } = await SECURE_STORAGE.enableEncryption(passphrase, plainKeys);
        encryptionState = {
            enabled: true,
            unlocked: true,
            cryptoKey,
            decryptedKeys: plainKeys,
            encryptedKeys,
            config
        };
        for (const provider of PROVIDERS) {
            if (currentSettings?.providers?.[provider]) {
                currentSettings.providers[provider].hasApiKey = !!plainKeys[provider];
            }
        }
        await chrome.runtime.sendMessage({ action: 'unlockEncryption', passphrase });
        document.getElementById('encryptionPassphrase').value = '';
        document.getElementById('encryptionPassphraseConfirm').value = '';
        refreshApiKeyInputs();
        await updateEncryptionUI();
        showStatus('Encryption enabled and API keys secured.', 'success');
    } catch (error) {
        console.error('Enable encryption error:', error);
        showStatus('Failed to enable encryption: ' + error.message, 'error');
    }
}

async function unlockEncryptionFlow(passphrase) {
    if (!passphrase) {
        showStatus('Enter your passphrase to unlock.', 'error');
        return;
    }

    try {
        const { valid, cryptoKey, config } = await SECURE_STORAGE.verifyPassphrase(passphrase);
        if (!valid) {
            showStatus('Incorrect passphrase.', 'error');
            return;
        }
        const decrypted = await SECURE_STORAGE.getDecryptedApiKeys(cryptoKey);
        encryptionState.enabled = true;
        encryptionState.unlocked = true;
        encryptionState.cryptoKey = cryptoKey;
        encryptionState.decryptedKeys = decrypted;
        encryptionState.config = config;
        encryptionState.encryptedKeys = await SECURE_STORAGE.getEncryptedApiKeys();
        await chrome.runtime.sendMessage({ action: 'unlockEncryption', passphrase });
        document.getElementById('unlockPassphrase').value = '';
        refreshApiKeyInputs();
        await updateEncryptionUI();
        showStatus('Encryption unlocked for this session.', 'success');
    } catch (error) {
        console.error('Unlock error:', error);
        showStatus('Failed to unlock encryption: ' + error.message, 'error');
    }
}

async function lockEncryptionFlow() {
    encryptionState.unlocked = false;
    encryptionState.cryptoKey = null;
    encryptionState.decryptedKeys = {};
    await chrome.runtime.sendMessage({ action: 'lockEncryption' });
    refreshApiKeyInputs();
    await updateEncryptionUI();
    showStatus('Encryption locked.', 'success');
}

async function resetEncryptionFlow() {
    if (!confirm('Resetting encryption will delete all stored API keys. Continue?')) {
        return;
    }
    try {
        await SECURE_STORAGE.clearAllEncryption();
        encryptionState = {
            enabled: false,
            unlocked: false,
            cryptoKey: null,
            decryptedKeys: {},
            encryptedKeys: {},
            config: null
        };
        await chrome.runtime.sendMessage({ action: 'lockEncryption' });
        for (const provider of PROVIDERS) {
            if (currentSettings?.providers?.[provider]) {
                currentSettings.providers[provider].hasApiKey = false;
            }
        }
        await saveSettingsToSync(currentSettings);
        refreshApiKeyInputs();
        await updateEncryptionUI();
        showStatus('Encryption reset. API keys removed.', 'success');
    } catch (error) {
        console.error('Reset encryption error:', error);
        showStatus('Failed to reset encryption: ' + error.message, 'error');
    }
}

async function changePassphraseFlow() {
    if (!encryptionState.unlocked || !encryptionState.cryptoKey) {
        showStatus('Unlock encryption before changing the passphrase.', 'error');
        return;
    }

    const newPassphrase = prompt('Enter a new passphrase (minimum 8 characters):');
    if (!newPassphrase) return;
    if (newPassphrase.length < 8) {
        showStatus('Passphrase must be at least 8 characters long.', 'error');
        return;
    }
    const confirmPassphrase = prompt('Confirm the new passphrase:');
    if (newPassphrase !== confirmPassphrase) {
        showStatus('Passphrase confirmation does not match.', 'error');
        return;
    }

    try {
        const { cryptoKey, config, encryptedKeys } = await SECURE_STORAGE.changePassphrase(encryptionState.cryptoKey, newPassphrase);
        encryptionState.cryptoKey = cryptoKey;
        encryptionState.config = config;
        encryptionState.encryptedKeys = encryptedKeys;
        encryptionState.decryptedKeys = await SECURE_STORAGE.getDecryptedApiKeys(cryptoKey);
        await chrome.runtime.sendMessage({ action: 'unlockEncryption', passphrase: newPassphrase });
        showStatus('Passphrase updated successfully.', 'success');
    } catch (error) {
        console.error('Change passphrase error:', error);
        showStatus('Failed to change passphrase: ' + error.message, 'error');
    }
}

function collectApiKeysFromInputs() {
    const result = {};
    for (const provider of PROVIDERS) {
        const input = document.getElementById(`${provider}-api-key`);
        if (!input) continue;
        if (input.dataset.locked === 'true') {
            result[provider] = encryptionState.decryptedKeys[provider] || '';
        } else {
            result[provider] = input.value.trim();
        }
    }
    return result;
}

async function handleSave() {
    try {
        const updatedSettings = JSON.parse(JSON.stringify(currentSettings));
        updatedSettings.autoConvert = document.getElementById('autoConvert').checked;
        updatedSettings.showNotifications = document.getElementById('showNotifications').checked;
        updatedSettings.renderPreview = document.getElementById('renderPreview').checked;
        updatedSettings.delay = Math.max(600, parseInt(document.getElementById('delay').value, 10));
        updatedSettings.temperature = parseFloat(document.getElementById('temperature').value);
        updatedSettings.maxTokens = parseInt(document.getElementById('maxTokens').value, 10);
        updatedSettings.provider = document.getElementById('activeProvider').value;

        for (const provider of PROVIDERS) {
            const modelSelect = document.getElementById(`${provider}-model`);
            if (modelSelect) {
                updatedSettings.providers[provider].model = modelSelect.value || '';
            }
        }

        const providerKeys = collectApiKeysFromInputs();
        const activeProvider = updatedSettings.provider;

        let activeKeyValue = '';
        if (encryptionState.enabled) {
            if (encryptionState.unlocked) {
                activeKeyValue = providerKeys[activeProvider];
            } else {
                activeKeyValue = encryptionState.encryptedKeys[activeProvider] ? 'encrypted' : '';
            }
        } else {
            activeKeyValue = providerKeys[activeProvider];
        }

        if (!activeKeyValue) {
            showStatus(`Please enter an API key for ${activeProvider}.`, 'error');
            return;
        }

        if (!updatedSettings.providers[activeProvider].model) {
            showStatus('Please select a model for the active provider.', 'error');
            return;
        }

        if (!encryptionState.enabled) {
            const hasKeys = Object.values(providerKeys).some(value => !!value);
            if (hasKeys) {
                showStatus('Enable encryption before saving API keys.', 'error');
                return;
            }
        }

        if (encryptionState.enabled && encryptionState.unlocked) {
            encryptionState.encryptedKeys = await SECURE_STORAGE.saveApiKeys(providerKeys, encryptionState.cryptoKey);
            encryptionState.decryptedKeys = providerKeys;
        }

        for (const provider of PROVIDERS) {
            updatedSettings.providers[provider].apiKey = '';
            updatedSettings.providers[provider].hasApiKey = encryptionState.enabled
                ? !!encryptionState.encryptedKeys[provider]
                : !!providerKeys[provider];
        }

        await saveSettingsToSync(updatedSettings);
        currentSettings = updatedSettings;

        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                try {
                    chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated' }, () => {
                        void chrome.runtime.lastError;
                    });
                } catch (_) {
                    // ignore tabs without content scripts
                }
            });
        });

        await updateEncryptionUI();
        showStatus('Settings saved successfully!', 'success');
    } catch (error) {
        console.error('Save error:', error);
        showStatus('Error saving settings: ' + error.message, 'error');
    }
}

async function handleReset() {
    if (!confirm('Reset all settings to defaults?')) return;
    currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    await saveSettingsToSync(currentSettings);
    initializeUI();
    refreshApiKeyInputs();
    showStatus('Settings reset to defaults.', 'success');
}

function sanitizeSettingsForSync(settings) {
    const clone = JSON.parse(JSON.stringify(settings));
    for (const provider of PROVIDERS) {
        if (!clone.providers[provider]) continue;
        delete clone.providers[provider].availableModels;
        clone.providers[provider].apiKey = '';
    }
    return clone;
}

function saveSettingsToSync(settings) {
    const safe = sanitizeSettingsForSync(settings);
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({ settings: safe }, () => {
            const err = chrome.runtime.lastError;
            if (err) return reject(err);
            resolve();
        });
    });
}

async function updateEncryptionUI() {
    const statusDot = document.getElementById('encryptionStatusDot');
    const statusText = document.getElementById('encryptionStatusText');
    const statusHelp = document.getElementById('encryptionStatusHelp');
    const setupSection = document.getElementById('encryptionSetupSection');
    const unlockSection = document.getElementById('encryptionUnlockSection');
    const unlockedActions = document.getElementById('encryptionUnlockedActions');

    if (!statusDot || !statusText || !statusHelp) return;

    if (!encryptionState.enabled) {
        statusDot.classList.remove('unlocked');
        statusDot.classList.add('locked');
        statusText.textContent = 'Encryption is disabled';
        statusHelp.textContent = 'Set a passphrase to encrypt your API keys locally using AES-256-GCM.';
        setupSection.style.display = 'block';
        unlockSection.style.display = 'none';
        unlockedActions.style.display = 'none';
        return;
    }

    if (encryptionState.unlocked) {
        statusDot.classList.remove('locked');
        statusDot.classList.add('unlocked');
        statusText.textContent = 'Encryption unlocked';
        statusHelp.textContent = 'API keys stay encrypted at rest. They will lock when the extension is unloaded.';
        setupSection.style.display = 'none';
        unlockSection.style.display = 'none';
        unlockedActions.style.display = 'flex';
    } else {
        statusDot.classList.remove('unlocked');
        statusDot.classList.add('locked');
        statusText.textContent = 'Encryption locked';
        statusHelp.textContent = 'Enter your passphrase to unlock API keys for this session.';
        setupSection.style.display = 'none';
        unlockSection.style.display = 'block';
        unlockedActions.style.display = 'none';
    }
}

function showStatus(message, type = 'success') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type} show`;
    setTimeout(() => {
        statusElement.classList.remove('show');
    }, 3500);
}

async function loadModelsForProvider(provider, explicitKey) {
    const modelSelect = document.getElementById(`${provider}-model`);
    if (!modelSelect) return;

    if (encryptionState.enabled && !encryptionState.unlocked && !explicitKey) {
        showStatus('Unlock encryption to load models.', 'error');
        return;
    }

    const apiKey = (explicitKey || document.getElementById(`${provider}-api-key`)?.value || '').trim();
    if (!apiKey) {
        showStatus(`Enter an API key for ${provider} first.`, 'error');
        return;
    }

    modelSelect.innerHTML = '<option value="">Loading models...</option>';
    modelSelect.disabled = true;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        let models = [];
        let response;

        if (provider === 'openai') {
            response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal: controller.signal
            });
            if (!response.ok) throw new Error('OpenAI models fetch failed');
            const data = await response.json();
            const allow = /(gpt|o4|omni)/i;
            models = (data.data || [])
                .map(m => ({ id: m.id, name: m.id }))
                .filter(m => allow.test(m.id))
                .sort((a, b) => a.id.localeCompare(b.id));
        } else if (provider === 'anthropic') {
            response = await fetch('https://api.anthropic.com/v1/models', {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                signal: controller.signal
            });
            if (!response.ok) throw new Error('Anthropic models fetch failed');
            const data = await response.json();
            models = (data.data || [])
                .map(m => ({ id: m.id, name: m.display_name || m.id }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } else if (provider === 'google') {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
                method: 'GET',
                signal: controller.signal
            });
            if (!response.ok) throw new Error('Google models fetch failed');
            const data = await response.json();
            models = (data.models || [])
                .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => {
                    const id = (m.name || '').split('/').pop();
                    return { id, name: m.displayName || id };
                })
                .sort((a, b) => a.name.localeCompare(b.name));
        } else if (provider === 'openrouter') {
            response = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': location.origin,
                    'X-Title': 'Text2Latex Extension'
                },
                signal: controller.signal
            });
            if (!response.ok) throw new Error('OpenRouter models fetch failed');
            const data = await response.json();
            models = (data.data || [])
                .map(m => ({ id: m.id, name: m.name || m.id }))
                .sort((a, b) => a.name.localeCompare(b.name));
        }

        clearTimeout(timeout);

        if (!models.length) {
            modelSelect.innerHTML = '<option value="">No models available</option>';
            modelSelect.disabled = false;
            showStatus(`No models available for ${provider}.`, 'error');
            return;
        }

        modelSelect.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });

        if (!modelSelect.value && models.length > 0) {
            modelSelect.value = models[0].id;
        }

        modelSelect.disabled = false;
        showStatus(`Models loaded for ${provider}.`, 'success');
    } catch (error) {
        clearTimeout(timeout);
        console.error(`Error loading models for ${provider}:`, error);
        modelSelect.innerHTML = '<option value="">Error loading models</option>';
        modelSelect.disabled = false;
        showStatus(`Error loading models for ${provider}: ${error.message}`, 'error');
    }
}


