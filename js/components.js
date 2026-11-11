(() => {
  'use strict';

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const desktopScale = () => Math.max(1, window.innerWidth / 1920);
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const subscribers = new Set();
  const motion = {
    get reduced() { return preference.matches; },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    }
  };
  preference.addEventListener('change', () => {
    for (const listener of subscribers) listener(preference.matches);
  });

  function animate(duration, update, complete = () => {}) {
    let frame = 0;
    let stopped = false;
    const startedAt = performance.now();
    const tick = now => {
      if (stopped) return;
      const progress = duration ? clamp((now - startedAt) / duration) : 1;
      update(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else complete();
    };
    update(0);
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }

  function play(video) {
    video.muted = true;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        // 영상 재생: 자동 재생 차단 시 직접 재생 허용
        video.controls = true;
        video.dataset.playback = 'needs-action';
      });
    }
  }

  /** 공통 영상: 화면 노출과 모션 설정에 따라 재생 */
  class AmbientMedia {
    constructor(videos) {
      this.videos = [...videos];
      this.visible = new WeakMap();
      this.enabled = new WeakMap();
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          this.visible.set(entry.target, entry.isIntersecting && entry.intersectionRatio > 0.1);
          this.update(entry.target);
        }
      }, { threshold: [0, 0.1, 0.5] });
      for (const video of this.videos) {
        this.enabled.set(video, true);
        this.observer.observe(video);
        this.update(video);
      }
      this.onVisibility = () => this.videos.forEach(video => this.update(video));
      document.addEventListener('visibilitychange', this.onVisibility);
      this.unsubscribe = motion.subscribe(this.onVisibility);
    }
    setEnabled(video, enabled) {
      this.enabled.set(video, enabled);
      this.update(video);
    }
    update(video) {
      video.controls = motion.reduced || video.dataset.playback === 'needs-action';
      if (this.enabled.get(video) && this.visible.get(video) && !document.hidden && !motion.reduced) {
        play(video);
      } else {
        video.pause();
      }
    }
    destroy() {
      this.observer.disconnect();
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.unsubscribe();
      this.videos.forEach(video => video.pause());
    }
  }

  /** 공통 패널: 300ms 페이드 전환 */
  class PanelSwitcher {
    constructor(container, panels, options = {}) {
      this.container = container;
      this.panels = [...panels];
      this.duration = options.duration ?? 300;
      this.onSwap = options.onSwap ?? (() => {});
      this.onSettled = options.onSettled ?? (() => {});
      this.current = Math.max(0, this.panels.findIndex(panel => panel.classList.contains('is-active')));
      this.desired = this.current;
      this.busy = false;
      this.phase = 'idle';
      this.cancelAnimation = null;
      this.generation = 0;
      this.panels.forEach((panel, index) => this.show(panel, index === this.current));
      // 패널 이미지: 첫 전환 전에 디코딩 시작
      this.panels.flatMap(panel => [...panel.querySelectorAll('img')]).forEach(img => {
        if (typeof img.decode === 'function') img.decode().catch(() => {});
      });
      this.unsubscribe = motion.subscribe(reduced => {
        if (reduced && this.busy) this.finishImmediately();
      });
    }
    show(panel, visible) {
      panel.hidden = !visible;
      panel.classList.toggle('is-active', visible);
      panel.setAttribute('aria-hidden', String(!visible));
      panel.style.opacity = visible ? '1' : '0';
    }
    set(index) {
      if (index < 0 || index >= this.panels.length) return false;
      this.desired = index;
      if (this.current === index && !this.busy) return false;
      const generation = ++this.generation;
      if (this.cancelAnimation) this.cancelAnimation();
      this.cancelAnimation = null;
      this.busy = true;
      this.container.dataset.transitioning = 'true';
      if (motion.reduced || !this.duration) {
        this.finishImmediately();
        return true;
      }
      const previous = this.panels[this.current];
      const fromOpacity = Number(previous.style.opacity || 1);
      const half = this.duration / 2;
      this.phase = 'out';
      this.cancelAnimation = animate(half, progress => {
        previous.style.opacity = String(fromOpacity * (1 - progress));
      }, () => {
        if (generation !== this.generation) return;
        this.show(previous, false);
        this.current = this.desired;
        const next = this.panels[this.current];
        this.show(next, true);
        next.style.opacity = '0';
        this.onSwap(this.current);
        this.phase = 'in';
        this.cancelAnimation = animate(half, progress => {
          next.style.opacity = String(progress);
        }, () => {
          if (generation !== this.generation) return;
          this.settle();
        });
      });
      return true;
    }
    settle() {
      this.cancelAnimation = null;
      this.busy = false;
      this.phase = 'idle';
      this.container.dataset.transitioning = 'false';
      this.panels.forEach((panel, index) => this.show(panel, index === this.current));
      this.onSettled(this.current);
    }
    finishImmediately() {
      this.generation++;
      if (this.cancelAnimation) this.cancelAnimation();
      this.current = this.desired;
      this.panels.forEach((panel, index) => this.show(panel, index === this.current));
      this.onSwap(this.current);
      this.settle();
    }
    destroy() {
      if (this.cancelAnimation) this.cancelAnimation();
      this.unsubscribe();
    }
  }

  /** 공통 페르소나: 질문 선택과 기본 화면 복귀 */
  class PersonaController {
    constructor(root) {
      this.root = root;
      this.content = root.querySelector('.personaContent');
      this.panels = [...root.querySelectorAll('.personaPanel')];
      this.questions = [...root.querySelectorAll('[data-panel]')];
      this.switcher = new PanelSwitcher(this.content, this.panels, {
        duration: 300,
        onSwap: index => { root.dataset.activePanel = this.panels[index].id; },
        onSettled: () => { this.content.setAttribute('aria-busy', 'false'); }
      });
      this.selected = this.switcher.current;
      root.dataset.activePanel = this.panels[this.selected].id;
      this.questions.forEach((button, buttonIndex) => {
        const panelIndex = this.panels.findIndex(panel => panel.id === button.dataset.panel);
        button.addEventListener('click', () => this.select(this.selected === panelIndex ? 0 : panelIndex));
        button.addEventListener('keydown', event => {
          if (event.key === 'Escape') {
            this.select(0);
          } else if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(event.key)) {
            event.preventDefault();
            const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
            this.questions[(buttonIndex + direction + this.questions.length) % this.questions.length].focus();
          }
        });
      });
      this.select(this.selected);
    }
    select(index) {
      if (index < 0 || index >= this.panels.length) return;
      this.selected = index;
      this.questions.forEach(button => {
        const selected = button.dataset.panel === this.panels[index].id;
        button.classList.toggle('is-active', selected);
        button.classList.toggle('dimmed', index !== 0 && !selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      this.content.setAttribute('aria-busy', String(this.switcher.current !== index || this.switcher.busy));
      this.switcher.set(index);
    }
    getState() {
      return {
        current: this.panels[this.switcher.current].id,
        selected: this.panels[this.selected].id,
        transitioning: this.switcher.busy
      };
    }
  }

  /** 공통 캐러셀: 3000ms 재생과 직접 가로 스크롤 */
  class CarouselController {
    constructor(root) {
      this.root = root;
      this.track = root.querySelector('[data-carousel-track]');
      this.slides = [...this.track.querySelectorAll('[data-carousel-slide]')];
      this.toggle = root.querySelector('[data-carousel-toggle]');
      this.controls = root.querySelector('.carouselControls');
      this.controlsVisible = false;
      this.controlsFrame = 0;
      this.dots = [...root.querySelectorAll('[data-carousel-dot]')];
      this.status = root.querySelector('[data-carousel-status]');
      this.active = 0;
      this.requested = null;
      this.frame = 0;
      this.duration = 3000;
      this.elapsed = 0;
      this.startedAt = null;
      this.playFrame = 0;
      this.visible = false;
      this.paused = motion.reduced;
      this.complete = false;
      this.dragging = false;
      this.scrolling = false;
      this.scrollTimer = 0;
      this.toggle?.addEventListener('click', () => {
        if (this.complete) {
          this.paused = false;
          this.select(0);
        } else {
          this.paused = !this.paused;
          this.refreshPlayback();
        }
      });
      this.dots.forEach(dot => dot.addEventListener('click', () => this.select(Number(dot.dataset.carouselDot))));
      this.track.addEventListener('scroll', () => {
        this.scrolling = true;
        this.refreshPlayback();
        clearTimeout(this.scrollTimer);
        this.scrollTimer = setTimeout(() => {
          this.scrolling = false;
          this.updateFromScroll();
          this.refreshPlayback();
        }, 160);
        this.queueUpdate();
      }, { passive: true });
      const resumeNativeScroll = () => {
        this.requested = null;
        this.queueUpdate();
      };
      this.track.addEventListener('pointerdown', () => {
        this.dragging = true;
        this.refreshPlayback();
        resumeNativeScroll();
      }, { passive: true });
      const release = () => {
        if (!this.dragging) return;
        this.dragging = false;
        this.refreshPlayback();
      };
      window.addEventListener('pointerup', release, { passive: true });
      window.addEventListener('pointercancel', release, { passive: true });
      this.track.addEventListener('wheel', resumeNativeScroll, { passive: true });
      this.track.addEventListener('keydown', event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', ' '].includes(event.key)) resumeNativeScroll();
      });
      window.addEventListener('resize', resumeNativeScroll);
      this.controls?.classList.add('is-scroll-managed');
      const queueControlsPosition = () => {
        if (this.controlsFrame) return;
        this.controlsFrame = requestAnimationFrame(() => {
          this.controlsFrame = 0;
          this.updateControlsPosition();
        });
      };
      window.addEventListener('scroll', queueControlsPosition, { passive: true });
      window.addEventListener('resize', queueControlsPosition);
      window.addEventListener('load', queueControlsPosition, { once: true });
      this.layoutObserver = new ResizeObserver(queueControlsPosition);
      this.layoutObserver.observe(document.querySelector('main'));
      this.layoutObserver.observe(this.track);
      document.addEventListener('visibilitychange', () => this.refreshPlayback());
      motion.subscribe(reduced => {
        if (reduced) this.paused = true;
        this.refreshPlayback();
      });
      this.observer = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .25;
        this.refreshPlayback();
      }, { threshold: [0, .25] });
      this.observer.observe(this.track);
      this.updateFromScroll();
      this.updateControlsPosition();
      this.refreshPlayback();
    }
    updateControlsPosition() {
      if (!this.controls) return;
      const bottom = this.root.getBoundingClientRect().bottom;
      const progress = clamp((innerHeight - bottom) / Math.max(1, innerHeight * .65));
      this.root.style.setProperty('--carousel-exit-progress', String(progress));
      const trackRect = this.track.getBoundingClientRect();
      const margin = parseFloat(getComputedStyle(this.controls).marginTop) || 0;
      const naturalBottom = trackRect.bottom + margin + this.controls.offsetHeight;
      // 카드 상단이 화면의 70% 지점에 도달하면 노출. 원래 위치보다 위로만 이동.
      // 작은 역방향 이동·버튼 포커스 이동에서는 노출 상태를 유지해 깜빡임 방지.
      const revealLine = innerHeight * (this.controlsVisible ? .8 : .7);
      const visible = trackRect.top <= revealLine && naturalBottom > 0;
      const offset = Math.min(0, innerHeight - 24 * desktopScale() - naturalBottom);
      this.controls.style.setProperty('--controls-offset', `${offset}px`);
      this.controls.classList.toggle('is-visible', visible);
      this.controls.inert = !visible;
      this.controls.setAttribute('aria-hidden', String(!visible));
      if (visible !== this.controlsVisible) {
        this.controlsVisible = visible;
        this.refreshPlayback();
      }
    }
    scrollLeftFor(index) {
      const trackRect = this.track.getBoundingClientRect();
      const padding = parseFloat(getComputedStyle(this.track).scrollPaddingLeft) || 0;
      const left = this.track.scrollLeft + this.slides[index].getBoundingClientRect().left - trackRect.left - this.track.clientLeft - padding;
      return Math.max(0, Math.min(this.track.scrollWidth - this.track.clientWidth, left));
    }
    select(index) {
      const target = Math.max(0, Math.min(this.slides.length - 1, index));
      this.stopClock();
      this.elapsed = 0;
      this.complete = false;
      this.requested = target;
      this.setActive(target);
      this.refreshPlayback();
      this.track.scrollTo({ left: this.scrollLeftFor(target), behavior: motion.reduced ? 'auto' : 'smooth' });
      this.queueUpdate();
    }
    queueUpdate() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.updateFromScroll();
        this.refreshPlayback();
      });
    }
    updateFromScroll() {
      // 버튼 이동: 중간 스크롤 위치가 다음 요청을 덮어쓰지 않도록 목표 유지
      if (this.requested !== null) {
        if (Math.abs(this.track.scrollLeft - this.scrollLeftFor(this.requested)) > 2) return;
        this.requested = null;
      }
      const maxScroll = this.track.scrollWidth - this.track.clientWidth;
      if (this.track.scrollLeft <= 1 || maxScroll <= 1) {
        this.setActive(0);
        return;
      }
      if (this.track.scrollLeft >= maxScroll - 1) {
        this.setActive(this.slides.length - 1);
        return;
      }
      const padding = parseFloat(getComputedStyle(this.track).scrollPaddingLeft) || 0;
      const start = this.track.getBoundingClientRect().left + this.track.clientLeft + padding;
      let nearest = 0;
      let distance = Infinity;
      this.slides.forEach((slide, index) => {
        const delta = Math.abs(slide.getBoundingClientRect().left - start);
        if (delta < distance) {
          distance = delta;
          nearest = index;
        }
      });
      this.setActive(nearest);
    }
    setActive(index) {
      if (index !== this.active) {
        this.stopClock();
        this.elapsed = 0;
        this.complete = false;
      }
      this.active = index;
      this.root.dataset.carouselActive = String(index);
      this.slides.forEach((slide, slideIndex) => {
        const active = slideIndex === index;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-current', String(active));
      });
      this.dots.forEach(dot => {
        const active = Number(dot.dataset.carouselDot) === index;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-current', String(active));
      });
      if (this.status) this.status.textContent = `${index + 1} / ${this.slides.length}`;
    }
    canPlay() {
      return this.visible && this.controlsVisible && !this.paused && !this.complete && !document.hidden &&
        this.requested === null && !this.dragging && !this.scrolling;
    }
    stopClock() {
      if (this.startedAt !== null) {
        this.elapsed = Math.min(this.duration, this.elapsed + performance.now() - this.startedAt);
      }
      this.startedAt = null;
      cancelAnimationFrame(this.playFrame);
      this.playFrame = 0;
    }
    renderPlayback() {
      this.root.style.setProperty('--playback-progress', String(clamp(this.elapsed / this.duration)));
      if (!this.toggle) return;
      const label = this.complete ? '처음부터 재생' : this.paused ? '재생' : '일시정지';
      this.toggle.setAttribute('aria-label', label);
      this.toggle.setAttribute('aria-pressed', String(this.paused));
      this.toggle.title = label;
      this.toggle.querySelector('.playbackPauseIcon').hidden = this.paused || this.complete;
      this.toggle.querySelector('.playbackPlayIcon').hidden = !this.paused || this.complete;
      this.toggle.querySelector('.playbackRestartIcon').hidden = !this.complete;
    }
    refreshPlayback() {
      this.stopClock();
      this.renderPlayback();
      if (this.canPlay()) {
        this.startedAt = performance.now();
        this.playFrame = requestAnimationFrame(now => this.tick(now));
      }
    }
    tick(now) {
      this.playFrame = 0;
      if (!this.canPlay()) {
        this.refreshPlayback();
        return;
      }
      this.elapsed = Math.min(this.duration, this.elapsed + now - this.startedAt);
      this.startedAt = now;
      this.renderPlayback();
      if (this.elapsed >= this.duration) {
        if (this.active === this.slides.length - 1) {
          this.complete = true;
          this.paused = true;
          this.refreshPlayback();
          if (this.status) this.status.textContent = '모든 카드 재생 완료. 처음부터 다시 재생할 수 있습니다.';
        } else this.select(this.active + 1);
      } else this.playFrame = requestAnimationFrame(time => this.tick(time));
    }
    getState() {
      return { current: this.active + 1, paused: this.paused, complete: this.complete,
        running: this.canPlay(), visible: this.visible, controlsVisible: this.controlsVisible, progress: clamp(this.elapsed / this.duration),
        elapsedMs: this.elapsed, durationMs: this.duration, transitioning: this.requested !== null };
    }

  }

  // 공통 초기화: 같은 섹션은 페이지마다 한 번만 연결
  const siteNav = document.querySelector('.siteNav');
  if (siteNav) {
    // Keep the colored symbol outside the navigation's difference blend group.
    const brandMark = siteNav.querySelector('.brandMark');
    const brandOverlay = brandMark ? brandMark.cloneNode(true) : null;
    const syncLogoVisibility = () => brandOverlay?.classList.toggle('is-scroll-hidden', siteNav.classList.contains('is-scroll-hidden'));
    if (brandOverlay) {
      brandOverlay.classList.add('siteNavBrandOverlay');
      brandOverlay.setAttribute('aria-hidden', 'true');
      siteNav.after(brandOverlay);
      const positionLogo = () => {
        const rect = brandMark.getBoundingClientRect();
        brandOverlay.style.left = `${rect.left}px`;
        brandOverlay.style.top = `${rect.top - siteNav.getBoundingClientRect().top}px`;
        brandOverlay.style.setProperty('--nav-logo-hide-y', `${-siteNav.offsetHeight}px`);
      };
      positionLogo();
      document.fonts.ready.then(positionLogo);
      window.addEventListener('resize', positionLogo);
    }
    let previousNavY = Math.max(0, window.scrollY);
    let navDirection = 0;
    let navDistance = 0;
    let navFrame = 0;
    const showNav = () => {
      siteNav.classList.remove('is-scroll-hidden');
      siteNav.inert = false;
      syncLogoVisibility();
    };
    const updateNav = () => {
      navFrame = 0;
      const y = clamp(window.scrollY, 0, Math.max(0, document.documentElement.scrollHeight - innerHeight));
      const delta = y - previousNavY;
      previousNavY = y;
      siteNav.classList.toggle('is-scrolled', y > siteNav.offsetHeight);
      if (y <= siteNav.offsetHeight) {
        navDistance = 0;
        showNav();
      } else if (delta) {
        const direction = Math.sign(delta);
        navDistance = direction === navDirection ? navDistance + Math.abs(delta) : Math.abs(delta);
        navDirection = direction;
        if (navDistance >= 8) {
          const hidden = direction > 0 && !siteNav.contains(document.activeElement);
          siteNav.classList.toggle('is-scroll-hidden', hidden);
          siteNav.inert = hidden;
        }
      }
      syncLogoVisibility();
    };
    siteNav.addEventListener('focusin', showNav);
    window.addEventListener('scroll', () => {
      if (!navFrame) navFrame = requestAnimationFrame(updateNav);
    }, { passive: true });
    updateNav();
  }

  const gradientElements = document.querySelectorAll('.gradientAnimation');
  if (gradientElements.length) {
    let gradientObserver;
    const observeGradients = () => {
      gradientObserver?.disconnect();
      gradientObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          entry.target.classList.toggle('is-gradient-visible', entry.isIntersecting);
        });
      }, { rootMargin: `0px 0px -${innerHeight * 0.5}px 0px`, threshold: 0 });
      gradientElements.forEach(element => gradientObserver.observe(element));
    };
    observeGradients();
    window.addEventListener('resize', observeGradients);
  }

  const applicationHero = document.querySelector('.applicationHero');
  if (applicationHero) {
    let heroExitFrame = 0;
    const updateHeroExit = () => {
      heroExitFrame = 0;
      const rect = applicationHero.getBoundingClientRect();
      const progress = clamp(-rect.top / Math.max(1, rect.height));
      applicationHero.style.setProperty('--hero-exit-progress', String(progress));
    };
    const queueHeroExit = () => {
      if (!heroExitFrame) heroExitFrame = requestAnimationFrame(updateHeroExit);
    };
    window.addEventListener('scroll', queueHeroExit, { passive: true });
    window.addEventListener('resize', queueHeroExit);
    window.addEventListener('load', queueHeroExit, { once: true });
    updateHeroExit();
  }

  const watchImages = [...document.querySelectorAll('.applicationPage .smartWatchImage')];
  if (watchImages.length) {
    const watchVisual = watchImages[0].closest('.smartWatchVisual');
    let watchFrame = 0;
    let watchRevealed = false;
    watchImages.forEach((image, index) => {
      image.classList.add('is-watch-pending');
      image.style.setProperty('--watch-delay', `${index * 350}ms`);
    });
    const revealWatches = () => {
      if (watchRevealed) return;
      watchRevealed = true;
      Promise.all(watchImages.map(image => image.decode().catch(() => {}))).then(() => {
        watchImages.forEach(image => image.classList.add('is-watch-revealed'));
      });
    };
    const updateWatchReveal = () => {
      watchFrame = 0;
      if (motion.reduced || watchVisual.getBoundingClientRect().top <= innerHeight * .36) revealWatches();
    };
    const queueWatchReveal = () => {
      if (!watchFrame && !watchRevealed) watchFrame = requestAnimationFrame(updateWatchReveal);
    };
    window.addEventListener('scroll', queueWatchReveal, { passive: true });
    window.addEventListener('resize', queueWatchReveal);
    window.addEventListener('load', queueWatchReveal, { once: true });
    new ResizeObserver(queueWatchReveal).observe(watchVisual);
    motion.subscribe(queueWatchReveal);
    updateWatchReveal();
  }

  const personaControllers = new WeakMap();
  document.querySelectorAll('.persona').forEach(root => {
    if (root.querySelector('.personaContent') && root.querySelector('.personaPanel')) {
      personaControllers.set(root, new PersonaController(root));
    }
  });
  const carouselControllers = new WeakMap();
  document.querySelectorAll('.carousel').forEach(root => {
    if (root.querySelector('[data-carousel-track] [data-carousel-slide]')) {
      carouselControllers.set(root, new CarouselController(root));
    }
  });
  const ambientMedia = new AmbientMedia(document.querySelectorAll('[data-ambient-video]'));

  Object.defineProperty(window, 'ALIGNEXUI', {
    value: Object.freeze({
      clamp, desktopScale, motion, animate, play, AmbientMedia, PanelSwitcher, PersonaController, CarouselController,
      ambientMedia,
      getPersonaController: root => personaControllers.get(root),
      getCarouselController: root => carouselControllers.get(root)
    }),
    writable: false,
    configurable: false
  });
})();
