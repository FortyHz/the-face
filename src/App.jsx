import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// --- PRODUCTION IGNITION ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
console.error("CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function App() {
const [uploading, setUploading] = useState(false);
const [status, setStatus] = useState("idle");
const [policies, setPolicies] = useState([]);
const [vendorId, setVendorId] = useState(null);
const [isDragging, setIsDragging] = useState(false);

// --- ADMIN STATE (GOD MODE) ---
const [isAdmin, setIsAdmin] = useState(false);
const [globalPolicies, setGlobalPolicies] = useState([]);
const [nagStatus, setNagStatus] = useState('');

// --- LOGIN STATE ---
const [loginLoading, setLoginLoading] = useState(false);
const [loginError, setLoginError] = useState('');

// --- IDENTITY INTEGRATION ---
useEffect(() => {
supabase.auth.getSession().then(({ data: { session } }) => {
if (session) verifyIdentity(session.user.email);
});

const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    verifyIdentity(session.user.email);
  } else {
    setVendorId(null);
    setIsAdmin(false);
    setPolicies([]);
    setGlobalPolicies([]);
  }
});

return () => subscription.unsubscribe();


}, []);

const verifyIdentity = async (email) => {
try {
const ARCHITECT_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

  if (ARCHITECT_EMAIL && email.toLowerCase() === ARCHITECT_EMAIL.toLowerCase()) {
    setIsAdmin(true);
    setLoginError('');
    fetchGlobalPolicies();
    return; 
  }

  const { data, error } = await supabase
    .from('vendors')
    .select('id')
    .eq('contact_email', email.trim())
    .single();

  if (error || !data) {
    setLoginError(`Access Denied: Unregistered Entity (${email}).`);
    await supabase.auth.signOut();
    setVendorId(null);
  } else {
    setVendorId(data.id);
    setLoginError('');
  }
} catch (err) {
  console.error("Verification Error:", err);
}


};

// --- DATA FETCHING ---
useEffect(() => {
if (vendorId && !isAdmin) fetchPolicies();

const channel = supabase
  .channel('schema-db-changes')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'policies' }, () => {
    if (vendorId) fetchPolicies();
    if (isAdmin) fetchGlobalPolicies();
  })
  .subscribe();

return () => supabase.removeChannel(channel);


}, [vendorId, isAdmin]);

const fetchPolicies = async () => {
const { data } = await supabase
.from('policies')
.select('*')
.eq('vendor_id', vendorId)
.order('created_at', { ascending: false });
if (data) setPolicies(data);
};

const fetchGlobalPolicies = async () => {
const { data } = await supabase
.from('policies')
.select('*, vendors(company_name)')
.order('created_at', { ascending: false });
if (data) setGlobalPolicies(data);
};

const triggerNagEngine = async () => {
setNagStatus('Firing engine...');
try {
// Replace with your actual live Python backend URL on Render
const backendUrl = "https://www.google.com/search?q=https://your-python-backend.onrender.com/trigger-nag";
const response = await fetch(backendUrl);
const data = await response.json();
setNagStatus(data.message || 'Cycle complete.');
setTimeout(() => setNagStatus(''), 5000);
} catch (error) {
setNagStatus('Failed to reach the Eye.');
}
};

const handleGoogleLogin = async () => {
setLoginLoading(true);
setLoginError('');
try {
const { error } = await supabase.auth.signInWithOAuth({
provider: 'google',
options: { redirectTo: window.location.origin }
});
if (error) throw error;
} catch (err) {
setLoginError("OAuth Failed: " + err.message);
setLoginLoading(false);
}
};

const handleLogout = async () => {
await supabase.auth.signOut();
};

// --- UPLOAD PHYSICS ---
const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
const handleDrop = (e) => {
e.preventDefault(); e.stopPropagation(); setIsDragging(false);
if (e.dataTransfer.files && e.dataTransfer.files.length > 0) executeUpload(e.dataTransfer.files[0]);
};
const handleFileSelect = (e) => {
if (e.target.files && e.target.files.length > 0) executeUpload(e.target.files[0]);
};

const executeUpload = async (file) => {
try {
setUploading(true); setStatus("idle");
const fileExt = file.name.split('.').pop();
const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from('cois').upload(fileName, file);
  if (uploadError) throw new Error(uploadError.message);

  const payload = { document_url: fileName, processing_status: 'processing' };
  if (vendorId) payload.vendor_id = vendorId;

  const { error: dbError } = await supabase.from('policies').insert([payload]);
  if (dbError) throw new Error(dbError.message);

  setStatus("success");
  if (vendorId) fetchPolicies();
  if (isAdmin) fetchGlobalPolicies();
} catch (error) {
  setStatus("error");
  console.warn(`SYSTEM BLOCKED UPLOAD: ${error.message}`);
} finally {
  setUploading(false);
}


};

