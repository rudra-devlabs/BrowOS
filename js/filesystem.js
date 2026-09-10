// BrowOS FileSystem Engine
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
        this.listeners = new Map();
        this.state = 'unmounted'; // 'unmounted' | 'needs_permission' | 'ready'
        this.storageUsed = 0;
        this.storageLoaded = false;
        this._saveStorageTimer = null;
        this.initPromise = null;
    }

    // ─── Event Emitter ──────────────────────────────────────────
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            for (const cb of this.listeners.get(event)) {
                try {
                    cb(data);
                } catch (err) {
                    console.error(`Error in filesystem listener for '${event}':`, err);
                }
            }
        }
    }

    _setState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            this.emit('statechange', { state: newState, mountedName: this.getMountedName() });
        }
    }

    getState() {
        return this.state;
    }

    isMounted() {
        return this.handle !== null;
    }

    isReady() {
        return this.state === 'ready';
    }

    getMountedName() {
        return this.handle ? this.handle.name : null;
    }

    // ─── Initialization & Permission ────────────────────────────
    async init() {
        try {
            const saved = await loadHandle();
            if (saved) {
                this.handle = saved;
                const perm = await this._queryPermission();
                if (perm === 'granted') {
                    this._setState('ready');
                    await this._bootstrapHierarchy();
                    await this._loadStorageStats();
                    console.log("Restored mounted directory:", this.handle.name);
                    this.emit('mount', { name: this.handle.name, ready: true });
                } else {
                    this._setState('needs_permission');
                    console.warn("Restored handle requires user re-authorization for:", this.handle.name);
                    this.emit('mount', { name: this.handle.name, ready: false });
                }
            } else {
                this._setState('unmounted');
            }
        } catch (e) {
            console.error("Failed to load handle from DB", e);
            this._setState('unmounted');
        }
    }

    async _queryPermission() {
        if (!this.handle) return 'denied';
        try {
            if (typeof this.handle.queryPermission === 'function') {
                return await this.handle.queryPermission({ mode: 'readwrite' });
            }
        } catch (e) {
            console.warn("queryPermission failed:", e);
        }
        return 'prompt';
    }

    // User-triggered unlock (does not violate user-activation security rules)
    async requestAccess() {
        if (!this.handle) {
            return await this.mount();
        }
        try {
            if (typeof this.handle.requestPermission === 'function') {
                const result = await this.handle.requestPermission({ mode: 'readwrite' });
                if (result === 'granted') {
                    this.handleCache.clear();
                    this._setState('ready');
                    await this._bootstrapHierarchy();
                    await this._loadStorageStats();
                    this.emit('mount', { name: this.handle.name, ready: true });
                    return true;
                }
            }
        } catch (err) {
            console.error("Permission request failed:", err);
        }
        return false;
    }

    async mount() {
        if (typeof window.showDirectoryPicker !== 'function') {
            const msg = 'Your browser does not support the File System Access API. Please use Chrome, Edge, or Brave.';
            if (window.BrowDialog && typeof window.BrowDialog.alert === 'function') {
                await window.BrowDialog.alert('Filesystem Unsupported', msg);
            } else {
                alert(msg);
            }
            return false;
        }

        try {
            this.handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await saveHandle(this.handle);
            this.handleCache.clear();
            this._setState('ready');
            await this._bootstrapHierarchy();
            await this._loadStorageStats();
            console.log("Directory mounted:", this.handle.name);
            this.emit('mount', { name: this.handle.name, ready: true });
            return true;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Mount failed:", err);
            }
            return false;
        }
    }

    async unmount() {
        const prevName = this.getMountedName();
        this.handle = null;
        this.handleCache.clear();
        this.storageUsed = 0;
        this.storageLoaded = false;
        await clearHandle();
        this._setState('unmounted');
        console.log("Directory unmounted.");
        this.emit('unmount', { prevName });
        return true;
    }

    // ─── Real OS Hierarchy Bootstrapping ────────────────────────
    async _bootstrapHierarchy() {
        if (!this.isReady()) return;
        const defaultDirs = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', '.browos'];
        for (const dir of defaultDirs) {
            try {
                await this.handle.getDirectoryHandle(dir, { create: true });
            } catch (err) {
                console.warn(`Failed to create system dir '${dir}':`, err);
            }
        }

        try {
            const desktopHandle = await this.handle.getDirectoryHandle('Desktop', { create: false });
            let hasWelcome = false;
            try {
                await desktopHandle.getFileHandle('Welcome.txt');
                hasWelcome = true;
            } catch {}

            if (!hasWelcome) {
                const welcomeHandle = await desktopHandle.getFileHandle('Welcome.txt', { create: true });
                const writable = await welcomeHandle.createWritable();
                const welcomeText = 
`=====================================================
🌌 Welcome to BrowOS!
=====================================================

BrowOS is running directly on your computer's real filesystem.
Mounted folder: ${this.handle.name}

Features & Application Suite:
- Desktop: Real desktop icons synchronized directly with your Desktop/ folder.
- FileBrow: Full-featured file explorer to browse, organize, and view files.
- CodeBrow & Brow Note: Edit source code, markdown, and text documents.
- BrowShell Terminal: Unix-style shell (ls, cd, mkdir, cat, rm, cp, mv, grep, getnet).
- Void Tactics: Arcade game saving persistent highscores to Desktop/.

Any file you create, save, or edit in BrowOS is written directly to your computer inside this folder!
Enjoy your desktop environment!
`;
                await writable.write(welcomeText);
                await writable.close();
            }
        } catch (err) {
            console.warn("Bootstrap Welcome.txt error:", err);
        }
    }

    // ─── Path Normalization & Helpers ───────────────────────────
    _normalize(path) {
        if (!path) return '/';
        const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
        const resolved = [];
        for (const part of parts) {
            if (part === '.') continue;
            if (part === '..') {
                resolved.pop();
            } else {
                resolved.push(part);
            }
        }
        return resolved.length === 0 ? '/' : '/' + resolved.join('/');
    }

    _dirname(path) {
        const norm = this._normalize(path);
        if (norm === '/') return '/';
        const parts = norm.split('/').filter(Boolean);
        parts.pop();
        return parts.length === 0 ? '/' : '/' + parts.join('/');
    }

    _basename(path) {
        const norm = this._normalize(path);
        if (norm === '/') return '';
        const parts = norm.split('/').filter(Boolean);
        return parts.pop() || '';
    }

    _invalidateCache(path) {
        const norm = this._normalize(path);
        if (norm === '/') {
            this.handleCache.clear();
            return;
        }
        for (const key of this.handleCache.keys()) {
            if (key === norm || key.startsWith(norm + '/') || norm.startsWith(key + '/')) {
                this.handleCache.delete(key);
            }
        }
    }

    // ─── Path Resolution with Hierarchical Caching ──────────────
    async _resolve(path) {
        if (!this.handle || !this.isReady()) return null;
        const norm = this._normalize(path);

        if (norm === '/') return this.handle;

        if (this.handleCache.has(norm)) {
            return this.handleCache.get(norm);
        }

        const parts = norm.split('/').filter(Boolean);
        let current = this.handle;
        let builtPath = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            builtPath = builtPath + '/' + part;

            if (this.handleCache.has(builtPath)) {
                current = this.handleCache.get(builtPath);
                continue;
            }

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
                this.handleCache.set(builtPath, current);
            } catch (e) {
                return null;
            }
        }

        this.handleCache.set(norm, current);
        return current;
    }

    // ─── File & Directory Operations ────────────────────────────
    async list(path = '/') {
        if (!this.isReady()) return null;
        const handle = await this._resolve(path);
        if (!handle || handle.kind !== 'directory') return null;

        const entries = [];
        try {
            for await (const entry of handle.values()) {
                entries.push({
                    name: entry.name,
                    type: entry.kind === 'directory' ? 'directory' : 'file',
                    kind: entry.kind,
                    handle: entry
                });
            }
        } catch (e) {
            console.error(`Error listing directory '${path}':`, e);
            return null;
        }

        entries.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        return entries;
    }

    async readFile(path) {
        if (!this.isReady()) return null;
        const handle = await this._resolve(path);
        if (!handle || handle.kind !== 'file') return null;

        try {
            const file = await handle.getFile();
            return await file.text();
        } catch (e) {
            console.error(`Error reading file '${path}':`, e);
            return null;
        }
    }

    async readFileAsBlob(path) {
        if (!this.isReady()) return null;
        const handle = await this._resolve(path);
        if (!handle || handle.kind !== 'file') return null;

        try {
            return await handle.getFile();
        } catch (e) {
            console.error(`Error reading file as blob '${path}':`, e);
            return null;
        }
    }

    // Flexible API: handles both (fullPath, content) and (folderPath, fileName, content)
    async createFile(pathOrFolder, contentOrFileName = '', maybeContent = null) {
        if (!this.isReady()) return false;

        let fullPath = '';
        let content = '';

        if (maybeContent !== null) {
            const folder = pathOrFolder;
            const filename = contentOrFileName;
            fullPath = folder.endsWith('/') ? `${folder}${filename}` : `${folder}/${filename}`;
            content = maybeContent;
        } else {
            fullPath = pathOrFolder;
            content = contentOrFileName || '';
        }

        const norm = this._normalize(fullPath);
        const parentPath = this._dirname(norm);
        const name = this._basename(norm);
        if (!name) return false;

        let dirHandle = await this._resolve(parentPath);
        if (!dirHandle || dirHandle.kind !== 'directory') {
            const created = await this.ensureDirectory(parentPath);
            if (!created) return false;
            dirHandle = await this._resolve(parentPath);
        }
        if (!dirHandle || dirHandle.kind !== 'directory') return false;

        try {
            const fileHandle = await dirHandle.getFileHandle(name, { create: true });
            const blob = typeof content === 'string' ? new Blob([content], { type: 'text/plain' }) : content;
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            this._invalidateCache(norm);
            this._updateStorageDelta(blob.size || (typeof content === 'string' ? content.length : 0));
            this.emit('change', { type: 'create', kind: 'file', path: norm, name });
            return true;
        } catch (e) {
            console.error(`Error creating file '${norm}':`, e);
            return false;
        }
    }

    async writeFile(path, content = '') {
        return this.createFile(path, content);
    }

    async readdir(path = '/') {
        const entries = await this.list(path);
        if (!entries) return null;
        return entries.map(item => ({
            name: item.name,
            isDirectory: item.type === 'directory' || item.kind === 'directory',
            isFile: item.type === 'file' || item.kind === 'file',
            type: item.type || item.kind
        }));
    }

    async createFileFromBlob(path, blob) {
        if (!this.isReady()) return false;
        const norm = this._normalize(path);
        const parentPath = this._dirname(norm);
        const name = this._basename(norm);
        if (!name) return false;

        let dirHandle = await this._resolve(parentPath);
        if (!dirHandle) {
            await this.ensureDirectory(parentPath);
            dirHandle = await this._resolve(parentPath);
        }
        if (!dirHandle || dirHandle.kind !== 'directory') return false;

        try {
            const fileHandle = await dirHandle.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            this._invalidateCache(norm);
            this._updateStorageDelta(blob.size || 0);
            this.emit('change', { type: 'create', kind: 'file', path: norm, name });
            return true;
        } catch (e) {
            console.error(`Error creating file from blob '${norm}':`, e);
            return false;
        }
    }

    async createDirectory(path) {
        if (!this.isReady()) return false;
        const norm = this._normalize(path);
        const parentPath = this._dirname(norm);
        const name = this._basename(norm);
        if (!name) return false;

        let parent = await this._resolve(parentPath);
        if (!parent) {
            await this.ensureDirectory(parentPath);
            parent = await this._resolve(parentPath);
        }
        if (!parent || parent.kind !== 'directory') return false;

        try {
            await parent.getDirectoryHandle(name, { create: true });
            this._invalidateCache(norm);
            this.emit('change', { type: 'create', kind: 'directory', path: norm, name });
            return true;
        } catch (e) {
            console.error(`Error creating directory '${norm}':`, e);
            return false;
        }
    }

    async ensureDirectory(path) {
        if (!this.isReady()) return false;
        const norm = this._normalize(path);
        if (norm === '/') return true;

        const parts = norm.split('/').filter(Boolean);
        let current = this.handle;
        let built = '';

        for (const part of parts) {
            built = built + '/' + part;
            try {
                current = await current.getDirectoryHandle(part, { create: true });
                this.handleCache.set(built, current);
            } catch (e) {
                return false;
            }
        }
        return true;
    }

    async delete(path) {
        if (!this.isReady()) return false;
        const norm = this._normalize(path);
        if (norm === '/') return false;

        const parentPath = this._dirname(norm);
        const name = this._basename(norm);
        const parent = await this._resolve(parentPath);
        if (!parent || parent.kind !== 'directory') return false;

        try {
            const target = await this._resolve(norm);
            let size = 0;
            if (target && target.kind === 'file') {
                try {
                    const f = await target.getFile();
                    size = f.size;
                } catch {}
            }

            await parent.removeEntry(name, { recursive: true });
            this._invalidateCache(norm);
            if (size > 0) this._updateStorageDelta(-size);
            this.emit('change', { type: 'delete', path: norm, name });
            return true;
        } catch (e) {
            console.error(`Error deleting entry '${norm}':`, e);
            return false;
        }
    }

    async rename(path, newName) {
        if (!this.isReady()) return false;
        const norm = this._normalize(path);
        const cleanNewName = newName.replace(/[\/\\]/g, '').trim();
        if (!cleanNewName) return false;

        const parentPath = this._dirname(norm);
        const destPath = parentPath === '/' ? `/${cleanNewName}` : `${parentPath}/${cleanNewName}`;

        const res = await this.move(norm, destPath);
        return res.ok;
    }

    async move(srcPath, destPath) {
        if (!this.isReady()) return { ok: false, error: 'Filesystem not ready' };
        const normSrc = this._normalize(srcPath);
        const normDest = this._normalize(destPath);

        const srcHandle = await this._resolve(normSrc);
        if (!srcHandle) return { ok: false, error: `No such file or directory: '${normSrc}'` };

        const srcName = this._basename(normSrc);
        const srcParentPath = this._dirname(normSrc);

        let finalDestParent = '';
        let finalDestName = '';

        const destHandle = await this._resolve(normDest);
        if (destHandle && destHandle.kind === 'directory') {
            finalDestParent = normDest;
            finalDestName = srcName;
        } else {
            finalDestParent = this._dirname(normDest);
            finalDestName = this._basename(normDest);
        }

        const destParentHandle = await this._resolve(finalDestParent);
        if (!destParentHandle || destParentHandle.kind !== 'directory') {
            return { ok: false, error: 'Destination directory not found' };
        }

        const targetNorm = finalDestParent === '/' ? `/${finalDestName}` : `${finalDestParent}/${finalDestName}`;

        if (typeof srcHandle.move === 'function') {
            try {
                if (normSrc === targetNorm) return { ok: true };
                await srcHandle.move(destParentHandle, finalDestName);
                this._invalidateCache(normSrc);
                this._invalidateCache(targetNorm);
                this.emit('change', { type: 'move', src: normSrc, dest: targetNorm });
                return { ok: true };
            } catch (e) {
                // Fall back to copy + delete
            }
        }

        try {
            if (srcHandle.kind === 'file') {
                const file = await srcHandle.getFile();
                const newFileHandle = await destParentHandle.getFileHandle(finalDestName, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(file);
                await writable.close();
            } else {
                await this._copyDirectory(srcHandle, destParentHandle, finalDestName);
            }

            const srcParentHandle = await this._resolve(srcParentPath);
            if (srcParentHandle) {
                await srcParentHandle.removeEntry(srcName, { recursive: true });
            }

            this._invalidateCache(normSrc);
            this._invalidateCache(targetNorm);
            this.emit('change', { type: 'move', src: normSrc, dest: targetNorm });
            return { ok: true };
        } catch (e) {
            console.error('Move failed:', e);
            return { ok: false, error: e.message };
        }
    }

    async copy(srcPath, destPath) {
        if (!this.isReady()) return { ok: false, error: 'Filesystem not ready' };
        const normSrc = this._normalize(srcPath);
        const normDest = this._normalize(destPath);

        const srcHandle = await this._resolve(normSrc);
        if (!srcHandle) return { ok: false, error: `No such file or directory: '${normSrc}'` };

        const srcName = this._basename(normSrc);
        let finalDestParent = '';
        let finalDestName = '';

        const destHandle = await this._resolve(normDest);
        if (destHandle && destHandle.kind === 'directory') {
            finalDestParent = normDest;
            finalDestName = srcName;
        } else {
            finalDestParent = this._dirname(normDest);
            finalDestName = this._basename(normDest);
        }

        const destParentHandle = await this._resolve(finalDestParent);
        if (!destParentHandle || destParentHandle.kind !== 'directory') {
            return { ok: false, error: 'Destination directory not found' };
        }

        const targetNorm = finalDestParent === '/' ? `/${finalDestName}` : `${finalDestParent}/${finalDestName}`;

        try {
            if (srcHandle.kind === 'file') {
                const file = await srcHandle.getFile();
                const newFileHandle = await destParentHandle.getFileHandle(finalDestName, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(file);
                await writable.close();
                this._updateStorageDelta(file.size);
            } else {
                await this._copyDirectory(srcHandle, destParentHandle, finalDestName);
            }

            this._invalidateCache(targetNorm);
            this.emit('change', { type: 'create', path: targetNorm, name: finalDestName });
            return { ok: true };
        } catch (e) {
            console.error('Copy failed:', e);
            return { ok: false, error: e.message };
        }
    }

    async _copyDirectory(srcDirHandle, destParentHandle, newName) {
        const newDirHandle = await destParentHandle.getDirectoryHandle(newName, { create: true });
        for await (const entry of srcDirHandle.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                const newFile = await newDirHandle.getFileHandle(entry.name, { create: true });
                const writable = await newFile.createWritable();
                await writable.write(file);
                await writable.close();
                this._updateStorageDelta(file.size);
            } else if (entry.kind === 'directory') {
                await this._copyDirectory(entry, newDirHandle, entry.name);
            }
        }
    }

    async getMetadata(path) {
        if (!this.isReady()) return null;
        const handle = await this._resolve(path);
        if (!handle) return null;

        if (handle.kind === 'file') {
            try {
                const file = await handle.getFile();
                return {
                    type: 'file',
                    kind: 'file',
                    size: file.size,
                    modified: file.lastModified
                };
            } catch (e) {
                return null;
            }
        }

        return {
            type: 'directory',
            kind: 'directory',
            size: 4096,
            modified: null
        };
    }

    async stat(path) {
        return await this.getMetadata(path);
    }

    async exists(path) {
        const meta = await this.getMetadata(path);
        return meta !== null;
    }

    // ─── Fast Incremental Storage Tracking ──────────────────────
    async _loadStorageStats() {
        if (!this.isReady()) return;
        try {
            const browosDir = await this.handle.getDirectoryHandle('.browos', { create: true });
            try {
                const fileHandle = await browosDir.getFileHandle('storage.json', { create: false });
                const file = await fileHandle.getFile();
                const text = await file.text();
                const data = JSON.parse(text);
                if (typeof data.storageUsed === 'number') {
                    this.storageUsed = data.storageUsed;
                    this.storageBreakdown = data.storageBreakdown || { docs: data.storageUsed, media: 0, other: 0 };
                    this.storageLoaded = true;
                    return;
                }
            } catch {}

            await this.recalculateStorage();
        } catch (e) {
            console.warn('Storage stats load error:', e);
        }
    }

    _updateStorageDelta(deltaBytes) {
        this.storageUsed = Math.max(0, this.storageUsed + deltaBytes);
        if (this.storageBreakdown) {
            this.storageBreakdown.docs = Math.max(0, (this.storageBreakdown.docs || 0) + deltaBytes);
        }
        this._debouncedSaveStorage();
    }

    _debouncedSaveStorage() {
        if (this._saveStorageTimer) clearTimeout(this._saveStorageTimer);
        this._saveStorageTimer = setTimeout(async () => {
            if (!this.isReady()) return;
            try {
                const browosDir = await this.handle.getDirectoryHandle('.browos', { create: true });
                const fileHandle = await browosDir.getFileHandle('storage.json', { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify({
                    storageUsed: this.storageUsed,
                    storageBreakdown: this.storageBreakdown || { docs: this.storageUsed, media: 0, other: 0 },
                    updated: Date.now()
                }));
                await writable.close();
            } catch {}
        }, 2000);
    }

    async recalculateStorage() {
        if (!this.isReady()) return { total: 0, docs: 0, media: 0, other: 0 };
        let total = 0;
        let docs = 0;
        let media = 0;
        let other = 0;

        const docExts = ['.txt', '.md', '.doc', '.docx', '.pdf', '.json', '.js', '.ts', '.html', '.css', '.c', '.cpp', '.py', '.rs', '.wasm', '.log'];
        const mediaExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.mp4', '.webm', '.mov', '.avi'];

        async function walk(dir) {
            for await (const entry of dir.values()) {
                if (entry.name === '.browos') continue;
                if (entry.kind === 'file') {
                    try {
                        const f = await entry.getFile();
                        const sz = f.size || 0;
                        total += sz;
                        const ext = '.' + entry.name.split('.').pop().toLowerCase();
                        if (docExts.includes(ext)) {
                            docs += sz;
                        } else if (mediaExts.includes(ext)) {
                            media += sz;
                        } else {
                            other += sz;
                        }
                    } catch {}
                } else if (entry.kind === 'directory') {
                    await walk(entry);
                }
            }
        }

        try {
            await walk(this.handle);
            this.storageUsed = total;
            this.storageBreakdown = { docs, media, other };
            this.storageLoaded = true;
            this._debouncedSaveStorage();
        } catch (e) {
            console.error('Failed to recalculate storage:', e);
        }
        return { total, docs, media, other };
    }

    async getStorageUsed() {
        if (!this.storageLoaded && this.isReady()) {
            await this._loadStorageStats();
        }
        return this.storageUsed || 0;
    }

    async getStorageBreakdown() {
        if (!this.storageLoaded && this.isReady()) {
            await this._loadStorageStats();
        }
        return this.storageBreakdown || { docs: this.storageUsed || 0, media: 0, other: 0 };
    }

    // ─── Unified storage snapshot (single source of truth for all UI) ───────
    // Two independent realities exist:
    //  - filesTotal (+docs/media/other): bytes in the mounted folder. A
    //    user-picked directory is NOT counted in origin-quota accounting.
    //  - originUsage/quota: what navigator.storage.estimate() reports
    //    (IndexedDB, CacheStorage, …) — real, but excludes mounted files.
    // totalUsed = filesTotal + originUsage is the honest "everything" number,
    // and every surface (widget, Settings) must render from this snapshot.
    async getStorageSnapshot() {
        const mounted = (typeof this.isMounted === 'function' && this.isMounted()) && this.isReady();
        let filesTotal = 0, docs = 0, media = 0;
        if (mounted) {
            try {
                filesTotal = await this.getStorageUsed() || 0;
                const bd = await this.getStorageBreakdown() || {};
                docs = Math.max(0, bd.docs || 0);
                media = Math.max(0, bd.media || 0);
            } catch (e) {
                console.error('Failed to query storage used:', e);
            }
        }
        // Derive "other" so the slices always add up to the real total.
        const other = Math.max(0, filesTotal - docs - media);

        let quota = 0, originUsage = 0, hasQuota = false;
        try {
            if (typeof navigator !== 'undefined' && navigator.storage
                && typeof navigator.storage.estimate === 'function') {
                const est = await navigator.storage.estimate();
                if (est && est.quota > 0) {
                    quota = est.quota;
                    originUsage = est.usage || 0;
                    hasQuota = true;
                }
            }
        } catch (e) { /* Storage API unavailable — file totals still stand */ }

        return {
            mounted,
            filesTotal, docs, media, other,
            originUsage, quota, hasQuota,
            totalUsed: filesTotal + originUsage,
        };
    }

    // ─── Shared real cleanup (used by the widget AND Settings) ──────────────
    // Clears CacheStorage + recalculates tracked stats. User files are never
    // touched. Returns honest numbers for result dialogs.
    async _estimateOriginUsage() {
        try {
            if (typeof navigator !== 'undefined' && navigator.storage
                && typeof navigator.storage.estimate === 'function') {
                const est = await navigator.storage.estimate();
                return (est && est.usage) || 0;
            }
        } catch (e) {}
        return 0;
    }

    async runStorageCleanup() {
        const before = await this._estimateOriginUsage();
        let cachesCleared = 0;
        try {
            if (typeof caches !== 'undefined' && caches && typeof caches.keys === 'function') {
                const names = await caches.keys();
                const results = await Promise.all(names.map(n => caches.delete(n).catch(() => false)));
                cachesCleared = results.filter(Boolean).length;
            }
        } catch (e) {
            console.error('Failed to clear caches:', e);
        }
        let recalculated = false;
        try {
            if (this.isMounted() && typeof this.recalculateStorage === 'function') {
                await this.recalculateStorage();
                recalculated = true;
            }
        } catch (e) {
            console.error('Failed to recalculate storage:', e);
        }
        const after = await this._estimateOriginUsage();
        return {
            cachesCleared,
            recalculated,
            reclaimedBytes: Math.max(0, before - after),
            snapshot: await this.getStorageSnapshot(),
        };
    }

    formatBytes(bytes) {
        bytes = Math.max(0, Number(bytes) || 0);
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
        const value = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
        return `${value} ${units[i]}`;
    }
}

const filesystem = new FileSystem();
window.filesystem = filesystem;
filesystem.initPromise = filesystem.init();
