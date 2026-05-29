// Icon paths for BrowOS (local SVG assets)
const BrowOSIcons = {
    // Dock & desktop apps
    filebrow: 'assets/icons/filebrow.svg',
    safari: 'assets/icons/safari.svg',
    messages: 'assets/icons/messages.svg',
    appstore: 'assets/icons/appstore.svg',
    launchpad: 'assets/icons/launchpad.svg',
    settings: 'assets/icons/settings.svg',
    terminal: 'assets/icons/terminal.svg',
    documents: 'assets/icons/documents.svg',
    brownote: 'assets/icons/brownote.svg',
    codebrow: 'assets/icons/codebrow.svg',

    // Filesystem
    folder: 'assets/icons/folder.svg',
    file: 'assets/icons/file.svg',

    // Extra app icons
    apps: {
        files: 'assets/icons/apps/files.svg',
        mail: 'assets/icons/apps/mail.svg',
        photos: 'assets/icons/apps/photos.svg',
        music: 'assets/icons/apps/music.svg',
        notes: 'assets/icons/apps/notes.svg',
        calculator: 'assets/icons/apps/calculator.svg',
        trash: 'assets/icons/apps/trash.svg',
        monitor: 'assets/icons/apps/monitor.svg',
        weather: 'assets/icons/apps/weather.svg',
        clock: 'assets/icons/apps/clock.svg',
        camera: 'assets/icons/apps/camera.svg',
        codebrow: 'assets/icons/apps/codebrow.svg',
        starship: 'assets/icons/apps/starship.svg',
        racer: 'assets/icons/apps/racer.svg'
    },

    // Window chrome & toolbars
    ui: {
        close: 'assets/icons/ui/close.svg',
        minimize: 'assets/icons/ui/minimize.svg',
        maximize: 'assets/icons/ui/maximize.svg',
        back: 'assets/icons/ui/back.svg',
        forward: 'assets/icons/ui/forward.svg',
        refresh: 'assets/icons/ui/refresh.svg',
        search: 'assets/icons/ui/search.svg',
        plus: 'assets/icons/ui/plus.svg',
        minus: 'assets/icons/ui/minus.svg',
        chevronUp: 'assets/icons/ui/chevron-up.svg',
        chevronDown: 'assets/icons/ui/chevron-down.svg',
        chevronLeft: 'assets/icons/ui/chevron-left.svg',
        chevronRight: 'assets/icons/ui/chevron-right.svg',
        settingsGear: 'assets/icons/ui/settings-gear.svg',
        menu: 'assets/icons/ui/menu.svg',
        cross: 'assets/icons/ui/cross.svg',
        tick: 'assets/icons/ui/tick.svg',
        lock: 'assets/icons/ui/lock.svg',
        unlock: 'assets/icons/ui/unlock.svg',
        info: 'assets/icons/ui/info.svg',
        warning: 'assets/icons/ui/warning.svg',
        error: 'assets/icons/ui/error.svg',
        check: 'assets/icons/ui/check.svg',
        more: 'assets/icons/ui/more.svg'
    },

    util: {
        sun: 'assets/icons/util/sun.svg',
        moon: 'assets/icons/util/moon.svg',
        wifi: 'assets/icons/util/wifi.svg',
        bluetooth: 'assets/icons/util/bluetooth.svg',
        volume: 'assets/icons/util/volume.svg',
        keyboard: 'assets/icons/util/keyboard.svg',
        mic: 'assets/icons/util/mic.svg',
        battery: 'assets/icons/util/battery.svg',
        power: 'assets/icons/util/power.svg'
    },

    /** App name → icon path */
    forApp(appName) {
        let key = (appName || '').toLowerCase();
        if (key === 'finder') key = 'filebrow';
        const map = {
            filebrow: this.filebrow,
            safari: this.safari,
            messages: this.messages,
            appstore: this.appstore,
            launchpad: this.launchpad,
            settings: this.settings,
            terminal: this.terminal,
            documents: this.documents,
            brownote: this.brownote,
            codebrow: this.codebrow,
            calculator: this.apps.calculator,
            camera: this.apps.camera,
            music: this.apps.music,
            photos: this.apps.photos,
            files: this.apps.files,
            mail: this.apps.mail,
            starship: this.apps.starship,
            browracer: this.apps.racer
        };
        return map[key] || this.file;
    },

    img(path, alt = '', className = 'os-icon') {
        return `<img src="${path}" class="${className}" alt="${alt}" draggable="false">`;
    },

    control(type, label) {
        const icons = {
            close: this.ui.close,
            minimize: this.ui.minimize,
            maximize: this.ui.maximize
        };
        return `<button type="button" class="window-control ${type}" aria-label="${label}">
            <img class="window-control-icon" src="${icons[type]}" alt="" draggable="false">
        </button>`;
    },

    toolbarBtn(path, label, extraClass = '', attrs = '') {
        return `<button type="button" class="toolbar-icon-btn ${extraClass}" aria-label="${label}" title="${label}" ${attrs}>
            ${this.img(path, '', 'toolbar-icon')}
        </button>`;
    }
};
