import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LegalModal } from './LegalModal';

describe('LegalModal Component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should not render anything when isOpen is false', () => {
    const handleClose = vi.fn();
    const { container } = render(<LegalModal isOpen={false} onClose={handleClose} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render the Privacy Policy tab by default', () => {
    const handleClose = vi.fn();
    render(<LegalModal isOpen={true} initialTab="privacy" onClose={handleClose} />);

    expect(screen.getByText('Privacy Policy & Data Protection')).toBeDefined();
    expect(screen.getByText(/Zero-Leak AI Commitment/i)).toBeDefined();
    expect(screen.getByText(/Information We Collect/i)).toBeDefined();
  });

  it('should allow switching between tabs (Terms, Status, Security)', () => {
    const handleClose = vi.fn();
    render(<LegalModal isOpen={true} initialTab="privacy" onClose={handleClose} />);

    // Click Terms of Service
    const termsTabBtn = screen.getByRole('button', { name: /Terms of Service/i });
    fireEvent.click(termsTabBtn);
    expect(screen.getByText(/Permitted Educational Use/i)).toBeDefined();

    // Click System Status
    const statusTabBtn = screen.getByRole('button', { name: /System Status/i });
    fireEvent.click(statusTabBtn);
    expect(screen.getByText(/Live Infrastructure Status/i)).toBeDefined();
    expect(screen.getByText(/All Systems Operational/i)).toBeDefined();
    expect(screen.getByText(/MOCK.AI Web Application/i)).toBeDefined();

    // Click Security Compliance
    const securityTabBtn = screen.getByRole('button', { name: /Security Compliance/i });
    fireEvent.click(securityTabBtn);
    expect(screen.getByText(/Security & Regulatory Compliance/i)).toBeDefined();
    expect(screen.getByText(/256-Bit SSL\/TLS In Transit/i)).toBeDefined();
    expect(screen.getByText(/PostgreSQL Row-Level Security/i)).toBeDefined();
  });

  it('should call onClose when clicking the close button', () => {
    const handleClose = vi.fn();
    render(<LegalModal isOpen={true} onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: /Close modal/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when pressing the Escape key', () => {
    const handleClose = vi.fn();
    render(<LegalModal isOpen={true} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
