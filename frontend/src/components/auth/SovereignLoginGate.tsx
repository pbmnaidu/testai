import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  UserCheck,
  HardHat,
  Scale,
  RefreshCw,
  LogIn,
  UserPlus,
  ArrowRight,
  FileCheck,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  Compass,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';

export const SovereignLoginGate: React.FC = () => {
  const {
    loginWithCredentials,
    loginWithGoogle,
    loginAsDemo,
    register,
    designatedOfficerEmail,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'signin' | 'register' | 'demo'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('officer');
  
  // Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('citizen');
  const [regPhone, setRegPhone] = useState('');
  const [regConstituency, setRegConstituency] = useState('');
  const [regOrganization, setRegOrganization] = useState('');

  const [error, setError] = useState('');
  const [regNotice, setRegNotice] = useState<{ type: 'success' | 'warning'; message: string; submessage?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegNotice(null);
    if (!email.trim()) {
      setError('Please enter your official registered email address.');
      return;
    }
    if (selectedRole === 'officer' && email.trim().toLowerCase() !== designatedOfficerEmail.toLowerCase()) {
      setError(`Implementing Officer access is strictly restricted to designated administrative email: ${designatedOfficerEmail}`);
      return;
    }
    setIsSubmitting(true);
    try {
      await loginWithCredentials(email.trim(), password, selectedRole);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials or use Quick Test Access.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegNotice(null);
    if (!regEmail.trim() || !regName.trim()) {
      setError('Full Name and Official Email are mandatory for statutory registration.');
      return;
    }

    if (regRole === 'officer') {
      setError(`Implementing Officer accounts cannot be self-registered. Portal access is strictly pre-designated to: ${designatedOfficerEmail}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const profile = await register({
        email: regEmail.trim(),
        displayName: regName.trim(),
        role: regRole,
        organization: regOrganization.trim(),
        phone: regPhone.trim(),
        constituency: regConstituency.trim(),
      });

      if (profile.approvalStatus === 'PENDING_APPROVAL') {
        // Switch to signin tab and show clear notification
        setEmail(regEmail.trim());
        setSelectedRole(regRole);
        setActiveTab('signin');
        setRegNotice({
          type: 'warning',
          message: 'Registration Request Submitted to Implementing Officer',
          submessage: `Your statutory registration as ${
            regRole === 'contractor' ? 'Civil Works Contractor' : 'Material Contractor & Vendor'
          } has been dispatched to Implementing Officer (${designatedOfficerEmail}). In accordance with statutory protocol, login is locked until officer review and approval. You may log in once approved.`
        });
        setRegName('');
        setRegPhone('');
        setRegOrganization('');
        setRegConstituency('');
      }
    } catch (err: any) {
      setError(err.message || 'Registration could not be completed.');
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
      setError(err.message || 'Google Sovereign SSO could not be completed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSignIn = async (role: UserRole) => {
    setError('');
    setIsSubmitting(true);
    try {
      await loginAsDemo(role);
    } catch (err: any) {
      setError(err.message || 'Fast-track sign in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfaf6] text-[#263a42] font-editorial-sans flex flex-col justify-between">
      {/* Top Sovereign Header Banner */}
      <header className="border-b border-[#ded7ca] bg-[#f2ede4]/80 backdrop-blur-xs py-3 px-4 sm:px-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full border border-[#b6a58b] bg-[#fbfaf6] flex items-center justify-center font-editorial-serif font-bold text-xs text-[#b24e28] shadow-xs">
            MP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-editorial-serif font-bold text-sm tracking-tight text-[#263a42]">
                MPLADS Review Office
              </span>
              <span className="px-2 py-0.5 rounded-sm bg-[#e8f0ea] text-[#4b8c72] font-editorial-mono text-[9px] font-bold tracking-wider uppercase border border-[#d2dfd4]">
                NIC / MoSPI Sovereign Guard
              </span>
            </div>
            <p className="text-[10px] font-editorial-mono uppercase text-[#7b817c] tracking-[0.06em]">
              Ministry of Statistics &amp; Programme Implementation · Government of India
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-[#7b817c]">
          <Lock className="w-3.5 h-3.5 text-[#b24e28]" />
          <span>Statutory Security Enforced · Data Locked</span>
        </div>
      </header>

      {/* Main Gate Body */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8 my-auto">
        <div className="w-full max-w-xl bg-white border border-[#ded7ca] rounded-2xl shadow-xl overflow-hidden animate-fadeIn">
          {/* Sovereign Badge Title Section */}
          <div className="p-6 sm:p-7 border-b border-[#ded7ca] bg-gradient-to-b from-[#fbfaf6] to-[#f2ede4]">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f2ede4] border border-[#ded7ca] text-[10px] font-editorial-mono font-bold uppercase tracking-wider text-[#b24e28]">
                <ShieldCheck className="w-3.5 h-3.5" /> Statutory Access Protocol
              </span>
              <span className="font-editorial-mono text-[10px] text-[#7b817c]">
                Ref: MPLADS-ACT-2026/G-SEC
              </span>
            </div>

            <h2 className="font-editorial-serif text-2xl sm:text-3xl font-bold text-[#263a42] mt-3 tracking-tight">
              Sign In to Access MPLADS Portfolio
            </h2>
            <p className="text-xs text-[#7b817c] mt-1.5 leading-relaxed">
              All project records, geotagged evidence audits, financial ledgers, and duplicate indicators are restricted. Authenticate with official credentials to unlock the intelligence workspace.
            </p>

            {/* Confidentiality Notice Alert */}
            <div className="mt-4 rounded-xl border border-[#ded7ca] bg-white/80 p-3 text-[11px] leading-relaxed text-[#263a42] flex items-start gap-2.5 shadow-2xs">
              <Lock className="w-4 h-4 text-[#b24e28] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#263a42]">Confidential Government Record:</strong>{' '}
                <span className="text-[#7b817c]">
                  Designated Officer: <code className="font-editorial-mono font-bold text-[#b24e28]">{designatedOfficerEmail}</code>. Authorized personnel and verified citizens can also sign in via Google SSO or evaluate via Fast-Track Access below.
                </span>
              </div>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="flex border-b border-[#ded7ca] bg-[#fbfaf6]">
            <button
              type="button"
              onClick={() => { setActiveTab('signin'); setError(''); }}
              className={`flex-1 py-3 px-3 text-xs font-bold font-editorial-sans tracking-wide transition-all border-b-2 ${
                activeTab === 'signin'
                  ? 'border-[#b24e28] text-[#b24e28] bg-white'
                  : 'border-transparent text-[#7b817c] hover:text-[#263a42]'
              }`}
            >
              Official Sign In
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('register'); setError(''); }}
              className={`flex-1 py-3 px-3 text-xs font-bold font-editorial-sans tracking-wide transition-all border-b-2 ${
                activeTab === 'register'
                  ? 'border-[#b24e28] text-[#b24e28] bg-white'
                  : 'border-transparent text-[#7b817c] hover:text-[#263a42]'
              }`}
            >
              New Registration
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('demo'); setError(''); }}
              className={`flex-1 py-3 px-3 text-xs font-bold font-editorial-sans tracking-wide transition-all border-b-2 ${
                activeTab === 'demo'
                  ? 'border-[#4b8c72] text-[#4b8c72] bg-[#e8f0ea]/50'
                  : 'border-transparent text-[#7b817c] hover:text-[#263a42]'
              }`}
            >
              Quick Test Access
            </button>
          </div>          {/* Form Content */}
          <div className="p-6 sm:p-7 space-y-4">
            {regNotice && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/95 p-3.5 text-xs text-amber-950 space-y-1.5 shadow-sm animate-fadeIn">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{regNotice.message}</span>
                </div>
                {regNotice.submessage && (
                  <p className="text-[11px] text-amber-800 leading-relaxed pl-6">
                    {regNotice.submessage}
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/95 p-3.5 text-xs font-semibold text-rose-900 flex items-start gap-2.5 shadow-xs animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{error}</div>
              </div>
            )}

            {/* TAB 1: SIGN IN */}
            {activeTab === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#263a42] mb-1">
                    Official Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7b817c]" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={selectedRole === 'officer' ? designatedOfficerEmail : 'name@domain.gov.in'}
                      className="w-full rounded-xl border border-[#ded7ca] bg-white py-2.5 pl-9 pr-3 text-xs text-[#263a42] font-editorial-sans outline-none focus:border-[#b24e28] focus:ring-2 focus:ring-[#b24e28]/20 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#263a42] mb-1">
                    Password / Statutory PIN
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7b817c]" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="•••••••• (optional for official demo accounts)"
                      className="w-full rounded-xl border border-[#ded7ca] bg-white py-2.5 pl-9 pr-3 text-xs text-[#263a42] font-editorial-sans outline-none focus:border-[#b24e28] focus:ring-2 focus:ring-[#b24e28]/20 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#263a42] mb-1">
                    Sign In Role Protocol
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => {
                      const r = e.target.value as UserRole;
                      setSelectedRole(r);
                      if (r === 'officer' && !email) {
                        setEmail(designatedOfficerEmail);
                      }
                    }}
                    className="w-full rounded-xl border border-[#ded7ca] bg-white py-2.5 px-3 text-xs text-[#263a42] font-editorial-sans outline-none focus:border-[#b24e28] focus:ring-2 focus:ring-[#b24e28]/20"
                  >
                    <option value="officer">Implementing &amp; Inspection Officer (Strictly: {designatedOfficerEmail})</option>
                    <option value="citizen">Verified Citizen Auditor (Public Transparency)</option>
                    <option value="contractor">Civil Works Contractor (Muster Roll &amp; Attendance)</option>
                    <option value="material_contractor">Material Contractor &amp; Vendor (Fairness Review)</option>
                  </select>
                  {selectedRole === 'officer' && (
                    <p className="mt-1 text-[10px] font-bold text-[#b24e28]">
                      🔒 Implementing Officer access is strictly restricted to designated account: {designatedOfficerEmail}
                    </p>
                  )}
                  {(selectedRole === 'contractor' || selectedRole === 'material_contractor') && (
                    <p className="mt-1 text-[10px] text-[#7b817c]">
                      ℹ Contractors and vendors must have an approved registration from Implementing Officer to log in.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-[#263a42] text-white text-xs font-bold tracking-wide uppercase flex items-center justify-center gap-2 hover:bg-[#1f3037] shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <LogIn className="w-4 h-4 text-[#b24e28]" />
                  )}
                  <span>Sign In &amp; Unlock Portfolio</span>
                </button>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-[#ded7ca]" />
                  <span className="mx-3 text-[10px] font-editorial-mono uppercase font-bold text-[#7b817c]">
                    or sovereign single sign-on
                  </span>
                  <div className="flex-grow border-t border-[#ded7ca]" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl border border-[#ded7ca] bg-white text-xs font-bold text-[#263a42] flex items-center justify-center gap-2.5 hover:bg-[#fbfaf6] shadow-2xs transition disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Sign In with Google Sovereign SSO</span>
                </button>
              </form>
            )}

            {/* TAB 2: REGISTRATION */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#263a42] mb-1">
                    Select Registration Category *
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => {
                      setRegRole(e.target.value as UserRole);
                      setError('');
                    }}
                    className="w-full rounded-xl border border-[#ded7ca] bg-white py-2 px-3 text-xs text-[#263a42] outline-none focus:border-[#b24e28] focus:ring-2 focus:ring-[#b24e28]/20"
                  >
                    <option value="citizen">Public Citizen Auditor (Instant Portal Access)</option>
                    <option value="contractor">Civil Works Contractor (Officer Approval Required)</option>
                    <option value="material_contractor">Material Contractor &amp; Vendor (Officer Approval Required)</option>
                  </select>

                  {regRole === 'citizen' ? (
                    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-2.5 text-[11px] text-emerald-900 leading-relaxed flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Instant Access Granted:</strong> Citizens can inspect works, track constituency budgets, and submit geotagged photographic grievances immediately after registering.
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50/90 p-2.5 text-[11px] text-amber-900 leading-relaxed flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <strong>Officer Approval Required:</strong> In accordance with statutory guidelines, {regRole === 'contractor' ? 'Civil Works Contractors' : 'Material Vendors'} require mandatory authorization by the Implementing Officer (<code className="font-mono font-bold text-[#b24e28]">{designatedOfficerEmail}</code>). You cannot log in until approved in the Officer Action Center.
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#263a42] mb-1">
                    Full Official Name / Entity Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder={regRole === 'citizen' ? 'e.g. Ramesh Kumar' : 'e.g. Sri Balaji Infra / Deccan Supplies'}
                    className="w-full rounded-xl border border-[#ded7ca] bg-white py-2 px-3 text-xs text-[#263a42] outline-none focus:border-[#b24e28] focus:ring-2 focus:ring-[#b24e28]/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#263a42] mb-1">
                    Official Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="name@domain.gov.in"
                    className="w-full rounded-xl border border-[#ded7ca] bg-white py-2 px-3 text-xs text-[#263a42] outline-none focus:border-[#b24e28] focus:ring-2 focus:ring-[#b24e28]/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#7b817c] mb-1">
                      Phone / Mobile
                    </label>
                    <input
                      type="text"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="+91 94401 XXXXX"
                      className="w-full rounded-xl border border-[#ded7ca] bg-white py-1.5 px-2.5 text-xs text-[#263a42]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#7b817c] mb-1">
                      {regRole === 'citizen' ? 'Constituency / District' : 'License No. / GSTIN *'}
                    </label>
                    <input
                      type="text"
                      value={regConstituency}
                      onChange={(e) => setRegConstituency(e.target.value)}
                      placeholder={regRole === 'citizen' ? 'e.g. Visakhapatnam' : 'e.g. GSTIN 37AAACD4567M1Z4'}
                      className="w-full rounded-xl border border-[#ded7ca] bg-white py-1.5 px-2.5 text-xs text-[#263a42]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#7b817c] mb-1">
                    {regRole === 'citizen' ? 'Residence / Ward / Locality' : 'Firm / Registered Company Name'}
                  </label>
                  <input
                    type="text"
                    value={regOrganization}
                    onChange={(e) => setRegOrganization(e.target.value)}
                    placeholder={regRole === 'citizen' ? 'e.g. Ward 12, Gajuwaka' : 'e.g. Deccan Building Materials Consortium'}
                    className="w-full rounded-xl border border-[#ded7ca] bg-white py-1.5 px-2.5 text-xs text-[#263a42]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-3 mt-2 rounded-xl text-white text-xs font-bold tracking-wide uppercase flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 ${
                    regRole === 'citizen' ? 'bg-[#4b8c72] hover:bg-[#3d735d]' : 'bg-[#b24e28] hover:bg-[#964221]'
                  }`}
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>
                    {regRole === 'citizen'
                      ? 'Register & Unlock Portal Instantly'
                      : 'Submit Request for Implementing Officer Approval'}
                  </span>
                </button>
              </form>
            )}

            {/* TAB 3: DEMO FAST-TRACK ACCESS */}
            {activeTab === 'demo' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#d2dfd4] bg-[#e8f0ea]/60 p-3 text-[11px] leading-relaxed text-[#263a42]">
                  <strong>Evaluation &amp; Reviewer Credentials:</strong> Click any statutory role below to sign in instantly with pre-verified credentials.
                </div>

                {/* 1. Designated Inspection Officer */}
                <button
                  type="button"
                  onClick={() => handleDemoSignIn('officer')}
                  disabled={isSubmitting}
                  className="w-full text-left rounded-xl border border-[#d2dfd4] bg-white p-3.5 hover:border-[#4b8c72] hover:bg-[#e8f0ea]/30 transition flex items-center justify-between group shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#e8f0ea] border border-[#d2dfd4] flex items-center justify-center text-[#4b8c72] shrink-0">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#263a42]">
                          Designated Implementing Officer
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[#4b8c72] text-white font-editorial-mono text-[9px] font-black">
                          OFFICER / ADMIN
                        </span>
                      </div>
                      <div className="font-editorial-mono text-[10px] text-[#4b8c72] truncate mt-0.5">
                        {designatedOfficerEmail} (Polimera Bhanu Prakash Naidu)
                      </div>
                      <div className="text-[10px] text-[#7b817c] truncate mt-0.5">
                        Statutory audit review, grievance disposal, and contractor oversight
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#7b817c] group-hover:text-[#4b8c72] group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>

                {/* 2. Citizen Auditor */}
                <button
                  type="button"
                  onClick={() => handleDemoSignIn('citizen')}
                  disabled={isSubmitting}
                  className="w-full text-left rounded-xl border border-[#ded7ca] bg-white p-3.5 hover:border-[#b24e28] hover:bg-[#fbfaf6] transition flex items-center justify-between group shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#f2ede4] border border-[#ded7ca] flex items-center justify-center text-[#b24e28] shrink-0">
                      <Compass className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#263a42]">
                          Verified Citizen Auditor
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[#b24e28] text-white font-editorial-mono text-[9px] font-black">
                          CITIZEN
                        </span>
                      </div>
                      <div className="font-editorial-mono text-[10px] text-[#b24e28] truncate mt-0.5">
                        citizen.prakash@nic.in (Ramesh Kumar Citizen)
                      </div>
                      <div className="text-[10px] text-[#7b817c] truncate mt-0.5">
                        Public work inspection, photographic complaints, and community feedback
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#7b817c] group-hover:text-[#b24e28] group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>

                {/* 3. Civil Contractor */}
                <button
                  type="button"
                  onClick={() => handleDemoSignIn('contractor')}
                  disabled={isSubmitting}
                  className="w-full text-left rounded-xl border border-blue-200 bg-white p-3.5 hover:border-blue-500 hover:bg-blue-50/40 transition flex items-center justify-between group shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
                      <HardHat className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#263a42]">
                          Civil Works Contractor
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white font-editorial-mono text-[9px] font-black">
                          CONTRACTOR
                        </span>
                      </div>
                      <div className="font-editorial-mono text-[10px] text-blue-700 truncate mt-0.5">
                        contractor.infra@nic.in (Sri Balaji Infra &amp; Constructions)
                      </div>
                      <div className="text-[10px] text-[#7b817c] truncate mt-0.5">
                        Live geofenced camera attendance and worker headcount muster roll
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#7b817c] group-hover:text-blue-600 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>

                {/* 4. Material Contractor */}
                <button
                  type="button"
                  onClick={() => handleDemoSignIn('material_contractor')}
                  disabled={isSubmitting}
                  className="w-full text-left rounded-xl border border-purple-200 bg-white p-3.5 hover:border-purple-500 hover:bg-purple-50/40 transition flex items-center justify-between group shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
                      <Scale className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#263a42]">
                          Works Material Contractor &amp; Vendor
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-600 text-white font-editorial-mono text-[9px] font-black">
                          MATERIAL VENDOR
                        </span>
                      </div>
                      <div className="font-editorial-mono text-[10px] text-purple-700 truncate mt-0.5">
                        materials.supply@nic.in (Deccan Cement &amp; Steel Supplies)
                      </div>
                      <div className="text-[10px] text-[#7b817c] truncate mt-0.5">
                        Material test lab certificates, dispatch receipts, and market price fairness
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#7b817c] group-hover:text-purple-600 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#ded7ca] bg-[#f2ede4]/60 py-3 px-4 text-center text-[10px] text-[#7b817c] font-editorial-mono">
        Government of India · Statutory Audit &amp; Risk Intelligence System · All sessions authenticated &amp; auditable
      </footer>
    </div>
  );
};
