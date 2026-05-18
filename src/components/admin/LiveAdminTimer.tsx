import { useState, useEffect } from 'react';

interface LiveAdminTimerProps {
  startTime: string;
}

const calculateElapsed = (startStr: string, nowMs: number) => {
  if (!startStr) return { hours: 0, minutes: 0, seconds: 0 };
  const start = new Date(startStr);
  const diffMs = nowMs - start.getTime();

  if (diffMs < 0) return { hours: 0, minutes: 0, seconds: 0 };

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds };
};

export default function LiveAdminTimer({ startTime }: LiveAdminTimerProps) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  if (!startTime) {
    return <>0h 0min 0s</>;
  }

  const elapsed = calculateElapsed(startTime, now);

  return (
    <>{elapsed.hours}h {elapsed.minutes}min {elapsed.seconds}s</>
  );
}
