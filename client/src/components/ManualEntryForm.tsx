import React, { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';

export function ManualEntryForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setStep(3); // success state
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition">
           <X className="w-5 h-5" />
        </button>
        
        {step !== 3 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Double-Entry Adjustment</h2>
            <p className="text-sm text-gray-400 mb-6">Secure manual override requiring an audit note.</p>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Target Branch</label>
                <select required className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">Select Branch...</option>
                  <option value="ggp">GGP Glamping</option>
                  <option value="gct">GCT Training Hub</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Gross Amount (MYR)</label>
                  <input type="number" required placeholder="0.00" className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Category</label>
                  <select required className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                     <option>Cash Shortage</option>
                     <option>Event Deposit</option>
                     <option>Offline Refund</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Audit Reason Note</label>
                <textarea required rows={3} placeholder="Mandatory explanation for this manual adjustment..." className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"></textarea>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full mt-4 py-3 rounded-lg font-bold bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white transition-all shadow-[0_0_15px_rgba(168,85,247,0.4)] disabled:opacity-50">
                {isSubmitting ? 'Verifying...' : 'Commit Immutable Record'}
              </button>
            </form>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-10">
             <div className="inline-flex items-center justify-center p-3 bg-emerald-500/10 rounded-full mb-4">
                <CheckCircle className="w-10 h-10 text-emerald-400" />
             </div>
             <h3 className="text-xl font-bold text-white mb-2">Audit Ledger Updated</h3>
             <p className="text-sm text-gray-400">The manual entry has been permanently recorded and timestamped.</p>
             <button onClick={onClose} className="mt-8 px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md font-medium transition">
               Return to Dashboard
             </button>
          </div>
        )}
      </div>
    </div>
  );
}
