// Popup script for Text2Latex extension

document.addEventListener('DOMContentLoaded', async () => {
    const enableToggle = document.getElementById('enableToggle');
    const openSettingsBtn = document.getElementById('openSettings');
    const unlockBtn = document.getElementById('unlockEncryption');
    const currentProvider = document.getElementById('currentProvider');
    const currentModel = document.getElementById('currentModel');
    const currentDelay = document.getElementById('currentDelay');
    const status = document.getElementById('status');
    const encryptionStatusLabel = document.getElementById('encryptionStatusLabel');
    const encryptionStatusDot = document.getElementById('encryptionStatusDot');

    let settings = await getSettings();
    if (settings) {
        updateSettingsUI(settings);
    }
    await updateEncryptionUI();

    enableToggle.addEventListener('change', async (e) => {
        if (!settings) return;
        const enabled = e.target.checked;
        settings.enabled = enabled;
        await saveEnabledState(enabled);
        showStatus(enabled ? 'Extension enabled' : 'Extension disabled', 'success');
    });

    openSettingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    async function getSettings() {
        try {
            return await sendMessageAsync({ action: 'getSettings' });
        } catch (error) {
            console.error('Failed to load settings:', error);
            showStatus('Unable to load settings.', 'error');
            return null;
        }
    }

    async function saveEnabledState(enabled) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get('settings', (data) => {
                const stored = data.settings;
                if (!stored) {
                    resolve();
                    return;
                }
                stored.enabled = enabled;
                chrome.storage.sync.set({ settings: stored }, () => {
                    const err = chrome.runtime.lastError;
                    if (err) return reject(err);
                    resolve();
                });
            });
        });
    }

    function updateSettingsUI(settings) {
        enableToggle.checked = !!settings.enabled;
        currentProvider.textContent = (settings.provider || '').toUpperCase();
        const model = settings.providers?.[settings.provider]?.model;
        currentModel.textContent = model || 'Not configured';
        currentDelay.textContent = settings.delay ? `${settings.delay}ms` : '-';
    }

    async function updateEncryptionUI() {
        try {
            const statusData = await sendMessageAsync({ action: 'getEncryptionStatus' });
            if (!statusData) return;
            const { enabled, unlocked } = statusData;
            if (enabled) {
                encryptionStatusLabel.textContent = unlocked ? 'Unlocked' : 'Locked';
                encryptionStatusDot.classList.toggle('unlocked', unlocked);
                encryptionStatusDot.classList.toggle('locked', !unlocked);
                unlockBtn.textContent = unlocked ? 'Lock Encryption' : 'Unlock Encryption';
                if (unlocked) {
                    unlockBtn.onclick = async () => {
                        await sendMessageAsync({ action: 'lockEncryption' });
                        showStatus('Encryption locked.', 'success');
                        await updateEncryptionUI();
                    };
                } else {
                    unlockBtn.onclick = async () => {
                        const passphrase = prompt('Enter your encryption passphrase:');
                        if (!passphrase) return;
                        const response = await sendMessageAsync({ action: 'unlockEncryption', passphrase });
                        if (response?.success) {
                            showStatus('Encryption unlocked.', 'success');
                        } else {
                            showStatus(response?.error || 'Failed to unlock encryption.', 'error');
                        }
                        await updateEncryptionUI();
                    };
                }
            } else {
                encryptionStatusLabel.textContent = 'Disabled';
                encryptionStatusDot.classList.remove('unlocked');
                encryptionStatusDot.classList.add('locked');
                unlockBtn.textContent = 'Open Settings';
                unlockBtn.onclick = () => chrome.runtime.openOptionsPage();
            }
        } catch (error) {
            console.error('Failed to get encryption status:', error);
            encryptionStatusLabel.textContent = 'Unknown';
            encryptionStatusDot.classList.remove('unlocked');
            encryptionStatusDot.classList.add('locked');
        }
    }

    function showStatus(message, type = 'success') {
        status.textContent = message;
        status.className = `status ${type}`;
        setTimeout(() => {
            status.textContent = '';
            status.className = 'status';
        }, 3000);
    }
});

function sendMessageAsync(payload) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(payload, (response) => {
            const err = chrome.runtime.lastError;
            if (err) return reject(err);
            resolve(response);
        });
    });
}

