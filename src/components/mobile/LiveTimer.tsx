import { useEffect, useState } from 'react';
import type { Database } from '../../types/database.types';

type TimeEntry = Database['public']['Tables']['time_entries']['Row'];

export default function LiveTimer({ entries, installerId }: { entries: TimeEntry[], installerId: string | undefined }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!entries || entries.length === 0 || !installerId) return;

    // Filter time entries for the current installer only
    const myEntries = entries.filter(e => e.installer_id === installerId);
    const hasActiveEntry = myEntries.some(e => !e.end_time);

    // Only set up ticker interval if there is an active running timer
    if (!hasActiveEntry) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [entries, installerId]);

  if (!entries || entries.length === 0 || !installerId) {
    return <span>00:00:00</span>;
  }

  // Filter time entries for the current installer only
  const myEntries = entries.filter(e => e.installer_id === installerId);
  let totalMilliseconds = 0;
  let hasCountedOpen = false;

  // Sort by start_time so we process oldest to newest
  const sortedEntries = [...myEntries].sort((a, b) => 
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

  return <span>{hoursStr}:{minutesStr}:{secondsStr}</span>;
}

