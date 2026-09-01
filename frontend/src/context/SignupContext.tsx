import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  checkSignupEmail,
  sendSignupOtp,
  verifySignupOtp,
} from "@/src/services/signupApi";

export type SignupStep = "email" | "otp" | "account";

type SignupCtx = {
  step: SignupStep;
  email: string;
  fullName: string;
  password: string;
  otpCode: string;
  verificationToken: string | null;
  otpExpiresIn: number;
  resendAfter: number;
  otpSentAt: number | null;
  resendAvailableAt: number | null;
  verificationExpiresIn: number | null;
  error: string | null;
  loading: boolean;
  resendCountdown: number;
  otpExpiresCountdown: number;
  isOtpExpired: boolean;
  setEmail: (v: string) => void;
  setFullName: (v: string) => void;
  setPassword: (v: string) => void;
  setOtpCode: (v: string) => void;
  setStep: (step: SignupStep) => void;
  setError: (msg: string | null) => void;
  submitEmail: () => Promise<void>;
  verifyOtp: (code?: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  changeEmail: () => void;
  resetSignup: () => void;
  tickCountdowns: () => void;
};

const Ctx = createContext<SignupCtx | undefined>(undefined);

const initialState = {
  step: "email" as SignupStep,
  email: "",
  fullName: "",
  password: "",
  otpCode: "",
  verificationToken: null as string | null,
  otpExpiresIn: 600,
  resendAfter: 60,
  otpSentAt: null as number | null,
  resendAvailableAt: null as number | null,
  verificationExpiresIn: null as number | null,
  error: null as string | null,
  loading: false,
};

export function SignupProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(initialState);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [otpExpiresCountdown, setOtpExpiresCountdown] = useState(0);
  const inFlight = useRef(false);

  const normalizedEmail = state.email.trim().toLowerCase();

  const isOtpExpired = otpExpiresCountdown <= 0 && state.step === "otp" && state.otpSentAt != null;

  const updateCountdowns = useCallback(() => {
    const now = Date.now();
    if (state.resendAvailableAt) {
      setResendCountdown(Math.max(0, Math.ceil((state.resendAvailableAt - now) / 1000)));
    } else {
      setResendCountdown(0);
    }
    if (state.otpSentAt) {
      const expiresAt = state.otpSentAt + state.otpExpiresIn * 1000;
      setOtpExpiresCountdown(Math.max(0, Math.ceil((expiresAt - now) / 1000)));
    } else {
      setOtpExpiresCountdown(0);
    }
  }, [state.otpSentAt, state.otpExpiresIn, state.resendAvailableAt]);

  const resetSignup = useCallback(() => {
    inFlight.current = false;
    setState(initialState);
    setResendCountdown(0);
    setOtpExpiresCountdown(0);
  }, []);

  const changeEmail = useCallback(() => {
    inFlight.current = false;
    setState((s) => ({
      ...initialState,
      fullName: s.fullName,
      password: s.password,
      email: "",
      step: "email",
    }));
    setResendCountdown(0);
    setOtpExpiresCountdown(0);
  }, []);

  const applySendResponse = useCallback((expiresIn: number, resendAfter: number) => {
    const now = Date.now();
    setOtpExpiresCountdown(expiresIn);
    setResendCountdown(resendAfter);
    setState((s) => ({
      ...s,
      otpExpiresIn: expiresIn,
      resendAfter,
      otpSentAt: now,
      resendAvailableAt: now + resendAfter * 1000,
      otpCode: "",
      error: null,
    }));
  }, []);

  const submitEmail = useCallback(async () => {
    if (inFlight.current) return;
    const em = normalizedEmail;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setState((s) => ({ ...s, error: "Enter a valid email" }));
      return;
    }
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const check = await checkSignupEmail(em);
      if (!check.available) {
        setState((s) => ({ ...s, loading: false, error: "This email is already registered. Sign in instead." }));
        return;
      }
      const sent = await sendSignupOtp(em);
      applySendResponse(sent.expires_in, sent.resend_after);
      setState((s) => ({ ...s, email: em, step: "otp", loading: false, verificationToken: null }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Try again.";
      setState((s) => ({ ...s, loading: false, error: msg }));
    } finally {
      inFlight.current = false;
    }
  }, [applySendResponse, normalizedEmail]);

  const resendOtp = useCallback(async () => {
    if (inFlight.current || resendCountdown > 0) return;
    if (!normalizedEmail) return;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const sent = await sendSignupOtp(normalizedEmail);
      applySendResponse(sent.expires_in, sent.resend_after);
      setState((s) => ({ ...s, loading: false, verificationToken: null }));
    } catch (e: unknown) {
      const err = e as Error & { retryAfter?: number | null };
      if (err.retryAfter) {
        const now = Date.now();
        setState((s) => ({
          ...s,
          resendAvailableAt: now + err.retryAfter! * 1000,
        }));
        setResendCountdown(err.retryAfter);
      }
      const msg = err instanceof Error ? err.message : "Could not resend code. Try again.";
      setState((s) => ({ ...s, loading: false, error: msg }));
    } finally {
      inFlight.current = false;
    }
  }, [applySendResponse, normalizedEmail, resendCountdown]);

  const verifyOtp = useCallback(async (code?: string) => {
    if (inFlight.current) return;
    const digits = (code ?? state.otpCode).replace(/\D/g, "");
    if (digits.length !== 6) {
      setState((s) => ({ ...s, error: "Enter the 6-digit code" }));
      return;
    }
    if (isOtpExpired) {
      setState((s) => ({ ...s, error: "This code has expired. Request a new one." }));
      return;
    }
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null, otpCode: digits }));
    try {
      const result = await verifySignupOtp(normalizedEmail, digits);
      setState((s) => ({
        ...s,
        loading: false,
        verificationToken: result.verification_token,
        verificationExpiresIn: result.expires_in,
        step: "account",
        error: null,
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid or expired verification code.";
      setState((s) => ({ ...s, loading: false, error: msg, otpCode: "" }));
    } finally {
      inFlight.current = false;
    }
  }, [isOtpExpired, normalizedEmail, state.otpCode]);

  const value = useMemo<SignupCtx>(
    () => ({
      ...state,
      resendCountdown,
      otpExpiresCountdown,
      isOtpExpired,
      setEmail: (v) => setState((s) => ({ ...s, email: v, error: null })),
      setFullName: (v) => setState((s) => ({ ...s, fullName: v, error: null })),
      setPassword: (v) => setState((s) => ({ ...s, password: v, error: null })),
      setOtpCode: (v) => setState((s) => ({ ...s, otpCode: v, error: null })),
      setStep: (step) => setState((s) => ({ ...s, step, error: null })),
      setError: (msg) => setState((s) => ({ ...s, error: msg })),
      submitEmail,
      verifyOtp,
      resendOtp,
      changeEmail,
      resetSignup,
      tickCountdowns: updateCountdowns,
    }),
    [
      state,
      resendCountdown,
      otpExpiresCountdown,
      isOtpExpired,
      submitEmail,
      verifyOtp,
      resendOtp,
      changeEmail,
      resetSignup,
      updateCountdowns,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSignup() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSignup must be inside SignupProvider");
  return ctx;
}
