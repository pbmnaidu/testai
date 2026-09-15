import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { AiAssistantModal } from './components/AiAssistantModal';
import { GeotagEvidenceModal } from './components/GeotagEvidenceModal';
import { fetchDuplicateCandidates, fetchOverview } from './services/api';

import { OverviewPage } from './pages/OverviewPage';
import { MpIntelligencePage } from './pages/MpIntelligencePage';
import { RiskMonitorPage } from './pages/RiskMonitorPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { FinancialAnalyticsPage } from './pages/FinancialAnalyticsPage';
import { DuplicateInspectorPage } from './pages/DuplicateInspectorPage';
import { ScheduleProgressPage } from './pages/ScheduleProgressPage';
import { DataSyncPage } from './pages/DataSyncPage';
import { ModelMonitoringPage } from './pages/ModelMonitoringPage';
import { StateRiskAnalyticsPage } from './pages/StateRiskAnalyticsPage';
import { FinancialBenchmarkPage } from './pages/FinancialBenchmarkPage';
import { GeotagEvidenceAuditPage } from './pages/GeotagEvidenceAuditPage';
import { ComplianceMonitorPage } from './pages/ComplianceMonitorPage';
import { CitizenProtocolPage } from './pages/CitizenProtocolPage';
import { AttendancePage } from './pages/AttendancePage';
import { MaterialFairnessPage } from './pages/MaterialFairnessPage';
import { OfficerDashboardPage } from './pages/OfficerDashboardPage';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [initialSeverity, setInitialSeverity] = useState<string>('');
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [evidencePreview, setEvidencePreview] = useState<{ workId: string; imageName?: string } | null>(null);
  const [livePortfolio, setLivePortfolio] = useState({ totalWorks: 0, highRiskWorks: 0, financialOutlierWorks: 0, duplicateCandidates: 0 });
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('mplads-theme');
      return saved ? saved === 'dark' : true;
    } catch { return true; }
  });

  useEffect(() => {
    Promise.all([
      fetchOverview(),
      fetchDuplicateCandidates({ min_similarity: 85, page: 1, limit: 1 }),
    ]).then(([overview, duplicates]) => {
      setLivePortfolio({
        totalWorks: overview.summary.total_works,
        highRiskWorks: overview.summary.high_risk_works,
        financialOutlierWorks: overview.financial_summary?.flagged_financial_outliers ?? 0,
        duplicateCandidates: duplicates.total ?? 0,
      });
    }).catch(() => undefined);
  }, []);

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
    setEvidencePreview(null);
    setSelectedWorkId(workId);
  };

  const handleOpenEvidence = (workId: string, imageName?: string) => {
    setEvidencePreview({ workId, imageName });
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
        totalWorks={livePortfolio.totalWorks || undefined}
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
            <ProjectDetailPage workId={selectedWorkId} onBack={handleBackToMonitor} onSelectWork={handleSelectWork} onOpenEvidence={handleOpenEvidence} />
          ) : (
            <>
              {activeTab === 'geotag-evidence' && <GeotagEvidenceAuditPage onSelectWork={handleSelectWork} onOpenEvidence={handleOpenEvidence} />}
              {activeTab === 'citizen-protocol' && <CitizenProtocolPage />}
              {activeTab === 'attendance' && <AttendancePage />}
              {activeTab === 'material-fairness' && <MaterialFairnessPage />}
              {activeTab === 'officer-dashboard' && <OfficerDashboardPage onSelectWork={handleSelectWork} />}
              {activeTab === 'overview' && <OverviewPage onNavigateToRiskMonitor={handleNavigateToRiskMonitor} />}
              {activeTab === 'mp-intelligence' && <MpIntelligencePage onSelectWork={handleSelectWork} />}
              {activeTab === 'risk-monitor' && <RiskMonitorPage initialSeverity={initialSeverity} initialDimension="all" totalWorks={livePortfolio.totalWorks} onSelectWork={handleSelectWork} />}
              {activeTab === 'state-risk-analytics' && <StateRiskAnalyticsPage onSelectWork={handleSelectWork} />}
              {activeTab === 'duplicate-inspector' && <DuplicateInspectorPage onSelectWork={handleSelectWork} />}
              {activeTab === 'financial-analytics' && <FinancialAnalyticsPage onSelectWork={handleSelectWork} onOpenBenchmarks={() => setActiveTab('financial-benchmarks')} />}
              {activeTab === 'financial-benchmarks' && <FinancialBenchmarkPage />}
              {activeTab === 'compliance-monitor' && <ComplianceMonitorPage onSelectWork={handleSelectWork} onOpenEvidence={handleOpenEvidence} />}
              {activeTab === 'schedule-progress' && <RiskMonitorPage initialDimension="schedule" totalWorks={livePortfolio.totalWorks} onSelectWork={handleSelectWork} />}
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
        totalWorks={livePortfolio.totalWorks}
        highRiskWorks={livePortfolio.highRiskWorks}
        financialOutlierWorks={livePortfolio.financialOutlierWorks}
        duplicateCandidates={livePortfolio.duplicateCandidates}
      />
      <GeotagEvidenceModal
        isOpen={Boolean(evidencePreview)}
        workId={evidencePreview?.workId || null}
        initialImageName={evidencePreview?.imageName}
        onSelectWork={handleSelectWork}
        onClose={() => setEvidencePreview(null)}
      />
    </div>
  );
}

export default App;
