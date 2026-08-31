import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * THE RSA PUBLIC-KEY CRYPTOSYSTEM — CLRS §31.7.
 *
 * Everything else in chapter 31 was preparation. RSA is where Euclid's
 * algorithm and modular exponentiation turn into something you use every time
 * you open a web page.
 *
 * **The problem it solves is not encryption.** Symmetric ciphers were fine.
 * The problem is that two parties who have never met, communicating over a
 * wire an adversary is reading, need a shared secret — and until 1976 the
 * consensus was that this was impossible. RSA makes the encryption key
 * **public**: anyone can send you a message, and only you can read it.
 *
 * The construction is three steps, and the run below is all three.
 *
 * **Keys.** Pick primes p and q, let `n = pq`, and let `φ = (p−1)(q−1)`,
 * which counts the numbers below n that share no factor with it. Pick any e
 * coprime to φ, and let `d = e⁻¹ mod φ` — which is §31.2's extended Euclid,
 * and is the only step that needs anything clever.
 *
 * **Use.** Encryption is `M^e mod n` and decryption is `C^d mod n`. Both are
 * §31.6's modular exponentiation; nothing else happens.
 *
 * **Why it works.** Because `ed ≡ 1 (mod φ)`, we have `ed = 1 + kφ`, so
 * `M^{ed} = M · (M^φ)^k`, and Euler's theorem says `M^φ ≡ 1 (mod n)`.
 * Everything collapses back to M. The two exponentiations are inverse
 * operations because the exponents were built to be inverses.
 *
 * **Why it is secure — as far as anyone knows.** Recovering d from the public
 * (e, n) needs φ, and computing φ needs p and q, and getting those back out
 * of n means factoring it. Nobody knows how to factor a 2048-bit product of
 * two primes. That is not a proof, and RSA would fall to one: this is
 * security by nobody having managed yet, which is the honest description of
 * essentially all deployed cryptography.
 *
 * The numbers here are tiny so they fit in a table. Real ones are 600 digits,
 * and the algorithm is character for character the same.
 */

const ROW = { setup: 0, message: 1 } as const;

/** e⁻¹ mod m, by extended Euclid — the same procedure §31.2 animates. */
function inverse(e: number, m: number): number {
  let [oldR, r] = [e, m];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return ((oldS % m) + m) % m;
}

function powMod(base: number, exp: number, mod: number): number {
  let result = 1;
  let b = base % mod;
  for (let e = exp; e > 0; e = Math.floor(e / 2)) {
    if (e % 2 === 1) result = (result * b) % mod;
    b = (b * b) % mod;
  }
  return result;
}

