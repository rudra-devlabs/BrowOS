/* BrowOS platform controls: custom selects plus safe styling hooks for native inputs. */
(function () {
    'use strict';

    let openSelect = null;
    let selectMenu = null;

    const isHidden = (el) => el.hidden || el.type === 'hidden' || el.closest('[hidden]');
    const shouldAutoStyleButton = (el) => !el.className && !el.closest('#dock, .window-control, .mac-context-menu');
    const shouldAutoStyleInput = (el) => !el.className && !isHidden(el) && !['file', 'range', 'checkbox', 'radio', 'color'].includes(el.type);

    function enhanceBasics(root = document) {
        root.querySelectorAll?.('button').forEach((button) => {
            if (shouldAutoStyleButton(button)) button.classList.add('brow-auto-control');
        });
        root.querySelectorAll?.('input, textarea').forEach((input) => {
            if (shouldAutoStyleInput(input)) input.classList.add('brow-auto-control');
        });
        root.querySelectorAll?.('input[type="range"]').forEach((input) => input.classList.add('brow-range'));
    }

    function closeSelect() {
        if (!openSelect) return;
        openSelect.classList.remove('is-open');
        selectMenu?.remove();
        selectMenu = null;
        openSelect = null;
    }

    function positionMenu(wrapper, menu) {
        const rect = wrapper.querySelector('.brow-select-trigger').getBoundingClientRect();
        const gap = 7;
        const menuWidth = Math.max(rect.width, 150);
        const menuHeight = Math.min(menu.scrollHeight, Math.floor(window.innerHeight * .42));
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
        const below = window.innerHeight - rect.bottom - gap;
        const top = below >= menuHeight || rect.top < menuHeight ? rect.bottom + gap : rect.top - menuHeight - gap;
        menu.style.left = `${left}px`;
        menu.style.top = `${Math.max(8, top)}px`;
        menu.style.width = `${menuWidth}px`;
    }

    function syncSelect(wrapper) {
        const select = wrapper.querySelector('select');
        const trigger = wrapper.querySelector('.brow-select-trigger');
        if (!select || !trigger) return;
        const option = select.options[select.selectedIndex];
        trigger.textContent = option?.textContent || '';
        wrapper.classList.toggle('is-disabled', select.disabled);
        wrapper.querySelectorAll('.brow-select-option').forEach((item) => {
            const selected = item.dataset.value === select.value;
            item.classList.toggle('is-selected', selected);
            item.setAttribute('aria-selected', String(selected));
        });
    }

    function enhanceSelect(select) {
        if (select.dataset.browEnhanced === 'true' || isHidden(select)) return;
        select.dataset.browEnhanced = 'true';
        const wrapper = document.createElement('div');
        wrapper.className = `brow-select ${select.className || ''}`.trim();
        if (select.id) wrapper.dataset.selectId = select.id;
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);
        select.classList.add('brow-select-native');

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'brow-select-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        wrapper.appendChild(trigger);

        select.addEventListener('change', () => syncSelect(wrapper));
        trigger.addEventListener('click', (event) => {
            event.stopPropagation();
            if (select.disabled) return;
            if (openSelect === wrapper) { closeSelect(); return; }
            closeSelect();
            openSelect = wrapper;
            wrapper.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            selectMenu = document.createElement('div');
            selectMenu.className = 'brow-select-menu';
            selectMenu.setAttribute('role', 'listbox');
            [...select.options].forEach((option, index) => {
                const item = document.createElement('div');
                item.className = 'brow-select-option';
                item.dataset.value = option.value;
                item.dataset.index = String(index);
                item.setAttribute('role', 'option');
                item.textContent = option.textContent;
                item.addEventListener('click', () => {
                    if (select.selectedIndex !== index) {
                        select.selectedIndex = index;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    closeSelect();
                    trigger.focus();
                });
                selectMenu.appendChild(item);
            });
            document.body.appendChild(selectMenu);
            syncSelect(wrapper);
            positionMenu(wrapper, selectMenu);
        });

        trigger.addEventListener('keydown', (event) => {
            if (openSelect === wrapper && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                const next = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + step));
                if (next !== select.selectedIndex) {
                    select.selectedIndex = next;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                return;
            }
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                trigger.click();
            } else if (event.key === 'Escape') closeSelect();
        });
        syncSelect(wrapper);
    }

    function enhance(root = document) {
        enhanceBasics(root);
        root.querySelectorAll?.('select').forEach(enhanceSelect);
    }

    document.addEventListener('click', (event) => {
        if (openSelect && !openSelect.contains(event.target) && !selectMenu?.contains(event.target)) closeSelect();
    });
    window.addEventListener('resize', () => { if (openSelect && selectMenu) positionMenu(openSelect, selectMenu); }, { passive: true });
    window.addEventListener('scroll', () => { if (openSelect && selectMenu) positionMenu(openSelect, selectMenu); }, { passive: true, capture: true });

    enhance(document);
    new MutationObserver((mutations) => {
        mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) enhance(node);
        }));
    }).observe(document.body, { childList: true, subtree: true });
})();
