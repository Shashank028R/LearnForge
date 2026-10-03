import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AuthModal({ isOpen, onClose }) {
  const { requestOtp, verifyOtp, authenticateGoogle } = useAuth();

  const [step, setStep] = useState('email'); // 'email' | 'otp'
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const inputRefs = useRef([]);
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('email');
      setErrorMsg('');
      setOtpDigits(['', '', '', '', '', '']);
    }
  }, [isOpen]);

  // Resend countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Initialize official Google Identity Services button
  useEffect(() => {
    if (!isOpen || step !== 'email') return;

    const handleGoogleCredentialResponse = async (response) => {
      if (!response?.credential) {
        setErrorMsg('Google did not return a valid authentication credential.');
        return;
      }
      setLoading(true);
      setErrorMsg('');
      try {
        await authenticateGoogle(response.credential);
        onClose();
      } catch (err) {
        setErrorMsg(err.message || 'Google sign-in was not completed.');
      } finally {
        setLoading(false);
      }
    };

    if (window.google?.accounts?.id && googleClientId) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
        });

        if (googleButtonRef.current) {
          googleButtonRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'outline',
            size: 'large',
            width: 380,
            text: 'continue_with',
            shape: 'rectangular',
          });
        }
      } catch (err) {
        console.warn('Google Identity Services initialization notice:', err);
      }
    }
  }, [isOpen, step, googleClientId, authenticateGoogle, onClose]);

  if (!isOpen) return null;

  const handleRequestOtp = async (e) => {
    e?.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const data = await requestOtp(email.trim());
      setStep('otp');
      setCooldown(data.cooldownSeconds || 60);
      setOtpDigits(['', '', '', '', '', '']);
      // Focus first OTP input after render
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setErrorMsg(err.message || 'Unable to dispatch verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    // Only accept numeric digit
    const char = value.slice(-1);
    if (char && !/^\d$/.test(char)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);
    setErrorMsg('');

    // Advance focus
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if all 6 digits entered
    const fullCode = newDigits.join('');
    if (fullCode.length === 6) {
      handleVerify(fullCode);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pasted)) {
      const digits = pasted.split('');
      setOtpDigits(digits);
      inputRefs.current[5]?.focus();
      handleVerify(pasted);
    }
  };

  const handleVerify = async (codeToVerify) => {
    const code = codeToVerify || otpDigits.join('');
    if (code.length !== 6) {
      setErrorMsg('Please enter the full 6-digit code.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      await verifyOtp(email.trim(), code);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Verification failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = () => {
    if (!googleClientId) {
      setErrorMsg('Google Sign-In requires VITE_GOOGLE_CLIENT_ID to be configured in your environment.');
      return;
    }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setErrorMsg('Google Identity Services is currently unavailable. Please check your network or try email OTP.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-md w-full p-6 sm:p-8 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xl mb-3">
            L
          </div>
          <h2 id="auth-modal-title" className="text-xl font-bold text-slate-900">
            {step === 'email' ? 'Welcome to LearnForge' : 'Enter Verification Code'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {step === 'email'
              ? 'Sign in to access your study workspace, structured notes, and quizzes.'
              : `We sent a 6-digit code to ${email}.`}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {/* Step 1: Email & Google */}
        {step === 'email' && (
          <div className="space-y-4">
            {/* Google Sign-In Container & Fallback Trigger */}
            <div className="w-full flex justify-center">
              <div ref={googleButtonRef} className="w-full flex justify-center" />
            </div>

            {(!googleClientId || !window.google?.accounts?.id) && (
              <button
                type="button"
                onClick={handleGoogleClick}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-3 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.02h3.87c2.26-2.09 3.675-5.17 3.675-9.12z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.02c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.24v3.12C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.27c-.25-.72-.39-1.49-.39-2.27s.14-1.55.39-2.27V6.61H1.24C.45 8.24 0 10.06 0 12s.45 3.76 1.24 5.39l4.03-3.12z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.61l4.03 3.12c.95-2.85 3.6-4.98 6.73-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            )}

            {/* Divider */}
            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-xs font-mono text-slate-400 uppercase tracking-wider">
                or email
              </span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            {/* Email OTP Request Form */}
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label htmlFor="auth-email-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  id="auth-email-input"
                  type="email"
                  required
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors disabled:opacity-60 flex items-center justify-center space-x-2"
              >
                {loading && (
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                <span>Send Verification Code</span>
              </button>
            </form>
          </div>
        )}

        {/* Step 2: 6-Digit OTP Verification */}
        {step === 'otp' && (
          <div className="space-y-5">
            {/* 6-Digit Input Row */}
            <div className="flex justify-between gap-2" onPaste={handlePaste}>
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  aria-label={`Digit ${index + 1} of 6`}
                  className="w-12 h-14 text-center text-xl font-mono font-bold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  disabled={loading}
                />
              ))}
            </div>

            {/* Actions & Resend */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-indigo-600 hover:underline font-medium"
              >
                ← Change Email
              </button>

              {cooldown > 0 ? (
                <span className="font-mono text-slate-400">Resend code in {cooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={loading}
                  className="text-indigo-600 hover:underline font-medium disabled:opacity-50"
                >
                  Resend Code
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleVerify()}
              disabled={loading || otpDigits.join('').length !== 6}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors disabled:opacity-60 flex items-center justify-center space-x-2"
            >
              {loading && (
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              <span>Verify & Continue</span>
            </button>
          </div>
        )}

        {/* Security Assurance Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center space-x-1.5 text-xs text-slate-400">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Passwordless & Secured by LearnForge</span>
        </div>
      </div>
    </div>
  );
}
