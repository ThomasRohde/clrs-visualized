import { loadAlgorithm } from '../algorithms/lazy.ts';
import { draw, resize } from './array-bars.ts';

/**
 * The index page's opening demonstration.
 *
 * A stripped player with no controls: it runs insertion sort on a fixed array
 * and loops. The claim the page makes is that the pseudocode and the data
 * move together, so the hero shows exactly that rather than describing it.
 *
 * The array is deliberately not random. A hero should look composed every
 * time it loads, and a fixed input also means the silhouette in the first
 * frame is the one that was designed.
 */

const INPUT = [42, 17, 63, 8, 51, 29, 74, 35, 12, 58, 23];
const STEP_MS = 340;
const HOLD_MS = 1600;

export async function mountHero(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-el="hero-canvas"]');
  const note = root.querySelector<HTMLElement>('[data-el="hero-note"]');
  const codeRoot = root.querySelector<HTMLElement>('[data-el="hero-code"]');
  if (!canvas || !note || !codeRoot) return;

  const algo = await loadAlgorithm('insertion-sort');
  const { steps } = algo.record(INPUT.slice());
  const maxValue = Math.max(...INPUT);
  const lines = codeRoot.querySelectorAll<HTMLElement>('.code-line');

  let index = 0;

  const paint = () => {
    const step = steps[index];
    if (!step) return;
    draw(canvas, step, { maxValue });
    note.textContent = step.note;
    lines.forEach((row) => {
      row.classList.toggle('active', Number(row.dataset.line) === step.line);
    });
  };

  const refit = () => {
    resize(canvas, steps[index], { maxValue });
    paint();
  };

  new ResizeObserver(() => refit()).observe(root);
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);

  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  // With reduced motion the hero holds one frame from the middle of the run:
  // the same picture, sorted prefix on the left and a shift in progress, but
  // nothing moves.
  if (still.matches) {
    index = Math.floor(steps.length * 0.55);
    refit();
    root.dataset.ready = 'true';
    return;
  }

  refit();
  root.dataset.ready = 'true';

  let last = performance.now();
  let holdUntil = 0;
  let running = true;
  let raf = 0;

  const tick = (now: number) => {
    if (!running) return;
    if (now >= holdUntil && now - last >= STEP_MS) {
      last = now;
      if (index >= steps.length - 1) {
        // Sit on the finished array for a beat, then start over.
        holdUntil = now + HOLD_MS;
        index = 0;
      } else {
        index += 1;
      }
      paint();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // Don't animate a hero nobody is looking at.
  new IntersectionObserver((entries) => {
    const visible = entries[0]?.isIntersecting ?? true;
    if (visible === running) return;
    running = visible;
    if (running) {
      last = performance.now();
      holdUntil = 0;
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
    }
  }).observe(root);
}
