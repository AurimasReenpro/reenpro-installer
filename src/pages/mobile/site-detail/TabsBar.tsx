interface TabsBarProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function TabsBar({ tabs, activeTab, onTabChange }: TabsBarProps) {
  return (
    <div className="sticky top-[56px] z-[65] flex overflow-x-auto whitespace-nowrap scrollbar-hide bg-white/95 dark:bg-[#18181b]/95 backdrop-blur-sm border-b border-gray-100 dark:border-white/10 px-2">
      {tabs.map((tab) => {
        const active = activeTab === tab;
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`relative px-3.5 py-3 text-[14px] transition-colors ${
              active ? 'text-gray-900 dark:text-zinc-100 font-semibold' : 'text-gray-400 dark:text-zinc-500 font-medium'
            }`}
          >
            {tab}
            {active && (
              <span className="absolute left-3.5 right-3.5 bottom-0 h-[2px] rounded-full bg-gray-900 dark:bg-zinc-100" />
            )}
          </button>
        );
      })}
    </div>
  );
}
