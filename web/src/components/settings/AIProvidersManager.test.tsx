/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AIProvidersManager } from './AIProvidersManager';
import { aiProviderService } from '../../services/ai/aiProviderService';

describe('AIProvidersManager Component Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders section title, subtitle, and sub-navigation tabs correctly', () => {
    render(<AIProvidersManager />);

    expect(screen.getByRole('heading', { level: 2, name: 'AI Providers' })).toBeTruthy();
    expect(
      screen.getByText('Connect your own AI providers and choose which model powers your mock-test generation.')
    ).toBeTruthy();

    expect(screen.getByRole('button', { name: /AI Providers/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Default Model/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generation Preferences/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Usage & Billing/i })).toBeTruthy();
  });

  it('renders browser-only BYOK privacy guarantee banner', () => {
    render(<AIProvidersManager />);

    expect(screen.getByText('Browser-Only BYOK (Bring Your Own Key)')).toBeTruthy();
    expect(
      screen.getByText(/Your API key stays on this device and is used from this browser/i)
    ).toBeTruthy();
  });

  it('renders connected providers with masked key and active model', () => {
    aiProviderService.saveConnection({
      id: 'conn_gemini_test_01',
      providerId: 'google-gemini',
      name: 'Google Gemini',
      apiKey: 'AIzaSy_SECRET_KEY_1234',
      selectedModel: 'gemini-2.5-flash',
      isEnabled: true,
      isDefault: true,
      status: 'CONNECTED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    render(<AIProvidersManager />);

    expect(screen.getByText('Google Gemini')).toBeTruthy();
    expect(screen.getByText('gemini-2.5-flash')).toBeTruthy();
    expect(screen.getByText(/••••••••••••1234/)).toBeTruthy();
    expect(screen.getByText('⭐ Default Generator')).toBeTruthy();
  });

  it('opens Add Provider modal on clicking "Add Provider"', async () => {
    render(<AIProvidersManager />);

    const addBtn = screen.getAllByRole('button', { name: /Add Provider/i })[0];
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('Connect AI Provider')).toBeTruthy();
      expect(screen.getByText(/1\. Select Provider/i)).toBeTruthy();
      expect(screen.getByText(/2\. API Key \*/i)).toBeTruthy();
      expect(screen.getByText(/3\. Model/i)).toBeTruthy();
    });
  });

  it('opens Add Custom Provider modal on clicking "Custom Provider"', async () => {
    render(<AIProvidersManager />);

    const customBtn = screen.getByRole('button', { name: /Custom Provider/i });
    fireEvent.click(customBtn);

    await waitFor(() => {
      expect(screen.getByText('Add Custom AI Provider')).toBeTruthy();
      expect(screen.getByText(/Custom providers must implement the OpenAI-compatible chat format/i)).toBeTruthy();
      expect(screen.getByPlaceholderText(/e\.g\. http:\/\/localhost:11434\/v1/i)).toBeTruthy();
    });
  });

  it('switches to Generation Preferences tab and saves preferences', async () => {
    render(<AIProvidersManager />);

    const prefsTab = screen.getByRole('button', { name: /Generation Preferences/i });
    fireEvent.click(prefsTab);

    expect(screen.getByText(/Default Questions Count per Test:/i)).toBeTruthy();
    expect(screen.getByText(/Default Difficulty Level:/i)).toBeTruthy();
    expect(screen.getByText(/Model Temperature \/ Strictness:/i)).toBeTruthy();

    const saveBtn = screen.getByRole('button', { name: /Save Preferences/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Preferences saved successfully!')).toBeTruthy();
    });
  });

  it('switches to Usage & Billing tab and displays transparent zero-markup explanation', () => {
    render(<AIProvidersManager />);

    const usageTab = screen.getByRole('button', { name: /Usage & Billing/i });
    fireEvent.click(usageTab);

    expect(screen.getByText('Transparent BYOK Cost Architecture')).toBeTruthy();
    expect(screen.getByText('₹0.00 (Zero Markup)')).toBeTruthy();
  });
});
