import type {
  AlgorithmInput,
  AlgorithmModule,
  AuxBuffer,
  InputSpec,
  ParsedInput,
  Step,
} from '../algorithms/types.ts';
import { loadAlgorithm } from '../algorithms/lazy.ts';
import { loadRenderer, type Renderer } from './renderers.ts';
import { Tape } from './tape.ts';

/**
 * Drives one visualizer instance.
 *
 * The pseudocode, complexity table and control markup are all rendered by
 * Astro at build time; this class only records a trace and plays it back, so
 * the page is readable before any JavaScript runs.
 *
 * Several players can live on one page. State is per-instance and keyboard
 * shortcuts go to whichever one the reader last touched — which is marked on
 * screen, so "last touched" is never a guess.
 */

const SPEED_BASE_MS = 420;

/** Defaults the input controls fall back to when a module says nothing. */
const INPUT_DEFAULTS: Required<Pick<InputSpec, 'min' | 'max'>> = { min: 5, max: 78 };

function fmtValue(v: number | null | undefined): string {
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  if (v === null || v === undefined) return '·';
  return String(v);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class AlgorithmPlayer {
  private root: HTMLElement;
  private algo!: AlgorithmModule;
  private steps: Step[] = [];
  private index = 0;
  private playing = false;
  private speed = 1;
  private lastTick = 0;
  private baseInput: AlgorithmInput = [];
  private maxValue = 1;
  private rafId: number | null = null;
  private tape!: Tape;
  /** Chosen from the module's `visualizer` kind, before anything can draw. */
  private renderer!: Renderer;

  // Elements, resolved once in bind().
  private canvas!: HTMLCanvasElement;
  private tapeCanvas!: HTMLCanvasElement;
  /** One chip container per aux row the module declared, keyed by `hi.aux` key. */
  private auxRows = new Map<string, HTMLElement>();
  private note!: HTMLElement;
  private statCompares!: HTMLElement;
  private statSwaps!: HTMLElement;
  private statWrites!: HTMLElement;
  private btnPlay!: HTMLButtonElement;
  private btnBack!: HTMLButtonElement;
  private btnFwd!: HTMLButtonElement;
  private btnReset!: HTMLButtonElement;
  private scrub!: HTMLInputElement;
  private stepCount!: HTMLElement;
  private speedSelect!: HTMLSelectElement;
  private sizeSlider!: HTMLInputElement;
  private nReadout!: HTMLElement;
  private btnShuffle!: HTMLButtonElement;
  private customInput!: HTMLInputElement;
  private btnApply!: HTMLButtonElement;
  private customErr!: HTMLElement;
  private codePanel!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async init(): Promise<void> {
    const id = this.root.dataset.algorithm;
    if (!id) throw new Error('Visualizer root is missing data-algorithm.');
    this.algo = await loadAlgorithm(id);
    // Before bind(): wire() starts a ResizeObserver, which fires on observe,
    // and resizeAll() draws.
    this.renderer = await loadRenderer(this.algo.visualizer);
    this.bind();
    this.tape = new Tape(this.tapeCanvas);
    this.wire();

    const size = Number(this.root.dataset.size ?? this.algo.defaultSize ?? 12);
    this.setInput(makeInput(size, this.algo.input));
    this.resizeAll();
    this.root.dataset.ready = 'true';
  }

  private q<T extends HTMLElement>(sel: string): T {
    const el = this.root.querySelector<T>(sel);
    if (!el) throw new Error(`Visualizer is missing element "${sel}".`);
    return el;
  }

  private bind(): void {
    this.canvas = this.q<HTMLCanvasElement>('[data-el="canvas"]');
    this.tapeCanvas = this.q<HTMLCanvasElement>('[data-el="tape"]');
    this.root.querySelectorAll<HTMLElement>('[data-aux-key]').forEach((el) => {
      this.auxRows.set(el.dataset.auxKey!, el);
    });
    this.note = this.q('[data-el="note"]');
    this.statCompares = this.q('[data-el="stat-compares"]');
    this.statSwaps = this.q('[data-el="stat-swaps"]');
    this.statWrites = this.q('[data-el="stat-writes"]');
    this.btnPlay = this.q<HTMLButtonElement>('[data-el="play"]');
    this.btnBack = this.q<HTMLButtonElement>('[data-el="back"]');
    this.btnFwd = this.q<HTMLButtonElement>('[data-el="forward"]');
    this.btnReset = this.q<HTMLButtonElement>('[data-el="reset"]');
    this.scrub = this.q<HTMLInputElement>('[data-el="scrub"]');
    this.stepCount = this.q('[data-el="step-count"]');
    this.speedSelect = this.q<HTMLSelectElement>('[data-el="speed"]');
    this.sizeSlider = this.q<HTMLInputElement>('[data-el="size"]');
    this.nReadout = this.q('[data-el="n-readout"]');
    this.btnShuffle = this.q<HTMLButtonElement>('[data-el="shuffle"]');
    this.customInput = this.q<HTMLInputElement>('[data-el="custom-input"]');
    this.btnApply = this.q<HTMLButtonElement>('[data-el="apply"]');
    this.customErr = this.q('[data-el="custom-error"]');
    this.codePanel = this.q('[data-el="code-panel"]');
  }

  // ---------- data ----------

  /**
   * Adopt a new input and replay from it.
   *
   * The input is opaque here: the player never inspects it, because it may be
   * a graph. It asks the module how big it is and hands it straight back to
   * `record`, and the copy below is why a re-record cannot be affected by a
   * recorder that mutates what it was given.
   */
  private setInput(input: AlgorithmInput): void {
    this.baseInput = structuredClone(input);
    const n = inputSize(this.baseInput, this.algo.input);
    this.sizeSlider.value = String(n);
    this.nReadout.textContent = String(n);
    this.regenerate();
  }

  private regenerate(): void {
    const { steps } = this.algo.record(structuredClone(this.baseInput));
    this.steps = steps;
    this.index = 0;
    // Scanned over the whole trace, not just the input: HEAP-INCREASE-KEY
    // raises a key above anything the reader typed, and a bar that overflows
    // the plot is worse than one that is slightly short.
    this.maxValue = traceMaxValue(steps, this.baseInput);
    this.scrub.max = String(steps.length - 1);
    this.tape.setTrace(steps);
    requestAnimationFrame(() => this.resizeAll());
    this.render();
  }

  // ---------- rendering ----------

  private resizeAll(): void {
    this.renderer.resize(this.canvas, this.steps[this.index], { maxValue: this.maxValue });
    this.tape.layout();
    this.tape.render(this.index);
  }

  private render(): void {
    const step = this.steps[this.index];
    if (!step) return;

    this.renderer.draw(this.canvas, step, { maxValue: this.maxValue });
    this.tape.render(this.index);
    this.renderAux(step);
    this.renderCodeHighlight(step);

    const last = this.steps.length - 1;
    this.note.textContent = step.note;
    this.statCompares.textContent = String(step.stats.comparisons);
    this.statSwaps.textContent = String(step.stats.swaps);
    this.statWrites.textContent = String(step.stats.writes);
    this.scrub.value = String(this.index);
    this.scrub.setAttribute('aria-valuetext', `Step ${this.index} of ${last}. ${step.note}`);
    this.stepCount.textContent = `${this.index} / ${last}`;
    this.btnBack.disabled = this.index === 0;
    this.btnFwd.disabled = this.index === last;
  }

  /**
   * Fill the auxiliary rows the module declared.
   *
   * Every declared row is in the DOM for the whole run, whether or not this
   * step has anything to put in it — an empty row measures the same as a full
   * one, so a merge can never shove the chart down mid-animation.
   */
  private renderAux(step: Step): void {
    if (this.auxRows.size === 0) return;
    const aux = (step.hi as { aux?: Record<string, AuxBuffer> }).aux;

    for (const [key, el] of this.auxRows) {
      const buf = aux?.[key];
      if (!buf) {
        el.innerHTML = '<span class="aux-chip empty">—</span>';
        continue;
      }
      let html = '';
      for (let i = 1; i < buf.values.length; i++) {
        const v = buf.values[i];
        const cls = v === null || v === undefined ? ' empty' : i === buf.ptr ? ' ptr' : '';
        const label = buf.labels?.[i];
        const caption =
          label === null || label === undefined
            ? ''
            : `<span class="aux-index">${escapeHtml(String(label))}</span>`;
        html += `<span class="aux-chip${cls}">${fmtValue(v)}${caption}</span>`;
      }
      el.innerHTML = html || '<span class="aux-chip empty">—</span>';
    }

    this.scrollAuxIntoView();
  }

  /**
   * Keep the pointer chip visible. Counting sort's C is as long as the key
   * range, which is wider than the strip; scrolling the row (never the page)
   * is what makes it readable.
   */
  private scrollAuxIntoView(): void {
    for (const el of this.auxRows.values()) {
      const ptr = el.querySelector<HTMLElement>('.aux-chip.ptr');
      if (!ptr) continue;
      const target = ptr.offsetLeft + ptr.offsetWidth / 2 - el.clientWidth / 2;
      el.scrollLeft = Math.max(0, target);
    }
  }

  private renderCodeHighlight(step: Step): void {
    const blocks = this.codePanel.querySelectorAll<HTMLElement>('[data-proc]');
    blocks.forEach((block) => {
      const isActive = block.dataset.proc === step.proc;
      block.classList.toggle('dim', !isActive);
      block.querySelectorAll<HTMLElement>('.code-line').forEach((row) => {
        row.classList.toggle('active', isActive && Number(row.dataset.line) === step.line);
      });
    });
  }

  // ---------- playback ----------

  private setIndex(i: number): void {
    this.index = Math.max(0, Math.min(this.steps.length - 1, i));
    this.render();
  }

  stepForward(): void {
    if (this.index < this.steps.length - 1) this.setIndex(this.index + 1);
    else this.pause();
  }

  stepBackward(): void {
    this.setIndex(this.index - 1);
  }

  play(): void {
    if (this.index >= this.steps.length - 1) this.setIndex(0);
    this.playing = true;
    this.btnPlay.classList.add('is-playing');
    this.btnPlay.setAttribute('aria-label', 'Pause');
    this.lastTick = performance.now();
    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }

  pause(): void {
    this.playing = false;
    this.btnPlay.classList.remove('is-playing');
    this.btnPlay.setAttribute('aria-label', 'Play');
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  private tick(now: number): void {
    if (!this.playing) return;
    if (now - this.lastTick >= SPEED_BASE_MS / this.speed) {
      this.lastTick = now;
      if (this.index >= this.steps.length - 1) {
        this.pause();
        return;
      }
      this.stepForward();
    }
    if (this.playing) this.rafId = requestAnimationFrame((t) => this.tick(t));
  }

  // ---------- events ----------

  private wire(): void {
    const claim = () => AlgorithmPlayer.setActive(this);

    this.btnPlay.addEventListener('click', () => {
      claim();
      this.toggle();
    });
    this.btnFwd.addEventListener('click', () => {
      claim();
      this.pause();
      this.stepForward();
    });
    this.btnBack.addEventListener('click', () => {
      claim();
      this.pause();
      this.stepBackward();
    });
    this.btnReset.addEventListener('click', () => {
      claim();
      this.pause();
      this.setIndex(0);
    });
    this.scrub.addEventListener('input', () => {
      claim();
      this.pause();
      this.setIndex(Number(this.scrub.value));
    });
    this.speedSelect.addEventListener('change', () => {
      this.speed = Number(this.speedSelect.value);
    });

    this.sizeSlider.addEventListener('input', () => {
      this.nReadout.textContent = this.sizeSlider.value;
    });
    this.sizeSlider.addEventListener('change', () => {
      claim();
      this.pause();
      this.setInput(makeInput(Number(this.sizeSlider.value), this.algo.input));
    });
    this.btnShuffle.addEventListener('click', () => {
      claim();
      this.pause();
      this.setInput(makeInput(Number(this.sizeSlider.value), this.algo.input));
    });
    this.btnApply.addEventListener('click', () => {
      claim();
      this.pause();
      const parsed: ParsedInput = parseCustomInput(this.customInput.value, this.algo.input);
      if ('error' in parsed) {
        this.customErr.textContent = parsed.error;
        return;
      }
      this.customErr.textContent = '';
      this.setInput(parsed.value);
    });
    this.customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.btnApply.click();
      }
    });

    this.root.addEventListener('pointerdown', claim);
    this.root.addEventListener('focusin', claim);

    // A ResizeObserver rather than a window listener: the component also
    // changes width when web fonts land and when the sidebar collapses, and
    // neither of those fires a window resize.
    new ResizeObserver(() => this.resizeAll()).observe(this.root);

    // Redraw when the theme changes, since colours come from CSS variables.
    // The tape's cached strip has to be repainted, not just blitted.
    const repaint = () => {
      this.tape.layout();
      this.render();
    };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);
    new MutationObserver(repaint).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  // ---------- keyboard ----------

  static active: AlgorithmPlayer | null = null;

  /** Mark one player as the keyboard target, and show which one that is. */
  static setActive(player: AlgorithmPlayer): void {
    if (AlgorithmPlayer.active === player) return;
    if (AlgorithmPlayer.active) delete AlgorithmPlayer.active.root.dataset.active;
    AlgorithmPlayer.active = player;
    player.root.dataset.active = 'true';
  }

  static installKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      const target = document.activeElement;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const player = AlgorithmPlayer.active;
      if (!player) return;

      if (e.key === ' ') {
        e.preventDefault();
        player.toggle();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        player.pause();
        player.stepForward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        player.pause();
        player.stepBackward();
      } else if (e.key === 'Home') {
        e.preventDefault();
        player.pause();
        player.setIndex(0);
      }
    });
  }
}

