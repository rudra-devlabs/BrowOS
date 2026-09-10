/**
 * BrowOS Shell Scripting Engine (Phase 3)
 * Implements POSIX shell script execution, shebang resolution (#!),
 * control flow (if/then/elif/else/fi, for/in/do/done, while/do/done),
 * the POSIX `test` / `[` command, positional parameters ($1, $@, $#),
 * and shell functions.
 */

class ShellConditionTester {
    /**
     * Evaluates POSIX `test` or `[` arguments.
     * Returns 0 for true, 1 for false, 2 for syntax error.
     */
    static async evaluate(args, env, fs) {
        if (!args || args.length === 0) return 1;

        let tokens = [...args];
        // If invoked as `[`, last token must be `]`
        if (tokens[0] === '[') {
            tokens.shift();
            if (tokens.length === 0 || tokens[tokens.length - 1] !== ']') {
                return 2;
            }
            tokens.pop();
        }

        if (tokens.length === 0) return 1;

        // Invert condition if first token is `!`
        if (tokens[0] === '!') {
            tokens.shift();
            const res = await this.evaluate(tokens, env, fs);
            return res === 0 ? 1 : 0;
        }

        // Single argument: true if non-empty string
        if (tokens.length === 1) {
            return tokens[0].length > 0 ? 0 : 1;
        }

        // Two arguments: unary operators (-z, -n, -f, -d, -e, -s)
        if (tokens.length === 2) {
            const op = tokens[0];
            const val = tokens[1];

            if (op === '-z') return val.length === 0 ? 0 : 1;
            if (op === '-n') return val.length > 0 ? 0 : 1;

            if (op === '-e' || op === '-f' || op === '-d' || op === '-s') {
                if (!fs) return 1;
                const path = env ? env.resolvePath(val) : val;
                const fn = fs.stat || fs.getMetadata;
                if (!fn) return 1;

                try {
                    const meta = await fn.call(fs, path);
                    if (!meta) return 1;

                    if (op === '-e') return 0;
                    if (op === '-f') return meta.type === 'file' || meta.kind === 'file' ? 0 : 1;
                    if (op === '-d') return meta.type === 'directory' || meta.kind === 'directory' ? 0 : 1;
                    if (op === '-s') return (meta.size || 0) > 0 ? 0 : 1;
                } catch (e) {
                    return 1;
                }
            }

            return 1;
        }

        // Three arguments: binary comparisons
        if (tokens.length === 3) {
            const left = tokens[0];
            const op = tokens[1];
            const right = tokens[2];

            // String equality
            if (op === '=' || op === '==') return left === right ? 0 : 1;
            if (op === '!=') return left !== right ? 0 : 1;

            // Numeric comparisons
            const numLeft = parseFloat(left);
            const numRight = parseFloat(right);
            if (!isNaN(numLeft) && !isNaN(numRight)) {
                if (op === '-eq') return numLeft === numRight ? 0 : 1;
                if (op === '-ne') return numLeft !== numRight ? 0 : 1;
                if (op === '-gt') return numLeft > numRight ? 0 : 1;
                if (op === '-ge') return numLeft >= numRight ? 0 : 1;
                if (op === '-lt') return numLeft < numRight ? 0 : 1;
                if (op === '-le') return numLeft <= numRight ? 0 : 1;
            }
        }

        // Logical compound expressions (-a, -o)
        const andIdx = tokens.indexOf('-a');
        if (andIdx > 0 && andIdx < tokens.length - 1) {
            const leftRes = await this.evaluate(tokens.slice(0, andIdx), env, fs);
            if (leftRes !== 0) return 1;
            return await this.evaluate(tokens.slice(andIdx + 1), env, fs);
        }

        const orIdx = tokens.indexOf('-o');
        if (orIdx > 0 && orIdx < tokens.length - 1) {
            const leftRes = await this.evaluate(tokens.slice(0, orIdx), env, fs);
            if (leftRes === 0) return 0;
            return await this.evaluate(tokens.slice(orIdx + 1), env, fs);
        }

        return 1;
    }
}

