import React, { useState, useRef, useEffect } from 'react';
import { Compass, ClipboardCheck, Menu, UserCheck, HardHat, Scale, ChevronDown, LogOut, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';

interface TopbarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSearchSubmit: () => void;
  onOpenCitizenPortal: () => void;
  onOpenOfficerCenter: () => void;
  onOpenSidebar: () => void;
  isSidebarCollapsed: boolean;
  activeTab?: string;
}

const ROLE_META: Record<UserRole, { short: string; full: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }> = {
  officer: {
    short: 'OFFICER',
    full: 'Inspection Officer / Admin',
    badgeClass: 'bg-[#e8f0ea] text-[#4b8c72] border border-[#d2dfd4]',
    icon: UserCheck,
  },
  citizen: {
    short: 'CITIZEN',
    full: 'Verified Citizen Auditor',
    badgeClass: 'bg-[#f2ede4] text-[#b24e28] border border-[#ded7ca]',
    icon: Compass,
  },
  contractor: {
    short: 'CONTRACTOR',
    full: 'Civil Works Contractor',
    badgeClass: 'bg-blue-50 text-blue-700 border border-blue-200',
    icon: HardHat,
  },
  material_contractor: {
    short: 'MATERIAL',
    full: 'Material Contractor & Vendor',
    badgeClass: 'bg-purple-50 text-purple-700 border border-purple-200',
    icon: Scale,
  },
};

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  onOpenCitizenPortal,
  onOpenOfficerCenter,
  onOpenSidebar,
  isSidebarCollapsed,
  activeTab = 'overview',
}) => {
  const { user, role, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getBreadcrumb = () => {
    switch (activeTab) {
      case 'overview': return 'NATIONAL PORTFOLIO  /  OVERVIEW';
      case 'risk-monitor': return 'PORTFOLIO  /  REVIEW CASES';
      case 'state-risk-analytics': return 'PORTFOLIO  /  STATE RISK & RECORDS';
      case 'mp-intelligence': return 'PORTFOLIO  /  MP WORKS & FUND INTELLIGENCE';
      case 'financial-analytics': return 'ENGINES  /  FINANCIAL ANOMALY ANALYTICS';
      case 'geotag-evidence': return 'ENGINES  /  FIELD PHOTOGRAPHIC EVIDENCE';
      case 'duplicate-inspector': return 'ENGINES  /  CANDIDATE DUPLICATE INSPECTOR';
      case 'compliance-monitor': return 'ENGINES  /  COMPLIANCE EVIDENCE GAPS';
      case 'schedule-progress': return 'ENGINES  /  SCHEDULE & PROGRESS RISK';
      case 'material-fairness': return 'ENGINES  /  MATERIAL FAIRNESS';
      case 'officer-dashboard': return 'OPERATIONS  /  OFFICER CENTER';
      case 'citizen-portal': return 'OPERATIONS  /  CITIZEN PORTAL';
      case 'attendance': return 'OPERATIONS  /  CONTRACTOR ATTENDANCE';
      case 'data-sync': return 'GOVERNANCE  /  DATA SYNC & STATUS';
      case 'model-monitoring': return 'GOVERNANCE  /  MODEL MONITORING';
      default: return 'NATIONAL PORTFOLIO  /  OVERVIEW';
    }
  };

  const getPageLabel = () => {
    switch (activeTab) {
      case 'overview': return 'Overview';
      case 'risk-monitor': return 'Review cases';
      case 'state-risk-analytics': return 'State risk & records';
      case 'mp-intelligence': return 'MP intelligence';
      case 'financial-analytics': return 'Financial analytics';
      case 'geotag-evidence': return 'Field photographic evidence';
      case 'duplicate-inspector': return 'Duplicate inspector';
      case 'compliance-monitor': return 'Compliance evidence gaps';
      case 'schedule-progress': return 'Schedule & progress risk';
      case 'material-fairness': return 'Material fairness';
      case 'officer-dashboard': return 'Officer center';
      case 'citizen-portal': return 'Citizen portal';
      case 'attendance': return 'Contractor attendance';
      case 'data-sync': return 'Data sync & status';
      case 'model-monitoring': return 'Model register';
      default: return 'Overview';
    }
  };

  const activeRole = user?.role || role || 'citizen';
  const currentMeta = ROLE_META[activeRole] || ROLE_META.citizen;

  return (
    <header className={`shell-topbar ${isSidebarCollapsed ? 'shell-topbar--collapsed' : ''}`}>
      <div className="shell-topbar__context">
        <button type="button" aria-label="Open navigation" onClick={onOpenSidebar} className="shell-topbar__menu">
          <Menu className="w-4 h-4" />
        </button>
        <span className="shell-topbar__page-label">{getPageLabel()}</span>
        <span className="editorial-crumb shell-topbar__breadcrumb select-none">
          {getBreadcrumb()}
        </span>
      </div>

      <div className="shell-topbar__actions">
        <form onSubmit={(e) => { e.preventDefault(); onSearchSubmit(); }} className="shell-topbar__search">
          <input
            aria-label="Search works"
            type="text"
            placeholder="Search work ID, district, MP…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="editorial-search"
          />
        </form>

        {activeRole === 'citizen' && (
          <button
            type="button"
            id="citizen-login-btn"
            onClick={onOpenCitizenPortal}
            className="shell-topbar__action shell-topbar__action--citizen"
            title="Citizen Portal: Report works with geotagged proof"
          >
            <Compass className="w-3.5 h-3.5 text-[#b24e28]" />
            <span>Citizen Portal</span>
          </button>
        )}

        {activeRole === 'officer' && (
          <button
            type="button"
            id="officer-center-btn"
            onClick={onOpenOfficerCenter}
            className="shell-topbar__action shell-topbar__action--officer"
            title="Implementing Officer Center"
          >
            <ClipboardCheck className="w-3.5 h-3.5 text-[#4b8c72]" />
            <span>Officer Center</span>
          </button>
        )}

        {/* Authenticated User Session Pill */}
        {user && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              id="user-session-menu-btn"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 py-1 px-2 rounded-lg border border-[#ded7ca] bg-white hover:bg-[#f2ede4]/70 transition shadow-2xs text-[#263a42]"
              title="Authenticated User Profile & Session"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-6 h-6 rounded-full object-cover border border-[#ded7ca]"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#263a42] text-white flex items-center justify-center text-[10px] font-bold font-editorial-mono">
                  {(user.displayName || 'U').charAt(0).toUpperCase()}
                </div>
              )}

              <div className="hidden sm:flex flex-col text-left leading-none">
                <span className="text-[11px] font-bold truncate max-w-[120px]">
                  {user.displayName || 'Authorized User'}
                </span>
                <span className={`text-[8px] font-editorial-mono font-bold uppercase tracking-wider mt-0.5 px-1 py-0.2 rounded-xs inline-block ${currentMeta.badgeClass}`}>
                  {currentMeta.short}
                </span>
              </div>

              <ChevronDown className="w-3 h-3 text-[#7b817c]" />
            </button>

            {/* Dropdown Menu Popover */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-white border border-[#ded7ca] shadow-2xl p-4 space-y-3 z-50 animate-fadeIn text-[#263a42]">
                <div className="border-b border-[#ded7ca] pb-3">
                  <div className="flex items-center justify-between">
                    <span className="font-editorial-mono text-[9px] font-bold uppercase tracking-wider text-[#4b8c72] bg-[#e8f0ea] px-2 py-0.5 rounded-full border border-[#d2dfd4]">
                      Authenticated Session
                    </span>
                    <span className="text-[10px] font-mono text-[#7b817c]">
                      {user.uid.slice(0, 10)}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-[#263a42] mt-2 truncate">
                    {user.displayName}
                  </h3>
                  <p className="text-[11px] text-[#7b817c] truncate font-editorial-mono">
                    {user.email}
                  </p>
                  {user.designation && (
                    <p className="text-[10px] text-[#263a42] font-medium mt-1 line-clamp-2">
                      {user.designation}
                    </p>
                  )}
                  {user.organization && (
                    <p className="text-[9px] text-[#7b817c] truncate mt-0.5">
                      {user.organization}
                    </p>
                  )}
                </div>

                {/* Designated Role (Locked to particular authenticated role) */}
                <div className="space-y-1.5 p-2.5 rounded-xl bg-[#fbfaf6] border border-[#ded7ca]">
                  <div className="text-[9px] font-editorial-mono font-bold uppercase tracking-wider text-[#7b817c] flex items-center justify-between">
                    <span>Designated Role</span>
                    <span className="text-[8px] text-[#4b8c72] font-semibold bg-[#e8f0ea] px-1.5 py-0.2 rounded-xs border border-[#d2dfd4]">LOCKED</span>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className={`p-1 rounded-md ${currentMeta.badgeClass}`}>
                      {React.createElement(currentMeta.icon, { className: 'w-3.5 h-3.5' })}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-[#263a42]">
                        {currentMeta.full}
                      </span>
                      <span className="text-[9px] text-[#7b817c]">
                        Permissions are strictly restricted to this account.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sign Out Button */}
                <div className="pt-2 border-t border-[#ded7ca]">
                  <button
                    type="button"
                    onClick={() => { logout(); setIsUserMenuOpen(false); }}
                    className="w-full py-2 px-3 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition flex items-center justify-center gap-2 border border-rose-200"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out &amp; Lock Data</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
