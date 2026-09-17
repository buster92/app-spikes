const stage = document.querySelector("#feedStage");

if (stage && !stage.dataset.swipeGuardInstalled) {
  stage.dataset.swipeGuardInstalled = "true";
  const nativeAddEventListener = stage.addEventListener.bind(stage);

  stage.addEventListener = function guardedAddEventListener(type, listener, options) {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);

    // app.js registers the feed's upward-swipe handler in capture phase. Some
    // games (currently Match) own swipe gestures inside their play surface.
    // Wrap only that stage listener so the event can still continue to the
    // game's normal pointer handlers instead of being swallowed at the stage.
    if (type === "pointerup" && capture && typeof listener === "function") {
      const wrapped = function guardedPointerUp(event) {
        const element = event.target instanceof Element ? event.target : null;
        const ownedControl = element?.closest?.("[data-game-swipe-control]");
        const resultOverlay = document.querySelector("#resultOverlay");
        const gameIsActive = Boolean(resultOverlay?.hidden);

        if (ownedControl && gameIsActive) return;
        return listener.call(this, event);
      };
      return nativeAddEventListener(type, wrapped, options);
    }

    return nativeAddEventListener(type, listener, options);
  };
}
