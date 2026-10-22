import { registerApp } from '../../core/appRegistry.js';

registerApp({
  id: 'calculator',
  title: 'Calculator',
  defaultSize: { w: 340, h: 480 },
  singleton: true,

  mount(root) {
    root.innerHTML = `
      <div class="calc">
        <div class="calc-display">
          <div class="calc-expression" aria-live="polite"></div>
          <input class="calc-screen" aria-label="Calculator display"
                 value="0" readonly>
        </div>
        <div class="calc-keys">
          <button data-action="clear" class="calc-muted">AC</button>
          <button data-action="delete" class="calc-muted">⌫</button>
          <button data-value="(" class="calc-muted">(</button>
          <button data-value=")" class="calc-muted">)</button>

          <button data-value="7">7</button>
          <button data-value="8">8</button>
          <button data-value="9">9</button>
          <button data-value="/" class="calc-op">÷</button>

          <button data-value="4">4</button>
          <button data-value="5">5</button>
          <button data-value="6">6</button>
          <button data-value="*" class="calc-op">×</button>

          <button data-value="1">1</button>
          <button data-value="2">2</button>
          <button data-value="3">3</button>
          <button data-value="-" class="calc-op">−</button>

          <button data-value="0">0</button>
          <button data-value=".">.</button>
          <button data-action="equals" class="calc-equals">=</button>
          <button data-value="+" class="calc-op">+</button>
        </div>
        <details class="calc-history">
          <summary>Calculation history</summary>
          <ol class="calc-history-list"></ol>
          <button type="button" data-action="clear-history">Clear history</button>
        </details>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .calc {
        height: 100%;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #101419;
        color: #b6beca;
        font-family: system-ui, sans-serif;
        box-sizing: border-box;
        overflow: auto;
      }
      .calc-display {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 90px;
        padding: 12px;
        border-radius: 12px;
        background: #0a0c0f;
        box-sizing: border-box;
      }
      .calc-expression {
        min-height: 20px;
        color: #8c929c;
        text-align: right;
        overflow-wrap: anywhere;
        font-size: 13px;
      }
      .calc-screen {
        width: 100%;
        padding: 0;
        border: 0;
        outline: none;
        color: #b6beca;
        background: transparent;
        text-align: right;
        font-size: 32px;
        box-sizing: border-box;
      }
      .calc-keys {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        grid-auto-rows: minmax(42px, 1fr);
        gap: 8px;
        flex: 1;
        min-height: 240px;
      }
      .calc-keys button, .calc-history button {
        border: 1px solid #30373d;
        border-radius: 9px;
        background: #1c252c;
        color: #b6beca;
        font-size: 17px;
      }
      .calc-keys button:hover, .calc-history button:hover {
        background: #30373d;
      }
      .calc-keys .calc-muted { color: #a1a8b3; }
      .calc-keys .calc-op { color: #78dba9; }
      .calc-keys .calc-equals {
        color: #0a0c0f;
        background: #78dba9;
        border-color: #78dba9;
        font-weight: bold;
      }
      .calc-history {
        font-size: 12px;
        color: #8c929c;
      }
      .calc-history summary { cursor: pointer; padding: 4px 0; }
      .calc-history-list {
        max-height: 80px;
        overflow: auto;
        padding-left: 24px;
        overflow-wrap: anywhere;
      }
      .calc-history button { padding: 6px 10px; font-size: 12px; }
    `;
    root.appendChild(style);

    const screen = root.querySelector('.calc-screen');
    const expressionLabel = root.querySelector('.calc-expression');
    const historyList = root.querySelector('.calc-history-list');
    const keys = root.querySelector('.calc-keys');

    let expression = '';
    let justEvaluated = false;
    let history = [];
    let destroyed = false;

    function showExpression() {
      screen.value = expression || '0';
    }

    function formatResult(value) {
      if (!Number.isFinite(value)) throw new Error('Result is not finite');
      return String(Number(value.toPrecision(12)));
    }

    // Parse arithmetic explicitly; never execute user input as JavaScript.
    function calculate(source) {
      const tokens = source.match(
        /(?:\d+\.?\d*|\.\d+)|[()+\-*/%]/g
      ) || [];

      if (tokens.join('') !== source.replace(/\s+/g, '')) {
        throw new Error('Invalid expression');
      }

      let pos = 0;

      function primary() {
        const token = tokens[pos++];

        if (token === '+' || token === '-') {
          const value = primary();
          return token === '-' ? -value : value;
        }

        if (token === '(') {
          const value = addSub();
          if (tokens[pos++] !== ')') throw new Error('Missing )');
          return value;
        }

        if (token === undefined || !/^(?:\d+\.?\d*|\.\d+)$/.test(token)) {
          throw new Error('Expected a number');
        }

        return Number(token);
      }

      function percent() {
        let value = primary();
        while (tokens[pos] === '%') {
          pos++;
          value /= 100;
        }
        return value;
      }

      function mulDiv() {
        let value = percent();

        while (['*', '/'].includes(tokens[pos])) {
          const op = tokens[pos++];
          const right = percent();

          if (op === '/' && right === 0) throw new Error('Cannot divide by zero');
          value = op === '*' ? value * right : value / right;
        }

        return value;
      }

      function addSub() {
        let value = mulDiv();

        while (['+', '-'].includes(tokens[pos])) {
          const op = tokens[pos++];
          const right = mulDiv();
          value = op === '+' ? value + right : value - right;
        }

        return value;
      }

      const result = addSub();
      if (pos !== tokens.length) throw new Error('Invalid expression');
      return result;
    }

    function renderHistory() {
      historyList.replaceChildren();

      for (const item of history) {
        const li = document.createElement('li');
        li.textContent = `${item.expression} = ${item.result}`;
        historyList.appendChild(li);
      }
    }

    function evaluate() {
      if (!expression.trim()) return;

      try {
        const original = expression;
        const result = formatResult(calculate(expression));
        history.unshift({ expression: original, result });
        history = history.slice(0, 30);

        expressionLabel.textContent = original + ' =';
        expression = result;
        justEvaluated = true;
        showExpression();
        renderHistory();
      } catch (error) {
        expressionLabel.textContent = error.message || 'Invalid expression';
      }
    }

    function insert(value) {
      if (justEvaluated && /[\d.(]/.test(value)) {
        expression = '';
        expressionLabel.textContent = '';
      }

      justEvaluated = false;
      expression += value;
      showExpression();
    }

    function clear() {
      expression = '';
      justEvaluated = false;
      expressionLabel.textContent = '';
      showExpression();
    }

    function handleAction(action) {
      if (action === 'clear') clear();
      if (action === 'delete') {
        expression = expression.slice(0, -1);
        justEvaluated = false;
        showExpression();
      }
      if (action === 'equals') evaluate();
      if (action === 'clear-history') {
        history = [];
        renderHistory();
      }
    }

    keys.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;

      if (button.dataset.action) {
        handleAction(button.dataset.action);
      } else if (button.dataset.value) {
        insert(button.dataset.value);
      }
    });

    function onKeydown(event) {
      if (destroyed || event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement &&
          target.closest('input, textarea, [contenteditable="true"]')) return;

      if (/^[0-9.+\-*/()%]$/.test(event.key)) {
        event.preventDefault();
        insert(event.key);
      } else if (event.key === 'Enter' || event.key === '=') {
        event.preventDefault();
        evaluate();
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        handleAction('delete');
      } else if (event.key === 'Escape') {
        clear();
      }
    }

    document.addEventListener('keydown', onKeydown);
    showExpression();

    this._cleanup = () => {
      destroyed = true;
      document.removeEventListener('keydown', onKeydown);
      style.remove();
    };
  },

  unmount() {
    this._cleanup?.();
    this._cleanup = null;
  },
});
