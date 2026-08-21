interface LumaWindow extends Window {
  __lumaSmoothScrollCleanup?: () => void;
}

interface ActiveScroll {
  element: HTMLElement;
  target: number;
  lastFrame: number;
}

const IOS_EASE_REMAINING = 0.78;
const MAX_WHEEL_STEP = 180;

function canScroll(element: HTMLElement, deltaY: number): boolean {
  const style = window.getComputedStyle(element);
  if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  if (deltaY < 0) return element.scrollTop > 0;
  return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
}

function findScrollContainer(start: Element, deltaY: number): HTMLElement | null {
  let node: Element | null = start;
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement && canScroll(node, deltaY)) return node;
    node = node.parentElement;
  }
  return null;
}

function toPixels(event: WheelEvent, element: HTMLElement): number {
  if (event.deltaMode === 1) return event.deltaY * 40;
  if (event.deltaMode === 2) return event.deltaY * element.clientHeight * 0.9;
  return event.deltaY;
}

/**
 * Adds inertial mouse-wheel scrolling without touching precise touchpad input.
 * The requestAnimationFrame loop exists only while a wheel gesture is active,
 * so this has zero idle CPU cost.
 */
export function installSmoothScroll(): void {
  const lumaWindow = window as LumaWindow;
  lumaWindow.__lumaSmoothScrollCleanup?.();

  let active: ActiveScroll | null = null;
  let frame = 0;

  const stop = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    active = null;
  };

  const tick = (now: number) => {
    frame = 0;
    if (!active) return;

    const elapsed = Math.min(34, Math.max(8, now - active.lastFrame));
    active.lastFrame = now;
    const distance = active.target - active.element.scrollTop;
    const amount = 1 - Math.pow(IOS_EASE_REMAINING, elapsed / 16.667);

    if (Math.abs(distance) <= 0.35) {
      active.element.scrollTop = active.target;
      active = null;
      return;
    }

    active.element.scrollTop += distance * amount;
    frame = window.requestAnimationFrame(tick);
  };

  const onWheel = (event: WheelEvent) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.deltaY === 0 ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
      document.documentElement.classList.contains('reduce-motion')
    ) return;

    const origin = event.target instanceof Element ? event.target : null;
    if (!origin || origin.closest('.xterm, [data-native-scroll]')) return;
    const forceSmooth = Boolean(origin.closest('.cm-editor, [data-smooth-scroll="always"]'));

    const element = findScrollContainer(origin, event.deltaY);
    if (!element) return;

    const pixelDelta = toPixels(event, element);
    // Precision touchpads already provide small, inertial pixel deltas. Keeping
    // those native avoids double smoothing and preserves direct manipulation.
    if (!forceSmooth && event.deltaMode === 0 && Math.abs(pixelDelta) < 42) return;

    event.preventDefault();
    const limitedDelta = Math.sign(pixelDelta) * Math.min(Math.abs(pixelDelta), MAX_WHEEL_STEP);
    const maximum = Math.max(0, element.scrollHeight - element.clientHeight);

    if (!active || active.element !== element) {
      stop();
      active = { element, target: element.scrollTop, lastFrame: performance.now() };
    }

    active.target = Math.max(0, Math.min(maximum, active.target + limitedDelta));
    if (!frame) frame = window.requestAnimationFrame(tick);
  };

  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  lumaWindow.__lumaSmoothScrollCleanup = () => {
    window.removeEventListener('wheel', onWheel, { capture: true });
    stop();
  };
}
