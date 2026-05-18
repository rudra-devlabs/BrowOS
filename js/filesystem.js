const DB_NAME = 'BrowOS_FS';
const STORE_NAME = 'handles';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveHandle(handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(handle, 'localHandle');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function loadHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get('localHandle');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function clearHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete('localHandle');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

class FileSystem {
    constructor() {
        this.handle = null;
        this.handleCache = new Map();
    }

    async init() {
        try {
            const saved = await loadHandle();
            if (saved) {
                this.handle = saved;
                console.log("Restored mounted directory:", this.handle.name);
            }
        } catch (e) {
            console.error("Failed to load handle from DB", e);
        }
    }

    isMounted() {
        return this.handle !== null;
    }

    async mount() {
        try {
            this.handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await saveHandle(this.handle);
            this.handleCache.clear();
            console.log("Directory mounted:", this.handle.name);
            return true;
        } catch (err) {
            console.error("Mount failed:", err);
            return false;
        }
    }

    async unmount() {
        this.handle = null;
        this.handleCache.clear();
        await clearHandle();
        console.log("Directory unmounted.");
        return true;
    }

    async _checkPermission() {
        if (!this.handle) return false;
        try {
            if ((await this.handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
            if ((await this.handle.requestPermission({ mode: 'readwrite' })) === 'granted') return true;
        } catch (e) {
            console.error("Permission check failed:", e);
        }
        return false;
    }

    async list(path) {
        if (!this.isMounted()) return null;
        const handle = await this._resolve(path);
        if (!handle || handle.kind !== 'directory') return null;

        const entries = [];
        try {
            for await (const entry of handle.values()) {
                entries.push({
                    name: entry.name,
                    type: entry.kind === 'directory' ? 'directory' : 'file',
                    handle: entry
                });
            }
        } catch (e) {
            console.error("Error listing directory:", e);
            return null;
        }
        return entries;
    }

    async readFile(path) {
        if (!this.isMounted()) return null;
        const handle = await this._resolve(path);
        if (!handle || handle.kind !== 'file') return null;

        try {
            const file = await handle.getFile();
            return await file.text();
        } catch (e) {
            console.error("Error reading file:", e);
            return null;
        }
    }

    async readFileAsBlob(path) {
        if (!this.isMounted()) return null;
        const handle = await this._resolve(path);
        if (!handle || handle.kind !== 'file') return null;

        try {
            return await handle.getFile();
        } catch (e) {
            console.error("Error reading file as blob:", e);
            return null;
        }
    }

    async createDirectory(path) {
        if (!this.isMounted()) return false;
        const parentPath = path.includes('/') ? this._dirname(path) : '/';
        const name = path.split('/').pop();
        const parent = await this._resolve(parentPath);
        if (!parent || parent.kind !== 'directory') return false;
        try {
            await parent.getDirectoryHandle(name, { create: true });
            return true;
        } catch (e) {
            console.error("Error creating directory:", e);
            return false;
        }
    }

    async createFile(path, content = '') {
        if (!this.isMounted()) return false;
        const parentPath = path.includes('/') ? this._dirname(path) : '/';
        const name = path.split('/').pop();
        const parent = await this._resolve(parentPath);
        if (!parent || parent.kind !== 'directory') return false;
        try {
            const fileHandle = await parent.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            return true;
        } catch (e) {
            console.error("Error creating file:", e);
            return false;
        }
    }

    async createFileFromBlob(path, blob) {
        if (!this.isMounted()) return false;
        const parentPath = path.includes('/') ? this._dirname(path) : '/';
        const name = path.split('/').pop();
        const parent = await this._resolve(parentPath);
        if (!parent || parent.kind !== 'directory') return false;
        try {
            const fileHandle = await parent.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        } catch (e) {
            console.error("Error creating file from blob:", e);
            return false;
        }
    }

    async ensureDirectory(path) {
        if (!this.isMounted()) return false;
        const parts = path.split('/').filter(Boolean);
        let current = '/';
        for (const part of parts) {
            current = current === '/' ? `/${part}` : `${current}/${part}`;
            const parent = await this._resolve(current.includes('/') ? this._dirname(current) : '/');
            if (!parent || parent.kind !== 'directory') return false;
            try {
                await parent.getDirectoryHandle(part, { create: true });
            } catch (e) {
                return false;
            }
        }
        return true;
    }

    async delete(path) {
        if (!this.isMounted()) return false;
        const parentPath = this._dirname(path);
        const name = path.split('/').filter(Boolean).pop();
        const parent = await this._resolve(parentPath);
        if (!parent || parent.kind !== 'directory') return false;
        try {
            await parent.removeEntry(name, { recursive: true });
            this.handleCache.clear();
            return true;
        } catch (e) {
            console.error("Error deleting entry:", e);
            return false;
        }
    }

    async rename(path, newName) {
        if (!this.isMounted()) return false;
        const handle = await this._resolve(path);
        if (!handle) return false;
        try {
            if (typeof handle.move === 'function') {
                await handle.move(newName);
                this.handleCache.clear();
                return true;
            }
            console.error("Rename not supported in this browser.");
            return false;
        } catch (e) {
            console.error("Error renaming:", e);
            return false;
        }
    }

    async move(srcPath, destPath) {
        if (!this.isMounted()) return { ok: false, error: 'Filesystem not mounted' };

        const srcHandle = await this._resolve(srcPath);
        if (!srcHandle) return { ok: false, error: `cannot stat '${srcPath}': No such file or directory` };

        const srcParentPath = this._dirname(srcPath);
        const srcName = srcPath.split('/').filter(Boolean).pop();

        const destHandle = await this._resolve(destPath);

        let destParentPath;
        let destName;

        if (destHandle && destHandle.kind === 'directory') {
            destParentPath = destPath;
            destName = srcName;
        } else {
            destParentPath = this._dirname(destPath);
            destName = destPath.split('/').filter(Boolean).pop();
        }

        const destParent = await this._resolve(destParentPath);
        if (!destParent || destParent.kind !== 'directory') {
            return { ok: false, error: `cannot move: destination directory not found` };
        }

        const destFullPath = destParentPath === '/' ? `/${destName}` : `${destParentPath}/${destName}`;
        const existingDest = await this._resolve(destFullPath);
        if (existingDest) {
            return { ok: false, error: `cannot move: '${destFullPath}' already exists` };
        }

        const sameParent = this._normalize(srcParentPath) === this._normalize(destParentPath);

        if (sameParent && typeof srcHandle.move === 'function') {
            try {
                await srcHandle.move(destName);
                this.handleCache.clear();
                return { ok: true };
            } catch (e) {
                console.warn('handle.move failed, falling back to copy+delete:', e);
            }
        }

        try {
            if (srcHandle.kind === 'file') {
                const file = await srcHandle.getFile();
                const newFileHandle = await destParent.getFileHandle(destName, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(file);
                await writable.close();
            } else if (srcHandle.kind === 'directory') {
                await this._copyDirectory(srcHandle, destParent, destName);
            }

            const srcParent = await this._resolve(srcParentPath);
            if (srcParent) {
                await srcParent.removeEntry(srcName, { recursive: true });
            }
            this.handleCache.clear();
            return { ok: true };
        } catch (e) {
            console.error('Move failed:', e);
            return { ok: false, error: `cannot move: ${e.message}` };
        }
    }

    async _copyDirectory(srcDirHandle, destParentHandle, newName) {
        const newDirHandle = await destParentHandle.getDirectoryHandle(newName, { create: true });
        for await (const entry of srcDirHandle.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                const newFileHandle = await newDirHandle.getFileHandle(entry.name, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(file);
                await writable.close();
            } else if (entry.kind === 'directory') {
                await this._copyDirectory(entry, newDirHandle, entry.name);
            }
        }
    }

    _normalize(path) {
        return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    }

    async _resolve(path) {
        if (!this.handle) return null;
        const hasPerm = await this._checkPermission();
        if (!hasPerm) return null;

        let relative = path;
        if (relative.startsWith('/')) relative = relative.slice(1);
        if (relative.endsWith('/')) relative = relative.slice(0, -1);
        if (!relative) return this.handle;

        if (this.handleCache.has(relative)) {
            return this.handleCache.get(relative);
        }

        const parts = relative.split('/');
        let current = this.handle;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;
            try {
                if (i === parts.length - 1) {
                    try {
                        current = await current.getDirectoryHandle(part);
                    } catch {
                        current = await current.getFileHandle(part);
                    }
                } else {
                    current = await current.getDirectoryHandle(part);
                }
            } catch (e) {
                console.warn(`Could not resolve: ${part} in ${path}`, e);
                return null;
            }
        }

        this.handleCache.set(relative, current);
        return current;
    }

    _dirname(path) {
        const parts = path.split('/').filter(Boolean);
        parts.pop();
        return '/' + parts.join('/');
    }

    async getMetadata(path) {
        if (!this.isMounted()) return null;
        const handle = await this._resolve(path);
        if (!handle) return null;

        if (handle.kind === 'file') {
            try {
                const file = await handle.getFile();
                return {
                    type: 'file',
                    size: file.size,
                    modified: file.lastModified
                };
            } catch (e) {
                return null;
            }
        }

        return {
            type: 'directory',
            size: 4096,
            modified: null
        };
    }

    async getStorageUsed() {
        let totalBytes = 0;

        async function walkDir(dirHandle) {
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file') {
                    try {
                        const file = await entry.getFile();
                        totalBytes += file.size;
                    } catch { /* skip */ }
                } else if (entry.kind === 'directory') {
                    await walkDir(entry);
                }
            }
        }

        if (this.handle && await this._checkPermission()) {
            await walkDir(this.handle);
        }

        return totalBytes;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const value = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
        return `${value} ${units[i]}`;
    }
}

const filesystem = new FileSystem();
window.filesystem = filesystem;
filesystem.initPromise = filesystem.init();
