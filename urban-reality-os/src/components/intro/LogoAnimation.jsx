import { motion } from 'framer-motion';

const segments = [
  { d: 'M8 35 L8 12 L28 12', delay: 0.0 },
  { d: 'M28 12 L44 12 L44 26', delay: 0.09 },
  { d: 'M44 26 L46 35 L46 50', delay: 0.18 },
  { d: 'M52 22 L62 22 L62 50', delay: 0.27 },
  { d: 'M62 22 L72 22 L72 50', delay: 0.36 },
];

export default function LogoAnimation() {
  return (
    <div
      className="intro-logo"
      aria-hidden="true"
      style={{ width: 56, height: 56 }}
    >
      <svg
        viewBox="0 0 80 80"
        className="intro-logo__svg"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="logoGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%"   stopColor="#6bf2ff" />
            <stop offset="45%"  stopColor="#63a8ff" />
            <stop offset="100%" stopColor="#d874ff" />
          </linearGradient>
          <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {segments.map((seg, i) => (
          <motion.path
            key={i}
            d={seg.d}
            fill="none"
            stroke="url(#logoGradient)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#logoGlow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              pathLength: { delay: seg.delay + 0.6, duration: 0.42, ease: 'easeOut' },
              opacity:    { delay: seg.delay + 0.6, duration: 0.2 },
            }}
          />
        ))}
      </svg>
    </div>
  );
}
