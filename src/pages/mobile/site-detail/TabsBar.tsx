interface TabsBarProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function TabsBar({ tabs, activeTab, onTabChange }: TabsBarProps) {
  return (
    <div className="sticky top-[56px] z-[65] flex overflow-x-auto whitespace-nowrap scrollbar-hide bg-white/95 backdrop-blur-sm border-b border-gray-100 px-2">
      {tabs.map((tab) => {
        const active = activeTab === tab;
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`relative px-3.5 py-3 text-[14px] transition-colors ${
              active ? 'text-gray-900 font-semibold' : 'text-gray-400 font-medium'
            }`}
          >
            {tab}
            {active && (
              <span className="absolute left-3.5 right-3.5 bottom-0 h-[2px] rounded-full bg-gray-900" />
            )}
          </button>
        );
      })}
    </div>
  );
}
