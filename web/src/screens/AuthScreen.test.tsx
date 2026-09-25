import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { AuthScreen } from './AuthScreen';
import { supabaseService } from '../services/supabase';

describe('AuthScreen Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('should render login tab by default with email and password fields, submit button, and social logins', () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthScreen onAuthSuccess={handleAuthSuccess} />);

    expect(screen.getByText('Welcome Back, Scholar')).toBeDefined();
    expect(screen.getByPlaceholderText('name@example.com')).toBeDefined();
    expect(screen.getByPlaceholderText('••••••••')).toBeDefined();

    // Verify "Sign In" button (tab switcher + form submit button)
    const signInButtons = screen.getAllByRole('button', { name: /^Sign In$/i });
    expect(signInButtons.length).toBeGreaterThanOrEqual(1);

    // Verify social OAuth buttons
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Continue with GitHub/i })).toBeDefined();

    // Verify developer/demo clutter is NOT in the public production UI
    expect(screen.queryByText(/Instant Demo Profiles/i)).toBeNull();
    expect(screen.queryByText(/Supabase Cloud:/i)).toBeNull();
  });

  it('should switch between Sign In and Create Account tabs and show Create Account submit button', () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthScreen onAuthSuccess={handleAuthSuccess} />);

    // Click Create Account tab switcher
    const createTabs = screen.getAllByRole('button', { name: /Create Account/i });
    fireEvent.click(createTabs[0]);

    // Verify registration fields appear
    expect(screen.getByText('Create Your Account')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. Shivaram Patel')).toBeDefined();
    expect(screen.getByPlaceholderText('Re-enter your password')).toBeDefined();
    expect(screen.getByText('Select Your Primary Role:')).toBeDefined();

    // Verify submit button now says "Create Account"
    const submitButtons = screen.getAllByRole('button', { name: /Create Account/i });
    expect(submitButtons.length).toBeGreaterThanOrEqual(2); // tab + submit button

    // Click back to Sign In
    const signInTab = screen.getByRole('button', { name: 'Sign In' });
    fireEvent.click(signInTab);
    expect(screen.getByText('Welcome Back, Scholar')).toBeDefined();
  });

  it('should switch mode via bottom prompt links', () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthScreen onAuthSuccess={handleAuthSuccess} />);

    // Click "Create an account" prompt link at bottom of card
    const createLink = screen.getByRole('button', { name: /Create an account/i });
    fireEvent.click(createLink);
    expect(screen.getByText('Create Your Account')).toBeDefined();

    // Click "Sign in to your account" prompt link
    const signInLink = screen.getByRole('button', { name: /Sign in to your account/i });
    fireEvent.click(signInLink);
    expect(screen.getByText('Welcome Back, Scholar')).toBeDefined();
  });

  it('should trigger OAuth social login when clicking Google or GitHub buttons', async () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthScreen onAuthSuccess={handleAuthSuccess} />);

    // Click Continue with Google
    const googleBtn = screen.getByRole('button', { name: /Continue with Google/i });
    fireEvent.click(googleBtn);

    // Should complete and trigger onAuthSuccess
    await waitFor(() => {
      expect(handleAuthSuccess).toHaveBeenCalled();
    });
  });

  it('should show password strength and password match indicators in Create Account mode', () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthScreen onAuthSuccess={handleAuthSuccess} />);

    // Go to Create Account
    const createTabs = screen.getAllByRole('button', { name: /Create Account/i });
    fireEvent.click(createTabs[0]);

    const passwordInput = screen.getByPlaceholderText('At least 6 characters');
    const confirmInput = screen.getByPlaceholderText('Re-enter your password');

    // Type password
    fireEvent.change(passwordInput, { target: { value: 'Secret99!' } });
    expect(screen.getByText('Strong')).toBeDefined();

    // Type non-matching confirm password
    fireEvent.change(confirmInput, { target: { value: 'Different' } });
    expect(screen.getByText('Passwords do not match')).toBeDefined();

    // Type matching confirm password
    fireEvent.change(confirmInput, { target: { value: 'Secret99!' } });
    expect(screen.getByText('Passwords match')).toBeDefined();
  });

  it('should open and close Forgot Password modal', () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthScreen onAuthSuccess={handleAuthSuccess} />);

    const forgotBtn = screen.getByText('Forgot Password?');
    fireEvent.click(forgotBtn);

    expect(screen.getByText('Reset Your Password')).toBeDefined();

    // Close modal
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByText('Reset Your Password')).toBeNull();
  });

  it('should transition to OTP verification mode when signup requires email confirmation and verify code', async () => {
    const handleAuthSuccess = vi.fn();
    const signUpSpy = vi.spyOn(supabaseService, 'signUp').mockResolvedValueOnce({
      user: { uid: 'u-1', fullName: 'Test Student', email: 'test@example.com', phoneNumber: '9876543210', role: 'LEARNER', createdAt: Date.now() },
      confirmationRequired: true,
    });
    const verifySpy = vi.spyOn(supabaseService, 'verifyEmailOtp').mockResolvedValueOnce({
      user: { uid: 'u-1', fullName: 'Test Student', email: 'test@example.com', phoneNumber: '9876543210', role: 'LEARNER', createdAt: Date.now() },
      message: 'Verified',
    });
    // Mock checkPhoneExists — called inline during submit
    vi.spyOn(supabaseService, 'checkPhoneExists').mockResolvedValue({ exists: false });

    render(<AuthScreen onAuthSuccess={handleAuthSuccess} />);

    // Switch to Create Account
    const createTabs = screen.getAllByRole('button', { name: /Create Account/i });
    fireEvent.click(createTabs[0]);

    // Fill all required fields including mobile number (wrapped in act to flush React state)
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('e.g. Shivaram Patel'), { target: { value: 'Test Student' } });
      fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), { target: { value: 'password123' } });
      fireEvent.change(screen.getByPlaceholderText('Re-enter your password'), { target: { value: 'password123' } });
      fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '9876543210' } });
    });

    // Submit by firing the form's submit event (bypasses jsdom native validation)
    const form = screen.getByPlaceholderText('name@example.com').closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    // OTP screen should appear after confirmation is required
    await waitFor(() => {
      expect(screen.getByText('Verify Your Email')).toBeDefined();
    }, { timeout: 3000 });

    // Enter 6-digit verification code
    const otpInput = screen.getByPlaceholderText('• • • • • •');
    fireEvent.change(otpInput, { target: { value: '123456' } });

    // Click verify
    const verifyBtn = screen.getByRole('button', { name: /Verify & Complete Signup/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledWith('test@example.com', '123456', 'signup');
    });

    signUpSpy.mockRestore();
    verifySpy.mockRestore();
  });
});
