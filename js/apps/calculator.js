/**
 * BrowOS Calculator App Module
 * Extracted from window.js
 */
(function(root) {
    'use strict';

    const CalculatorApp = {
        getContent() {
                return `
                    <div class="calculator-window">
                        <div class="calc-display" id="calc-display">0</div>
                        <div class="calc-buttons">
                            <button class="calc-btn calc-fn" data-action="clear">AC</button>
                            <button class="calc-btn calc-fn" data-action="negate">+/−</button>
                            <button class="calc-btn calc-fn" data-action="percent">%</button>
                            <button class="calc-btn calc-op" data-action="divide">÷</button>
                            <button class="calc-btn calc-num" data-value="7">7</button>
                            <button class="calc-btn calc-num" data-value="8">8</button>
                            <button class="calc-btn calc-num" data-value="9">9</button>
                            <button class="calc-btn calc-op" data-action="multiply">×</button>
                            <button class="calc-btn calc-num" data-value="4">4</button>
                            <button class="calc-btn calc-num" data-value="5">5</button>
                            <button class="calc-btn calc-num" data-value="6">6</button>
                            <button class="calc-btn calc-op" data-action="subtract">−</button>
                            <button class="calc-btn calc-num" data-value="1">1</button>
                            <button class="calc-btn calc-num" data-value="2">2</button>
                            <button class="calc-btn calc-num" data-value="3">3</button>
                            <button class="calc-btn calc-op" data-action="add">+</button>
                            <button class="calc-btn calc-num calc-wide" data-value="0">0</button>
                            <button class="calc-btn calc-num" data-value=".">.</button>
                            <button class="calc-btn calc-equals" data-action="equals">=</button>
                        </div>
                    </div>
                `;
        },

        initEvents(windowElement) {
        const display = windowElement.querySelector('#calc-display');
        if (!display) return;

        windowElement.setAttribute('tabindex', '0');
        windowElement.style.outline = 'none';

        let current = '0';
        let previous = null;
        let operation = null;
        let resetNext = false;

        const formatDisplay = (val) => {
            if (val === 'Error') return val;
            const num = parseFloat(val);
            if (isNaN(num)) return '0';
            const str = String(num);
            if (str.length > 12) return num.toPrecision(8);
            return str;
        };

        const updateDisplay = () => {
            display.textContent = formatDisplay(current);
            const len = display.textContent.length;
            display.style.fontSize = len > 9 ? '28px' : len > 7 ? '34px' : '42px';
        };

        const updateActiveOp = () => {
            windowElement.querySelectorAll('.calc-op').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.action === operation && resetNext);
            });
        };

        const calculate = (a, op, b) => {
            const x = parseFloat(a), y = parseFloat(b);
            switch (op) {
                case 'add': return x + y;
                case 'subtract': return x - y;
                case 'multiply': return x * y;
                case 'divide': return y === 0 ? 'Error' : x / y;
                default: return y;
            }
        };

        const handleInput = (val, action) => {
            if (val !== undefined) {
                if (val === '.') {
                    if (resetNext) { current = '0'; resetNext = false; }
                    if (!current.includes('.')) current += '.';
                } else {
                    if (current === '0' || resetNext) { current = val; resetNext = false; }
                    else current += val;
                }
                updateActiveOp();
                updateDisplay();
                return;
            }

            switch (action) {
                case 'clear':
                    current = '0'; previous = null; operation = null; resetNext = false;
                    break;
                case 'negate':
                    current = String(parseFloat(current) * -1);
                    break;
                case 'percent':
                    current = String(parseFloat(current) / 100);
                    break;
                case 'equals':
                    if (operation && previous !== null) {
                        const result = calculate(previous, operation, current);
                        current = String(result);
                        previous = null;
                        operation = null;
                        resetNext = true;
                    }
                    break;
                default:
                    if (operation && previous !== null && !resetNext) {
                        const result = calculate(previous, operation, current);
                        current = String(result);
                    }
                    previous = current;
                    operation = action;
                    resetNext = true;
                    break;
            }
            updateActiveOp();
            updateDisplay();
        };

        windowElement.querySelectorAll('.calc-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                handleInput(btn.dataset.value, btn.dataset.action);
            });
        });

        windowElement.addEventListener('mousedown', () => windowElement.focus());
        windowElement.focus();

        const keyHandler = (e) => {
            if (document.activeElement !== windowElement) return;
            if (e.key >= '0' && e.key <= '9') {
                handleInput(e.key);
            } else if (e.key === '.') {
                handleInput('.');
            } else if (e.key === '+') {
                handleInput(undefined, 'add');
            } else if (e.key === '-') {
                handleInput(undefined, 'subtract');
            } else if (e.key === '*') {
                handleInput(undefined, 'multiply');
            } else if (e.key === '/') {
                e.preventDefault();
                handleInput(undefined, 'divide');
            } else if (e.key === 'Enter' || e.key === '=') {
                handleInput(undefined, 'equals');
            } else if (e.key === 'Escape') {
                handleInput(undefined, 'clear');
            } else if (e.key === '%') {
                handleInput(undefined, 'percent');
            } else if (e.key === 'Backspace') {
                if (current.length > 1) current = current.slice(0, -1);
                else current = '0';
                updateActiveOp();
                updateDisplay();
            }
        };

        windowElement.addEventListener('keydown', keyHandler);
        updateActiveOp();
        updateDisplay();
        }
    };

    root.BrowAppCalculator = CalculatorApp;
    if (root.AppRegistry) {
        root.AppRegistry.register('calculator', CalculatorApp);
    }
})(typeof window !== 'undefined' ? window : this);
