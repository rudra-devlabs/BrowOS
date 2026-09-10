/**
 * BrowOS Shell Execution Engine
 * Coordinates pipeline streaming, file redirections, logical chaining, and process execution.
 */

class ShellStream {
    constructor() {
        this.buffer = '';
        this.listeners = [];
    }

    write(str) {
        if (str === undefined || str === null) return;
        this.buffer += String(str);
        for (let l of this.listeners) l(str);
    }

    onData(listener) {
        this.listeners.push(listener);
    }

    get() {
        return this.buffer;
    }

    clear() {
        this.buffer = '';
    }
}

class ShellEngine {
    constructor(env) {
        this.env = env || (typeof window !== 'undefined' && window.ShellEnvironment ? new window.ShellEnvironment() : null);
        this.commands = typeof window !== 'undefined' && window.ShellCommands ? new window.ShellCommands(this) : null;
    }

    setCommands(commands) {
        this.commands = commands;
    }

    getFs() {
        return (typeof window !== 'undefined' && window.filesystem) || null;
    }

    /**
     * Executes a full command line string.
     * stdoutCallback & stderrCallback accept chunks of text.
     * Returns the exit code of the last executed command.
     */
    async execute(commandLine, stdoutCallback = null, stderrCallback = null, customEnv = null) {
        const trimmed = (commandLine || '').trim();
        if (!trimmed) return 0;

        const activeEnv = customEnv || this.env;
        const outFn = typeof stdoutCallback === 'function' ? stdoutCallback : (stdoutCallback && typeof stdoutCallback.write === 'function' ? (s) => stdoutCallback.write(s) : null);
        const errFn = typeof stderrCallback === 'function' ? stderrCallback : (stderrCallback && typeof stderrCallback.write === 'function' ? (s) => stderrCallback.write(s) : null);

        // Check if multi-line or starts with shell control-flow keyword (Phase 3)
        const isBlockScript = trimmed.includes('\n') || 
                              trimmed.startsWith('if ') || 
                              trimmed.startsWith('for ') || 
                              trimmed.startsWith('while ') ||
                              trimmed.match(/^(?:function\s+)?[a-zA-Z_0-9]+\s*\(\)/);

        if (isBlockScript) {
            const Runner = (typeof window !== 'undefined' ? window.ShellScriptRunner : null) || (typeof require !== 'undefined' ? require('./scripting.js').ShellScriptRunner : null);
            if (Runner) {
                const outStream = { write: (str) => { if (outFn) outFn(str); } };
                const errStream = { write: (str) => { if (errFn) errFn(str); } };
                const exitCode = await Runner.executeScript(trimmed, [], outStream, errStream, activeEnv, this, true);
                activeEnv.setExitCode(exitCode);
                return exitCode;
            }
        }

        // Check if command is an alias
        const firstWord = trimmed.split(/\s+/)[0];
        const alias = activeEnv ? activeEnv.getAlias(firstWord) : null;
        let finalCmd = trimmed;
        if (alias) {
            finalCmd = alias + trimmed.substring(firstWord.length);
        }

        const Parser = (typeof window !== 'undefined' ? window.ShellParser : null) || 
                       (typeof ShellParser !== 'undefined' ? ShellParser : null) ||
                       (typeof require !== 'undefined' ? require('./parser.js').ShellParser : null);
        if (!Parser) {
            if (errFn) errFn('ShellParser not loaded\n');
            return 1;
        }

        const chains = Parser.parse(finalCmd, activeEnv);
        if (chains.length === 0) return 0;

        let lastExitCode = 0;
        let executeThisStep = true;

        for (let i = 0; i < chains.length; i++) {
            const step = chains[i];

            if (!executeThisStep) {
                if (step.nextOp === '||' || step.nextOp === ';' || !step.nextOp) {
                    executeThisStep = true;
                }
                continue;
            }

            lastExitCode = await this.executePipeline(step.pipeline, stdoutCallback, stderrCallback, activeEnv);
            if (activeEnv) activeEnv.setExitCode(lastExitCode);

            if (step.nextOp === '&&') {
                executeThisStep = (lastExitCode === 0);
            } else if (step.nextOp === '||') {
                executeThisStep = (lastExitCode !== 0);
            } else {
                executeThisStep = true;
            }
        }

        return lastExitCode;
    }

