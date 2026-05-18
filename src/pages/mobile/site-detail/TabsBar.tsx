interface TabsBarProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function TabsBar({ tabs, activeTab, onTabChange }: TabsBarProps) {
  return (
    <div className="sticky top-[56px] bg-app-bg z-[65] border-b border-outline-variant overflow-x-auto whitespace-nowrap flex scrollbar-hide">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`transition-colors ${
            activeTab === tab
              ? 'border-b-4 border-primary text-primary font-bold px-4 py-3'
              : 'text-on-surface-variant px-4 py-3'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
