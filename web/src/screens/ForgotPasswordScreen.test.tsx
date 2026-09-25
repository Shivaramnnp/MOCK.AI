import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { supabaseService } from '../services/supabase';

describe('ForgotPasswordScreen Component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should render the recovery email request screen by default', () => {
    const handleBack = vi.fn();
    render(<ForgotPasswordScreen onBackToLogin={handleBack} />);

    expect(screen.getByText('Reset Your Password')).toBeDefined();
    expect(screen.getByPlaceholderText('name@example.com')).toBeDefined();
    expect(screen.getByRole('button', { name: /Send Recovery Email/i })).toBeDefined();
  });

  it('should call supabaseService.resetPassword and show confirmation view upon form submission', async () => {
    const resetSpy = vi.spyOn(supabaseService, 'resetPassword').mockResolvedValueOnce({
      success: true,
      message: 'Reset instructions sent',
    });

    const handleBack = vi.fn();
    render(<ForgotPasswordScreen onBackToLogin={handleBack} initialEmail="test@example.com" />);

    const submitBtn = screen.getByRole('button', { name: /Send Recovery Email/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith('test@example.com');
      expect(screen.getByText('Check Your Inbox')).toBeDefined();
      expect(screen.getByText('test@example.com')).toBeDefined();
    });
  });

  it('should call onBackToLogin when clicking Back or Cancel buttons', () => {
    const handleBack = vi.fn();
    render(<ForgotPasswordScreen onBackToLogin={handleBack} />);

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('should render update password mode when forcedMode="update"', () => {
    const handleBack = vi.fn();
    render(<ForgotPasswordScreen onBackToLogin={handleBack} forcedMode="update" />);

    expect(screen.getByText('Set New Password')).toBeDefined();
    expect(screen.getByPlaceholderText('At least 6 characters')).toBeDefined();
    expect(screen.getByPlaceholderText('Re-enter your new password')).toBeDefined();
    expect(screen.getByRole('button', { name: /Save & Sign In/i })).toBeDefined();
  });

  it('should validate matching passwords and update password successfully in update mode', async () => {
    const updateSpy = vi.spyOn(supabaseService, 'updatePassword').mockResolvedValueOnce({
      success: true,
      message: 'Password updated',
    });

    const handleBack = vi.fn();
    const handleSuccess = vi.fn();
    render(
      <ForgotPasswordScreen
        onBackToLogin={handleBack}
        onPasswordResetSuccess={handleSuccess}
        forcedMode="update"
      />
    );

    const passwordInput = screen.getByPlaceholderText('At least 6 characters');
    const confirmInput = screen.getByPlaceholderText('Re-enter your new password');

    // Type matching password
    fireEvent.change(passwordInput, { target: { value: 'Secret123!' } });
    fireEvent.change(confirmInput, { target: { value: 'Secret123!' } });

    expect(screen.getByText('Passwords match')).toBeDefined();

    const saveBtn = screen.getByRole('button', { name: /Save & Sign In/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('Secret123!');
      expect(screen.getByText('Password Successfully Updated!')).toBeDefined();
    });
  });
});
