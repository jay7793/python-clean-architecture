// jsdom lacks AnimationEvent, so React would listen for webkitAnimationEnd instead of animationend. React picks the
// event name when react-dom loads, so this file runs before any setup file that imports it.
if (!('AnimationEvent' in window)) {
  Object.defineProperty(window, 'AnimationEvent', { value: class AnimationEvent extends Event {} })
}
