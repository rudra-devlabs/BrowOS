// js/filepicker.js

class FilePicker {
    constructor(options, resolve, reject) {
        this.options = Object.assign({
            title: 'Select a File',
            buttonLabel: 'Select',
            startPath: '/',
            mode: 'file' // 'file' or 'folder'
        }, options);
        
        this.resolve = resolve;
        this.reject = reject;
        this.currentPath = this.options.startPath;
        this.selectedEntry = null;

        this.windowId = `filepicker-${Date.now()}`;
        this.window = window.windowManager.createWindowInstance('filepicker', this.options.title, this.renderInitial());
        this.window.el = this.window.element;
        
        this.init();
    }
    
    static async open(options = {}) {
        if (!window.filesystem || !window.filesystem.isMounted()) {
            const success = await window.filesystem.mount();
            if (!success) {
                return null;
            }
        }
        return new Promise((resolve, reject) => {
            new FilePicker(options, resolve, reject);
        });
    }

    async init() {
        await this.renderContent(this.currentPath);
        this.window.el.addEventListener('close', () => this.handleClose(false));
    }
    
    renderInitial() {
        return `<div class="filepicker-container" id="${this.windowId}-content">Loading...</div>`;
    }

    async renderContent(path) {
        this.currentPath = path;
        const container = this.window.el.querySelector(`#${this.windowId}-content`);
        if (!container) return;

        const entries = await window.filesystem.list(path);
        const parentPath = path === '/' ? null : path.substring(0, path.lastIndexOf('/')) || '/';

        container.innerHTML = `
            <div class="filepicker-toolbar">
                <button class="filepicker-nav" data-path="${parentPath}" ${!parentPath ? 'disabled' : ''}>&uarr; Up</button>
                <span class="filepicker-path">${path}</span>
            </div>
            <div class="filepicker-list">
                ${entries.map(entry => {
                    const isDir = entry.kind === 'directory' || entry.type === 'directory';
                    if (this.options.mode === 'folder' && !isDir) return '';
                    return `
                        <div class="filepicker-item" data-path="${path === '/' ? '' : path}/${entry.name}" data-isdir="${isDir}">
                            <img src="${isDir ? BrowOSIcons.folder : this.getIconForFile(entry.name)}" alt="${entry.name}" />
                            <span>${entry.name}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="filepicker-footer">
                <button class="filepicker-btn-cancel">Cancel</button>
                <button class="filepicker-btn-select" disabled>${this.options.buttonLabel}</button>
            </div>
        `;

        this.bindEvents();
    }
    
    bindEvents() {
        const container = this.window.el.querySelector(`#${this.windowId}-content`);
        
        const upButton = container.querySelector('.filepicker-nav');
        if (upButton) {
            upButton.addEventListener('click', () => this.renderContent(upButton.dataset.path));
        }

        container.querySelectorAll('.filepicker-item').forEach(item => {
            item.addEventListener('click', () => {
                // Clear previous selection
                container.querySelectorAll('.filepicker-item.selected').forEach(sel => sel.classList.remove('selected'));
                item.classList.add('selected');
                this.selectedEntry = {
                    path: item.dataset.path,
                    isDir: item.dataset.isdir === 'true'
                };
                container.querySelector('.filepicker-btn-select').disabled = false;
            });
            item.addEventListener('dblclick', () => {
                 const isDir = item.dataset.isdir === 'true';
                 if (isDir) {
                    this.renderContent(item.dataset.path);
                 } else {
                     if (this.options.mode === 'file') {
                        this.handleClose(true);
                     }
                 }
            });
        });

        container.querySelector('.filepicker-btn-select').addEventListener('click', () => this.handleClose(true));
        container.querySelector('.filepicker-btn-cancel').addEventListener('click', () => this.handleClose(false));
    }
    
    handleClose(wasSuccessful) {
        if (this._isClosing) return;
        this._isClosing = true;
        if (wasSuccessful && this.selectedEntry) {
            this.resolve(this.selectedEntry.path);
        } else {
            this.reject('File selection cancelled.');
        }
        window.windowManager.closeWindow(this.window.element, this.window);
    }

    getIconForFile(fileName) {
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
        if (imageExts.includes(ext)) return BrowOSIcons.photos;
        return BrowOSIcons.file;
    }
}

window.FilePicker = FilePicker;
