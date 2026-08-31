/**
 * Which player on the page the keyboard drives.
 *
 * This lived inside `mountAll` as two lines, and both were wrong. It marked
 * the first player active **before** `init()` had resolved — while the
 * algorithm and renderer chunks were still being fetched — and then installed
 * the shortcuts, so on a slow connection a Space or an arrow key arriving in
 * that window called `toggle()` or `stepForward()` against unbound buttons, an
 * empty trace and no renderer. It also picked the first player in document
 * order whether or not that player ever loaded, so a chapter whose first
 * player failed had a keyboard target that could not respond.
 *
 * The rule that replaces it is small enough to state: **the keyboard goes to
 * the earliest player on the page that has finished loading, until the reader
 * picks one, and then it goes to the reader's.** "Earliest" rather than
 * "first to finish" matters because chunk sizes decide which promise settles
 * first, and a reader who presses Space having read nothing but the top of the
 * page means the top player.
 *
 * None of that touches the DOM, which is the point of the file: the sequencing
 * is the part that broke, and here it can be tested against a deliberately
 * slow loader instead of only in a browser.
 */

/**
 * The current keyboard target, and the rules for changing it.
 *
 * `T` is the player type. Nothing here knows what a player is beyond identity,
 * so the caller supplies whatever marking the change needs — for the site,
 * moving a `data-active` attribute.
 */
export class KeyboardTarget<T> {
  private current: T | null = null;

  /**
   * Document position of the player holding the keyboard by default.
   *
   * `Infinity` means nothing holds it yet, so any position is an improvement.
   * `-1` means the reader has chosen, and no default may take it back — a
   * player still loading when the reader clicked another one must not steal
   * the keyboard when it lands.
   */
  private defaultPosition = Infinity;

  private readonly onChange: (previous: T | null, next: T) => void;

  // Written out rather than declared as a parameter property: Node's
  // type-stripping refuses those, and these files are imported unbuilt by the
  // test runner.
  constructor(onChange: (previous: T | null, next: T) => void) {
    this.onChange = onChange;
  }

  get active(): T | null {
    return this.current;
  }

  /** The reader touched this player. Overrides any default, permanently. */
  claim(player: T): void {
    this.defaultPosition = -1;
    this.take(player);
  }

  /**
   * This player has finished initializing and is at `position` in the
   * document. It takes the keyboard only if it is earlier than whatever holds
   * it by default — and never if the reader has already chosen.
   */
  offer(player: T, position: number): void {
    if (position >= this.defaultPosition) return;
    this.defaultPosition = position;
    this.take(player);
  }

  private take(next: T): void {
    if (this.current === next) return;
    const previous = this.current;
    this.current = next;
    this.onChange(previous, next);
  }
}

/**
 * Hand the keyboard to the earliest player that loads successfully.
 *
 * `ready` is the player's own initialization promise, so a player is only ever
 * offered once it can actually respond, and a player that rejects is never
 * offered at all — it reports the failure and stays out of the running.
 */
export function activateWhenReady<T>(
  target: KeyboardTarget<T>,
  players: Array<{ player: T; ready: Promise<unknown> }>,
  onFailure: (player: T, error: unknown) => void,
): void {
  players.forEach(({ player, ready }, position) => {
    ready.then(
      () => target.offer(player, position),
      (error: unknown) => onFailure(player, error),
    );
  });
}
