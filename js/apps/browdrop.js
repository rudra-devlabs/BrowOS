/**
 * BrowDrop v2: Multi-User Peer-to-Peer & Offline LAN Room Hub
 * Password-protected rooms, multi-member swarm, shared room files repository, and collaborative live desktop.
 */
(function(window) {
    'use strict';

    const PEERJS_LOCAL = 'js/apps/peerjs.min.js';
    const PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    const CHUNK_SIZE = 64 * 1024; // 64KB chunk size

    const AVATAR_COLORS = [
        '#0a84ff', '#af52de', '#30d158', '#ff9f0a', '#ff375f', '#5ac8fa', '#ffd60a'
    ];

    function detectDeviceType() {
        const ua = navigator.userAgent;
        if (/iPad|iPhone|iPod/.test(ua)) return 'iPhone';
        if (/Macintosh/.test(ua)) return 'Mac';
        if (/Android/.test(ua)) return 'Android';
        if (/Windows/.test(ua)) return 'PC';
        if (/Linux/.test(ua)) return 'Linux';
        return 'Device';
    }

    function generateRoomCode() {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return 'ROOM-' + code;
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Pure JavaScript SHA-256 implementation: 100% deterministic on all browsers & insecure HTTP LAN contexts
    function sha256(ascii) {
        function rightRotate(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        }
        var mathPow = Math.pow;
        var maxWord = mathPow(2, 32);
        var lengthProperty = 'length';
        var i, j;
        var result = '';
        var words = [];
        var asciiBitLength = ascii[lengthProperty] * 8;
        var hash = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ];
        var k = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        var primeCounter = k[lengthProperty];
        var isComposite = {};
        for (var candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (i = 0; i < 313; i += candidate) {
                    isComposite[i] = candidate;
                }
                hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
                k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
            }
        }
        ascii += '\x80';
        while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
        for (i = 0; i < ascii[lengthProperty]; i++) {
            j = ascii.charCodeAt(i);
            if (j >> 8) return;
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }
        words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
        words[words[lengthProperty]] = (asciiBitLength);
        for (j = 0; j < words[lengthProperty];) {
            var w = words.slice(j, j += 16);
            var oldHash = hash;
            hash = hash.slice(0, 8);
            for (i = 0; i < 64; i++) {
                var i2 = i + j;
                var w15 = w[i - 15], w2 = w[i - 2];
                var a = hash[0], e = hash[4];
                var temp1 = hash[7]
                    + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                    + ((e & hash[5]) ^ ((~e) & hash[6]))
                    + k[i]
                    + (w[i] = (i < 16) ? w[i] : (
                            w[i - 16]
                            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                            + w[i - 7]
                            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                        ) | 0
                    );
                var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                    + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
            }
            for (i = 0; i < 8; i++) {
                hash[i] = (hash[i] + oldHash[i]) | 0;
            }
        }
        for (i = 0; i < 8; i++) {
            for (j = 3; j + 1; j--) {
                var b = (hash[i] >> (j * 8)) & 255;
                result += ((b < 16) ? 0 : '') + b.toString(16);
            }
        }
        return result;
    }

    function hashPassword(str) {
        if (!str) return '';
        return sha256(str + '_browdrop_salt_v2');
    }

    class BrowDropManager {
        constructor() {
            this.state = 'lobby'; // 'lobby' | 'room'
            this.lobbyTab = 'create';
            this.mobileRoomTab = 'files'; // 'create' | 'join'

            this.roomName = '';
            this.roomCode = '';
            this.roomPassword = '';
            this.passwordHash = '';
            this.isHost = false;

            this.deviceType = detectDeviceType();
            this.deviceName = localStorage.getItem('browos_device_name') || (this.deviceType + ' (' + Math.floor(100 + Math.random() * 900) + ')');
            this.myColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
            this.myId = 'bd_' + Math.random().toString(36).substring(2, 9);

            // Peer network & LAN channels
            this.peer = null;
            this.connections = new Map(); // peerId -> DataConnection
            this.members = new Map();     // peerId -> { id, name, device, color, isHost }
            this.broadcastChannel = null; // LAN & local broadcast channel
            this.lanEventSource = null;   // Server-Sent Events stream from local Node server
            this.lanServerActive = false;
            this.heartbeatTimer = null;

            // Shared Room Files Hub
            this.roomFiles = new Map();     // fileId -> { id, name, size, mime, senderName, senderId, timestamp }
            this.localFileBlobs = new Map(); // fileId -> Blob/File (files uploaded by this client)
            this.incomingTransfers = new Map(); // fileId -> { chunks, receivedCount, totalChunks, meta }

            // Multiplayer cursors
            this.multiplayerActive = true;
            this.remoteCursorElements = new Map();

            this.activeContainer = null;
            this.statusMessage = null; // { type: 'error' | 'loading', text: '' }

            this.initGlobalListeners();
            this.checkUrlForRoom();
        }

        checkUrlForRoom() {
            try {
                const match = window.location.hash.match(/#(?:browdrop|room)=([A-Za-z0-9_-]+)/);
                if (match && match[1]) {
                    this.lobbyTab = 'join';
                    this.prefilledRoomCode = match[1].toUpperCase();
                }
            } catch (e) {}
        }

        initGlobalListeners() {
            // Completely disable cursor tracking on touch / mobile devices to prevent GPU, CPU, and network bottlenecks
            const isTouchDevice = ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
                                  !window.matchMedia('(pointer: fine)').matches;
            if (isTouchDevice) return;

            let lastSend = 0;
            window.addEventListener('mousemove', (e) => {
                if (this.state !== 'room' || !this.multiplayerActive) return;
                const now = performance.now();
                if (now - lastSend < 80) return; // 12 FPS cursor updates are plenty on desktop
                lastSend = now;

                const x = e.clientX / window.innerWidth;
                const y = e.clientY / window.innerHeight;

                this.broadcast({
                    type: 'cursor-move',
                    x,
                    y,
                    name: this.deviceName,
                    device: this.deviceType,
                    color: this.myColor,
                    senderId: this.myId
                });
            }, { passive: true });

            window.addEventListener('click', (e) => {
                if (this.state !== 'room' || !this.multiplayerActive) return;
                if (e.target.closest && e.target.closest('.browdrop-app-container')) return;

                const x = e.clientX / window.innerWidth;
                const y = e.clientY / window.innerHeight;

                this.broadcast({
                    type: 'cursor-click',
                    x,
                    y,
                    color: this.myColor
                });
            });
        }

        async ensurePeerJS() {
            if (typeof window.Peer !== 'undefined') return true;
            return new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = PEERJS_LOCAL;
                script.onload = () => resolve(true);
                script.onerror = () => {
                    // Fallback to CDN if local bundle fails
                    const cdnScript = document.createElement('script');
                    cdnScript.src = PEERJS_CDN;
                    cdnScript.onload = () => resolve(true);
                    cdnScript.onerror = () => {
                        console.warn('[BrowDrop] PeerJS unavailable, running LAN server / broadcast mode.');
                        resolve(false);
                    };
                    document.head.appendChild(cdnScript);
                };
                document.head.appendChild(script);
            });
        }

        async ensureQRCode() {
            if (typeof window.QRCode !== 'undefined') return true;
            return new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'js/apps/qrcode.min.js';
                script.onload = () => resolve(true);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });
        }

        /* ─── Room Creation & Joining ────────────────────────────────────────── */

        async createRoom(name, code, password, displayName) {
            if (!password || password.trim().length === 0) {
                this.setStatus('error', 'Password is required to create a protected room.');
                return;
            }

            this.roomName = name.trim() || 'General Room';
            this.roomCode = (code.trim() || generateRoomCode()).toUpperCase();
            this.roomPassword = password;
            this.passwordHash = hashPassword(password);
            this.isHost = true;
            this.deviceName = displayName.trim() || this.deviceName;
            localStorage.setItem('browos_device_name', this.deviceName);

            this.setStatus('loading', 'Initializing secure room...');
            this.state = 'room';
            await this.initRoomNetworking();
            this.clearStatus();
            this.render();
            try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
        }

        async joinRoom(code, password, displayName) {
            if (!code || code.trim().length === 0) {
                this.setStatus('error', 'Please enter a valid Room Code.');
                return;
            }
            if (!password || password.trim().length === 0) {
                this.setStatus('error', 'Password is required to enter this room.');
                return;
            }

            this.roomCode = code.trim().toUpperCase();
            this.roomName = 'Room ' + this.roomCode;
            this.roomPassword = password;
            this.passwordHash = hashPassword(password);
            this.isHost = false;
            this.deviceName = displayName.trim() || this.deviceName;
            localStorage.setItem('browos_device_name', this.deviceName);

            this.setStatus('loading', 'Authenticating and connecting to room...');
            this.state = 'room';
            await this.initRoomNetworking();
            this.clearStatus();
            this.render();
            try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
        }

        leaveRoom() {
            if (this.lanEventSource) {
                try { this.lanEventSource.close(); } catch (e) {}
                this.lanEventSource = null;
            }
            if (this.peer) {
                try { this.peer.destroy(); } catch (e) {}
                this.peer = null;
            }
            if (this.broadcastChannel) {
                try { this.broadcastChannel.close(); } catch (e) {}
                this.broadcastChannel = null;
            }
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }

            this.connections.clear();
            this.members.clear();
            this.roomFiles.clear();
            this.localFileBlobs.clear();
            this.remoteCursorElements.forEach(el => el.remove());
            this.remoteCursorElements.clear();

            this.state = 'lobby';
            this.isHost = false;
            this.lanServerActive = false;
            this.updateStatusBarIcon();
            this.render();
        }

        setStatus(type, text) {
            this.statusMessage = { type, text };
            const banner = this.activeContainer?.querySelector('#bd-status-banner');
            if (banner) {
                banner.className = 'browdrop-status-banner ' + type;
                banner.textContent = text;
                banner.style.display = 'flex';
            }
        }

        clearStatus() {
            this.statusMessage = null;
            const banner = this.activeContainer?.querySelector('#bd-status-banner');
            if (banner) banner.style.display = 'none';
        }

        /* ─── Multi-Tier Networking: LAN Server SSE + WebRTC PeerJS Mesh + Broadcast ──────────────────────── */

        async initRoomNetworking() {
            // Add self to room members
            this.members.set(this.myId, {
                id: this.myId,
                name: this.deviceName,
                device: this.deviceType,
                color: this.myColor,
                isHost: this.isHost
            });

            // 1. Setup LAN Server SSE stream (Works across any phone/PC on local network or Wi-Fi)
            this.setupLanServerSse();

            // 2. Setup Local Tab BroadcastChannel (Works 100% offline across tabs & local windows)
            this.setupBroadcastChannel();

            // 3. Setup WebRTC PeerJS Mesh (Works across internet and static hosts with STUN)
            await this.setupPeerJS();

            // 4. Start periodic presence heartbeat
            if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = setInterval(() => {
                if (this.state === 'room') {
                    this.broadcast({
                        type: 'heartbeat',
                        senderId: this.myId,
                        passwordHash: this.passwordHash,
                        name: this.deviceName,
                        device: this.deviceType,
                        color: this.myColor,
                        isHost: this.isHost
                    });
                }
            }, 4000);
        }

        setupLanServerSse() {
            try {
                const sseUrl = '/api/browdrop/rooms/' + encodeURIComponent(this.roomCode) + '/events?peerId=' + encodeURIComponent(this.myId)
                    + '&name=' + encodeURIComponent(this.deviceName)
                    + '&device=' + encodeURIComponent(this.deviceType)
                    + '&color=' + encodeURIComponent(this.myColor)
                    + '&isHost=' + (this.isHost ? 'true' : 'false')
                    + '&hash=' + encodeURIComponent(this.passwordHash);

                if (this.lanEventSource) {
                    try { this.lanEventSource.close(); } catch (e) {}
                }

                this.lanEventSource = new EventSource(sseUrl);
                this.lanEventSource.onopen = () => {
                    this.lanServerActive = true;
                };

                this.lanEventSource.onmessage = (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        this.handleIncomingMessage(data.senderId || 'lan_server', data);
                    } catch (err) {}
                };

                this.lanEventSource.onerror = () => {
                    this.lanServerActive = false;
                };
            } catch (e) {
                this.lanServerActive = false;
            }
        }

        setupBroadcastChannel() {
            try {
                if (typeof window.BroadcastChannel !== 'undefined') {
                    if (this.broadcastChannel) this.broadcastChannel.close();
                    this.broadcastChannel = new window.BroadcastChannel('browdrop_room_' + this.roomCode);
                    this.broadcastChannel.onmessage = (e) => {
                        if (e.data && e.data.senderId !== this.myId) {
                            this.handleIncomingMessage(e.data.senderId, e.data);
                        }
                    };

                    this.broadcastLan({
                        type: 'lan-hello',
                        senderId: this.myId,
                        passwordHash: this.passwordHash,
                        name: this.deviceName,
                        device: this.deviceType,
                        color: this.myColor,
                        isHost: this.isHost
                    });
                }
            } catch (e) {
                console.warn('[BrowDrop] BroadcastChannel note:', e);
            }
        }

        async setupPeerJS() {
            await this.ensurePeerJS();
            if (typeof window.Peer === 'undefined') return;

            const sanitizedCode = this.roomCode.toLowerCase().replace(/[^a-z0-9]/g, '');
            const prefix = 'browos-rm-' + sanitizedCode;
            const hostId = prefix + '-host';
            const desiredId = this.isHost ? hostId : (prefix + '-p-' + this.myId);

            const tryCreate = (idToUse, isPrimaryHost) => {
                try {
                    const peer = new window.Peer(idToUse, {
                        debug: 0,
                        config: {
                            iceServers: [
                                { urls: 'stun:stun.l.google.com:19302' },
                                { urls: 'stun:stun1.l.google.com:19302' },
                                { urls: 'stun:stun2.l.google.com:19302' }
                            ]
                        }
                    });

                    peer.on('open', () => {
                        this.peer = peer;
                        this.updateStatusBarIcon();

                        if (!isPrimaryHost) {
                            this.connectToPeer(hostId);
                        }
                        ['node0', 'node1'].forEach(slot => {
                            const target = prefix + '-' + slot;
                            if (target !== peer.id) this.connectToPeer(target);
                        });
                    });

                    peer.on('connection', (conn) => {
                        this.setupPeerConnection(conn);
                    });

                    peer.on('error', (err) => {
                        if (err.type === 'unavailable-id' && isPrimaryHost) {
                            const fallbackId = prefix + '-node' + Math.floor(Math.random() * 9);
                            tryCreate(fallbackId, false);
                        }
                    });
                } catch (e) {}
            };

            tryCreate(desiredId, this.isHost);
        }

        connectToPeer(targetPeerId) {
            if (!this.peer || this.peer.destroyed || targetPeerId === this.peer.id || this.connections.has(targetPeerId)) {
                return;
            }
            try {
                const conn = this.peer.connect(targetPeerId, { reliable: true });
                this.setupPeerConnection(conn);
            } catch (e) {}
        }

        setupPeerConnection(conn) {
            conn.on('open', () => {
                this.connections.set(conn.peer, conn);
                conn.send({
                    type: 'auth-handshake',
                    senderId: this.myId,
                    peerId: this.peer?.id,
                    passwordHash: this.passwordHash,
                    name: this.deviceName,
                    device: this.deviceType,
                    color: this.myColor,
                    isHost: this.isHost,
                    catalog: Array.from(this.roomFiles.values())
                });
            });

            conn.on('data', (data) => {
                this.handleIncomingMessage(conn.peer, data, conn);
            });

            conn.on('close', () => {
                this.cleanupMember(conn.peer);
            });

            conn.on('error', () => {
                this.cleanupMember(conn.peer);
            });
        }

        cleanupMember(peerId) {
            this.connections.delete(peerId);
            this.members.delete(peerId);
            if (this.remoteCursorElements.has(peerId)) {
                const el = this.remoteCursorElements.get(peerId);
                if (el && el.parentNode) el.parentNode.removeChild(el);
                this.remoteCursorElements.delete(peerId);
            }
            this.updateStatusBarIcon();
            this.updateUi();
        }

        broadcast(payload) {
            payload.senderId = this.myId;

            const isCursor = payload.type === 'cursor-move' || payload.type === 'cursor-click';

            // 1. Send via LAN server SSE hub (ONLY non-cursor messages! Never flood HTTP fetch)
            if (this.lanServerActive && !isCursor) {
                fetch('/api/browdrop/rooms/' + encodeURIComponent(this.roomCode) + '/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(() => {});
            }

            // 2. Send via WebRTC connections
            for (const conn of this.connections.values()) {
                if (conn.open) {
                    try { conn.send(payload); } catch (e) {}
                }
            }

            // 3. Send via BroadcastChannel
            this.broadcastLan(payload);
        }

        broadcastLan(payload) {
            if (this.broadcastChannel) {
                try { this.broadcastChannel.postMessage(payload); } catch (e) {}
            }
        }

        sendTo(targetPeerId, payload) {
            payload.senderId = this.myId;
            payload.targetId = targetPeerId;

            // 1. Direct WebRTC
            if (this.connections.has(targetPeerId)) {
                const conn = this.connections.get(targetPeerId);
                if (conn.open) {
                    try { conn.send(payload); return; } catch (e) {}
                }
            }

            // 2. LAN Server
            if (this.lanServerActive) {
                fetch('/api/browdrop/rooms/' + encodeURIComponent(this.roomCode) + '/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(() => {});
                return;
            }

            // 3. BroadcastChannel
            this.broadcastLan(payload);
        }

        /* ─── Message Handling & Swarm Roster ──────────────────────────────── */

        handleIncomingMessage(senderId, msg, conn) {
            if (!msg || typeof msg !== 'object') return;
            if (msg.targetId && msg.targetId !== this.myId) return;

            switch (msg.type) {
                case 'room-roster':
                    if (Array.isArray(msg.peers)) {
                        msg.peers.forEach(p => {
                            if (p.id !== this.myId) {
                                this.members.set(p.id, {
                                    id: p.id,
                                    name: p.name || 'Room Member',
                                    device: p.device || 'Device',
                                    color: p.color || '#0a84ff',
                                    isHost: !!p.isHost
                                });
                            }
                        });
                    }
                    if (Array.isArray(msg.files)) {
                        msg.files.forEach(f => {
                            if (!this.roomFiles.has(f.id)) {
                                this.roomFiles.set(f.id, f);
                            }
                        });
                    }
                    this.updateStatusBarIcon();
                    this.updateUi();
                    break;

                case 'peer-joined':
                    if (msg.member && msg.member.id !== this.myId) {
                        this.members.set(msg.member.id, {
                            id: msg.member.id,
                            name: msg.member.name || 'Room Member',
                            device: msg.member.device || 'Device',
                            color: msg.member.color || '#0a84ff',
                            isHost: !!msg.member.isHost
                        });
                        this.showRoomNotification('Member Joined', msg.member.name + ' joined the room');
                        this.updateStatusBarIcon();
                        this.updateUi();
                        try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
                    }
                    break;

                case 'peer-left':
                    if (msg.peerId && msg.peerId !== this.myId) {
                        this.cleanupMember(msg.peerId);
                    }
                    break;

                case 'lan-hello':
                case 'auth-handshake':
                    if (msg.passwordHash !== this.passwordHash) {
                        if (conn) {
                            conn.send({ type: 'auth-reject', reason: 'Incorrect room password.' });
                            try { conn.close(); } catch (e) {}
                        }
                        return;
                    }

                    const mId = msg.senderId || senderId;
                    if (conn) this.connections.set(conn.peer, conn);
                    this.members.set(mId, {
                        id: mId,
                        peerId: msg.peerId || (conn ? conn.peer : null),
                        name: msg.name || 'Room Member',
                        device: msg.device || 'Device',
                        color: msg.color || '#0a84ff',
                        isHost: !!msg.isHost
                    });

                    const ackPayload = {
                        type: 'auth-ack',
                        senderId: this.myId,
                        peerId: this.peer?.id,
                        passwordHash: this.passwordHash,
                        name: this.deviceName,
                        device: this.deviceType,
                        color: this.myColor,
                        isHost: this.isHost,
                        roomName: this.roomName,
                        catalog: Array.from(this.roomFiles.values()),
                        swarmPeers: Array.from(this.connections.keys())
                    };

                    if (conn && conn.open) {
                        conn.send(ackPayload);
                    } else {
                        this.broadcastLan(ackPayload);
                    }

                    // Host announces new peer to existing peers
                    if (this.isHost && conn) {
                        const announce = {
                            type: 'swarm-peer-announcement',
                            peerId: conn.peer,
                            member: {
                                id: mId,
                                peerId: conn.peer,
                                name: msg.name,
                                device: msg.device,
                                color: msg.color,
                                isHost: msg.isHost
                            }
                        };
                        for (const [pId, otherConn] of this.connections.entries()) {
                            if (pId !== conn.peer && otherConn.open) {
                                otherConn.send(announce);
                            }
                        }
                    }

                    this.updateStatusBarIcon();
                    this.updateUi();
                    break;

                case 'swarm-peer-announcement':
                    if (msg.peerId && msg.peerId !== this.peer?.id && !this.connections.has(msg.peerId)) {
                        this.connectToPeer(msg.peerId);
                    }
                    if (msg.member) {
                        this.members.set(msg.member.id || msg.peerId, msg.member);
                        this.updateStatusBarIcon();
                        this.updateUi();
                    }
                    break;

                case 'auth-ack':
                    if (msg.passwordHash === this.passwordHash) {
                        const ackId = msg.senderId || senderId;
                        if (conn) this.connections.set(conn.peer, conn);
                        this.members.set(ackId, {
                            id: ackId,
                            peerId: msg.peerId || (conn ? conn.peer : null),
                            name: msg.name || 'Room Member',
                            device: msg.device || 'Device',
                            color: msg.color || '#0a84ff',
                            isHost: !!msg.isHost
                        });
                        if (msg.roomName && !this.isHost) {
                            this.roomName = msg.roomName;
                        }
                        if (Array.isArray(msg.catalog)) {
                            msg.catalog.forEach(f => {
                                if (!this.roomFiles.has(f.id)) {
                                    this.roomFiles.set(f.id, f);
                                }
                            });
                        }
                        if (Array.isArray(msg.swarmPeers)) {
                            msg.swarmPeers.forEach(pId => {
                                if (pId !== this.peer?.id && !this.connections.has(pId)) {
                                    this.connectToPeer(pId);
                                }
                            });
                        }
                        this.updateStatusBarIcon();
                        this.updateUi();
                    }
                    break;

                case 'auth-reject':
                    alert('BrowDrop Room Access Denied: ' + (msg.reason || 'Incorrect password'));
                    this.leaveRoom();
                    break;

                case 'heartbeat':
                    if (msg.senderId && msg.senderId !== this.myId && msg.passwordHash === this.passwordHash) {
                        if (!this.members.has(msg.senderId)) {
                            this.members.set(msg.senderId, {
                                id: msg.senderId,
                                name: msg.name || 'Room Member',
                                device: msg.device || 'Device',
                                color: msg.color || '#0a84ff',
                                isHost: !!msg.isHost
                            });
                            this.updateStatusBarIcon();
                            this.updateUi();
                        }
                    }
                    break;

                case 'file-announced':
                    if (msg.fileMeta && !this.roomFiles.has(msg.fileMeta.id)) {
                        this.roomFiles.set(msg.fileMeta.id, msg.fileMeta);
                        this.showRoomNotification('New file in room', msg.fileMeta.senderName + ' uploaded ' + msg.fileMeta.name);
                        this.updateUi();
                        try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
                    }
                    break;

                case 'request-file':
                    if (this.localFileBlobs.has(msg.fileId)) {
                        this.streamFileToPeer(msg.fileId, senderId);
                    }
                    break;

                case 'file-chunk':
                    this.receiveFileChunk(msg);
                    break;

                case 'chat-message':
                    this.showRoomNotification(msg.senderName, msg.text);
                    try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
                    break;

                case 'cursor-move':
                    if (this.multiplayerActive) {
                        this.renderRemoteCursor(senderId, msg);
                    }
                    break;

                case 'cursor-click':
                    if (this.multiplayerActive) {
                        this.renderClickRipple(msg.x, msg.y, msg.color);
                    }
                    break;
            }
        }

        /* ─── Shared Room Files: Upload, Stream & Download ───────────────────── */

        uploadFileToRoom(file) {
            if (!file) return;

            const fileId = 'rf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            const meta = {
                id: fileId,
                name: file.name,
                size: file.size,
                mime: file.type || 'application/octet-stream',
                senderName: this.deviceName,
                senderId: this.myId,
                timestamp: Date.now()
            };

            this.localFileBlobs.set(fileId, file);
            this.roomFiles.set(fileId, meta);

            this.broadcast({
                type: 'file-announced',
                fileMeta: meta
            });

            this.updateUi();
            try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
        }

        downloadRoomFile(fileId) {
            const meta = this.roomFiles.get(fileId);
            if (!meta) return;

            if (this.localFileBlobs.has(fileId)) {
                this.saveBlobToDisk(this.localFileBlobs.get(fileId), meta.name);
                return;
            }

            const totalChunks = Math.ceil(meta.size / CHUNK_SIZE);
            this.incomingTransfers.set(fileId, {
                meta: meta,
                chunks: new Array(totalChunks),
                receivedCount: 0,
                totalChunks: totalChunks
            });

            this.updateDownloadBtnState(fileId, 'Downloading 0%...', true);

            this.sendTo(meta.senderId, {
                type: 'request-file',
                fileId: fileId
            });
        }

        streamFileToPeer(fileId, targetPeerId) {
            const blob = this.localFileBlobs.get(fileId);
            if (!blob) return;

            let offset = 0;
            let index = 0;
            const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);

            const readNextChunk = () => {
                if (offset >= blob.size) return;

                const slice = blob.slice(offset, offset + CHUNK_SIZE);
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.sendTo(targetPeerId, {
                        type: 'file-chunk',
                        fileId: fileId,
                        index: index,
                        totalChunks: totalChunks,
                        chunk: e.target.result // Base64 data URL string: safe over WebRTC, SSE, and BroadcastChannel
                    });

                    offset += CHUNK_SIZE;
                    index++;
                    setTimeout(readNextChunk, 8);
                };
                reader.readAsDataURL(slice);
            };

            readNextChunk();
        }

        async receiveFileChunk(msg) {
            const transfer = this.incomingTransfers.get(msg.fileId);
            if (!transfer) return;

            try {
                let chunkBlob;
                if (typeof msg.chunk === 'string' && msg.chunk.startsWith('data:')) {
                    const res = await fetch(msg.chunk);
                    chunkBlob = await res.blob();
                } else if (msg.chunk instanceof ArrayBuffer) {
                    chunkBlob = new Blob([msg.chunk]);
                } else {
                    chunkBlob = new Blob([msg.chunk]);
                }

                transfer.chunks[msg.index] = chunkBlob;
                transfer.receivedCount++;

                const pct = Math.floor((transfer.receivedCount / transfer.totalChunks) * 100);
                this.updateDownloadBtnState(msg.fileId, 'Downloading ' + pct + '%...', true);

                if (transfer.receivedCount >= transfer.totalChunks) {
                    const completeBlob = new Blob(transfer.chunks, { type: transfer.meta.mime });
                    this.localFileBlobs.set(msg.fileId, completeBlob);
                    this.incomingTransfers.delete(msg.fileId);
                    this.updateDownloadBtnState(msg.fileId, 'Downloaded', false);
                    this.saveBlobToDisk(completeBlob, transfer.meta.name);
                    try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
                }
            } catch (e) {
                console.error('[BrowDrop] Chunk decode error:', e);
            }
        }

        saveBlobToDisk(blob, fileName) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();

            if (window.BrowFS && typeof window.BrowFS.writeFile === 'function') {
                try {
                    const reader = new FileReader();
                    reader.onload = () => {
                        window.BrowFS.writeFile('/downloads/' + fileName, reader.result);
                    };
                    reader.readAsBinaryString(blob);
                } catch (e) {}
            }
        }

        updateDownloadBtnState(fileId, text, disabled) {
            const btn = this.activeContainer?.querySelector('#btn-dl-' + fileId);
            if (btn) {
                btn.textContent = text;
                btn.disabled = disabled;
            }
        }

        /* ─── UI Rendering: Lobby vs Active Room Hub ─────────────────────────── */

        mount(container) {
            this.activeContainer = container;
            this.render();
        }

        render() {
            if (!this.activeContainer) return;

            if (this.state === 'lobby') {
                this.renderLobby();
            } else {
                this.renderRoom();
            }
        }

        renderLobby() {
            const isCreate = this.lobbyTab === 'create';
            const defaultCode = this.prefilledRoomCode || generateRoomCode();

            this.activeContainer.innerHTML = [
                '<div class="browdrop-app-container">',
                '  <div class="browdrop-lobby">',
                '    <div class="browdrop-lobby-card">',
                '      <div class="browdrop-lobby-badge">',
                '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
                '          <path d="M4.93 19.07A10 10 0 0 1 19.07 4.93M7.76 16.24a6 6 0 0 1 8.48-8.48M10.59 13.41a2 2 0 0 1 2.82-2.82"/>',
                '          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
                '        </svg>',
                '      </div>',
                '      <div class="browdrop-lobby-title">BrowDrop Network</div>',
                '      <div class="browdrop-lobby-sub">Password-protected peer-to-peer room swarm for shared files, clipboard & live multiplayer</div>',
                '      <div class="browdrop-tabs">',
                '        <button class="browdrop-tab-btn ' + (isCreate ? 'active' : '') + '" id="tab-create-room">Create Room</button>',
                '        <button class="browdrop-tab-btn ' + (!isCreate ? 'active' : '') + '" id="tab-join-room">Join Room</button>',
                '      </div>',
                '      <div class="browdrop-form">',
                '        <div class="browdrop-field">',
                '          <label class="browdrop-label">Your Display Name</label>',
                '          <input type="text" class="browdrop-input" id="bd-input-username" value="' + this.deviceName + '" placeholder="e.g. Rudra Device">',
                '        </div>',
                isCreate ? [
                    '        <div class="browdrop-field">',
                    '          <label class="browdrop-label">Room Code</label>',
                    '          <input type="text" class="browdrop-input" id="bd-input-code" value="' + defaultCode + '" placeholder="e.g. ROOM-7842">',
                    '        </div>',
                    '        <div class="browdrop-field">',
                    '          <label class="browdrop-label">Room Password <span style="font-size:10px;opacity:0.6;">(required for others to join)</span></label>',
                    '          <div class="browdrop-input-wrap">',
                    '            <input type="password" class="browdrop-input" id="bd-input-password" placeholder="Create room password">',
                    '            <button class="browdrop-input-btn" id="bd-toggle-pass" type="button">👁</button>',
                    '          </div>',
                    '        </div>',
                    '        <button class="browdrop-submit-btn" id="btn-submit-room">Create & Host Room</button>'
                ].join('') : [
                    '        <div class="browdrop-field">',
                    '          <label class="browdrop-label">Room Code to Join</label>',
                    '          <input type="text" class="browdrop-input" id="bd-input-code" value="' + (this.prefilledRoomCode || '') + '" placeholder="e.g. ROOM-7842">',
                    '        </div>',
                    '        <div class="browdrop-field">',
                    '          <label class="browdrop-label">Room Password</label>',
                    '          <div class="browdrop-input-wrap">',
                    '            <input type="password" class="browdrop-input" id="bd-input-password" placeholder="Enter room password">',
                    '            <button class="browdrop-input-btn" id="bd-toggle-pass" type="button">👁</button>',
                    '          </div>',
                    '        </div>',
                    '        <button class="browdrop-submit-btn" id="btn-submit-room">Enter Room</button>'
                ].join(''),
                '        <div class="browdrop-status-banner ' + (this.statusMessage ? this.statusMessage.type : '') + '" id="bd-status-banner" style="' + (this.statusMessage ? 'display:flex;' : '') + '">',
                '          ' + (this.statusMessage ? this.statusMessage.text : ''),
                '        </div>',
                '      </div>',
                '      <div class="browdrop-lan-pill">',
                '        <div class="browdrop-lan-dot"></div>',
                '        <span>Offline LAN & Multi-Peer Mesh Enabled</span>',
                '      </div>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join('');

            this.bindLobbyEvents();
        }

        bindLobbyEvents() {
            const tabCreate = this.activeContainer.querySelector('#tab-create-room');
            const tabJoin = this.activeContainer.querySelector('#tab-join-room');

            if (tabCreate) tabCreate.onclick = () => { this.lobbyTab = 'create'; this.clearStatus(); this.render(); };
            if (tabJoin) tabJoin.onclick = () => { this.lobbyTab = 'join'; this.clearStatus(); this.render(); };

            const passInput = this.activeContainer.querySelector('#bd-input-password');
            const togglePass = this.activeContainer.querySelector('#bd-toggle-pass');
            if (togglePass && passInput) {
                togglePass.onclick = () => {
                    passInput.type = passInput.type === 'password' ? 'text' : 'password';
                };
            }

            const submitBtn = this.activeContainer.querySelector('#btn-submit-room');
            if (submitBtn) {
                submitBtn.onclick = () => {
                    const uname = this.activeContainer.querySelector('#bd-input-username')?.value || '';
                    const code = this.activeContainer.querySelector('#bd-input-code')?.value || '';
                    const pass = this.activeContainer.querySelector('#bd-input-password')?.value || '';

                    if (this.lobbyTab === 'create') {
                        this.createRoom('Room ' + code, code, pass, uname);
                    } else {
                        this.joinRoom(code, pass, uname);
                    }
                };
            }
        }

        renderRoom() {
            const filesList = Array.from(this.roomFiles.values());
            const membersList = Array.from(this.members.values());
            const currentTab = this.mobileRoomTab || 'files';

            this.activeContainer.innerHTML = [
                '<div class="browdrop-app-container">',
                '  <!-- Room Topbar -->',
                '  <div class="browdrop-room-topbar">',
                '    <div class="browdrop-room-title-group">',
                '      <div class="browdrop-room-lock-icon">',
                '        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
                '      </div>',
                '      <div class="browdrop-room-name-text" title="' + this.roomName + '">' + this.roomName + '</div>',
                '      <div class="browdrop-room-code-tag">' + this.roomCode + '</div>',
                '      <button class="browdrop-btn-icon" id="bd-copy-link" title="Copy Invite Link">',
                '        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
                '      </button>',
                '      <button class="browdrop-btn-icon" id="bd-show-qr" title="Scan QR Code to join on phone">',
                '        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
                '      </button>',
                '    </div>',
                '    <div class="browdrop-topbar-actions">',
                '      <div class="browdrop-members-pill">',
                '        <span>👥 ' + membersList.length + ' online</span>',
                '      </div>',
                '      <button class="browdrop-leave-btn" id="bd-btn-leave" title="Exit room">Leave</button>',
                '    </div>',
                '  </div>',
                '  <!-- Mobile View Switcher (Only visible on screens <= 768px) -->',
                '  <div class="browdrop-mobile-nav">',
                '    <button class="browdrop-mobile-nav-btn ' + (currentTab === 'files' ? 'active' : '') + '" data-tab="files">',
                '      📁 Shared Files (' + filesList.length + ')',
                '    </button>',
                '    <button class="browdrop-mobile-nav-btn ' + (currentTab === 'members' ? 'active' : '') + '" data-tab="members">',
                '      👥 Room Members (' + membersList.length + ')',
                '    </button>',
                '  </div>',
                '  <!-- Room Content with active tab modifier -->',
                '  <div class="browdrop-room-content tab-' + currentTab + '">',
                '    <!-- Sidebar: Members List -->',
                '    <div class="browdrop-room-sidebar">',
                '      <div class="browdrop-sidebar-title">',
                '        <span>Room Members</span>',
                '        <span>' + membersList.length + '</span>',
                '      </div>',
                '      <div class="browdrop-members-list">',
                membersList.map(m => [
                    '        <div class="browdrop-member-row">',
                    '          <div class="browdrop-member-avatar" style="background:' + (m.color || '#0a84ff') + '">',
                    '            ' + (m.name ? m.name.charAt(0).toUpperCase() : 'U'),
                    '            <div class="browdrop-member-dot"></div>',
                    '          </div>',
                    '          <div class="browdrop-member-info">',
                    '            <div class="browdrop-member-name">' + m.name + (m.id === this.myId ? ' (You)' : '') + '</div>',
                    '            <div class="browdrop-member-device">' + m.device + (m.isHost ? ' · Host' : '') + '</div>',
                    '          </div>',
                    '        </div>'
                ].join('')).join(''),
                '      </div>',
                '    </div>',
                '    <!-- Main Area: Shared Room Files -->',
                '    <div class="browdrop-room-main">',
                '      <!-- Dropzone -->',
                '      <div class="browdrop-room-dropzone" id="bd-room-dropzone">',
                '        <div class="browdrop-room-dropzone-icon">',
                '          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
                '        </div>',
                '        <div class="browdrop-room-dropzone-text">',
                '          <div class="browdrop-room-dropzone-title">Upload files to room</div>',
                '          <div class="browdrop-room-dropzone-sub">Tap or drag files here to share with everyone in the room</div>',
                '        </div>',
                '        <button class="browdrop-touch-browse-btn" type="button">Select Files</button>',
                '        <input type="file" id="bd-room-file-input" multiple style="display:none">',
                '      </div>',
                '      <!-- Files List -->',
                '      <div class="browdrop-room-files-header">',
                '        <div class="browdrop-room-files-title">Shared Files in Room</div>',
                '        <div class="browdrop-room-files-count">' + filesList.length + ' file' + (filesList.length === 1 ? '' : 's') + '</div>',
                '      </div>',
                '      <div class="browdrop-room-files-list">',
                filesList.length === 0 ? [
                    '        <div class="browdrop-files-empty">',
                    '          <div class="browdrop-files-empty-icon">📂</div>',
                    '          <div class="browdrop-files-empty-text">No files shared yet</div>',
                    '          <div class="browdrop-files-empty-sub">Upload a file above to share with room members</div>',
                    '        </div>'
                ].join('') : filesList.map(f => [
                    '        <div class="browdrop-room-file-card" data-file-id="' + f.id + '">',
                    '          <div class="browdrop-file-icon">📄</div>',
                    '          <div class="browdrop-file-details">',
                    '            <div class="browdrop-file-name" title="' + f.name + '">' + f.name + '</div>',
                    '            <div class="browdrop-file-meta">',
                    '              <span>' + formatBytes(f.size) + '</span>',
                    '              <span>·</span>',
                    '              <span>By ' + f.senderName + '</span>',
                    '            </div>',
                    '          </div>',
                    '          <button class="browdrop-download-btn bd-btn-dl" id="btn-dl-' + f.id + '" data-id="' + f.id + '" title="Download ' + f.name + '">',
                    '            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
                    '            <span>Download</span>',
                    '          </button>',
                    '        </div>'
                ].join('')).join(''),
                '      </div>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join('\n');

            this.bindRoomEvents();
        }

        bindRoomEvents() {
            // Mobile navigation tabs
            const navBtns = this.activeContainer.querySelectorAll('.browdrop-mobile-nav-btn');
            navBtns.forEach(btn => {
                btn.onclick = () => {
                    this.mobileRoomTab = btn.dataset.tab;
                    this.renderRoom();
                };
            });

            // Touch browse button
            const touchBrowseBtn = this.activeContainer.querySelector('.browdrop-touch-browse-btn');
            const fileInputEl = this.activeContainer.querySelector('#bd-room-file-input');
            if (touchBrowseBtn && fileInputEl) {
                touchBrowseBtn.onclick = (e) => {
                    e.stopPropagation();
                    fileInputEl.click();
                };
            }

            const leaveBtn = this.activeContainer.querySelector('#bd-btn-leave');
            if (leaveBtn) leaveBtn.onclick = () => this.leaveRoom();

            const copyBtn = this.activeContainer.querySelector('#bd-copy-link');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    const url = window.location.origin + window.location.pathname + '#browdrop=' + this.roomCode;
                    navigator.clipboard.writeText(url).then(() => {
                        copyBtn.style.color = '#30d158';
                        setTimeout(() => { copyBtn.style.color = ''; }, 1200);
                        try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
                    });
                };
            }

            const qrBtn = this.activeContainer.querySelector('#bd-show-qr');
            if (qrBtn) qrBtn.onclick = () => this.showQrModal();

            const dropzone = this.activeContainer.querySelector('#bd-room-dropzone');
            const fileInput = this.activeContainer.querySelector('#bd-room-file-input');
            if (dropzone && fileInput) {
                dropzone.onclick = () => fileInput.click();
                dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('dragover'); };
                dropzone.ondragleave = () => { dropzone.classList.remove('dragover'); };
                dropzone.ondrop = (e) => {
                    e.preventDefault();
                    dropzone.classList.remove('dragover');
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        for (let i = 0; i < e.dataTransfer.files.length; i++) {
                            this.uploadFileToRoom(e.dataTransfer.files[i]);
                        }
                    }
                };
                fileInput.onchange = () => {
                    if (fileInput.files && fileInput.files.length > 0) {
                        for (let i = 0; i < fileInput.files.length; i++) {
                            this.uploadFileToRoom(fileInput.files[i]);
                        }
                    }
                };
            }

            // Bind download buttons directly via data-id and file list
            this.activeContainer.querySelectorAll('.bd-btn-dl').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const fileId = btn.dataset.id;
                    if (fileId) this.downloadRoomFile(fileId);
                };
            });

            for (const file of this.roomFiles.values()) {
                const dlBtn = this.activeContainer.querySelector('#btn-dl-' + file.id);
                if (dlBtn) {
                    dlBtn.onclick = () => this.downloadRoomFile(file.id);
                }
            }

            const chatInput = this.activeContainer.querySelector('#bd-chat-input');
            const chatSend = this.activeContainer.querySelector('#bd-chat-send');
            if (chatSend && chatInput) {
                const doSend = () => {
                    const text = chatInput.value.trim();
                    if (!text) return;
                    this.broadcast({
                        type: 'chat-message',
                        senderName: this.deviceName,
                        text: text
                    });
                    chatInput.value = '';
                };
                chatSend.onclick = doSend;
                chatInput.onkeydown = (e) => { if (e.key === 'Enter') doSend(); };
            }
        }

        updateUi() {
            if (this.state === 'room') {
                this.renderRoom();
            }
        }

        async showQrModal() {
            await this.ensureQRCode();
            let url = window.location.href.split('#')[0];
            const isFile = url.startsWith('file:');
            const targetUrl = isFile ? ('https://browos.dev/#browdrop=' + this.roomCode) : (url + '#browdrop=' + this.roomCode);

            const modal = document.createElement('div');
            modal.className = 'browdrop-modal-overlay';
            modal.innerHTML = [
                '<div class="browdrop-modal-card">',
                '  <div class="browdrop-modal-title">Join ' + this.roomName + '</div>',
                '  <div class="browdrop-modal-sub">Scan on mobile or share room code</div>',
                '  <div class="browdrop-qr-box">',
                '    <div id="bd-qr-canvas-holder" style="width:160px;height:160px;display:flex;align-items:center;justify-content:center;overflow:hidden;"></div>',
                '  </div>',
                '  <div style="font-family:ui-monospace,SF Mono,Menlo,monospace; font-size:14px; font-weight:700; color:var(--accent,#0a84ff); margin-bottom:8px;">',
                '    Code: ' + this.roomCode,
                '  </div>',
                '  <div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:14px;">',
                '    Password protected room',
                '  </div>',
                '  <button class="browdrop-btn secondary" id="bd-close-modal" style="width:100%; justify-content:center;">Close</button>',
                '</div>'
            ].join('');

            const targetHost = (this.activeContainer && this.activeContainer.querySelector('.browdrop-app-container')) || this.activeContainer || document.body;
            targetHost.appendChild(modal);

            const qrHolder = modal.querySelector('#bd-qr-canvas-holder');
            if (typeof window.QRCode !== 'undefined' && qrHolder) {
                try {
                    new window.QRCode(qrHolder, {
                        text: targetUrl,
                        width: 160,
                        height: 160,
                        colorDark: '#121317',
                        colorLight: '#ffffff',
                        correctLevel: window.QRCode.CorrectLevel.M
                    });
                } catch (e) {
                    console.warn('[BrowDrop] QR render error:', e);
                }
            }

            modal.querySelector('#bd-close-modal').onclick = () => modal.remove();
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        }

        showRoomNotification(title, text) {
            const banner = document.createElement('div');
            banner.className = 'browdrop-incoming-banner';
            banner.innerHTML = [
                '<div class="browdrop-banner-icon">',
                '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
                '</div>',
                '<div class="browdrop-banner-body">',
                '  <div class="browdrop-banner-title">' + title + '</div>',
                '  <div class="browdrop-banner-sub">' + text + '</div>',
                '</div>'
            ].join('');
            document.body.appendChild(banner);
            setTimeout(() => { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 4000);
        }

        updateStatusBarIcon() {
            const dot = document.querySelector('.browdrop-badge-dot');
            if (dot) {
                if (this.state === 'room' && this.members.size > 1) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            }
        }

        renderRemoteCursor(peerId, data) {
            let el = this.remoteCursorElements.get(peerId);
            if (!el) {
                el = document.createElement('div');
                el.className = 'browdrop-remote-cursor';
                el.innerHTML = [
                    '<svg class="browdrop-cursor-pointer" viewBox="0 0 24 24" fill="none">',
                    '  <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z" fill="' + (data.color || '#0a84ff') + '" stroke="#ffffff" stroke-width="1.5"/>',
                    '</svg>',
                    '<div class="browdrop-cursor-badge" style="background: ' + (data.color || '#0a84ff') + '">',
                    '  <span>' + (data.name || 'Peer') + '</span>',
                    '</div>'
                ].join('');
                document.body.appendChild(el);
                this.remoteCursorElements.set(peerId, el);
            }

            const targetX = data.x * window.innerWidth;
            const targetY = data.y * window.innerHeight;
            el.style.transform = 'translate3d(' + targetX + 'px, ' + targetY + 'px, 0)';
        }

        renderClickRipple(xPct, yPct, color) {
            const ripple = document.createElement('div');
            ripple.className = 'browdrop-click-ripple';
            ripple.style.left = (xPct * window.innerWidth) + 'px';
            ripple.style.top = (yPct * window.innerHeight) + 'px';
            ripple.style.borderColor = color || 'var(--accent, #0a84ff)';
            document.body.appendChild(ripple);
            setTimeout(() => { if (ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 650);
        }
    }

    window.browDropManager = new BrowDropManager();

    window.initBrowDropApp = function(mountContainer) {
        window.browDropManager.mount(mountContainer);
    };

})(window);
