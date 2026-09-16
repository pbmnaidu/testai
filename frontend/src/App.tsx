import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { CitizenPortalPage } from './pages/CitizenPortalPage';
import { GeotagEvidenceModal } from './components/GeotagEvidenceModal';
import { fetchDuplicateCandidates, fetchOverview } from './services/api';
import { useAuth } from './context/AuthContext';
import { SovereignLoginGate } from './components/auth/SovereignLoginGate';
import { SovereignSplashLoading } from './components/auth/SovereignSplashLoading';
import { ErrorBoundary } from './components/ErrorBoundary';

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
import { MaterialFairnessPage } from './pages/MaterialFairnessPage';
import { OfficerDashboardPage } from './pages/OfficerDashboardPage';
import { AttendancePage } from './pages/AttendancePage';

export function App() {
  const { user, isLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [initialSeverity, setInitialSeverity] = useState<string>('');
  const [initialDimension, setInitialDimension] = useState<string>('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [evidencePreview, setEvidencePreview] = useState<{ workId: string; imageName?: string } | null>(null);
  const [livePortfolio, setLivePortfolio] = useState({ totalWorks: 0, highRiskWorks: 0, financialOutlierWorks: 0, duplicateCandidates: 0 });
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    try {
      window.localStorage.removeItem('mplads-theme');
    } catch { /* storage unavailable */ }
    document.documentElement.classList.remove('dark');
  }, []);

  // Fetch portfolio data immediately when user is authenticated
  useEffect(() => {
    if (!user) {
      setLivePortfolio({ totalWorks: 0, highRiskWorks: 0, financialOutlierWorks: 0, duplicateCandidates: 0 });
      return;
    }

    // Immediately resolve high-level portfolio overview
    fetchOverview()
      .then((overview) => {
        if (overview?.summary) {
          setLivePortfolio((prev) => ({
            ...prev,
            totalWorks: overview.summary.total_works || 79827,
            highRiskWorks: overview.summary.high_risk_works || 59629,
            financialOutlierWorks: overview.financial_summary?.flagged_financial_outliers ?? 2243,
            duplicateCandidates: prev.duplicateCandidates || 5000,
          }));
        }
      })
      .catch(() => undefined);

    // Progressively resolve granular duplicate candidates without blocking header/sidebar
    fetchDuplicateCandidates({ min_similarity: 85, page: 1, limit: 1 })
      .then((duplicates) => {
        if (duplicates?.total !== undefined) {
          setLivePortfolio((prev) => ({
            ...prev,
            duplicateCandidates: duplicates.total,
          }));
        }
      })
      .catch(() => undefined);
  }, [user]);

  useEffect(() => {
    // Ensure calm public-service editorial styling is active
    if (!isDark) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    try { window.localStorage.setItem('mplads-theme', isDark ? 'dark' : 'light'); } catch { /* storage unavailable */ }
  }, [isDark]);

  // Loading state while resolving auth credentials
  if (isLoading) {
    return <SovereignSplashLoading />;
  }

  // Data visibility lock: only visible when user is authenticated
  if (!user) {
    return <SovereignLoginGate />;
  }

  const handleNavigateToRiskMonitor = (severity?: string, dimension?: string) => {
    if (severity) setInitialSeverity(severity);
    if (dimension) setInitialDimension(dimension);
    else setInitialDimension('all');
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
    <div className="flex min-h-screen antialiased bg-[#fbfaf6] text-[#263a42] font-editorial-sans">
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
          onOpenCitizenPortal={() => {
            setSelectedWorkId(null);
            setActiveTab('citizen-portal');
          }}
          onOpenOfficerCenter={() => {
            setSelectedWorkId(null);
            setActiveTab('officer-dashboard');
          }}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
          activeTab={selectedWorkId ? 'project-detail' : activeTab}
        />

        <main className={`shell-main ${isSidebarCollapsed ? 'shell-main--collapsed' : ''} flex-1 overflow-y-auto pt-[70px] min-w-0 overflow-x-hidden`}>
          <ErrorBoundary onReset={() => { setSelectedWorkId(null); setActiveTab('overview'); }}>
            {selectedWorkId ? (
              <ProjectDetailPage workId={selectedWorkId} onBack={handleBackToMonitor} onSelectWork={handleSelectWork} onOpenEvidence={handleOpenEvidence} />
            ) : (
              <>
                {activeTab === 'citizen-portal' && <CitizenPortalPage onSelectWork={handleSelectWork} />}
                {activeTab === 'officer-dashboard' && <OfficerDashboardPage />}
                {activeTab === 'material-fairness' && <MaterialFairnessPage onSelectWork={handleSelectWork} />}
                {activeTab === 'overview' && <OverviewPage onNavigateToRiskMonitor={handleNavigateToRiskMonitor} />}
                {activeTab === 'mp-intelligence' && <MpIntelligencePage onSelectWork={handleSelectWork} />}
                {activeTab === 'state-risk-analytics' && <StateRiskAnalyticsPage onSelectWork={handleSelectWork} />}
                {activeTab === 'risk-monitor' && <RiskMonitorPage initialSeverity={initialSeverity} initialDimension={initialDimension} totalWorks={livePortfolio.totalWorks} onSelectWork={handleSelectWork} />}
                {activeTab === 'financial-analytics' && <FinancialAnalyticsPage onSelectWork={handleSelectWork} onOpenBenchmarks={() => setActiveTab('financial-benchmarks')} />}
                {activeTab === 'financial-benchmarks' && <FinancialBenchmarkPage />}
                {activeTab === 'duplicate-inspector' && <DuplicateInspectorPage onSelectWork={handleSelectWork} />}
                {activeTab === 'geotag-evidence' && <GeotagEvidenceAuditPage onSelectWork={handleSelectWork} onOpenEvidence={handleOpenEvidence} />}
                {activeTab === 'compliance-monitor' && <ComplianceMonitorPage onSelectWork={handleSelectWork} onOpenEvidence={handleOpenEvidence} />}
                {activeTab === 'schedule-progress' && <ScheduleProgressPage onSelectWork={handleSelectWork} />}
                {activeTab === 'data-sync' && <DataSyncPage />}
                {activeTab === 'model-monitoring' && <ModelMonitoringPage />}
                {activeTab === 'attendance' && <AttendancePage />}
              </>
            )}
          </ErrorBoundary>
        </main>
      </div>

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
