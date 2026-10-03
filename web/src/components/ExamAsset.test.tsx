import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ExamAsset } from './ExamAsset';

describe('ExamAsset Component', () => {
  afterEach(() => {
    cleanup();
  });
  it('should return null when url is null, undefined, or empty', () => {
    const { container: c1 } = render(<ExamAsset url={null} alt="Test" />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<ExamAsset url={undefined} alt="Test" />);
    expect(c2.firstChild).toBeNull();

    const { container: c3 } = render(<ExamAsset url="" alt="Test" />);
    expect(c3.firstChild).toBeNull();
  });

  it('should render diagram variant with zoom button when dimensions qualify', () => {
    const onZoom = vi.fn();
    const { getByAltText, getByRole } = render(
      <ExamAsset
        url="/exam-assets/gate/2025/cs-1/q5_diag.png"
        alt="Question 5 Figure"
        variant="diagram"
        onZoom={onZoom}
      />
    );

    const img = getByAltText('Question 5 Figure');
    expect(img).toBeDefined();

    // Simulate browser image load with valid schematic dimensions (600x400)
    Object.defineProperty(img, 'naturalWidth', { value: 600, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 400, configurable: true });
    fireEvent.load(img);

    const zoomButton = getByRole('button');
    expect(zoomButton.textContent).toContain('Click to enlarge figure');

    fireEvent.click(zoomButton);
    expect(onZoom).toHaveBeenCalledTimes(1);
  });

  it('should omit zoom button when onZoom callback is undefined', () => {
    const { container, getByAltText } = render(
      <ExamAsset
        url="/exam-assets/gate/2025/cs-1/q5_diag.png"
        alt="Question 5 Figure"
        variant="diagram"
      />
    );

    const img = getByAltText('Question 5 Figure');
    expect(img).toBeDefined();

    Object.defineProperty(img, 'naturalWidth', { value: 600, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 400, configurable: true });
    fireEvent.load(img);

    // Zoom button must NOT render without an onZoom handler
    const zoomButton = container.querySelector('button');
    expect(zoomButton).toBeNull();
    expect(img.classList.contains('cursor-default')).toBe(true);
  });

  it('should omit zoom button when allowZoom is explicitly false', () => {
    const onZoom = vi.fn();
    const { container, getByAltText } = render(
      <ExamAsset
        url="/exam-assets/gate/2025/cs-1/q5_diag.png"
        alt="Question 5 Figure"
        variant="diagram"
        allowZoom={false}
        onZoom={onZoom}
      />
    );

    const img = getByAltText('Question 5 Figure');
    expect(img).toBeDefined();

    Object.defineProperty(img, 'naturalWidth', { value: 600, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 400, configurable: true });
    fireEvent.load(img);

    const zoomButton = container.querySelector('button');
    expect(zoomButton).toBeNull();
    expect(img.classList.contains('cursor-default')).toBe(true);
  });

  it('should suppress zoom button on plain-text ribbons and small strips (aspect ratio >= 8 or height < 60px)', () => {
    const onZoom = vi.fn();
    const { container, getByAltText } = render(
      <ExamAsset
        url="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q28_diag.png"
        alt="Text prompt strip"
        variant="diagram"
        onZoom={onZoom}
      />
    );

    const img = getByAltText('Text prompt strip');
    expect(img).toBeDefined();

    // 906x48 strip has aspect ratio 18.88 >= 8 -> must suppress false zoom prompt
    Object.defineProperty(img, 'naturalWidth', { value: 906, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 48, configurable: true });
    fireEvent.load(img);

    const zoomButton = container.querySelector('button');
    expect(zoomButton).toBeNull();
    expect(img.classList.contains('cursor-default')).toBe(true);
  });

  describe('Adversarial Challenge: Zoom Gating Thresholds', () => {
    it('adversarially suppresses zoom on tiny formula (30x20 px)', () => {
      const onZoom = vi.fn();
      const { container, getByAltText } = render(
        <ExamAsset
          url="/exam-assets/gate/2025/cs-1/q12_formula.png"
          alt="Tiny formula"
          variant="diagram"
          onZoom={onZoom}
        />
      );
      const img = getByAltText('Tiny formula');
      Object.defineProperty(img, 'naturalWidth', { value: 30, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 20, configurable: true });
      fireEvent.load(img);

      expect(container.querySelector('button')).toBeNull();
      expect(img.classList.contains('cursor-default')).toBe(true);
    });

    it('adversarially suppresses zoom on square icon (32x32 px)', () => {
      const onZoom = vi.fn();
      const { container, getByAltText } = render(
        <ExamAsset
          url="/exam-assets/icons/bullet.png"
          alt="Square icon"
          variant="diagram"
          onZoom={onZoom}
        />
      );
      const img = getByAltText('Square icon');
      Object.defineProperty(img, 'naturalWidth', { value: 32, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 32, configurable: true });
      fireEvent.load(img);

      expect(container.querySelector('button')).toBeNull();
      expect(img.classList.contains('cursor-default')).toBe(true);
    });

    it('adversarially enables zoom on normal diagram (734x241 px, aspect ratio 3.05)', () => {
      const onZoom = vi.fn();
      const { container, getByAltText } = render(
        <ExamAsset
          url="/exam-assets/gate/2025/ae/q6_diag.png"
          alt="Normal diagram"
          variant="diagram"
          onZoom={onZoom}
        />
      );
      const img = getByAltText('Normal diagram');
      Object.defineProperty(img, 'naturalWidth', { value: 734, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 241, configurable: true });
      fireEvent.load(img);

      const zoomButton = container.querySelector('button');
      expect(zoomButton).not.toBeNull();
      expect(zoomButton?.textContent).toContain('Click to enlarge figure');
      expect(img.classList.contains('cursor-zoom-in')).toBe(true);

      fireEvent.click(zoomButton!);
      expect(onZoom).toHaveBeenCalledTimes(1);
    });

    it('adversarially enables zoom on large square diagram (300x300 px)', () => {
      const onZoom = vi.fn();
      const { container, getByAltText } = render(
        <ExamAsset
          url="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q30_opt_a.png"
          alt="Square cube net"
          variant="diagram"
          onZoom={onZoom}
        />
      );
      const img = getByAltText('Square cube net');
      Object.defineProperty(img, 'naturalWidth', { value: 300, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 300, configurable: true });
      fireEvent.load(img);

      const zoomButton = container.querySelector('button');
      expect(zoomButton).not.toBeNull();
      expect(zoomButton?.textContent).toContain('Click to enlarge figure');
    });

    it('adversarially suppresses zoom on extreme horizontal ribbon (1200x35 px, height < 40px)', () => {
      const onZoom = vi.fn();
      const { container, getByAltText } = render(
        <ExamAsset
          url="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q28_diag.png"
          alt="Horizontal ribbon"
          variant="diagram"
          onZoom={onZoom}
        />
      );
      const img = getByAltText('Horizontal ribbon');
      Object.defineProperty(img, 'naturalWidth', { value: 1200, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 35, configurable: true });
      fireEvent.load(img);

      expect(container.querySelector('button')).toBeNull();
    });
  });

  it('should render option variant with compact container and no zoom button', () => {
    const { container, getByAltText } = render(
      <ExamAsset
        url="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q27_opt_a.png"
        alt="Option A figure"
        variant="option"
      />
    );

    const img = getByAltText('Option A figure');
    expect(img).toBeDefined();

    const zoomButton = container.querySelector('button');
    expect(zoomButton).toBeNull();
  });

  it('should attempt local static fallback when remote CDN URL encounters an error before failing', () => {
    const cdnUrl =
      'https://nvvscqxsrechenyqcwli.supabase.co/storage/v1/object/public/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q26_diag.png';

    const { getByAltText, queryByText } = render(
      <ExamAsset url={cdnUrl} alt="Remote figure" variant="diagram" />
    );

    const img = getByAltText('Remote figure') as HTMLImageElement;
    expect(img.src).toContain('https://nvvscqxsrechenyqcwli.supabase.co');

    // First error: remote CDN failed
    fireEvent.error(img);

    // Component should NOT yet be in error state; it should fall back to local /exam-assets/...
    expect(queryByText(/Figure failed to load/i)).toBeNull();
    expect(img.src).toContain('/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q26_diag.png');

    // Second error: local fallback also failed
    fireEvent.error(img);

    // Now error UI is displayed
    expect(queryByText(/Figure failed to load: Remote figure/i)).not.toBeNull();
  });

  it('should display graceful error retry UI when image fails to load and allow retry', () => {
    const { getByAltText, getByText } = render(
      <ExamAsset
        url="/exam-assets/corrupted-or-404-image.png"
        alt="Broken figure"
        variant="diagram"
      />
    );

    const img = getByAltText('Broken figure');
    expect(img).toBeDefined();

    // Trigger image error
    fireEvent.error(img);

    // Component should re-render with error indicator and retry button
    expect(getByText(/Figure failed to load: Broken figure/i)).toBeDefined();
    const retryBtn = getByText(/Retry Loading/i);
    expect(retryBtn).toBeDefined();

    // Clicking retry resets error state
    fireEvent.click(retryBtn);
    expect(getByAltText('Broken figure')).toBeDefined();
  });
});
