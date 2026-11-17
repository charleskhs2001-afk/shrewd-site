// Full-screen camera with a body guide, a self-timer and an optional "ghost" of your
// last photo so every check-in is taken from the same spot.
// Resolves with a JPEG Blob, null if cancelled, or 'fallback' if the camera can't open.

import { normalisePhoto } from './photos.js';

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
}

export function openCamera({ title, hint, ghostUrl }) {
  return new Promise((resolve) => {
    let facing = 'user';
    let timer = 3;
    let stream = null;
    let counting = null;

    const root = document.createElement('div');
    root.className = 'cam';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', title);
    root.innerHTML = `
      <div class="cam-stage">
        <video playsinline muted autoplay></video>
        ${ghostUrl ? '<img class="cam-ghost" alt="" aria-hidden="true">' : ''}
        <svg class="cam-guide" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true">
          <path d="M70 20 C 60 120, 80 200, 92 260 C 100 300, 96 350, 90 400 M230 20 C 240 120, 220 200, 208 260 C 200 300, 204 350, 210 400" />
          <line x1="150" y1="40" x2="150" y2="360" class="mid"/>
          <circle cx="150" cy="268" r="6"/>
        </svg>
        <div class="cam-count" aria-live="assertive"></div>
        <div class="cam-top">
          <button type="button" class="cam-btn" data-c="close" aria-label="Close camera">✕</button>
          <div class="cam-title"><strong></strong><span></span></div>
          <button type="button" class="cam-btn" data-c="flip" aria-label="Switch camera">⟲</button>
        </div>
        <div class="cam-bottom">
          <button type="button" class="cam-pill" data-c="timer" aria-label="Self-timer">⏱ 3 s</button>
          <button type="button" class="cam-shutter" data-c="shoot" aria-label="Take photo"></button>
          ${ghostUrl ? '<button type="button" class="cam-pill" data-c="ghost" aria-pressed="true">Ghost on</button>' : '<span class="cam-pill-spacer"></span>'}
        </div>
      </div>
      <div class="cam-review" hidden>
        <img alt="Your photo">
        <div class="cam-review-actions">
          <button type="button" class="btn btn-ghost-light" data-c="retake">Retake</button>
          <button type="button" class="btn btn-primary" data-c="use">Use photo</button>
        </div>
      </div>`;
    root.querySelector('.cam-title strong').textContent = title;
    root.querySelector('.cam-title span').textContent = hint || '';
    const video = root.querySelector('video');
    const ghost = root.querySelector('.cam-ghost');
    if (ghost) ghost.src = ghostUrl;
    const countEl = root.querySelector('.cam-count');
    const review = root.querySelector('.cam-review');
    const reviewImg = review.querySelector('img');
    let captured = null;
    let reviewUrl = null;

    const prevFocus = document.activeElement;
    document.body.appendChild(root);
    document.body.classList.add('no-scroll');

    function stop() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    function done(result) {
      clearInterval(counting);
      stop();
      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
      root.remove();
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
      resolve(result);
    }
    async function start() {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1920 } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play().catch(() => {});
        const mirrored = facing === 'user';
        video.classList.toggle('mirror', mirrored);
        if (ghost) ghost.classList.toggle('mirror', mirrored);
      } catch (e) {
        console.warn('camera failed', e);
        done('fallback');
      }
    }
    function beep(freq = 880) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = freq;
        g.gain.value = 0.06;
        o.connect(g).connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.12);
        setTimeout(() => ctx.close(), 300);
      } catch {}
    }
    async function capture() {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      captured = await normalisePhoto(c, 1280);
      reviewUrl = URL.createObjectURL(captured);
      reviewImg.src = reviewUrl;
      reviewImg.classList.toggle('mirror', facing === 'user');
      review.hidden = false;
      review.querySelector('[data-c="use"]').focus();
    }
    function shoot() {
      if (counting) return;
      if (!timer) return void capture();
      let n = timer;
      countEl.textContent = n;
      beep(660);
      counting = setInterval(() => {
        n -= 1;
        if (n <= 0) {
          clearInterval(counting);
          counting = null;
          countEl.textContent = '';
          beep(1040);
          capture();
        } else {
          countEl.textContent = n;
          beep(660);
        }
      }, 1000);
    }
    function onKey(e) {
      if (e.key === 'Escape') done(null);
    }
    document.addEventListener('keydown', onKey);

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      const c = b.dataset.c;
      if (c === 'close') done(null);
      else if (c === 'flip') {
        facing = facing === 'user' ? 'environment' : 'user';
        start();
      } else if (c === 'timer') {
        timer = timer === 3 ? 10 : timer === 10 ? 0 : 3;
        b.textContent = timer ? `⏱ ${timer} s` : '⏱ Off';
      } else if (c === 'ghost') {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        b.textContent = on ? 'Ghost on' : 'Ghost off';
        ghost.hidden = !on;
      } else if (c === 'shoot') shoot();
      else if (c === 'retake') {
        review.hidden = true;
        captured = null;
        if (reviewUrl) URL.revokeObjectURL(reviewUrl);
        reviewUrl = null;
      } else if (c === 'use') done(captured);
    });

    start();
    root.querySelector('[data-c="shoot"]').focus();
  });
}
