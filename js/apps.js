// Apps manager for BrowOS
class AppsManager {
    constructor() {
        this.apps = {
            'filebrow': {
                name: 'FileBrow',
                icon: BrowOSIcons.filebrow,
                windowTitle: 'FileBrow'
            },
            'safari': {
                name: 'Safari',
                icon: BrowOSIcons.safari,
                windowTitle: 'Safari'
            },
            'messages': {
                name: 'Messages',
                icon: BrowOSIcons.messages,
                windowTitle: 'Messages'
            },
            'launchpad': {
                name: 'Apps',
                icon: BrowOSIcons.launchpad,
                windowTitle: 'Apps'
            },
            'settings': {
                name: 'Settings',
                icon: BrowOSIcons.settings,
                windowTitle: 'System Preferences'
            },
            'terminal': {
                name: 'Terminal',
                icon: BrowOSIcons.terminal,
                windowTitle: 'BrowShell Terminal'
            },
            'brownote': {
                name: 'Brow Note',
                icon: BrowOSIcons.brownote,
                windowTitle: 'Brow Note'
            },
            'calculator': {
                name: 'Calculator',
                icon: BrowOSIcons.apps.calculator,
                windowTitle: 'Calculator'
            },
            'camera': {
                name: 'Camera',
                icon: BrowOSIcons.apps.camera,
                windowTitle: 'Camera'
            },
            'music': {
                name: 'Brow Music',
                icon: BrowOSIcons.apps.music,
                windowTitle: 'Brow Music'
            },
            'photos': {
                name: 'Photos',
                icon: BrowOSIcons.apps.photos,
                windowTitle: 'Photos'
            }
        };
    }

    launchApp(appName) {
        const app = this.apps[appName];
        if (!app) {
            console.warn(`App ${appName} not found`);
            return;
        }

        // Check if app is already running
        const existingWindow = this.getExistingWindow(appName);
        if (existingWindow) {
            // Restore window if minimized
            if (existingWindow.isMinimized && window.windowManager.restoreWindow) {
                window.windowManager.restoreWindow(existingWindow.element, existingWindow);
            }
            // Bring existing window to front
            window.windowManager.bringToFront(existingWindow.element);
            return;
        }

        // Special handling for terminal app is done in window.js

        // Create new window for the app
        WindowManager.createWindow(appName, app.windowTitle);
    }

    getExistingWindow(appName) {
        // Check if there's already a window for this app
        if (window.windowManager && window.windowManager.windows) {
            return window.windowManager.windows.find(window => window.appName === appName);
        }
        return null;
    }

    getAppInfo(appName) {
        return this.apps[appName] || null;
    }

    getAllApps() {
        return this.apps;
    }
}

// Initialize apps manager
const appsManager = new AppsManager();
window.appsManager = appsManager;