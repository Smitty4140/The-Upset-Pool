import { Eye, Shield, Trophy, Flag, UserCog, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type Tab = "spreads" | "leaderboard" | "weeklypicks" | "results" | "admin";

type ContentTabsProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isPicksLocked?: boolean;
  isAdmin?: boolean;
  isSuperUser?: boolean;
};

const TAB_CONFIG: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean; superUserOnly?: boolean }[] = [
  { id: "spreads",     label: "Game Spreads",  icon: <Shield className="h-4 w-4" /> },
  { id: "weeklypicks", label: "Weekly Picks",  icon: <Eye className="h-4 w-4" /> },
  { id: "leaderboard", label: "Leaderboard",   icon: <Trophy className="h-4 w-4" /> },
  { id: "results",     label: "Results",       icon: <Flag className="h-4 w-4" />, superUserOnly: true },
  { id: "admin",       label: "Admin",         icon: <UserCog className="h-4 w-4" />, adminOnly: true },
];

export default function ContentTabs({ activeTab, onTabChange, isPicksLocked = false, isAdmin = false, isSuperUser = false }: ContentTabsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const visibleTabs = TAB_CONFIG.filter(tab => {
    if (tab.superUserOnly && !isSuperUser) return false;
    if (tab.adminOnly && !isAdmin) return false;
    return true;
  });

  const activeConfig = visibleTabs.find(t => t.id === activeTab) ?? visibleTabs[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (tab: Tab) => {
    onTabChange(tab);
    setDropdownOpen(false);
  };

  return (
    <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg shadow overflow-visible mb-8 border border-gray-200">

      {/* ── Mobile dropdown (hidden on sm+) ── */}
      <div className="sm:hidden px-4 py-3 relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(prev => !prev)}
          className="w-full flex items-center justify-between bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 transition-colors"
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
        >
          <span className="flex items-center gap-2 text-primary">
            {activeConfig.icon}
            {activeConfig.label}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
        </button>

        {dropdownOpen && (
          <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleSelect(tab.id)}
                className={`w-full flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors text-left ${
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className={activeTab === tab.id ? "text-primary" : "text-gray-400"}>
                  {tab.icon}
                </span>
                {tab.label}
                {activeTab === tab.id && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop tab bar (hidden on mobile) ── */}
      <div className="hidden sm:block border-b border-gray-200">
        <nav className="-mb-px flex" aria-label="Tabs">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`${
                activeTab === tab.id
                  ? "bg-white border-primary text-primary"
                  : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-white/50"
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-all duration-200`}
            >
              <span className={`mr-2 ${
                tab.id === "leaderboard"
                  ? activeTab === tab.id ? "text-yellow-500" : "text-gray-500"
                  : activeTab === tab.id ? "text-primary" : "text-gray-500"
              }`}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

    </div>
  );
}
