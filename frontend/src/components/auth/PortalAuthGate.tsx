import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  UserCheck,
  HardHat,
  Scale,
  Camera,
  RefreshCw,
  AlertTriangle,
  LogIn,
  UserPlus,
  Zap,
  CheckCircle2,
  LogOut,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';

export interface PortalAuthGateProps {
  requiredRole: UserRole | UserRole[];
  requiredEmail?: string;
  portalTitle: string;
  portalSubtitle: string;
  portalBadge: string;
  portalIcon: React.ComponentType<{ className?: string }>;
  accentColor?: 'emerald' | 'indigo' | 'amber' | 'blue' | 'purple';
  children: React.ReactNode;
}

export const PortalAuthGate: React.FC<PortalAuthGateProps> = ({
  requiredRole,
  requiredEmail,
  portalTitle,
  portalSubtitle,
  portalBadge,
  portalIcon: PortalIcon,
  accentColor = 'indigo',
  children,
}) => {
  const {
    user,
    role,
    loginWithCredentials,
    loginWithGoogle,
    loginAsDemo,
    register,
    logout,
    switchRole,
    isLoading,
    designatedOfficerEmail,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'signin' | 'register' | 'demo'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [regRole, setRegRole] = useState<UserRole>(
    Array.isArray(requiredRole) ? requiredRole[0] : requiredRole
  );
  const [organization, setOrganization] = useState('');
  const [phone, setPhone] = useState('');
  const [constituency, setConstituency] = useState('');
  const [error, setError] = useState('');
  const [regNotice, setRegNotice] = useState<{ type: 'warning' | 'success'; message: string; submessage?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check authorization
  const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const hasRequiredRole = user ? allowedRoles.includes(user.role) || (user.isSystemAdmin && allowedRoles.includes('officer')) : false;
  const satisfiesEmail = requiredEmail
    ? (user?.email || '').toLowerCase() === requiredEmail.toLowerCase()
    : true;
  const isAuthorized = Boolean(user && hasRequiredRole && satisfiesEmail);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegNotice(null);
    if (!email.trim()) {
      setError('Please enter your official email address.');
      return;
    }
    const targetRole = Array.isArray(requiredRole) ? requiredRole[0] : requiredRole;
    if (targetRole === 'officer' && email.trim().toLowerCase() !== designatedOfficerEmail.toLowerCase()) {
      setError(`Implementing Officer access is strictly restricted to designated administrative email: ${designatedOfficerEmail}`);
      return;
    }
    setIsSubmitting(true);
    try {
      await loginWithCredentials(email.trim(), password, targetRole);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegNotice(null);
    if (!email.trim() || !displayName.trim()) {
      setError('Full Name and Email Address are mandatory.');
      return;
    }

    if (regRole === 'officer') {
      setError(
        `Implementing Officer registration cannot be self-registered. Restricted strictly to: ${designatedOfficerEmail}`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const profile = await register({
        email: email.trim(),
        displayName: displayName.trim(),
        role: regRole,
        organization: organization.trim(),
        phone: phone.trim(),
        constituency: constituency.trim(),
      });

      if (profile.approvalStatus === 'PENDING_APPROVAL') {
        setActiveTab('signin');
        setRegNotice({
          type: 'warning',
          message: 'Registration Request Submitted to Implementing Officer',
          submessage: `Your statutory registration as ${
            regRole === 'contractor' ? 'Civil Works Contractor' : 'Material Contractor & Vendor'
          } has been dispatched to Implementing Officer (${designatedOfficerEmail}). In accordance with statutory protocol, login is locked until officer review and approval. You may log in once approved.`
        });
        setDisplayName('');
        setOrganization('');
        setPhone('');
        setConstituency('');
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google sign-in could not be completed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async (targetRole: UserRole) => {
    setError('');
    setIsSubmitting(true);
    try {
      await loginAsDemo(targetRole);
    } catch (err: any) {
      setError(err.message || 'Fast-track sign in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // If authorized, render top session banner and children content
  if (isAuthorized) {
    return (
      <div className="portal-authenticated-wrapper space-y-4">
        {/* Government Authenticated Session Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-2.5 text-xs text-emerald-900 shadow-xs dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold uppercase tracking-wider text-[10px] text-emerald-800 dark:text-emerald-300">
                  {portalBadge} · Authenticated
                </span>
                <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                  {user?.role.toUpperCase()}
                </span>
              </div>
              <p className="truncate font-semibold text-emerald-950 dark:text-emerald-100 text-[11px]">
                {user?.displayName} ({user?.email}) · {user?.designation}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200"
            >
              <LogOut className="h-3 w-3" /> Switch / Logout
            </button>
          </div>
        </div>

        {/* Protected Portal Children */}
        {children}
      </div>
    );
  }

  // Not authorized: Render sovereign verification gate
  return (
    <div className="portal-auth-gate flex min-h-[75vh] items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0f172a]">
        {/* Gate Sovereign Header */}
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 text-white dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300 backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5" /> Government of India · MPLADS Portal Gate
            </span>
            <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[9px] font-bold text-amber-300">
              Statutory Security Guard
            </span>
          </div>

          <div className="mt-4 flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white shadow-inner backdrop-blur-sm">
              <PortalIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">{portalTitle}</h2>
              <p className="mt-0.5 text-xs text-slate-300">{portalSubtitle}</p>
            </div>
          </div>

          {/* Required credential note */}
          <div className="mt-4 rounded-xl bg-white/5 p-2.5 text-[11px] leading-relaxed text-slate-300 border border-white/10 flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong>Credential Restriction:</strong>{' '}
              {requiredEmail ? (
                <>Restricted strictly to Inspection Officer: <strong className="text-amber-300 font-mono">{requiredEmail}</strong></>
              ) : allowedRoles.includes('officer') ? (
                <>Restricted to Statutory Implementing &amp; Inspection Officers only.</>
              ) : allowedRoles.includes('material_contractor') ? (
                <>Restricted to Authorized Works Material Contractors &amp; Vendors only.</>
              ) : allowedRoles.includes('contractor') ? (
                <>Restricted to Authorized Civil Works Contractors (Labor Muster Roll).</>
              ) : (
                <>Restricted to Registered &amp; Verified Citizens.</>
              )}
            </span>
          </div>
        </div>

        {/* Existing Session Alert (if user is logged in with another role) */}
        {user && !isAuthorized && (
          <div className="border-b border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">
                  Active Session Conflict: Signed in as {user.displayName} ({user.role.toUpperCase()})
                </p>
                <p className="mt-1 text-[11px]">
                  Your current account does not have access privileges for this section. Please sign in with the respected credentials or switch account.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form Body */}
        <div className="p-6">
          {/* Navigation Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => { setActiveTab('signin'); setError(''); }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                activeTab === 'signin'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('register'); setError(''); }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                activeTab === 'register'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              New Registration
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('demo'); setError(''); }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                activeTab === 'demo'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Quick Test Access
            </button>
          </div>

          {regNotice && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-1 shadow-2xs dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="font-bold flex items-center gap-2 text-amber-900 dark:text-amber-300">
                <span>⚠ {regNotice.message}</span>
              </div>
              {regNotice.submessage && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  {regNotice.submessage}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-200">
              {error}
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} className="mt-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Official Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    requiredEmail ||
                    (allowedRoles.includes('officer')
                      ? designatedOfficerEmail
                      : 'e.g. name@domain.com')
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Password / PIN (optional for verified demo)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white shadow-md hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Sign In with Credentials
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                <span className="mx-2 text-[10px] font-bold uppercase text-slate-400">or continue with</span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Google Sovereign Login
              </button>
            </form>
          )}

          {/* TAB 2: NEW REGISTRATION */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="mt-5 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Full Name / Official Organization Name *
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Polimera Bhanu Prakash Naidu"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Select Role to Register *
                </label>
                <select
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value as UserRole)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="citizen">Public Citizen Auditor (Instant Access)</option>
                  <option value="contractor">Civil Works Contractor (Officer Approval Required)</option>
                  <option value="material_contractor">Material Contractor &amp; Vendor (Officer Approval Required)</option>
                </select>
                {regRole !== 'citizen' ? (
                  <p className="mt-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    ⚠ Approval Required: Contractors and vendors cannot log in until approved by Implementing Officer ({designatedOfficerEmail}).
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    ✓ Instant Access: Citizens can log in and audit works immediately.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={regRole === 'officer' ? designatedOfficerEmail : 'your.official.email@nic.in'}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400">
                    Phone / Mobile
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 94401 XXXXX"
                    className="mt-0.5 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400">
                    Constituency / License / GST
                  </label>
                  <input
                    type="text"
                    value={constituency}
                    onChange={(e) => setConstituency(e.target.value)}
                    placeholder="e.g. Visakhapatnam / GSTIN"
                    className="mt-0.5 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
              >
                {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Complete Registration &amp; Enter Portal
              </button>
            </form>
          )}

          {/* TAB 3: DEMO ACCESS FOR IMMEDIATE EVALUATION */}
          {activeTab === 'demo' && (
            <div className="mt-5 space-y-2.5">
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                Authorized testing credentials for statutory officers and portal reviewers:
              </p>

              {/* Designated Officer */}
              <button
                type="button"
                onClick={() => handleDemoLogin('officer')}
                disabled={isSubmitting}
                className="flex w-full items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 text-left transition hover:border-indigo-400 hover:bg-indigo-100/50 dark:border-indigo-800/60 dark:bg-indigo-950/30"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-600 p-2 text-white">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-950 dark:text-indigo-100">
                        Designated Inspection Officer
                      </span>
                      <span className="rounded bg-indigo-200 px-1.5 py-0.5 font-mono text-[9px] font-black text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                        OFFICER / ADMIN
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300">
                      {designatedOfficerEmail} (Polimera Bhanu Prakash Naidu)
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </button>

              {/* Citizen Auditor */}
              <button
                type="button"
                onClick={() => handleDemoLogin('citizen')}
                disabled={isSubmitting}
                className="flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-100/50 dark:border-emerald-800/60 dark:bg-emerald-950/30"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-emerald-600 p-2 text-white">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-950 dark:text-emerald-100">
                        Verified Citizen Auditor
                      </span>
                      <span className="rounded bg-emerald-200 px-1.5 py-0.5 font-mono text-[9px] font-black text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        CITIZEN
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                      citizen.prakash@nic.in (Ramesh Kumar Citizen)
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </button>

              {/* Civil Works Contractor */}
              <button
                type="button"
                onClick={() => handleDemoLogin('contractor')}
                disabled={isSubmitting}
                className="flex w-full items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/60 p-3 text-left transition hover:border-blue-400 hover:bg-blue-100/50 dark:border-blue-800/60 dark:bg-blue-950/30"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-blue-600 p-2 text-white">
                    <HardHat className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-950 dark:text-blue-100">
                        Civil Works Contractor (Muster Roll)
                      </span>
                      <span className="rounded bg-blue-200 px-1.5 py-0.5 font-mono text-[9px] font-black text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        CONTRACTOR
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-blue-700 dark:text-blue-300">
                      contractor.infra@nic.in (Sri Balaji Infra &amp; Constructions)
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </button>

              {/* Material Contractor */}
              <button
                type="button"
                onClick={() => handleDemoLogin('material_contractor')}
                disabled={isSubmitting}
                className="flex w-full items-center justify-between rounded-2xl border border-purple-200 bg-purple-50/60 p-3 text-left transition hover:border-purple-400 hover:bg-purple-100/50 dark:border-purple-800/60 dark:bg-purple-950/30"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-purple-600 p-2 text-white">
                    <Scale className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-purple-950 dark:text-purple-100">
                        Works Material Contractor &amp; Vendor
                      </span>
                      <span className="rounded bg-purple-200 px-1.5 py-0.5 font-mono text-[9px] font-black text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                        MATERIAL VENDOR
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-purple-700 dark:text-purple-300">
                      materials.supply@nic.in (Deccan Cement &amp; Steel Supplies)
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
