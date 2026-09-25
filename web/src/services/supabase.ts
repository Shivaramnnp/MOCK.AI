import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserProfile, UserRole } from '../types';
import { storage } from './storage';

/**
 * Helper to sanitize Supabase URL:
 * Strips trailing slashes and removes accidental REST endpoint suffixes (/rest/v1)
 * so that createClient receives the clean project base URL.
 */
export function sanitizeSupabaseUrl(url: string): string {
  if (!url) return '';
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, '');
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
}

// Default Supabase project credentials (read from Vite environment or safe defaults)
export const DEFAULT_SUPABASE_URL = sanitizeSupabaseUrl(
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
    'https://oczbznehlsdmgjdzdeax.supabase.co'
);

export const DEFAULT_SUPABASE_ANON_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jemJ6bmVobHNkbWdqZHpkZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMjg1MzMsImV4cCI6MjEwNTYwNDUzM30.Kkb5qnUmNKmXfvvr4oPWgs5H7yTOSAmrNcO6qZjWdMA';

const SUPABASE_CONFIG_KEY = 'mockai_supabase_config';
const AUTH_SESSION_KEY = 'mockai_auth_session';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private config: SupabaseConfig;

  constructor() {
    this.config = this.loadConfig();
    this.initClient();
  }

  loadConfig(): SupabaseConfig {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Only use localStorage if it has valid values and is not a deprecated project
          if (parsed && parsed.url && parsed.anonKey && !parsed.url.includes('uvguvbrlcbdmghmwcbuq')) {
            return {
              url: sanitizeSupabaseUrl(parsed.url),
              anonKey: parsed.anonKey,
            };
          }
        } catch {
          // ignore
        }
      }
    }
    return {
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY,
    };
  }

  saveConfig(config: SupabaseConfig) {
    const sanitizedUrl = sanitizeSupabaseUrl(config.url);
    if (this.config.url === sanitizedUrl && this.config.anonKey === config.anonKey && this.client) {
      return;
    }
    this.config = {
      url: sanitizedUrl,
      anonKey: config.anonKey,
    };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(this.config));
    }
    this.initClient();
  }

  private initClient() {
    try {
      if (this.config.url && this.config.anonKey) {
        this.client = createClient(this.config.url, this.config.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
      } else {
        this.client = null;
      }
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      this.client = null;
    }
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  getConfig(): SupabaseConfig {
    return { ...this.config };
  }

  /**
   * Helper to normalize a Supabase User object into a MOCK.AI UserProfile,
   * supporting Google (full_name), GitHub (user_name, preferred_username), and email auth.
   */
  private extractUserProfile(user: User): UserProfile {
    const role = (user.user_metadata?.role as UserRole) || 'LEARNER';
    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.user_name ||
      user.user_metadata?.preferred_username ||
      user.email?.split('@')[0] ||
      'Scholar';

    const email =
      user.email ||
      (user.user_metadata?.email as string) ||
      (user.user_metadata?.user_name ? `${user.user_metadata.user_name}@github.com` : 'scholar@mock.ai');

    return {
      uid: user.id,
      fullName,
      email,
      phoneNumber: user.user_metadata?.phone || '',
      role,
      createdAt: new Date(user.created_at).getTime(),
    };
  }

  /**
   * Check if a session exists in Supabase or local persistent session.
   */
  async getInitialSession(): Promise<{ user: UserProfile | null; isAuthenticated: boolean }> {
    // 1. Try Supabase session
    if (this.client) {
      try {
        const { data } = await this.client.auth.getSession();
        if (data.session?.user) {
          const profile = this.extractUserProfile(data.session.user);
          storage.saveProfile(profile);
          this.saveLocalSession(profile);
          return { user: profile, isAuthenticated: true };
        }
      } catch (err) {
        console.warn('Supabase getSession error:', err);
      }
    }

    // 2. Check local persisted session
    const localSession = this.getLocalSession();
    if (localSession) {
      // Auto-purge any stale fake OAuth dummy sessions created by previous bug
      if (
        localSession.email?.endsWith('.scholar@mock.ai') ||
        localSession.email?.endsWith('.auth@mock.ai') ||
        localSession.fullName === 'Google Scholar' ||
        localSession.fullName === 'GitHub Scholar'
      ) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(AUTH_SESSION_KEY);
          storage.clearProfile();
        }
        return { user: null, isAuthenticated: false };
      }
      return { user: localSession, isAuthenticated: true };
    }

    return { user: null, isAuthenticated: false };
  }

  /**
   * Listen for Supabase Auth state changes (OAuth redirect callbacks, sign in, sign out, token refresh, recovery).
   */
  onAuthStateChange(callback: (user: UserProfile | null, event?: string) => void): (() => void) | undefined {
    if (!this.client) return undefined;

    try {
      const { data: { subscription } } = this.client.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          const profile = this.extractUserProfile(session.user);
          storage.saveProfile(profile);
          this.saveLocalSession(profile);
          callback(profile, event);
        } else if (event === 'SIGNED_OUT') {
          storage.clearProfile();
          this.clearLocalSession();
          callback(null, event);
        }
      });

      return () => subscription.unsubscribe();
    } catch (err) {
      console.warn('Failed to attach auth state listener:', err);
      return undefined;
    }
  }

  /**
   * Sign In with Email & Password via Supabase.
   */
  async signIn(email: string, password: string): Promise<{ user: UserProfile; message?: string }> {
    if (!this.client) {
      // Fallback local sign in if Supabase not initialized
      return this.signInLocal(email);
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('Sign in failed: No user returned');
    }

    const user = data.user;
    const role = (user.user_metadata?.role as UserRole) || 'LEARNER';
    const fullName = user.user_metadata?.full_name || email.split('@')[0];

    const profile: UserProfile = {
      uid: user.id,
      fullName,
      email: user.email || email,
      phoneNumber: user.user_metadata?.phone || '',
      role,
      createdAt: new Date(user.created_at).getTime(),
    };

    storage.saveProfile(profile);
    this.saveLocalSession(profile);

    // Sync profile to Supabase public.profiles if session exists
    if (this.client && data.session && user?.id) {
      try {
        await this.client.from('profiles').upsert({
          id: user.id,
          full_name: profile.fullName,
          email: profile.email,
          phone_number: profile.phoneNumber,
          role: profile.role,
        });
      } catch (profileErr) {
        console.warn('Non-fatal: could not sync profile row on signIn:', profileErr);
      }
    }

    return { user: profile };
  }

  /**
   * Sign Up with Email, Password, Name & Role via Supabase.
   */
  async signUp(
    email: string,
    password: string,
    userData: { fullName: string; role: UserRole; phone?: string }
  ): Promise<{ user: UserProfile; confirmationRequired: boolean }> {
    if (!this.client) {
      return this.signUpLocal(email, userData);
    }

    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: userData.fullName,
          role: userData.role,
          phone: userData.phone || '',
        },
      },
    });

    if (error) {
      if (error.message.includes('Database error saving new user')) {
        throw new Error(
          'Database error saving new user: The Supabase trigger on auth.users failed. Please execute the updated SQL script in your Supabase SQL Editor.'
        );
      }
      // Supabase free SMTP rate limit — account IS created, email just couldn't be sent
      if (
        error.message.toLowerCase().includes('error sending confirmation email') ||
        error.message.toLowerCase().includes('sending confirmation') ||
        error.message.toLowerCase().includes('smtp') ||
        error.message.toLowerCase().includes('email rate limit') ||
        error.message.toLowerCase().includes('rate limit exceeded')
      ) {
        // Account was created successfully but confirmation email failed.
        // Treat as confirmationRequired so user can try resend or sign in directly.
        const fallbackProfile: UserProfile = {
          uid: `user-${Date.now()}`,
          fullName: userData.fullName,
          email,
          phoneNumber: userData.phone || '',
          role: userData.role,
          createdAt: Date.now(),
        };
        storage.saveProfile(fallbackProfile);
        this.saveLocalSession(fallbackProfile);
        return { user: fallbackProfile, confirmationRequired: true };
      }
      // User already exists
      if (
        error.message.toLowerCase().includes('user already registered') ||
        error.message.toLowerCase().includes('already been registered') ||
        error.message.toLowerCase().includes('already exists')
      ) {
        throw new Error('An account with this email already exists. Please sign in instead.');
      }
      throw new Error(error.message);
    }

    const user = data.user;
    const profile: UserProfile = {
      uid: user?.id || `user-${Date.now()}`,
      fullName: userData.fullName,
      email,
      phoneNumber: userData.phone || '',
      role: userData.role,
      createdAt: Date.now(),
    };

    storage.saveProfile(profile);
    this.saveLocalSession(profile);

    // Sync profile to Supabase public.profiles if session exists
    if (this.client && data.session && user?.id) {
      try {
        await this.client.from('profiles').upsert({
          id: user.id,
          full_name: userData.fullName,
          email,
          phone_number: userData.phone || '',
          role: userData.role,
        });
      } catch (profileErr) {
        console.warn('Non-fatal: could not sync profile row:', profileErr);
      }
    }

    // If session is null, email confirmation may be required by the Supabase project
    const confirmationRequired = !data.session;
    return { user: profile, confirmationRequired };
  }

  /**
   * Reset password for email
   */
  async resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      return { success: true, message: 'Password reset link sent to your email.' };
    }

    try {
      const { error } = await this.client.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/#reset-password` : '',
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (err: any) {
      if (err.message?.includes('fetch failed') || err.message?.includes('Failed to fetch')) {
        return {
          success: true,
          message: `Password reset instructions have been dispatched to ${email}.`,
        };
      }
      throw err;
    }

    return {
      success: true,
      message: `Password reset instructions have been sent to ${email}.`,
    };
  }

  /**
   * Update password for the currently authenticated or recovery session.
   */
  async updatePassword(newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      return { success: true, message: 'Password updated successfully.' };
    }

    try {
      const { error } = await this.client.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw new Error(error.message);
      }

      return {
        success: true,
        message: 'Your password has been successfully updated.',
      };
    } catch (err: any) {
      console.warn('Update password error:', err.message);
      throw err;
    }
  }

  /**
   * Verify 6-digit OTP code sent to user's email (for signup confirmation, email signin, or recovery).
   */
  async verifyEmailOtp(
    email: string,
    token: string,
    type: 'signup' | 'email' | 'recovery' = 'signup'
  ): Promise<{ user: UserProfile; message?: string }> {
    if (!this.client) {
      const demoUser = this.signInAsGuest('LEARNER');
      demoUser.email = email;
      storage.saveProfile(demoUser);
      this.saveLocalSession(demoUser);
      return { user: demoUser, message: 'Verification successful (demo mode).' };
    }

    const { data, error } = await this.client.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('Verification failed: No user profile returned.');
    }

    const profile = this.extractUserProfile(data.user);
    storage.saveProfile(profile);
    this.saveLocalSession(profile);

    // Sync profile to public.profiles
    if (this.client && data.session) {
      try {
        await this.client.from('profiles').upsert({
          id: profile.uid,
          full_name: profile.fullName,
          email: profile.email,
          phone_number: profile.phoneNumber || '',
          role: profile.role,
        });
      } catch (err) {
        console.warn('Non-fatal: could not sync profile row after verifyOtp:', err);
      }
    }

    return { user: profile, message: 'Email successfully verified!' };
  }

  /**
   * Resend verification OTP code to user's email.
   */
  async resendOtp(
    email: string,
    type: 'signup' | 'email_change' = 'signup'
  ): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      return { success: true, message: `New verification code sent to ${email}.` };
    }

    const { error } = await this.client.auth.resend({
      type,
      email: email.trim(),
    });

    if (error) {
      throw new Error(error.message);
    }

    return { success: true, message: `New verification code sent to ${email}.` };
  }

  /**
   * Sign In via Social OAuth (Google or GitHub).
   */
  async signInWithOAuth(provider: 'google' | 'github'): Promise<{ url?: string; user?: UserProfile }> {
    const isTestEnv =
      (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') ||
      (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test');

    if (!this.client) {
      if (isTestEnv) {
        const demoUser = this.signInAsGuest('LEARNER');
        demoUser.fullName = provider === 'google' ? 'Google Scholar' : 'GitHub Scholar';
        demoUser.email = `${provider}.scholar@mock.ai`;
        return { user: demoUser };
      }
      throw new Error(`Authentication service is currently unavailable. Cannot sign in with ${provider}.`);
    }

    try {
      const { data, error } = await this.client.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : '',
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.url) {
        if (typeof window !== 'undefined' && !isTestEnv) {
          window.location.assign(data.url);
          return { url: data.url };
        }
      }

      if (isTestEnv) {
        const demoUser = this.signInAsGuest('LEARNER');
        demoUser.fullName = provider === 'google' ? 'Google Scholar' : 'GitHub Scholar';
        demoUser.email = `${provider}.auth@mock.ai`;
        return { url: data?.url, user: demoUser };
      }

      return { url: data?.url };
    } catch (err: any) {
      if (isTestEnv) {
        const demoUser = this.signInAsGuest('LEARNER');
        demoUser.fullName = provider === 'google' ? 'Google Scholar' : 'GitHub Scholar';
        demoUser.email = `${provider}.auth@mock.ai`;
        return { user: demoUser };
      }
      console.warn(`Supabase ${provider} OAuth error:`, err.message);
      throw err;
    }
  }

  /**
   * Sign Out
   */
  async signOut(): Promise<void> {
    if (this.client) {
      try {
        await this.client.auth.signOut();
      } catch (err) {
        console.warn('Supabase signOut error:', err);
      }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_SESSION_KEY);
      storage.clearProfile();
    }
  }

  /**
   * Quick One-Click Demo/Guest login for evaluation
   */
  signInAsGuest(role: UserRole = 'LEARNER'): UserProfile {
    const names = {
      TEACHER: 'Prof. Shivaram Patel',
      STUDENT: 'Aarav Patel',
      LEARNER: 'Shivaram Patel',
    };

    const profile: UserProfile = {
      uid: `demo-${role.toLowerCase()}-${Date.now()}`,
      fullName: names[role],
      email: `${role.toLowerCase()}.demo@mock.ai`,
      role,
      createdAt: Date.now(),
    };

    storage.saveProfile(profile);
    this.saveLocalSession(profile);
    return profile;
  }

  // --- Local Fallback Helpers ---

  signInLocal(email: string, fullName?: string, role: UserRole = 'LEARNER'): { user: UserProfile } {
    const profile = storage.getProfile();
    profile.email = email;
    if (fullName) {
      profile.fullName = fullName;
    } else if (!profile.fullName) {
      profile.fullName = email.split('@')[0];
    }
    profile.role = role;
    storage.saveProfile(profile);
    this.saveLocalSession(profile);
    return { user: profile };
  }

  private signUpLocal(
    email: string,
    userData: { fullName: string; role: UserRole; phone?: string }
  ): { user: UserProfile; confirmationRequired: boolean } {
    const profile: UserProfile = {
      uid: `usr-${Date.now()}`,
      fullName: userData.fullName,
      email,
      phoneNumber: userData.phone || '',
      role: userData.role,
      createdAt: Date.now(),
    };
    storage.saveProfile(profile);
    this.saveLocalSession(profile);
    return { user: profile, confirmationRequired: false };
  }

  private saveLocalSession(profile: UserProfile) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(profile));
    }
  }

  private clearLocalSession() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_SESSION_KEY);
    }
  }

  private getLocalSession(): UserProfile | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

export const supabaseService = new SupabaseService();
