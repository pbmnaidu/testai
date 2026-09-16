import React from 'react';
import { 
  BarChart3, 
  UserCheck,
  ShieldAlert, 
  Copy, 
  PieChart, 
  CheckSquare, 
  ClipboardCheck,
  Compass,
  RefreshCw,
  Cpu,
  MapPin,
  Map,
  Clock,
  Scale,
  X
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  totalWorks?: number;
}

interface NavItem {
  id: string;
  label: string;
  icon: string | React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen = false, onClose, collapsed = false, totalWorks }) => {
  const sections: NavSection[] = [
    {
      title: 'Operations',
      items: [
        { id: 'officer-dashboard', label: 'Implementing Officer Center', icon: ClipboardCheck },
        { id: 'citizen-portal', label: 'Citizen Grievance Portal', icon: Compass },
        { id: 'attendance', label: 'Contractor Labor Attendance', icon: Clock },
      ]
    },
    {
      title: 'Analytics & Risk',
      items: [
        { id: 'overview', label: 'National Programme Review', icon: BarChart3 },
        { id: 'risk-monitor', label: 'Risk Intelligence Monitor', icon: ShieldAlert },
        { id: 'state-risk-analytics', label: 'State Risk & Records', icon: Map },
        { id: 'mp-intelligence', label: 'MP Works & Fund Intelligence', icon: UserCheck },
      ]
    },
    {
      title: 'Risk Engines & Evidence',
      items: [
        { id: 'geotag-evidence', label: 'Field Photographic Evidence', icon: MapPin },
        { id: 'duplicate-inspector', label: 'Candidate Duplicate Inspector', icon: Copy },
        { id: 'financial-analytics', label: 'Financial Anomaly Analytics', icon: PieChart },
        { id: 'compliance-monitor', label: 'Compliance Evidence Gaps', icon: CheckSquare },
        { id: 'schedule-progress', label: 'Schedule & Progress Risk', icon: Clock },
        { id: 'material-fairness', label: 'Material Quality & Price Fairness', icon: Scale },
      ]
    },
    {
      title: 'Platform Governance',
      items: [
        { id: 'data-sync', label: 'Data Sync & System Status', icon: RefreshCw },
        { id: 'model-monitoring', label: 'MLflow Model Monitoring', icon: Cpu },
      ]
    }
  ];

  return (
    <>
      {isOpen && <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-[#263a42]/40 lg:hidden backdrop-blur-xs" />}
      <aside className={`sidebar-shell ${collapsed ? 'sidebar-shell--collapsed w-[72px]' : 'w-[238px]'} fixed inset-y-0 left-0 editorial-side border-r border-[#ded7ca] z-50 transition-[width,transform] duration-200 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full justify-between overflow-hidden">
          <div>
            {/* Editorial Brand Header */}
            <div className="editorial-org relative">
              <span className="editorial-seal">
                MP
              </span>
              <div className={collapsed ? 'lg:hidden' : ''}>
                <h1 className="font-editorial-serif text-[15px] font-semibold text-[#263a42] leading-tight m-0">
                  MPLADS<br />Review Office
                </h1>
                <p className="font-editorial-mono text-[8px] tracking-[0.08em] uppercase text-[#7f7466] mt-1 m-0">
                  National portfolio
                </p>
              </div>
              <button aria-label="Close navigation" onClick={onClose} className="absolute right-0 top-0 lg:hidden p-1 text-[#7b817c] hover:text-[#263a42]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Editorial Nav Links */}
            <nav className="mt-2.5 space-y-2.5 overflow-y-auto max-h-[calc(100vh-175px)] pr-1 custom-scrollbar">
              {sections.map((sec, secIdx) => (
                <div key={secIdx}>
                  <div className={`editorial-navtitle ${collapsed ? 'lg:hidden' : ''}`}>
                    {sec.title}
                  </div>
                  <div className="space-y-0.5">
                    {sec.items.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => { setActiveTab(item.id); onClose?.(); }}
                          title={collapsed ? item.label : undefined}
                          className={`editorial-nava ${isActive ? 'active' : ''}`}
                        >
                          <span className="w-4 text-center text-xs shrink-0 flex items-center justify-center">
                            {typeof item.icon === 'string' ? (
                              <span>{item.icon}</span>
                            ) : (
                              React.createElement(item.icon, {
                                className: `w-3.5 h-3.5 ${isActive ? 'text-[#b24e28]' : 'text-[#7b817c]'}`
                              })
                            )}
                          </span>
                          <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          {/* Bottom Briefing Card */}
          <div className={`editorial-brief mt-auto ${collapsed ? 'lg:hidden' : ''}`}>
            <span className="tiny">
              Next briefing
            </span>
            <b>
              Executive Review
            </b>
            <p>
              Thursday, 18 September<br />09:30 IST
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
