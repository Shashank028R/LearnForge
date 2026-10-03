import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Input, Icon, IconButton, Divider } from '../ui';

/**
 * Professional Authentication Modal adhering to LearnForge Design System.
 * Replaces demo styling with calm, restrained layout.
 * Strictly avoids glassmorphism, glowing borders, and backdrop blurs.
 */
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
            width: 360,
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
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setErrorMsg(err.message || 'Unable to dispatch verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    const char = value.slice(-1);
    if (char && !/^\d$/.test(char)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);
    setErrorMsg('');

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Neutral backdrop without blur filter */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 bg-app-surface border border-app-border rounded-lg shadow-modal max-w-md w-full p-6 sm:p-7">
        {/* Close Button */}
        <div className="absolute top-4 right-4">
          <IconButton
            icon={<Icon name="x" size={16} />}
            label="Close authentication modal"
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        </div>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="w-8 h-8 rounded bg-brand-500 text-white flex items-center justify-center font-bold text-xs mb-3 shadow-subtle">
            LF
          </div>
          <h2 id="auth-modal-title" className="text-lg font-semibold text-app-text-primary">
            {step === 'email' ? 'Welcome to LearnForge' : 'Enter Verification Code'}
          </h2>
          <p className="text-xs text-app-text-secondary mt-1 leading-relaxed">
            {step === 'email'
              ? 'Sign in to access your personal study workspace, structured notes, and knowledge graph.'
              : `We sent a 6-digit code to ${email}.`}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            role="alert"
            className="mb-4 p-3 rounded bg-status-danger-bg border border-status-danger/20 text-status-danger-text text-xs font-medium flex items-start gap-2"
          >
            <Icon name="alert" size={15} className="flex-shrink-0 mt-0.5 text-status-danger" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step 1: Email & Google */}
        {step === 'email' && (
          <div className="space-y-4">
            {/* Google Sign-In Container */}
            <div className="w-full flex justify-center">
              <div ref={googleButtonRef} className="w-full flex justify-center min-h-[40px]" />
            </div>

            {(!googleClientId || !window.google?.accounts?.id) && (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={handleGoogleClick}
                disabled={loading}
                icon={
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24">
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
                }
              >
                Continue with Google
              </Button>
            )}

            <Divider label="or email" />

            {/* Email OTP Form */}
            <form onSubmit={handleRequestOtp} className="space-y-3">
              <Input
                id="auth-email-input"
                type="email"
                required
                label="Email Address"
                placeholder="student@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                fullWidth
                disabled={loading || !email}
                loading={loading}
              >
                Send Verification Code
              </Button>
            </form>
          </div>
        )}

        {/* Step 2: 6-Digit OTP */}
        {step === 'otp' && (
          <div className="space-y-5">
            <div className="flex justify-between gap-1.5 sm:gap-2" onPaste={handlePaste}>
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
                  className="w-10 sm:w-12 h-12 sm:h-14 text-center text-lg sm:text-xl font-mono font-bold bg-app-surface border border-app-border rounded text-app-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                  disabled={loading}
                />
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-app-text-secondary pt-1">
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
              >
                ← Change Email
              </button>

              {cooldown > 0 ? (
                <span className="font-mono text-app-text-muted">Resend in {cooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={loading}
                  className="text-brand-600 dark:text-brand-400 hover:underline font-medium disabled:opacity-50"
                >
                  Resend Code
                </button>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              fullWidth
              onClick={() => handleVerify()}
              disabled={loading || otpDigits.join('').length !== 6}
              loading={loading}
            >
              Verify & Continue
            </Button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-app-border flex items-center justify-center gap-1.5 text-[11px] text-app-text-muted">
          <Icon name="shield" size={13} className="opacity-70" />
          <span>Passwordless & Secured by LearnForge</span>
        </div>
      </div>
    </div>
  );
}
