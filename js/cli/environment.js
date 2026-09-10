/**
 * BrowOS Shell Environment
 * Manages environment variables, working directory, aliases, and history.
 */
class ShellEnvironment {
    constructor(initialCwd = '/') {
        this.cwd = this.normalizePath(initialCwd || '/');
        this.home = '/';
        this.user = 'user';
        this.hostname = 'browos';
        
        this.envVars = {
            USER: this.user,
            HOME: this.home,
            PWD: this.cwd,
            OLDPWD: this.cwd,
            SHELL: '/bin/browsh',
            TERM: 'xterm-256color',
            PATH: '/bin:/usr/bin:/usr/local/bin',
            '?': '0'
        };

        this.aliases = {
            'll': 'ls -la',
            'la': 'ls -a',
            'l': 'ls -CF',
            'cls': 'clear',
            'md': 'mkdir -p',
            'dir': 'ls'
        };

        this.functions = {};
        this.history = [];
        this.loadHistory();
    }

    clone() {
        const cloned = new ShellEnvironment(this.cwd);
        cloned.home = this.home;
        cloned.user = this.user;
        cloned.hostname = this.hostname;
        cloned.envVars = { ...this.envVars };
        cloned.aliases = { ...this.aliases };
        cloned.functions = { ...this.functions };
        return cloned;
    }

    setFunction(name, body) {
        if (!name) return false;
        this.functions[name] = body;
        return true;
    }

    getFunction(name) {
        return this.functions[name] || null;
    }

    removeFunction(name) {
        if (this.functions[name]) {
            delete this.functions[name];
            return true;
        }
        return false;
    }

    get(key, defaultValue = '') {
        if (key === 'PWD') return this.cwd;
        if (this.envVars[key] !== undefined) return this.envVars[key];
        const clean = String(key).replace(/^\$/, '');
        if (this.envVars[clean] !== undefined) return this.envVars[clean];
        // Fuzzy sync for common typos (XTROUTER_API_KEY <-> XROUTER_API_KEY)
        if (clean === 'XTROUTER_API_KEY' && this.envVars['XROUTER_API_KEY'] !== undefined) {
            return this.envVars['XROUTER_API_KEY'];
        }
        if (clean === 'XROUTER_API_KEY' && this.envVars['XTROUTER_API_KEY'] !== undefined) {
            return this.envVars['XTROUTER_API_KEY'];
        }
        return defaultValue;
    }

    set(key, value) {
        const clean = String(key).replace(/^\$/, '');
        const strVal = String(value);
        this.envVars[clean] = strVal;
        if (clean === 'PWD') {
            this.cwd = this.normalizePath(strVal);
        }
        // Keep both spellings synchronized
        if (clean === 'XROUTER_API_KEY') {
            this.envVars['XTROUTER_API_KEY'] = strVal;
        } else if (clean === 'XTROUTER_API_KEY') {
            this.envVars['XROUTER_API_KEY'] = strVal;
        }
    }

    unset(key) {
        if (key === 'PWD' || key === 'HOME' || key === 'USER') return false;
        delete this.envVars[key];
        return true;
    }

    getAll() {
        return { ...this.envVars, PWD: this.cwd };
    }

    setExitCode(code) {
        this.envVars['?'] = String(code);
    }

    getExitCode() {
        return parseInt(this.envVars['?'] || '0', 10);
    }

    getCwd() {
        return this.cwd;
    }

    setCwd(newPath) {
        const resolved = this.resolvePath(newPath);
        this.envVars['OLDPWD'] = this.cwd;
        this.cwd = resolved;
        this.envVars['PWD'] = resolved;
        return this.cwd;
    }

    normalizePath(pathStr) {
        if (!pathStr || typeof pathStr !== 'string') return '/';
        let str = pathStr.replace(/\\/g, '/').trim();
        if (!str.startsWith('/')) str = '/' + str;
        
        const segments = str.split('/');
        const stack = [];
        
        for (const seg of segments) {
            if (!seg || seg === '.') continue;
            if (seg === '..') {
                if (stack.length > 0) stack.pop();
            } else {
                stack.push(seg);
            }
        }
        
        return '/' + stack.join('/');
    }

    resolvePath(inputPath) {
        if (!inputPath || typeof inputPath !== 'string') return this.cwd;
        let str = inputPath.trim().replace(/^["']|["']$/g, '');
        
        if (str === '~' || str.startsWith('~/')) {
            str = str === '~' ? this.home : this.home + str.substring(1);
        } else if (str === '-') {
            return this.envVars['OLDPWD'] || this.cwd;
        }

        if (str.startsWith('/')) {
            return this.normalizePath(str);
        }

        const base = this.cwd === '/' ? '' : this.cwd;
        return this.normalizePath(`${base}/${str}`);
    }

    setAlias(name, command) {
        if (!name) return false;
        this.aliases[name] = command;
        return true;
    }

    getAlias(name) {
        return this.aliases[name] || null;
    }

    removeAlias(name) {
        if (this.aliases[name]) {
            delete this.aliases[name];
            return true;
        }
        return false;
    }

    loadHistory() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('browos_terminal_history');
                if (raw) {
                    this.history = JSON.parse(raw);
                }
            }
        } catch (e) {}
    }

    saveHistory() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('browos_terminal_history', JSON.stringify(this.history.slice(-500)));
            }
        } catch (e) {}
    }

    addHistory(line) {
        if (!line || !line.trim()) return;
        const trimmed = line.trim();
        if (this.history.length === 0 || this.history[this.history.length - 1] !== trimmed) {
            this.history.push(trimmed);
            if (this.history.length > 500) {
                this.history.shift();
            }
            this.saveHistory();
        }
    }

    getHistory() {
        return [...this.history];
    }

    clearHistory() {
        this.history = [];
        this.saveHistory();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ShellEnvironment };
}
if (typeof window !== 'undefined') {
    window.ShellEnvironment = ShellEnvironment;
}
