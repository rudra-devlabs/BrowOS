/**
 * BrowOS Standard Unix Coreutils Suite
 * Comprehensive async implementations of POSIX utilities directly integrated with window.filesystem.
 */

class ShellCommands {
    constructor(engine) {
        this.engine = engine;
    }

    getFs() {
        return (typeof window !== 'undefined' && window.filesystem) || null;
    }

    async getStat(path) {
        const fs = this.getFs();
        if (!fs) return null;
        if (typeof fs.stat === 'function') return await fs.stat(path);
        if (typeof fs.getMetadata === 'function') return await fs.getMetadata(path);
        return null;
    }

    async checkExists(path) {
        const fs = this.getFs();
        if (!fs) return false;
        if (typeof fs.exists === 'function') return await fs.exists(path);
        const meta = await this.getStat(path);
        return meta !== null;
    }

    // ─── Filesystem & Navigation ────────────────────────────────

    async pwd(args, stdin, stdout, stderr, env) {
        stdout.write(env.getCwd() + '\n');
        return 0;
    }

    async cd(args, stdin, stdout, stderr, env) {
        const target = args[1] || '~';
        const resolved = env.resolvePath(target);
        const fs = this.getFs();

        if (resolved === '/') {
            env.setCwd('/');
            return 0;
        }

        if (fs && fs.isReady()) {
            try {
                const stat = await this.getStat(resolved);
                if (!stat) {
                    stderr.write(`cd: ${target}: No such file or directory\n`);
                    return 1;
                }
                if (stat.type !== 'directory') {
                    stderr.write(`cd: ${target}: Not a directory\n`);
                    return 1;
                }
            } catch (e) {
                stderr.write(`cd: ${target}: ${e.message}\n`);
                return 1;
            }
        }

        env.setCwd(resolved);
        return 0;
    }

    async ls(args, stdin, stdout, stderr, env) {
        let showAll = false;
        let longFormat = false;
        let humanReadable = false;
        let sortByTime = false;
        let reverse = false;
        let recursive = false;
        const targets = [];

        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (arg.startsWith('-') && arg.length > 1) {
                for (let c of arg.substring(1)) {
                    if (c === 'a') showAll = true;
                    else if (c === 'l') longFormat = true;
                    else if (c === 'h') humanReadable = true;
                    else if (c === 't') sortByTime = true;
                    else if (c === 'r') reverse = true;
                    else if (c === 'R') recursive = true;
                }
            } else {
                targets.push(arg);
            }
        }

