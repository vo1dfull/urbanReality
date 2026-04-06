import { motion } from 'framer-motion';
import LogoAnimation from './LogoAnimation';

export default function IntroOverlay({ showText }) {
  return (
    <div className="intro-overlay">
      <div className="intro-overlay__hud intro-overlay__hud--top">
        <span>SITE SURVEY</span>
        <span>INFRASTRUCTURE PLAN</span>
      </div>
      <LogoAnimation />
      <motion.div
        className="intro-overlay__text"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: showText ? 1 : 0, y: showText ? 0 : 18 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 2.5 }}
      >
        <h1 className="title">URBAN REALITY</h1>
        <p className="typing">Simulating City Growth...</p>
      </motion.div>
      <div className="intro-overlay__hud intro-overlay__hud--bottom">
        <span>CONSTRUCTION ONLINE</span>
        <span>ALL SYSTEMS ACTIVE</span>
      </div>
    </div>
  );
}