// --- SHARED UI COMPONENTS ---
const GlowingBackground = () => (
<div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
<div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]"></div>
<div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
</div>
);

const getStatusPill = (status) => {
switch (status) {
case 'active':
return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>ACTIVE</span>;
case 'processing':
return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)] animate-pulse"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>SCANNING</span>;
case 'rejected':
return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_10px_rgba(225,29,72,0.1)]"><div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>CRITICAL</span>;
default:
return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"><div className="w-1.5 h-1.5 rounded-full bg-zinc-400"></div>UNKNOWN</span>;
}
};

// ==========================================
// UI RENDER: COMMAND CENTER (GOD MODE)
// ==========================================
if (isAdmin) {
const expiredCount = globalPolicies.filter(p => p.processing_status === 'rejected').length;

return (
  <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans p-4 sm:p-8 relative overflow-hidden">
    <GlowingBackground />
    <div className="max-w-7xl mx-auto relative z-10">
      <header className="mb-8 border-b border-white/10 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse"></div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Command Center <span className="text-zinc-500 font-light tracking-normal ml-2">| God Mode</span>
            </h1>
          </div>
          <p className="text-sm text-zinc-400">Global System Overview & Manual Overrides</p>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={handleLogout} className="text-sm font-medium text-zinc-400 hover:text-rose-400 transition-colors bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg border border-white/5">
            Sever Connection
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-zinc-900/50 backdrop-blur-xl p-6 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <h3 className="text-zinc-400 text-xs font-semibold mb-2 uppercase tracking-wider">Total Policies in Vault</h3>
          <p className="text-4xl text-white font-bold tracking-tight">{globalPolicies.length}</p>
        </div>
        <div className="bg-zinc-900/50 backdrop-blur-xl p-6 rounded-2xl border border-rose-500/20 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <h3 className="text-rose-400 text-xs font-semibold mb-2 uppercase tracking-wider">Critical / Expired</h3>
          <p className="text-4xl text-rose-500 font-bold tracking-tight">{expiredCount}</p>
        </div>
        <div className="bg-zinc-900/50 backdrop-blur-xl p-6 rounded-2xl border border-blue-500/20 shadow-[0_0_20px_rgba(37,99,235,0.1)] flex flex-col justify-center items-center relative overflow-hidden">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay"></div>
           <button onClick={triggerNagEngine} className="relative z-10 w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] uppercase tracking-wider">
             Execute Nag Engine
           </button>
           {nagStatus && <p className="relative z-10 text-xs text-blue-400 mt-3 font-mono">{nagStatus}</p>}
        </div>
      </div>

      <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/5 overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-black/20">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Global Policy Feed</h2>
          <button onClick={fetchGlobalPolicies} className="text-xs text-blue-400 hover:text-blue-300 font-medium">Force Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5">
            <thead className="bg-black/40">
              <tr>
                <th className="py-4 pl-6 pr-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Entity</th>
                <th className="px-3 py-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Carrier</th>
                <th className="px-3 py-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Expiration</th>
                <th className="px-3 py-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Confidence</th>
                <th className="px-3 py-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">System Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent">
              {globalPolicies.map((policy) => (
                <tr key={policy.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium text-white">
                    {policy.vendors?.company_name || <span className="text-zinc-600 italic">Unassigned File</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-zinc-300">{policy.carrier_name || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-zinc-300">{policy.expiration_date || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-zinc-400">
                    {policy.ocr_confidence_score ? (
                      <span className={policy.ocr_confidence_score > 0.8 ? 'text-emerald-400' : 'text-yellow-400'}>
                        {(policy.ocr_confidence_score * 100).toFixed(0)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    {getStatusPill(policy.processing_status)}
                  </td>
                </tr>
              ))}
              {globalPolicies.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-12 text-center text-zinc-500 text-sm">Vault is currently empty.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);


}

// ==========================================
// UI RENDER: VENDOR PORTAL
// ==========================================
return (
<div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans p-4 sm:p-8 relative overflow-hidden">
<GlowingBackground />
<div className="max-w-4xl mx-auto relative z-10">
<header className="mb-12 border-b border-white/10 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
<div>
<h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
<div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.5)]">
<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
</div>
Liability Shield
</h1>
<p className="mt-2 text-sm text-zinc-400 ml-11">Zero Trust Compliance Engine</p>
</div>
<div className="flex gap-4 items-center">
{vendorId && (
<button onClick={handleLogout} className="text-sm font-medium text-zinc-400 hover:text-rose-400 transition-colors bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg border border-white/5">
Log Out
</button>
)}
</div>
</header>

    {vendorId && (
      <div className="mb-8 bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 backdrop-blur-sm flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <div>
          <p className="text-sm font-semibold text-blue-400">Secure Protocol Active</p>
          <p className="text-xs text-blue-300 mt-1">Your identity is verified via encrypted token. Documents submitted here are securely linked to your profile.</p>
        </div>
      </div>
    )}

    {/* UPLOAD SECTION */}
    <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/5 p-6 sm:p-8 mb-12">
      <h2 className="text-lg font-semibold mb-4 text-white uppercase tracking-wider text-sm">Secure File Drop</h2>
      <div className="flex items-center justify-center w-full">
        <label 
          htmlFor="dropzone-file" 
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${
            isDragging ? 'border-blue-500 bg-blue-500/10 shadow-[inset_0_0_50px_rgba(37,99,235,0.1)]' : status === 'error' ? 'border-rose-500/50 bg-rose-500/5' : 'border-zinc-700 bg-black/20 hover:border-blue-500/50 hover:bg-blue-500/5'
          }`}
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
            {uploading ? (
              <div className="flex flex-col items-center">
                <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <div className="text-blue-400 font-medium tracking-wide">Transmitting to Vault...</div>
              </div>
            ) : status === 'success' ? (
              <div className="text-center">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                </div>
                <div className="text-emerald-400 font-bold text-lg mb-1">Transmission Complete</div>
                <p className="text-xs text-emerald-500/70">The Eye is processing data.</p>
              </div>
            ) : status === 'error' ? (
              <div className="text-center">
                 <div className="w-12 h-12 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </div>
                <div className="text-rose-400 font-bold text-lg mb-1">Transmission Blocked</div>
                <p className="text-xs text-rose-500/70">Vault rejected the payload.</p>
              </div>
            ) : (
              <>
                <svg className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-blue-400' : 'text-zinc-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                <p className={`mb-2 text-sm transition-colors ${isDragging ? 'text-blue-400' : 'text-zinc-400'}`}><span className="font-semibold text-white">Click to browse</span> or drag and drop</p>
                <p className="text-xs text-zinc-600 font-mono mt-1">PDF, JPG, PNG (Max 10MB)</p>
              </>
            )}
          </div>
          <input id="dropzone-file" type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileSelect} disabled={uploading} />
        </label>
      </div>
    </div>

    {/* COMPARTMENTALIZED DASHBOARD OR LOGIN PORTAL */}
    {vendorId ? (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Your Active Policies</h2>
          <button onClick={fetchPolicies} className="text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300 py-1.5 px-3 rounded-lg hover:bg-white/10 transition-colors">
            Refresh Status
          </button>
        </div>
        {policies.length === 0 ? (
          <div className="text-center p-12 bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-white/5 border-dashed text-zinc-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            No documents found for your profile. Transmit your first file above.
          </div>
        ) : (
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl shadow-xl border border-white/5 overflow-hidden">
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-black/40">
                <tr>
                  <th className="py-4 pl-6 pr-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ref ID</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Insurer</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Expires</th>
                  <th className="px-3 py-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-transparent">
                {policies.map((policy) => (
                  <tr key={policy.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-mono text-zinc-400">{policy.id.slice(0, 8)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-zinc-300">{policy.carrier_name || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-zinc-300">{policy.expiration_date || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      {getStatusPill(policy.processing_status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    ) : (
      <div className="text-center p-8 sm:p-12 bg-zinc-900/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
        <h3 className="text-xl font-medium text-white tracking-tight">Access Vendor Vault</h3>
        <p className="mt-2 text-sm text-zinc-400 mb-8 max-w-sm mx-auto">
          Authenticate via your authorized company Google account to view compliance status and historical records.
        </p>
        
        <div className="max-w-xs mx-auto">
          {loginError && (
            <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-lg text-xs text-left backdrop-blur-sm">
              {loginError}
            </div>
          )}
          
          <button
            onClick={handleGoogleLogin} disabled={loginLoading}
            className="w-full bg-white text-zinc-900 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center justify-center gap-3"
          >
            {loginLoading ? "Establishing Connection..." : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Authenticate with Google
              </>
            )}
          </button>
        </div>
      </div>
    )}
  </div>
</div>


);}

export default App;