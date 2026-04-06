import { motion } from 'framer-motion';
import LogoAnimation from './LogoAnimation';

export default function IntroOverlay({ showText }) {
  return (
    <div className="intro-overlay">
      <div className="intro-overlay__hud intro-overlay__hud--top">
        <span>BOOT SEQUENCE</span>
        <span>AI CORE ONLINE</span>
      </div>
      <LogoAnimation />
      <motion.div
        className="intro-overlay__text"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: showText ? 1 : 0, y: showText ? 0 : 18 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 2.5 }}
      >
        <h1 className="glitch-text">URBAN REALITY OS</h1>
        <p className="typing">Initializing Neural Grid...</p>
      </motion.div>
      <div className="intro-overlay__hud intro-overlay__hud--bottom">
        <span>DATA GRID ONLINE</span>
        <span>CORE TEMPERATURE STABLE</span>
      </div>
    </div>
  );
}