export function record(input: number[]): Trace {
  const [p, q, e, ...message] = input as [number, number, number, ...number[]];
  const n = p * q;
  const phi = (p - 1) * (q - 1);
  const d = inverse(e, phi);

  /** Six derived quantities, revealed one at a time. */
  const setup: Array<{ label: string; value: number }> = [
    { label: 'p', value: p },
    { label: 'q', value: q },
    { label: 'n=pq', value: n },
    { label: 'φ', value: phi },
    { label: 'e', value: e },
    { label: 'd', value: d },
  ];
  let revealed = 0;

  const cipher: Array<number | null> = message.map(() => null);
  const plain: Array<number | null> = message.map(() => null);

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GridData {
    const width = Math.max(setup.length, message.length);
    const pad = <T>(cells: T[]): Array<T | { value: null }> => [
      ...cells,
      ...Array.from({ length: width - cells.length }, () => ({ value: null as null })),
    ];
    return {
      kind: 'grid',
      corner: '',
      colLabels: Array.from({ length: width }, (_, i) =>
        i < setup.length ? setup[i]!.label : null,
      ),
      rows: [
        {
          label: 'key',
          cells: pad(
            setup.map((s, i): GridCell => ({ value: i < revealed ? s.value : null })),
          ) as GridCell[],
        },
        { label: 'M', cells: pad(message.map((m): GridCell => ({ value: m }))) as GridCell[] },
        { label: 'C', cells: pad(cipher.map((c): GridCell => ({ value: c }))) as GridCell[] },
        { label: 'M′', cells: pad(plain.map((m): GridCell => ({ value: m }))) as GridCell[] },
      ],
    };
  }

  const key = (i: number) => `${ROW.setup},${i}`;
  const msg = (i: number) => `1,${i}`;
  const cip = (i: number) => `2,${i}`;
  const back = (i: number) => `3,${i}`;
  const chips = () =>
    auxOf(
      [null, revealed > 4 ? e : null, revealed > 5 ? d : null, revealed > 2 ? n : null],
      undefined,
      [null, 'e (public)', 'd (private)', 'n (public)'],
    );

  const notes = [
    `Two primes. In practice they are 300 digits each, and finding them is §31.8's job.`,
    `The second prime. Their product is the only part of them that ever becomes public.`,
    `n = ${p}·${q} = ${n}. This is published. Recovering p and q from it is the hard problem.`,
    `φ = (p−1)(q−1) = ${phi}: how many numbers below n share no factor with it. This stays secret.`,
    `e = ${e}, coprime to φ. Published alongside n — together they are the public key.`,
    `d = e⁻¹ mod φ = ${d}, from extended Euclid. Secret, and computable only if you know φ.`,
  ];

  for (let i = 0; i < setup.length; i++) {
    revealed = i + 1;
    stats.writes++;
    emit(
      'RSA',
      i < 2 ? 1 : i === 2 ? 2 : i === 3 ? 3 : i === 4 ? 4 : 5,
      snapshot(),
      {
        done: Array.from({ length: i }, (_, j) => key(j)),
        move: [key(i)],
        ...(i === 5 ? { look: [key(3), key(4)] } : {}),
        ...(i === 2 ? { look: [key(0), key(1)] } : {}),
        scope: Array.from({ length: setup.length }, (_, j) => key(j)),
        scopeLabel: 'key generation',
        aux: { keys: chips() },
      },
      notes[i]!,
    );
  }

  // ---- encrypt -----------------------------------------------------------
  for (let i = 0; i < message.length; i++) {
    cipher[i] = powMod(message[i]!, e, n);
    stats.writes++;
    emit(
      'RSA',
      7,
      snapshot(),
      {
        done: Array.from({ length: setup.length }, (_, j) => key(j)),
        look: [msg(i), key(4)],
        move: [cip(i)],
        arrows: [{ from: msg(i), to: cip(i), role: 'look' as const }],
        scope: message.map((_, j) => cip(j)),
        scopeLabel: 'the ciphertext — safe to send',
        aux: { keys: chips() },
      },
      `${message[i]}^${e} mod ${n} = ${cipher[i]}. Anyone with the public key can do this.`,
    );
  }

  // ---- decrypt -----------------------------------------------------------
  for (let i = 0; i < message.length; i++) {
    plain[i] = powMod(cipher[i]!, d, n);
    stats.comparisons++;
    stats.writes++;
    emit(
      'RSA',
      8,
      snapshot(),
      {
        done: Array.from({ length: setup.length }, (_, j) => key(j)),
        look: [cip(i), key(5)],
        move: [back(i)],
        arrows: [{ from: cip(i), to: back(i), role: 'look' as const }],
        mark: [msg(i)],
        aux: { keys: chips() },
      },
      `${cipher[i]}^${d} mod ${n} = ${plain[i]}, which is the original. The exponents were built to undo each other.`,
    );
  }

  emit(
    'RSA',
    8,
    snapshot(),
    {
      done: [
        ...Array.from({ length: setup.length }, (_, j) => key(j)),
        ...message.map((_, i) => back(i)),
      ],
      mark: message.map((_, i) => msg(i)),
      keys: { p, q, n, phi, e, d },
      cipher: cipher.map((c) => c!),
      plain: plain.map((m) => m!),
      aux: { keys: chips() },
    },
    `M′ is M throughout. The whole system is two modular exponentiations and one modular inverse.`,
  );

  return { steps, output: { n, phi, e, d } };
}

/**
 * The keys are consistent, the round trip is the identity, and the ciphertext
 * is not the plaintext.
 *
 * The middle check is the one that matters and it is checked on every symbol
 * rather than on the pair the run happened to show. The last one is not
 * pedantry: an `e` and a modulus can conspire to leave small messages
 * untouched, and a cipher that silently does nothing would pass every other
 * check here.
 */
function verify(input: number[], trace: Trace): string | null {
  const [p, q, e, ...message] = input as [number, number, number, ...number[]];
  const hi = trace.steps.at(-1)!.hi as {
    keys?: { n: number; phi: number; e: number; d: number };
    cipher?: number[];
    plain?: number[];
  };
  if (!hi.keys || !hi.cipher || !hi.plain) return 'the run reported no result';
  const { n, phi, d } = hi.keys;

  if (n !== p * q) return `n is ${n}, not ${p}·${q}`;
  if (phi !== (p - 1) * (q - 1)) return `φ is ${phi}, not (p−1)(q−1)`;
  if ((e * d) % phi !== 1 % phi)
    return `e·d mod φ is ${(e * d) % phi}, not 1 — d is not e's inverse`;

  for (let i = 0; i < message.length; i++) {
    if (hi.plain[i] !== message[i]) {
      return `symbol ${i + 1} came back as ${hi.plain[i]}, not ${message[i]}`;
    }
    if (hi.cipher[i]! < 0 || hi.cipher[i]! >= n)
      return `ciphertext ${hi.cipher[i]} is outside 0‥n−1`;
  }
  if (message.every((m, i) => hi.cipher![i] === m)) {
    return 'every symbol encrypted to itself — this key encrypts nothing';
  }
  return null;
}

