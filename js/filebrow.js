class FileBrow {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentPath = "/";
        this.history = ["/"];
        this.historyIndex = 0;
        this.init();
    }

    async init() {
        if (window.filesystem && window.filesystem.initPromise) {
            await window.filesystem.initPromise;
        }
        await this.render();
    }

    getPathName(path) {
        if (path === "/") return filesystem.isMounted() ? filesystem.handle.name : "BrowOS";
        const parts = path.split("/").filter(Boolean);
        return parts[parts.length - 1] || "BrowOS";
    }

    getBreadcrumb(path) {
        const rootName = filesystem.isMounted() ? filesystem.handle.name : "BrowOS";
        if (path === "/") {
            return `<span class="crumb active">${rootName}</span>`;
        }

        const parts = path.split("/").filter(Boolean);
        let running = "";
        const crumbs = [`<span class="crumb" data-path="/">${rootName}</span>`];

        parts.forEach((part, index) => {
            running += `/${part}`;
            const isLast = index === parts.length - 1;
            crumbs.push(`<span class="crumb-sep">/</span>`);
            crumbs.push(`<span class="crumb ${isLast ? 'active' : ''}" data-path="${running}">${part}</span>`);
        });

        return crumbs.join("");
    }

    async navigateTo(path) {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(path);
        this.historyIndex++;
        this.currentPath = path;
        await this.render();
    }

    async navigateBack() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.currentPath = this.history[this.historyIndex];
            await this.render();
        }
    }

    async navigateForward() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.currentPath = this.history[this.historyIndex];
            await this.render();
        }
    }

    async navigateUp() {
        if (this.currentPath === "/") return;
        const parts = this.currentPath.split("/").filter(Boolean);
        parts.pop();
        const parentPath = parts.length ? `/${parts.join("/")}` : "/";
        await this.navigateTo(parentPath);
    }

    async openRoot(path) {
        this.currentPath = path;
        if (this.history[this.historyIndex] !== path) {
            this.history.push(path);
            this.historyIndex = this.history.length - 1;
        }
        await this.render();
    }

    async handleEntryClick(name, type) {
        const separator = this.currentPath.endsWith("/") ? "" : "/";
        const newPath = `${this.currentPath}${separator}${name}`;

        if (type === "directory") {
            await this.navigateTo(newPath);
            return;
        }

        const ext = '.' + name.split('.').pop().toLowerCase();
        const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif', '.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv'];

        if (mediaExtensions.includes(ext)) {
            window.windowManager.openFileInPhotos(newPath, name);
            return;
        }

        const content = await window.filesystem.readFile(newPath);
        const preview = content === null ? "Unable to read file." : content.substring(0, 500);
        await window.BrowDialog.alert(name, `File Preview:\n\n${preview}${content && content.length > 500 ? "..." : ""}`);
    }

    hideContextMenu() {
        document.querySelectorAll('.mac-context-menu[data-source="filebrow"]').forEach(menu => menu.remove());
    }

    async handleContextAction(action, name, type) {
        const separator = this.currentPath.endsWith("/") ? "" : "/";
        const targetPath = name ? `${this.currentPath}${separator}${name}` : this.currentPath;

        switch (action) {
            case 'open':
                if (name && type) await this.handleEntryClick(name, type);
                break;
            case 'open-with-brownote':
                if (name && type === 'file') {
                    window.windowManager.openFileInBrowNote(targetPath);
                }
                break;
            case 'open-with-photos':
                if (name && type === 'file') {
                    window.windowManager.openFileInPhotos(targetPath, name);
                }
                break;
            case 'refresh':
                await this.render();
                break;
            case 'delete':
                if (!filesystem.isMounted()) {
                    await window.BrowDialog.alert('Permission Denied', 'Mount a folder first to delete items.');
                    break;
                }
                const confirmed = await window.BrowDialog.confirm('Confirm Delete', `Are you sure you want to permanently delete "${name}"?`, true);
                if (confirmed) {
                    const success = await window.filesystem.delete(targetPath);
                    if (success) await this.render();
                    else await window.BrowDialog.alert('Error', 'Failed to delete the item.');
                }
                break;
            case 'rename':
                if (!filesystem.isMounted()) {
                    await window.BrowDialog.alert('Permission Denied', 'Mount a folder first to rename items.');
                    break;
                }
                const newName = await window.BrowDialog.prompt('Rename', 'Enter a new name:', name);
                if (newName && newName !== name) {
                    const success = await window.filesystem.rename(targetPath, newName);
                    if (success) await this.render();
                    else await window.BrowDialog.alert('Error', 'Failed to rename. Browser might not support this feature or the name is invalid.');
                }
                break;
            case 'new-folder':
                if (!filesystem.isMounted()) {
                    await window.BrowDialog.alert('Permission Denied', 'Mount a folder first to create directories.');
                    break;
                }
                const folderName = await window.BrowDialog.prompt('New Folder', 'Enter folder name:', 'New Folder');
                if (folderName) {
                    const success = await window.filesystem.createDirectory(this.currentPath + (this.currentPath.endsWith('/') ? '' : '/') + folderName);
                    if (success) await this.render();
                    else await window.BrowDialog.alert('Error', 'Failed to create folder.');
                }
                break;
            case 'new-file':
                if (!filesystem.isMounted()) {
                    await window.BrowDialog.alert('Permission Denied', 'Mount a folder first to create files.');
                    break;
                }
                const fileName = await window.BrowDialog.prompt('New File', 'Enter file name:', 'New File.txt');
                if (fileName) {
                    const success = await window.filesystem.createFile(this.currentPath + (this.currentPath.endsWith('/') ? '' : '/') + fileName, '');
                    if (success) await this.render();
                    else await window.BrowDialog.alert('Error', 'Failed to create file.');
                }
                break;
            case 'info':
                await window.BrowDialog.alert('Get Info', `Name: ${name || this.currentPath}\nType: ${type || 'directory'}`);
                break;
        }
    }

    showContextMenu(e, targetType, name = null, entryType = null) {
        e.preventDefault();
        e.stopPropagation();

        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.className = 'mac-context-menu visible';
        menu.dataset.source = 'filebrow';
        
        console.log("Showing context menu for:", targetType, name);

        const createItem = (label, action) => {
            const item = document.createElement('div');
            item.className = 'mac-context-menu-item';
            item.textContent = label;
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this.hideContextMenu();
                this.handleContextAction(action, name, entryType);
            });
            return item;
        };

        const createDivider = () => {
            const div = document.createElement('div');
            div.className = 'mac-context-menu-divider';
            return div;
        };

        if (targetType === 'entry') {
            menu.appendChild(createItem('Open', 'open'));
            if (entryType === 'file') {
                menu.appendChild(createItem('Open with Brow Notes', 'open-with-brownote'));
                const ext = '.' + name.split('.').pop().toLowerCase();
                const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif', '.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv'];
                if (mediaExtensions.includes(ext)) {
                    menu.appendChild(createItem('Open with Photos', 'open-with-photos'));
                }
            }
            menu.appendChild(createItem('Rename', 'rename'));
            menu.appendChild(createDivider());
            menu.appendChild(createItem('Delete', 'delete'));
            menu.appendChild(createDivider());
            menu.appendChild(createItem('Get Info', 'info'));
        } else {
            menu.appendChild(createItem('New Folder', 'new-folder'));
            menu.appendChild(createItem('New File', 'new-file'));
            menu.appendChild(createDivider());
            menu.appendChild(createItem('Refresh', 'refresh'));
            menu.appendChild(createDivider());
            menu.appendChild(createItem('Get Info', 'info'));
        }

        document.body.appendChild(menu);

        let left = e.clientX;
        let top = e.clientY;

        setTimeout(() => {
            if (left + menu.offsetWidth > window.innerWidth) left -= menu.offsetWidth;
            if (top + menu.offsetHeight > window.innerHeight) top -= menu.offsetHeight;
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        }, 0);
    }

    bindEvents() {
        const root = this.container;
        if (!root) return;

        root.querySelectorAll(".filebrow-nav-btn[data-action='back']").forEach((btn) => {
            btn.addEventListener("click", () => this.navigateBack());
        });

        root.querySelectorAll(".filebrow-nav-btn[data-action='forward']").forEach((btn) => {
            btn.addEventListener("click", () => this.navigateForward());
        });

        root.querySelectorAll(".filebrow-nav-btn[data-action='up']").forEach((btn) => {
            btn.addEventListener("click", () => this.navigateUp());
        });

        root.querySelectorAll(".filebrow-sidebar-item[data-path]").forEach((item) => {
            item.addEventListener("click", () => this.openRoot(item.dataset.path));
        });

        root.querySelectorAll(".filebrow-entry[data-name][data-type]").forEach((entry) => {
            entry.addEventListener("dblclick", () => {
                this.handleEntryClick(entry.dataset.name, entry.dataset.type);
            });
            entry.addEventListener("contextmenu", (e) => {
                this.showContextMenu(e, 'entry', entry.dataset.name, entry.dataset.type);
            });
        });

        const main = root.querySelector(".filebrow-main");
        if (main) {
            main.addEventListener("contextmenu", (e) => {
                if (!e.target.closest(".filebrow-entry")) {
                    this.showContextMenu(e, 'grid');
                }
            });
        }

        const layout = root.querySelector(".filebrow-layout");
        if (layout) {
            layout.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                if (!e.target.closest(".filebrow-entry") && !e.target.closest(".filebrow-sidebar")) {
                    this.showContextMenu(e, 'grid');
                }
            });
        }
        
        root.querySelectorAll(".filebrow-thumb[data-path]").forEach((thumb) => {
            const path = thumb.dataset.path;
            window.filesystem.readFileAsBlob(path).then((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    thumb.style.backgroundImage = `url(${url})`;
                    thumb.style.backgroundSize = 'cover';
                    thumb.style.backgroundPosition = 'center';
                }
            });
        });

        document.addEventListener("click", () => this.hideContextMenu(), { once: false });

        root.querySelectorAll(".crumb[data-path]").forEach((crumb) => {
            crumb.addEventListener("click", () => this.openRoot(crumb.dataset.path));
        });

        const connectBtn = root.querySelector("#mount-local-btn");
        if (connectBtn) {
            connectBtn.addEventListener("click", async () => {
                const success = await window.filesystem.mount();
                if (success) {
                    await this.navigateTo("/");
                }
            });
        }

        const unmountBtn = root.querySelector("#unmount-local-btn");
        if (unmountBtn) {
            unmountBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await window.filesystem.unmount();
                await this.navigateTo('/');
            });
        }
    }

    async render() {
        if (!this.container) return;

        const entries = await window.filesystem.list(this.currentPath);
        const mounted = filesystem.isMounted();
        const pathLabel = this.getPathName(this.currentPath);
        const breadcrumb = this.getBreadcrumb(this.currentPath);

        this.container.innerHTML = `
            <div class="filebrow-layout filebrow-dark">
                <aside class="filebrow-sidebar filebrow-dark-sidebar">
                    <div class="filebrow-sidebar-title">Locations</div>

                    <button class="filebrow-sidebar-item ${this.currentPath === '/' ? 'active' : ''}" data-path="/" type="button">
                        <img src="${BrowOSIcons.folder}" class="sidebar-icon" alt="Root">
                        <span>${mounted ? filesystem.handle.name : "BrowOS"}</span>
                    </button>

                    ${mounted ? `
                        <div class="filebrow-sidebar-divider"></div>
                        <div class="filebrow-sidebar-title">Folders</div>
                        <button class="filebrow-sidebar-item ${this.currentPath === '/Documents' ? 'active' : ''}" data-path="/Documents" type="button">
                            <img src="${BrowOSIcons.documents}" class="sidebar-icon" alt="Documents">
                            <span>Documents</span>
                        </button>
                        <button class="filebrow-sidebar-item ${this.currentPath === '/Downloads' ? 'active' : ''}" data-path="/Downloads" type="button">
                            <img src="${BrowOSIcons.folder}" class="sidebar-icon" alt="Downloads">
                            <span>Downloads</span>
                        </button>
                        <button class="filebrow-sidebar-item ${this.currentPath === '/Desktop' ? 'active' : ''}" data-path="/Desktop" type="button">
                            <img src="${BrowOSIcons.folder}" class="sidebar-icon" alt="Desktop">
                            <span>Desktop</span>
                        </button>
                        <button class="filebrow-sidebar-item ${this.currentPath === '/Pictures' ? 'active' : ''}" data-path="/Pictures" type="button">
                            <img src="${BrowOSIcons.folder}" class="sidebar-icon" alt="Pictures">
                            <span>Pictures</span>
                        </button>
                        <button class="filebrow-sidebar-item ${this.currentPath === '/Music' ? 'active' : ''}" data-path="/Music" type="button">
                            <img src="${BrowOSIcons.folder}" class="sidebar-icon" alt="Music">
                            <span>Music</span>
                        </button>
                        <div class="filebrow-sidebar-divider"></div>
                        <div style="display: flex; align-items: center; padding-right: 5px;">
                            <button class="filebrow-sidebar-item" type="button" style="flex: 1; overflow: hidden; opacity: 0.7;">
                                <img src="${BrowOSIcons.folder}" class="sidebar-icon" alt="Local">
                                <span style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${filesystem.handle.name}</span>
                            </button>
                            <button id="unmount-local-btn" type="button" style="background: none; border: none; color: inherit; cursor: pointer; font-size: 1.1em; opacity: 0.6; padding: 5px;" title="Disconnect" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">â</button>
                        </div>
                    ` : `
                        <button class="filebrow-sidebar-item" id="mount-local-btn" type="button">
                            <img src="${BrowOSIcons.folder}" class="sidebar-icon" alt="Local">
                            <span>Connect Folder</span>
                        </button>
                    `}
                </aside>

                <section class="filebrow-main filebrow-dark-main">
                    <header class="filebrow-toolbar filebrow-dark-toolbar">
                        <div class="filebrow-nav-group">
                            ${BrowOSIcons.toolbarBtn(BrowOSIcons.ui.back, 'Back', 'filebrow-nav-btn', `data-action="back"${this.historyIndex === 0 ? ' disabled' : ''}`)}
                            ${BrowOSIcons.toolbarBtn(BrowOSIcons.ui.forward, 'Forward', 'filebrow-nav-btn', `data-action="forward"${this.historyIndex === this.history.length - 1 ? ' disabled' : ''}`)}
                            ${BrowOSIcons.toolbarBtn(BrowOSIcons.ui.chevronUp, 'Up', 'filebrow-nav-btn', `data-action="up"${this.currentPath === '/' ? ' disabled' : ''}`)}
                        </div>

                        <div class="filebrow-path-wrap">
                            <div class="filebrow-path-title">${pathLabel}</div>
                            <div class="filebrow-breadcrumb">${breadcrumb}</div>
                        </div>

                        ${BrowOSIcons.toolbarBtn(BrowOSIcons.ui.plus, 'New', 'filebrow-action-btn')}
                    </header>

                    <div class="filebrow-grid filebrow-dark-grid">
                        ${!mounted ? '<div class="empty-state">Click "Connect Folder" to mount a local directory</div>' : ''}
                        ${mounted && entries && entries.length === 0 ? '<div class="empty-state">This folder is empty</div>' : ''}
                        ${mounted && entries ? entries.map((entry) => {
                            const ext = '.' + entry.name.split('.').pop().toLowerCase();
                            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif'];
                            const videoExts = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv'];
                            const isImage = entry.type === 'file' && imageExts.includes(ext);
                            const isVideo = entry.type === 'file' && videoExts.includes(ext);
                            const iconSrc = entry.type === 'directory' ? BrowOSIcons.folder : (isImage || isVideo ? null : BrowOSIcons.file);
                            return `
                                <div class="filebrow-entry ${isImage ? 'filebrow-entry-media filebrow-entry-image' : ''} ${isVideo ? 'filebrow-entry-media filebrow-entry-video' : ''}" data-name="${entry.name}" data-type="${entry.type}" data-ext="${ext}">
                                    ${iconSrc ? `<img src="${iconSrc}" class="grid-icon" alt="${entry.type}">` : ''}
                                    ${isImage ? `<div class="filebrow-thumb" data-path="${this.currentPath}${this.currentPath.endsWith('/') ? '' : '/'}${entry.name}"></div>` : ''}
                                    ${isVideo ? `<div class="filebrow-thumb filebrow-video-thumb"><svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>` : ''}
                                    <span class="grid-label">${entry.name}</span>
                                </div>
                            `;
                        }).join('') : ''}
                    </div>
                </section>
            </div>
        `;

        this.bindEvents();
    }
}

window.FileBrow = FileBrow;