// ---------- helpers ----------

/**
 * Build a fresh input of size `n`.
 *
 * A module that declares `generate` owns this outright — a graph cannot be
 * described by a uniform draw between two bounds, and neither can a BST
 * insertion order chosen to make the tree lean. Everything else gets the
 * numbers the player has always produced, between the module's own bounds.
 */
export function makeInput(n: number, spec?: InputSpec): AlgorithmInput {
  if (spec?.generate) return spec.generate(n);
  const min = spec?.min ?? INPUT_DEFAULTS.min;
  const max = spec?.max ?? INPUT_DEFAULTS.max;
  const span = Math.max(1, max - min + 1);
  return Array.from({ length: n }, () => min + Math.floor(Math.random() * span));
}

/** Parse what the reader typed, deferring to the module when it can parse its own. */
export function parseCustomInput(str: string, spec?: InputSpec): ParsedInput {
  if (spec?.parse) return spec.parse(str);
  const min = spec?.min ?? INPUT_DEFAULTS.min;
  const max = spec?.max ?? INPUT_DEFAULTS.max;

  const parts = str
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length < 2) return { error: 'Enter at least 2 numbers, separated by commas.' };
  if (parts.length > 24) return { error: 'Keep it to 24 numbers or fewer.' };

  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return { error: `"${p}" isn't a whole number.` };
    const v = Number.parseInt(p, 10);
    // The bounds are the module's, not the player's: counting sort is only
    // legible with small keys, and radix sort wants three digits.
    if (v < min || v > max) return { error: `Use whole numbers from ${min} to ${max}.` };
    nums.push(v);
  }
  return { value: nums };
}

