import { useState, useEffect } from 'react';

interface LiveAdminTimerProps {
  entries: Array<{ start_time: string; end_time: string | null }> | undefined;
}

export default function LiveAdminTimer({ entries }: LiveAdminTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Only run ticker interval if there is an active running timer segment
    const hasActiveEntry = entries?.some(e => !e.end_time);
    if (!hasActiveEntry) return;

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [entries]);

  if (!entries || entries.length === 0) {
    return <>00:00:00</>;
  }

  let totalMilliseconds = 0;
  let hasCountedOpen = false;

  // Sort by start_time so we process oldest to newest
  const sortedEntries = [...entries].sort((a, b) => 
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  sortedEntries.forEach(entry => {
    const start = new Date(entry.start_time).getTime();
    if (entry.end_time) {
      // Closed segment: use recorded start and end
      const end = new Date(entry.end_time).getTime();
      totalMilliseconds += Math.max(0, end - start);
    } else {
      // Open segment (currently running): use start and now
      if (!hasCountedOpen) {
        totalMilliseconds += Math.max(0, now - start);
        hasCountedOpen = true;
      }
    }
  });

  const hours = Math.floor(totalMilliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((totalMilliseconds / (1000 * 60)) % 60);
  const seconds = Math.floor((totalMilliseconds / 1000) % 60);

  const hoursStr = String(hours).padStart(2, '0');
  const minutesStr = String(minutes).padStart(2, '0');
  const secondsStr = String(seconds).padStart(2, '0');

  return (
    <>{hoursStr}:{minutesStr}:{secondsStr}</>
  );
}