const PRIMES = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function generate(n: number): number[] {
  const pick = () => PRIMES[Math.floor(Math.random() * PRIMES.length)]!;
  const p = pick();
  let q = pick();
  while (q === p) q = pick();
  const phi = (p - 1) * (q - 1);
  // Carmichael's λ(n) = lcm(p−1, q−1), which is the *true* order of the
  // group. It divides φ, and it is what decides whether an exponent does
  // anything.
  const lambda = ((p - 1) * (q - 1)) / gcd(p - 1, q - 1);

  // e must be coprime to φ — and it must also not be ≡ 1 (mod λ), because
  // such an e makes M^e ≡ M for *every* M and the cipher is the identity
  // function. That is a real RSA parameter pitfall rather than an artefact of
  // small numbers, and the generative test found it here before a reader did.
  const candidates: number[] = [];
  for (let e = 3; e < phi; e += 2) {
    if (gcd(e, phi) === 1 && e % lambda !== 1 % lambda) candidates.push(e);
  }

  // …and that guard is necessary without being sufficient. A message M is
  // fixed whenever its own multiplicative order divides e − 1, and the orders
  // of a handful of random messages can all divide e − 1 while e itself is far
  // from 1 mod λ. With a message only a few symbols long that is not rare, so
  // the only honest test is the one `verify` applies: encrypt it and look.
  const width = Math.max(2, Math.min(n, 5));
  for (let attempt = 0; attempt < 40; attempt++) {
    const e = candidates[Math.floor(Math.random() * Math.min(candidates.length, 12))]!;
    const message = Array.from(
      { length: width },
      () => 2 + Math.floor(Math.random() * (p * q - 3)),
    );
    if (message.some((m) => powMod(m, e, p * q) !== m)) return [p, q, e, ...message];
  }
  return generate(n);
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 4) return { error: 'Give p, q, e and at least one message number.' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0) return { error: `"${part}" is not a whole number.` };
    values.push(v);
  }
  const [p, q, e] = values as [number, number, number];
  const isPrime = (x: number) => {
    if (x < 2) return false;
    for (let k = 2; k * k <= x; k++) if (x % k === 0) return false;
    return true;
  };
  if (!isPrime(p) || !isPrime(q)) return { error: 'p and q must both be prime.' };
  if (p === q) return { error: 'p and q must be different.' };
  if (p * q > 9999) return { error: 'Keep p·q under 10000 so the table stays readable.' };
  const phi = (p - 1) * (q - 1);
  if (gcd(e, phi) !== 1) return { error: `e must be coprime to φ = ${phi}.` };
  const lambda = ((p - 1) * (q - 1)) / gcd(p - 1, q - 1);
  if (e % lambda === 1 % lambda) {
    return { error: `e ≡ 1 mod λ = ${lambda}, so every message would encrypt to itself.` };
  }
  const message = values.slice(3);
  if (message.some((m) => m >= p * q))
    return { error: `Every message must be under n = ${p * q}.` };
  // The same trap one step further in: these particular messages may all have
  // an order dividing e − 1 even when e does not fix the whole group.
  if (message.every((m) => powMod(m, e, p * q) === m)) {
    return {
      error: `With e = ${e}, every one of those messages encrypts to itself — try another e.`,
    };
  }
  return { value: values };
}

export const rsa: AlgorithmModule = {
  id: 'rsa',
  name: 'RSA',
  visualizer: 'grid',
  aux: [{ key: 'keys', label: 'keys', hint: 'what is published, and what is not' }],
  procOrder: ['RSA'],
  procedures: {
    // A transcription of §31.7's development: the book lays RSA out as a
    // numbered recipe in prose and two one-line formulas, not as a procedure.
    RSA: {
      title: 'RSA(p, q, e)',
      indent: [0, 0, 0, 0, 0, 0, 0, 0],
      lines: [
        'pick two large primes p and q',
        'n = p·q',
        'φ = (p − 1)(q − 1)',
        'pick e, small and coprime to φ',
        'd = e⁻¹ mod φ,  by EXTENDED-EUCLID',
        'the public key is (e, n);  the secret key is (d, n)',
        'P(M) = M^e mod n',
        'S(C) = C^d mod n',
      ],
    },
  },
  complexity: {
    best: 'Θ(lg n) multiplications',
    average: 'Θ(lg n) multiplications',
    worst: 'Θ(lg n) multiplications',
    space: 'Θ(1)',
    extra: [
      ['Each operation', 'one modular exponentiation — §31.6'],
      ['Key generation', 'two primality searches and one extended Euclid'],
      ['Security rests on', 'factoring n being hard — believed, never proved'],
      ['Typical size', 'n of 2048 bits, so p and q of about 300 digits'],
      ['In practice', 'used to exchange a symmetric key, not to encrypt bulk data'],
    ],
  },
  input: {
    minSize: 2,
    maxSize: 5,
    noun: 'message',
    placeholder: '11, 29, 3, 100, 42',
    note: 'two primes, then e, then the numbers to encrypt',
    label: 'p, q, e and the message numbers, separated by commas',
    generate,
    parse,
    size: (value: number[]) => value.length - 3,
  },
  defaultSize: 3,
  result: { kind: 'transforms', verify },
  record,
};
