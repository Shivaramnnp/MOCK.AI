import { describe, it, expect, beforeEach } from 'vitest';
import { supabaseService, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, sanitizeSupabaseUrl } from './supabase';

describe('SupabaseService Authentication', () => {
  beforeEach(() => {
    localStorage.clear();
    supabaseService.saveConfig({
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY,
    });
  });

  it('should sanitize URLs by stripping trailing slashes and /rest/v1 suffixes', () => {
    expect(sanitizeSupabaseUrl('https://xyz.supabase.co/rest/v1/')).toBe('https://xyz.supabase.co');
    expect(sanitizeSupabaseUrl('https://xyz.supabase.co/rest/v1')).toBe('https://xyz.supabase.co');
    expect(sanitizeSupabaseUrl('https://xyz.supabase.co/')).toBe('https://xyz.supabase.co');
    expect(sanitizeSupabaseUrl('https://xyz.supabase.co')).toBe('https://xyz.supabase.co');
    expect(sanitizeSupabaseUrl('')).toBe('');
  });

  it('should initialize with default Supabase URL and anon key', () => {
    const config = supabaseService.getConfig();
    expect(config.url).toBe(DEFAULT_SUPABASE_URL);
    expect(config.anonKey).toBe(DEFAULT_SUPABASE_ANON_KEY);
    expect(supabaseService.getClient()).not.toBeNull();
  });

  it('should update configuration and re-initialize client', () => {
    const customUrl = 'https://custom-project.supabase.co';
    const customKey = 'custom-anon-key-12345';

    supabaseService.saveConfig({
      url: customUrl,
      anonKey: customKey,
    });

    const updated = supabaseService.getConfig();
    expect(updated.url).toBe(customUrl);
    expect(updated.anonKey).toBe(customKey);
  });

  it('should authenticate demo user profiles accurately via signInAsGuest', async () => {
    // 1. Learner demo
    const learnerUser = supabaseService.signInAsGuest('LEARNER');
    expect(learnerUser.role).toBe('LEARNER');
    expect(learnerUser.email).toBe('learner.demo@mock.ai');

    // Verify session was persisted
    const session1 = await supabaseService.getInitialSession();
    expect(session1.isAuthenticated).toBe(true);
    expect(session1.user?.email).toBe('learner.demo@mock.ai');

    // 2. Student demo
    const studentUser = supabaseService.signInAsGuest('STUDENT');
    expect(studentUser.role).toBe('STUDENT');
    expect(studentUser.email).toBe('student.demo@mock.ai');

    // 3. Teacher demo
    const teacherUser = supabaseService.signInAsGuest('TEACHER');
    expect(teacherUser.role).toBe('TEACHER');
    expect(teacherUser.email).toBe('teacher.demo@mock.ai');
  });

  it('should clear authenticated session upon signOut', async () => {
    supabaseService.signInAsGuest('STUDENT');
    let session = await supabaseService.getInitialSession();
    expect(session.isAuthenticated).toBe(true);

    await supabaseService.signOut();
    session = await supabaseService.getInitialSession();
    expect(session.isAuthenticated).toBe(false);
    expect(session.user).toBeNull();
  });

  it('should handle local fallback sign in and persist profile', async () => {
    const email = 'scholar.test@example.com';
    const res = supabaseService.signInLocal(email, 'Alex Rivera', 'STUDENT');

    expect(res.user.email).toBe(email);
    expect(res.user.fullName).toBe('Alex Rivera');
    expect(res.user.role).toBe('STUDENT');

    const session = await supabaseService.getInitialSession();
    expect(session.isAuthenticated).toBe(true);
    expect(session.user?.email).toBe(email);
  });

  it('should handle password reset requests', async () => {
    const result = await supabaseService.resetPassword('user@example.com');
    expect(result.message).toContain('Password reset');
  });

  it('should handle social OAuth sign in for Google and GitHub', async () => {
    const googleRes = await supabaseService.signInWithOAuth('google');
    expect(googleRes.user).toBeDefined();
    expect(googleRes.user?.email).toContain('google');

    const githubRes = await supabaseService.signInWithOAuth('github');
    expect(githubRes.user).toBeDefined();
    expect(githubRes.user?.email).toContain('github');
  });
});