class ShellScriptRunner {
    static interrupted = false;

    static interrupt() {
        this.interrupted = true;
    }

    /**
     * Dispatches executable files based on shebang or extension.
     */
    static async dispatch(filePath, args, stdout, stderr, env, engine) {
        const fs = (engine && typeof engine.getFs === 'function' ? engine.getFs() : null) || 
                   (typeof window !== 'undefined' ? window.filesystem : null);

        const outWrite = (msg) => {
            if (typeof stdout === 'function') stdout(msg);
            else if (stdout && typeof stdout.write === 'function') stdout.write(msg);
        };
        const errWrite = (msg) => {
            if (typeof stderr === 'function') stderr(msg);
            else if (stderr && typeof stderr.write === 'function') stderr.write(msg);
        };
        const outStream = { write: outWrite };
        const errStream = { write: errWrite };

        if (!fs) {
            errWrite(`browos: filesystem unavailable\n`);
            return 1;
        }

        const resolved = env ? env.resolvePath(filePath) : filePath;
        let content = null;
        try {
            content = await fs.readFile(resolved);
        } catch (e) {
            errWrite(`browos: ${filePath}: No such file or directory\n`);
            return 127;
        }

        if (content === null || content === undefined) {
            errWrite(`browos: ${filePath}: No such file or directory\n`);
            return 127;
        }

        const firstLine = content.split('\n')[0].trim();

        // 1. Python Shebang or .py extension
        if ((firstLine.startsWith('#!') && (firstLine.includes('python') || firstLine.includes('python3'))) || filePath.endsWith('.py')) {
            const pyRuntime = (typeof window !== 'undefined' ? window.PythonRuntime : null) || 
                              (typeof PythonRuntime !== 'undefined' ? PythonRuntime : null) ||
                              (typeof require !== 'undefined' ? require('./runtimes.js').PythonRuntime : null);
            if (pyRuntime) {
                return await pyRuntime.executeScript(content, outStream, errStream, env);
            }
        }

        // 2. Node / JS Shebang or .js extension
        if ((firstLine.startsWith('#!') && firstLine.includes('node')) || filePath.endsWith('.js')) {
            const jsRuntime = (typeof window !== 'undefined' ? window.JsRuntime : null) || 
                              (typeof JsRuntime !== 'undefined' ? JsRuntime : null) ||
                              (typeof require !== 'undefined' ? require('./runtimes.js').JsRuntime : null);
            if (jsRuntime) {
                const res = await jsRuntime.executeCode(content, outStream, errStream, env);
                return res.ok ? 0 : 1;
            }
        }

        // 3. Shell Script (#! /bin/sh, /bin/bash, .sh, or plain text)
        return await this.executeScript(content, args, outStream, errStream, env, engine, false, filePath);
    }

    /**
     * Executes multi-line shell script contents.
     */
    static async executeScript(content, args, stdout, stderr, env, engine, isSourced = false, scriptName = 'sh') {
        this.interrupted = false;

        // Sub-environment for scripts unless sourced
        const scriptEnv = isSourced ? env : env.clone();

        if (!isSourced) {
            scriptEnv.set('0', scriptName);
            scriptEnv.set('#', String(args ? args.length : 0));
            scriptEnv.set('@', (args || []).join(' '));
            scriptEnv.set('*', (args || []).join(' '));

            if (args && args.length > 0) {
                args.forEach((a, idx) => {
                    scriptEnv.set(String(idx + 1), a);
                });
            }
        }

        // Normalize single-line control flow statements (e.g. `for i in 1 2; do echo $i; done`) into lines
        const normalized = content
            .replace(/;\s*(then|do|done|else|elif|fi)\b/g, '\n$1\n')
            .replace(/\b(then|do|else)\s+/g, '$1\n');
        const lines = normalized.split('\n');
        return await this.executeLines(lines, stdout, stderr, scriptEnv, engine);
    }

