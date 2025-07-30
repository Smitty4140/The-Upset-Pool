import { Eye, Shield, MessageSquare, Trophy, Flag, UserCog } from "lucide-react";

type Tab = "spreads" | "messageboard" | "leaderboard" | "weeklypicks" | "results" | "admin";

type ContentTabsProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isPicksLocked?: boolean;
  isAdmin?: boolean;
};

export default function ContentTabs({ activeTab, onTabChange, isPicksLocked = false, isAdmin = false }: ContentTabsProps) {
  return (
    <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg shadow overflow-hidden mb-8 border border-gray-200">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => onTabChange("spreads")}
            className={`${
              activeTab === "spreads"
                ? "bg-white border-primary text-primary"
                : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-white/50"
            } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-all duration-200`}
          >
            <Shield className={`h-4 w-4 mr-2 ${activeTab === "spreads" ? "text-primary" : "text-gray-500"}`} />
            Game Spreads
          </button>

          {isPicksLocked && (
            <button
              onClick={() => onTabChange("weeklypicks")}
              className={`${
                activeTab === "weeklypicks"
                  ? "bg-white border-primary text-primary"
                  : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-white/50"
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-all duration-200`}
            >
              <Eye className={`h-4 w-4 mr-2 ${activeTab === "weeklypicks" ? "text-primary" : "text-gray-500"}`} />
              Weekly Picks
            </button>
          )}

          <button
            onClick={() => onTabChange("leaderboard")}
            className={`${
              activeTab === "leaderboard"
                ? "bg-white border-primary text-primary"
                : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-white/50"
            } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-all duration-200`}
          >
            <Trophy className={`h-4 w-4 mr-2 ${activeTab === "leaderboard" ? "text-yellow-500" : "text-gray-500"}`} />
            Leaderboard
          </button>
          
          {isAdmin && (
            <button
              onClick={() => onTabChange("results")}
              className={`${
                activeTab === "results"
                  ? "bg-white border-primary text-primary"
                  : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-white/50"
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-all duration-200`}
            >
              <Flag className={`h-4 w-4 mr-2 ${activeTab === "results" ? "text-primary" : "text-gray-500"}`} />
              Results
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => onTabChange("admin")}
              className={`${
                activeTab === "admin"
                  ? "bg-white border-primary text-primary"
                  : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-white/50"
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-all duration-200`}
            >
              <UserCog className={`h-4 w-4 mr-2 ${activeTab === "admin" ? "text-primary" : "text-gray-500"}`} />
              Admin
            </button>
          )}

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
