import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AuthScreen } from './AuthScreen';

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
});
