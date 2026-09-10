/**
 * BrowOS Shell Autocomplete
 * Context-aware Tab completion for commands, aliases, flags, and filesystem paths.
 */

class ShellAutocomplete {
    constructor(commands, env) {
        this.commands = commands;
        this.env = env;
    }

    getCommandList() {
        const builtins = [
            'pwd', 'cd', 'ls', 'tree', 'stat', 'file',
            'touch', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'head', 'tail', 'wc',
            'grep', 'find', 'sort', 'uniq', 'diff', 'echo', 'printf',
            'export', 'env', 'alias', 'unalias', 'which', 'history', 'clear',
            'node', 'js', 'python', 'python3', 'sqlite3',
            'sh', 'bash', 'source', 'test', 'theme', 'code', 'codebrow',
            'nano', 'open', 'apps', 'launch', 'df', 'free', 'ps', 'kill', 'uptime', 'whoami', 'uname',
            'curl', 'ping', 'getnet', 'help'
        ];
        const aliases = Object.keys(this.env.aliases || {});
        const funcs = Object.keys(this.env.functions || {});
        return Array.from(new Set([...builtins, ...aliases, ...funcs])).sort();
    }

    /**
     * Resolves autocompletion for current input buffer at cursor.
     * Returns { replacement, completions, isDirectory, commonPrefix }
     */
    async complete(line, cursorPos) {
        const prefix = line.substring(0, cursorPos);
        const tokens = prefix.split(/\s+/);
        const isFirstWord = tokens.length === 1 || (tokens.length === 2 && prefix.endsWith(' ') === false && prefix.trim().split(/\s+/).length === 1);
        const currentWord = tokens[tokens.length - 1] || '';

        // 1. Command autocompletion
        if (isFirstWord && !currentWord.includes('/')) {
            const allCmds = this.getCommandList();
            const matches = allCmds.filter(c => c.startsWith(currentWord));
            return this.buildResult(currentWord, matches, false);
        }

        // 2. Filesystem path autocompletion
        const fs = window.filesystem;
        if (!fs || !fs.isReady()) {
            return null;
        }

        let searchDir = '.';
        let filePrefix = currentWord;

        const lastSlash = currentWord.lastIndexOf('/');
        if (lastSlash !== -1) {
            searchDir = currentWord.substring(0, lastSlash) || '/';
            filePrefix = currentWord.substring(lastSlash + 1);
        }

        const resolvedDir = this.env.resolvePath(searchDir);

        try {
            const entries = await fs.list(resolvedDir);
            if (!entries) return null;

            const matches = [];
            for (let entry of entries) {
                if (entry.name.startsWith(filePrefix)) {
                    const isDir = entry.kind === 'directory';
                    matches.push({
                        name: entry.name + (isDir ? '/' : ''),
                        isDir
                    });
                }
            }

            if (matches.length === 0) return null;

            const matchNames = matches.map(m => m.name);
            const isDir = matches.length === 1 && matches[0].isDir;
            return this.buildResult(filePrefix, matchNames, isDir);
        } catch (e) {
            return null;
        }
    }

    buildResult(word, matches, isSingleDir) {
        if (matches.length === 0) return null;

        if (matches.length === 1) {
            const match = matches[0];
            const suffix = isSingleDir ? '' : ' ';
            return {
                type: 'single',
                completion: match + suffix,
                insertText: match.substring(word.length) + suffix
            };
        }

        // Multiple matches: find longest common prefix
        let common = matches[0];
        for (let i = 1; i < matches.length; i++) {
            while (!matches[i].startsWith(common) && common.length > 0) {
                common = common.substring(0, common.length - 1);
            }
        }

        return {
            type: 'multiple',
            completions: matches,
            commonPrefix: common,
            insertText: common.length > word.length ? common.substring(word.length) : ''
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ShellAutocomplete };
}
if (typeof window !== 'undefined') {
    window.ShellAutocomplete = ShellAutocomplete;
}
