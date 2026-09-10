/**
 * BrowOS Real-Time Messages Subsystem
 * Powered by Web BroadcastChannel (cross-tab IPC) and persistent LocalStorage.
 * Enables zero-latency messaging between multiple BrowOS windows & browser tabs.
 */
(function(root) {
    'use strict';

    const STORAGE_KEY = 'browos_messages_v2';
    const CHANNEL_NAME = 'browos_messages';

    // Unique per-tab identifier
    const TAB_ID = 'tab_' + Math.random().toString(36).substring(2, 8);

    const DEFAULT_DATA = {
        activeChannel: 'general',
        channels: {
            general: {
                id: 'general',
                name: 'Local Network',
                subtitle: 'Cross-tab broadcast channel',
                avatar: '🌐',
                isSystem: false,
                messages: [
                    {
                        id: 'm_init',
                        sender: 'BrowOS Daemon',
                        text: 'Welcome to Messages! Open BrowOS in another browser tab to chat across tabs in real-time.',
                        time: new Date(Date.now() - 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        isMe: false,
                        tabId: 'system'
                    }
                ]
            },
            bot: {
                id: 'bot',
                name: 'Echo Assistant',
                subtitle: 'Automated conversational bot',
                avatar: '🤖',
                isSystem: false,
                messages: [
                    {
                        id: 'b_init',
                        sender: 'Echo Assistant',
                        text: 'Hello! I am your BrowOS companion. Send me any message to test the chat pipeline.',
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        isMe: false,
                        tabId: 'bot'
                    }
                ]
            },
            system: {
                id: 'system',
                name: 'System Logs',
                subtitle: 'Kernel & process notifications',
                avatar: '⚡',
                isSystem: true,
                messages: [
                    {
                        id: 's_init',
                        sender: 'Kernel',
                        text: 'BrowOS messaging subsystem initialized. BroadcastChannel transport active.',
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        isMe: false,
                        tabId: 'kernel'
                    }
                ]
            }
        }
    };

    class MessagesStore {
        constructor() {
            this.channel = null;
            this.peers = new Set();
            this.listeners = new Set();
            this.initTransport();
            this.data = this.load();
        }

        initTransport() {
            if (typeof BroadcastChannel !== 'undefined') {
                try {
                    this.channel = new BroadcastChannel(CHANNEL_NAME);
                    this.channel.onmessage = (event) => this.handleMessage(event.data);
                    // Announce tab presence
                    this.channel.postMessage({ type: 'presence_ping', tabId: TAB_ID });
                } catch (e) {
                    console.warn('[Messages] BroadcastChannel init error:', e);
                }
            }
        }

        load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.channels && parsed.channels.general) {
                        return parsed;
                    }
                }
            } catch (e) {}
            return JSON.parse(JSON.stringify(DEFAULT_DATA));
        }

        save() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
            } catch (e) {}
        }

        subscribe(fn) {
            this.listeners.add(fn);
            return () => this.listeners.delete(fn);
        }

        notify(event) {
            for (const fn of this.listeners) {
                try { fn(event); } catch (e) { console.error(e); }
            }
        }

        handleMessage(msg) {
            if (!msg || !msg.type) return;

            if (msg.type === 'presence_ping' && msg.tabId !== TAB_ID) {
                this.peers.add(msg.tabId);
                this.channel?.postMessage({ type: 'presence_pong', tabId: TAB_ID });
                this.notify({ type: 'peers_updated', count: this.peers.size + 1 });
            } else if (msg.type === 'presence_pong' && msg.tabId !== TAB_ID) {
                this.peers.add(msg.tabId);
                this.notify({ type: 'peers_updated', count: this.peers.size + 1 });
            } else if (msg.type === 'chat') {
                if (msg.tabId === TAB_ID) return; // Ignore own echoes
                const ch = this.data.channels[msg.channelId];
                if (ch) {
                    const incomingMsg = {
                        id: msg.id,
                        sender: msg.sender,
                        text: msg.text,
                        time: msg.time,
                        isMe: false,
                        tabId: msg.tabId
                    };
                    ch.messages.push(incomingMsg);
                    this.save();
                    this.notify({ type: 'new_message', channelId: msg.channelId, message: incomingMsg });

                    try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
                }
            }
        }

        send(channelId, text) {
            if (!text || !text.trim()) return;
            const cleanText = text.trim();
            const ch = this.data.channels[channelId];
            if (!ch) return;

            const myName = (typeof window !== 'undefined' && window.BrowSettings?.get('username')) || 'You';
            const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const msgObj = {
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                sender: myName,
                text: cleanText,
                time: nowTime,
                isMe: true,
                tabId: TAB_ID
            };

            ch.messages.push(msgObj);
            this.save();
            this.notify({ type: 'new_message', channelId, message: msgObj });

            try { window.BrowSettings?.audio?.play('tick'); } catch (e) {}

            // Broadcast to other open browser tabs
            if (this.channel) {
                this.channel.postMessage({
                    type: 'chat',
                    channelId,
                    id: msgObj.id,
                    sender: myName,
                    text: cleanText,
                    time: nowTime,
                    tabId: TAB_ID
                });
            }

            // Echo bot auto-reply
            if (channelId === 'bot') {
                setTimeout(() => {
                    const botReplies = [
                        `I received your message: "${cleanText}". The cross-tab BroadcastChannel transport is online.`,
                        `Roger that! Your BrowOS messaging engine is functioning with zero-latency cross-tab sync.`,
                        `Interesting point! Did you know you can split BrowOS terminal panes with Ctrl+Alt+O?`,
                        `Echo reply: "${cleanText}". All tabs currently connected are in sync.`
                    ];
                    const replyText = botReplies[Math.floor(Math.random() * botReplies.length)];
                    const botMsg = {
                        id: 'bot_' + Date.now(),
                        sender: 'Echo Assistant',
                        text: replyText,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        isMe: false,
                        tabId: 'bot'
                    };
                    ch.messages.push(botMsg);
                    this.save();
                    this.notify({ type: 'new_message', channelId: 'bot', message: botMsg });
                    try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
                }, 600);
            }
        }
    }

    const store = new MessagesStore();

    const MessagesApp = {
        store,

        getContent() {
            return `
                <div class="messages-app-container">
                    <div class="msg-sidebar">
                        <div class="msg-sidebar-header">
                            <span class="msg-app-title">Messages</span>
                            <div class="msg-tab-badge" title="Live BroadcastChannel status">
                                <span class="msg-status-dot"></span>
                                <span class="msg-tab-count">1 Tab</span>
                            </div>
                        </div>
                        <div class="msg-search-box">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input type="text" class="msg-search-input" placeholder="Search conversations...">
                        </div>
                        <div class="msg-channels-list">
                            <!-- Populated dynamically -->
                        </div>
                    </div>
                    <div class="msg-main-pane">
                        <div class="msg-chat-header">
                            <div class="msg-header-info">
                                <span class="msg-chat-avatar">🌐</span>
                                <div>
                                    <div class="msg-chat-name">Local Network</div>
                                    <div class="msg-chat-sub">Cross-tab broadcast channel</div>
                                </div>
                            </div>
                            <div class="msg-header-actions">
                                <span class="msg-badge-channel">BroadcastChannel</span>
                            </div>
                        </div>
                        <div class="msg-thread-viewport">
                            <div class="msg-thread-list">
                                <!-- Messages injected dynamically -->
                            </div>
                        </div>
                        <div class="msg-composer-area">
                            <div class="msg-input-wrap">
                                <input type="text" class="msg-input-field" placeholder="iMessage (Enter to send)" maxlength="1000">
                                <button class="msg-send-btn" title="Send Message">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="12" y1="19" x2="12" y2="5"></line>
                                        <polyline points="5 12 12 5 19 12"></polyline>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },

        initEvents(windowElement) {
            windowElement.style.width = '780px';
            windowElement.style.height = '520px';

            const sidebar = windowElement.querySelector('.msg-channels-list');
            const threadList = windowElement.querySelector('.msg-thread-list');
            const inputField = windowElement.querySelector('.msg-input-field');
            const sendBtn = windowElement.querySelector('.msg-send-btn');
            const chatName = windowElement.querySelector('.msg-chat-name');
            const chatSub = windowElement.querySelector('.msg-chat-sub');
            const chatAvatar = windowElement.querySelector('.msg-chat-avatar');
            const tabCountEl = windowElement.querySelector('.msg-tab-count');
            const searchInput = windowElement.querySelector('.msg-search-input');

            let currentChannelId = store.data.activeChannel || 'general';
            let filterQuery = '';

            function renderSidebar() {
                if (!sidebar) return;
                sidebar.innerHTML = '';
                const channels = Object.values(store.data.channels).filter(ch => {
                    if (!filterQuery) return true;
                    return ch.name.toLowerCase().includes(filterQuery.toLowerCase()) || ch.subtitle.toLowerCase().includes(filterQuery.toLowerCase());
                });

                channels.forEach(ch => {
                    const item = document.createElement('div');
                    item.className = 'msg-channel-item' + (ch.id === currentChannelId ? ' active' : '');
                    item.dataset.channel = ch.id;

                    const lastMsg = ch.messages[ch.messages.length - 1];
                    const previewText = lastMsg ? (lastMsg.isMe ? 'You: ' + lastMsg.text : lastMsg.text) : 'No messages';
                    const timeText = lastMsg ? lastMsg.time : '';

                    item.innerHTML = `
                        <span class="msg-item-avatar">${ch.avatar}</span>
                        <div class="msg-item-body">
                            <div class="msg-item-row">
                                <span class="msg-item-name">${ch.name}</span>
                                <span class="msg-item-time">${timeText}</span>
                            </div>
                            <div class="msg-item-preview">${escapeHtml(previewText)}</div>
                        </div>
                    `;

                    item.addEventListener('click', () => {
                        currentChannelId = ch.id;
                        store.data.activeChannel = ch.id;
                        store.save();
                        sidebar.querySelectorAll('.msg-channel-item').forEach(el => el.classList.remove('active'));
                        item.classList.add('active');
                        updateHeader();
                        renderThread();
                        inputField?.focus();
                    });

                    sidebar.appendChild(item);
                });
            }

            function updateHeader() {
                const ch = store.data.channels[currentChannelId];
                if (!ch) return;
                if (chatName) chatName.textContent = ch.name;
                if (chatSub) chatSub.textContent = ch.subtitle;
                if (chatAvatar) chatAvatar.textContent = ch.avatar;
            }

            function renderThread() {
                if (!threadList) return;
                const ch = store.data.channels[currentChannelId];
                if (!ch) return;

                threadList.innerHTML = '';
                ch.messages.forEach(m => {
                    const row = document.createElement('div');
                    row.className = 'msg-bubble-row ' + (m.isMe ? 'sent' : 'received');

                    const meta = !m.isMe ? `<div class="msg-sender-meta">${escapeHtml(m.sender)}</div>` : '';
                    row.innerHTML = `
                        ${meta}
                        <div class="msg-bubble">
                            <span class="msg-text">${escapeHtml(m.text)}</span>
                            <span class="msg-stamp">${m.time}</span>
                        </div>
                    `;
                    threadList.appendChild(row);
                });

                const viewport = windowElement.querySelector('.msg-thread-viewport');
                if (viewport) {
                    viewport.scrollTop = viewport.scrollHeight;
                }
            }

            function doSend() {
                if (!inputField) return;
                const text = inputField.value;
                if (!text || !text.trim()) return;
                store.send(currentChannelId, text);
                inputField.value = '';
                renderSidebar();
                renderThread();
            }

            if (sendBtn) sendBtn.addEventListener('click', doSend);
            if (inputField) {
                inputField.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        doSend();
                    }
                });
            }

            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    filterQuery = e.target.value.trim();
                    renderSidebar();
                });
            }

            function escapeHtml(str) {
                if (!str) return '';
                return str.replace(/[&<>'"]/g, tag => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    "'": '&#39;',
                    '"': '&quot;'
                }[tag] || tag));
            }

            const unsubscribe = store.subscribe((evt) => {
                if (evt.type === 'peers_updated') {
                    if (tabCountEl) {
                        tabCountEl.textContent = evt.count + ' Tab' + (evt.count > 1 ? 's' : '');
                    }
                } else if (evt.type === 'new_message') {
                    renderSidebar();
                    if (evt.channelId === currentChannelId) {
                        renderThread();
                    }
                }
            });

            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.type === 'attributes' && m.attributeName === 'class') {
                        if (windowElement.classList.contains('window-closing') || !document.body.contains(windowElement)) {
                            unsubscribe();
                            observer.disconnect();
                        }
                    }
                }
            });
            observer.observe(windowElement, { attributes: true });

            updateHeader();
            renderSidebar();
            renderThread();
            setTimeout(() => inputField?.focus(), 100);
        }
    };

    root.BrowAppMessages = MessagesApp;
    if (root.AppRegistry) {
        root.AppRegistry.register('messages', MessagesApp);
    }
})(typeof window !== 'undefined' ? window : this);
