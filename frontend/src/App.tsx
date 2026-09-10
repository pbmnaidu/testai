import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { AiAssistantModal } from './components/AiAssistantModal';

import { OverviewPage } from './pages/OverviewPage';
import { MpIntelligencePage } from './pages/MpIntelligencePage';
import { RiskMonitorPage } from './pages/RiskMonitorPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { FinancialAnalyticsPage } from './pages/FinancialAnalyticsPage';
import { DuplicateInspectorPage } from './pages/DuplicateInspectorPage';
import { ComplianceMonitorPage } from './pages/ComplianceMonitorPage';
import { ScheduleProgressPage } from './pages/ScheduleProgressPage';
import { DataSyncPage } from './pages/DataSyncPage';
import { ModelMonitoringPage } from './pages/ModelMonitoringPage';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [initialSeverity, setInitialSeverity] = useState<string>('');
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('mplads-theme');
      return saved ? saved === 'dark' : true;
    } catch { return true; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try { window.localStorage.setItem('mplads-theme', isDark ? 'dark' : 'light'); } catch { /* storage unavailable */ }
  }, [isDark]);

  const handleNavigateToRiskMonitor = (severity?: string) => {
    if (severity) setInitialSeverity(severity);
    setSelectedWorkId(null);
    setActiveTab('risk-monitor');
  };

  const handleSelectWork = (workId: string) => {
    setSelectedWorkId(workId);
  };

  const handleBackToMonitor = () => {
    setSelectedWorkId(null);
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      if (searchQuery.toUpperCase().startsWith('WS/')) {
        setSelectedWorkId(searchQuery.trim());
      } else {
        setSelectedWorkId(null);
        setActiveTab('risk-monitor');
      }
    }
  };

  return (
    <div className={`flex min-h-screen antialiased font-sans transition-colors ${isDark ? 'bg-[#0b0f17] text-slate-100' : 'bg-[#f4f6f9] text-slate-900'}`}>
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={selectedWorkId ? 'project-detail' : activeTab}
        isOpen={isSidebarOpen}
        collapsed={isSidebarCollapsed}
        onClose={() => setIsSidebarOpen(false)}
        setActiveTab={(tab) => {
        setSelectedWorkId(null);
        setActiveTab(tab);
          setIsSidebarOpen(false);
        }}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        onOpenChat={() => setIsAiAssistantOpen(true)}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onToggleSidebar={() => setIsSidebarCollapsed((value) => !value)}
          onToggleTheme={() => setIsDark((value) => !value)}
          isDark={isDark}
          isSidebarCollapsed={isSidebarCollapsed}
      />


        <main className={`shell-main ${isSidebarCollapsed ? 'shell-main--collapsed' : ''} flex-1 overflow-y-auto pt-16 min-w-0 overflow-x-hidden`}>
          {selectedWorkId ? (
            <ProjectDetailPage workId={selectedWorkId} onBack={handleBackToMonitor} onSelectWork={handleSelectWork} />
          ) : (
            <>
              {activeTab === 'overview' && <OverviewPage onNavigateToRiskMonitor={handleNavigateToRiskMonitor} />}
              {activeTab === 'mp-intelligence' && <MpIntelligencePage onSelectWork={handleSelectWork} />}
              {activeTab === 'risk-monitor' && <RiskMonitorPage initialSeverity={initialSeverity} initialDimension="all" onSelectWork={handleSelectWork} />}
              {activeTab === 'duplicate-inspector' && <DuplicateInspectorPage onSelectWork={handleSelectWork} />}
              {activeTab === 'financial-analytics' && <RiskMonitorPage initialDimension="financial" onSelectWork={handleSelectWork} />}
              {activeTab === 'compliance-monitor' && <RiskMonitorPage initialDimension="compliance" onSelectWork={handleSelectWork} />}
              {activeTab === 'schedule-progress' && <RiskMonitorPage initialDimension="schedule" onSelectWork={handleSelectWork} />}
              {activeTab === 'data-sync' && <DataSyncPage />}
              {activeTab === 'model-monitoring' && <ModelMonitoringPage />}

            </>
          )}
        </main>
      </div>

      {/* AI Assistant Copilot Modal */}
      <AiAssistantModal
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        onSelectWork={handleSelectWork}
        onNavigateTab={(tab) => {
          setSelectedWorkId(null);
          setActiveTab(tab);
        }}
      />
    </div>
  );
}

export default App;
