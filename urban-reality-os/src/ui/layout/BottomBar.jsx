import { memo } from 'react';
import TimeSlider from '../../components/TimeSlider';

const BottomBar = memo(function BottomBar() {
  return (
    <div style={{
      position: 'fixed',
      left: 84,
      right: 356,
      bottom: 16,
      zIndex: 20,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div
        style={{ pointerEvents: 'auto', transform: 'translateY(0)', transition: 'transform 180ms cubic-bezier(0.4,0,0.2,1)' }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <TimeSlider />
      </div>
    </div>
  );
});

export default BottomBar;
