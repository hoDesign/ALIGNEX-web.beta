(() => {
  'use strict';
  const root = document.querySelector('.purchase');
  if (!root) return;
  const form = root.querySelector('.purchaseForm');
  if (!form) return;

  const steps = ['gender', 'color', 'size', 'package'];
  const state = Object.fromEntries(steps.map(key => [key, null]));
  const quantities = { suit: 1, device: 1, dock: 1 };
  const quantityLabels = { suit: 'Suit', device: 'Device', dock: 'Dock' };
  const customOption = form.querySelector('[data-custom-option]');
  const customEditor = form.querySelector('[data-custom-quantities]');
  const labels = { gender: '성별', color: '색상', size: '사이즈', package: '제품 구성' };
  const status = root.querySelector('#purchase-status');
  const hint = root.querySelector('[data-purchase-hint]');
  const actions = [...root.querySelectorAll('[data-purchase-action]')];
  const dialog = document.querySelector('.purchaseDialog');
  let lastAction = null;
  const configuration = () => ({ ...state, ...(state.package === 'custom' ? { quantities: { ...quantities } } : {}) });
  const notifyConfiguration = () => root.dispatchEvent(new CustomEvent('alignex:configurationchange', { bubbles: true, detail: configuration() }));
  const packageAnimations = new Set();
  const packageMotion = window.ALIGNEXUI.motion;
  const cancelPackageAnimations = () => {
    packageAnimations.forEach(animation => animation.cancel());
    packageAnimations.clear();
  };
  const packageCards = () => ['single', 'duo', 'custom'].map(value => ({
    value,
    element: value === 'custom' && !customEditor.hidden
      ? customEditor
      : form.querySelector(`input[name="package"][value="${value}"] + .purchaseOptionFace`)
  }));
  const measurePackageCards = () => packageCards().map(({ value, element }) => {
    const rect = element.getBoundingClientRect();
    return { value, width: rect.width, height: rect.height,
      radius: Math.min(parseFloat(getComputedStyle(element).borderRadius), rect.height / 2) };
  });
  function animatePackageCards(before) {
    const timing = { duration: 360, easing: 'cubic-bezier(.22, 1, .36, 1)' };
    const play = (element, frames, options = timing) => {
      const animation = element.animate(frames, options);
      packageAnimations.add(animation);
      animation.onfinish = animation.oncancel = () => packageAnimations.delete(animation);
    };
    // Capture every final size before animations start changing the layout.
    const after = measurePackageCards();
    packageCards().forEach(({ value, element }, index) => {
      const from = before[index], to = after[index];
      if (!from.width || !to.width) return;
      if (Math.abs(from.width - to.width) > .5 || Math.abs(from.height - to.height) > .5) {
        play(element, [
          { width: `${from.width}px`, height: `${from.height}px`, borderRadius: `${from.radius}px` },
          { width: `${to.width}px`, height: `${to.height}px`, borderRadius: `${to.radius}px` }
        ]);
      }
      if (value === state.package) {
        const content = value === 'custom' ? [...customEditor.children] : [...element.querySelectorAll('.purchasePackageDescription')];
        content.forEach(child => play(child, [
          { opacity: 0, transform: 'translateY(5px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ]));
      }
    });
  }
  window.addEventListener('resize', cancelPackageAnimations);
  packageMotion.subscribe(reduced => { if (reduced) cancelPackageAnimations(); });

  function renderQuantities() {
    const custom = state.package === 'custom';
    customOption.hidden = custom;
    customEditor.hidden = !custom;
    customEditor.querySelectorAll('[data-quantity-input]').forEach(input => {
      input.disabled = !custom;
      input.value = String(quantities[input.dataset.quantityInput]);
    });
    customEditor.querySelectorAll('[data-quantity]').forEach(button => {
      button.disabled = !custom || (Number(button.dataset.delta) < 0 && quantities[button.dataset.quantity] <= 1);
    });
  }

  const selectedLabel = key => {
    const checked = form.querySelector(`input[name="${key}"]:checked`);
    return checked?.dataset.label || '';
  };

  function render(animatePackage = false) {
    const before = animatePackage && !packageMotion.reduced ? measurePackageCards() : null;
    cancelPackageAnimations();
    form.querySelectorAll('.purchaseOption--preset').forEach(option => {
      option.classList.toggle('is-expanded', option.querySelector('input').checked);
    });
    steps.forEach((key, index) => {
      const group = form.querySelector(`[data-step="${key}"]`);
      const shouldShow = index === 0 || steps.slice(0, index).every(previous => state[previous] !== null);
      const wasHidden = group.hidden;
      group.hidden = !shouldShow;
      group.disabled = !shouldShow;
      group.querySelector(`[data-selection="${key}"]`).textContent = state[key] && !(key === 'package' && state.package === 'custom') ? ` - ${selectedLabel(key)}` : '';
      if (shouldShow && wasHidden) {
        group.classList.remove('is-revealing');
        void group.offsetWidth;
        group.classList.add('is-revealing');
      }
    });
    renderQuantities();
    const missing = steps.find(key => state[key] === null);
    actions.forEach(button => { button.disabled = Boolean(missing); });
    hint.textContent = missing
      ? `${labels[missing]} 선택해 주세요.`
      : '선택 완료 · 표시 가격은 시작가이며 구성별 가격은 별도 확인이 필요합니다.';
    if (before) animatePackageCards(before);
  }

  form.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'radio') return;
    const index = steps.indexOf(input.name);
    if (index === -1 || input.closest('fieldset').disabled) return;
    const changed = state[input.name] !== input.value;
    state[input.name] = input.value;
    render(changed && input.name === 'package');
    if (state.package === 'custom' && document.activeElement === input) customEditor.querySelector('input').focus({ preventScroll: true });
    const next = steps.slice(index + 1).find(key => state[key] === null);
    status.textContent = `${labels[input.name]} ${selectedLabel(input.name)} 선택됨. ${next ? `${labels[next]} 선택 단계가 열렸습니다.` : '모든 옵션이 선택되었습니다.'}`;
    notifyConfiguration();
  });

  function setQuantity(key, value) {
    if (state.package !== 'custom' || !Object.hasOwn(quantities, key)) return;
    quantities[key] = Number.isSafeInteger(value) && value >= 1 ? value : quantities[key];
    renderQuantities();
    status.textContent = `${quantityLabels[key]} 수량 ${quantities[key]}개`;
    notifyConfiguration();
  }
  customEditor.addEventListener('click', event => {
    const button = event.target.closest('[data-quantity]');
    if (!button || button.disabled) return;
    const key = button.dataset.quantity;
    setQuantity(key, quantities[key] + Number(button.dataset.delta));
    if (button.disabled) customEditor.querySelector(`[data-quantity-input="${key}"]`).focus({ preventScroll: true });
  });
  customEditor.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-quantity-input]')) setQuantity(input.dataset.quantityInput, Number(input.value));
  });

  // 구매 옵션: 기본 폼 제출 방지
  form.addEventListener('submit', event => event.preventDefault());
  actions.forEach(button => button.addEventListener('click', () => {
    if (steps.some(key => state[key] === null)) return;
    lastAction = button;
    const detail = { action: button.dataset.purchaseAction, configuration: configuration() };
    const request = new CustomEvent('alignex:purchaseintent', { bubbles: true, cancelable: true, detail });
    // 구매 요청: 외부 처리기가 취소하지 않으면 선택 구성 표시
    if (!root.dispatchEvent(request)) return;
    if (!dialog) return;
    const summary = steps.map(key => `${labels[key]}: ${selectedLabel(key)}`);
    if (state.package === 'custom') summary.push(...Object.keys(quantities).map(key => `${quantityLabels[key]} ${quantities[key]}개`));
    dialog.querySelector('[data-dialog-selection]').textContent = summary.join(' / ');
    dialog.showModal();
  }));
  dialog?.addEventListener('close', () => lastAction?.focus());

  const image = root.querySelector('.purchaseImage');
  const fallback = root.querySelector('.purchaseImageFallback');
  const showImageError = () => { image.hidden = true; fallback.hidden = false; };
  image?.addEventListener('error', showImageError);
  if (image?.complete && image.naturalWidth === 0) showImageError();

  // 구매 옵션: 미선택 상태로 초기화
  form.reset();
  render();
})();
