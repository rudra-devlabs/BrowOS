// ============================================================================
// BrowMacOS — init / bootstrapping.
//
// Loaded last among the macos modules. Waits until the DOM is ready (and
// guardedly until the main window manager exists) then calls `BrowMacOS.init()`
// once. All feature modules register themselves with BrowMacOS.register() in
// their own files and are constructed here in a single, ordered pass.
// ============================================================================
(function () {
    'use strict';

    function boot() {
        // The window manager is set at the bottom of window.js, which loads
        // before these scripts. Wait a tick for any DOM work to settle.
        if (window.BrowMacOS) {
            window.BrowMacOS.init();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
