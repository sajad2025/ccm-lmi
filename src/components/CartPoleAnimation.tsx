import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimulationPoint } from '../types';

/** Canvas animation of the cart-pole trajectory, with play/reset. */
const CartPoleAnimation: React.FC<{
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

  const handleReset = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setCurrentTime(0);
    startTimeRef.current = 0;
    lastTimeRef.current = 0;
    setIsPlaying(false);
  }, []);

  // Reset animation when simulation data changes.
  useEffect(() => {
    handleReset();
  }, [simulationData, handleReset]);

  const getInterpolatedState = useCallback((time: number) => {
    if (!simulationData || simulationData.length < 2) return simulationData[0]?.states || [];

    const normalizedTime = time % duration;
    const dt = simulationData[1].t - simulationData[0].t;
    const index = Math.floor(normalizedTime / dt);
    const nextIndex = Math.min(index + 1, simulationData.length - 1);

    if (index >= simulationData.length - 1) return simulationData[simulationData.length - 1].states;

    const t0 = index * dt;
    const t1 = nextIndex * dt;
    const alpha = (normalizedTime - t0) / (t1 - t0);

    return simulationData[index].states.map((val, i) =>
      val * (1 - alpha) + simulationData[nextIndex].states[i] * alpha,
    );
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

    const state = getInterpolatedState(currentTime);
    if (!state.length) return;

    const theta = state[0]; // angle from vertical
    const p = state[2]; // cart position

    const cartWidth = 40;
    const cartHeight = 20;
    const poleLength = Math.min(width, height) * 0.3;
    const bobRadius = 6;

    const scale = (width - cartWidth) / 2;
    const cartX = width / 2 + p * scale;
    const cartY = height * 0.7;

    // Cart
    ctx.fillStyle = '#666';
    ctx.fillRect(cartX - cartWidth / 2, cartY - cartHeight / 2, cartWidth, cartHeight);

    // theta=0 means pointing up, positive theta rotates clockwise
    const poleX = cartX + poleLength * Math.sin(theta);
    const poleY = cartY - poleLength * Math.cos(theta);

    // Pole
    ctx.beginPath();
    ctx.moveTo(cartX, cartY);
    ctx.lineTo(poleX, poleY);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Bob
    ctx.beginPath();
    ctx.arc(poleX, poleY, bobRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#4a90e2';
    ctx.fill();
    ctx.strokeStyle = '#357abd';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ground line
    ctx.beginPath();
    ctx.moveTo(0, cartY + cartHeight / 2 + 1);
    ctx.lineTo(width, cartY + cartHeight / 2 + 1);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [currentTime, width, height, getInterpolatedState]);

  const handlePlayPause = () => {
    if (!simulationData || simulationData.length < 2) return;
    setIsPlaying(!isPlaying);
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

export default CartPoleAnimation;
