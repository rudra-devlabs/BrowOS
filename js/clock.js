// Shared Clock popover and Clock app controller.
(function () {
    'use strict';

    const state = {
        initialized: false,
        popover: null,
        mode: 'overview',
        calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        alarm: null,
        alarmAlertKey: null,
        stopwatch: { elapsed: 0, startedAt: 0, running: false },
        timer: { remaining: 0, endAt: 0, running: false, alerted: false },
        roots: new Set()
    };

    const pad = (value) => String(value).padStart(2, '0');
    const tabIndex = (mode) => Math.max(0, ['overview', 'alarm', 'stopwatch', 'timer'].indexOf(mode));
    const clockTime = (withSeconds = true) => {
        const now = new Date();
        return `${pad(now.getHours())}:${pad(now.getMinutes())}${withSeconds ? `:${pad(now.getSeconds())}` : ''}`;
    };
    const dateLabel = (date = new Date()) => date.toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    const shortDateLabel = (date = new Date()) => date.toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric'
    });
    const formatDuration = (seconds) => {
        const whole = Math.max(0, Math.floor(seconds));
        return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
    };

    function currentStopwatchSeconds() {
        if (!state.stopwatch.running) return state.stopwatch.elapsed;
        return state.stopwatch.elapsed + (Date.now() - state.stopwatch.startedAt) / 1000;
    }

    function currentTimerSeconds() {
        if (!state.timer.running) return state.timer.remaining;
        return Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
    }

    function calendarMarkup() {
        const year = state.calendarCursor.getFullYear();
        const month = state.calendarCursor.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const monthLabel = state.calendarCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const cells = [];

        for (let i = 0; i < firstDay; i++) cells.push('<span class="clock-calendar-day is-empty"></span>');
        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            cells.push(`<span class="clock-calendar-day${isToday ? ' is-today' : ''}">${day}</span>`);
        }

        return `
            <div class="clock-calendar-head">
                <button class="clock-icon-btn" data-clock-action="prev-month" aria-label="Previous month">‹</button>
                <strong>${monthLabel}</strong>
                <button class="clock-icon-btn" data-clock-action="next-month" aria-label="Next month">›</button>
            </div>
            <div class="clock-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
            <div class="clock-calendar-grid">${cells.join('')}</div>
            <button class="clock-text-btn" data-clock-action="today">Jump to today</button>
        `;
    }

    function tabsMarkup() {
        const tabs = [
            ['overview', 'Today'], ['alarm', 'Alarm'], ['stopwatch', 'Stopwatch'], ['timer', 'Timer']
        ];
        const activeIndex = tabIndex(state.mode);
        return `<div class="clock-tabs" style="--clock-tab-index:${activeIndex}" role="tablist">${tabs.map(([key, label]) =>
            `<button class="clock-tab${state.mode === key ? ' is-active' : ''}" data-clock-action="mode" data-clock-mode="${key}" role="tab" aria-selected="${state.mode === key}">${label}</button>`
        ).join('')}</div>`;
    }

    function modeMarkup() {
        if (state.mode === 'alarm') {
            const alarm = state.alarm;
            return `
                <div class="clock-mode-heading"><span class="clock-mode-eyebrow">Wake up gently</span><h3>Alarm</h3></div>
                <div class="clock-form-row">
                    <label for="clock-alarm-time">Time</label>
                    <input id="clock-alarm-time" data-clock-alarm-time type="time" value="${alarm?.time || '07:30'}">
                </div>
                <div class="clock-form-row">
                    <label for="clock-alarm-label">Label</label>
                    <input id="clock-alarm-label" data-clock-alarm-label type="text" maxlength="28" placeholder="Morning alarm" value="${alarm?.label || ''}">
                </div>
                <div class="clock-action-row">
                    <button class="clock-primary-btn" data-clock-action="set-alarm">${alarm ? 'Update alarm' : 'Set alarm'}</button>
                    ${alarm ? '<button class="clock-secondary-btn" data-clock-action="clear-alarm">Clear</button>' : ''}
                </div>
                <div class="clock-status-line">${alarm ? `Next alarm at <strong>${alarm.time}</strong>${alarm.label ? ` · ${alarm.label}` : ''}` : 'No alarm is scheduled.'}</div>
            `;
        }

        if (state.mode === 'stopwatch') {
            const running = state.stopwatch.running;
            return `
                <div class="clock-mode-heading"><span class="clock-mode-eyebrow">Precision timing</span><h3>Stopwatch</h3></div>
                <div class="clock-large-readout" data-clock-stopwatch-display>${formatDuration(currentStopwatchSeconds())}</div>
                <div class="clock-action-row">
                    <button class="clock-primary-btn" data-clock-action="stopwatch-toggle">${running ? 'Pause' : 'Start'}</button>
                    <button class="clock-secondary-btn" data-clock-action="stopwatch-reset">Reset</button>
                </div>
            `;
        }

        if (state.mode === 'timer') {
            const running = state.timer.running;
            return `
                <div class="clock-mode-heading"><span class="clock-mode-eyebrow">A focused interval</span><h3>Timer</h3></div>
                <div class="clock-large-readout" data-clock-timer-display>${formatDuration(currentTimerSeconds())}</div>
                <div class="clock-duration-inputs">
                    <label>Minutes<input data-clock-timer-min type="number" min="0" max="999" value="${Math.floor((state.timer.remaining || 300) / 60)}"></label>
                    <label>Seconds<input data-clock-timer-sec type="number" min="0" max="59" value="${(state.timer.remaining || 300) % 60}"></label>
                </div>
                <div class="clock-action-row">
                    <button class="clock-primary-btn" data-clock-action="timer-toggle">${running ? 'Pause' : 'Start'}</button>
                    <button class="clock-secondary-btn" data-clock-action="timer-reset">Reset</button>
                </div>
            `;
        }

        return `
            <div class="clock-mode-heading"><span class="clock-mode-eyebrow">Local time</span><h3>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}</h3></div>
            <div class="clock-overview-grid">
                <button class="clock-overview-action" data-clock-action="mode" data-clock-mode="alarm"><span class="clock-action-mark">A</span><span><strong>${state.alarm ? state.alarm.time : 'Set an alarm'}</strong><small>${state.alarm ? (state.alarm.label || 'Alarm scheduled') : 'Plan your next wake-up'}</small></span></button>
                <button class="clock-overview-action" data-clock-action="mode" data-clock-mode="stopwatch"><span class="clock-action-mark">S</span><span><strong>Stopwatch</strong><small>Track elapsed time</small></span></button>
                <button class="clock-overview-action" data-clock-action="mode" data-clock-mode="timer"><span class="clock-action-mark">T</span><span><strong>${state.timer.remaining ? formatDuration(currentTimerSeconds()) : 'Timer'}</strong><small>${state.timer.running ? 'Running now' : 'Set a focused interval'}</small></span></button>
            </div>
            <div class="clock-status-line">Your device time zone · ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'}</div>
        `;
    }

    function surfaceMarkup(isApp) {
        return `
            <div class="clock-surface ${isApp ? 'clock-app-surface' : 'clock-popover-surface'}">
                <header class="clock-surface-header">
                    <div><span class="clock-surface-kicker">${isApp ? 'BrowOS Clock' : 'Today'}</span><strong data-clock-live-date>${dateLabel()}</strong></div>
                    <time class="clock-surface-time" data-clock-live-time>${clockTime()}</time>
                </header>
                <div class="clock-surface-grid">
                    <section class="clock-calendar-panel" aria-label="Calendar">${calendarMarkup()}</section>
                    <section class="clock-tools-panel">${tabsMarkup()}<div class="clock-mode-content">${modeMarkup()}</div></section>
                </div>
                ${isApp ? '<div class="clock-app-footer">Clock follows your system time and stays ready in the menu bar.</div>' : '<button class="clock-open-app" data-clock-action="open-app">Open Clock app <span>↗</span></button>'}
            </div>
        `;
    }

    function renderRoot(root, isApp) {
        root.innerHTML = surfaceMarkup(isApp);
        root.dataset.clockReady = 'true';
    }

    function renderAll(previousTabIndex = null) {
        if (state.popover) {
            const panel = state.popover;
            const oldHeight = panel.offsetHeight;
            renderRoot(panel, false);
            const newHeight = panel.scrollHeight;
            if (oldHeight && newHeight && oldHeight !== newHeight) {
                panel.classList.add('is-resizing');
                panel.style.height = `${oldHeight}px`;
                void panel.offsetHeight;
                requestAnimationFrame(() => {
                    panel.style.height = `${newHeight}px`;
                });
                clearTimeout(panel._resizeTimer);
                panel._resizeTimer = setTimeout(() => {
                    panel.style.height = '';
                    panel.classList.remove('is-resizing');
                }, 300);
            }
        }
        state.roots.forEach((root) => renderRoot(root, true));
        if (previousTabIndex !== null && previousTabIndex !== tabIndex(state.mode)) {
            const nextIndex = tabIndex(state.mode);
            document.querySelectorAll('.clock-tabs').forEach((tabs) => {
                tabs.style.setProperty('--clock-tab-index', previousTabIndex);
                // Commit the old indicator position before moving it. Without
                // this layout read, both states can be coalesced into one paint.
                void tabs.offsetWidth;
                requestAnimationFrame(() => tabs.style.setProperty('--clock-tab-index', nextIndex));
            });
        }
        updateLive();
    }

    function updateSurfaceMode(root) {
        const tabs = root?.querySelector('.clock-tabs');
        if (tabs) {
            tabs.style.setProperty('--clock-tab-index', tabIndex(state.mode));
            tabs.querySelectorAll('.clock-tab').forEach((tab) => {
                const active = tab.dataset.clockMode === state.mode;
                tab.classList.toggle('is-active', active);
                tab.setAttribute('aria-selected', String(active));
            });
        }
        const content = root?.querySelector('.clock-mode-content');
        if (content) content.innerHTML = modeMarkup();
    }

    function animatePopoverResize(update) {
        if (!state.popover) {
            update();
            return;
        }
        const panel = state.popover;
        const oldHeight = panel.offsetHeight;
        update();
        const newHeight = panel.scrollHeight;
        if (!oldHeight || !newHeight || oldHeight === newHeight) return;
        panel.classList.add('is-resizing');
        panel.style.height = `${oldHeight}px`;
        void panel.offsetHeight;
        requestAnimationFrame(() => { panel.style.height = `${newHeight}px`; });
        clearTimeout(panel._resizeTimer);
        panel._resizeTimer = setTimeout(() => {
            panel.style.height = '';
            panel.classList.remove('is-resizing');
        }, 300);
    }

    function switchMode(nextMode) {
        if (!['overview', 'alarm', 'stopwatch', 'timer'].includes(nextMode) || nextMode === state.mode) return;
        state.mode = nextMode;
        animatePopoverResize(() => {
            if (state.popover) updateSurfaceMode(state.popover);
            state.roots.forEach(updateSurfaceMode);
        });
        updateLive();
    }

    function updateLive() {
        const now = new Date();
        document.querySelectorAll('[data-clock-live-time]').forEach((el) => { el.textContent = clockTime(); });
        document.querySelectorAll('[data-clock-live-date]').forEach((el) => { el.textContent = dateLabel(now); });
        const top = document.getElementById('clock');
        if (top) top.textContent = clockTime(false);
        document.querySelectorAll('[data-clock-stopwatch-display]').forEach((el) => { el.textContent = formatDuration(currentStopwatchSeconds()); });
        document.querySelectorAll('[data-clock-timer-display]').forEach((el) => { el.textContent = formatDuration(currentTimerSeconds()); });

        if (state.timer.running && currentTimerSeconds() <= 0) {
            state.timer.running = false;
            state.timer.remaining = 0;
            if (!state.timer.alerted) {
                state.timer.alerted = true;
                notify('Timer finished', 'Your timer has completed.');
            }
        }
        checkAlarm(now);
    }

    function notify(title, message) {
        if (window.BrowDialog?.alert) window.BrowDialog.alert(title, message);
        else if (typeof window.alert === 'function') window.alert(`${title}\n\n${message}`);
    }

    function checkAlarm(now) {
        if (!state.alarm) return;
        const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${state.alarm.time}`;
        const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        if (hhmm === state.alarm.time && state.alarmAlertKey !== key) {
            state.alarmAlertKey = key;
            notify('Alarm', state.alarm.label || `Alarm for ${state.alarm.time}`);
        }
    }

    function inputFrom(target, selector) {
        const scope = target.closest('.clock-surface') || document;
        return scope.querySelector(selector);
    }

    function handleAction(event) {
        const button = event.target.closest('[data-clock-action]');
        if (!button) return;
        event.preventDefault();
        const action = button.dataset.clockAction;

        if (action === 'open-app') {
            closePopover();
            window.windowManager?.launchApp('clock');
        } else if (action === 'mode') {
            switchMode(button.dataset.clockMode || 'overview');
        } else if (action === 'prev-month' || action === 'next-month') {
            state.calendarCursor.setMonth(state.calendarCursor.getMonth() + (action === 'next-month' ? 1 : -1));
            renderAll();
        } else if (action === 'today') {
            const now = new Date();
            state.calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
            renderAll();
        } else if (action === 'set-alarm') {
            const time = inputFrom(button, '[data-clock-alarm-time]')?.value;
            if (!time) return;
            state.alarm = { time, label: inputFrom(button, '[data-clock-alarm-label]')?.value.trim() || '' };
            state.alarmAlertKey = null;
            renderAll();
        } else if (action === 'clear-alarm') {
            state.alarm = null;
            state.alarmAlertKey = null;
            renderAll();
        } else if (action === 'stopwatch-toggle') {
            if (state.stopwatch.running) {
                state.stopwatch.elapsed = currentStopwatchSeconds();
                state.stopwatch.running = false;
            } else {
                state.stopwatch.startedAt = Date.now();
                state.stopwatch.running = true;
            }
            renderAll();
        } else if (action === 'stopwatch-reset') {
            state.stopwatch = { elapsed: 0, startedAt: 0, running: false };
            renderAll();
        } else if (action === 'timer-toggle') {
            if (state.timer.running) {
                state.timer.remaining = currentTimerSeconds();
                state.timer.running = false;
            } else {
                if (!state.timer.remaining) {
                    const minutes = Number(inputFrom(button, '[data-clock-timer-min]')?.value) || 0;
                    const seconds = Math.min(59, Number(inputFrom(button, '[data-clock-timer-sec]')?.value) || 0);
                    state.timer.remaining = Math.max(0, minutes * 60 + seconds);
                }
                if (state.timer.remaining > 0) {
                    state.timer.endAt = Date.now() + state.timer.remaining * 1000;
                    state.timer.running = true;
                    state.timer.alerted = false;
                }
            }
            renderAll();
        } else if (action === 'timer-reset') {
            state.timer = { remaining: 0, endAt: 0, running: false, alerted: false };
            renderAll();
        }
    }

    function closePopover() {
        if (!state.popover) return;
        state.popover.remove();
        state.popover = null;
        document.getElementById('clock')?.setAttribute('aria-expanded', 'false');
    }

    function togglePopover() {
        if (state.popover) {
            closePopover();
            return;
        }
        const panel = document.createElement('div');
        panel.className = 'clock-popover';
        panel.addEventListener('click', handleAction);
        document.body.appendChild(panel);
        state.popover = panel;
        renderRoot(panel, false);
        document.getElementById('clock')?.setAttribute('aria-expanded', 'true');
    }

    function init() {
        if (state.initialized) return;
        state.initialized = true;
        const top = document.getElementById('clock');
        if (top) {
            top.classList.add('clock-trigger');
            top.setAttribute('role', 'button');
            top.setAttribute('tabindex', '0');
            top.setAttribute('aria-label', 'Open calendar and clock');
            top.setAttribute('aria-expanded', 'false');
            top.addEventListener('click', (event) => { event.stopPropagation(); togglePopover(); });
            top.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePopover(); }
            });
        }
        document.addEventListener('click', (event) => {
            if (!state.popover) return;
            // Controls re-render the popover during their click handler. Use
            // the original propagation path so a detached button still counts
            // as an inside click when the document listener runs afterward.
            const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
            const clickedInside = path.includes(state.popover) || state.popover.contains(event.target);
            if (!clickedInside && event.target !== top) closePopover();
        });
        setInterval(updateLive, 1000);
        updateLive();
    }

    function mountApp(windowElement) {
        const host = windowElement?.querySelector('.clock-app-host');
        if (!host || host.dataset.clockMounted === 'true') return;
        init();
        host.dataset.clockMounted = 'true';
        state.roots.add(host);
        host.addEventListener('click', handleAction);
        renderRoot(host, true);
        const observer = new MutationObserver(() => {
            if (!document.body.contains(windowElement)) {
                state.roots.delete(host);
                observer.disconnect();
            }
        });
        observer.observe(windowElement, { attributes: true, attributeFilter: ['class'] });
    }

    window.BrowClock = { init, mountApp };
})();
