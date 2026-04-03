export const panelTransition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
};

export const panelSlideLeft = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: panelTransition,
};

export const panelSlideRight = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
  transition: panelTransition,
};
