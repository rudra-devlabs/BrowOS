/**
 * BrowOS Shell Parser
 * POSIX-style shell tokenizer, AST parser, and variable expander.
 */

class ShellParser {
    /**
     * Tokenizes a raw command line string respecting single/double quotes and escapes.
     */
    static tokenize(input) {
        if (!input || typeof input !== 'string') return [];
        
        // Normalize typographic/smart quotes commonly pasted from web pages/rich text
        const normalized = input
            .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

        const tokens = [];
        let current = '';
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let isEscaped = false;
        let quoted = false;
        let wasSingleQuoted = false;

        const pushCurrent = () => {
            if (current.length > 0 || quoted) {
                tokens.push({ type: 'WORD', value: current, quoted, isSingleQuoted: wasSingleQuoted });
                current = '';
                quoted = false;
                wasSingleQuoted = false;
            }
        };

        const len = normalized.length;
        for (let i = 0; i < len; i++) {
            const char = normalized[i];

            if (isEscaped) {
                current += char;
                isEscaped = false;
                continue;
            }

            if (char === '\\' && !inSingleQuote) {
                if (inDoubleQuote) {
                    const next = normalized[i + 1];
                    if (next === '"' || next === '\\' || next === '$' || next === '`') {
                        isEscaped = true;
                        continue;
                    } else {
                        current += '\\';
                        continue;
                    }
                } else {
                    // Line continuation or escaped whitespace between arguments
                    const next = normalized[i + 1];
                    if (next === '\n' || next === '\r') {
                        if (next === '\r' && normalized[i + 2] === '\n') i++;
                        i++;
                        continue;
                    } else if (current === '' && (next === ' ' || next === '\t' || next === undefined)) {
                        // Stray line continuation like "curl ... \ -H ..."
                        while (i + 1 < len && (normalized[i + 1] === ' ' || normalized[i + 1] === '\t')) {
                            i++;
                        }
                        continue;
                    }
                    isEscaped = true;
                    continue;
                }
            }

            if (char === "'" && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
                quoted = true;
                wasSingleQuoted = true;
                continue;
            }

            if (char === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
                quoted = true;
                continue;
            }

            if (inSingleQuote || inDoubleQuote) {
                current += char;
                continue;
            }

            // Outside quotes: check shell operators
            if (char === ' ' || char === '\t') {
                pushCurrent();
                continue;
            }

            if (char === '|' && normalized[i + 1] === '|') {
                pushCurrent();
                tokens.push({ type: 'OR', value: '||' });
                i++;
                continue;
            }

            if (char === '&' && normalized[i + 1] === '&') {
                pushCurrent();
                tokens.push({ type: 'AND', value: '&&' });
                i++;
                continue;
            }

            if (char === '2' && normalized[i + 1] === '>' && normalized[i + 2] === '&' && normalized[i + 3] === '1') {
                pushCurrent();
                tokens.push({ type: 'REDIRECT_ERR_MERGE', value: '2>&1' });
                i += 3;
                continue;
            }

            if (char === '2' && normalized[i + 1] === '>') {
                pushCurrent();
                tokens.push({ type: 'REDIRECT_ERR', value: '2>' });
                i++;
                continue;
            }

            if (char === '>' && normalized[i + 1] === '>') {
                pushCurrent();
                tokens.push({ type: 'REDIRECT_APPEND', value: '>>' });
                i++;
                continue;
            }

            if (char === '>') {
                pushCurrent();
                tokens.push({ type: 'REDIRECT_OUT', value: '>' });
                continue;
            }

            if (char === '<') {
                pushCurrent();
                tokens.push({ type: 'REDIRECT_IN', value: '<' });
                continue;
            }

            if (char === '|') {
                pushCurrent();
                tokens.push({ type: 'PIPE', value: '|' });
                continue;
            }

            if (char === ';') {
                pushCurrent();
                tokens.push({ type: 'SEMICOLON', value: ';' });
                continue;
            }

            current += char;
        }

        pushCurrent();
        return tokens;
    }

