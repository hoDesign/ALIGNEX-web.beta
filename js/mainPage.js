(() => {
  'use strict';

  const UI = window.ALIGNEXUI;
  if (!UI) return;
  const { clamp, desktopScale, motion, animate, play, PanelSwitcher } = UI;
  const comfort = document.querySelector('#comfort');
  const process = document.querySelector('#process');
  const processVideo = process.querySelector('.processVideo');
  const processTitle = process.querySelector('.processTitle');
  const processSkip = process.querySelector('[data-process-skip]');
  const values = document.querySelector('#values');
  const valuesStage = values.querySelector('.valuesStage');
  const valuesControls = values.querySelector('.valuesControls');
  const valuePanels = [...values.querySelectorAll('.valuePanel')];
  const valuesToggle = values.querySelector('[data-values-toggle]');
  const persona = document.querySelector('#persona');
  const personaController = UI.getPersonaController(persona);
  const valueVideos = valuePanels.flatMap(panel => [...panel.querySelectorAll('video')]);
  const valuesIndicators = [...values.querySelectorAll('[data-values-panel]')];
  const valuesStatus = values.querySelector('[data-values-status]');
  const valueBackground = window.ALIGNEXMembrane?.mount(values.querySelector('[data-membrane-background]'));
  const VALUES_DURATION = 3000;
  valueVideos.forEach(video => video.pause());

  const processState = {
    status: 'idle',
    progress: 0,
    startedAt: null,
    completedAt: null,
    firstPlayOpacity: null,
    reason: null
  };
  let processAnimation = null;
  let previousY = window.scrollY;
  let processBypass = false;
  let touchY = null;
  let scrollFrame = 0;
  let valuesFrame = 0;
  let valuesElapsed = 0;
  let valuesStartedAt = null;
  let valuesVisible = false;
  let valuesControlsVisible = false;
  let valuesPaused = motion.reduced;
  let valuesComplete = false;
  let valuesChanges = 0;
  let lastValuesReason = null;
  let geometry = {};

  function measure() {
    geometry = {
      comfort: comfort.offsetTop,
      process: process.offsetTop,
      values: values.offsetTop,
      valuesEnd: values.offsetTop + values.offsetHeight,
      viewport: window.innerHeight
    };
  }

  function scrollToProcess() {
    window.scrollTo({ top: geometry.process, behavior: 'instant' });
    previousY = geometry.process;
  }

  function renderProcess(progress) {
    processState.progress = progress;
    processVideo.style.opacity = String(progress);
    processTitle.style.opacity = String(clamp(progress / 0.2));
    process.dataset.introProgress = progress.toFixed(4);
    if (progress > 0.4 && processState.status === 'playing' && processState.firstPlayOpacity === null && !motion.reduced && !document.hidden) {
      processState.firstPlayOpacity = progress;
      play(processVideo);
    }
  }

  function refreshProcessMedia() {
    const rect = process.getBoundingClientRect();
    const visible = rect.bottom > innerHeight * 0.1 && rect.top < innerHeight * 0.9;
    processVideo.controls = motion.reduced || processVideo.dataset.playback === 'needs-action';
    if (!visible || document.hidden || motion.reduced) processVideo.pause();
    else if (processState.status === 'complete' || processState.progress > 0.4) play(processVideo);
  }

  function finishProcess(reason = 'complete') {
    if (processAnimation) processAnimation();
    processAnimation = null;
    processState.status = 'complete';
    processState.reason = reason;
    processState.completedAt = performance.now();
    process.dataset.introState = 'complete';
    renderProcess(1);
    const restoreFocus = document.activeElement === processSkip;
    processSkip.hidden = true;
    if (restoreFocus) process.focus({ preventScroll: true });
    refreshProcessMedia();
  }

  function startProcess() {
    if (processState.status !== 'idle') return;
    if (motion.reduced) {
      finishProcess('reduced-motion');
      return;
    }
    processState.status = 'playing';
    processState.startedAt = performance.now();
    process.dataset.introState = 'playing';
    processSkip.hidden = false;
    scrollToProcess();
    processAnimation = animate(2000, renderProcess, () => finishProcess());
  }

  function isEditable(target) {
    return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function onWheel(event) {
    if (processState.status !== 'playing' || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (event.deltaY < 0) finishProcess('reverse');
    else if (event.deltaY > 0) event.preventDefault();
  }

  function onKeyDown(event) {
    if (processState.status !== 'playing' || isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') {
      finishProcess('skip');
      return;
    }
    if (event.key === ' ' && event.target instanceof Element && event.target.closest('button, [role="button"]')) return;
    const backward = ['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey);
    if (backward) finishProcess('reverse');
    else if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) event.preventDefault();
  }

  function onTouchMove(event) {
    if (processState.status !== 'playing' || touchY === null || !event.touches.length) return;
    const delta = touchY - event.touches[0].clientY;
    if (delta < -2) finishProcess('reverse');
    else if (delta > 2) event.preventDefault();
  }

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('touchstart', event => {
    touchY = event.touches[0]?.clientY ?? null;
  }, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', () => { touchY = null; }, { passive: true });
  processSkip.addEventListener('click', () => finishProcess('skip'));

  // values: 진행률과 영상을 같은 재생 상태로 제어
  function canPlayValues() {
    return valuesVisible && !valuesPaused && !valuesComplete && !document.hidden && !valueSwitcher.busy;
  }

  function renderValuesProgress() {
    valuesStage.style.setProperty('--playback-progress', String(clamp(valuesElapsed / VALUES_DURATION)));
  }

  function stopValuesClock() {
    if (valuesStartedAt !== null) {
      valuesElapsed = Math.min(VALUES_DURATION, valuesElapsed + performance.now() - valuesStartedAt);
    }
    valuesStartedAt = null;
    cancelAnimationFrame(valuesFrame);
    valuesFrame = 0;
    renderValuesProgress();
  }

  function refreshValueMedia() {
    valueBackground?.setActive(canPlayValues() && valueSwitcher.current === 1);
    valuePanels.forEach((panel, index) => {
      panel.querySelectorAll('video').forEach(video => {
        if (canPlayValues() && index === valueSwitcher.current) {
          if (video.paused) play(video);
        } else video.pause();
      });
    });
  }

  function renderValuesControls() {
    const label = valuesComplete ? '처음부터 재생' : valuesPaused ? '재생' : '일시정지';
    valuesToggle.setAttribute('aria-pressed', String(valuesPaused));
    valuesToggle.setAttribute('aria-label', label);
    valuesToggle.title = label;
    valuesToggle.querySelector('.playbackPauseIcon').hidden = valuesPaused || valuesComplete;
    valuesToggle.querySelector('.playbackPlayIcon').hidden = !valuesPaused || valuesComplete;
    valuesToggle.querySelector('.playbackRestartIcon').hidden = !valuesComplete;
    valuesStage.classList.toggle('is-paused', valuesPaused);
  }

  function refreshValuesPlayback() {
    stopValuesClock();
    renderValuesControls();
    refreshValueMedia();
    if (canPlayValues()) {
      valuesStartedAt = performance.now();
      valuesFrame = requestAnimationFrame(tickValues);
    }
  }

  function tickValues(now) {
    valuesFrame = 0;
    if (!canPlayValues()) {
      refreshValuesPlayback();
      return;
    }
    valuesElapsed = Math.min(VALUES_DURATION, valuesElapsed + now - valuesStartedAt);
    valuesStartedAt = now;
    renderValuesProgress();
    if (valuesElapsed >= VALUES_DURATION) {
      if (valueSwitcher.current === valuePanels.length - 1) {
        // 마지막 장면: 진행률 100%를 유지하고 다시 재생을 기다림
        valuesComplete = true;
        valuesPaused = true;
        lastValuesReason = 'complete';
        refreshValuesPlayback();
        valuesStatus.textContent = '모든 장면 재생 완료. 처음부터 다시 재생할 수 있습니다.';
      } else selectValue(valueSwitcher.current + 1, 'timer');
    } else valuesFrame = requestAnimationFrame(tickValues);
  }

  function updateValueMedia(index) {
    values.dataset.activeArticle = String(index + 1);
    valuesIndicators.forEach((button, buttonIndex) => {
      button.classList.toggle('is-active', buttonIndex === index);
      button.setAttribute('aria-current', String(buttonIndex === index));
    });
    valuesStatus.textContent = valuesIndicators[index].getAttribute('aria-label');
    refreshValueMedia();
  }

  const valueSwitcher = new PanelSwitcher(valuesStage, valuePanels, {
    duration: 300,
    onSwap: updateValueMedia,
    onSettled: refreshValuesPlayback
  });

  function resetValueVideos(index) {
    valuePanels[index].querySelectorAll('video').forEach(video => {
      video.pause();
      video.currentTime = 0;
    });
  }

  function selectValue(index, reason) {
    stopValuesClock();
    valuesElapsed = 0;
    valuesComplete = false;
    renderValuesProgress();
    resetValueVideos(index);
    lastValuesReason = reason;
    if (valueSwitcher.current !== index || valueSwitcher.busy) {
      valuesChanges++;
      valueSwitcher.set(index);
      // 정지 중 선택한 장면은 페이드 없이 표시
      if (valuesPaused && valueSwitcher.busy) valueSwitcher.finishImmediately();
    }
    refreshValuesPlayback();
  }

  valuesToggle.addEventListener('click', () => {
    if (valuesComplete) {
      valuesPaused = false;
      valuePanels.forEach((_, index) => resetValueVideos(index));
      selectValue(0, 'restart');
      if (valueSwitcher.busy) valueSwitcher.finishImmediately();
      return;
    }
    valuesPaused = !valuesPaused;
    if (valuesPaused && valueSwitcher.busy) valueSwitcher.finishImmediately();
    refreshValuesPlayback();
  });
  valuesIndicators.forEach(button => {
    button.addEventListener('click', () => selectValue(Number(button.dataset.valuesPanel), 'indicator'));
  });
  // 비동기 재생 요청이 완료돼도 정지 상태와 숨겨진 장면은 유지
  valueVideos.forEach(video => video.addEventListener('playing', () => {
    if (!canPlayValues() || !valuePanels[valueSwitcher.current].contains(video)) video.pause();
  }));
  updateValueMedia(valueSwitcher.current);
  renderValuesControls();
  renderValuesProgress();

  // 캐러셀과 동일하게 70vh에서 등장하고 화면 하단에서 원래 위치에 안착.
  function updateValuesControlsPosition() {
    const rect = valuesStage.getBoundingClientRect();
    const bottom = parseFloat(getComputedStyle(valuesControls).bottom) || 0;
    const naturalBottom = rect.bottom - bottom;
    valuesControlsVisible = rect.top <= innerHeight * (valuesControlsVisible ? .8 : .7) && naturalBottom > 0;
    const offset = Math.min(0, innerHeight - 24 * desktopScale() - naturalBottom);
    valuesControls.style.setProperty('--values-controls-offset', `${offset}px`);
    valuesControls.classList.add('is-scroll-managed');
    valuesControls.classList.toggle('is-visible', valuesControlsVisible);
    valuesControls.inert = !valuesControlsVisible;
    valuesControls.setAttribute('aria-hidden', String(!valuesControlsVisible));
  }

  function updateScroll() {
    scrollFrame = 0;
    const y = window.scrollY;
    const forward = y >= previousY;
    const exitStart = geometry.comfort + 120 * desktopScale();
    const exitProgress = clamp((y - exitStart) / Math.max(1, geometry.process - exitStart));
    comfort.style.setProperty('--exit-progress', exitProgress.toFixed(4));
    if (processState.status === 'idle' && y >= geometry.process - 1 && previousY < geometry.process + 1 && forward) {
      if (processBypass) finishProcess('anchor');
      else startProcess();
    } else if (processState.status === 'playing') {
      if (y < geometry.process - 2) finishProcess('reverse');
      else if (y > geometry.process + 2) scrollToProcess();
    }
    processBypass = false;
    refreshProcessMedia();
    updateValuesControlsPosition();

    const activeY = window.scrollY;
    const isVisible = activeY >= geometry.values - 1 && activeY < geometry.valuesEnd - geometry.viewport * 0.5;
    if (isVisible !== valuesVisible) {
      valuesVisible = isVisible;
      refreshValuesPlayback();
    }
    previousY = window.scrollY;
  }

  function queueScroll() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }

  // 앵커 이동: 뒤쪽 섹션으로 이동할 때 인트로 재진입 방지
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href*="#"]') : null;
    if (!anchor) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return;
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (target && target.offsetTop >= geometry.values) processBypass = true;
  });
  window.addEventListener('hashchange', () => {
    if (window.scrollY >= geometry.values && processState.status === 'idle') finishProcess('anchor');
  });
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', () => {
    measure();
    if (processState.status === 'playing') scrollToProcess();
    queueScroll();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && processState.status === 'playing') finishProcess('visibility');
    refreshProcessMedia();
    refreshValuesPlayback();
  });
  motion.subscribe(reduced => {
    document.documentElement.classList.toggle('reducedMotion', reduced);
    if (reduced && processState.status !== 'complete') finishProcess('reduced-motion');
    if (reduced) valuesPaused = true;
    refreshProcessMedia();
    refreshValuesPlayback();
  });

  measure();
  process.dataset.introState = 'idle';
  processSkip.hidden = true;
  processVideo.style.opacity = '0';
  processTitle.style.opacity = '0';
  document.documentElement.classList.toggle('reducedMotion', motion.reduced);
  let initialAnchor = null;
  try {
    initialAnchor = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  } catch (_) {
    // 앵커 해석: 잘못된 URL 조각은 건너뜀
  }
  if (motion.reduced) finishProcess('reduced-motion');
  else if (initialAnchor && initialAnchor.offsetTop >= geometry.values) finishProcess('anchor');
  else if (window.scrollY >= geometry.values) finishProcess(location.hash ? 'anchor' : 'restored-position');
  updateScroll();
  window.addEventListener('load', () => {
    measure();
    if (window.scrollY >= geometry.values && processState.status === 'idle') finishProcess(location.hash ? 'anchor' : 'restored-position');
    queueScroll();
  }, { once: true });

  Object.defineProperty(window, 'ALIGNEXSite', {
    value: Object.freeze({
      getState: () => ({
        reducedMotion: motion.reduced,
        process: { ...processState },
        values: {
          current: valueSwitcher.current + 1,
          transitioning: valueSwitcher.busy,
          visible: valuesVisible,
          paused: valuesPaused,
          complete: valuesComplete,
          running: canPlayValues(),
          elapsedMs: valuesElapsed,
          progress: clamp(valuesElapsed / VALUES_DURATION),
          durationMs: VALUES_DURATION,
          background: valueBackground?.getState() ?? null,
          changes: valuesChanges,
          lastReason: lastValuesReason
        },
        persona: personaController.getState()
      })
    }),
    writable: false,
    configurable: false
  });
})();
