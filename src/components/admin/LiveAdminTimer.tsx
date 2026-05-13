import { useState, useEffect } from 'react';

interface LiveAdminTimerProps {
  startTime: string;
}

export default function LiveAdminTimer({ startTime }: LiveAdminTimerProps) {
  const [elapsed, setElapsed] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!startTime) return;

    const calculateElapsed = () => {
      const now = new Date();
      const start = new Date(startTime);
      const diffMs = now.getTime() - start.getTime();

      if (diffMs < 0) return { hours: 0, minutes: 0, seconds: 0 };

      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      return { hours, minutes, seconds };
    };

    setElapsed(calculateElapsed());

    const intervalId = setInterval(() => {
      setElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [startTime]);

  if (!startTime) {
    return <>0h 0min 0s</>;
  }

  return (
    <>{elapsed.hours}h {elapsed.minutes}min {elapsed.seconds}s</>
  );
}
