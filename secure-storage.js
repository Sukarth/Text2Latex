// Shared secure storage utilities for Text2Latex
// Provides AES-GCM encryption for API keys using a passphrase-derived key.

(function (global) {
    const LOCAL_CONFIG_KEY = 'encryptionConfig';
    const LOCAL_API_KEYS_KEY = 'encryptedApiKeys';
    const DEFAULT_ITERATIONS = 250000;
    const KEY_LENGTH = 256;
    const IV_LENGTH_BYTES = 12;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    function toBase64(buffer) {
        const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function fromBase64(base64) {
        if (!base64) return new Uint8Array();
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function chromeGet(area, key) {
        return new Promise((resolve, reject) => {
            chrome.storage[area].get(key, (result) => {
                const err = chrome.runtime.lastError;
                if (err) return reject(err);
                resolve(result[key]);
            });
        });
    }

    function chromeSet(area, value) {
        return new Promise((resolve, reject) => {
            chrome.storage[area].set(value, () => {
                const err = chrome.runtime.lastError;
                if (err) return reject(err);
                resolve();
            });
        });
    }

    function chromeRemove(area, key) {
        return new Promise((resolve, reject) => {
            chrome.storage[area].remove(key, () => {
                const err = chrome.runtime.lastError;
                if (err) return reject(err);
                resolve();
            });
        });
    }

    async function generateSalt(bytes = 16) {
        const salt = new Uint8Array(bytes);
        crypto.getRandomValues(salt);
        return toBase64(salt);
    }

    async function importPbkdf2Key(passphrase) {
        return crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            { name: 'PBKDF2' },
            false,
            ['deriveKey', 'deriveBits']
        );
    }

    async function deriveAesKey(passphrase, saltBase64, iterations = DEFAULT_ITERATIONS) {
        const baseKey = await importPbkdf2Key(passphrase);
        const salt = fromBase64(saltBase64);
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations,
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: KEY_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function deriveHash(passphrase, saltBase64, iterations = DEFAULT_ITERATIONS) {
        const baseKey = await importPbkdf2Key(passphrase);
        const salt = fromBase64(saltBase64);
        const bits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt,
                iterations,
                hash: 'SHA-256'
            },
            baseKey,
            KEY_LENGTH
        );
        return toBase64(new Uint8Array(bits));
    }

    async function getConfig() {
        const config = await chromeGet('local', LOCAL_CONFIG_KEY).catch(() => null);
        return config || null;
    }

    async function saveConfig(config) {
        if (!config) {
            await chromeRemove('local', LOCAL_CONFIG_KEY);
        } else {
            await chromeSet('local', { [LOCAL_CONFIG_KEY]: config });
        }
    }

    async function getEncryptedApiKeys() {
        const stored = await chromeGet('local', LOCAL_API_KEYS_KEY).catch(() => null);
        return stored || {};
    }

    async function saveEncryptedApiKeys(keys) {
        await chromeSet('local', { [LOCAL_API_KEYS_KEY]: keys });
    }

    async function enableEncryption(passphrase, existingPlain = {}) {
        const passphraseSalt = await generateSalt(16);
        const encryptionSalt = await generateSalt(16);
        const iterations = DEFAULT_ITERATIONS;

        const passphraseHash = await deriveHash(passphrase, passphraseSalt, iterations);
        const cryptoKey = await deriveAesKey(passphrase, encryptionSalt, iterations);

        const encryptedKeys = {};
        for (const [provider, value] of Object.entries(existingPlain)) {
            if (!value) continue;
            encryptedKeys[provider] = await encryptString(value, cryptoKey);
        }

        const config = {
            enabled: true,
            iterations,
            passphraseSalt,
            encryptionSalt,
            passphraseHash,
            version: 1,
            updatedAt: Date.now()
        };

        await saveConfig(config);
        await saveEncryptedApiKeys(encryptedKeys);

        return { config, cryptoKey, encryptedKeys };
    }

    async function changePassphrase(currentKey, newPassphrase) {
        const decrypted = await getDecryptedApiKeys(currentKey);
        return enableEncryption(newPassphrase, decrypted);
    }

    async function verifyPassphrase(passphrase) {
        const config = await getConfig();
        if (!config || !config.enabled) {
            throw new Error('Encryption is not enabled');
        }
        const computedHash = await deriveHash(passphrase, config.passphraseSalt, config.iterations);
        if (computedHash !== config.passphraseHash) {
            return { valid: false };
        }
        const cryptoKey = await deriveAesKey(passphrase, config.encryptionSalt, config.iterations);
        return { valid: true, cryptoKey, config };
    }

    async function encryptString(plaintext, cryptoKey) {
        if (!plaintext) return null;
        const iv = new Uint8Array(IV_LENGTH_BYTES);
        crypto.getRandomValues(iv);
        const data = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv
            },
            cryptoKey,
            encoder.encode(plaintext)
        );
        return {
            iv: toBase64(iv),
            data: toBase64(data)
        };
    }

    async function decryptString(payload, cryptoKey) {
        if (!payload || !payload.data) return '';
        const iv = fromBase64(payload.iv || '');
        const encryptedData = fromBase64(payload.data || '');
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv
            },
            cryptoKey,
            encryptedData
        );
        return decoder.decode(decrypted);
    }

    async function getDecryptedApiKeys(cryptoKey) {
        if (!cryptoKey) return {};
        const encrypted = await getEncryptedApiKeys();
        const result = {};
        for (const [provider, payload] of Object.entries(encrypted)) {
            try {
                const value = await decryptString(payload, cryptoKey);
                result[provider] = value;
            } catch (error) {
                console.error('Failed to decrypt key for provider', provider, error);
                result[provider] = '';
            }
        }
        return result;
    }

    async function saveApiKeys(plainKeys, cryptoKey) {
        const encryptedExisting = await getEncryptedApiKeys();
        const updated = { ...encryptedExisting };

        for (const [provider, value] of Object.entries(plainKeys)) {
            if (!value) {
                delete updated[provider];
                continue;
            }
            updated[provider] = await encryptString(value, cryptoKey);
        }

        await saveEncryptedApiKeys(updated);
        return updated;
    }

    async function clearAllEncryption() {
        await chromeRemove('local', LOCAL_CONFIG_KEY);
        await chromeRemove('local', LOCAL_API_KEYS_KEY);
    }

    const api = {
        getConfig,
        saveConfig,
        getEncryptedApiKeys,
        saveEncryptedApiKeys,
        enableEncryption,
        changePassphrase,
        verifyPassphrase,
        encryptString,
        decryptString,
        getDecryptedApiKeys,
        saveApiKeys,
        clearAllEncryption,
        DEFAULT_ITERATIONS
    };

    if (typeof global !== 'undefined') {
        global.SECURE_STORAGE = api;
    }
})(typeof self !== 'undefined' ? self : window);