    /**
     * Executes a single pipeline (e.g. cmd1 | cmd2 | cmd3).
     */
    async executePipeline(pipeline, terminalStdout, terminalStderr, customEnv = null) {
        if (!pipeline || pipeline.length === 0) return 0;

        const activeEnv = customEnv || this.env;
        let currentStdin = '';
        let lastExitCode = 0;

        for (let i = 0; i < pipeline.length; i++) {
            const cmdObj = pipeline[i];
            const isLast = i === pipeline.length - 1;

            const cmdStdout = new ShellStream();
            const cmdStderr = new ShellStream();

            // Direct terminal output listener for last stage
            if (isLast) {
                cmdStdout.onData(text => {
                    if (terminalStdout) {
                        if (typeof terminalStdout === 'function') terminalStdout(text);
                        else if (typeof terminalStdout.write === 'function') terminalStdout.write(text);
                    }
                });
            }
            cmdStderr.onData(text => {
                if (terminalStderr) {
                    if (typeof terminalStderr === 'function') terminalStderr(text);
                    else if (typeof terminalStderr.write === 'function') terminalStderr.write(text);
                }
            });

            // 1. Resolve input redirection (< file)
            let stageStdin = currentStdin;
            for (let red of cmdObj.redirects) {
                if (red.type === '<') {
                    const fs = this.getFs();
                    if (fs && fs.isReady()) {
                        const content = await fs.readFile(activeEnv.resolvePath(red.target));
                        if (content !== null) {
                            stageStdin = content;
                        } else {
                            cmdStderr.write(`browsh: ${red.target}: No such file or directory\n`);
                            return 1;
                        }
                    }
                }
            }

            // 2. Perform wildcard glob expansion on args
            const expandedArgs = await this.expandGlobs(cmdObj.args);

            // 3. Execute single command
            lastExitCode = await this.executeCommand(expandedArgs, stageStdin, cmdStdout, cmdStderr, activeEnv);

            // 4. Handle output redirections (>, >>, 2>, 2>&1)
            for (let red of cmdObj.redirects) {
                const fs = this.getFs();
                if (!fs || !fs.isReady()) {
                    cmdStderr.write(`browsh: ${red.target}: Filesystem not available\n`);
                    continue;
                }

                const targetPath = activeEnv.resolvePath(red.target);
                const outText = cmdStdout.get().replace(/\x1b\[[0-9;]*m/g, ''); // strip colors when writing to files

                if (red.type === '>') {
                    await fs.createFile(targetPath, outText);
                } else if (red.type === '>>') {
                    const existing = (await fs.readFile(targetPath)) || '';
                    await fs.createFile(targetPath, existing + outText);
                } else if (red.type === '2>') {
                    const errText = cmdStderr.get().replace(/\x1b\[[0-9;]*m/g, '');
                    await fs.createFile(targetPath, errText);
                }
            }

            // Set stdout as stdin for next stage (strip ANSI codes so downstream commands receive clean text)
            currentStdin = cmdStdout.get().replace(/\x1b\[[0-9;]*m/g, '');
        }

        return lastExitCode;
    }

    /**
     * Executes a single command with arguments.
     */
    async executeCommand(args, stdin, stdout, stderr, customEnv = null) {
        if (!args || args.length === 0) return 0;
        const activeEnv = customEnv || this.env;
        const name = args[0];
        // 0. Check standalone or inline variable assignment (e.g. KEY=VAL or KEY=VAL command)
        if (name && name.includes('=') && !name.startsWith('-') && !name.startsWith('./') && !name.startsWith('/')) {
            const eqIdx = name.indexOf('=');
            const key = name.slice(0, eqIdx);
            const val = name.slice(eqIdx + 1).replace(/^["']|["']$/g, '');
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) && activeEnv && typeof activeEnv.set === 'function') {
                activeEnv.set(key, val);
                if (args.length === 1) return 0;
                return await this.executeCommand(args.slice(1), stdin, stdout, stderr, activeEnv);
            }
        }

        // 1. Check built-in utilities
        if (this.commands && typeof this.commands[name] === 'function') {
            try {
                return await this.commands[name](args, stdin, stdout, stderr, activeEnv);
            } catch (e) {
                stderr.write(`${name}: execution error: ${e.message}\n`);
                return 1;
            }
        }

        // 2. Check shell functions defined in environment
        if (activeEnv && typeof activeEnv.getFunction === 'function') {
            const funcBody = activeEnv.getFunction(name);
            if (funcBody) {
                const Runner = (typeof window !== 'undefined' ? window.ShellScriptRunner : null) || (typeof require !== 'undefined' ? require('./scripting.js').ShellScriptRunner : null);
                if (Runner) {
                    return await Runner.executeScript(funcBody, args.slice(1), stdout, stderr, activeEnv, this, false, name);
                }
            }
        }

        // 3. Executable File / Shebang invocation (e.g. ./script.sh, ./run.py, ./app.js)
        if (name.startsWith('./') || name.startsWith('/') || name.endsWith('.sh') || name.endsWith('.py') || name.endsWith('.js')) {
            const Runner = (typeof window !== 'undefined' ? window.ShellScriptRunner : null) || (typeof require !== 'undefined' ? require('./scripting.js').ShellScriptRunner : null);
            if (Runner) {
                return await Runner.dispatch(name, args.slice(1), stdout, stderr, activeEnv, this);
            }
        }

        // 4. Nano Editor check
        if (name === 'nano') {
            stderr.write('nano: must be launched from interactive terminal mode\n');
            return 1;
        }

        stderr.write(`browsh: ${name}: command not found\n`);
        return 127;
    }

    /**
     * Expands wildcard glob patterns like *.txt or Doc* against real files in current directory.
     */
    async expandGlobs(args) {
        const result = [];
        const fs = this.getFs();
        const Parser = (typeof window !== 'undefined' ? window.ShellParser : null) || (typeof ShellParser !== 'undefined' ? ShellParser : null);

        for (let arg of args) {
            if ((arg.includes('*') || arg.includes('?')) && fs && fs.isReady() && Parser) {
                let dir = '.';
                let pattern = arg;
                const lastSlash = arg.lastIndexOf('/');
                if (lastSlash !== -1) {
                    dir = arg.substring(0, lastSlash) || '/';
                    pattern = arg.substring(lastSlash + 1);
                }

                try {
                    const entries = await fs.list(this.env.resolvePath(dir));
                    if (entries) {
                        const matched = entries
                            .filter(e => Parser.matchGlob(pattern, e.name))
                            .map(e => lastSlash !== -1 ? (dir === '/' ? `/${e.name}` : `${dir}/${e.name}`) : e.name);
                        
                        if (matched.length > 0) {
                            result.push(...matched);
                            continue;
                        }
                    }
                } catch (e) {}
            }
            result.push(arg);
        }
        return result;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ShellEngine, ShellStream };
}
if (typeof window !== 'undefined') {
    window.ShellEngine = ShellEngine;
    window.ShellStream = ShellStream;
}
