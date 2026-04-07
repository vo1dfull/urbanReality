import { memo } from 'react';
import TimeSlider from '../../components/TimeSlider';

const BottomBar = memo(function BottomBar() {
  return (
    <div style={{
      position: 'fixed',
      left: 'calc(20px + min(540px, calc(100vw - 40px)) + 18px)',
      right: 420,
      bottom: 20,
      zIndex: 55,
      width: '100%',
      minWidth: 360,
      maxWidth: 480,
      display: 'flex',
      justifyContent: 'flex-start',
      pointerEvents: 'none',
    }}>
      <div
        style={{
          pointerEvents: 'auto',
          width: '100%',
          transform: 'translateY(2px)',
          transition: 'transform 180ms cubic-bezier(0.4,0,0.2,1)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(2px)'; }}
      >
        <TimeSlider />
      </div>
    </div>
  );
});

export default BottomBar;
