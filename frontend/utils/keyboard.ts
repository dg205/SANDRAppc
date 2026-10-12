import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Platform, ScrollView } from "react-native";

// How much of the bottom of the screen the on-screen keyboard is covering.
//  - Web (e.g. iPhone Safari): the keyboard slides over the page without
//    resizing it, so measure it from the visual viewport.
//  - iOS app: reported by the keyboard events.
//  - Android app: the window shrinks to make room by itself, so 0.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") {
      const viewport = typeof window !== "undefined" ? window.visualViewport : null;
      if (!viewport) return;
      const update = () =>
        setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
      viewport.addEventListener("resize", update);
      viewport.addEventListener("scroll", update);
      update();
      return () => {
        viewport.removeEventListener("resize", update);
        viewport.removeEventListener("scroll", update);
      };
    }
    if (Platform.OS === "ios") {
      const show = Keyboard.addListener("keyboardWillShow", (e) => setInset(e.endCoordinates.height));
      const hide = Keyboard.addListener("keyboardWillHide", () => setInset(0));
      return () => {
        show.remove();
        hide.remove();
      };
    }
  }, []);

  return inset;
}

// Web only: the nearest ancestor that actually scrolls.
function scrollParentOf(element: any): any {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

// Keeps a text box inside a ScrollView visible while typing. Spread
// `scrollProps` onto the ScrollView, add `contentPadding` to its content's
// bottom padding, and pass `onInputFocus` to the TextInput's onFocus.
export function useKeyboardAwareScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const focused = useRef<any>(null);
  const inset = useKeyboardInset();

  const reveal = useCallback(() => {
    const input = focused.current;
    if (!input) return;
    try {
      if (Platform.OS === "web") {
        input.scrollIntoView?.({ block: "center" });
        // Centering is measured against the whole page, so with a tall
        // keyboard the box can still dip behind it. Nudge it clear.
        const viewport = window.visualViewport;
        const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const overlap = input.getBoundingClientRect().bottom - (visibleBottom - 16);
        if (overlap > 0) scrollParentOf(input)?.scrollBy({ top: overlap });
      } else if (Platform.OS === "android") {
        // iOS does this itself via automaticallyAdjustKeyboardInsets.
        (scrollRef.current as any)?.scrollResponderScrollNativeHandleToKeyboard?.(input, 140, true);
      }
    } catch {}
  }, []);

  // The keyboard takes a moment to finish opening; scroll once it has.
  useEffect(() => {
    if (inset > 0) {
      const timer = setTimeout(reveal, 50);
      return () => clearTimeout(timer);
    }
  }, [inset, reveal]);

  const onInputFocus = useCallback(
    (e: any) => {
      focused.current = e?.target ?? null;
      setTimeout(reveal, 350);
    },
    [reveal],
  );

  return {
    scrollRef,
    onInputFocus,
    // On web the page doesn't resize for the keyboard, so make room to
    // scroll the box above it. Native handles the space itself.
    contentPadding: Platform.OS === "web" ? inset : 0,
    scrollProps: {
      ref: scrollRef,
      automaticallyAdjustKeyboardInsets: true,
      // In the apps, dragging the page puts the keyboard away. In a browser
      // "on-drag" closes it on ANY scroll, including the one above that
      // brings the box into view (and Safari's own), so the keyboard would
      // open and immediately close.
      keyboardDismissMode: (Platform.OS === "web" ? "none" : "on-drag") as "none" | "on-drag",
    },
  };
}
