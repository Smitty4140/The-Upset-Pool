import { useState } from "react";

type Tab = "spreads" | "messageboard";

type ContentTabsProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

export default function ContentTabs({ activeTab, onTabChange }: ContentTabsProps) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex" aria-label="Tabs">
          <button
            onClick={() => onTabChange("spreads")}
            className={`${
              activeTab === "spreads"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
          >
            Spreads
          </button>
          <button
            onClick={() => onTabChange("messageboard")}
            className={`${
              activeTab === "messageboard"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
          >
            Messageboard
          </button>
        </nav>
      </div>
    </div>
  );
}
