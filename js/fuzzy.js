/**
 * BrowOS High-Performance Fuzzy Search Engine
 * Subsequence matching with intelligent scoring (prefix, word-boundary, camelCase, streak bonuses)
 * and character highlight indexing.
 */
(function(root) {
    'use strict';

    class FuzzyMatcher {
        /**
         * Test if pattern matches target using fuzzy subsequence matching.
         * @param {string} pattern - Search query
         * @param {string} target - Candidate string
         * @returns {{ score: number, indices: number[] } | null}
         */
        static match(pattern, target) {
            if (!pattern || !target) return null;

            const pLen = pattern.length;
            const tLen = target.length;
            if (pLen > tLen) return null;

            const pLower = pattern.toLowerCase();
            const tLower = target.toLowerCase();

            // Direct exact match
            if (pLower === tLower) {
                const indices = Array.from({ length: tLen }, (_, i) => i);
                return { score: 1000 + (100 - tLen), indices };
            }

            // Direct prefix match
            if (tLower.startsWith(pLower)) {
                const indices = Array.from({ length: pLen }, (_, i) => i);
                return { score: 500 + (50 - (tLen - pLen)), indices };
            }

            // Direct contiguous substring match
            const subIndex = tLower.indexOf(pLower);
            if (subIndex !== -1) {
                const indices = Array.from({ length: pLen }, (_, i) => subIndex + i);
                let score = 300 - subIndex * 5 - (tLen - pLen);
                // Word boundary bonus
                if (subIndex === 0 || /[\s\-_\/.]/.test(target[subIndex - 1])) {
                    score += 80;
                }
                return { score, indices };
            }

            // Subsequence match with scoring
            let pIdx = 0;
            let tIdx = 0;
            const matchedIndices = [];
            let score = 0;
            let streak = 0;

            while (pIdx < pLen && tIdx < tLen) {
                const pChar = pLower[pIdx];
                const tChar = tLower[tIdx];

                if (pChar === tChar) {
                    matchedIndices.push(tIdx);

                    // Base match score
                    let charScore = 10;

                    // Consecutive character streak bonus
                    if (streak > 0) {
                        charScore += streak * 15;
                    }
                    streak++;

                    // Match at start of word / string bonus
                    if (tIdx === 0) {
                        charScore += 45;
                    } else {
                        const prevChar = target[tIdx - 1];
                        const currChar = target[tIdx];

                        // Word boundary separator bonus: space, hyphen, slash, underscore, dot
                        if (/[\s\-_\/.]/.test(prevChar)) {
                            charScore += 35;
                        }
                        // CamelCase bonus (e.g. 'B' in 'FileBrow')
                        else if (prevChar === prevChar.toLowerCase() && currChar === currChar.toUpperCase() && prevChar !== currChar) {
                            charScore += 35;
                        }
                    }

                    score += charScore;
                    pIdx++;
                } else {
                    streak = 0;
                }

                tIdx++;
            }

            // Must match all characters in pattern
            if (pIdx < pLen) {
                return null;
            }

            // Penalize gaps and longer target distance
            const spread = matchedIndices[matchedIndices.length - 1] - matchedIndices[0] + 1;
            score -= (spread - pLen) * 3;
            score -= tLen * 0.5;

            return { score, indices: matchedIndices };
        }

        /**
         * Wrap matched indices with highlight spans.
         * @param {string} text - Raw string
         * @param {number[]} indices - Matched indices
         * @param {string} highlightClass - CSS class name
         * @returns {string} HTML string with highlights
         */
        static highlight(text, indices, highlightClass = 'spotlight-match') {
            if (!indices || indices.length === 0) {
                return this.escapeHtml(text);
            }

            const indexSet = new Set(indices);
            let html = '';
            let inHighlight = false;

            for (let i = 0; i < text.length; i++) {
                const isMatch = indexSet.has(i);
                const char = this.escapeHtml(text[i]);

                if (isMatch && !inHighlight) {
                    html += `<span class="${highlightClass}">`;
                    inHighlight = true;
                } else if (!isMatch && inHighlight) {
                    html += '</span>';
                    inHighlight = false;
                }

                html += char;
            }

            if (inHighlight) {
                html += '</span>';
            }

            return html;
        }

        /**
         * HTML entity escaping.
         */
        static escapeHtml(str) {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }
    }

    root.FuzzyMatcher = FuzzyMatcher;
})(typeof window !== 'undefined' ? window : globalThis);