/**
 * How big an input is, for the `n` readout.
 *
 * Length is right for every list of numbers; a module whose input has a size
 * that is not its length — a graph measured in vertices, not edges — says so
 * with `InputSpec.size`.
 */
export function inputSize(input: AlgorithmInput, spec?: InputSpec): number {
  if (spec?.size) return spec.size(input);
  // A structured input has no length at all, so the fallback has to be its
  // own: a graph is measured in vertices. A module is still expected to
  // declare `size`; this is what keeps the readout honest if it forgets.
  if (!Array.isArray(input)) return input.kind === 'graph' ? input.n : input.text.length;
  return input.length;
}

/**
 * The tallest bar the chart will ever have to draw, so heights stay stable
 * across the whole run. Sentinels are skipped — ∞ is not a magnitude.
 */
export function traceMaxValue(steps: Step[], fallback: AlgorithmInput): number {
  let max = 1;
  // Only a bar chart has a tallest bar, and only an array-shaped input can
  // seed one. A graph contributes nothing here and is skipped rather than
  // iterated into NaN.
  if (Array.isArray(fallback)) {
    for (const v of fallback) if (Number.isFinite(v) && v > max) max = v;
  }
  for (const step of steps) {
    if (!step.array) continue;
    for (let k = 1; k < step.array.length; k++) {
      const v = step.array[k];
      if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v;
    }
  }
  return max;
}

/** Boot every visualizer on the page. */
export function mountAll(): void {
  const roots = document.querySelectorAll<HTMLElement>('[data-algorithm]');
  let first: AlgorithmPlayer | null = null;
  roots.forEach((root) => {
    const player = new AlgorithmPlayer(root);
    if (!first) first = player;
    player.init().catch((err) => {
      console.error(err);
      root.dataset.error = 'true';
    });
  });
  if (first) AlgorithmPlayer.setActive(first);
  AlgorithmPlayer.installKeyboardShortcuts();
}
