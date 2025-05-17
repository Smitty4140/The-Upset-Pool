import { useState } from "react";
import { Football, MessageSquare } from "lucide-react";

type Tab = "spreads" | "messageboard";

type ContentTabsProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

export default function ContentTabs({ activeTab, onTabChange }: ContentTabsProps) {
  return (
    <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg shadow overflow-hidden mb-8 border border-gray-200">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex" aria-label="Tabs">
          <button
            onClick={() => onTabChange("spreads")}
            className={`${
              activeTab === "spreads"
                ? "bg-white border-primary text-primary"
                : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-white/50"
            } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-all duration-200`}
          >
            <Football className={`h-4 w-4 mr-2 ${activeTab === "spreads" ? "text-primary" : "text-gray-500"}`} />
            Game Spreads
          </button>
          <button
            onClick={() => onTabChange("messageboard")}
            className={`${
              activeTab === "messageboard"
                ? "bg-white border-primary text-primary"
                : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-white/50"
            } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-all duration-200`}
          >
            <MessageSquare className={`h-4 w-4 mr-2 ${activeTab === "messageboard" ? "text-primary" : "text-gray-500"}`} />
            Messageboard
          </button>
        </nav>
      </div>
    </div>
  );
}
