import React from 'react';
import { 
  BarChart3, 
  UserCheck,
  ShieldAlert, 
  Copy, 
  PieChart, 
  CheckSquare, 
  Clock,
  RefreshCw,
  Cpu,
  ChevronRight,
  ShieldCheck,
  Sparkles,
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

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen = false, onClose, collapsed = false, totalWorks }) => {
  const sections = [
    {
      title: 'Core Portfolio',
      items: [
        { id: 'overview', label: 'Executive Dashboard', icon: BarChart3 },
        { id: 'mp-intelligence', label: 'MP Works & Fund Intelligence', icon: UserCheck },
        { id: 'risk-monitor', label: 'Risk Intelligence Monitor', icon: ShieldAlert },
      ]
    },
    {
      title: 'Anomaly & Audits',
      items: [
        { id: 'duplicate-inspector', label: 'Candidate Duplicate Inspector', icon: Copy },
        { id: 'financial-analytics', label: 'Financial Anomaly Analytics', icon: PieChart },
        { id: 'compliance-monitor', label: 'Compliance Evidence Gaps', icon: CheckSquare },
        { id: 'schedule-progress', label: 'Schedule & Progress Risk', icon: Clock },
      ]
    },
    {
      title: 'Platform Engine',
      items: [
        { id: 'data-sync', label: 'Data Sync & System Status', icon: RefreshCw },
        { id: 'model-monitoring', label: 'MLflow Model Monitoring', icon: Cpu },
      ]
    }
  ];

  return (
    <>
      {isOpen && <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" />}
    <aside className={`sidebar-shell ${collapsed ? 'sidebar-shell--collapsed' : ''} fixed inset-y-0 left-0 bg-white dark:bg-[#0f172a] border-r border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shrink-0 h-screen shadow-[4px_0_24px_rgba(15,23,42,0.03)] z-50 transition-[width,transform] duration-200 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex flex-col h-full justify-between">
        <div>
          {/* Brand Header */}
          <div className={`relative p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-3 ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 dark:from-slate-100 dark:to-slate-200 text-white dark:text-slate-900 flex items-center justify-center font-black text-sm tracking-wider shadow-md relative">
              MP
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 shadow-xs" />
            </div>
            <div className={collapsed ? 'lg:hidden' : ''}>
              <div className="flex items-center gap-1">
                <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-slate-100 uppercase">MPLADS AI</h1>
                <Sparkles className="w-3 h-3 text-amber-500 fill-amber-400" />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold tracking-wide uppercase">Risk Intelligence DSS</p>
            </div>
            <button aria-label="Close navigation" onClick={onClose} className="absolute right-3 top-3 lg:hidden w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Nav Links Grouped by Section */}
          <nav className={`p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-145px)] ${collapsed ? 'lg:px-2' : ''}`}>
            {sections.map((sec, secIdx) => (
              <div key={secIdx} className={`space-y-1 ${secIdx > 0 ? 'border-t border-slate-100 dark:border-slate-800 pt-4' : ''}`}>
                <span className={`px-3 text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 tracking-wider block mb-1 ${collapsed ? 'lg:hidden' : ''}`}>
                  {sec.title}
                </span>
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); onClose?.(); }}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-200 text-left group ${collapsed ? 'lg:justify-center lg:px-2' : ''} ${
                        isActive
                          ? 'bg-slate-900 text-white font-bold shadow-md dark:bg-slate-100 dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-emerald-400 dark:text-emerald-600' : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`} />
                        <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                      </div>
                      {isActive && <ChevronRight className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 ${collapsed ? 'lg:hidden' : ''}`} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Official DSS Engine Status Footer */}
        <div className={`p-4 border-t border-slate-100 dark:border-slate-800 ${collapsed ? 'lg:hidden' : ''}`}>
          <div className="bg-gradient-to-r from-slate-50 to-slate-100/70 dark:from-slate-800/60 dark:to-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3 flex items-center gap-3 shadow-2xs">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <h4 className="text-[11px] font-extrabold text-slate-900 dark:text-slate-100">MPLADS Risk DSS</h4>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight mt-0.5">
                {totalWorks !== undefined ? `${totalWorks.toLocaleString()} Works Active` : 'Loading works…'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
};