    /**
     * Processes lines with block control flow (if/then/elif/else/fi, for/in/do/done, while/do/done).
     */
    static async executeLines(rawLines, stdout, stderr, env, engine) {
        let i = 0;
        let lastExitCode = 0;

        while (i < rawLines.length) {
            if (this.interrupted) {
                stderr.write('\x1b[33mScript terminated by user (SIGINT).\x1b[0m\n');
                return 130;
            }

            const raw = rawLines[i].trim();
            i++;

            // Skip empty lines and full-line comments
            if (!raw || raw.startsWith('#')) {
                continue;
            }

            // Variable Assignment: VAR=val or export VAR=val
            const assignMatch = raw.match(/^(?:export\s+)?([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
            if (assignMatch) {
                const varName = assignMatch[1];
                let varVal = assignMatch[2].trim();
                // Strip outer quotes if any
                if ((varVal.startsWith('"') && varVal.endsWith('"')) || (varVal.startsWith("'") && varVal.endsWith("'"))) {
                    varVal = varVal.slice(1, -1);
                }
                // Expand variables inside assignment value
                varVal = varVal.replace(/\$([a-zA-Z_0-9?#@*$!]+)/g, (match, v) => env ? env.get(v, '') : '');
                if (env) env.set(varName, varVal);
                continue;
            }

            // Function Definition: func_name() { ... } or function name { ... }
            const funcMatch = raw.match(/^(?:function\s+)?([a-zA-Z_0-9]+)\s*\(\)\s*\{?$/);
            if (funcMatch) {
                const funcName = funcMatch[1];
                const funcBody = [];
                let closed = raw.endsWith('}');

                while (!closed && i < rawLines.length) {
                    const nextLine = rawLines[i++].trim();
                    if (nextLine === '}') {
                        closed = true;
                    } else {
                        funcBody.push(nextLine);
                    }
                }

                if (env.setFunction) {
                    env.setFunction(funcName, funcBody.join('\n'));
                }
                continue;
            }

            // IF / THEN / ELIF / ELSE / FI
            if (raw.startsWith('if ') || raw === 'if') {
                let condLine = raw.slice(2).trim();
                let thenBlock = [];
                let elifBlocks = [];
                let elseBlock = [];
                let currentTarget = null;
                let currentElifCond = null;

                // Look for `then`
                if (condLine.endsWith('; then') || condLine.endsWith(';then')) {
                    condLine = condLine.replace(/;\s*then$/, '').trim();
                    currentTarget = thenBlock;
                }

                while (i < rawLines.length) {
                    const next = rawLines[i++].trim();
                    if (next === 'then') {
                        if (!currentTarget) currentTarget = thenBlock;
                        continue;
                    }
                    if (next.startsWith('elif ')) {
                        currentElifCond = next.slice(5).replace(/;\s*then$/, '').trim();
                        const block = [];
                        elifBlocks.push({ cond: currentElifCond, block });
                        currentTarget = block;
                        continue;
                    }
                    if (next === 'else') {
                        currentTarget = elseBlock;
                        continue;
                    }
                    if (next === 'fi') {
                        break;
                    }
                    if (currentTarget) {
                        currentTarget.push(next);
                    }
                }

                // Evaluate condition
                let conditionPassed = false;
                const condExit = await this.evaluateCondition(condLine, env, engine);
                if (condExit === 0) {
                    conditionPassed = true;
                    lastExitCode = await this.executeLines(thenBlock, stdout, stderr, env, engine);
                } else {
                    for (const elif of elifBlocks) {
                        const elifExit = await this.evaluateCondition(elif.cond, env, engine);
                        if (elifExit === 0) {
                            conditionPassed = true;
                            lastExitCode = await this.executeLines(elif.block, stdout, stderr, env, engine);
                            break;
                        }
                    }
                }

                if (!conditionPassed && elseBlock.length > 0) {
                    lastExitCode = await this.executeLines(elseBlock, stdout, stderr, env, engine);
                }
                continue;
            }

            // FOR ... IN ... DO ... DONE
            if (raw.startsWith('for ')) {
                const forMatch = raw.match(/^for\s+([a-zA-Z_0-9]+)\s+in\s+(.+?)(?:;\s*do)?$/);
                if (forMatch) {
                    const varName = forMatch[1];
                    let rawItems = forMatch[2].trim();
                    const doBlock = [];

                    while (i < rawLines.length) {
                        const next = rawLines[i++].trim();
                        if (next === 'do' && doBlock.length === 0) continue;
                        if (next === 'done') break;
                        doBlock.push(next);
                    }

                    // Expand wildcard items
                    const items = await this.expandForItems(rawItems, env);

                    for (const item of items) {
                        if (this.interrupted) break;
                        env.set(varName, item);
                        lastExitCode = await this.executeLines(doBlock, stdout, stderr, env, engine);
                    }
                    continue;
                }
            }

            // WHILE ... DO ... DONE
            if (raw.startsWith('while ') || raw === 'while') {
                let condLine = raw.slice(5).trim();
                if (condLine.endsWith('; do') || condLine.endsWith(';do')) {
                    condLine = condLine.replace(/;\s*do$/, '').trim();
                }
                const doBlock = [];

                while (i < rawLines.length) {
                    const next = rawLines[i++].trim();
                    if (next === 'do' && doBlock.length === 0) continue;
                    if (next === 'done') break;
                    doBlock.push(next);
                }

                let loops = 0;
                while (!this.interrupted && loops < 100000) {
                    loops++;
                    const condExit = await this.evaluateCondition(condLine, env, engine);
                    if (condExit !== 0) break;

                    lastExitCode = await this.executeLines(doBlock, stdout, stderr, env, engine);
                }
                continue;
            }

            // Standard command execution through engine
            if (engine) {
                lastExitCode = await engine.execute(raw, stdout, stderr, env);
                env.set('?', String(lastExitCode));
            }
        }

        return lastExitCode;
    }

    /**
     * Evaluates condition statements (like `[ $a -eq $b ]` or `grep -q pattern file`).
     */
    static async evaluateCondition(condStr, env, engine) {
        const trimmed = condStr.trim();

        // Check if condition is [ ... ] or test ...
        if (trimmed.startsWith('[ ') || trimmed.startsWith('test ') || trimmed.startsWith('[') && trimmed.endsWith(']')) {
            const tokens = trimmed.replace(/^\[\s*/, '').replace(/\s*\]$/, '').split(/\s+/);
            const fs = typeof window !== 'undefined' ? window.filesystem : null;
            // Expand tokens with env variables
            const expandedTokens = tokens.map(t => {
                if (t.startsWith('$')) {
                    return env ? env.get(t.slice(1)) : '';
                }
                return t;
            });
            return await ShellConditionTester.evaluate(expandedTokens, env, fs);
        }

        // Otherwise execute command silently and inspect exit code
        const nullOut = { write: () => {} };
        const nullErr = { write: () => {} };
        if (engine) {
            return await engine.execute(condStr, nullOut, nullErr, env);
        }
        return 1;
    }

    /**
     * Expands items for `for x in ...` including globbing and quotes.
     */
    static async expandForItems(itemsStr, env) {
        const tokens = itemsStr.split(/\s+/);
        const fs = typeof window !== 'undefined' ? window.filesystem : null;
        const result = [];

        for (let tok of tokens) {
            // Expand variable
            if (tok.startsWith('$')) {
                tok = env ? env.get(tok.slice(1)) : '';
            }

            // Expand glob wildcard (e.g. *.txt)
            if (tok.includes('*') && fs && typeof fs.list === 'function') {
                try {
                    const cwd = env ? env.getCwd() : '/';
                    const list = await fs.list(cwd);
                    const regex = new RegExp('^' + tok.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                    const matches = list ? list.filter(e => regex.test(e.name)).map(e => e.name) : [];
                    if (matches.length > 0) {
                        result.push(...matches);
                        continue;
                    }
                } catch (e) {}
            }

            result.push(tok);
        }

        return result;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ShellConditionTester, ShellScriptRunner };
}
if (typeof window !== 'undefined') {
    window.ShellConditionTester = ShellConditionTester;
    window.ShellScriptRunner = ShellScriptRunner;
}
