import { motion } from 'framer-motion';

const brandingText = 'URBAN REALITY OS'.split('');
const particleConfig = [
  { left: '12%', top: '22%', size: 8, opacity: 0.14, delay: 0 },
  { left: '78%', top: '18%', size: 6, opacity: 0.12, delay: 0.4 },
  { left: '22%', top: '72%', size: 10, opacity: 0.16, delay: 0.3 },
  { left: '58%', top: '82%', size: 7, opacity: 0.1, delay: 0.8 },
  { left: '84%', top: '56%', size: 5, opacity: 0.08, delay: 0.6 },
];

export default function SplashScreen() {
  return (
    <motion.div
      className="splash-screen"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(16px)' }}
      transition={{ duration: 0.45, ease: 'easeInOut' }}
    >
      <div className="splash-screen__backdrop" aria-hidden="true">
        {particleConfig.map((particle, index) => (
          <motion.span
            key={index}
            className="splash-screen__particle"
            style={{
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size,
              opacity: particle.opacity,
            }}
            animate={{ y: [0, -12, 0], opacity: [particle.opacity, particle.opacity + 0.18, particle.opacity] }}
            transition={{ duration: 4 + index * 0.4, repeat: Infinity, ease: 'easeInOut', delay: particle.delay }}
          />
        ))}
      </div>

      <motion.div
        className="splash-screen__panel"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="splash-screen__glow" />

        <motion.img
          src="/logo.svg"
          alt="Urban Reality OS"
          className="splash-screen__logo"
          initial={{ opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: [0.96, 1.04, 1] }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], times: [0, 0.55, 1] }}
        />

        <motion.div
          className="splash-screen__title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.4, ease: 'easeOut' }}
        >
          {brandingText.map((char, index) => (
            <motion.span
              key={`${char}-${index}`}
              className="splash-screen__letter"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.95 + index * 0.045, duration: 0.28, ease: 'easeOut' }}
            >
              {char}
            </motion.span>
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