    /**
     * Expands environment variables like $USER, ${VAR}, $?, etc.
     */
    static expandVariables(token, env) {
        if (!token) return '';
        // Single quoted strings do not expand variables
        if (token.quoted && token.isSingleQuoted) {
            return token.value;
        }

        let str = token.value || '';
        // Expand ${VAR} and $VAR (including special positional parameters $#, $@, $*, $0-$9)
        str = str.replace(/\$\{([a-zA-Z_0-9?#@*$!]+)\}/g, (match, varName) => {
            return env ? env.get(varName, '') : '';
        });

        str = str.replace(/\$([a-zA-Z_0-9?#@*$!]+)/g, (match, varName) => {
            return env ? env.get(varName, '') : '';
        });

        // Expand ~ to user home if at beginning of path
        if (str === '~') {
            return env.get('HOME', '/');
        } else if (str.startsWith('~/')) {
            const home = env.get('HOME', '/');
            return home === '/' ? str.substring(1) : home + str.substring(1);
        }

        return str;
    }

    /**
     * Parses tokens into an executable Abstract Syntax Tree.
     * AST Structure:
     * [
     *   {
     *     pipelines: [
     *       [
     *         { command: 'cat', args: ['file.txt'], redirects: [] },
     *         { command: 'grep', args: ['foo'], redirects: [{ type: '>', target: 'out.txt' }] }
     *       ]
     *     ],
     *     nextOp: '&&' | '||' | ';' | null
     *   }
     * ]
     */
    static parse(input, env) {
        const rawTokens = this.tokenize(input);
        if (rawTokens.length === 0) return [];

        const chains = [];
        let currentPipeline = [];
        let currentCmd = { command: '', args: [], redirects: [] };
        let waitingForRedirectTarget = null;

        const finalizeCommand = () => {
            if (currentCmd.command) {
                currentPipeline.push(currentCmd);
                currentCmd = { command: '', args: [], redirects: [] };
            }
        };

        const finalizePipeline = (nextOp = null) => {
            finalizeCommand();
            if (currentPipeline.length > 0) {
                chains.push({
                    pipeline: currentPipeline,
                    nextOp: nextOp
                });
                currentPipeline = [];
            }
        };

        for (let i = 0; i < rawTokens.length; i++) {
            const tok = rawTokens[i];

            if (waitingForRedirectTarget) {
                const target = this.expandVariables(tok, env);
                currentCmd.redirects.push({
                    type: waitingForRedirectTarget,
                    target: target
                });
                waitingForRedirectTarget = null;
                continue;
            }

            if (tok.type === 'WORD') {
                const expanded = this.expandVariables(tok, env);
                if (!currentCmd.command) {
                    currentCmd.command = expanded;
                    currentCmd.args.push(expanded);
                } else {
                    currentCmd.args.push(expanded);
                }
            } else if (tok.type === 'PIPE') {
                finalizeCommand();
            } else if (tok.type === 'REDIRECT_OUT' || tok.type === 'REDIRECT_APPEND' || tok.type === 'REDIRECT_IN' || tok.type === 'REDIRECT_ERR') {
                waitingForRedirectTarget = tok.value;
            } else if (tok.type === 'REDIRECT_ERR_MERGE') {
                currentCmd.redirects.push({
                    type: '2>&1',
                    target: '&1'
                });
            } else if (tok.type === 'AND') {
                finalizePipeline('&&');
            } else if (tok.type === 'OR') {
                finalizePipeline('||');
            } else if (tok.type === 'SEMICOLON') {
                finalizePipeline(';');
            }
        }

        finalizePipeline(null);
        return chains;
    }

    /**
     * Checks if a string pattern matches a file name (wildcard globbing)
     */
    static matchGlob(pattern, str) {
        const regexPattern = '^' + pattern
            .replace(/([.+^=!:${}()|\[\]\/\\])/g, "\\$1")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".") + '$';
        return new RegExp(regexPattern).test(str);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ShellParser };
}
if (typeof window !== 'undefined') {
    window.ShellParser = ShellParser;
}
