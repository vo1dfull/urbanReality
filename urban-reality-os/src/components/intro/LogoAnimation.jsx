import { motion } from 'framer-motion';

const segments = [
  { d: 'M6 28 L6 10 L22 10', delay: 0 },
  { d: 'M22 10 L34 10 L34 20', delay: 0.08 },
  { d: 'M34 20 L36 28 L36 38', delay: 0.16 },
  { d: 'M40 18 L48 18 L48 38', delay: 0.24 },
  { d: 'M48 18 L56 18 L56 38', delay: 0.32 },
];

export default function LogoAnimation() {
  return (
    <div className="intro-logo" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="intro-logo__svg">
        {segments.map((segment, index) => (
          <motion.path
            key={index}
            d={segment.d}
            fill="none"
            stroke="url(#logoGradient)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0.2 }}
            animate={{ 
              pathLength: 1, 
              opacity: 1,
              filter: "drop-shadow(0 0 10px #6bf2ff)"
            }}
            transition={{ delay: segment.delay + 0.8, duration: 0.45, ease: 'easeOut' }}
          />
        ))}
        <defs>
          <linearGradient id="logoGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#6bf2ff" />
            <stop offset="45%" stopColor="#63a8ff" />
            <stop offset="100%" stopColor="#d874ff" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
