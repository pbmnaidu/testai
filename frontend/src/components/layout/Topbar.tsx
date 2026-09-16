import React, { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, Menu, Sun, Moon, LogIn, LogOut, User, ShieldCheck, UserCheck, ChevronDown, Check, HardHat, Package, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getRiskIndexRecords } from '../../services/snapshotAdapter';
import { WorkRecord, UserRole } from '../../types';

interface TopbarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSearchSubmit: () => void;
  onSelectWork?: (workId: string) => void;
  onOpenChat: () => void;
  onOpenSidebar: () => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
  isSidebarCollapsed: boolean;
}

const ROLE_METADATA: Record<UserRole, { short: string; full: string; badgeClass: string; icon: any }> = {
  officer: {
    short: 'Officer',
    full: 'Implementing Officer',
    badgeClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800',
    icon: UserCheck
  },
  citizen: {
    short: 'Citizen',
    full: 'Citizen Contributor',
    badgeClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800',
    icon: ShieldCheck
  },
  contractor: {
    short: 'Contractor',
    full: 'Works Contractor',
    badgeClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800',
    icon: HardHat
  },
  material_contractor: {
    short: 'Vendor',
    full: 'Material Vendor',
    badgeClass: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800',
    icon: Package
  }
};

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  onSelectWork,
  onOpenChat,
  onOpenSidebar,
  onToggleSidebar,
  onToggleTheme,
  isDark,
  isSidebarCollapsed,
}) => {
  const { user, role, loginWithGoogle, logout, switchRole, isLoading, designatedOfficerEmail } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<WorkRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
        setRoleError(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live search debounce
  useEffect(() => {
    const term = searchQuery.trim().toLowerCase();
    if (term.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const records = await getRiskIndexRecords();
        const matches = records
          .filter((r) => {
            const wid = String(r.work_id || '').toLowerCase();
            const desc = String(r.description || '').toLowerCase();
            const mp = String(r.mp_name || '').toLowerCase();
            const st = String(r.state || '').toLowerCase();
            const con = String(r.constituency || '').toLowerCase();
            return wid.includes(term) || desc.includes(term) || mp.includes(term) || st.includes(term) || con.includes(term);
          })
          .slice(0, 6);
        setSearchResults(matches);
        setShowResults(true);
      } catch (err) {
        console.warn('Search lookup error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectResult = (workId: string) => {
    setShowResults(false);
    setSearchQuery('');
    if (onSelectWork) {
      onSelectWork(workId);
    }
  };

  const handleRoleChange = async (newRole: UserRole) => {
    setRoleError(null);
    try {
      await switchRole(newRole);
    } catch (err: any) {
      setRoleError(err.message || 'Unable to switch to requested protocol role.');
    }
  };

  const currentRoleMeta = ROLE_METADATA[role] || ROLE_METADATA.citizen;
  const RoleIcon = currentRoleMeta.icon;

  return (
    <header className={`shell-topbar ${isSidebarCollapsed ? 'shell-topbar--collapsed' : ''} fixed top-0 right-0 left-0 h-16 ${isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border-b px-4 sm:px-6 flex items-center justify-between z-40 transition-[left,background-color] duration-200`}>
      <div className="flex items-center">
        <button aria-label="Open navigation" onClick={onOpenSidebar} className={`lg:hidden mr-3 w-9 h-9 rounded-xl border flex items-center justify-center ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
          <Menu className="w-5 h-5" />
        </button>
        <button aria-label="Collapse or expand sidebar" onClick={onToggleSidebar} className={`hidden lg:flex mr-3 w-9 h-9 rounded-xl border items-center justify-center ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Global Live Search Bar */}
      <div ref={searchRef} className="flex-1 max-w-md min-w-0 relative mx-2 sm:mx-4">
        <form onSubmit={(e) => { e.preventDefault(); setShowResults(false); onSearchSubmit(); }} className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search all 79,000 works by ID, MP, District..."
            value={searchQuery}
            onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-full text-xs focus:outline-none focus:ring-2 transition-all ${isDark ? 'bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:bg-slate-800 focus:ring-slate-100' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-slate-300'}`}
          />
        </form>

        {/* Autocomplete Dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className={`absolute top-full left-0 right-0 mt-1.5 rounded-2xl shadow-xl border overflow-hidden z-50 divide-y ${isDark ? 'bg-[#0f172a] border-slate-700 divide-slate-800' : 'bg-white border-slate-200 divide-slate-100'}`}>
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <span>Matching Works ({searchResults.length})</span>
              <span>Click to inspect</span>
            </div>
            {searchResults.map((r) => {
              const risk = r.overall_risk_level;
              const badgeClass = risk === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : risk === 'HIGH' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';
              return (
                <button
                  key={r.work_id}
                  onClick={() => handleSelectResult(r.work_id)}
                  className={`w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">{r.work_id}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm ${badgeClass}`}>{risk}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">{r.description || 'Description not published'}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{r.state} · {r.constituency} · MP: {r.mp_name || 'N/A'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Header Right Action Items */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* AI Assistant Button */}
        <button
          onClick={onOpenChat}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold shadow-sm transition-all ${isDark ? 'bg-slate-100 hover:bg-white text-slate-900' : 'bg-[#1f3a63] hover:bg-[#294b7d] text-white'}`}
        >
          <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
          <span className="hidden sm:inline">AI Assistant</span>
        </button>

        {/* Authentication & Role Pill */}
        <div ref={userMenuRef} className="relative">
          {user ? (
            <button
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className={`flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border transition-all ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'}`}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'User'} className="w-7 h-7 rounded-full object-cover border border-indigo-300" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">
                  {(user.displayName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-bold leading-tight truncate max-w-[120px]">{user.displayName}</span>
                <span className={`text-[9px] font-black uppercase tracking-wider ${currentRoleMeta.badgeClass} px-1.5 py-0.2 rounded`}>
                  {currentRoleMeta.short}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
            </button>
          ) : (
            <button
              onClick={() => loginWithGoogle()}
              disabled={isLoading}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700 shadow-xs'}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span className="hidden sm:inline">Sign in with Google</span>
            </button>
          )}

          {/* User Profile & Role Popover */}
          {isUserMenuOpen && user && (
            <div className={`absolute right-0 mt-2 w-72 rounded-2xl shadow-xl border overflow-hidden z-50 p-4 space-y-3 ${isDark ? 'bg-[#0f172a] border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{user.displayName}</div>
                <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <RoleIcon className="w-3 h-3" />
                  {currentRoleMeta.full}
                </div>
              </div>

              {/* Role Switcher */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Switch Active Protocol</div>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  {(['citizen', 'contractor', 'material_contractor', 'officer'] as UserRole[]).map((r) => {
                    const isSelected = role === r;
                    const meta = ROLE_METADATA[r];
                    return (
                      <button
                        key={r}
                        onClick={() => handleRoleChange(r)}
                        className={`px-2 py-1.5 text-[10px] font-bold rounded-lg transition-all text-center ${
                          isSelected
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {meta.short}
                      </button>
                    );
                  })}
                </div>
                {roleError && (
                  <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] leading-tight flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{roleError}</span>
                  </div>
                )}
              </div>

              {/* Sign Out */}
              <button
                onClick={() => { logout(); setIsUserMenuOpen(false); }}
                className="w-full mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 text-xs font-bold text-rose-600 hover:text-rose-700 py-1.5 rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button aria-label="Toggle light and dark mode" onClick={onToggleTheme} className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors shadow-2xs ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