        if (targets.length === 0) targets.push('.');

        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('ls: filesystem not ready (please mount or unlock drive)\n');
            return 1;
        }

        const formatSize = (bytes) => {
            if (!humanReadable) return String(bytes).padStart(8, ' ');
            return fs.formatBytes(bytes).padStart(7, ' ');
        };

        const formatDate = (date) => {
            if (!date) return 'Jan 01 00:00';
            const d = new Date(date);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[d.getMonth()];
            const day = String(d.getDate()).padStart(2, ' ');
            const hrs = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            return `${month} ${day} ${hrs}:${mins}`;
        };

        const formatName = (entry) => {
            if (entry.kind === 'directory') {
                return `\x1b[1;34m${entry.name}/\x1b[0m`;
            }
            const ext = '.' + entry.name.split('.').pop().toLowerCase();
            if (['.js', '.ts', '.py', '.sh', '.wasm', '.c', '.cpp', '.rs'].includes(ext)) {
                return `\x1b[1;32m${entry.name}\x1b[0m`;
            } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.mp4'].includes(ext)) {
                return `\x1b[1;35m${entry.name}\x1b[0m`;
            } else if (['.zip', '.tar', '.gz'].includes(ext)) {
                return `\x1b[1;31m${entry.name}\x1b[0m`;
            }
            return entry.name;
        };

        let exitCode = 0;

        for (let target of targets) {
            const resolved = env.resolvePath(target);
            try {
                let entries = await fs.list(resolved);
                if (!entries) {
                    // Check if it's a file
                    const stat = await this.getStat(resolved);
                    if (stat) {
                        entries = [{ name: target.split('/').pop(), kind: stat.type, size: stat.size, modified: stat.modified }];
                    } else {
                        stderr.write(`ls: cannot access '${target}': No such file or directory\n`);
                        exitCode = 1;
                        continue;
                    }
                }

                if (targets.length > 1) {
                    stdout.write(`\x1b[1m${target}:\x1b[0m\n`);
                }

                let filtered = entries.filter(e => showAll || !e.name.startsWith('.'));

                if (sortByTime) {
                    filtered.sort((a, b) => (b.modified || 0) - (a.modified || 0));
                } else {
                    filtered.sort((a, b) => a.name.localeCompare(b.name));
                }

                if (reverse) filtered.reverse();

                if (longFormat) {
                    let totalBlocks = 0;
                    filtered.forEach(e => totalBlocks += Math.ceil((e.size || 0) / 1024));
                    stdout.write(`total ${totalBlocks}\n`);

                    for (let item of filtered) {
                        const isDir = item.kind === 'directory';
                        const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
                        const links = isDir ? '2' : '1';
                        const size = isDir ? formatSize(4096) : formatSize(item.size || 0);
                        const date = formatDate(item.modified);
                        const colored = formatName(item);
                        stdout.write(`${perms}  ${links} user user  ${size}  ${date}  ${colored}\n`);
                    }
                } else {
                    const names = filtered.map(e => formatName(e));
                    if (names.length > 0) {
                        stdout.write(names.join('  ') + '\n');
                    }
                }

                if (targets.length > 1) stdout.write('\n');
            } catch (e) {
                stderr.write(`ls: cannot open directory '${target}': ${e.message}\n`);
                exitCode = 1;
            }
        }

        return exitCode;
    }

    async tree(args, stdin, stdout, stderr, env) {
        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('tree: filesystem not ready\n');
            return 1;
        }

        let maxDepth = 4;
        let target = '.';

        for (let i = 1; i < args.length; i++) {
            if (args[i] === '-L' && args[i + 1]) {
                maxDepth = parseInt(args[i + 1], 10) || 4;
                i++;
            } else if (!args[i].startsWith('-')) {
                target = args[i];
            }
        }

        const resolved = env.resolvePath(target);
        stdout.write(`\x1b[1;34m${resolved}\x1b[0m\n`);

        let dirCount = 0;
        let fileCount = 0;

        const walk = async (dirPath, prefix, depth) => {
            if (depth > maxDepth) return;
            try {
                const entries = await fs.list(dirPath);
                if (!entries) return;
                const visible = entries.filter(e => !e.name.startsWith('.'));
                visible.sort((a, b) => a.name.localeCompare(b.name));

                for (let i = 0; i < visible.length; i++) {
                    const item = visible[i];
                    const isLast = i === visible.length - 1;
                    const connector = isLast ? '└── ' : '├── ';
                    const nextPrefix = prefix + (isLast ? '    ' : '│   ');

                    if (item.kind === 'directory') {
                        dirCount++;
                        stdout.write(`${prefix}${connector}\x1b[1;34m${item.name}/\x1b[0m\n`);
                        const subPath = dirPath === '/' ? `/${item.name}` : `${dirPath}/${item.name}`;
                        await walk(subPath, nextPrefix, depth + 1);
                    } else {
                        fileCount++;
                        stdout.write(`${prefix}${connector}${item.name}\n`);
                    }
                }
            } catch (e) {}
        };

        await walk(resolved, '', 1);
        stdout.write(`\n${dirCount} directories, ${fileCount} files\n`);
        return 0;
    }

    async stat(args, stdin, stdout, stderr, env) {
        if (args.length < 2) {
            stderr.write('stat: missing operand\n');
            return 1;
        }
        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('stat: filesystem not ready\n');
            return 1;
        }

        let exitCode = 0;
        for (let i = 1; i < args.length; i++) {
            const resolved = env.resolvePath(args[i]);
            const meta = await this.getStat(resolved);
            if (!meta) {
                stderr.write(`stat: cannot stat '${args[i]}': No such file or directory\n`);
                exitCode = 1;
                continue;
            }
            stdout.write(`  File: ${args[i]}\n`);
            stdout.write(`  Size: ${meta.size} bytes        Blocks: ${Math.ceil(meta.size / 512)}       IO Block: 4096   ${meta.type}\n`);
            stdout.write(`Device: browos-vfs        Inode: 1024       Links: ${meta.type === 'directory' ? 2 : 1}\n`);
            stdout.write(`Access: (${meta.type === 'directory' ? '0755/drwxr-xr-x' : '0644/-rw-r--r--'})  Uid: ( 1000/    user)   Gid: ( 1000/    user)\n`);
            stdout.write(`Modify: ${new Date(meta.modified || Date.now()).toISOString()}\n`);
        }
        return exitCode;
    }

    async file(args, stdin, stdout, stderr, env) {
        if (args.length < 2) {
            stderr.write('file: missing operand\n');
            return 1;
        }
        const fs = this.getFs();
        for (let i = 1; i < args.length; i++) {
            const target = args[i];
            const resolved = env.resolvePath(target);
            const meta = await this.getStat(resolved);
            if (!meta) {
                stderr.write(`${target}: cannot open (No such file or directory)\n`);
                continue;
            }
            if (meta.type === 'directory') {
                stdout.write(`${target}: directory\n`);
                continue;
            }
            const ext = '.' + target.split('.').pop().toLowerCase();
            const types = {
                '.txt': 'ASCII text',
                '.md': 'Markdown text',
                '.json': 'JSON data',
                '.js': 'JavaScript source text',
                '.ts': 'TypeScript source text',
                '.html': 'HTML document text',
                '.css': 'CSS stylesheet text',
                '.py': 'Python script text',
                '.sh': 'POSIX shell script text',
                '.png': 'PNG image data',
                '.jpg': 'JPEG image data',
                '.jpeg': 'JPEG image data',
                '.webp': 'WebP image data',
                '.mp3': 'Audio file with ID3 version 2.4.0',
                '.wav': 'RIFF (little-endian) data, WAVE audio',
                '.wasm': 'WebAssembly (wasm) binary module'
            };
            stdout.write(`${target}: ${types[ext] || 'data file'}\n`);
        }
        return 0;
    }

    // ─── File Manipulation ──────────────────────────────────────

    async touch(args, stdin, stdout, stderr, env) {
        if (args.length < 2) {
            stderr.write('touch: missing file operand\n');
            return 1;
        }
        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('touch: filesystem not ready\n');
            return 1;
        }

        for (let i = 1; i < args.length; i++) {
            const resolved = env.resolvePath(args[i]);
            const exists = await this.checkExists(resolved);
            if (!exists) {
                const ok = await fs.createFile(resolved, '');
                if (!ok) {
                    stderr.write(`touch: cannot touch '${args[i]}': Failed to create file\n`);
                    return 1;
                }
            }
        }
        return 0;
    }

    async mkdir(args, stdin, stdout, stderr, env) {
        let makeParents = false;
        const dirs = [];

        for (let i = 1; i < args.length; i++) {
            if (args[i] === '-p' || args[i] === '--parents') {
                makeParents = true;
            } else if (!args[i].startsWith('-')) {
                dirs.push(args[i]);
            }
        }

        if (dirs.length === 0) {
            stderr.write('mkdir: missing operand\n');
            return 1;
        }

        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('mkdir: filesystem not ready\n');
            return 1;
        }

        let exitCode = 0;
        for (let dir of dirs) {
            const resolved = env.resolvePath(dir);
            try {
                const ok = makeParents ? await fs.ensureDirectory(resolved) : await fs.createDirectory(resolved);
                if (!ok) {
                    stderr.write(`mkdir: cannot create directory '${dir}'\n`);
                    exitCode = 1;
                }
            } catch (e) {
                stderr.write(`mkdir: cannot create directory '${dir}': ${e.message}\n`);
                exitCode = 1;
            }
        }
        return exitCode;
    }

    async rm(args, stdin, stdout, stderr, env) {
        let recursive = false;
        let force = false;
        const targets = [];

        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (arg.startsWith('-')) {
                if (arg.includes('r') || arg.includes('R')) recursive = true;
                if (arg.includes('f')) force = true;
            } else {
                targets.push(arg);
            }
        }

        if (targets.length === 0) {
            if (!force) stderr.write('rm: missing operand\n');
            return force ? 0 : 1;
        }

        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('rm: filesystem not ready\n');
            return 1;
        }

        let exitCode = 0;
        for (let target of targets) {
            const resolved = env.resolvePath(target);
            if (resolved === '/') {
                stderr.write('rm: it is dangerous to operate recursively on '/'\n');
                return 1;
            }
            try {
                const stat = await this.getStat(resolved);
                if (!stat) {
                    if (!force) {
                        stderr.write(`rm: cannot remove '${target}': No such file or directory\n`);
                        exitCode = 1;
                    }
                    continue;
                }
                if (stat.type === 'directory' && !recursive) {
                    stderr.write(`rm: cannot remove '${target}': Is a directory\n`);
                    exitCode = 1;
                    continue;
                }
                const ok = await fs.delete(resolved);
                if (!ok && !force) {
                    stderr.write(`rm: cannot remove '${target}'\n`);
                    exitCode = 1;
                }
            } catch (e) {
                if (!force) {
                    stderr.write(`rm: cannot remove '${target}': ${e.message}\n`);
                    exitCode = 1;
                }
            }
        }
        return exitCode;
    }

    async cp(args, stdin, stdout, stderr, env) {
        let recursive = false;
        const targets = [];

        for (let i = 1; i < args.length; i++) {
            if (args[i] === '-r' || args[i] === '-R') {
                recursive = true;
            } else if (!args[i].startsWith('-')) {
                targets.push(args[i]);
            }
        }

        if (targets.length < 2) {
            stderr.write('cp: missing destination file operand after source\n');
            return 1;
        }

        const dest = targets.pop();
        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('cp: filesystem not ready\n');
            return 1;
        }

        for (let src of targets) {
            const srcResolved = env.resolvePath(src);
            const destResolved = env.resolvePath(dest);
            const result = await fs.copy(srcResolved, destResolved);
            if (!result.ok) {
                stderr.write(`cp: cannot copy '${src}': ${result.error}\n`);
                return 1;
            }
        }
        return 0;
    }

    async mv(args, stdin, stdout, stderr, env) {
        const targets = args.slice(1).filter(a => !a.startsWith('-'));
        if (targets.length < 2) {
            stderr.write('mv: missing destination file operand\n');
            return 1;
        }

        const dest = targets.pop();
        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('mv: filesystem not ready\n');
            return 1;
        }

        for (let src of targets) {
            const srcResolved = env.resolvePath(src);
            const destResolved = env.resolvePath(dest);
            const result = await fs.move(srcResolved, destResolved);
            if (!result.ok) {
                stderr.write(`mv: cannot move '${src}': ${result.error}\n`);
                return 1;
            }
        }
        return 0;
    }

    async cat(args, stdin, stdout, stderr, env) {
        const files = args.slice(1).filter(a => !a.startsWith('-'));
        const fs = this.getFs();

        if (files.length === 0) {
            // Read from piped stdin
            if (stdin && stdin.length > 0) {
                stdout.write(stdin);
                if (!stdin.endsWith('\n')) stdout.write('\n');
            }
            return 0;
        }

        if (!fs || !fs.isReady()) {
            stderr.write('cat: filesystem not ready\n');
            return 1;
        }

        let exitCode = 0;
        for (let file of files) {
            const resolved = env.resolvePath(file);
            const content = await fs.readFile(resolved);
            if (content === null) {
                stderr.write(`cat: ${file}: No such file or directory\n`);
                exitCode = 1;
                continue;
            }
            stdout.write(content);
            if (!content.endsWith('\n')) stdout.write('\n');
        }
        return exitCode;
    }

    async head(args, stdin, stdout, stderr, env) {
        let linesCount = 10;
        const files = [];

        for (let i = 1; i < args.length; i++) {
            if (args[i] === '-n' && args[i + 1]) {
                linesCount = parseInt(args[i + 1], 10) || 10;
                i++;
            } else if (args[i].startsWith('-') && !isNaN(parseInt(args[i].substring(1), 10))) {
                linesCount = parseInt(args[i].substring(1), 10);
            } else {
                files.push(args[i]);
            }
        }

        const printHead = (text) => {
            const lines = text.split('\n').slice(0, linesCount);
            stdout.write(lines.join('\n') + '\n');
        };

        if (files.length === 0) {
            printHead(stdin || '');
            return 0;
        }

        const fs = this.getFs();
        for (let file of files) {
            const resolved = env.resolvePath(file);
            const content = await fs.readFile(resolved);
            if (content === null) {
                stderr.write(`head: cannot open '${file}'\n`);
                continue;
            }
            if (files.length > 1) stdout.write(`==> ${file} <==\n`);
            printHead(content);
        }
        return 0;
    }

    async tail(args, stdin, stdout, stderr, env) {
        let linesCount = 10;
        const files = [];

        for (let i = 1; i < args.length; i++) {
            if (args[i] === '-n' && args[i + 1]) {
                linesCount = parseInt(args[i + 1], 10) || 10;
                i++;
            } else if (args[i].startsWith('-') && !isNaN(parseInt(args[i].substring(1), 10))) {
                linesCount = parseInt(args[i].substring(1), 10);
            } else {
                files.push(args[i]);
            }
        }

        const printTail = (text) => {
            const all = text.split('\n');
            if (all[all.length - 1] === '') all.pop();
            const lines = all.slice(-linesCount);
            stdout.write(lines.join('\n') + '\n');
        };

        if (files.length === 0) {
            printTail(stdin || '');
            return 0;
        }

        const fs = this.getFs();
        for (let file of files) {
            const resolved = env.resolvePath(file);
            const content = await fs.readFile(resolved);
            if (content === null) {
                stderr.write(`tail: cannot open '${file}'\n`);
                continue;
            }
            if (files.length > 1) stdout.write(`==> ${file} <==\n`);
            printTail(content);
        }
        return 0;
    }

    async wc(args, stdin, stdout, stderr, env) {
        let showLines = false;
        let showWords = false;
        let showBytes = false;
        const files = [];

        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (arg.startsWith('-')) {
                if (arg.includes('l')) showLines = true;
                if (arg.includes('w')) showWords = true;
                if (arg.includes('c') || arg.includes('m')) showBytes = true;
            } else {
                files.push(arg);
            }
        }

        if (!showLines && !showWords && !showBytes) {
            showLines = true;
            showWords = true;
            showBytes = true;
        }

        const countText = (text, label = '') => {
            const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            const bytes = new TextEncoder().encode(text).length;

            let out = '';
            if (showLines) out += String(lines).padStart(8, ' ');
            if (showWords) out += String(words).padStart(8, ' ');
            if (showBytes) out += String(bytes).padStart(8, ' ');
            if (label) out += ' ' + label;
            stdout.write(out + '\n');
        };

        if (files.length === 0) {
            countText(stdin || '');
            return 0;
        }

        const fs = this.getFs();
        for (let file of files) {
            const resolved = env.resolvePath(file);
            const content = await fs.readFile(resolved);
            if (content === null) {
                stderr.write(`wc: ${file}: No such file or directory\n`);
                continue;
            }
            countText(content, file);
        }
        return 0;
    }

    // ─── Search & Text Processing ───────────────────────────────

    async grep(args, stdin, stdout, stderr, env) {
        let ignoreCase = false;
        let invertMatch = false;
        let showLineNumbers = false;
        let countOnly = false;
        let isRegex = false;
        let pattern = null;
        const files = [];

        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (arg.startsWith('-') && !pattern) {
                if (arg.includes('i')) ignoreCase = true;
                if (arg.includes('v')) invertMatch = true;
                if (arg.includes('n')) showLineNumbers = true;
                if (arg.includes('c')) countOnly = true;
                if (arg.includes('E')) isRegex = true;
            } else if (!pattern) {
                pattern = arg;
            } else {
                files.push(arg);
            }
        }

        if (!pattern) {
            stderr.write('grep: missing pattern\n');
            return 1;
        }

        let regex;
        try {
            regex = new RegExp(pattern, ignoreCase ? 'i' : '');
        } catch (e) {
            stderr.write(`grep: invalid regular expression: ${e.message}\n`);
            return 1;
        }

        const processText = (text, prefix = '') => {
            const lines = text.split('\n');
            let matchCount = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const matches = regex.test(line);
                const shouldPrint = invertMatch ? !matches : matches;

                if (shouldPrint) {
                    matchCount++;
                    if (!countOnly) {
                        let out = prefix;
                        if (showLineNumbers) out += `\x1b[32m${i + 1}\x1b[0m:`;
                        
                        // Highlight match in red if not inverted
                        if (!invertMatch) {
                            const highlighted = line.replace(regex, m => `\x1b[1;31m${m}\x1b[0m`);
                            out += highlighted;
                        } else {
                            out += line;
                        }
                        stdout.write(out + '\n');
                    }
                }
            }

            if (countOnly) {
                stdout.write((prefix ? `${prefix}` : '') + matchCount + '\n');
            }

            return matchCount > 0 ? 0 : 1;
        };

        if (files.length === 0) {
            return processText(stdin || '');
        }

        const fs = this.getFs();
        let anyMatched = false;

        for (let file of files) {
            const resolved = env.resolvePath(file);
            const content = await fs.readFile(resolved);
            if (content === null) {
                stderr.write(`grep: ${file}: No such file or directory\n`);
                continue;
            }
            const prefix = files.length > 1 ? `\x1b[35m${file}\x1b[0m:` : '';
            const code = processText(content, prefix);
            if (code === 0) anyMatched = true;
        }

        return anyMatched ? 0 : 1;
    }

    async find(args, stdin, stdout, stderr, env) {
        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('find: filesystem not ready\n');
            return 1;
        }

        let target = '.';
        let namePattern = null;
        let typeFilter = null;
        let maxDepth = 10;

        for (let i = 1; i < args.length; i++) {
            if (args[i] === '-name' && args[i + 1]) {
                namePattern = args[i + 1];
                i++;
            } else if (args[i] === '-type' && args[i + 1]) {
                typeFilter = args[i + 1];
                i++;
            } else if (args[i] === '-maxdepth' && args[i + 1]) {
                maxDepth = parseInt(args[i + 1], 10) || 10;
                i++;
            } else if (!args[i].startsWith('-')) {
                target = args[i];
            }
        }

        const resolved = env.resolvePath(target);
        
        const walk = async (dirPath, depth) => {
            if (depth > maxDepth) return;
            const entries = await fs.list(dirPath);
            if (!entries) return;

            for (let entry of entries) {
                const fullPath = dirPath === '/' ? `/${entry.name}` : `${dirPath}/${entry.name}`;
                let matchesName = true;
                if (namePattern) {
                    matchesName = ShellParser.matchGlob(namePattern, entry.name);
                }
                let matchesType = true;
                if (typeFilter === 'f') matchesType = entry.kind === 'file';
                if (typeFilter === 'd') matchesType = entry.kind === 'directory';

                if (matchesName && matchesType) {
                    stdout.write(fullPath + '\n');
                }

                if (entry.kind === 'directory') {
                    await walk(fullPath, depth + 1);
                }
            }
        };

        stdout.write(resolved + '\n');
        await walk(resolved, 1);
        return 0;
    }

    async sort(args, stdin, stdout, stderr, env) {
        let reverse = false;
        let numeric = false;
        let unique = false;
        const files = [];

        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (arg.startsWith('-')) {
                if (arg.includes('r')) reverse = true;
                if (arg.includes('n')) numeric = true;
                if (arg.includes('u')) unique = true;
            } else {
                files.push(arg);
            }
        }

        let content = stdin || '';
        if (files.length > 0) {
            const fs = this.getFs();
            content = '';
            for (let file of files) {
                const resolved = env.resolvePath(file);
                const text = await fs.readFile(resolved);
                if (text !== null) content += text + '\n';
            }
        }

        let lines = content.split('\n').filter(l => l.length > 0);
        if (unique) {
            lines = Array.from(new Set(lines));
        }

        lines.sort((a, b) => {
            if (numeric) {
                return (parseFloat(a) || 0) - (parseFloat(b) || 0);
            }
            return a.localeCompare(b);
        });

        if (reverse) lines.reverse();
        stdout.write(lines.join('\n') + '\n');
        return 0;
    }

    async uniq(args, stdin, stdout, stderr, env) {
        let count = false;
        let duplicatesOnly = false;
        let uniqueOnly = false;

        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (arg === '-c') count = true;
            if (arg === '-d') duplicatesOnly = true;
            if (arg === '-u') uniqueOnly = true;
        }

        const lines = (stdin || '').split('\n').filter(l => l.length > 0);
        let last = null;
        let tally = 0;

        const emit = (val, cnt) => {
            if (duplicatesOnly && cnt <= 1) return;
            if (uniqueOnly && cnt > 1) return;
            if (count) {
                stdout.write(`${String(cnt).padStart(7, ' ')} ${val}\n`);
            } else {
                stdout.write(val + '\n');
            }
        };

        for (let line of lines) {
            if (line === last) {
                tally++;
            } else {
                if (last !== null) emit(last, tally);
                last = line;
                tally = 1;
            }
        }
        if (last !== null) emit(last, tally);
        return 0;
    }

    async diff(args, stdin, stdout, stderr, env) {
        if (args.length < 3) {
            stderr.write('diff: missing operand\n');
            return 1;
        }

        const fs = this.getFs();
        const f1 = await fs.readFile(env.resolvePath(args[1]));
        const f2 = await fs.readFile(env.resolvePath(args[2]));

        if (f1 === null || f2 === null) {
            stderr.write('diff: file not found\n');
            return 1;
        }

        const lines1 = f1.split('\n');
        const lines2 = f2.split('\n');
        const max = Math.max(lines1.length, lines2.length);
        let hasDiff = false;

        for (let i = 0; i < max; i++) {
            const l1 = lines1[i];
            const l2 = lines2[i];
            if (l1 !== l2) {
                hasDiff = true;
                if (l1 !== undefined) stdout.write(`\x1b[31m< ${l1}\x1b[0m\n`);
                if (l2 !== undefined) stdout.write(`\x1b[32m> ${l2}\x1b[0m\n`);
            }
        }

        return hasDiff ? 1 : 0;
    }

    async echo(args, stdin, stdout, stderr, env) {
        let noNewline = false;
        let enableEscapes = false;
        let words = [];

        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            if (arg === '-n') noNewline = true;
            else if (arg === '-e') enableEscapes = true;
            else words.push(arg);
        }

        let out = words.join(' ');
        if (enableEscapes || out.includes('\\n') || out.includes('\\t')) {
            out = out.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
        }

        stdout.write(out + (noNewline ? '' : '\n'));
        return 0;
    }

    async printf(args, stdin, stdout, stderr, env) {
        if (args.length < 2) return 0;
        let fmt = args[1];
        let vals = args.slice(2);
        let formatted = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        
        let vi = 0;
        formatted = formatted.replace(/%[sdi]/g, (match) => {
            return vals[vi++] || '';
        });

        stdout.write(formatted);
        return 0;
    }

    // ─── Shell Builtins ─────────────────────────────────────────

    async export(args, stdin, stdout, stderr, env) {
        if (args.length === 1) {
            const all = env.getAll();
            for (let [k, v] of Object.entries(all)) {
                stdout.write(`declare -x ${k}="${v}"\n`);
            }
            return 0;
        }
        for (let i = 1; i < args.length; i++) {
            const parts = args[i].split('=');
            if (parts.length >= 2) {
                const k = parts[0];
                const v = parts.slice(1).join('=');
                env.set(k, v);
            }
        }
        return 0;
    }

    async env(args, stdin, stdout, stderr, env) {
        const all = env.getAll();
        for (let [k, v] of Object.entries(all)) {
            stdout.write(`${k}=${v}\n`);
        }
        return 0;
    }

    async alias(args, stdin, stdout, stderr, env) {
        if (args.length === 1) {
            for (let [name, cmd] of Object.entries(env.aliases)) {
                stdout.write(`alias ${name}='${cmd}'\n`);
            }
            return 0;
        }
        for (let i = 1; i < args.length; i++) {
            const parts = args[i].split('=');
            if (parts.length >= 2) {
                env.setAlias(parts[0], parts.slice(1).join('='));
            }
        }
        return 0;
    }

    async which(args, stdin, stdout, stderr, env) {
        if (args.length < 2) return 1;
        const cmd = args[1];
        if (env.getAlias(cmd)) {
            stdout.write(`${cmd}: aliased to ${env.getAlias(cmd)}\n`);
            return 0;
        }
        if (typeof this[cmd] === 'function') {
            stdout.write(`${cmd}: shell built-in command\n`);
            return 0;
        }
        stderr.write(`${cmd} not found\n`);
        return 1;
    }

    async history(args, stdin, stdout, stderr, env) {
        if (args[1] === '-c') {
            env.clearHistory();
            return 0;
        }
        const hist = env.getHistory();
        for (let i = 0; i < hist.length; i++) {
            stdout.write(`${String(i + 1).padStart(5, ' ')}  ${hist[i]}\n`);
        }
        return 0;
    }

    async clear(args, stdin, stdout, stderr, env) {
        stdout.write('\x1b[2J\x1b[H');
        return 0;
    }

    async true(args, stdin, stdout, stderr, env) { return 0; }
    async false(args, stdin, stdout, stderr, env) { return 1; }

    // ─── BrowOS GUI Integration ─────────────────────────────────

    async open(args, stdin, stdout, stderr, env) {
        if (args.length < 2) {
            stderr.write('open: missing file operand\n');
            return 1;
        }
        const fs = this.getFs();
        const wm = window.windowManager;
        if (!fs || !wm) {
            stderr.write('open: window manager or filesystem not available\n');
            return 1;
        }

        for (let i = 1; i < args.length; i++) {
            const resolved = env.resolvePath(args[i]);
            const stat = await this.getStat(resolved);
            if (!stat) {
                stderr.write(`open: cannot find '${args[i]}'\n`);
                continue;
            }

            if (stat.type === 'directory') {
                if (typeof wm.launchApp === 'function') {
                    wm.launchApp('FileBrow');
                }
            } else {
                const ext = '.' + resolved.split('.').pop().toLowerCase();
                if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
                    if (typeof wm.launchApp === 'function') wm.launchApp('Brow Music');
                } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
                    if (typeof wm.openPhoto === 'function') wm.openPhoto(resolved);
                } else {
                    if (typeof wm.openFileInBrowNote === 'function') {
                        wm.openFileInBrowNote(resolved);
                    }
                }
            }
            stdout.write(`Opened ${args[i]}\n`);
        }
        return 0;
    }

    async apps(args, stdin, stdout, stderr, env) {
        const apps = window.appsManager?.apps || [
            { name: 'FileBrow', description: 'File Manager' },
            { name: 'Brow Note', description: 'Text & Code Editor' },
            { name: 'Brow Music', description: 'Audio Player' },
            { name: 'Settings', description: 'System Configuration' },
            { name: 'Terminal', description: 'BrowShell CLI' }
        ];

        stdout.write('\x1b[1mInstalled Applications:\x1b[0m\n');
        for (let app of apps) {
            stdout.write(`  \x1b[32m${app.name.padEnd(16, ' ')}\x1b[0m ${app.description || ''}\n`);
        }
        return 0;
    }

    async launch(args, stdin, stdout, stderr, env) {
        if (args.length < 2) {
            stderr.write('launch: missing app name\n');
            return 1;
        }
        const appName = args.slice(1).join(' ');
        if (window.windowManager && typeof window.windowManager.launchApp === 'function') {
            window.windowManager.launchApp(appName);
            stdout.write(`Launched ${appName}\n`);
            return 0;
        }
        stderr.write('launch: window manager unavailable\n');
        return 1;
    }

    async df(args, stdin, stdout, stderr, env) {
        const fs = this.getFs();
        const human = args.includes('-h');
        let used = 0;
        if (fs && fs.isReady()) {
            used = await fs.getStorageUsed();
        }
        const total = 10 * 1024 * 1024 * 1024;
        const free = Math.max(0, total - used);

        const fmt = (bytes) => human ? fs.formatBytes(bytes).padStart(9, ' ') : String(Math.round(bytes / 1024)).padStart(10, ' ');

        stdout.write(`Filesystem            ${human ? 'Size' : '1K-blocks'}      Used     Avail  Use% Mounted on\n`);
        stdout.write(`browos:local         ${fmt(total)} ${fmt(used)} ${fmt(free)}   ${Math.round((used/total)*100)}% /\n`);
        return 0;
    }

    async free(args, stdin, stdout, stderr, env) {
        const human = args.includes('-h') || args.includes('-m');
        const mem = window.performance?.memory;
        const used = mem ? mem.usedJSHeapSize : 32 * 1024 * 1024;
        const total = mem ? mem.totalJSHeapSize : 64 * 1024 * 1024;
        const devRam = (navigator.deviceMemory || 8) * 1024 * 1024 * 1024;

        const fmt = (b) => human ? `${Math.round(b / (1024 * 1024))}M` : String(Math.round(b / 1024));

        stdout.write(`               total        used        free      shared  buff/cache   available\n`);
        stdout.write(`Mem:      ${fmt(devRam).padStart(10, ' ')}  ${fmt(used).padStart(10, ' ')}  ${fmt(total - used).padStart(10, ' ')}          0M        128M  ${fmt(devRam - used).padStart(10, ' ')}\n`);
        stdout.write(`Heap:     ${fmt(total).padStart(10, ' ')}  ${fmt(used).padStart(10, ' ')}  ${fmt(total - used).padStart(10, ' ')}\n`);
        return 0;
    }

    async ps(args, stdin, stdout, stderr, env) {
        const wm = window.windowManager;
        stdout.write('  PID TTY          TIME CMD\n');
        stdout.write('    1 tty1     00:00:01 browos-init\n');
        stdout.write('    2 tty1     00:00:00 browsh\n');
        if (wm && Array.isArray(wm.windows)) {
            wm.windows.forEach((w, idx) => {
                const pid = 100 + idx;
                stdout.write(`${String(pid).padStart(5, ' ')} tty1     00:00:00 ${w.title || 'App'}\n`);
            });
        }
        return 0;
    }

    async kill(args, stdin, stdout, stderr, env) {
        if (args.length < 2) {
            stderr.write('kill: missing pid\n');
            return 1;
        }
        const pid = parseInt(args[1], 10);
        const wm = window.windowManager;
        if (wm && Array.isArray(wm.windows)) {
            const idx = pid - 100;
            if (wm.windows[idx]) {
                wm.closeWindow(wm.windows[idx].id);
                stdout.write(`Terminated process ${pid}\n`);
                return 0;
            }
        }
        stderr.write(`kill: (${args[1]}) - No such process\n`);
        return 1;
    }

    async uptime(args, stdin, stdout, stderr, env) {
        const bootTime = parseInt(sessionStorage.getItem('browos_boot_time') || Date.now(), 10);
        const diff = Math.max(0, Date.now() - bootTime);
        const secs = Math.floor((diff / 1000) % 60);
        const mins = Math.floor((diff / (1000 * 60)) % 60);
        const hrs = Math.floor(diff / (1000 * 60 * 60));
        stdout.write(`up ${hrs} hours, ${mins} minutes, ${secs} seconds\n`);
        return 0;
    }

    async whoami(args, stdin, stdout, stderr, env) {
        stdout.write(env.get('USER', 'user') + '\n');
        return 0;
    }

    async uname(args, stdin, stdout, stderr, env) {
        if (args.includes('-a')) {
            stdout.write('BrowOS 5.0.0-browos x86_64 WebAssembly GNU/Linux\n');
        } else {
            stdout.write('BrowOS\n');
        }
        return 0;
    }

    async export(args, stdin, stdout, stderr, env) {
        if (args.length === 1) {
            const all = env.getAll ? env.getAll() : {};
            for (const [k, v] of Object.entries(all)) {
                stdout.write(`export ${k}="${v}"\n`);
            }
            return 0;
        }
        for (let i = 1; i < args.length; i++) {
            const arg = args[i];
            const eqIdx = arg.indexOf('=');
            if (eqIdx !== -1) {
                const key = arg.slice(0, eqIdx).trim().replace(/^\$/, '');
                const val = arg.slice(eqIdx + 1).replace(/^["']|["']$/g, '');
                if (env && typeof env.set === 'function') {
                    env.set(key, val);
                }
            }
        }
        return 0;
    }

    async unset(args, stdin, stdout, stderr, env) {
        for (let i = 1; i < args.length; i++) {
            if (env && typeof env.unset === 'function') {
                env.unset(args[i]);
            }
        }
        return 0;
    }

    async env(args, stdin, stdout, stderr, env) {
        const all = env && typeof env.getAll === 'function' ? env.getAll() : {};
        for (const [k, v] of Object.entries(all)) {
            stdout.write(`${k}=${v}\n`);
        }
        return 0;
    }

    // ─── Networking ─────────────────────────────────────────────

    async _fetchNetwork(targetUrl, options = {}) {
        let fetchUrl = targetUrl;
        const isAbsolute = /^https?:\/\//i.test(targetUrl);
        const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
        const isExternal = isAbsolute && (!origin || !targetUrl.startsWith(origin));

        const headers = { ...(options.headers || {}) };
        if (isExternal) {
            headers['X-Raw-Response'] = 'true';
            fetchUrl = `/__proxy__/${encodeURIComponent(targetUrl)}`;
        }

        let res;
        try {
            res = await fetch(fetchUrl, {
                ...options,
                headers
            });
        } catch (e) {
            const err = new Error(e.message || 'Network request failed');
            err.curlCode = 6;
            throw err;
        }

        const proxyErr = res.headers.get('X-Proxy-Error');
        if (proxyErr) {
            let host = '';
            try {
                host = new URL(targetUrl).hostname;
            } catch (_) {
                host = targetUrl;
            }

            if (proxyErr === 'ENOTFOUND') {
                const err = new Error(`Could not resolve host: ${host}`);
                err.curlCode = 6;
                throw err;
            } else if (proxyErr === 'ECONNREFUSED') {
                const err = new Error(`Failed to connect to ${host}: Connection refused`);
                err.curlCode = 7;
                throw err;
            } else if (proxyErr === 'ETIMEDOUT') {
                const err = new Error(`Connection timed out after waiting for ${host}`);
                err.curlCode = 28;
                throw err;
            } else {
                const errText = await res.text().catch(() => '');
                const err = new Error(errText || `Proxy error: ${proxyErr}`);
                err.curlCode = 6;
                throw err;
            }
        }

        return res;
    }

    async curl(args, stdin, stdout, stderr, env) {
        // Sanitize arguments: remove lone backslashes, empty/whitespace items, and accidental duplicate 'curl'
        const cleanArgs = [];
        for (const a of args) {
            const trimmed = typeof a === 'string' ? a.trim() : a;
            if (trimmed && trimmed !== '\\') {
                cleanArgs.push(trimmed);
            }
        }
        if (cleanArgs.length > 2 && cleanArgs[1].toLowerCase() === 'curl') {
            cleanArgs.splice(1, 1);
        }

        let url = null;
        let method = 'GET';
        let headers = {};
        let data = null;
        let outFile = null;
        let showHeaders = false;
        let silent = false;

        for (let i = 1; i < cleanArgs.length; i++) {
            const arg = cleanArgs[i];
            if (arg === '-s' || arg === '--silent') silent = true;
            else if (arg === '-i' || arg === '--include') showHeaders = true;
            else if ((arg === '-o' || arg === '--output') && cleanArgs[i + 1]) { outFile = cleanArgs[i + 1]; i++; }
            else if ((arg === '-X' || arg === '--request') && cleanArgs[i + 1]) { method = cleanArgs[i + 1].toUpperCase(); i++; }
            else if ((arg === '-d' || arg === '--data' || arg === '--data-raw') && cleanArgs[i + 1]) {
                data = cleanArgs[i + 1];
                if (method === 'GET') method = 'POST';
                i++;
            } else if ((arg === '-H' || arg === '--header') && cleanArgs[i + 1]) {
                const headerVal = cleanArgs[i + 1];
                const colonIdx = headerVal.indexOf(':');
                if (colonIdx !== -1) {
                    const hKey = headerVal.slice(0, colonIdx).trim();
                    const hVal = headerVal.slice(colonIdx + 1).trim();
                    headers[hKey] = hVal;
                }
                i++;
            } else if (!arg.startsWith('-')) {
                // If url not set yet or this token is explicitly an HTTP(S) URL, adopt it
                if (!url || /^https?:\/\//i.test(arg)) {
                    url = arg;
                }
            }
        }

        if (!url || !url.trim()) {
            stderr.write('curl: no URL specified\n');
            return 1;
        }

        url = url.trim();

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        try {
            if (!silent) stderr.write(`\x1b[36mConnecting to ${url}...\x1b[0m\n`);
            const fetchOpts = {
                method,
                headers
            };
            if (data !== null) {
                fetchOpts.body = data;
                if (!headers['Content-Type'] && !headers['content-type']) {
                    fetchOpts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }
            }

            const res = await this._fetchNetwork(url, fetchOpts);

            if (showHeaders) {
                stdout.write(`HTTP/1.1 ${res.status} ${res.statusText || ''}\n`);
                res.headers.forEach((val, key) => {
                    stdout.write(`${key}: ${val}\n`);
                });
                stdout.write('\n');
            }

            const text = await res.text();
            if (outFile) {
                const fs = this.getFs();
                if (fs) {
                    await fs.createFile(env.resolvePath(outFile), text);
                    if (!silent) stdout.write(`Saved to ${outFile}\n`);
                }
            } else {
                const contentType = (res.headers.get('content-type') || '').toLowerCase();
                const isTextual = !contentType || /^(text\/|application\/(json|javascript|xml|x-yaml|yaml|toml|sql|sh|xhtml))/i.test(contentType);
                if (!isTextual && /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 512))) {
                    stdout.write(`\x1b[33mWarning: Binary output can mess up your terminal. Use -o <filename> to save to a file.\x1b[0m\n[Received ${text.length} bytes of binary data (${contentType || 'application/octet-stream'})]\n`);
                } else {
                    stdout.write(text);
                    if (!text.endsWith('\n')) stdout.write('\n');
                }
            }
            return res.ok ? 0 : 1;
        } catch (e) {
            stderr.write(`curl: (${e.curlCode || 6}) ${e.message}\n`);
            return 1;
        }
    }

    async ping(args, stdin, stdout, stderr, env) {
        if (args.length < 2) {
            stderr.write('ping: missing host\n');
            return 1;
        }
        let host = args[1].replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        stdout.write(`PING ${host} (HTTP latency test):\n`);

        for (let i = 1; i <= 4; i++) {
            const start = performance.now();
            try {
                await this._fetchNetwork(`https://${host}`, { method: 'HEAD' });
                const time = (performance.now() - start).toFixed(1);
                stdout.write(`64 bytes from ${host}: seq=${i} time=${time} ms\n`);
            } catch (e) {
                stdout.write(`Request timeout for seq ${i}\n`);
            }
        }
        return 0;
    }

    async getnet(args, stdin, stdout, stderr, env) {
        if (args.length < 2) {
            stderr.write('getnet: usage: getnet <url> [output-filename]\n');
            return 1;
        }
        let url = args[1];
        let filename = args[2];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        if (!filename) {
            try {
                filename = new URL(url).pathname.split('/').filter(Boolean).pop() || 'downloaded_file';
            } catch (_) {
                filename = url.split('/').pop().split('?')[0] || 'downloaded_file';
            }
        }

        try {
            stderr.write(`\x1b[36mDownloading ${url}...\x1b[0m\n`);
            const res = await this._fetchNetwork(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ''}`);
            const text = await res.text();
            const fs = this.getFs();
            if (fs) {
                const dest = env.resolvePath(filename);
                await fs.createFile(dest, text);
                stdout.write(`\x1b[32mSuccessfully downloaded ${filename} (${fs.formatBytes ? fs.formatBytes(text.length) : text.length + ' bytes'})\x1b[0m\n`);
                return 0;
            }
            stderr.write('getnet: filesystem unavailable\n');
            return 1;
        } catch (e) {
            stderr.write(`getnet: download failed: ${e.message}\n`);
            return 1;
        }
    }

    // ─── Compilers & Language Runtimes ──────────────────────────

    async js(args, stdin, stdout, stderr, env) {
        return await this.node(args, stdin, stdout, stderr, env);
    }

    async node(args, stdin, stdout, stderr, env) {
        const JsRuntime = (typeof window !== 'undefined' ? window.JsRuntime : null) || (typeof require !== 'undefined' ? require('./runtimes.js').JsRuntime : null);
        if (!JsRuntime) {
            stderr.write('node: JavaScript runtime not loaded\n');
            return 1;
        }

        if (args.length === 1) {
            stdout.write('Use interactive "node" command in terminal for REPL\n');
            return 0;
        }

        if (args[1] === '-e') {
            const code = args.slice(2).join(' ');
            const res = await JsRuntime.executeCode(code, stdout, stderr, env);
            if (res.ok && res.result !== undefined) {
                stdout.write(JsRuntime.formatResult(res.result) + '\n');
            }
            return res.ok ? 0 : 1;
        }

        // Execute file
        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('node: filesystem not ready\n');
            return 1;
        }

        const filePath = env.resolvePath(args[1]);
        const content = await fs.readFile(filePath);
        if (content === null) {
            stderr.write(`node: cannot find module '${args[1]}'\n`);
            return 1;
        }

        const res = await JsRuntime.executeCode(content, stdout, stderr, env);
        return res.ok ? 0 : 1;
    }

    async python(args, stdin, stdout, stderr, env) {
        const PythonRuntime = (typeof window !== 'undefined' ? window.PythonRuntime : null) || (typeof require !== 'undefined' ? require('./runtimes.js').PythonRuntime : null);
        if (!PythonRuntime) {
            stderr.write('python: Python runtime not loaded\n');
            return 1;
        }

        if (args.length === 1) {
            stdout.write('Use interactive "python" command in terminal for REPL\n');
            return 0;
        }

        if (args[1] === '-c') {
            const code = args.slice(2).join(' ');
            const res = await PythonRuntime.executeCode(code, stdout, stderr, env);
            return res.ok ? 0 : 1;
        }

        // Execute file
        const fs = this.getFs();
        const filePath = env.resolvePath(args[1]);
        const content = fs && fs.isReady() ? await fs.readFile(filePath) : null;
        if (content === null) {
            stderr.write(`python: can't open file '${args[1]}': [Errno 2] No such file or directory\n`);
            return 1;
        }

        const res = await PythonRuntime.executeCode(content, stdout, stderr, env);
        return res.ok ? 0 : 1;
    }

    async python3(args, stdin, stdout, stderr, env) {
        return await this.python(args, stdin, stdout, stderr, env);
    }

    async sqlite3(args, stdin, stdout, stderr, env) {
        const SqliteRuntime = (typeof window !== 'undefined' ? window.SqliteRuntime : null) || (typeof require !== 'undefined' ? require('./runtimes.js').SqliteRuntime : null);
        if (!SqliteRuntime) {
            stderr.write('sqlite3: SQLite runtime not loaded\n');
            return 1;
        }

        if (args.length < 3) {
            stdout.write('Usage: sqlite3 <database.db> "<query>" (or run "sqlite3 <db>" directly for interactive prompt)\n');
            return 0;
        }

        const dbPath = args[1];
        const query = args.slice(2).join(' ');
        return await SqliteRuntime.executeQuery(dbPath, query, stdout, stderr, env);
    }

    async sh(args, stdin, stdout, stderr, env) {
        const Runner = (typeof window !== 'undefined' ? window.ShellScriptRunner : null) || (typeof require !== 'undefined' ? require('./scripting.js').ShellScriptRunner : null);
        if (!Runner) {
            stderr.write('sh: ShellScriptRunner not loaded\n');
            return 1;
        }

        if (args.length === 1) {
            stdout.write('BrowOS POSIX sh (Phase 3). Run "sh <script.sh>" or "sh -c <cmd>"\n');
            return 0;
        }

        if (args[1] === '-c') {
            const cmd = args.slice(2).join(' ');
            return await Runner.executeScript(cmd, [], stdout, stderr, env, this.engine, true);
        }

        const scriptPath = args[1];
        const scriptArgs = args.slice(2);
        return await Runner.dispatch(scriptPath, scriptArgs, stdout, stderr, env, this.engine);
    }

    async bash(args, stdin, stdout, stderr, env) {
        return await this.sh(args, stdin, stdout, stderr, env);
    }

    async source(args, stdin, stdout, stderr, env) {
        if (args.length < 2) {
            stderr.write('source: filename argument required\n');
            return 2;
        }

        const Runner = (typeof window !== 'undefined' ? window.ShellScriptRunner : null) || (typeof require !== 'undefined' ? require('./scripting.js').ShellScriptRunner : null);
        const fs = this.getFs();
        if (!fs || !fs.isReady()) {
            stderr.write('source: filesystem unavailable\n');
            return 1;
        }

        const resolved = env.resolvePath(args[1]);
        const content = await fs.readFile(resolved);
        if (content === null || content === undefined) {
            stderr.write(`source: ${args[1]}: No such file or directory\n`);
            return 1;
        }

        return await Runner.executeScript(content, args.slice(2), stdout, stderr, env, this.engine, true, args[1]);
    }

    async '.'(args, stdin, stdout, stderr, env) {
        return await this.source(args, stdin, stdout, stderr, env);
    }

    async test(args, stdin, stdout, stderr, env) {
        const Tester = (typeof window !== 'undefined' ? window.ShellConditionTester : null) || (typeof require !== 'undefined' ? require('./scripting.js').ShellConditionTester : null);
        if (!Tester) return 1;
        return await Tester.evaluate(args.slice(1), env, this.getFs());
    }

    async '['(args, stdin, stdout, stderr, env) {
        const Tester = (typeof window !== 'undefined' ? window.ShellConditionTester : null) || (typeof require !== 'undefined' ? require('./scripting.js').ShellConditionTester : null);
        if (!Tester) return 1;
        return await Tester.evaluate(args, env, this.getFs());
    }

    async theme(args, stdin, stdout, stderr, env) {
        const targetTheme = args[1];
        if (typeof window !== 'undefined' && window.TerminalThemes) {
            const themes = Object.keys(window.TerminalThemes);
            if (!targetTheme || targetTheme === 'list') {
                stdout.write('\x1b[1mAvailable Terminal Themes:\x1b[0m\n');
                themes.forEach(t => {
                    const info = window.TerminalThemes[t];
                    stdout.write(`  \x1b[36m${t.padEnd(12)}\x1b[0m - ${info.name}\n`);
                });
                stdout.write('\nUsage: theme <name> (e.g. theme dracula)\n');
                return 0;
            }

            const clean = targetTheme.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (window.TerminalThemes[clean]) {
                if (window.BrowShell && typeof window.BrowShell.setGlobalTheme === 'function') {
                    window.BrowShell.setGlobalTheme(clean);
                    stdout.write(`\x1b[32mApplied theme: ${window.TerminalThemes[clean].name}\x1b[0m\n`);
                    return 0;
                }
            } else {
                stderr.write(`theme: unknown theme '${targetTheme}'. Run 'theme list' to see available options.\n`);
                return 1;
            }
        } else {
            stdout.write('Themes: dracula, onedark, monokai, solarized, matrix, glass\n');
            return 0;
        }
    }

    async code(args, stdin, stdout, stderr, env) {
        const fileTarget = args[1];
        if (typeof window !== 'undefined' && window.windowManager) {
            let fullPath = '/Desktop';
            if (fileTarget && fileTarget !== '.') {
                fullPath = env ? env.resolvePath(fileTarget) : fileTarget;
            } else if (env) {
                fullPath = env.getCwd();
            }

            if (typeof window.windowManager.openFileInCodeBrow === 'function') {
                window.windowManager.openFileInCodeBrow(fullPath);
                stdout.write(`Opening ${fullPath} in CodeBrow...\n`);
                return 0;
            }
        }
        stdout.write(`CodeBrow launched for ${fileTarget || '.'}\n`);
        return 0;
    }

    async codebrow(args, stdin, stdout, stderr, env) {
        return this.code(args, stdin, stdout, stderr, env);
    }

    async jq(args, stdin, stdout, stderr, env) {
        let compact = false;
        let raw = false;
        let filter = '.';
        let filePath = null;

        for (let i = 1; i < args.length; i++) {
            const a = args[i];
            if (a === '-c' || a === '--compact-output') compact = true;
            else if (a === '-r' || a === '--raw-output') raw = true;
            else if (!filter || filter === '.') filter = a;
            else if (!filePath) filePath = a;
        }

        let inputJson = '';
        if (filePath) {
            const fs = this.getFs();
            if (!fs || !fs.isReady()) {
                stderr.write('jq: filesystem not ready\n');
                return 1;
            }
            const resolved = env ? env.resolvePath(filePath) : filePath;
            const content = await fs.readFile(resolved);
            if (content === null || content === undefined) {
                stderr.write(`jq: ${filePath}: No such file or directory\n`);
                return 1;
            }
            inputJson = content;
        } else if (stdin) {
            if (typeof stdin.readAll === 'function') {
                inputJson = await stdin.readAll();
            } else if (typeof stdin.read === 'function') {
                inputJson = await stdin.read();
            } else if (typeof stdin === 'string') {
                inputJson = stdin;
            }
        }

        if (!inputJson || !inputJson.trim()) {
            stderr.write('jq: error: missing input JSON\nUsage: jq [options] <filter> [file.json]\n');
            return 1;
        }

        let parsed;
        try {
            parsed = JSON.parse(inputJson.trim());
        } catch (e) {
            stderr.write(`jq: parse error: Invalid JSON syntax (${e.message})\n`);
            return 2;
        }

        try {
            let current = [parsed];
            if (filter && filter !== '.') {
                const tokens = filter.split(/(?=\.)|(?=\[)/).map(s => s.trim()).filter(Boolean);
                for (const token of tokens) {
                    let next = [];
                    for (const item of current) {
                        if (item === null || item === undefined) continue;
                        if (token.startsWith('.')) {
                            const prop = token.slice(1);
                            if (prop === 'keys') {
                                next.push(Object.keys(item));
                            } else if (prop === 'length') {
                                next.push(Array.isArray(item) ? item.length : (typeof item === 'object' ? Object.keys(item).length : String(item).length));
                            } else if (prop === '') {
                                next.push(item);
                            } else {
                                next.push(item[prop]);
                            }
                        } else if (token.startsWith('[')) {
                            const inside = token.slice(1, -1).trim();
                            if (inside === '') {
                                if (Array.isArray(item)) next.push(...item);
                                else if (typeof item === 'object') next.push(...Object.values(item));
                            } else if (inside.includes(':')) {
                                const [start, end] = inside.split(':').map(x => x ? parseInt(x) : undefined);
                                if (Array.isArray(item)) next.push(item.slice(start, end));
                            } else {
                                const idx = parseInt(inside);
                                if (Array.isArray(item) && !isNaN(idx)) next.push(item[idx]);
                                else if (item && item[inside] !== undefined) next.push(item[inside]);
                            }
                        }
                    }
                    current = next;
                }
            }

            for (const val of current) {
                if (raw && typeof val === 'string') {
                    stdout.write(val + '\n');
                } else if (val === undefined) {
                    stdout.write('\x1b[2mnull\x1b[0m\n');
                } else {
                    const formatted = compact ? JSON.stringify(val) : JSON.stringify(val, null, 2);
                    const colorized = formatted.replace(
                        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"\n])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,
                        (match, str, esc, isKey, boolOrNull) => {
                            if (str) {
                                if (isKey) return '\x1b[36m' + str + '\x1b[0m:';
                                return '\x1b[32m' + str + '\x1b[0m';
                            }
                            if (boolOrNull) {
                                if (boolOrNull === 'null') return '\x1b[2mnull\x1b[0m';
                                return '\x1b[35m' + boolOrNull + '\x1b[0m';
                            }
                            return '\x1b[33m' + match + '\x1b[0m';
                        }
                    );
                    stdout.write(colorized + '\n');
                }
            }
            return 0;
        } catch (err) {
            stderr.write(`jq: filter error: ${err.message}\n`);
            return 3;
        }
    }

    async help(args, stdin, stdout, stderr, env) {
        stdout.write('\x1b[1;36mBrowShell POSIX CLI v5.0 (Native Browser Engine)\x1b[0m\n\n');
        stdout.write('\x1b[1mFilesystem & Navigation:\x1b[0m\n');
        stdout.write('  ls, cd, pwd, tree, stat, file\n\n');
        stdout.write('\x1b[1mFile Manipulation:\x1b[0m\n');
        stdout.write('  touch, mkdir, rm, cp, mv, cat, head, tail, wc\n\n');
        stdout.write('\x1b[1mSearch & Text Processing:\x1b[0m\n');
        stdout.write('  grep, jq, find, sort, uniq, diff, echo, printf\n\n');
        stdout.write('\x1b[1mShell Builtins & Environment:\x1b[0m\n');
        stdout.write('  export, env, alias, which, history, clear, true, false\n\n');
        stdout.write('\x1b[1mCompilers & Language Runtimes:\x1b[0m\n');
        stdout.write('  \x1b[32mnode\x1b[0m / \x1b[32mjs\x1b[0m, \x1b[33mpython\x1b[0m / \x1b[33mpython3\x1b[0m, \x1b[36msqlite3\x1b[0m\n\n');
        stdout.write('\x1b[1mBrowOS System & GUI Integration:\x1b[0m\n');
        stdout.write('  nano, open, apps, launch, df, free, ps, kill, uptime, whoami\n\n');
        stdout.write('\x1b[1mNetworking:\x1b[0m\n');
        stdout.write('  curl, ping, getnet\n\n');
        stdout.write('Pipelines (\x1b[33m|\x1b[0m), Redirections (\x1b[33m>\x1b[0m, \x1b[33m>>\x1b[0m, \x1b[33m<\x1b[0m), and Conditionals (\x1b[33m&&\x1b[0m, \x1b[33m||\x1b[0m, \x1b[33m;\x1b[0m) are fully supported!\n');
        return 0;
    }

    async gta(args, stdin, stdout, stderr, env) {
        const game = (typeof window !== 'undefined' && window.gta) ||
                     (typeof window !== 'undefined' && window.windowManager?.windows.find(w => w.appName === 'gta')?.element?.__gtaInstance);
        if (!game) {
            stderr.write('gta: Brow City is not running. Launch Brow City from the dock or run "launch gta".\n');
            return 1;
        }
        const sub = (args[1] || '').toLowerCase();
        if (!sub || sub === 'help') {
            stdout.write('\x1b[1;36mBrow City CLI Controls:\x1b[0m\n' +
                         '  \x1b[33mgta time <hour | noon | sunset | night | dawn | midnight>\x1b[0m - Set time of day\n' +
                         '  \x1b[33mgta advance [hours]\x1b[0m                                     - Advance time (default 3 hrs)\n' +
                         '  \x1b[33mgta status\x1b[0m                                              - Show current time & celestial phase\n' +
                         '  \x1b[33mgta aim [on|off]\x1b[0m                                        - Aim weapon with crosshairs\n' +
                         '  \x1b[33mgta shoot\x1b[0m                                               - Fire equipped weapon\n' +
                         '  \x1b[33mgta weapon [fist|bat|pistol|shotgun|smg|rifle|sniper]\x1b[0m   - Switch weapon\n' +
                         '  \x1b[33mgta buy <bat|pistol|shotgun|smg|rifle|sniper|armor|ammo>[0m - Buy from Ammu-Nation\n' +
                         '  \x1b[33mgta eat [hotdog|pizza|burger|espresso|pie][0m               - Eat food / restore health\n' +
                         '  \x1b[33mgta shops[0m                                               - List nearby Gun Shops & Food spots\n\n' +
                         '  \x1b[33mgta hospital\x1b[0m                                            - Teleport to Bellevue Hospital ER\n' +
                         '  \x1b[33mgta police\x1b[0m                                              - Teleport to NYPD 1st Precinct HQ\n' +
                         '  \x1b[33mgta heal\x1b[0m                                                - Full hospital triage treatment\n' +
                         '  \x1b[33mgta wanted [0-5]\x1b[0m                                        - Set wanted level stars\n' +
                         '  \x1b[33mgta talk\x1b[0m                                                - Talk to nearest citizen / staff\n');
            return 0;
        }
        if (sub === 'time') {
            const target = args[2] || 'noon';
            if (game.dayNight) {
                const t = game.dayNight.setTime(target);
                stdout.write(`\x1b[32m[Brow City] Time set to ${t.str} (${t.phase}) ${t.icon}\x1b[0m\n`);
                return 0;
            }
        }
        if (sub === 'advance') {
            const hrs = parseFloat(args[2]) || 3;
            if (game.dayNight) {
                const t = game.dayNight.advanceTime(hrs);
                stdout.write(`\x1b[32m[Brow City] Advanced ${hrs} hours -> ${t.str} (${t.phase}) ${t.icon}\x1b[0m\n`);
                return 0;
            }
        }
        if (sub === 'status') {
            if (game.dayNight) {
                const t = game.dayNight.getTime();
                const w = game.player ? game.player.weapon : 'none';
                const aiming = game.player ? (game.player.aiming ? 'AIMING' : 'Idle') : '—';
                stdout.write(`\x1b[36m[Brow City] Time: ${t.str} (${t.phase}) ${t.icon} · Weapon: ${w} · Mode: ${aiming}\x1b[0m\n`);
                return 0;
            }
        }
        if (sub === 'aim') {
            const mode = args[2] ? (args[2] === 'on' || args[2] === '1' || args[2] === 'true') : undefined;
            const res = typeof game.aim === 'function' ? game.aim(mode) : null;
            stdout.write(`\x1b[32m[Brow City] Aiming ${res && res.aiming ? 'ON (crosshairs active, holding ' + res.weapon + ')' : 'OFF'}\x1b[0m\n`);
            return 0;
        }
        if (sub === 'shoot') {
            if (typeof game.shoot === 'function') {
                const shot = game.shoot();
                stdout.write(`\x1b[32m[Brow City] Fired ${shot ? shot.weapon || shot.type : 'weapon'}!\x1b[0m\n`);
                return 0;
            }
        }
        if (sub === 'buy') {
            const item = (args[2] || '').toLowerCase();
            if (!item) {
                stdout.write('\x1b[1;33mAmmu-Nation Weapons & Gear:\x1b[0m\n' +
                             '  bat ($50) · pistol ($250) · shotgun ($800) · smg ($1200)\n' +
                             '  rifle ($3000) · sniper ($5000) · armor ($500) · ammo ($150)\n' +
                             'Usage: \x1b[36mgta buy <item>\x1b[0m\n');
                return 0;
            }
            const catalog = {
                'bat': { id: 'bat', name: 'Baseball Bat', type: 'melee', price: 50 },
                'pistol': { id: 'pistol', name: '9mm Pistol', type: 'firearm', price: 250, ammo: 30 },
                'shotgun': { id: 'shotgun', name: 'Shotgun', type: 'firearm', price: 800, ammo: 20 },
                'smg': { id: 'smg', name: 'Micro-SMG', type: 'firearm', price: 1200, ammo: 90 },
                'rifle': { id: 'rifle', name: 'Assault Rifle', type: 'firearm', price: 3000, ammo: 120 },
                'sniper': { id: 'sniper', name: 'Sniper Rifle', type: 'firearm', price: 5000, ammo: 30 },
                'armor': { id: 'armor', name: 'Kevlar Body Armor', type: 'armor', price: 500 },
                'ammo': { id: 'ammo', name: 'Ammo Pack', type: 'ammo', weapon: game.player ? game.player.weapon : 'pistol', ammo: 60, price: 150 },
            };
            const match = catalog[item];
            if (!match) {
                stderr.write('Unknown item "' + item + '". Run "gta buy" for catalog.\n');
                return 1;
            }
            game.buyGunShopItem(match);
            stdout.write(`\x1b[32m[Ammu-Nation] Acquired ${match.name}! Cash: ${game.player.money}\x1b[0m\n`);
            return 0;
        }
        if (sub === 'eat') {
            const food = (args[2] || 'hotdog').toLowerCase();
            const foods = {
                'hotdog': { name: "Nathan's Famous Hot Dog", price: 5, heal: 25, icon: '🌭' },
                'pizza': { name: 'NY Cheese Pizza Slice', price: 8, heal: 35, icon: '🍕' },
                'burger': { name: 'Deluxe Bacon Cheeseburger', price: 14, heal: 50, icon: '🍔' },
                'espresso': { name: 'Artisan Double Espresso', price: 5, heal: 22, type: 'drink', icon: '☕' },
                'pie': { name: "Grandma's Whole Pie", price: 30, heal: 100, icon: '🍕' },
            };
            const match = foods[food] || foods['hotdog'];
            game.eatFoodItem(match);
            stdout.write(`\x1b[32m[Food] Enjoyed ${match.name}! Health: ${Math.round(game.player.health)}% · Cash: ${game.player.money}\x1b[0m\n`);
            return 0;
        }
        if (sub === 'shops') {
            const p = game.player;
            const px = p ? p.pos.x : 0, pz = p ? p.pos.z : 0;
            stdout.write('\x1b[1;36m=== Brow City Explorable Shops & Establishments ===\x1b[0m\n');
            stdout.write('\x1b[1;31m[AMMU-NATION GUN SHOPS]\x1b[0m\n');
            for (const gs of (game.gunShops || [])) {
                const d = Math.round(Math.hypot(px - gs.cx, pz - gs.cz));
                stdout.write(`  • ${gs.name.padEnd(24)} (${Math.round(gs.cx)}, ${Math.round(gs.cz)}) ~ ${d}m away\n`);
            }
            stdout.write('\x1b[1;33m[RESTAURANTS & CAFES]\x1b[0m\n');
            for (const fs of (game.foodShops || [])) {
                const d = Math.round(Math.hypot(px - fs.cx, pz - fs.cz));
                stdout.write(`  • ${fs.name.padEnd(30)} (${Math.round(fs.cx)}, ${Math.round(fs.cz)}) ~ ${d}m away\n`);
            }
            const stallCount = (game.foodStalls || []).length;
            stdout.write(`\x1b[1;32m[STREET FOOD CARTS]\x1b[0m\n  ${stallCount} active vendor carts throughout Manhattan & Brooklyn sidewalks\n`);
            return 0;
        }
        if (sub === 'hospital') {
            if (game.player) {
                game.player.pos.set(1077.0, 0.2, 2212.0);
                game.player.heading = 0;
                game.player.camYaw = 0;
                stdout.write('\x1b[1;32m[Bellevue Hospital]\x1b[0m Teleported into Bellevue ER lobby! Walk up to triage desk or Dr. Mercer to receive medical treatment.\n');
                return 0;
            }
        }
        if (sub === 'police') {
            if (game.player) {
                game.player.pos.set(1028.0, 0.2, 3060.0);
                game.player.heading = 0;
                game.player.camYaw = 0;
                stdout.write('\x1b[1;34m[NYPD 1st Precinct]\x1b[0m Teleported into NYPD Precinct lobby! Walk up to Desk Sgt. Callahan to clear warrants or bail out.\n');
                return 0;
            }
        }
        if (sub === 'heal') {
            if (typeof game.interactHospital === 'function') {
                game.interactHospital();
            } else if (game.player) {
                game.player.health = 100;
                game.player.armor = 100;
                if (game.hud) { game.hud.setHealth(100); game.hud.setArmor(100); }
            }
            stdout.write('\x1b[32m[Bellevue ER] Player fully treated! Health: 100% · Armor: ' + Math.round(game.player.armor) + '%\x1b[0m\n');
            return 0;
        }
        if (sub === 'wanted') {
            const stars = parseInt(args[2] !== undefined ? args[2] : '1', 10);
            if (game.police) {
                game.police.wanted = Math.max(0, Math.min(5, stars));
                game.police.heat = 0;
                if (game.hud) game.hud.setWanted(game.police.wanted);
                if (game.police.wanted === 0 && game.police.cruisers) {
                    for (const c of game.police.cruisers) if (c.driver === 'ai') c.pursuit = false;
                }
            }
            stdout.write('\x1b[33m[NYPD Dispatch] Wanted level set to ' + stars + ' stars.\x1b[0m\n');
            return 0;
        }
        if (sub === 'talk') {
            if (game._nearHospitalStaff || game._nearHospitalTriage) {
                game.interactHospital(game._nearHospitalStaff);
                stdout.write('\x1b[32m[Interaction] Spoke with Bellevue ER medical staff!\x1b[0m\n');
                return 0;
            }
            if (game._nearPoliceDesk) {
                game.interactPoliceDesk();
                stdout.write('\x1b[34m[Interaction] Spoke with NYPD Desk Sergeant Callahan!\x1b[0m\n');
                return 0;
            }
            if (game._nearPoliceStaff) {
                game.interactPoliceOfficer(game._nearPoliceStaff);
                stdout.write('\x1b[34m[Interaction] Spoke with NYPD officer!\x1b[0m\n');
                return 0;
            }
            if (game._nearNpc) {
                game.interactNpc(game._nearNpc);
                stdout.write('\x1b[33m[Interaction] Spoke with nearby citizen!\x1b[0m\n');
                return 0;
            }
            let near = null, minDist = 8;
            if (game.peds && game.peds.renderer && game.peds.renderer.peds && game.player) {
                for (const p of game.peds.renderer.peds) {
                    const d = Math.hypot(game.player.pos.x - p.x, game.player.pos.z - p.z);
                    if (d < minDist) { minDist = d; near = p; }
                }
            }
            if (near) {
                game.interactNpc(near);
                stdout.write('\x1b[33m[Interaction] Spoke with nearby citizen (~' + Math.round(minDist) + 'm away)!\x1b[0m\n');
                return 0;
            }
            stdout.write('\x1b[33mNo pedestrians or staff nearby to talk with. Approach someone on the sidewalk!\x1b[0m\n');
            return 0;
        }
        if (sub === 'weapon') {
            const w = args[2] || 'pistol';
            if (typeof game.weapon === 'function') {
                const cur = game.weapon(w);
                stdout.write(`\x1b[32m[Brow City] Weapon equipped: ${cur}\x1b[0m\n`);
                return 0;
            }
        }
        stderr.write(`gta: unknown subcommand "${sub}". Run "gta help" for usage.\n`);
        return 1;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ShellCommands };
}
if (typeof window !== 'undefined') {
    window.ShellCommands = ShellCommands;
}

if (typeof window !== 'undefined') window.commands = new ShellCommands();
