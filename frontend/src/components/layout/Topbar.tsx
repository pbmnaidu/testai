import React from 'react';
import { Search, Sparkles, Menu, Sun, Moon } from 'lucide-react';

interface TopbarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSearchSubmit: () => void;
  onOpenChat: () => void;
  onOpenSidebar: () => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
  isSidebarCollapsed: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  onOpenChat,
  onOpenSidebar,
  onToggleSidebar,
  onToggleTheme,
  isDark,
  isSidebarCollapsed,
}) => {
  return (
    <header className={`shell-topbar ${isSidebarCollapsed ? 'shell-topbar--collapsed' : ''} fixed top-0 right-0 left-0 h-16 ${isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border-b px-4 sm:px-6 flex items-center justify-between z-40 transition-[left,background-color] duration-200`}>
      <button aria-label="Open navigation" onClick={onOpenSidebar} className={`lg:hidden mr-3 w-9 h-9 rounded-xl border flex items-center justify-center ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
        <Menu className="w-5 h-5" />
      </button>
      <button aria-label="Collapse or expand sidebar" onClick={onToggleSidebar} className={`hidden lg:flex mr-3 w-9 h-9 rounded-xl border items-center justify-center ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
        <Menu className="w-5 h-5" />
      </button>
      {/* Search Input Bar Pill */}
      <div className="flex-1 max-w-md min-w-0">
        <form onSubmit={(e) => { e.preventDefault(); onSearchSubmit(); }} className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search Work ID, District, MP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-full text-xs focus:outline-none focus:ring-2 transition-all ${isDark ? 'bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:bg-slate-800 focus:ring-slate-100' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-slate-300'}`}
          />
        </form>
      </div>

      {/* Header Right Action Items */}
      <div className="flex items-center gap-3">
        {/* AI Risk Assistant Button */}
        <button
          onClick={onOpenChat}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold shadow-sm transition-all ${isDark ? 'bg-slate-100 hover:bg-white text-slate-900' : 'bg-[#1f3a63] hover:bg-[#294b7d] text-white'}`}
        >
          <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
          <span className="hidden sm:inline">AI Assistant</span>
        </button>

        {/* Settings Gear Icon Pill */}
        <button aria-label="Toggle light and dark mode" onClick={onToggleTheme} className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors shadow-2xs ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
