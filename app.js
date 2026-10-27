(() => {
  'use strict';

  /* ------------------------------------------------------------------
     Helpers
  ------------------------------------------------------------------ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const root = document.documentElement;
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(pointer: fine)').matches;
  const TOUCH = matchMedia('(hover: none)').matches;
  // Headless capture (thumbnails, full-page screenshots): keep everything at rest.
  const CAPTURE = navigator.webdriver === true;
  if (CAPTURE) root.classList.add('capture');
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const onIdle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 60));

  /* ------------------------------------------------------------------
     1. Split headings into masked words
  ------------------------------------------------------------------ */
  function splitWords(el) {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = p;
            inner.style.setProperty('--wi', i++);
            w.appendChild(inner);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          walk(n);
        }
      });
    };
    walk(el);
  }
  $$('[data-split]').forEach(splitWords);

  /* ------------------------------------------------------------------
     2. Hero entrance (after fonts, with a short ceiling)
  ------------------------------------------------------------------ */
  let heroStarted = false;
  const startHero = () => {
    if (heroStarted) return;
    heroStarted = true;
    root.classList.add('hero-go');
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(startHero);
  setTimeout(startHero, 650);

  /* ------------------------------------------------------------------
     3. Smooth wheel scrolling (native scroll, eased) + anchor navigation
  ------------------------------------------------------------------ */
  const scroller = (() => {
    const enabled = !REDUCE && FINE && !CAPTURE;
    let cur = scrollY, tgt = scrollY, raf = 0, lastT = 0, locked = false, tween = null;
    const max = () => Math.max(0, root.scrollHeight - innerHeight);
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; lastT = 0; tween = null; cur = tgt = scrollY; };
    const frame = (t) => {
      const dt = Math.min(64, t - (lastT || t)) / 1000;
      lastT = t;
      if (tween) {
        const k = Math.min(1, (t - tween.start) / tween.dur);
        cur = lerp(tween.from, tween.to, easeIO(k));
        tgt = cur;
        if (k >= 1) tween = null;
      } else {
        cur += (tgt - cur) * (1 - Math.exp(-dt * 9.5));
        if (Math.abs(tgt - cur) < 0.4) cur = tgt;
      }
      window.scrollTo(0, cur);
      if (tween || Math.abs(tgt - cur) > 0.01) raf = requestAnimationFrame(frame);
      else { raf = 0; lastT = 0; }
    };
    const run = () => { if (!raf) raf = requestAnimationFrame(frame); };
    if (enabled) {
      addEventListener('wheel', (e) => {
        if (locked || e.ctrlKey || e.defaultPrevented) return;
        if (e.target.closest && e.target.closest('[data-native-scroll]')) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        const d = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1);
        if (!raf) { cur = scrollY; tgt = scrollY; }
        tween = null;
        tgt = clamp(tgt + d, 0, max());
        run();
      }, { passive: false });
      addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) stop();
      });
      addEventListener('scroll', () => { if (!raf) cur = tgt = scrollY; }, { passive: true });
      addEventListener('resize', () => { tgt = clamp(tgt, 0, max()); });
    }
    return {
      to(y) {
        y = clamp(y, 0, max());
        if (REDUCE || CAPTURE) { window.scrollTo(0, y); return; }
        const from = scrollY, dist = Math.abs(y - from);
        if (dist < 2) return;
        cur = from;
        tween = { from, to: y, start: performance.now(), dur: clamp(dist * 0.42, 650, 1500) };
        run();
      },
      busy() { return !!tween; },
      lock() { locked = true; stop(); },
      unlock() { locked = false; cur = tgt = scrollY; }
    };
  })();

  const nav = $('#nav');
  const stack = $('#stack');
  const navOffset = () => (innerWidth <= 520 ? 64 : 72);

  function targetY(el) {
    if (el.classList.contains('tool') && stack && getComputedStyle(el).position === 'sticky') {
      // sticky cards report their stuck position; compute the natural one
      const cards = $$('.tool', stack);
      const gap = parseFloat(getComputedStyle(stack).rowGap) || 0;
      let y = stack.getBoundingClientRect().top + scrollY;
      for (const c of cards) { if (c === el) break; y += c.offsetHeight + gap; }
      const stickTop = parseFloat(getComputedStyle(el).top) || 0;
      return y - stickTop;
    }
    return el.getBoundingClientRect().top + scrollY - navOffset();
  }

  const TOOL_IDS = ['bpm', 'ccm', 'erm'];
  function goTo(id) {
    if (TOOL_IDS.includes(id)) { activateTab(id); id = 'tools'; }
    if (id === 'top' || id === '') { scroller.to(0); return; }
    const el = document.getElementById(id);
    if (el) scroller.to(targetY(el));
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (id && !document.getElementById(id)) return;
    e.preventDefault();
    if (menuOpen) closeMenu(false);
    if (a.dataset.intent) setMode(a.dataset.intent);
    goTo(id);
    if (id === 'main' || a.classList.contains('skip')) { const m = $('#main'); m.setAttribute('tabindex', '-1'); m.focus({ preventScroll: true }); }
  });

  /* ------------------------------------------------------------------
     4. Navigation: scrolled state, hide on scroll down, progress, spy
  ------------------------------------------------------------------ */
  let lastY = scrollY;
  // the footer has its own "Back to top" link; hide the floating button there so it never covers text
  let footerBarVisible = false;
  const footerBar = $('.footer__bottom');
  if (footerBar && 'IntersectionObserver' in window) {
    new IntersectionObserver((en) => { footerBarVisible = en[0].isIntersecting; navTick(); }, { rootMargin: '0px 0px 40px 0px' }).observe(footerBar);
  }
  const progressBar = $('.nav__progress span');
  const totop = $('#totop');
  function navTick() {
    const y = scrollY;
    nav.classList.toggle('is-scrolled', y > 24);
    const dy = y - lastY;
    if (scroller.busy()) nav.classList.remove('is-hidden');
    else if (!menuOpen) {
      if (y > innerHeight * 0.9 && dy > 6) nav.classList.add('is-hidden');
      else if (dy < -6 || y < innerHeight * 0.5) nav.classList.remove('is-hidden');
    }
    lastY = y;
    const p = clamp(y / Math.max(1, root.scrollHeight - innerHeight), 0, 1);
    progressBar.style.setProperty('--p', p.toFixed(4));
    totop.style.setProperty('--p', p.toFixed(4));
    totop.classList.toggle('is-on', y > innerHeight * 1.2 && !footerBarVisible);
  }
  nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));

  const spyLinks = $$('.nav__links a[data-spy]');
  const spyIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = en.target.id;
      spyLinks.forEach((l) => l.classList.toggle('is-active', l.dataset.spy === id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['about', 'governance-os', 'vision', 'tools', 'roadmap', 'approach', 'ai', 'why', 'contact', 'top']
    .forEach((id) => { const s = document.getElementById(id); if (s) spyIO.observe(s); });

  /* mobile menu */
  const menu = $('#menu');
  const burger = $('#burger');
  let menuOpen = false;
  function openMenu() {
    menuOpen = true;
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add('is-open'));
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
    nav.classList.remove('is-hidden');
    root.style.overflow = 'hidden';
    scroller.lock();
  }
  function closeMenu(restoreFocus = true) {
    menuOpen = false;
    menu.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    root.style.overflow = '';
    scroller.unlock();
    setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 700);
    if (restoreFocus) burger.focus();
  }
  burger.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); });
  matchMedia('(min-width: 1121px)').addEventListener('change', (m) => { if (m.matches && menuOpen) closeMenu(false); });

  /* ------------------------------------------------------------------
     5. Reveals: visible at rest, animate only when approaching from below
  ------------------------------------------------------------------ */
  const revealTargets = $$('[data-reveal], [data-split]:not([data-split="hero"])');
  if (!REDUCE && !CAPTURE && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        if (en.boundingClientRect.top > innerHeight * 0.94) {
          en.target.classList.add('is-in');
          en.target.dispatchEvent(new CustomEvent('reveal'));
        }
      });
    }, { rootMargin: '0px 0px 12% 0px' });
    revealTargets.forEach((el) => io.observe(el));
  }

  /* counters */
  $$('[data-count]').forEach((el) => {
    const target = +el.dataset.count;
    const host = el.closest('[data-reveal]');
    if (!host || REDUCE) return;
    host.addEventListener('reveal', () => {
      const t0 = performance.now(), dur = 1500;
      el.textContent = '0';
      const step = (t) => {
        const k = clamp((t - t0 - 250) / dur, 0, 1);
        el.textContent = Math.round(target * easeOut(k));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { once: true });
  });

  /* ------------------------------------------------------------------
     6. Scroll-linked effects
  ------------------------------------------------------------------ */
  const parallaxEls = $$('[data-parallax]');
  const scrub = $('[data-scrub]');
  let scrubWords = [];
  if (scrub && !REDUCE && !CAPTURE) {
    // split the statement into words for the reading highlight
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const s = document.createElement('span'); s.className = 'sw'; s.textContent = p; frag.appendChild(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(scrub);
    scrubWords = $$('.sw', scrub);
    scrub.classList.add('is-scrubbing');
  }
  const tools = stack ? $$('.tool', stack) : [];
  const steps = $('#steps');
  const stepsLine = steps ? $('.steps__line span', steps) : null;
  const stepItems = steps ? $$('.step', steps) : [];

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const vh = innerHeight;
      navTick();

      // parallax
      parallaxEls.forEach((el) => {
        const box = el.parentElement.getBoundingClientRect();
        if (box.bottom < -50 || box.top > vh + 50) return;
        const p = clamp((vh - box.top) / (vh + box.height), 0, 1);
        const amt = parseFloat(el.dataset.parallax) || 0.06;
        el.style.transform = `translate3d(0, ${((p - 0.5) * 2 * amt * box.height).toFixed(1)}px, 0)`;
      });

      // manifesto reading highlight
      if (scrubWords.length) {
        const r = scrub.getBoundingClientRect();
        const p = clamp((vh * 0.86 - r.top) / (vh * 0.5), 0, 1);
        const n = Math.round(p * scrubWords.length);
        scrubWords.forEach((w, i) => w.classList.toggle('on', i < n));
      }

      // stacked tool cards
      if (tools.length && getComputedStyle(tools[0]).position === 'sticky') {
        for (let i = 0; i < tools.length; i++) {
          const card = tools[i], next = tools[i + 1];
          let k = 0;
          if (next) {
            const a = card.getBoundingClientRect(), b = next.getBoundingClientRect();
            k = clamp((a.height - (b.top - a.top)) / (a.height * 0.9), 0, 1);
          }
          card.querySelector('.tool__shade').style.opacity = (k * 0.06).toFixed(3);
        }
      } else if (tools.length) {
        tools.forEach((c) => { c.querySelector('.tool__shade').style.opacity = 0; });
      }

      // approach timeline
      if (steps && stepsLine) {
        const r = steps.getBoundingClientRect();
        const p = clamp((vh * 0.78 - r.top) / (vh * 0.45), 0, 1);
        stepsLine.style.setProperty('--p', p.toFixed(3));
        stepItems.forEach((s, i) => s.classList.toggle('is-lit', p >= (i + 0.15) / stepItems.length));
      }
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ------------------------------------------------------------------
     7. Netra eye: the generative network used across the site
  ------------------------------------------------------------------ */
  class NetraEye {
    constructor(canvas, o) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({
        anchor: null, chips: [], center: [0.5, 0.5], rx: 0.44, ry: 0.26, iris: 0.1,
        rgb: '204,138,43', node: 'rgba(204,138,43,0.95)', lineA: 0.3, irisFill: 'rgba(18,61,52,1)',
        fadeEl: null, stars: 14, pulses: true, pointer: true, drawIris: true, starRgb: '204,138,43'
      }, o || {});
      this.nodes = []; this.edges = []; this.pulses = []; this.stars = [];
      this.mx = 0; this.my = 0; this.tx = 0; this.ty = 0;
      this.raf = 0; this.t = 0; this.last = 0; this.born = 0; this.visible = false;
      this.layout();
      const ro = new ResizeObserver(() => this.layout());
      ro.observe(canvas.parentElement);
      if (this.o.anchor) ro.observe(this.o.anchor);
      new IntersectionObserver((en) => {
        this.visible = en[0].isIntersecting;
        if (this.visible) this.play(); else this.pause();
      }, { rootMargin: '80px' }).observe(canvas);
      if (this.o.pointer && FINE && !REDUCE) {
        addEventListener('pointermove', (e) => {
          if (!this.visible) return;
          this.tx = (e.clientX / innerWidth) * 2 - 1;
          this.ty = (e.clientY / innerHeight) * 2 - 1;
        }, { passive: true });
      }
      if (REDUCE || CAPTURE) { this.born = -10000; this.draw(0, true); }
    }
    layout() {
      const host = this.c.parentElement.getBoundingClientRect();
      const W = Math.max(1, this.c.offsetWidth || host.width), H = Math.max(1, this.c.offsetHeight || host.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = W; this.H = H; this.dpr = dpr;
      this.c.width = Math.round(W * dpr); this.c.height = Math.round(H * dpr);
      const cRect = this.c.getBoundingClientRect();
      let cx, cy, Rx, Ry, ports = [];
      const nodes = [], edges = [], key = new Set();
      const add = (x, y, depth, kind, extra) => { const n = Object.assign({ x, y, depth, kind, ph: Math.random() * 6.28 }, extra || {}); nodes.push(n); return n; };
      const link = (a, b, w = 1) => { if (!a || !b || a === b) return; const k = nodes.indexOf(a) + '-' + nodes.indexOf(b); const k2 = nodes.indexOf(b) + '-' + nodes.indexOf(a); if (key.has(k) || key.has(k2)) return; key.add(k); edges.push({ a, b, w }); };

      if (this.o.anchor) {
        const a = this.o.anchor.getBoundingClientRect();
        cx = a.left + a.width / 2 - cRect.left; cy = a.top + a.height / 2 - cRect.top;
        const hw = a.width / 2, hh = a.height / 2;
        Ry = hh + Math.min(90, H * 0.08);
        Rx = Math.max(hw * 3.3, Ry * 1.55, Math.min(W * 0.5, 680));
        for (let k = -2; k <= 2; k++) {
          ports.push(add(cx - hw - 16, cy + k * hh * 0.33, 0.15, 'port'));
          ports.push(add(cx + hw + 16, cy + k * hh * 0.33, 0.15, 'port'));
        }
        ports.push(add(cx, cy - hh - 16, 0.15, 'port'), add(cx, cy + hh + 16, 0.15, 'port'));
        this.irisR = 0;
      } else {
        cx = W * this.o.center[0]; cy = H * this.o.center[1];
        Rx = W * this.o.rx;
        Ry = Math.min(H * this.o.ry, Rx * 0.6);
        const r = Math.min(W, H) * this.o.iris;
        this.irisR = r;
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          ports.push(add(cx + Math.cos(ang) * r * 1.45, cy + Math.sin(ang) * r * 1.45, 0.2, 'inner'));
        }
        for (let i = 0; i < 12; i++) link(ports[i], ports[(i + 1) % 12], 0.8);
      }
      this.cx = cx; this.cy = cy; this.Rx = Rx; this.Ry = Ry;

      const lid = (u) => Math.pow(Math.max(0, 1 - u * u), 0.85);
      const L = add(cx - Rx, cy, 1, 'lid'), R = add(cx + Rx, cy, 1, 'lid');
      const N = 7, up = [], lo = [], mu = [], ml = [];
      for (let i = 0; i < N; i++) {
        const u = -1 + (2 * (i + 1)) / (N + 1);
        up.push(add(cx + u * Rx, cy - Ry * lid(u), 1, 'lid'));
        lo.push(add(cx + u * Rx, cy + Ry * lid(u), 1, 'lid'));
      }
      const M = 6;
      for (let i = 0; i < M; i++) {
        const u = -1 + (2 * (i + 0.5)) / M;
        const sx = cx + u * Rx * 0.64, sy = Ry * 0.6 * Math.pow(Math.max(0, 1 - u * u), 0.7);
        mu.push(add(sx, cy - sy, 0.55, 'mid'));
        ml.push(add(sx, cy + sy, 0.55, 'mid'));
      }
      [L, ...up, R].forEach((n, i, arr) => link(n, arr[i + 1], 1));
      [L, ...lo, R].forEach((n, i, arr) => link(n, arr[i + 1], 1));
      mu.forEach((n, i) => link(n, mu[i + 1], 0.8));
      ml.forEach((n, i) => link(n, ml[i + 1], 0.8));
      link(L, mu[0], 0.8); link(L, ml[0], 0.8); link(R, mu[M - 1], 0.8); link(R, ml[M - 1], 0.8);
      const nearest = (n, pool, k) => pool.slice().sort((p, q) => Math.hypot(p.x - n.x, p.y - n.y) - Math.hypot(q.x - n.x, q.y - n.y)).slice(0, k);
      up.forEach((n) => nearest(n, mu, 2).forEach((m) => link(n, m, 0.75)));
      lo.forEach((n) => nearest(n, ml, 2).forEach((m) => link(n, m, 0.75)));
      [...mu, ...ml].forEach((m) => nearest(m, ports, this.o.anchor ? 1 : 2).forEach((p) => link(m, p, 0.6)));

      // satellites: chips plugged into the network
      this.chipNodes = [];
      (this.o.chips || []).forEach((chip, idx) => {
        const r = chip.getBoundingClientRect();
        const dyNow = parseFloat(chip.dataset.dy || 0);
        const x = r.left + r.width / 2 - cRect.left, y = r.top + r.height / 2 - cRect.top - dyNow;
        const n = add(x, y, 0.35, 'chip', { chip, idx });
        this.chipNodes.push(n);
        nearest(n, [...up, ...lo, ...mu, ...ml], 2).forEach((m) => link(n, m, 0.9));
      });

      // per-node reveal order and fade
      const fr = this.o.fadeEl ? this.o.fadeEl.getBoundingClientRect() : null;
      nodes.forEach((n) => {
        const d = Math.hypot((n.x - cx) / Rx, (n.y - cy) / (Ry * 1.6));
        n.d = clamp(d, 0, 1.2);
        let f = 1 - clamp((d - 0.55) / 0.7, 0, 1) * 0.55;
        if (fr) {
          const x0 = fr.left - cRect.left, x1 = fr.right - cRect.left, y0 = fr.top - cRect.top, y1 = fr.bottom - cRect.top;
          const dx = Math.max(x0 - n.x, 0, n.x - x1), dy = Math.max(y0 - n.y, 0, n.y - y1);
          f *= lerp(0.12, 1, clamp(Math.hypot(dx, dy) / 90, 0, 1));
        }
        n.f = f;
      });
      edges.forEach((e) => { e.d = Math.max(e.a.d, e.b.d); e.f = Math.min(e.a.f, e.b.f) * e.w; });
      this.nodes = nodes; this.edges = edges; this.ports = ports;

      // drifting dust
      this.stars = Array.from({ length: this.o.stars }, () => ({
        x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.3,
        v: 4 + Math.random() * 10, ph: Math.random() * 6.28
      }));
      if (!this.raf) this.draw(this.t, true);
    }
    play() {
      if (this.raf || REDUCE || CAPTURE) return;
      if (!this.born) this.born = performance.now();
      this.last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now; this.t += dt;
        this.draw(dt);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    pause() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
    spawnPulse() {
      for (let tries = 0; tries < 6; tries++) {
        const e = this.edges[(Math.random() * this.edges.length) | 0];
        if (!e || e.f < 0.45) continue;
        const outward = e.a.d > e.b.d;
        this.pulses.push({ a: outward ? e.a : e.b, b: outward ? e.b : e.a, k: 0, v: 0.45 + Math.random() * 0.5, f: Math.min(1, e.f) });
        return;
      }
    }
    pos(n) {
      if (n.kind === 'chip' && n.chip) return { x: n.x, y: n.y + (n.bob || 0) };
      return { x: n.x + this.mx * 14 * n.depth, y: n.y + this.my * 10 * n.depth };
    }
    draw(dt, still) {
      const { ctx, dpr, W, H } = this;
      const rgb = this.o.rgb;
      this.mx = lerp(this.mx, this.tx, 0.05); this.my = lerp(this.my, this.ty, 0.05);
      const age = this.born ? (performance.now() - this.born) / 1000 : 0;
      const rev = REDUCE || CAPTURE || this.born < 0 ? 10 : age;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // chips bob in sync with their links
      this.chipNodes.forEach((n, i) => {
        const b = (REDUCE || CAPTURE) ? 0 : Math.sin(this.t * 0.9 + i * 2.1) * 4;
        n.bob = b;
        if (n.chip) { n.chip.style.translate = `0 ${b.toFixed(2)}px`; n.chip.dataset.dy = b.toFixed(2); }
      });

      // dust
      this.stars.forEach((s) => {
        if (!still) { s.y -= s.v * dt; if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; } }
        const a = 0.18 + 0.22 * Math.sin(this.t * 1.3 + s.ph);
        ctx.fillStyle = `rgba(${this.o.starRgb},${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      });

      // edges, revealed from the iris outward
      ctx.lineWidth = 1;
      this.edges.forEach((e) => {
        const k = clamp((rev * 1.15 - e.d * 0.9) / 0.6, 0, 1);
        if (k <= 0) return;
        const A = this.pos(e.a), B = this.pos(e.b);
        const near = e.a.d < e.b.d ? A : B, far = near === A ? B : A;
        ctx.strokeStyle = `rgba(${rgb},${(this.o.lineA * e.f).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(near.x, near.y); ctx.lineTo(lerp(near.x, far.x, easeOut(k)), lerp(near.y, far.y, easeOut(k))); ctx.stroke();
      });

      // nodes
      this.nodes.forEach((n) => {
        if (n.kind === 'port' || n.kind === 'chip') return;
        const k = clamp((rev * 1.15 - n.d * 0.9 - 0.25) / 0.4, 0, 1);
        if (k <= 0) return;
        const P = this.pos(n);
        const br = 1 + 0.18 * Math.sin(this.t * 1.6 + n.ph);
        const base = n.kind === 'lid' ? 2.8 : n.kind === 'mid' ? 2.3 : 1.8;
        ctx.fillStyle = `rgba(${rgb},${(0.13 * n.f * k).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(P.x, P.y, base * 3 * br * k, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgba(${rgb},${(0.95 * n.f * k).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(P.x, P.y, base * k, 0, 6.283); ctx.fill();
      });

      // iris (only when the eye is not wrapped around the film)
      if (!this.o.anchor && this.o.drawIris) {
        const r = this.irisR, k = clamp(rev / 0.8, 0, 1);
        const P = { x: this.cx + this.mx * 3, y: this.cy + this.my * 2 };
        ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(this.t * 0.06);
        ctx.strokeStyle = `rgba(${rgb},${(0.75 * k).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * 6.283;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
          ctx.lineTo(Math.cos(a) * r * 1.04, Math.sin(a) * r * 1.04);
          ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = `rgba(${rgb},${(0.9 * k).toFixed(3)})`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(P.x, P.y, r * 0.72, 0, 6.283); ctx.stroke();
        ctx.fillStyle = this.o.irisFill;
        ctx.beginPath(); ctx.arc(P.x + this.mx * 2, P.y + this.my * 2, r * 0.5 * k, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgba(${rgb},${(0.35 * k).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(P.x + this.mx * 2 - r * 0.16, P.y + this.my * 2 - r * 0.16, r * 0.09, 0, 6.283); ctx.fill();
      }

      // pulses travelling inward
      if (!still && this.o.pulses && rev > 1.2) {
        if (Math.random() < dt * 7 && this.pulses.length < 14) this.spawnPulse();
        this.pulses = this.pulses.filter((p) => {
          p.k += dt * p.v;
          if (p.k >= 1) return false;
          const A = this.pos(p.a), B = this.pos(p.b);
          const x = lerp(A.x, B.x, p.k), y = lerp(A.y, B.y, p.k);
          const fade = Math.sin(p.k * Math.PI) * (p.f == null ? 1 : p.f);
          ctx.fillStyle = `rgba(${rgb},${(0.16 * fade).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.283); ctx.fill();
          ctx.fillStyle = `rgba(${rgb},${(0.95 * fade).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(x, y, 1.9, 0, 6.283); ctx.fill();
          return true;
        });
      }
    }
  }

  const film = $('#film');
  const heroNet = $('#heroNet');
  onIdle(() => {
    if (heroNet && film) {
      const eye = new NetraEye(heroNet, {
        anchor: $('.film__frame', film), chips: $$('.chip', film), fadeEl: $('.hero__copy'),
        lineA: 0.34, stars: 16
      });
      // re-measure once the entrance motion has settled
      [1200, 2700].forEach((ms) => setTimeout(() => eye.layout(), ms));
      if (document.fonts) document.fonts.ready.then(() => eye.layout());
    }
    const m = $('#meaningNet');
    if (m) new NetraEye(m, { center: [0.5, 0.54], rx: 0.46, ry: 0.42, iris: 0.18, rgb: '226,168,81', lineA: 0.42, irisFill: 'rgba(10,38,32,1)', stars: 10, pointer: false, starRgb: '226,168,81' });
    const v = $('#visionNet');
    if (v) new NetraEye(v, { center: [0.78, 0.3], rx: 0.42, ry: 0.22, iris: 0.07, rgb: '226,168,81', lineA: 0.3, fadeEl: $('.vision__title'), irisFill: 'rgba(10,38,32,1)', stars: 22, starRgb: '226,168,81' });
  });

  /* ------------------------------------------------------------------
     8. Film: hero card
  ------------------------------------------------------------------ */
  const CHAPTERS = [
    [0, 'From hindsight to foresight'],
    [16, 'See more, and see earlier'],
    [22, 'The meaning of Netra'],
    [31, 'Built by auditors'],
    [40, 'The Governance OS'],
    [51, 'One connected vision'],
    [61, 'See clearly. Think ahead.']
  ];
  const chapterAt = (t) => { let c = CHAPTERS[0]; for (const ch of CHAPTERS) if (t >= ch[0]) c = ch; return c; };
  const icon = (btn, id) => { const u = btn.querySelector('use'); if (u) u.setAttribute('href', '#' + id); };

  /* The film is embedded in the page itself, so it plays on phones and when the
     page is saved or hosted as a single file. If a browser refuses one copy,
     the next source is tried in turn. */
  const FILM_FILE = 'assets/nexus-netra-film.mp4';
  let filmB64 = null, filmBlobUrl = null;
  const filmPayload = () => {
    if (filmB64 === null) { const el = document.getElementById('nn-film'); filmB64 = el ? el.textContent.replace(/\s+/g, '') : ''; }
    return filmB64;
  };
  const blobSource = () => {
    if (filmBlobUrl) return filmBlobUrl;
    const b64 = filmPayload();
    if (!b64 || !window.Blob || !window.URL || !URL.createObjectURL) return null;
    try {
      const bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
      filmBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    } catch (e) { filmBlobUrl = null; }
    return filmBlobUrl;
  };
  const dataSource = () => { const b64 = filmPayload(); return b64 ? 'data:video/mp4;base64,' + b64 : null; };
  // A real video file plays most reliably on iPhones; the embedded copy covers
  // hosts where that file is missing (for example the single-file version).
  const FILM_SOURCES = location.protocol.indexOf('http') === 0 ? [() => FILM_FILE, blobSource, dataSource] : [blobSource, dataSource, () => FILM_FILE];
  function attachFilm(video) {
    if (!video || video._film) return;
    const st = (video._film = { i: -1, timer: 0 });
    const arm = () => {
      clearTimeout(st.timer);
      // some phones never report an error, they just stall: move on after a pause
      st.timer = setTimeout(() => { if (video.readyState < 2 && st.i < FILM_SOURCES.length - 1) next(); }, 6000);
    };
    const next = () => {
      while (++st.i < FILM_SOURCES.length) {
        const url = FILM_SOURCES[st.i]();
        if (url) {
          video.src = url;
          try { video.load(); } catch (e) { /* ignore */ }
          if (video._wantPlay) { const p = video.play(); if (p && p.catch) p.catch(() => {}); }
          arm();
          return;
        }
      }
      clearTimeout(st.timer);
      video.removeEventListener('error', next);
      video.dispatchEvent(new CustomEvent('filmfail'));
    };
    video.addEventListener('error', next);
    video.addEventListener('loadeddata', () => clearTimeout(st.timer));
    next();
  }

  const hv = $('#heroVideo');
  const hToggle = $('#heroToggle'), hSound = $('#heroSound'), hProg = $('#heroProg'), hTime = $('#heroTime');
  const hChap = $('#heroChapter'), hChapT = $('#heroChapterTime');
  let userPaused = REDUCE, filmInView = false, lastChapter = null;

  function syncHeroUI() {
    const playing = !hv.paused;
    icon(hToggle, playing ? 'i-pause' : 'i-play');
    hToggle.setAttribute('aria-label', playing ? 'Pause film' : 'Play film');
    icon(hSound, hv.muted ? 'i-sound-off' : 'i-sound-on');
    hSound.setAttribute('aria-label', hv.muted ? 'Turn sound on' : 'Turn sound off');
    hSound.setAttribute('aria-pressed', String(!hv.muted));
  }
  function heroPlay() {
    if (!hv.getAttribute('src')) return;
    hv._wantPlay = true;
    const p = hv.play();
    if (p && p.catch) p.catch((err) => { if (err && err.name === 'NotAllowedError') film.classList.add('needs-tap'); syncHeroUI(); });
    // phones that quietly refuse autoplay still get a clear play button
    clearTimeout(hv._tapT);
    hv._tapT = setTimeout(() => { if (hv.paused && !userPaused) film.classList.add('needs-tap'); }, 3000);
  }
  if (hv) {
    hv.addEventListener('play', () => { film.classList.remove('needs-tap'); syncHeroUI(); });
    hv.addEventListener('loadedmetadata', () => { if (filmInView && !userPaused && !theaterOpen && !CAPTURE) heroPlay(); });
    hv.addEventListener('filmfail', () => film.classList.add('film-off'));
    const startFilm = () => { attachFilm(hv); if (filmInView && !userPaused && !theaterOpen && !CAPTURE) heroPlay(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startFilm, { once: true }); else startFilm();
    hv.addEventListener('pause', syncHeroUI);
    hv.addEventListener('volumechange', syncHeroUI);
    hToggle.addEventListener('click', () => {
      if (hv.paused) { userPaused = false; heroPlay(); } else { userPaused = true; hv.pause(); }
    });
    hSound.addEventListener('click', () => {
      hv.muted = !hv.muted;
      if (!hv.muted) { hv.volume = 1; userPaused = false; heroPlay(); }
    });
    new IntersectionObserver((en) => {
      filmInView = en[0].isIntersecting;
      if (filmInView && !userPaused && !theaterOpen && !CAPTURE) {
        if (hv.preload !== 'auto') hv.preload = 'auto';
        heroPlay();
      } else if (!filmInView && !hv.paused) {
        hv.pause();
      }
    }, { threshold: 0.25 }).observe(hv);
    const filmLoop = () => {
      if (!hv.paused || hv.readyState) {
        const d = hv.duration || 74, t = hv.currentTime || 0;
        hProg.style.setProperty('--p', (t / d).toFixed(4));
        hTime.textContent = fmt(t);
        const ch = chapterAt(t);
        if (ch !== lastChapter) {
          lastChapter = ch;
          hChap.style.opacity = 0;
          setTimeout(() => { hChap.textContent = ch[1]; hChapT.textContent = fmt(ch[0]); hChap.style.opacity = 1; }, 220);
        }
      }
      requestAnimationFrame(filmLoop);
    };
    requestAnimationFrame(filmLoop);
    syncHeroUI();
  }

  /* ------------------------------------------------------------------
     9. Overlays: theatre + drawer (focus trap, scroll lock)
  ------------------------------------------------------------------ */
  let lastFocus = null;
  const openOverlays = new Set();
  function lockPage() {
    const sw = innerWidth - root.clientWidth;
    root.style.overflow = 'hidden';
    if (sw > 0) document.body.style.paddingRight = sw + 'px';
    scroller.lock();
  }
  function unlockPage() {
    if (openOverlays.size) return;
    root.style.overflow = '';
    document.body.style.paddingRight = '';
    scroller.unlock();
  }
  function openOverlay(el, focusEl) {
    lastFocus = document.activeElement;
    el.hidden = false;
    openOverlays.add(el);
    lockPage();
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
    setTimeout(() => (focusEl || el.querySelector('[data-close]')).focus({ preventScroll: true }), 60);
  }
  function closeOverlay(el) {
    el.classList.remove('is-open');
    openOverlays.delete(el);
    setTimeout(() => { if (!el.classList.contains('is-open')) el.hidden = true; }, 520);
    unlockPage();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', (e) => {
    const top = Array.from(openOverlays).pop();
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); top === theater ? closeTheater() : closeOverlay(top); return; }
    if (e.key === 'Tab') {
      const f = $$('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])', top).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* theatre */
  const theater = $('#theater');
  const tv = $('#theaterVideo');
  const tToggle = $('#tToggle'), tSound = $('#tSound'), tSeek = $('#tSeek'), tTime = $('#tTime');
  const chaptersEl = $('#chapters');
  let theaterOpen = false, heroWasPlaying = false, tRaf = 0;
  CHAPTERS.forEach(([t, name]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.t = t;
    b.innerHTML = `<span>${fmt(t)}</span>${name}`;
    b.addEventListener('click', () => { tv.currentTime = t; const p = tv.play(); if (p && p.catch) p.catch(() => {}); });
    chaptersEl.appendChild(b);
  });
  const chapterBtns = $$('button', chaptersEl);
  function syncTheater() {
    icon(tToggle, tv.paused ? 'i-play' : 'i-pause');
    tToggle.setAttribute('aria-label', tv.paused ? 'Play' : 'Pause');
    icon(tSound, tv.muted ? 'i-sound-off' : 'i-sound-on');
    tSound.setAttribute('aria-label', tv.muted ? 'Unmute' : 'Mute');
    tSound.setAttribute('aria-pressed', String(tv.muted));
  }
  function tLoop() {
    const d = tv.duration || 74, t = tv.currentTime || 0;
    tSeek.style.setProperty('--p', (t / d).toFixed(4));
    tSeek.setAttribute('aria-valuenow', Math.round(t));
    tSeek.setAttribute('aria-valuetext', fmt(t));
    tTime.textContent = `${fmt(t)} / ${fmt(d)}`;
    const ch = chapterAt(t);
    chapterBtns.forEach((b) => b.classList.toggle('is-on', +b.dataset.t === ch[0]));
    tRaf = requestAnimationFrame(tLoop);
  }
  function openTheater(at = 0) {
    tv._wantPlay = true;
    if (TOUCH) tv.controls = true;
    attachFilm(tv);
    heroWasPlaying = hv && !hv.paused;
    if (hv) hv.pause();
    theaterOpen = true;
    openOverlay(theater, tToggle);
    tv.muted = false; tv.volume = 1;
    try { tv.currentTime = at; } catch (e) { /* not ready yet */ }
    const p = tv.play(); if (p && p.catch) p.catch(() => syncTheater());
    if (!tRaf) tLoop();
  }
  function closeTheater() {
    tv.pause();
    theaterOpen = false;
    cancelAnimationFrame(tRaf); tRaf = 0;
    closeOverlay(theater);
    if (hv && heroWasPlaying && filmInView && !userPaused) heroPlay();
  }
  $$('[data-theater]').forEach((b) => b.addEventListener('click', () => openTheater(0)));
  theater.addEventListener('click', (e) => { if (e.target === theater) closeTheater(); });
  $('[data-close]', theater).addEventListener('click', closeTheater);
  tv.addEventListener('play', syncTheater); tv.addEventListener('pause', syncTheater); tv.addEventListener('volumechange', syncTheater);
  tv.addEventListener('loadedmetadata', () => { if (theaterOpen && tv.paused) { const p = tv.play(); if (p && p.catch) p.catch(() => syncTheater()); } });
  tv.addEventListener('click', () => { if (!TOUCH) (tv.paused ? tv.play() : tv.pause()); });
  tToggle.addEventListener('click', () => (tv.paused ? tv.play() : tv.pause()));
  tSound.addEventListener('click', () => { tv.muted = !tv.muted; });
  const seekTo = (clientX) => {
    const r = tSeek.getBoundingClientRect();
    const k = clamp((clientX - r.left) / r.width, 0, 1);
    if (tv.duration) tv.currentTime = k * tv.duration;
  };
  tSeek.addEventListener('pointerdown', (e) => {
    tSeek.setPointerCapture(e.pointerId); seekTo(e.clientX);
    const mv = (ev) => seekTo(ev.clientX);
    const up = () => { tSeek.removeEventListener('pointermove', mv); tSeek.removeEventListener('pointerup', up); };
    tSeek.addEventListener('pointermove', mv); tSeek.addEventListener('pointerup', up);
  });
  tSeek.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { tv.currentTime = Math.min((tv.duration || 74), tv.currentTime + 5); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { tv.currentTime = Math.max(0, tv.currentTime - 5); e.preventDefault(); }
  });
  theater.addEventListener('keydown', (e) => {
    if (e.target.closest('.chapters') || e.target === tSeek) return;
    if (e.key === ' ' || e.key === 'k') { if (e.target.tagName !== 'BUTTON') { e.preventDefault(); tv.paused ? tv.play() : tv.pause(); } }
    if (e.key === 'm') tv.muted = !tv.muted;
  });

  /* drawer */
  const drawer = $('#drawer');
  const sheets = $$('.dsheet', drawer);
  function openDrawer(id) {
    sheets.forEach((s) => s.classList.toggle('is-on', s.dataset.sheet === id));
    drawer.setAttribute('aria-label', (id || '').toUpperCase() + ' details');
    $('.drawer__panel', drawer).scrollTop = 0;
    openOverlay(drawer);
  }
  $$('[data-drawer]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.drawer)));
  drawer.addEventListener('click', (e) => { if (e.target === drawer) closeOverlay(drawer); });
  $('[data-close]', drawer).addEventListener('click', () => closeOverlay(drawer));
  $$('[data-goto-contact]', drawer).forEach((b) => b.addEventListener('click', () => {
    closeOverlay(drawer);
    setMode(b.dataset.gotoContact);
    if (b.dataset.interest) { const cb = $(`.checks input[value="${b.dataset.interest}"]`); if (cb) cb.checked = true; }
    setTimeout(() => goTo('contact'), 120);
  }));

  /* ------------------------------------------------------------------
     10a. Tools tabs (BPM / CCM / ERM)
  ------------------------------------------------------------------ */
  const tabs = $$('.tab');
  const tabPanels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  function activateTab(id, focus) {
    tabs.forEach((t, k) => {
      const on = t.getAttribute('aria-controls') === id;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      tabPanels[k].hidden = !on;
      tabPanels[k].classList.toggle('is-active', on);
      if (on && focus) t.focus();
    });
  }
  tabs.forEach((t, k) => {
    t.addEventListener('click', () => { $('#panels').classList.add('is-ready'); activateTab(t.getAttribute('aria-controls')); });
    t.addEventListener('keydown', (e) => {
      let n = null;
      if (e.key === 'ArrowRight') n = (k + 1) % tabs.length;
      if (e.key === 'ArrowLeft') n = (k - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') n = 0;
      if (e.key === 'End') n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); $('#panels').classList.add('is-ready'); activateTab(tabs[n].getAttribute('aria-controls'), true); }
    });
  });

  /* ------------------------------------------------------------------
     10. Mock product views (illustrative)
  ------------------------------------------------------------------ */
  function whenVisible(el, on, off) {
    if (!el) return;
    new IntersectionObserver((en) => (en[0].isIntersecting ? on() : off && off()), { threshold: 0.2 }).observe(el);
  }

  // BPM dashboard
  (() => {
    const mock = $('#mockBpm'); if (!mock) return;
    const tabs = $$('.mtabs span', mock);
    const barsG = $('#bpmBars'), target = $('#bpmTarget'), labels = $('#bpmLabels');
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    const data = [
      { a: [62, 70, 66, 78, 74, 86], t: [68, 70, 72, 74, 76, 78], k: ['On track', 'Review', 'Improving'], d: 'Cost centre' },
      { a: [55, 61, 72, 69, 80, 84], t: [60, 64, 68, 72, 76, 80], k: ['Ahead', 'Within range', 'Improving'], d: 'Region' },
      { a: [74, 66, 70, 63, 68, 71], t: [70, 70, 70, 70, 70, 70], k: ['On track', 'Review', 'Stable'], d: 'Category' },
      { a: [80, 76, 72, 70, 66, 64], t: [72, 72, 70, 70, 68, 68], k: ['Watch', 'Review', 'Easing'], d: 'Warehouse' },
      { a: [58, 64, 69, 73, 77, 82], t: [62, 66, 70, 72, 74, 76], k: ['Ahead', 'Within range', 'Improving'], d: 'Plant' },
      { a: [66, 68, 67, 70, 71, 74], t: [68, 68, 70, 70, 72, 72], k: ['On track', 'Within range', 'Stable'], d: 'Department' }
    ];
    const X0 = 24, PW = 292, BASE = 112, TOP = 18, H = BASE - TOP, slot = PW / 6, bw = 22;
    const cxs = months.map((_, i) => X0 + slot * i + slot / 2);
    labels.innerHTML = months.map((m, i) => `<text x="${cxs[i].toFixed(1)}" y="126">${m}</text>`).join('');
    barsG.innerHTML = months.map((_, i) => `<rect class="bar" x="${(cxs[i] - bw / 2).toFixed(1)}" y="${TOP}" width="${bw}" height="${H}" rx="4"/>`).join('');
    const bars = $$('rect', barsG);
    let tPts = data[0].t.slice();
    const setTarget = (vals) => target.setAttribute('points', vals.map((v, i) => `${cxs[i].toFixed(1)},${(BASE - (v / 100) * H).toFixed(1)}`).join(' '));
    const kEls = $$('.kpi__s', mock);
    const drill = $('#bpmDrill'), drill2 = $('#bpmDrill2');
    let idx = 0, timer = 0;
    function show(i, animate = true) {
      const d = data[i];
      tabs.forEach((t, j) => t.classList.toggle('on', j === i));
      bars.forEach((b, j) => { b.style.transform = `scaleY(${(d.a[j] / 100).toFixed(3)})`; b.style.opacity = j === 5 ? 1 : 0.82; });
      const from = tPts.slice(), to = d.t, t0 = performance.now();
      const step = (now) => {
        const k = animate ? clamp((now - t0) / 700, 0, 1) : 1;
        tPts = from.map((v, j) => lerp(v, to[j], easeOut(k)));
        setTarget(tPts);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      kEls.forEach((el, j) => {
        el.textContent = d.k[j];
        el.className = 'kpi__s' + (/Review|Watch/.test(d.k[j]) ? ' warn' : '');
      });
      drill.textContent = tabs[i].textContent; drill2.textContent = d.d;
    }
    show(0, false);
    whenVisible(mock, () => {
      if (timer || REDUCE || CAPTURE) return;
      timer = setInterval(() => { idx = (idx + 1) % data.length; show(idx); }, 2800);
    }, () => { clearInterval(timer); timer = 0; });
  })();

  // CCM exception monitor
  (() => {
    const list = $('#ccmList'); if (!list) return;
    const rows = $$('.ccm-row', list), scan = $('#ccmScan');
    const order = ['open', 'review', 'action', 'closed'];
    const label = { open: 'Open', review: 'Under review', action: 'Action assigned', closed: 'Closed' };
    let i = 0, timer = 0;
    function step() {
      rows.forEach((r) => r.classList.remove('hit'));
      const r = rows[i];
      r.classList.add('hit');
      scan.style.setProperty('--y', r.offsetTop - 8 + 'px');
      const st = $('.st', r);
      const next = order[(order.indexOf(st.dataset.s) + 1) % order.length];
      setTimeout(() => { st.dataset.s = next; st.textContent = label[next]; }, 500);
      i = (i + 1) % rows.length;
    }
    whenVisible(list, () => { if (timer || REDUCE || CAPTURE) return; step(); timer = setInterval(step, 1900); }, () => { clearInterval(timer); timer = 0; });
  })();

  // ERM heat map
  (() => {
    const grid = $('#heatGrid'); if (!grid) return;
    const col = (s) => (s <= 4 ? '#DCEBE3' : s <= 5 ? '#E9EFD9' : s <= 6 ? '#F4E6C6' : s <= 7 ? '#F0D198' : s <= 8 ? '#E8B36E' : '#D98952');
    let html = '';
    for (let L = 5; L >= 1; L--) for (let I = 1; I <= 5; I++) html += `<i style="background:${col(L + I)}"></i>`;
    grid.innerHTML = html;
    const risks = [
      { id: 'R1', inh: [4, 4], res: [3, 2] },
      { id: 'R2', inh: [3, 5], res: [3, 3] },
      { id: 'R3', inh: [5, 3], res: [3, 3] },
      { id: 'R4', inh: [2, 4], res: [2, 2] }
    ];
    const dots = risks.map((r) => { const d = document.createElement('span'); d.className = 'rdot'; d.textContent = r.id; grid.appendChild(d); return d; });
    const place = (state) => risks.forEach((r, k) => {
      const [I, L] = r[state];
      dots[k].style.left = ((I - 0.5) / 5 * 100).toFixed(2) + '%';
      dots[k].style.top = ((5 - L + 0.5) / 5 * 100).toFixed(2) + '%';
    });
    // jitter shared cells slightly so labels stay readable
    risks[1].res = [3.1, 3]; risks[2].res = [2.9, 3.05];
    place('inh');
    const progs = $$('.reg .prog span');
    const base = progs.map((p) => parseFloat(p.style.getPropertyValue('--w')) || 40);
    let state = 'inh', timer = 0;
    whenVisible(grid, () => {
      if (timer || REDUCE || CAPTURE) return;
      timer = setInterval(() => {
        state = state === 'inh' ? 'res' : 'inh';
        place(state);
        progs.forEach((p, k) => p.style.setProperty('--w', (state === 'res' ? Math.min(96, base[k] + 22) : base[k]) + '%'));
      }, 3200);
    }, () => { clearInterval(timer); timer = 0; });
  })();

  /* ------------------------------------------------------------------
     11. Roadmap orbit
  ------------------------------------------------------------------ */
  (() => {
    const svg = $('#orbitSvg'); if (!svg) return;
    const NS = 'http://www.w3.org/2000/svg';
    const nodesG = $('#orbitNodes'), spokesG = $('#orbitSpokes');
    const C = 300;
    const mk = (tag, attrs, parent) => { const el = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); parent.appendChild(el); return el; };
    const pol = (r, deg) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];
    // live tools
    [['BPM', -90], ['CCM', 30], ['ERM', 150]].forEach(([t, a]) => {
      const [x, y] = pol(96, a);
      const [x0, y0] = pol(56, a);
      mk('line', { x1: x0, y1: y0, x2: x, y2: y, stroke: '#1D5A4E', 'stroke-width': 1.4, opacity: 0.5 }, spokesG);
      const g = mk('g', { class: 'o-node o-live' }, nodesG);
      mk('circle', { cx: x, cy: y, r: 31, fill: 'rgba(29,90,78,.1)' }, g);
      mk('circle', { cx: x, cy: y, r: 24, fill: '#123D34' }, g);
      const tx = mk('text', { x, y: y + 3.8, 'text-anchor': 'middle', fill: '#F4F1E9', 'font-size': 10.5, 'letter-spacing': 0.8 }, g);
      tx.textContent = t;
    });
    // in development
    const dev = [['ifc', 'Financial Controls', -126], ['aa', 'Audit Analytics', -54], ['cm', 'Compliance', 18], ['fa', 'Asset Verification', 90], ['cs', 'Contracts & SLAs', 162]];
    const devNodes = {};
    dev.forEach(([id, label, a]) => {
      const [x, y] = pol(186, a);
      const [x0, y0] = pol(58, a);
      const sp = mk('line', { class: 'o-spoke', x1: x0, y1: y0, x2: x, y2: y }, spokesG);
      const g = mk('g', { class: 'o-node o-dev' }, nodesG);
      mk('circle', { class: 'h', cx: x, cy: y, r: 20 }, g);
      mk('circle', { class: 'c', cx: x, cy: y, r: 8 }, g);
      const cos = Math.cos((a * Math.PI) / 180), sin = Math.sin((a * Math.PI) / 180);
      const [lx, ly] = pol(208, a);
      const anchor = cos > 0.35 ? 'start' : cos < -0.35 ? 'end' : 'middle';
      const t = mk('text', { x: lx, y: ly + (sin > 0.5 ? 13 : sin < -0.5 ? -3 : 5), 'text-anchor': anchor }, g);
      t.textContent = label;
      devNodes[id] = { g, sp };
    });
    // longer-term
    [0, 60, 120, 180, 240, 300].forEach((a) => {
      const [x, y] = pol(270, a);
      const g = mk('g', { class: 'o-node o-far' }, nodesG);
      mk('circle', { cx: x, cy: y, r: 4.5 }, g);
    });
    const items = $$('.area[data-node]');
    let hover = false, auto = 0, ai = 0;
    const light = (id) => {
      Object.entries(devNodes).forEach(([k, n]) => { n.g.classList.toggle('is-on', k === id); n.sp.classList.toggle('is-on', k === id); });
      items.forEach((it) => it.classList.toggle('is-on', it.dataset.node === id));
    };
    items.forEach((it) => {
      const on = () => { hover = true; light(it.dataset.node); };
      const off = () => { hover = false; };
      it.addEventListener('mouseenter', on); it.addEventListener('mouseleave', off);
      it.addEventListener('focusin', on); it.addEventListener('focusout', off);
      it.tabIndex = 0;
    });
    whenVisible(svg, () => {
      if (auto || REDUCE || CAPTURE) return;
      auto = setInterval(() => { if (hover) return; light(dev[ai][0]); ai = (ai + 1) % dev.length; }, 2400);
    }, () => { clearInterval(auto); auto = 0; });
  })();

  /* ------------------------------------------------------------------
     12. AI prompt typing
  ------------------------------------------------------------------ */
  (() => {
    const el = $('#typeTarget'); if (!el || REDUCE) return;
    const phrases = ['understand a variance', 'review an exception', 'identify a pattern', 'prepare a management discussion'];
    let p = 0, running = false, timer = 0;
    const type = (txt, i = 0) => {
      el.textContent = txt.slice(0, i);
      if (i < txt.length) timer = setTimeout(() => type(txt, i + 1), 42);
      else timer = setTimeout(() => erase(txt, txt.length), 1700);
    };
    const erase = (txt, i) => {
      el.textContent = txt.slice(0, i);
      if (i > 0) timer = setTimeout(() => erase(txt, i - 1), 22);
      else { p = (p + 1) % phrases.length; timer = setTimeout(() => type(phrases[p]), 260); }
    };
    whenVisible(el, () => { if (running || CAPTURE) return; running = true; timer = setTimeout(() => erase(phrases[0], phrases[0].length), 1400); },
      () => { clearTimeout(timer); running = false; p = 0; el.textContent = phrases[0]; });
  })();

  /* ------------------------------------------------------------------
     13. Enquiry form
  ------------------------------------------------------------------ */
  const form = $('#enquiry');
  const seg = $('#seg');
  const submitLabel = $('#submitLabel');
  function setMode(mode) {
    if (!form) return;
    mode = mode === 'discuss' ? 'discuss' : 'demo';
    $('#mode-' + mode).checked = true;
    seg.dataset.mode = mode;
    $$('label', seg).forEach((l) => l.classList.toggle('is-on', l.querySelector('input').value === mode));
    submitLabel.textContent = mode === 'demo' ? 'Prepare demo request' : 'Prepare requirement note';
  }
  $$('input[name="mode"]', form).forEach((r) => r.addEventListener('change', () => setMode(r.value)));
  setMode(seg.dataset.mode || 'demo');
  $$('button[data-mode]').forEach((b) => b.addEventListener('click', () => {
    setMode(b.dataset.mode);
    const y = form.getBoundingClientRect().top + scrollY - navOffset() - 16;
    scroller.to(y);
    setTimeout(() => $('#f-name').focus({ preventScroll: true }), 900);
  }));

  const EMAIL = 'rohit.gupta@arcadvisory.in';
  const fields = {
    name: { el: $('#f-name'), err: $('#e-name'), msg: 'Please add your name.' },
    company: { el: $('#f-company'), err: $('#e-company'), msg: 'Please add your company.' },
    email: { el: $('#f-email'), err: $('#e-email'), msg: 'Please add a work email we can reply to.' }
  };
  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  function validate() {
    let first = null;
    Object.entries(fields).forEach(([k, f]) => {
      const v = f.el.value.trim();
      let bad = !v;
      let msg = f.msg;
      if (k === 'email' && v && !validEmail(v)) { bad = true; msg = 'That email address looks incomplete. Check it and try again.'; }
      f.el.closest('.field').classList.toggle('has-error', bad);
      f.el.setAttribute('aria-invalid', String(bad));
      f.err.textContent = bad ? msg : '';
      if (bad && !first) first = f.el;
    });
    return first;
  }
  Object.values(fields).forEach((f) => f.el.addEventListener('input', () => {
    if (f.el.closest('.field').classList.contains('has-error')) validate();
  }));
  function compose() {
    const mode = seg.dataset.mode;
    const name = fields.name.el.value.trim();
    const company = fields.company.el.value.trim();
    const email = fields.email.el.value.trim();
    const phone = $('#f-phone').value.trim();
    const msg = $('#f-msg').value.trim();
    const interests = $$('.checks input:checked').map((c) => c.value);
    const subject = mode === 'demo' ? `Nexus Netra demo request: ${company}` : `Nexus Netra requirement discussion: ${company}`;
    const lines = [
      'Hello Rohit,',
      '',
      mode === 'demo' ? 'I would like to request a demo of Nexus Netra Governance OS.' : 'I would like to discuss our governance requirement with ARC.',
      '',
      `Areas of interest: ${interests.length ? interests.join(', ') : 'To be discussed'}`,
      '',
      `Name: ${name}`,
      `Company: ${company}`,
      `Email: ${email}`
    ];
    if (phone) lines.push(`Phone: ${phone}`);
    if (msg) lines.push('', msg);
    lines.push('', 'Thank you.');
    return { subject, body: lines.join('\n') };
  }
  const sent = $('#sent');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const bad = validate();
    if (bad) { bad.focus(); return; }
    const { subject, body } = compose();
    const href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const a = document.createElement('a');
    a.href = href; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a);
    try { a.click(); } catch (err) { /* the email app may be unavailable */ }
    a.remove();
    $('#sentBody').textContent = `To: ${EMAIL}\nSubject: ${subject}\n\n${body}`;
    sent.hidden = false;
    setTimeout(() => $('#sentTitle').focus({ preventScroll: true }), 50);
  });
  $('#editMessage').addEventListener('click', () => { sent.hidden = true; fields.name.el.focus(); });
  $('#copyMessage').addEventListener('click', (e) => copyText($('#sentBody').textContent, e.currentTarget, 'Message copied'));

  /* ------------------------------------------------------------------
     14. Copy to clipboard + toast
  ------------------------------------------------------------------ */
  const toast = $('#toast');
  let toastT = 0;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove('is-on'), 2200);
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function copyText(text, btn, okMsg) {
    const done = () => {
      say(okMsg || 'Copied');
      if (btn && btn.classList.contains('copy')) {
        btn.classList.add('done'); icon(btn, 'i-check');
        setTimeout(() => { btn.classList.remove('done'); icon(btn, 'i-copy'); }, 1600);
      }
    };
    const fail = () => (fallbackCopy(text) ? done() : say('Select the text to copy it'));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
    else fail();
  }
  $$('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy, b, b.dataset.copy.includes('@') ? 'Email address copied' : 'Phone number copied')));

  /* ------------------------------------------------------------------
     15. Magnetic buttons (fine pointers only)
  ------------------------------------------------------------------ */
  if (FINE && !REDUCE) {
    $$('.btn').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) / r.width, y = (e.clientY - r.top - r.height / 2) / r.height;
        b.style.transform = `translate(${(x * 6).toFixed(1)}px, ${(y * 5).toFixed(1)}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------------
     16. Deep links (#bpm, #contact …)
  ------------------------------------------------------------------ */
  // Images below the fold start lazy; once the page has loaded, fetch them
  // quietly so fast scrolling never shows empty frames.
  const eagerAll = () => $$('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
  if (CAPTURE) $$('img').forEach((i) => { i.loading = 'eager'; i.decoding = 'sync'; });
  addEventListener('load', () => {
    setTimeout(eagerAll, 1200);
    let id = (location.hash || '').slice(1);
    if (TOOL_IDS.includes(id)) { activateTab(id); id = 'tools'; }
    if (id && /^[\w.~-]+$/.test(id) && document.getElementById(id)) {
      setTimeout(() => window.scrollTo(0, targetY(document.getElementById(id))), 60);
    }
    onScroll();
  });
})();
