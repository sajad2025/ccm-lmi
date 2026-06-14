import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimulationPoint } from '../types';

/** Canvas animation of the inverted-pendulum trajectory, with play/reset. */
const PendulumAnimation: React.FC<{
  simulationData: SimulationPoint[];
  duration: number;
  width: number;
  height: number;
}> = ({ simulationData, duration, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const startTimeRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const getInterpolatedTheta = useCallback((time: number) => {
    const normalizedTime = time % duration;
    const dt = simulationData[1].t - simulationData[0].t;
    const index = Math.floor(normalizedTime / dt);
    const nextIndex = Math.min(index + 1, simulationData.length - 1);

    if (index >= simulationData.length - 1) return simulationData[simulationData.length - 1].states[0];

    const t0 = index * dt;
    const t1 = nextIndex * dt;
    const alpha = (normalizedTime - t0) / (t1 - t0);

    return simulationData[index].states[0] * (1 - alpha) + simulationData[nextIndex].states[0] * alpha;
  }, [duration, simulationData]);

  const animate = useCallback((timestamp: number) => {
    if (!isPlaying) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp;
      lastTimeRef.current = timestamp;
    }

    const deltaTime = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    setCurrentTime(prev => {
      const newTime = prev + deltaTime;
      if (newTime >= duration) {
        setIsPlaying(false);
        return duration;
      }
      return newTime;
    });

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isPlaying, duration]);

  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, animate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const length = Math.min(width, height) * 0.4;
    const bobRadius = 10;

    // theta=0 means pointing down, positive theta rotates counterclockwise
    const theta = getInterpolatedTheta(currentTime);
    const angle = Math.PI / 2 + theta;
    const endX = centerX + length * Math.cos(angle);
    const endY = centerY + length * Math.sin(angle);

    // Pivot
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#333';
    ctx.fill();

    // Rod
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bob
    ctx.beginPath();
    ctx.arc(endX, endY, bobRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#4a90e2';
    ctx.fill();
    ctx.strokeStyle = '#357abd';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [currentTime, width, height, getInterpolatedTheta]);

  const handlePlayPause = () => setIsPlaying(!isPlaying);

  const handleReset = () => {
    setCurrentTime(0);
    startTimeRef.current = 0;
    lastTimeRef.current = 0;
    setIsPlaying(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ background: '#f8f9fa', borderRadius: '8px', border: '1px solid #eee' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '10px',
          background: 'rgba(255, 255, 255, 0.8)',
          padding: '4px 8px',
          borderRadius: '4px',
        }}
      >
        <button onClick={handlePlayPause} className="animation-button">
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button onClick={handleReset} className="animation-button">
          Reset
        </button>
      </div>
    </div>
  );
};

export default PendulumAnimation;
